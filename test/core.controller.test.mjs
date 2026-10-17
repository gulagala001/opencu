import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/core/controller.mjs';

function nativeFixture() {
  const targets = [1, 2].map(index => ({id: `app:${index}`, kind: 'app', title: `Window ${index}`, identity: {pid: 123, windowId: index, incarnation: 'original'}}));
  const state = {targets, held: false, releaseFails: false, actions: 0, releaseCount: 0, closed: false};
  const backend = {
    async listTargets() { return state.targets; },
    async select(reference) { return state.targets.find(target => target.id === reference.id); },
    async observe(target) { return {text: target.title}; },
    async act(_target, request) { state.actions++; if (request.action === 'keyDown') state.held = true; return {action: request.action}; },
    async release() { state.releaseCount++; if (state.releaseFails) return {released: true, failures: [{key: 'Shift'}]}; state.held = false; return {released: true}; },
    async verify(target) {
      const current = state.targets.find(item => item.id === target.id);
      return {valid: !!current && JSON.stringify(target.identity) === JSON.stringify(current.identity), target: current};
    },
    async close() { state.closed = true; },
  };
  return {state, backend};
}
async function directory() { return mkdtemp(join(tmpdir(), 'opencu-core-')); }
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result; }

test('persistent multi-target controller blocks stop, retains release failure, verifies identity', async () => {
  const {state, backend} = nativeFixture();
  const dataDir = await directory();
  const controller = await createController({dataDir, browser: false, native: backend});
  assert.equal(ok(await controller.listTargets()).targets.length, 2);
  ok(await controller.selectTarget('app:1'));
  ok(await controller.selectTarget('app:2'));
  assert.equal(ok(await controller.getState()).state.targets.length, 2);
  ok(await controller.act({targetId: 'app:1', action: 'keyDown'}));
  state.releaseFails = true;
  assert.equal((await controller.stop()).error.code, 'RELEASE_FAILED');
  assert.equal(state.held, true);
  assert.equal(ok(await controller.getState()).state.mode, 'release_failed');
  assert.equal((await controller.act({targetId: 'app:1', action: 'click'})).error.code, 'CONTROL_STOPPED');
  assert.equal((await controller.resume({targetId: 'app:1'})).error.code, 'RELEASE_FAILED');
  ok(await controller.observe({targetId: 'app:1'}));
  assert.equal(ok(await controller.getState()).state.targets.find(target => target.id === 'app:1').verified, false);
  assert.equal((await controller.close()).error.code, 'RELEASE_FAILED');
  assert.equal(state.closed, false);
  state.releaseFails = false;
  ok(await controller.resume({targetId: 'app:1'}));
  assert.equal(state.held, false);
  assert.equal((await controller.act({targetId: 'app:2', action: 'click'})).error.code, 'RECOVERY_REQUIRED');
  state.targets[0] = {...state.targets[0], identity: {...state.targets[0].identity, incarnation: 'replacement'}};
  assert.equal((await controller.act({targetId: 'app:1', action: 'click'})).error.code, 'TARGET_IDENTITY_CHANGED');
  ok(await controller.close());
  assert.equal(state.closed, true);
});

test('cold recovery rejects reused target IDs and changed URL/title, never restores active control silently', async () => {
  const {state, backend} = nativeFixture();
  const dataDir = await directory();
  let controller = await createController({dataDir, browser: false, native: backend});
  ok(await controller.selectTarget('app:1'));
  ok(await controller.close());
  controller = await createController({dataDir, browser: false, native: backend});
  assert.equal(ok(await controller.getState()).state.mode, 'recovery_required');
  assert.equal((await controller.act({targetId: 'app:1', action: 'click'})).error.code, 'CONTROL_STOPPED');
  assert.equal((await controller.observe({targetId: 'app:1'})).error.code, 'RECOVERY_REQUIRED');
  state.targets[0].title = 'Different window content';
  assert.equal((await controller.resume({targetId: 'app:1'})).error.code, 'TARGET_IDENTITY_CHANGED');
  state.targets[0].title = 'Window 1';
  ok(await controller.resume({targetId: 'app:1'}));
  const activity = ok(await controller.notifyUserActivity({targetId: 'app:1', kind: 'keyboard'}));
  assert.equal(activity.state.mode, 'active');
  assert.equal(activity.state.releasePending, false);
  const observation = ok(await controller.observe({targetId: 'app:1'}));
  assert.equal(observation.userActivity.sequence, 1);
  assert.equal(observation.observedUserActivitySequence, 1);
  ok(await controller.act({targetId: 'app:1', action: 'click'}));
  ok(await controller.close());
  state.targets[0].identity.incarnation = 'reused-id';
  controller = await createController({dataDir, browser: false, native: backend});
  assert.equal((await controller.resume({targetId: 'app:1'})).error.code, 'TARGET_IDENTITY_CHANGED');
  assert.equal((await controller.selectTarget('app:1')).error.code, 'TARGET_IDENTITY_CHANGED');
  ok(await controller.close());
});

test('stop blocks already queued actions before waiting for the running action', async () => {
  const {state, backend} = nativeFixture();
  let started;
  const running = new Promise(resolve => { started = resolve; });
  backend.act = async (_target, request) => {
    state.actions++;
    started();
    await new Promise(resolve => request.signal.addEventListener('abort', resolve, {once: true}));
    return {};
  };
  const controller = await createController({dataDir: await directory(), browser: false, native: backend});
  ok(await controller.selectTarget('app:1'));
  const first = controller.act({action: 'wait'});
  await running;
  const queued = controller.act({action: 'click'});
  const stopped = controller.stop();
  assert.equal((await first).error.code, 'CONTROL_STOPPED');
  assert.equal((await queued).error.code, 'CONTROL_STOPPED');
  ok(await stopped);
  assert.equal(state.actions, 1);
  ok(await controller.close());
});

test('pending monitor capture does not block input or cancellation', async () => {
  const {state, backend} = nativeFixture();
  let finish, started;
  const capturing = new Promise(resolve => { started = resolve; });
  backend.preview = async () => { started(); return new Promise(resolve => { finish = resolve; }); };
  const controller = await createController({dataDir: await directory(), browser: false, native: backend});
  try {
    ok(await controller.selectTarget('app:1'));
    const preview = controller.preview({targetId: 'app:1'});
    await capturing;
    ok(await controller.act({targetId: 'app:1', action: 'keyDown'}));
    assert.equal(state.held, true);
    ok(await controller.stop());
    assert.equal(state.held, false);
    ok(await controller.close());
    assert.equal(state.closed, true);
    finish({dataUrl: 'data:image/png;base64,'});
    assert.equal((await preview).error.code, 'CONTROL_STOPPED');
  } finally {
    finish?.({});
    ok(await controller.close());
  }
});

test('browser-level creation selects the new occurrence and rejects unknown browsers without creation', async t => {
  const dataDir = await directory(), {state, backend} = nativeFixture();
  state.targets = []; let creations = 0, selections = 0;
  backend.listBrowsers = async () => [{id: 'browser:fixture'}];
  backend.newTab = async () => {
    const target = {id: 'tab:new', browserId: 'browser:fixture', kind: 'tab', identity: {targetId: 'created'}};
    state.targets.push(target); creations++; return target;
  };
  backend.select = async target => { selections++; return target; };
  const controller = await createController({dataDir, browser: backend});
  t.after(async () => { ok(await controller.close()); await rm(dataDir, {recursive: true, force: true}); });
  assert.deepEqual(ok(await controller.listTargets()).targets, []);
  const opened = ok(await controller.openTarget({browserId: 'browser:fixture'}));
  assert.equal(opened.target.verified, true);
  assert.equal(selections, 1);
  ok(await controller.observe({targetId: opened.target.id}));
  assert.equal((await controller.openTarget({browserId: 'missing'})).error.code, 'AMBIGUOUS_TARGET');
  assert.equal(creations, 1);
  ok(await controller.stop());
  assert.equal((await controller.openTarget({browserId: 'browser:fixture'})).error.code, 'CONTROL_STOPPED');
  assert.equal(creations, 1);
});

test('cancellation while selecting a newly created tab retains identity and cannot activate control', async t => {
  const dataDir = await directory(), {state, backend} = nativeFixture();
  state.targets = [];
  const started = Promise.withResolvers(), finish = Promise.withResolvers();
  backend.listBrowsers = async () => [{id: 'browser:fixture'}];
  backend.newTab = async () => ({id: 'tab:created', kind: 'tab', browserId: 'browser:fixture', identity: {targetId: 'created'}});
  backend.select = async target => { started.resolve(); await finish.promise; return target; };
  const controller = await createController({dataDir, browser: backend});
  t.after(async () => { finish.resolve(); ok(await controller.close()); await rm(dataDir, {recursive: true, force: true}); });
  const opening = controller.openTarget({browserId: 'browser:fixture'});
  await started.promise;
  const stopping = controller.stop(); finish.resolve();
  const result = await opening;
  assert.equal(result.error.code, 'CONTROL_STOPPED');
  assert.equal(result.error.details.created, true);
  assert.equal(result.error.details.target.id, 'tab:created');
  ok(await stopping);
  assert.equal(ok(await controller.getState()).state.targets.length, 0);
});

test('one dataDir cannot be controlled by two live controllers', async () => {
  const dataDir = await directory();
  const controller = await createController({dataDir, browser: false});
  await assert.rejects(createController({dataDir, browser: false}), error => error.code === 'DATA_DIR_LOCKED');
  ok(await controller.close());
});
