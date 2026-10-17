import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationHost } from '../src/dsh/presentation.mjs';
import { createActivityFeed } from '../src/dsh/activity.mjs';
import { createBrowserHost } from '../src/dsh/browser-host.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t) {
  const activity = createActivityFeed(), browser = createBrowserHost(), presented = [], operations = [];
  let sessionId = 'A', capture, focusFailure, placement = 'window';
  const target = { id: 'native:target', backend: 'native', title: 'Window', identity: { windowId: 1 } };
  const frame = { ok: true, target, preview: { dataUrl: 'data:image/png;base64,eA==', width: 300, height: 200 } };
  const runtime = { async request(method, args, options) {
    operations.push({ method, args, options });
    if (method === 'preview') return capture ? capture.promise : frame;
    if (method === 'focus' && focusFailure) return { ok: false, error: { message: focusFailure } };
    return { ok: true, result: { placement } };
  } };
  const host = createPresentationHost({ runtime, activity, browserHost: {
    presentationOwner: () => 'window', isPresentationSession: (_id, id) => id === sessionId,
    async present(payload) { presented.push(payload); return { visible: true }; },
    async hidePresentation() { presented.push({ frames: [] }); }, async closePresentations() {},
  } });
  t.after(async () => { capture?.resolve(frame); await host.close(); activity.close(); browser.close(); });
  const act = () => activity.finish(activity.begin('A', 'act', { targetId: target.id }), { ok: true, target });
  return { host, browser, activity, target, frame, presented, operations, act,
    slow() { capture = Promise.withResolvers(); return capture; },
    failFocus(message) { focusFailure = message; },
    sidebar() { placement = 'sidebar'; },
    async switchTo(id) { sessionId = id; await host.sessionsChanged(); await tick(); },
    show: () => host.handle('showTask', { rendererId: 'window', sessionId: 'A' }),
    state: () => host.handle('state', { rendererId: 'window' }),
  };
}

test('switching sessions hides immediately and rejects a late capture, then restores only the original session', async t => {
  const f = fixture(t); f.act(); await f.show(); assert.equal(f.host.snapshot().visible, true);
  const gate = f.slow(); f.act(); await tick();
  await f.switchTo('B'); assert.equal(f.host.snapshot().visible, false);
  const before = f.presented.length; gate.resolve(f.frame); await tick();
  assert.equal(f.presented.length, before); assert.deepEqual((await f.state()).state.activeTaskIds, []);
  await f.switchTo('A'); assert.equal(f.host.snapshot().visible, true, 'returning needs neither showTask nor new tool activity');
  assert.deepEqual(f.presented.at(-1).frames.map(frame => frame.threadID), ['A']);
});

test('close remains hidden across tool actions and session switches without stopping input', async t => {
  const f = fixture(t); f.act(); await f.show();
  await f.host.event({ rendererId: 'window', type: 'hidden' });
  f.act(); await tick(); await f.switchTo('B'); await f.switchTo('A');
  assert.equal(f.host.snapshot().visible, false);
  assert.equal((await f.state()).state.taskVisibilities.A, 'hidden');
  assert.equal(f.operations.some(op => op.method === 'stop'), false);
  await f.show(); assert.equal(f.host.snapshot().visible, true);
});

test('failed focus keeps the preview; successful focus uses its conversation and does not select a tool target', async t => {
  const f = fixture(t); f.act(); await f.show(); f.failFocus('Window unavailable');
  const event = { rendererId: 'window', type: 'focus', targetId: f.target.id };
  assert.equal((await f.host.event(event)).ok, false); assert.equal(f.host.snapshot().visible, true);
  f.failFocus(null); assert.equal((await f.host.event(event)).ok, true); assert.equal(f.host.snapshot().visible, true);
  assert.equal((await f.state()).state.taskVisibilities.A, 'shown');
  assert.equal(f.operations.filter(op => op.method === 'focus').at(-1).options.sessionKey, 'A');
  assert.equal(f.operations.some(op => ['select', 'stop'].includes(op.method)), false);
});

test('historical window ownership does not authorize monitoring in the newly viewed session', async t => {
  const f = fixture(t), id = (await f.browser.handle('browser/connect', { presentation: true, sessionIds: ['A'] })).rendererId;
  assert.equal(f.browser.isPresentationSession(id, 'A'), true);
  await f.browser.handle('browser/sessions', { rendererId: id, sessionIds: ['B'] });
  assert.equal(f.browser.presentationOwner(f.target, 'A'), id);
  assert.equal(f.browser.isPresentationSession(id, 'A'), false);
  assert.equal(f.browser.isPresentationSession(id, 'B'), true);
});

test('sidebar focus yields only until the next real tool activity and never records a user hide', async t => {
  const f = fixture(t); f.sidebar(); f.act(); await f.show();
  await f.host.event({ rendererId: 'window', type: 'focus', targetId: f.target.id });
  assert.equal(f.host.snapshot().visible, false);
  assert.equal((await f.state()).state.taskVisibilities.A, 'shown');
  await f.host.sessionsChanged(); await tick();
  assert.equal(f.host.snapshot().visible, false, 'monitor polling must not undo the temporary yield');
  f.act(); await tick();
  assert.equal(f.host.snapshot().visible, true, 'new tool activity restores the preview');
});

test('moving a ready preview to the sidebar retains its frame while recapture is pending', async t => {
  const f = fixture(t); f.act(); await f.show();
  f.slow();
  await f.host.handle('placement', { rendererId: 'window', sessionId: 'A', placement: 'home' });
  const { frames } = (await f.state()).state;
  assert.equal(frames.length, 1); assert.equal(frames[0].placement, 'home');
  assert.equal(frames[0].imageDataURL, f.frame.preview.dataUrl);
  assert.equal(f.host.snapshot().visible, false);
});

test('returning to a sidebar task ends its temporary yield without a tool call or explicit show', async t => {
  const f = fixture(t); f.sidebar(); f.act(); await f.show();
  await f.host.event({ rendererId: 'window', type: 'focus', targetId: f.target.id });
  assert.equal(f.host.snapshot().visible, false);
  await f.switchTo('B'); await f.switchTo('A');
  assert.equal(f.host.snapshot().visible, true);
  assert.equal((await f.state()).state.taskVisibilities.A, 'shown');
});
