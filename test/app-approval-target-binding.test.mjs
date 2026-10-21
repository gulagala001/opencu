import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';

// Production runtime, approvals and controller, with no OS input or app launch.
async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-approval-target-'));
  const targets = ['A', 'B'].map(name => ({id: `native:${name}`, backend: 'native', name, title: name,
    identity: {executable: `/synthetic/${name}`, pid: name}}));
  const calls = [];
  const native = {
    listTargets: async () => targets,
    select: async target => target,
    verify: async target => {
      const current = targets.find(item => item.id === target.id);
      return {valid: !!current, target: current};
    },
    observe: async target => { calls.push(['observe', target.id]); return {ax: {nodes: []}}; },
    act: async target => { calls.push(['act', target.id]); return {}; },
    release: async () => ({released: true}), close: async () => {},
  };
  const runtime = createPluginRuntime({dataDir, native, browserEnabled: false, extensionEnabled: false});
  const request = (endpoint, args, sessionKey = 'setup') => runtime.request(endpoint, args, {sessionKey});
  async function approval(sessionKey) {
    for (let i = 0; i < 100; i++) {
      const {requests} = await request('appApprovals/pending', {conversationId: sessionKey});
      if (requests.length) return requests[0];
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('Approval did not appear');
  }
  const accept = async sessionKey => request('appApprovals/respond', {conversationId: sessionKey,
    requestId: (await approval(sessionKey)).id, action: 'accept', persist: 'session'});
  const select = async index => {
    const work = request('select', {reference: {id: targets[index].id}});
    await accept('setup'); assert.equal((await work).ok, true);
  };
  t.after(async () => { await runtime.close(); await rm(dataDir, {recursive: true, force: true}); });
  return {targets, calls, request, approval, accept, select};
}

for (const endpoint of ['act', 'observe']) test(`${endpoint} keeps the application approved before another session changes selection`, async t => {
  const f = await fixture(t);
  await f.select(0);
  const pending = f.request(endpoint, endpoint === 'act' ? {action: 'type', text: 'A only'} : {format: 'ax'}, 'session-A');
  assert.equal((await f.approval('session-A')).targetId, 'native:A');
  await f.select(1);
  await f.accept('session-A');
  assert.equal((await pending).ok, true);
  assert.deepEqual(f.calls, [[endpoint, 'native:A']]);
});

test('approval cannot retarget a broad selection reference to a new application', async t => {
  const f = await fixture(t);
  const pending = f.request('select', {reference: {title: 'A'}}, 'session-A');
  await f.approval('session-A');
  f.targets.shift(); f.targets[0].title = 'A';
  await f.accept('session-A');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TARGET_NOT_FOUND');
  assert.equal((await f.request('state')).state.activeTargetId, null);
});

test('a reused target identity after approval is rejected before input dispatch', async t => {
  const f = await fixture(t);
  await f.select(0);
  const pending = f.request('act', {action: 'type', text: 'never'}, 'session-A');
  await f.approval('session-A');
  f.targets[0] = {...f.targets[0], identity: {...f.targets[0].identity, pid: 'replacement'}};
  await f.accept('session-A');
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TARGET_IDENTITY_CHANGED');
  assert.deepEqual(f.calls, []);
});

test('a stale caller identity cannot use the current application’s cached approval', async t => {
  const f = await fixture(t);
  await f.select(0);
  const result = await f.request('act', {targetId: 'native:A', targetIdentity: {pid: 'retired'},
    action: 'type', text: 'never'}, 'setup').then(value => ({value}), error => ({error}));
  assert.equal(result.error?.code, 'TARGET_IDENTITY_CHANGED');
  assert.deepEqual(f.calls, []);
  assert.deepEqual((await f.request('appApprovals/pending', {conversationId: 'setup'})).requests, []);
});
