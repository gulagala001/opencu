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

test('a backend without a hand-back says so instead of pretending', async t => {
  const controller = await controllerWith({}, t);
  assert.equal((await controller.selectTarget(target.id)).ok, true);
  const response = await controller.away();
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'UNSUPPORTED_OPERATION');
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
