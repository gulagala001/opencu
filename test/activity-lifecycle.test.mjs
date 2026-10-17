import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivityFeed } from '../src/dsh/activity.mjs';

const start = turn => ({ type: 'turn/start', data: { turn } });
const end = (turn, kind = 'completed', seq = 10) => ({ type: 'turn/end', seq, time: 1234, data: { turn, reason: { kind } } });

test('lazy activity ignores unrelated turns and retains first-use completion through the current native turn', () => {
  let turn = 1, notifications = 0;
  const feed = createActivityFeed(() => turn), off = feed.subscribe(() => notifications++);
  try {
    feed.sessionEvent('unused', start(1)); feed.sessionEvent('unused', end(1));
    assert.deepEqual(feed.snapshot(), { ok: true, revision: 0, sessions: [] }); assert.equal(notifications, 0);
    const handle = feed.begin('used', 'act', { targetId: 'target' });
    feed.finish(handle, { ok: true, target: { id: 'target' }, observation: { observationId: 'original' } });
    feed.sessionEvent('used', end(2)); assert.equal(feed.snapshot().sessions[0].completion, null);
    feed.sessionEvent('used', end(1));
    assert.deepEqual(feed.snapshot().sessions[0].completion, { id: 'used:10', at: 1234 });
    turn = 2; feed.sessionEvent('used', start(2)); feed.sessionEvent('used', end(2));
    assert.equal(feed.snapshot().sessions[0].completion, null);
    assert.equal(feed.snapshot().sessions[0].targets[0].observation.observationId, 'original');
    turn = 3; feed.sessionEvent('used', start(3));
    feed.finish(feed.begin('used', 'act', {}), null, Error('cancelled'));
    feed.sessionEvent('used', end(3, 'cancelled')); assert.equal(feed.snapshot().sessions[0].completion, null);
    feed.forget('used'); feed.sessionEvent('used', end(3)); assert.deepEqual(feed.snapshot().sessions, []);
    turn = 4; feed.finish(feed.begin('used', 'observe', {}), { ok: true }); feed.sessionEvent('used', end(4));
    assert.equal(feed.snapshot().sessions[0].completion.id, 'used:10');
  } finally { off(); feed.close(); }
});

test('standalone activity feeds retain their original event-only turn tracking without a native turn provider', () => {
  const feed = createActivityFeed();
  try {
    feed.sessionEvent('standalone', start(7));
    feed.finish(feed.begin('standalone', 'select', {}), { ok: true });
    feed.sessionEvent('standalone', end(7));
    assert.deepEqual(feed.snapshot().sessions[0].completion, { id: 'standalone:10', at: 1234 });
  } finally { feed.close(); }
});
