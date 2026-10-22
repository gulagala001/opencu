import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPresentationImages } from '../src/presentation-images.mjs';
import { createPresentationUpdateQueue } from '../src/client/presentation-interaction.mjs';

const frame = (id, revision = '1') => ({ threadID: 'session', presentationID: id, visibilityKey: 'occurrence-' + id,
  mediaGeneration: 1, imageRevision: revision, imageDataURL: 'data:image/png;base64,' + id + revision,
  width: 800, height: 600, kind: 'screenshot' });
const fixture = () => {
  const renders = [];
  const queue = createPresentationUpdateQueue(state => renders.push(state), { requestFrame: () => 1, cancelFrame: () => {} });
  return { queue, renders };
};

test('window updates restore unchanged peers while applying new pixels, titles, completion and removals', () => {
  const { queue } = fixture(), full = [frame('a'), frame('b')];
  queue.update({ frames: full }); const first = queue.getState().frames;
  const next = [frame('a', '2'), { ...frame('b'), title: 'updated', completion: { id: 'done' } }];
  queue.update({ frames: compactPresentationImages(full, next) });
  assert.deepEqual(queue.getState().frames, next);
  assert.equal(queue.getState().frames[1].imageDataURL, first[1].imageDataURL);
  const current = queue.getState().frames;
  queue.update({ frames: compactPresentationImages(current, current) });
  assert.strictEqual(queue.getState().frames, current);
  queue.update({ frames: compactPresentationImages(current, [current[1]]) });
  assert.deepEqual(queue.getState().frames, [current[1]]); queue.dispose();
});

test('window baseline loss is atomic and a full replay restores frames without mixing sessions or geometry', () => {
  const { queue, renders } = fixture(), full = [frame('a'), frame('b')], compact = compactPresentationImages(full, full);
  assert.throws(() => queue.update({ frames: compact }), { code: 'PRESENTATION_IMAGE_BASELINE_MISSING' });
  assert.deepEqual(queue.getState().frames, []); assert.equal(renders.length, 0);
  queue.update({ frames: full });
  for (const change of [{ threadID: 'other' }, { visibilityKey: 'replacement' }, { mediaGeneration: 2 }, { width: 400 }, { height: 300 }]) {
    const prior = queue.getState();
    assert.throws(() => queue.update({ frames: [frame('a', '2'), { ...compact[1], ...change }] }), { code: 'PRESENTATION_IMAGE_BASELINE_MISSING' });
    assert.strictEqual(queue.getState(), prior);
  }
  queue.update({ frames: [] });
  assert.throws(() => queue.update({ frames: compact }), { code: 'PRESENTATION_IMAGE_BASELINE_MISSING' });
  queue.update({ frames: full }); assert.deepEqual(queue.getState().frames, full); queue.dispose();
});

test('fatal invalidations and empty updates remove old pixels; metadata-only motion retains the current frames', () => {
  const { queue } = fixture(); queue.update({ frames: [frame('a')] });
  const previous = queue.getState().frames;
  queue.update({ motion: { items: [], bounds: { x: 3, y: 4 } } });
  assert.strictEqual(queue.getState().frames, previous);
  const failed = { ...frame('a'), imageDataURL: undefined, error: 'permission revoked', cacheInvalidated: true };
  queue.update({ frames: [failed] }); assert.equal(queue.getState().frames[0].imageDataURL, undefined);
  queue.update({ frames: [], reset: 2 }); assert.deepEqual(queue.getState().frames, []); queue.dispose();
});
