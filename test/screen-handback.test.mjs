import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/core/controller.mjs';

// A session that stops to ask the user something is still running, but the user cannot
// answer a question they cannot see: the screen goes back to the chat window while the
// selection stays. A turn that ends has finished with the desktop, so the takeover ends.

const target = {id: 'fixture', kind: 'app', platform: 'linux', identity: {pid: 1, windowId: 1}};

async function controllerWith(backend, t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-away-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  const controller = await createController({dataDir, native: {...{
    async listTargets() { return [target]; }, async select() { return target; }, async observe() { return {}; },
    async verify() { return {valid: true, target}; }, async close() {}, async release() { return {released: true}; },
    async act() { return {}; },
  }, ...backend}, browser: false});
  t.after(() => controller.close());
  return controller;
}

test('handing the screen back keeps the selection and the session active', async t => {
  const calls = [];
  const controller = await controllerWith({async away(value) { calls.push(value); return true; }}, t);
  assert.equal((await controller.selectTarget(target.id)).ok, true);
  const response = await controller.away();
  assert.equal(response.ok, true);
  assert.equal(response.away, true, 'the backend reported the hand-back');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, target.id, 'the hand-back names the selected target');
  const state = (await controller.getState()).state;
  assert.equal(state.mode, 'active', 'a hand-back is not an error and not an ending');
  assert.equal(state.activeTargetId, target.id, 'the selection survives so work resumes without reselecting');
});

// X11, portal Wayland, macOS and Windows never move the user's view, so a turn end there has
// nothing to give back. Reporting an error would make every such turn look like a failure.
test('a backend without a hand-back is a quiet no-op', async t => {
  const controller = await controllerWith({}, t);
  assert.equal((await controller.selectTarget(target.id)).ok, true);
  const response = await controller.away();
  assert.equal(response.ok, true);
  assert.equal(response.away, false);
  assert.equal((await controller.getState()).state.activeTargetId, target.id, 'the selection is untouched');
});

test('handing back with nothing selected is a no-op', async t => {
  const calls = [];
  const controller = await controllerWith({async away() { calls.push(1); return true; }}, t);
  const response = await controller.away();
  assert.equal(response.ok, true);
  assert.equal(response.away, false);
  assert.equal(calls.length, 0, 'no target means no desktop to give back');
});

test('ending a turn hands the whole desktop back but keeps the selection', async t => {
  const calls = [];
  const controller = await controllerWith({async away(value, options) { calls.push(options); return true; }}, t);
  assert.equal((await controller.selectTarget(target.id)).ok, true);
  const response = await controller.away({relinquish: true});
  assert.equal(response.ok, true);
  assert.equal(response.relinquish, true);
  assert.deepEqual(calls, [{relinquish: true}]);
  const state = (await controller.getState()).state;
  assert.equal(state.mode, 'active', 'the session is paused, not stopped: no reselecting next turn');
  assert.equal(state.activeTargetId, target.id);
});

test('a hand-back checks its owner inside the serial input lane', async t => {
  const calls = [];
  let enter, finish;
  const entered = new Promise(resolve => { enter = resolve; });
  const wait = new Promise(resolve => { finish = resolve; });
  const controller = await controllerWith({
    async act() { enter(); await wait; return {}; },
    async away() { calls.push('away'); return true; },
  }, t);
  await controller.selectTarget(target.id);
  const action = controller.act({targetId: target.id, action: 'click'});
  await entered;
  let current = true;
  const handBack = controller.away({relinquish: true}, {isCurrent: () => current});
  current = false;
  finish();
  assert.equal((await action).ok, true);
  assert.equal((await handBack).away, false);
  assert.deepEqual(calls, []);
});

test('failed hand-back blocks input until release recovery succeeds', async t => {
  const controller = await controllerWith({async away() { throw Object.assign(new Error('synthetic failure'), {code: 'RELEASE_FAILED'}); }}, t);
  await controller.selectTarget(target.id);
  const response = await controller.away({relinquish: true});
  assert.equal(response.error.code, 'RELEASE_FAILED');
  assert.equal((await controller.getState()).state.mode, 'faulted');
});
