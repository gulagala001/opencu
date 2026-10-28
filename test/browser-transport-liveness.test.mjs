import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserHost } from '../src/dsh/browser-host.mjs';
import { createBrowserTransport } from '../src/client/browser-transport.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async check => { for (let i = 0; i < 100 && !check(); i++) await tick(); return check(); };
async function fixture(t, { presentation, duplicate = false, beforeResult } = {}) {
  const host = createBrowserHost(); let connection, connections = 0, publishGate;
  const previousDocument = globalThis.document, previousStyle = globalThis.getComputedStyle;
  globalThis.document = { documentElement: { lang: 'en' } };
  globalThis.getComputedStyle = () => ({ colorScheme: 'light' });
  const transport = createBrowserTransport({ async request(method, args, signal) {
    if (method === 'browser/result') await beforeResult?.(args);
    const value = await host.handle(method, args, signal);
    if (method === 'browser/publish' && publishGate) await publishGate.promise;
    if (method === 'browser/connect') { connection = args; connections++; }
    if (duplicate && method === 'browser/poll') value.commands = value.commands.flatMap(command => [command, command]);
    return value;
  } }, presentation && { presentation });
  transport.setSessionOwner(() => ['session']);
  t.after(() => { transport.quiesce(); host.close(); globalThis.document = previousDocument; globalThis.getComputedStyle = previousStyle; });
  return { host, transport, set publishGate(value) { publishGate = value; }, get connection() { return connection; }, get connections() { return connections; } };
}

test('monitoring session and cursor replies cannot block renderer connection or session ownership', async t => {
  const gate = Promise.withResolvers(), calls = [];
  const f = await fixture(t, { presentation: (method, args) => { calls.push({ method, args }); return gate.promise; } });
  await f.transport.start(); await until(() => f.connection);
  const connectedWithoutDisplay = !!f.connection;
  let synced = false;
  const updating = f.transport.updateSessions().then(() => { synced = true; }, error => error);
  await until(() => synced);
  const syncedWithoutDisplay = synced;
  gate.resolve({}); await updating; await until(() => f.connection);
  await f.transport.dispose();
  assert.equal(connectedWithoutDisplay, true);
  assert.equal(syncedWithoutDisplay, true);
});

test('a duplicate command delivery executes guest input once', async t => {
  const f = await fixture(t, { duplicate: true }); await f.transport.start(); await until(() => f.connection);
  let inputs = 0;
  const remote = f.transport.attachRemote({ sessionId: 'session', tabId: 'tab', request: async method => {
    if (method === 'act') { inputs++; return { accepted: true }; }
    if (method === 'release') return { released: true };
    throw Error(method);
  } });
  remote.update({ title: 'Fixture', url: 'about:blank' }); await tick();
  await f.host.backend.act(remote.target, { action: 'click', x: 10, y: 10 }); await tick();
  await f.transport.dispose();
  assert.equal(inputs, 1);
});

test('confirmed input release lets cleanup finish while a preview reply is missing', async t => {
  const f = await fixture(t), preview = Promise.withResolvers(), entered = Promise.withResolvers();
  await f.transport.start(); await until(() => f.connection);
  const remote = f.transport.attachRemote({ sessionId: 'session', tabId: 'tab', request: async method => {
    if (method === 'preview') { entered.resolve(); return preview.promise; }
    if (method === 'release') return { released: true };
    throw Error(method);
  } });
  remote.update({ title: 'Fixture', url: 'about:blank' }); await tick();
  const observing = f.host.backend.preview(remote.target).catch(error => error);
  await entered.promise;
  let disposed = false;
  const disposing = f.transport.dispose().then(() => { disposed = true; });
  await until(() => disposed);
  const completedWithoutPreview = disposed;
  preview.resolve({}); await disposing; await observing;
  assert.equal(completedWithoutPreview, true);
});


test('a lost publication reply from a retired connection cannot block reconnecting the same guest', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(t), gate = Promise.withResolvers();
  await f.transport.start(); await until(() => f.connection); await tick();
  const remote = f.transport.attachRemote({ sessionId: 'session', tabId: 'tab', request: async method => {
    if (method === 'release') return { released: true };
    throw Error(method);
  } });
  f.publishGate = gate;
  remote.update({ title: 'Fixture', url: 'about:blank' }); await tick();
  await f.host.handle('browser/connect', { rendererId: f.transport.rendererId, presentation: false, sessionIds: ['session'] });
  await tick(); f.publishGate = undefined; t.mock.timers.tick(1000);
  await until(() => f.connections === 2);
  const reconnectedWithoutOldReply = f.connections === 2;
  gate.resolve(); await f.transport.dispose();
  assert.equal(reconnectedWithoutOldReply, true);
});


for (const lost of ['page-reply', 'result-delivery']) test('confirmed target retirement with missing ' + lost + ' does not disconnect healthy peers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = Promise.withResolvers(), entered = Promise.withResolvers();
  const f = await fixture(t, { beforeResult: lost === 'result-delivery' ? args => {
    if (args.result?.lost) { entered.resolve(); return gate.promise; }
  } : undefined });
  await f.transport.start(); await until(() => f.connection);
  const release = { closed: true, released: true, retired: true, leaseId: 'original', webContentsId: 9 };
  const dead = f.transport.attachRemote({ sessionId: 'session', tabId: 'dead', request: async method => {
    if (method === 'act') { if (lost === 'page-reply') { entered.resolve(); await gate.promise; } return { lost: true }; }
    if (method === 'release') return release;
    throw Error(method);
  } });
  const peer = f.transport.attachRemote({ sessionId: 'session', tabId: 'peer', request: async method => method === 'release' ? { released: true } : { acted: true } });
  dead.update({ title: 'Closing', url: 'about:blank' }); peer.update({ title: 'Peer', url: 'about:blank' }); await tick();
  const action = f.host.backend.act(dead.target, { action: 'click' }).catch(error => error); await entered.promise;
  await dead.retire(release);
  const error = await action;
  assert.equal(error.code, 'TARGET_CLOSED'); assert.equal(error.details.effectVerified, false);
  assert.equal(error.details.inputDispatched, true); assert.deepEqual(error.details.release, release);
  t.mock.timers.tick(30000); await tick();
  assert.deepEqual(await f.host.backend.act(peer.target, { action: 'click' }), { acted: true });
  gate.resolve(); await tick();
  assert.equal((await f.host.backend.releaseTarget(dead.target)).retired, true);
  assert.equal((await f.host.backend.release()).released, true);
  await f.transport.dispose();
});

test('a known self-close action result survives retirement without inventing an unknown effect', async t => {
  const f = await fixture(t); await f.transport.start(); await until(() => f.connection);
  const release = { closed: true, released: true, retired: true, leaseId: 'original', webContentsId: 9 };
  const remote = f.transport.attachRemote({ sessionId: 'session', tabId: 'tab', request: async method => {
    if (method === 'act') return { action: 'click', inputDispatched: true, closedTargetId: remote.target.id, release };
    if (method === 'release') return release;
    throw Error(method);
  } });
  remote.update({ title: 'Self closing', url: 'about:blank' }); await tick();
  const result = await f.host.backend.act(remote.target, { action: 'click' });
  assert.equal(result.closedTargetId, remote.target.id); assert.equal(result.inputDispatched, true); assert.deepEqual(result.release, release);
  assert.equal(f.host.listBrowsers().length, 1);
  await assert.rejects(f.host.backend.act(remote.target, { action: 'click' }), error => error.code === 'TARGET_CLOSED' && error.details.inputDispatched === false && error.details.release.retired === true);
  assert.equal((await f.host.backend.release()).released, true);
  await f.transport.dispose();
});
