import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import plugin from '../src/dsh/index.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(read) {
  const deadline = performance.now() + 2000;
  while (performance.now() < deadline) { const value = await read(); if (value) return value; await tick(); }
  assert.fail('Expected binding stage was not reached');
}
async function fixture(t) {
  const parent = resolve('.local'); await mkdir(parent, {recursive: true});
  const dataDir = await mkdtemp(join(parent, 'binding-timeout-'));
  const target = {id: 'native:synthetic:window:42', backend: 'native', kind: 'app', platform: 'win32',
    name: 'Synthetic WebView host', pid: 21, windowId: 42, identity: {pid: 21, windowId: 42, executable: '/synthetic/webview.exe'}};
  const calls = {select: 0, observe: 0, release: 0}, hooks = {};
  const native = {
    listTargets: async () => [target], verify: async () => ({valid: true, target}),
    select: async () => { calls.select++; return target; },
    observe: async (_target, args) => {
      calls.observe++;
      if (hooks.observe) return hooks.observe(args);
      if (args.format === 'screenshot') return {screenshot: {base64: Buffer.from('synthetic pixels').toString('base64')}};
      return {ax: {nodes: [{elementId: 'synthetic-button', role: 'button', name: 'Synthetic button'}]}};
    },
    act: async () => ({}), release: async () => { calls.release++; return {released: true}; }, close: async () => {},
  };
  const ctx = new Context();
  const owner = ctx.plugin(plugin, {dataDir, native, nativeEnabled: true, browserEnabled: false, extensionEnabled: false, registerTools: false});
  await owner;
  const service = ctx.get('opencu'), sessionKey = 'synthetic-binding';
  const attachments = {saveImage: async ({name, mediaType}) => ({attachmentId: 'sha256:synthetic-pixels', name, mediaType})};
  const run = (code, timeoutMs = 1500, signal) => service.request('computer_use', {code, timeoutMs}, {sessionKey, signal, attachments});
  const pending = async () => (await service.request('appApprovals/pending', {conversationId: sessionKey})).requests;
  const accept = async () => {
    const [request] = await until(async () => { const requests = await pending(); return requests.length ? requests : null; });
    await service.request('appApprovals/respond', {conversationId: sessionKey, requestId: request.id, action: 'accept', persist: 'session'});
    return request;
  };
  const bind = async () => { const result = run(`var app = await cua.getApp(${JSON.stringify(target.id)});`); await accept(); return result; };
  t.after(async () => { hooks.observe = undefined; await owner.dispose(); await rm(dataDir, {recursive: true, force: true}); });
  await run('await cua.getState();');
  return {run, pending, accept, bind, target, calls, hooks};
}

test('the real shared tool reports approval wait separately, cancels the prompt and permits an approved retry', {timeout: 10000}, async t => {
  const f = await fixture(t);
  await assert.rejects(f.run(`await cua.getApp(${JSON.stringify(f.target.id)})`, 150), error => {
    assert.equal(error.code, 'APP_APPROVAL_TIMEOUT');
    assert.equal(error.details.stage, 'application-approval');
    assert.equal(error.details.pendingRequests[0].endpoint, 'select');
    assert.equal(error.details.pendingRequests[0].targetId, f.target.id);
    assert.ok(error.details.pendingRequests[0].requestId);
    assert.equal(error.details.inputDispatched, undefined, 'Earlier cell actions must not be labelled undispatched');
    return true;
  });
  assert.equal(f.calls.select, 0); assert.equal(f.calls.observe, 0);
  assert.deepEqual(await f.pending(), []);
  assert.equal((await f.bind()).ok, true);
  assert.ok((await f.run('app.id')).outputs.includes(f.target.id));
});

test('an initial native AX timeout retains its binding and allows a screenshot without selecting again', async t => {
  const f = await fixture(t);
  f.hooks.observe = async () => { throw Object.assign(new Error('Synthetic bounded accessibility provider timeout'), {code: 'AX_TIMEOUT'}); };
  const result = await f.bind();
  assert.equal(result.ok, true);
  assert.ok(result.outputs.some(value => value.includes('initialObservationError') && value.includes('AX_TIMEOUT')));
  const selects = f.calls.select;
  f.hooks.observe = undefined;
  const screenshot = await f.run('await app.getScreenshot();');
  assert.equal(screenshot.images.length, 1); assert.equal(f.calls.select, selects);
});

test('a stalled native observation reports its backend stage and does not become an approval timeout', async t => {
  const f = await fixture(t); await f.bind();
  const gate = Promise.withResolvers();
  f.hooks.observe = async () => gate.promise;
  try {
    await assert.rejects(f.run('await app.getAXState();', 75), error => {
      assert.equal(error.code, 'COMPUTER_TIMEOUT');
      assert.equal(error.details.stage, 'backend-request');
      assert.equal(error.details.pendingRequests[0].endpoint, 'observe');
      assert.equal(error.details.pendingRequests[0].targetId, f.target.id);
      return true;
    });
  } finally { gate.resolve({ax: {nodes: []}}); }
  assert.ok(f.calls.release > 0);
  await assert.rejects(f.run('app.id'), /app is not defined/);
});

test('JavaScript runaway still times out independently of application approval', async t => {
  const f = await fixture(t);
  await assert.rejects(f.run('while (true) {}', 75), error => {
    assert.equal(error.code, 'COMPUTER_TIMEOUT'); assert.equal(error.details.stage, 'javascript'); return true;
  });
  assert.deepEqual(await f.pending(), []);
  assert.equal((await f.run('await cua.getState();')).ok, true);
});
