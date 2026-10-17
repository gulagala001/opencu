import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationHost } from '../src/dsh/presentation.mjs';
import { createActivityFeed } from '../src/dsh/activity.mjs';

for (const method of ['hideTask', 'hideAll']) test(method + ' updates the window without waiting for an in-flight monitor frame', async t => {
  const activity = createActivityFeed(), ready = Promise.withResolvers(), late = Promise.withResolvers();
  const target = { id: 'isolated:target', backend: 'native', identity: { windowId: 1 }, title: 'Isolated window' };
  let captures = 0, hides = 0, stops = 0;
  const presented = [], frame = { ok: true, target, preview: { dataUrl: 'data:image/jpeg;base64,eA==', width: 300, height: 200 } };
  const runtime = { async request(operation) {
    if (operation === 'preview') {
      captures++;
      if (captures > 1) { ready.resolve(); return late.promise; }
      return frame;
    }
    assert.equal(operation, 'stopPreview', 'Hiding monitoring must never stop input or focus another target');
    stops++; return { ok: true };
  } };
  const host = createPresentationHost({ runtime, activity, browserHost: {
    presentationOwner: () => 'isolated:renderer',
    isPresentationSession: () => true,
    async present(payload) { presented.push(payload); return { visible: true }; },
    async hidePresentation() { hides++; return { visible: false }; },
    async closePresentations() {},
  } });
  t.after(async () => { late.resolve(frame); await host.close(); activity.close(); });
  const first = activity.begin('isolated:session', 'select', {});
  activity.finish(first, { ok: true, target });
  await host.handle('showTask', { rendererId: 'isolated:renderer', sessionId: 'isolated:session' });
  const running = activity.begin('isolated:session', 'act', { targetId: target.id });
  await ready.promise;
  const before = hides;
  const hidden = host.handle(method, { rendererId: 'isolated:renderer', sessionId: 'isolated:session' });
  let timeout;
  try {
    await Promise.race([hidden, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Hide waited for the slow frame')), 1000); })]);
  } finally { clearTimeout(timeout); }
  assert.ok(hides > before);
  assert.equal(host.snapshot().visible, false);
  assert.equal(activity.snapshot().sessions[0].running[0].id, running.id, 'The real tool activity remains running');
  const presentations = presented.length;
  late.resolve(frame);
  await host.close();
  assert.equal(presented.length, presentations, 'The late frame must not reappear after hide');
  assert.ok(stops >= 1);
});
