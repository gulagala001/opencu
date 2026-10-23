import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { controllers } from './fixtures/approval-session-boundaries.mjs';

// Only the session that explicitly drove a native target owns the desktop.
// Passive observation and subsequent browser work do not change that owner.

const fixtureURL = new URL('./fixtures/approval-session-boundaries.mjs', import.meta.url).href;
const mocked = new Set([
  '../src/dsh/tools.mjs', '../src/dsh/computer.mjs', '../src/dsh/activity.mjs',
  '../src/dsh/browser-host.mjs', '../src/dsh/presentation.mjs', '../src/dsh/preferences.mjs',
  '../src/dsh/browser-history.mjs', '../src/runtime.mjs', '../src/dsh/model-output.mjs',
  '../src/dsh/downloads.mjs', '../src/browser/resources.mjs', '../src/dsh/delivery-files.mjs',
  '../src/dsh/image-registry.mjs', '../src/extension/pairing.mjs', '../src/extension/listen.mjs',
].map(path => new URL(path, import.meta.url).href));
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (['@deepseek-ai/cordis', '@deepseek-ai/dsh-scope', '@deepseek-ai/schemastery'].includes(specifier) ||
      specifier.startsWith('.') && mocked.has(new URL(specifier, context.parentURL).href)) {
    return { url: fixtureURL, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { acquireOpenCU } = await import('../src/dsh/shared.mjs');
hooks.deregister();

const native = { id: 'native:synthetic:A', backend: 'native', kind: 'app', platform: 'linux', name: 'Synthetic A', identity: { pid: 10, windowId: 11, executable: '/synthetic/A' } };
const tab = { id: 'tab:synthetic:B', backend: 'browser', kind: 'tab', name: 'Synthetic B', identity: { tabId: 21 } };
const tick = () => new Promise(resolve => setImmediate(resolve));
const awayArgs = args => ({...args, targetId: native.id, targetIdentity: native.identity});

async function fixture(t, { target = native } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-handback-'));
  // Approve the synthetic application up front: this test is about session events,
  // not about the approval prompt.
  await writeFile(join(directory, 'app-approvals.json'), JSON.stringify({ approvedApps: [
    { bundleIdentifier: native.identity.executable, executable: native.identity.executable, displayName: native.name },
  ] }));
  const calls = [];
  let awayGate, failAway = false;
  const state = () => ({ mode: 'active', activeTargetId: target.id, targets: [native, tab], revision: 1 });
  const controller = {
    runtimeInfo: { backends: { native: true, extension: false }, browserProviders: [], browserProvider: null },
    extensionConnections: () => [],
    getState: async () => ({ ok: true, state: state() }),
    listTargets: async () => ({ ok: true, targets: [target] }),
    selectTarget: async () => ({ ok: true, target }),
    applicationMetadata: async value => ({ displayName: value.name }),
    focus: async () => ({ ok: true, target, state: state() }),
    observe: async () => ({ ok: true, target, state: state() }),
    away: async (args, {isCurrent} = {}) => {
      const gate = awayGate; awayGate = undefined;
      if (gate) await gate;
      if (isCurrent && !isCurrent()) return {ok: true, away: false};
      calls.push(args);
      return failAway ? {ok: false, error: {code: 'RELEASE_FAILED', message: 'Synthetic release failure'}} : {ok: true, away: true, state: state()};
    },
    resume: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    close: async () => ({ ok: true }),
  };
  controllers.set(directory, controller);
  const handlers = new Map();
  const root = {
    on(name, handler) { handlers.set(name, handler); return () => handlers.delete(name); },
    get: () => undefined, provide: () => () => {}, inject: () => ({ dispose: async () => {} }),
  };
  root.root = root;
  const lease = acquireOpenCU({ root, effect: callback => callback() }, { config: { dataDir: directory, nativeEnabled: true, browserEnabled: false, extensionEnabled: false } });
  t.after(async () => {
    try { await lease.release(); } finally { controllers.delete(directory); await rm(directory, { recursive: true, force: true }); }
  });
  const session = { id: 'session-a' };
  const emit = async (event, from = session) => { handlers.get('session/event')(from, event); await tick(); };
  const drive = (from = session) => lease.request('focus', {targetId: target.id}, {sessionKey: from.id});
  return { calls, emit, drive,
    request: (endpoint, args = {}) => lease.request(endpoint, args, {sessionKey: session.id}),
    switchTarget: next => { target = next; },
    delayAway: () => new Promise(resolve => { awayGate = new Promise(resume => resolve(resume)); }),
    failAway: value => { failAway = value; },
  };
}

test('a turn that ends hands the whole desktop back and stops holding it', async t => {
  const f = await fixture(t);
  await f.drive();
  await f.emit({ type: 'turn/end', data: { turn: 1 } });
  assert.deepEqual(f.calls, [awayArgs({ relinquish: true })], 'the end of a turn gives the window, the view and the bar back');
  await f.emit({ type: 'turn/end', data: { turn: 2 } });
  assert.equal(f.calls.length, 1, 'a session that no longer holds the desktop does not hand it back twice');
});

test('a question hands the view back and keeps holding the window', async t => {
  const f = await fixture(t);
  await f.drive();
  await f.emit({ type: 'tool/call', data: { name: 'ask_user_question' } });
  assert.deepEqual(f.calls, [awayArgs({})], 'asking only returns the view: the selection keeps its workspace');
  await f.emit({ type: 'turn/end', data: { turn: 1 } });
  assert.deepEqual(f.calls, [awayArgs({}), awayArgs({ relinquish: true })], 'the turn can still end the takeover after a question');
});

test('ordinary steps and tools keep the screen', async t => {
  const f = await fixture(t);
  await f.drive();
  await f.emit({ type: 'tool/call', data: { name: 'bash' } });
  await f.emit({ type: 'step/end', data: {} });
  assert.deepEqual(f.calls, [], 'only a question or the end of a turn yields the desktop');
});

test('only the session that drove the desktop may hand it back', async t => {
  const f = await fixture(t);
  await f.drive();
  await f.emit({ type: 'turn/end', data: { turn: 1 } }, { id: 'session-b' });
  await f.emit({ type: 'tool/call', data: { name: 'ask_user_question' } }, { id: 'session-b' });
  assert.deepEqual(f.calls, [], 'another session watching the same desktop changes nothing');
});

test('a browser target is left alone', async t => {
  const f = await fixture(t, { target: tab });
  await f.drive();
  await f.emit({ type: 'turn/end', data: { turn: 1 } });
  assert.deepEqual(f.calls, [], 'a tab never took the screen, so there is nothing to give back');
});

test('a native takeover survives subsequent browser work until hand-back', async t => {
  const f = await fixture(t);
  await f.drive();
  f.switchTarget(tab);
  await f.drive();
  await f.emit({type: 'turn/end', data: {turn: 1}});
  assert.deepEqual(f.calls, [awayArgs({relinquish: true})]);
});

test('an old hand-back cannot surrender a newer native driver', async t => {
  const f = await fixture(t);
  await f.drive();
  const resume = await f.delayAway();
  await f.emit({type: 'turn/end', data: {turn: 1}});
  await f.drive({id: 'session-b'});
  resume();
  await tick();
  assert.deepEqual(f.calls, []);
  await f.emit({type: 'turn/end', data: {turn: 1}}, {id: 'session-b'});
  assert.deepEqual(f.calls, [awayArgs({relinquish: true})]);
});

test('passive native operations never claim the desktop', async t => {
  const f = await fixture(t);
  for (const endpoint of ['select', 'observe', 'resume']) {
    await f.request(endpoint, {reference: native.id, targetId: native.id});
    await f.emit({type: 'turn/end', data: {turn: 1}});
  }
  assert.deepEqual(f.calls, []);
});

test('failed hand-back keeps its owner for a later retry', async t => {
  t.mock.method(console, 'error', () => {});
  const f = await fixture(t);
  await f.drive();
  f.failAway(true);
  await f.emit({type: 'turn/end', data: {turn: 1}});
  f.failAway(false);
  await f.emit({type: 'turn/end', data: {turn: 1}});
  assert.deepEqual(f.calls, [awayArgs({relinquish: true}), awayArgs({relinquish: true})]);
});

test('a stale turn-end cannot surrender the current turn', async t => {
  const f = await fixture(t);
  await f.emit({type: 'turn/start', data: {turn: 2}});
  await f.drive();
  await f.emit({type: 'turn/end', data: {turn: 1}});
  assert.deepEqual(f.calls, []);
  await f.emit({type: 'turn/end', data: {turn: 2}});
  assert.deepEqual(f.calls, [awayArgs({relinquish: true})]);
});
