import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationHost } from '../src/dsh/presentation.mjs';
import { createActivityFeed } from '../src/dsh/activity.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(t) {
  const activity = createActivityFeed(), captures = new Map(), presented = [], operations = [];
  let sessions = ['task'];
  const host = createPresentationHost({ activity, runtime: { async request(method, args) {
    operations.push({ method, ...args });
    if (method === 'preview') return captures.get(args.targetId).promise;
    assert.equal(method, 'stopPreview', 'Monitoring must not select, focus or stop input');
    return { ok: true };
  } }, browserHost: {
    presentationOwner: target => target.identity.rendererId ?? 'window',
    isPresentationSession: (_owner, session) => sessions.includes(session),
    async present(payload, owner) { presented.push({ ...payload, owner }); return { visible: true }; },
    async hidePresentation(owner) { presented.push({ owner, frames: [] }); },
    async closePresentations() {},
  } });
  t.after(async () => { for (const capture of captures.values()) capture.resolve({ ok: false, error: { message: 'Closed' } }); await host.close(); activity.close(); });
  function add(id, backend = 'browser', session = 'task', owner = 'window') {
    const target = { id, backend, title: id, identity: { rendererId: owner, windowId: 1 } };
    const capture = Promise.withResolvers(); captures.set(id, capture);
    activity.finish(activity.begin(session, 'select', {}), { ok: true, target });
    return { target, reject: capture.reject,
      resolve: () => capture.resolve({ ok: true, target, preview: { dataUrl: 'data:image/png;base64,eA==', width: 300, height: 200 } }) };
  }
  return { host, activity, add, presented, operations,
    state: async () => (await host.handle('state', { rendererId: 'window' })).state,
    async switchTo(ids) { sessions = ids; await host.sessionsChanged(); await tick(); },
  };
}

test('a new browser preview appears while the earlier native capture is still pending', async t => {
  const f = fixture(t), native = f.add('QQ', 'native'); await tick();
  assert(f.operations.some(op => op.method === 'preview' && op.targetId === 'QQ'));
  const browser = f.add('Search'); browser.resolve(); await tick();
  assert(f.operations.some(op => op.method === 'preview' && op.targetId === 'Search'), 'New activity must not wait for an earlier capture');
  assert.equal(f.host.snapshot().visible, true);
  assert.deepEqual((await f.state()).frames.map(frame => frame.presentationID), ['Search']);
  native.resolve(); await tick();
  assert.deepEqual((await f.state()).frames.map(frame => frame.presentationID), ['Search', 'QQ']);
  const before = f.operations.length;
  await tick(); await tick();
  assert.equal(f.operations.length, before, 'Publishing a completed capture must not immediately recapture it');
});

test('slow capture in one window does not block another window', async t => {
  const f = fixture(t); await f.switchTo(['task', 'other']);
  f.add('Slow', 'native'); await tick();
  const fast = f.add('Other search', 'browser', 'other', 'other-window'); fast.resolve(); await tick();
  assert(f.presented.some(update => update.owner === 'other-window' && update.frames[0]?.presentationID === 'Other search'));
});

test('a failed capture reports its own error without dropping the ready browser frame', async t => {
  const f = fixture(t), native = f.add('QQ', 'native'); await tick();
  const browser = f.add('Search'); browser.resolve(); await tick();
  native.reject(Object.assign(new Error('Native capture timed out'), { code: 'PRESENTATION_TIMEOUT' })); await tick();
  const { frames } = await f.state();
  assert.equal(frames[0].presentationID, 'Search'); assert(frames[0].imageDataURL);
  assert.equal(frames[1].errorCode, 'PRESENTATION_TIMEOUT');
  assert.equal(f.host.snapshot().visible, true);
});

test('closing monitoring does not wait for a pending capture or publish it later', async t => {
  const f = fixture(t), slow = f.add('Slow', 'native'); await tick();
  let timer;
  try {
    await Promise.race([f.host.close(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Close waited for capture')), 1000);
    })]);
  } finally { clearTimeout(timer); }
  const before = f.presented.length; slow.resolve(); await tick();
  assert.equal(f.presented.length, before); assert.equal(f.host.snapshot().visible, false);
  assert(f.operations.some(op => op.method === 'stopPreview' && op.targetId === 'Slow'));
});

for (const change of ['hideTask', 'switch']) test(`a late capture cannot restore a preview after ${change}`, async t => {
  const f = fixture(t), slow = f.add('Slow', 'native'); await tick();
  const fast = f.add('Search'); fast.resolve(); await tick();
  assert.equal(f.host.snapshot().visible, true);
  if (change === 'switch') await f.switchTo(['other']);
  else await f.host.handle('hideTask', { rendererId: 'window', sessionId: 'task' });
  const before = f.presented.length;
  slow.resolve(); await tick();
  assert.equal(f.host.snapshot().visible, false);
  assert(f.presented.slice(before).every(update => update.frames.length === 0));
  assert.deepEqual((await f.state()).frames, []);
});
