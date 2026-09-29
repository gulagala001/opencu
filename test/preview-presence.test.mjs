import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewPresence } from '../src/client/preview-presence.mjs';

test('preview pane ownership is session-scoped and survives overlapping visible panes', () => {
  const presence = createPreviewPresence(), changes = [];
  const unsubscribe = presence.subscribe('a', () => changes.push(presence.visible('a')));
  const first = presence.show('a'), second = presence.show('a'), other = presence.show('b');
  assert.equal(presence.visible('a'), true); first(); first();
  assert.equal(presence.visible('a'), true); second();
  assert.equal(presence.visible('a'), false); assert.equal(presence.visible('b'), true);
  assert.deepEqual(changes, [true, false]); unsubscribe(); other();
  assert.equal(presence.visible('b'), false);
  const fresh = presence.show('a'); assert.equal(presence.visible('a'), true); fresh();
});
