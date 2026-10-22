import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';
import {createComputerSession} from '../src/dsh/computer.mjs';
import {createComputerRepl} from '../src/dsh/computer-repl.mjs';

// Real worker, runtime and controller; only the browser's input boundary is synthetic.
async function fixture(t, createSession = createComputerSession) {
  const parent = resolve('.local'); await mkdir(parent, {recursive: true});
  const dataDir = await mkdtemp(join(parent, 'pending-calls-'));
  const target = {id: 'tab:pending', backend: 'browser', kind: 'tab',
    browserId: 'browser:synthetic', identity: {occurrence: 'original'}};
  const entered = Promise.withResolvers(), gate = Promise.withResolvers(), events = [], hooks = {};
  const backend = {
    listTargets: async () => [target], select: async () => target,
    verify: async () => ({valid: true, target}),
    observe: async () => ({ax: {nodes: []}}),
    act: async (_target, args) => {
      if (args.text === 'reject') throw Object.assign(new Error('Synthetic stale observation'),
        {code: 'STALE_OBSERVATION', details: {inputDispatched: false}});
      events.push(['dispatch', args.text]); entered.resolve();
      let abort;
      try {
        await Promise.race([gate.promise, new Promise((_, reject) => {
          abort = () => reject(Object.assign(new Error('Synthetic action cancelled'), {code: 'CONTROL_STOPPED'}));
          args.signal.addEventListener('abort', abort, {once: true});
        })]);
      } finally { args.signal.removeEventListener('abort', abort); }
      events.push(['complete', args.text]); return hooks.result ?? {inputDispatched: true, effectVerified: false};
    },
    release: async () => {
      events.push(['release']);
      return hooks.releaseFails ? {released: false, failures: [{message: 'Synthetic unacknowledged release'}]} : {released: true};
    }, close: async () => {},
  };
  const runtime = createPluginRuntime({dataDir, browser: backend, nativeEnabled: false, extensionEnabled: false});
  const computer = createSession((endpoint, args) => runtime.request(endpoint, args,
    {sessionKey: 'synthetic-pending', signal: endpoint === 'stop' ? undefined : computer.signal}));
  const run = (code, timeoutMs = 3000, signal) => computer.run({code, timeoutMs}, signal);
  t.after(async () => { hooks.releaseFails = false; gate.resolve(); await computer.close(); await runtime.close(); await rm(dataDir, {recursive: true, force: true}); });
  await run('var tab = await cua.getTab("tab:pending");');
  return {run, runtime, computer, entered, gate, events, hooks};
}

for (const [name, createSession] of [['worker', createComputerSession], ['REPL', createComputerRepl]]) {
  test(`${name}: acknowledged manual input clears only the released key and button`, async t => {
    const f = await fixture(t, createSession); f.gate.resolve();
    await f.run('await tab.keyDown("Shift"); await tab.act({action: "mouseDown"}); await tab.keyUp("Shift");');
    await f.computer.close();
    assert.equal(f.events.filter(([kind]) => kind === 'release').length, 1,
      'the unacknowledged mouse button still belongs to this idle session');
  });

  test(`${name}: failed explicit stop is retried when the idle session closes`, async t => {
    const f = await fixture(t, createSession); f.hooks.releaseFails = true;
    await assert.rejects(f.run('await cua.stop();'), {code: 'RELEASE_FAILED'});
    f.hooks.releaseFails = false; await f.computer.close();
    assert.equal((await f.runtime.request('state')).state.releasePending, false);
    assert.equal(f.events.filter(([kind]) => kind === 'release').length, 2);
  });

  test(`${name}: idle close retries a transient action's failed release`, async t => {
    const f = await fixture(t, createSession); f.hooks.releaseFails = true;
    const action = f.run('await tab.pressKey("Shift+A");');
    await f.entered.promise; f.gate.reject(new Error('Synthetic dispatched chord failure'));
    await assert.rejects(action, {code: 'RELEASE_FAILED'});
    assert.equal((await f.runtime.request('state')).state.releasePending, true);
    f.hooks.releaseFails = false;
    await f.computer.close();
    assert.equal((await f.runtime.request('state')).state.releasePending, false);
    assert.equal(f.events.filter(([kind]) => kind === 'release').length, 2);
  });

  test(`${name}: failed idle-close release remains retryable`, async t => {
    const f = await fixture(t, createSession); f.hooks.releaseFails = true;
    const action = f.run('await tab.pressKey("Shift+A");');
    await f.entered.promise; f.gate.reject(new Error('Synthetic dispatched chord failure'));
    await assert.rejects(action, {code: 'RELEASE_FAILED'});
    await assert.rejects(f.computer.close(), {code: 'RELEASE_FAILED'});
    assert.equal((await f.runtime.request('state')).state.releasePending, true);
    f.hooks.releaseFails = false;
    await f.computer.close();
    assert.equal((await f.runtime.request('state')).state.releasePending, false);
    assert.equal(f.events.filter(([kind]) => kind === 'release').length, 3);
  });

  test(`${name}: idle close releases a transient action paused by a dialog`, async t => {
    const f = await fixture(t, createSession);
    f.hooks.result = {pendingDialog: {id: 'synthetic-dialog', type: 'alert'}, inputDispatched: true};
    f.gate.resolve(); await f.run('await tab.pressKey("Shift+A");');
    await f.computer.close();
    assert.equal(f.events.filter(([kind]) => kind === 'release').length, 1);
    assert.equal((await f.runtime.request('state')).state.mode, 'stopped');
  });

  test(`${name}: acknowledged explicit stop clears a failed release obligation`, async t => {
    const f = await fixture(t, createSession); f.hooks.releaseFails = true;
    const action = f.run('await tab.pressKey("Shift+A");');
    await f.entered.promise; f.gate.reject(new Error('Synthetic dispatched chord failure'));
    await assert.rejects(action, {code: 'RELEASE_FAILED'});
    f.hooks.releaseFails = false; await f.run('await cua.stop();');
    const releases = f.events.filter(([kind]) => kind === 'release').length;
    await f.computer.close();
    assert.equal(f.events.filter(([kind]) => kind === 'release').length, releases,
      'closing an acknowledged idle session must not issue another global stop');
  });

  test(`${name}: dialog handling and ordinary completion do not stop idle sessions`, async t => {
    const f = await fixture(t, createSession);
    f.hooks.result = {pendingDialog: {id: 'synthetic-dialog', type: 'alert'}, inputDispatched: true};
    f.gate.resolve(); await f.run('await tab.pressKey("Shift+A");');
    f.hooks.result = {handled: true, releasePending: false};
    await f.run('await tab.act({action: "handleDialog"});');
    f.hooks.result = undefined; await f.run('await tab.pressKey("Shift+A");');
    await f.computer.close();
    assert.equal(f.events.filter(([kind]) => kind === 'release').length, 0);
  });
}

for (const failure of ['throw new Error("synthetic cell failure");', 'await Promise.reject(new Error("synthetic cell failure"));'])
test(`a failed cell waits for its already dispatched input (${failure.startsWith('throw') ? 'throw' : 'rejection'})`, async t => {
  const f = await fixture(t);
  let settled = false;
  const run = f.run(`tab.typeText("once").catch(() => {}); ${failure}`).catch(error => error)
    .finally(() => { settled = true; });
  await f.entered.promise;
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(settled, false, 'failure must not return while this cell can still perform input');
  f.gate.resolve();
  assert.match((await run).message, /synthetic cell failure/);
  assert.deepEqual(f.events, [['dispatch', 'once'], ['complete', 'once']]);
  assert.ok((await f.run('tab.id')).outputs.includes('tab:pending'), 'ordinary errors keep completed bindings');
});

test('a failed cell with stalled input retains its deadline, releases and resets bindings', async t => {
  const f = await fixture(t);
  await assert.rejects(f.run('tab.typeText("once").catch(() => {}); throw new Error("synthetic cell failure");', 150),
    {code: 'COMPUTER_TIMEOUT'});
  assert.deepEqual(f.events, [['dispatch', 'once'], ['release']]);
  const state = (await f.runtime.request('state')).state;
  assert.equal(state.mode, 'stopped'); assert.equal(state.releasePending, false);
  await assert.rejects(f.run('tab.id'), /tab is not defined/);
});

test('a rejected concurrent API call waits for the other dispatched call before reporting failure', async t => {
  const f = await fixture(t);
  let settled = false;
  const run = f.run('await Promise.all([tab.typeText("reject"), tab.typeText("once")]);')
    .catch(error => error).finally(() => { settled = true; });
  await f.entered.promise;
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(settled, false);
  f.gate.resolve();
  assert.equal((await run).code, 'STALE_OBSERVATION');
  assert.deepEqual(f.events, [['dispatch', 'once'], ['complete', 'once']]);
});

test('user cancellation interrupts failed-cell settlement and waits for input release', async t => {
  const f = await fixture(t), aborter = new AbortController();
  const run = f.run('tab.typeText("once").catch(() => {}); throw new Error("synthetic cell failure");', 3000, aborter.signal)
    .catch(error => error);
  await f.entered.promise;
  aborter.abort(new Error('Synthetic user stop'));
  assert.match((await run).message, /Synthetic user stop/);
  assert.deepEqual(f.events, [['dispatch', 'once'], ['release']]);
  assert.equal((await f.runtime.request('state')).state.releasePending, false);
});

test('failed-cell timeout reports release failure and retains the recovery obligation', async t => {
  const f = await fixture(t); f.hooks.releaseFails = true;
  await assert.rejects(f.run('tab.typeText("once").catch(() => {}); throw new Error("synthetic cell failure");', 150),
    {code: 'RELEASE_FAILED'});
  const state = (await f.runtime.request('state')).state;
  assert.equal(state.releasePending, true); assert.equal(state.mode, 'release_failed');
  f.hooks.releaseFails = false;
  assert.equal((await f.runtime.request('stop')).state.releasePending, false);
  assert.deepEqual(f.events, [['dispatch', 'once'], ['release'], ['release']]);
});

test('an outstanding call release failure takes precedence over the earlier JavaScript error', async t => {
  const f = await fixture(t); f.hooks.releaseFails = true;
  const run = f.run('tab.typeText("once").catch(() => {}); throw new Error("synthetic cell failure");')
    .catch(error => error);
  await f.entered.promise;
  f.gate.reject(new Error('Synthetic dispatched action failure'));
  assert.equal((await run).code, 'RELEASE_FAILED');
  assert.equal((await f.runtime.request('state')).state.releasePending, true);
});
