import test from 'node:test';
import assert from 'node:assert/strict';
import { TabCloseGuards } from '../host/tab-close-guards.ts';

test('close receipt belongs to one live occurrence and one commit', async () => {
  const controller = new AbortController(), guards = new TabCloseGuards(controller.signal);
  let commits = 0; const commit = () => { commits++; return true; };
  assert.equal(guards.close(commit), true);
  const pending = Promise.withResolvers(), release = guards.bind(() => pending.promise);
  const held = guards.close(commit); assert.equal(guards.close(commit), held);
  release(); pending.resolve(true); assert.equal(await held, false); assert.equal(commits, 1);
  const veto = guards.bind(async () => false); assert.equal(await guards.close(commit), false); veto();
  guards.bind(async () => true); assert.equal(await guards.close(commit), true);
  assert.equal(await guards.close(() => false), false); controller.abort();
  assert.equal(guards.close(commit), false); assert.equal(commits, 2);
});
