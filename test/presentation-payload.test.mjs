import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationHost } from '../src/dsh/presentation.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, { mix = 'browser', complete = null } = {}) {
  const timers = new Map(), pending = new Map(), calls = [], captures = new Map(), hides = [];
  let timerId = 0, notify, currentOwner = 'A', visibleSessions = ['task'], reply = {}, failure, gate;
  const desktop = { focused: false, zoom: 1, transferring: false }, effects = [];
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  const targets = [{ id: 'browser', backend: 'browser', title: 'Browser', identity: { rendererId: 'A' } }];
  if (mix !== 'browser') targets.push({ id: 'native', backend: 'native', title: 'Native', identity: { rendererId: mix === 'split' ? 'B' : 'A' } });
  const session = { sessionId: 'task', targets, completion: complete, lastStarted: { id: 'initial', startedAt: '2026-10-17T00:00:00Z' } };
  const activity = { snapshot: () => ({ sessions: [session] }), subscribe: listener => { notify = listener; return () => {}; } };
  const host = createPresentationHost({ activity, runtime: { async request(method, args) {
    if (method !== 'preview') { assert.equal(method, 'stopPreview'); return { ok: true }; }
    captures.set(args.targetId, (captures.get(args.targetId) ?? 0) + 1);
    assert.equal(pending.has(args.targetId), false, 'No concurrent duplicate capture for one target');
    const work = Promise.withResolvers(); pending.set(args.targetId, work); return work.promise;
  } }, browserHost: {
    presentationOwner: target => target.id === 'browser' ? currentOwner : target.identity.rendererId,
    isPresentationSession: (_owner, sessionId) => visibleSessions.includes(sessionId),
    async present(payload, owner) {
      calls.push({ payload: structuredClone(payload), owner });
      effects.push({ ...desktop });
      if (gate) { const waiting = gate; gate = undefined; await waiting.promise; }
      if (failure) { const error = failure; failure = undefined; throw error; }
      const value = { visible: true, ...reply, ...(desktop.transferring ? { transferring: true } : {}) }; reply = {}; return value;
    },
    async hidePresentation(owner) { hides.push(owner); return { visible: false }; }, async closePresentations() {},
  } });
  t.after(async () => {
    try { await host.close(); for (const value of pending.values()) value.resolve({ ok: false, error: { message: 'Test closed' } }); }
    finally { globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
  });
  async function resolve(id, changes = {}) {
    const work = pending.get(id); assert(work, 'Expected pending capture ' + id); pending.delete(id);
    const target = targets.find(value => value.id === id);
    work.resolve({ ok: true, target, preview: { dataUrl: 'data:image/png;base64,eA==', width: 300, height: 200, ...changes } }); await tick();
  }
  return { host, session, targets, calls, captures, pending, hides, desktop, effects,
    async initialize() { notify(); await tick(); for (const target of targets) await resolve(target.id); await tick(); },
    async cycle() { const timer = [...timers.values()].at(-1); assert(timer); timers.clear(); timer.fn(); await tick(); return timer.delay; },
    resolve,
    async finish() { for (const target of targets) if (pending.has(target.id)) await resolve(target.id); await tick(); },
    async activity() { session.lastStarted = { ...session.lastStarted, id: 'activity-' + calls.length }; notify(); await tick(); },
    async owner(value) { currentOwner = value; await host.sessionsChanged(); await tick(); },
    async sessions(value) { visibleSessions = value; await host.sessionsChanged(); await tick(); },
    fail() { failure = Error('temporary presentation failure'); },
    invisible() { reply = { visible: false }; },
    holdPresentation() { gate = Promise.withResolvers(); return gate; },
  };
}

for (const [mix, expected, interval] of [['browser', 1, 600], ['mixed', 1, 100], ['split', 2, 100]]) {
  test(`identical ${mix} completion payloads are coalesced without changing capture cadence`, async t => {
    const f = fixture(t, { mix }); await f.initialize();
    for (let index = 0; index < 2; index++) {
      const before = f.calls.length, captured = new Map(f.captures);
      assert.equal(await f.cycle(), interval);
      assert.equal(f.calls.length - before, expected, 'Each owner still receives its scheduled update');
      await f.finish(); assert.equal(f.calls.length - before, expected);
      for (const target of f.targets) assert.equal(f.captures.get(target.id), captured.get(target.id) + 1);
    }
    assert.equal(JSON.stringify(f.host.snapshot()).includes('data:image'), false, 'Private comparison snapshots must not leak through public state');
  });
}

test('changed pixels, icon, geometry, active status, timestamp and visible metadata still publish on completion', async t => {
  const f = fixture(t); await f.initialize();
  for (const changes of [
    { dataUrl: 'data:image/png;base64,eQ==' }, { iconDataURL: 'data:image/png;base64,aQ==' },
    { width: 400 }, { height: 250 }, { active: true }, { isDetached: true },
    { kind: 'native-video' }, { timestamp: 123 },
  ]) {
    await f.cycle(); const before = f.calls.length; await f.resolve('browser', changes);
    assert.equal(f.calls.length, before + 1, JSON.stringify(changes));
    await f.cycle(); await f.resolve('browser');
  }
  await f.cycle(); f.targets[0].title = 'New title'; const before = f.calls.length; await f.resolve('browser');
  assert.equal(f.calls.length, before + 1); assert.equal(f.calls.at(-1).payload.frames[0].title, 'New title');
});

test('completion changes and clearing are compared by value, including an in-place mutation', async t => {
  const complete = { id: 'first', at: 100 }, f = fixture(t, { complete }); await f.initialize();
  await f.cycle(); let before = f.calls.length; complete.id = 'second'; await f.resolve('browser');
  assert.equal(f.calls.length, before + 1); assert.equal(f.calls.at(-1).payload.frames[0].completion.id, 'second');
  await f.cycle(); before = f.calls.length; f.session.completion = null; await f.resolve('browser');
  assert.equal(f.calls.length, before + 1); assert.equal(f.calls.at(-1).payload.frames[0].completion, null);
});

test('real activity always reaches the host even when the entire frame payload stays equal', async t => {
  const f = fixture(t); await f.initialize(); const before = f.calls.length;
  await f.activity(); assert.equal(f.calls.length, before + 1); await f.finish();
  assert.equal(f.calls.length, before + 1);
});

test('same pixels still refresh host focus and zoom on every scheduled round', async t => {
  const f = fixture(t); await f.initialize();
  for (const state of [{ focused: true }, { zoom: 1.5 }, { focused: false, zoom: 2 }]) {
    Object.assign(f.desktop, state); const before = f.calls.length; await f.cycle();
    assert.equal(f.calls.length, before + 1); assert.deepEqual(f.effects.at(-1), f.desktop);
    await f.finish(); assert.equal(f.calls.length, before + 1);
  }
});

test('transfer acknowledgements never suppress the retry after transfer completes', async t => {
  const f = fixture(t); await f.initialize(); f.desktop.transferring = true;
  await f.cycle(); const before = f.calls.length; f.desktop.transferring = false; await f.resolve('browser');
  assert.equal(f.calls.length, before + 1); assert.equal(f.effects.at(-1).transferring, false);
  const next = f.calls.length; await f.cycle(); assert.equal(f.calls.length, next + 1); await f.finish();
});

for (const state of ['failure', 'invisible', 'renderer-error']) test(`${state} does not suppress an identical completion retry`, async t => {
  const f = fixture(t); await f.initialize();
  if (state === 'failure') f.fail(); if (state === 'invisible') f.invisible();
  await f.cycle(); const before = f.calls.length;
  if (state === 'renderer-error') await f.host.event({ type: 'error', rendererId: 'A', message: 'Renderer reset' });
  await f.resolve('browser'); assert.equal(f.calls.length, before + 1); assert.equal(f.host.snapshot().visible, true);
});

test('placement, hide/show, session reset and owner change invalidate equal payload suppression', async t => {
  const f = fixture(t); await f.initialize();
  const handle = (method, args = {}) => f.host.handle(method, { rendererId: 'A', sessionId: 'task', ...args });
  await handle('placement', { placement: 'home' }); await tick(); await f.finish(); assert.equal(f.host.snapshot().visible, false);
  let before = f.calls.length; await handle('placement', { placement: 'pinned' }); await tick(); await f.finish();
  assert(f.calls.length > before); assert.equal(f.host.snapshot().visible, true);
  await handle('hideTask'); await tick(); before = f.calls.length; await handle('showTask'); await tick(); await f.finish(); assert(f.calls.length > before);
  await f.sessions([]); assert.equal(f.host.snapshot().visible, false);
  before = f.calls.length; await f.sessions(['task']); await f.finish(); assert(f.calls.length > before);
  before = f.calls.length; await f.owner('new-owner'); await f.finish();
  assert(f.calls.slice(before).some(value => value.owner === 'new-owner')); assert(f.hides.includes('A'));
});

test('late acknowledgement after hide cannot repopulate the comparison cache', async t => {
  const f = fixture(t); await f.initialize(); const gate = f.holdPresentation();
  await f.cycle(); await f.host.handle('hideTask', { rendererId: 'A', sessionId: 'task' });
  gate.resolve(); await tick(); await f.finish(); assert.equal(f.host.snapshot().visible, false);
  const before = f.calls.length; await f.host.handle('showTask', { rendererId: 'A', sessionId: 'task' }); await tick(); await f.finish();
  assert(f.calls.length > before); assert.equal(f.host.snapshot().visible, true);
});

test('a changed fast target publishes while another owner is still capturing', async t => {
  const f = fixture(t, { mix: 'split' }); await f.initialize(); await f.cycle(); const before = f.calls.length;
  await f.resolve('browser', { dataUrl: 'data:image/png;base64,Zg==' });
  assert.equal(f.pending.has('native'), true);
  assert.equal(f.calls.length, before + 1); assert.equal(f.calls.at(-1).owner, 'A');
  assert.equal(f.calls.at(-1).payload.frames[0].imageDataURL, 'data:image/png;base64,Zg==');
  await f.resolve('native'); assert.equal(f.calls.length, before + 1);
});

test('thumbnail and icon exchanging identical string/null values still publish', async t => {
  const f = fixture(t); f.targets[0].favicon = null; await f.initialize(); await f.cycle();
  const before = f.calls.length, previous = structuredClone(f.calls.at(-1).payload);
  await f.resolve('browser', { dataUrl: null, iconDataURL: 'data:image/png;base64,eA==' });
  assert.equal(f.calls.length, before + 1);
  assert.notDeepEqual(f.calls.at(-1).payload, previous);
  assert.equal(f.calls.at(-1).payload.frames[0].imageDataURL, null);
});

test('icons moving between nullable fields on two valid thumbnails still publish', async t => {
  const f = fixture(t, { mix: 'mixed' }); for (const target of f.targets) target.favicon = null;
  await f.initialize(); await f.cycle(); await f.resolve('browser', { iconDataURL: 'data:image/png;base64,eA==' }); await f.resolve('native');
  await f.cycle(); const before = f.calls.length, previous = structuredClone(f.calls.at(-1).payload);
  await Promise.all([f.resolve('browser'), f.resolve('native', { iconDataURL: 'data:image/png;base64,eA==' })]);
  assert.equal(f.calls.length, before + 1);
  const payload = f.calls.at(-1).payload;
  assert(payload.frames.every(frame => typeof frame.imageDataURL === 'string'));
  assert.notDeepEqual(payload, previous);
  assert.equal(payload.frames.find(frame => frame.presentationID === 'browser').iconDataURL, null);
  assert.equal(payload.frames.find(frame => frame.presentationID === 'native').iconDataURL, 'data:image/png;base64,eA==');
});
