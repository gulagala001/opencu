import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createBrowserHost } from '../src/dsh/browser-host.mjs';

async function fixture(t) {
  const host = createBrowserHost(), rendererId = randomUUID();
  const handle = host.handle; let connectionId;
  host.handle = async (method, args, signal) => {
    const result = await handle(method, {connectionId, ...args}, signal);
    if (method === 'browser/connect') connectionId = result.connectionId;
    return result;
  };
  t.after(() => host.close());
  const target = { id: 'dsh:fixture-tab', identity: { rendererId, guestId: 'fixture-guest' },
    backend: 'browser', provider: 'dsh', kind: 'tab', url: 'https://example.test/' };
  await host.handle('browser/connect', { rendererId });
  await host.handle('browser/publish', { rendererId, targets: [target] });
  return { host, rendererId, target };
}
const settle = promise => promise.then(value => ({ value }), error => ({ error }));

test('view-change recovery sends a release only for the original target',async t=>{
  const {host,rendererId,target}=await fixture(t);
  const work=host.backend.releaseTarget(target);
  const [command]=(await host.handle('browser/poll',{rendererId})).commands;
  assert.equal(command.method,'release');assert.deepEqual(command.params.target,target);
  assert.equal(command.params.dismissDialogs,false);
  await host.handle('browser/result',{rendererId,id:command.id,result:{released:true}});
  assert.deepEqual(await work,{released:true});
});

test('late messages and release receipts cannot replace the current connection', async t => {
  const {host,rendererId,target} = await fixture(t);
  const old = await host.handle('browser/connect',{rendererId});
  const current = await host.handle('browser/connect',{rendererId});
  await assert.rejects(host.handle('browser/publish',{rendererId,connectionId:old.connectionId,targets:[target]}),{code:'BROWSER_HOST_DISCONNECTED'});
  await assert.rejects(host.handle('browser/sessions',{rendererId,connectionId:old.connectionId,sessionIds:['retired']}),{code:'BROWSER_HOST_DISCONNECTED'});
  assert.deepEqual(await host.handle('browser/disconnect',{rendererId,connectionId:old.connectionId,released:true}),{ok:true,ignored:true});
  await host.handle('browser/publish',{rendererId,connectionId:current.connectionId,targets:[target]});
  assert.equal((await host.backend.listTargets()).length,1);
});

test('a replaced long poll cannot deliver retired commands as a live connection', async t => {
  const { host, rendererId, target } = await fixture(t);
  const oldPoll = host.handle('browser/poll', { rendererId });
  const oldAction = settle(host.backend.act(target, { action: 'keyDown', key: 'Shift' }));
  // The poll is awake but has not resumed when the same renderer reconnects.
  await host.handle('browser/connect', { rendererId });
  const response = await oldPoll;
  assert.equal(response.connected, false);
  assert.deepEqual(response.commands, [], 'retired input commands must not reach the renderer');
  assert.equal((await oldAction).error?.code, 'BROWSER_HOST_DISCONNECTED');
  assert.equal(host.listBrowsers().length, 1, 'the replacement remains connected');
});

test('cancelling an old action after reconnect cannot time out and disconnect the replacement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { host, rendererId, target } = await fixture(t), aborter = new AbortController();
  const oldAction = settle(host.backend.act(target, { action: 'keyDown', key: 'Shift', signal: aborter.signal }));
  const [oldCommand] = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(oldCommand.method, 'act');
  const reconnect = host.handle('browser/connect', { rendererId });
  aborter.abort(Error('cancel during reconnect'));
  await reconnect;
  t.mock.timers.tick(30000);
  assert.equal((await oldAction).error?.code, 'RELEASE_FAILED', 'missing release acknowledgement remains an error');
  assert.equal(host.listBrowsers().length, 1, 'no request is queued on the retired client');

  await host.handle('browser/publish', { rendererId, targets: [target] });
  assert.equal((await settle(host.backend.act(target, {action: 'type', text: 'stale binding'}))).error?.code, 'RECOVERY_REQUIRED');
  const selection = settle(host.backend.select(target));
  const [release] = (await host.handle('browser/poll', {rendererId})).commands;
  assert.equal(release.method, 'release');
  await host.handle('browser/result', {rendererId, id: release.id, result: {released: true}});
  const [selected] = (await host.handle('browser/poll', {rendererId})).commands;
  assert.equal(selected.method, 'select');
  await host.handle('browser/result', {rendererId, id: selected.id, result: target});
  assert.equal((await selection).value.id, target.id);
  const currentAction = settle(host.backend.act(target, { action: 'type', text: 'new operation' }));
  const commands = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(commands.length, 1);
  assert.equal(commands[0].params.action.text, 'new operation');
  assert.deepEqual(await host.handle('browser/result', { rendererId, id: oldCommand.id, result: { released: true } }), { ok: true, ignored: true });
  await host.handle('browser/result', { rendererId, id: commands[0].id, result: { accepted: true } });
  assert.deepEqual((await currentAction).value, { accepted: true });
});

test('cancelling after a disconnect rejects the action rather than escaping the abort listener', () => {
  // An uncaught AbortSignal listener error is process-level, so verify it in a
  // child process without intercepting or suppressing uncaught exceptions.
  const module = new URL('../src/dsh/browser-host.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { randomUUID } from 'node:crypto';
    import { createBrowserHost } from ${JSON.stringify(module)};
    const host = createBrowserHost(), rendererId = randomUUID(), signal = new AbortController();
    const {connectionId} = await host.handle('browser/connect', { rendererId });
    const target = { id: 'dsh:tab', identity: { rendererId, guestId: 'guest' } };
    const action = host.backend.act(target, { action: 'keyDown', key: 'Shift', signal: signal.signal }).catch(error => error);
    const disconnect = host.handle('browser/disconnect', { rendererId, connectionId });
    signal.abort(Error('cancel'));
    await disconnect;
    const error = await action;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(error.code, 'RELEASE_FAILED');
    host.close();
  `], { encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('a connected cancellation still waits for the actual targeted release acknowledgement', async t => {
  const { host, rendererId, target } = await fixture(t), aborter = new AbortController();
  const reason = Error('explicit cancel');
  let finished = false;
  const action = settle(host.backend.act(target, { action: 'keyDown', key: 'Shift', signal: aborter.signal })).then(result => { finished = true; return result; });
  const [command] = (await host.handle('browser/poll', { rendererId })).commands;
  aborter.abort(reason);
  const [release] = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(release.method, 'release');
  assert.deepEqual(release.params.target, target);
  await host.handle('browser/result', { rendererId, id: command.id, result: { accepted: true } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  await host.handle('browser/result', { rendererId, id: release.id, result: { released: true } });
  assert.equal((await action).error, reason);
  assert.equal(host.listBrowsers().length, 1);
});

test('an acknowledged cancellation completes even when the original action reply is lost', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { host, rendererId, target } = await fixture(t), aborter = new AbortController();
  let settled = false;
  const reason = Error('explicit stop');
  const work = settle(host.backend.act(target, { action: 'keyDown', key: 'Shift', signal: aborter.signal }))
    .then(value => { settled = true; return value; });
  const [action] = (await host.handle('browser/poll', { rendererId })).commands;
  aborter.abort(reason);
  const [release] = (await host.handle('browser/poll', { rendererId })).commands;
  await host.handle('browser/result', { rendererId, id: release.id, result: { released: true } });
  await new Promise(resolve => setImmediate(resolve));
  const promptlySettled = settled;
  t.mock.timers.tick(30000);
  const outcome = await work;
  assert.equal(promptlySettled, true, 'the release barrier makes an absent action reply irrelevant');
  assert.equal(outcome.error, reason);
  assert.equal(host.listBrowsers().length, 1, 'a cancelled command must not retain a disconnect timer');
  assert.deepEqual(await host.handle('browser/result', { rendererId, id: action.id, result: { accepted: true } }), { ok: true, ignored: true });
});

test('cancelling a read-only command does not release another operation\'s input', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { host, rendererId, target } = await fixture(t), aborter = new AbortController();
  let settled = false;
  const work = settle(host.backend.act(target, { action: 'getDOM', signal: aborter.signal })).then(value => { settled = true; return value; });
  const [action] = (await host.handle('browser/poll', { rendererId })).commands;
  aborter.abort(Error('cancel observation'));
  await new Promise(resolve => setImmediate(resolve));
  const promptlySettled = settled;
  t.mock.timers.tick(30000); await work;
  assert.equal(promptlySettled, true);
  assert.equal(host.listBrowsers().length, 1);
  const next = host.backend.releaseTarget(target);
  const commands = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(commands.length, 1, 'only the explicit release request is queued');
  await host.handle('browser/result', { rendererId, id: commands[0].id, result: { released: true } });
  await next;
  assert.deepEqual(await host.handle('browser/result', { rendererId, id: action.id, result: {} }), { ok: true, ignored: true });
});

test('queued creation cancellation removes the undispatched operation', async t => {
  const { host, rendererId } = await fixture(t), aborter = new AbortController();
  const work = settle(host.backend.newTab('dsh:' + rendererId, 'about:blank', { sessionId: 'session', signal: aborter.signal }));
  aborter.abort(Error('cancel queued creation'));
  assert.ok((await work).error);
  const commands = (await host.handle('browser/poll', { rendererId })).commands;
  assert.equal(commands.some(command => ['openTab', 'cancelCreation'].includes(command.method)), false);
});

test('cancelled observations forget late replies without disconnecting the input channel', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { host, rendererId, target } = await fixture(t), aborter = new AbortController();
  const observation = settle(host.backend.observe(target, { signal: aborter.signal }));
  const [command] = (await host.handle('browser/poll', { rendererId })).commands;
  aborter.abort(Error('cancel observation'));
  assert.ok((await observation).error);
  t.mock.timers.tick(30000);
  assert.equal(host.listBrowsers().length, 1);
  assert.deepEqual(await host.handle('browser/result', { rendererId, id: command.id, result: { screenshot: 'late' } }), { ok: true, ignored: true });
});

test('native presentation ownership cannot survive removal of its session or move to an unrelated window', async t => {
  const host = createBrowserHost(); t.after(() => host.close());
  const first = await host.handle('browser/connect', { presentation: true, sessionIds: ['session'] });
  const second = await host.handle('browser/connect', { presentation: true, sessionIds: ['other'] });
  assert.equal(host.presentationOwner({}, 'session'), first.rendererId);
  await host.handle('browser/sessions', { ...first, sessionIds: [] });
  assert.throws(() => host.presentationOwner({}, 'session'), { code: 'PRESENTATION_HOST_UNAVAILABLE' });
  await host.handle('browser/disconnect', { ...first, released: true });
  assert.throws(() => host.presentationOwner({}, 'session'), { code: 'PRESENTATION_HOST_UNAVAILABLE' });
  assert.equal(host.presentationOwner({}, 'other'), second.rendererId);
});

test('a mismatched retirement receipt cannot settle another occurrence\'s pending observation', async t => {
  const { host, rendererId, target } = await fixture(t);
  const observation = host.backend.observe(target);
  const [command] = (await host.handle('browser/poll', { rendererId })).commands;
  const wrong = { ...target, identity: { ...target.identity, guestId: 'other-occurrence' } };
  await assert.rejects(host.handle('browser/publish', { rendererId, targets: [], retiredTargets: [wrong] }), { code: 'TARGET_IDENTITY_CHANGED' });
  assert.equal((await host.backend.listTargets())[0].id, target.id);
  await host.handle('browser/result', { rendererId, id: command.id, result: { observed: true } });
  assert.deepEqual(await observation, { observed: true });
});
