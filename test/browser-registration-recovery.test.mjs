import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserBackend } from '../src/browser/backend.mjs';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';
import { createUserActivityMonitor } from '../src/browser/user-activity.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'opencu-registration-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
function fixture() {
  const pages = [], sessions = [];
  const state = { launches: 0, connections: 0, contextCloses: 0, disconnects: 0, closes: [] };
  const browser = { contexts: () => [context], async close() { state.disconnects++; } };
  const context = Object.assign(new EventEmitter(), {
    browser: () => browser, pages: () => pages.filter(page => !page.isClosed()),
    async newCDPSession(page) {
      const session = Object.assign(new EventEmitter(), {
        page, detached: false, scripts: new Set(), calls: [], removals: 0, disposals: 0, detaches: 0,
        async detach() {
          this.detaches++;
          await failure('detach');
          assert.equal(this.detached, false, 'acknowledged detach must not repeat'); this.detached = true;
        },
        async send(method, args = {}) {
          assert.equal(this.detached, false, 'cannot use a detached session');
          this.calls.push({ method, args });
          await failure(method === 'Runtime.evaluate' && args.expression.includes('globalThis.opencuActivity.dispose()') ? 'dispose' : method);
          if (method === 'Target.getTargetInfo') return { targetInfo: { targetId: page.targetId, browserContextId: 'synthetic-context' } };
          if (method === 'Page.addScriptToEvaluateOnNewDocument') {
            const identifier = `activity-${sessions.length}`; this.scripts.add(identifier); return { identifier };
          }
          if (method === 'Page.removeScriptToEvaluateOnNewDocument') { this.removals++; assert(this.scripts.delete(args.identifier)); return {}; }
          if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: `${page.targetId}-frame` } } };
          if (method === 'Page.createIsolatedWorld') return { executionContextId: 1 };
          if (method === 'Runtime.evaluate') {
            if (args.expression.includes('globalThis.opencuActivity.dispose()')) this.disposals++;
            return { result: { value: null } };
          }
          if (method === 'Emulation.setFocusEmulationEnabled') return {};
          throw new Error(`Unexpected synthetic method: ${method}`);
        },
      });
      async function failure(method) {
        const fault = page.faults.get(method);
        if (fault?.gate) await fault.gate.promise;
        if (fault && fault.remaining-- > 0) throw fault.error;
      }
      sessions.push(session); return session;
    },
    async close() { state.contextCloses++; for (const page of pages) page.closeFromOwner(); },
  });
  function addPage(targetId) {
    let closed = false;
    const page = Object.assign(new EventEmitter(), {
      targetId, faults: new Map(),
      fail(method, remaining = 1, gate) {
        const error = Object.assign(new Error(`Synthetic ${method} failure: ${targetId}`), { code: 'SYNTHETIC_FAILURE' });
        this.faults.set(method, { remaining, gate, error }); return error;
      },
      setDefaultTimeout() {}, isClosed: () => closed, title: async () => targetId, url: () => 'about:blank', evaluate: async () => null,
      closeFromOwner() { closed = true; page.emit('close'); state.closes.push(targetId); },
    });
    pages.push(page); return page;
  }
  const playwright = { chromium: {
    async launchPersistentContext() { state.launches++; return context; },
    async connectOverCDP() { state.connections++; return browser; },
  } };
  return { context, pages, sessions, state, addPage, playwright };
}
async function backend(t, f, mode = 'provided') {
  return createBrowserBackend({ dataDir: await directory(t), playwright: f.playwright,
    ...(mode === 'provided' ? { context: f.context } : {}),
    ...(mode === 'cdp' ? { cdpEndpoint: 'ws://synthetic.invalid/registration' } : {}),
  });
}
function assertClean(session) {
  assert.equal(session.detached, true); assert.equal(session.scripts.size, 0);
  assert.equal(session.listenerCount('Target.receivedMessageFromTarget'), 0);
  assert.equal(session.listenerCount('Target.detachedFromTarget'), 0);
}

test('supplied initial rejection releases its session and retries without closing the external context', async t => {
  const f = fixture(), page = f.addPage('initial'), original = page.fail('Target.getTargetInfo');
  const b = await backend(t, f);
  await assert.rejects(b.listTargets(), error => error === original);
  assertClean(f.sessions[0]);
  assert.equal((await b.listTargets()).length, 1); assert.equal(f.sessions.length, 2);
  await b.close(); assertClean(f.sessions[1]);
  assert.equal(f.state.contextCloses, 0); assert.equal(f.state.disconnects, 0); assert.equal(page.isClosed(), false);
});

for (const mode of ['managed', 'cdp', 'provided']) test(`${mode} plugin recovers a failed late page without replacing healthy siblings`, async t => {
  const f = fixture(); f.addPage('healthy');
  const config = { dataDir: await directory(t), nativeEnabled: false, extensionEnabled: false, browserEnabled: true,
    browserOptions: { playwright: f.playwright, ...(mode === 'provided' ? { context: f.context } : {}) },
    ...(mode === 'cdp' ? { cdpEndpoint: 'ws://synthetic.invalid/registration' } : {}),
  };
  const runtime = createPluginRuntime({ getConfig: () => config });
  const first = await runtime.request('targets'); assert.equal(first.targets.length, 1);
  const page = f.addPage('late'); page.fail('Target.getTargetInfo');
  f.context.emit('page', page); await tick();
  const recovered = await runtime.request('targets');
  assert.equal(recovered.targets.length, 2); assert.deepEqual(recovered.errors, []);
  assert.equal(recovered.targets.find(target => target.title === 'healthy').id, first.targets[0].id);
  assert.equal(f.sessions.length, 3); assertClean(f.sessions[1]); assert.equal(f.sessions[0].detached, false);
  assert.equal((await runtime.close()).ok, true);
  for (const session of f.sessions) assertClean(session);
  assert.equal(f.state.contextCloses, mode === 'managed' ? 1 : 0);
  assert.equal(f.state.disconnects, mode === 'cdp' ? 1 : 0);
  assert.equal(f.state.launches, mode === 'managed' ? 1 : 0);
  assert.equal(f.state.connections, mode === 'cdp' ? 1 : 0);
});

for (const method of ['Page.getFrameTree', 'Page.createIsolatedWorld', 'Runtime.evaluate']) test(`partial activity failure in ${method} cleans script, router, and session before retry`, async t => {
  const f = fixture(), page = f.addPage('partial'), original = page.fail(method);
  const b = await backend(t, f);
  await assert.rejects(b.listTargets(), error => error === original);
  const failed = f.sessions[0]; assertClean(failed); assert.equal(failed.removals, 1);
  const disposal = failed.calls.find(call => call.method === 'Runtime.evaluate' && call.args.expression.includes('globalThis.opencuActivity.dispose()'));
  assert(disposal); assert.equal(disposal.args.expression.includes('function installMonitor'), false, 'cleanup must not install another monitor');
  assert.equal((await b.listTargets()).length, 1); await b.close();
  assert.equal(f.state.contextCloses, 0); assert.equal(f.state.disconnects, 0);
});

for (const method of ['Page.removeScriptToEvaluateOnNewDocument', 'dispose', 'detach']) test(`failed rollback ${method} remains retryable and concurrent inventory shares one recovery`, async t => {
  const f = fixture(), page = f.addPage('rollback'), original = page.fail('Page.getFrameTree');
  const cleanupError = page.fail(method, 2), b = await backend(t, f);
  await assert.rejects(b.listTargets(), error => error === original && error.details.cleanup.message === cleanupError.message);
  assert.equal(f.sessions.length, 1); assert.equal(f.sessions[0].detached, false);
  await assert.rejects(b.listTargets(), error => error === original && error.details.cleanup.message === cleanupError.message);
  assert.equal(f.sessions.length, 1, 'another rollback failure must not create a replacement session');
  const results = await Promise.all([b.listTargets(), b.listTargets(), b.listTargets()]);
  for (const result of results) assert.equal(result.length, 1);
  assert.equal(f.sessions.length, 2, 'do not start a replacement until the failed rollback is acknowledged');
  const failed = f.sessions[0]; assertClean(failed); assert.equal(failed.removals, 1);
  assert.equal(failed.detaches, method === 'detach' ? 3 : 1);
  await b.close(); assertClean(f.sessions[1]);
});

test('close retries a failed uncommitted registration cleanup without reacquiring or closing caller resources', async t => {
  const f = fixture(), page = f.addPage('detach'), original = page.fail('Target.getTargetInfo');
  const cleanupError = page.fail('detach', 2), b = await backend(t, f);
  await assert.rejects(b.listTargets(), error => error === original);
  await assert.rejects(b.close(), error => error === cleanupError);
  assert.equal(f.sessions.length, 1); assert.equal(f.sessions[0].detached, false);
  await b.close(); assertClean(f.sessions[0]); assert.equal(f.sessions[0].detaches, 3);
  assert.equal(f.state.contextCloses, 0); assert.equal(f.state.disconnects, 0);
});

test('close waits for in-flight activity setup before disposing and prevents a late registration commit', async t => {
  const f = fixture(), page = f.addPage('pending'), gate = deferred();
  page.fail('Runtime.evaluate', 0, gate);
  const b = await backend(t, f), inventory = b.listTargets();
  const rejected = assert.rejects(inventory, error => error.code === 'BACKEND_CLOSING');
  while (!f.sessions[0]?.calls.some(call => call.method === 'Runtime.evaluate')) await tick();
  let settled = false;
  const close = b.close().then(() => { settled = true; });
  await tick(); const settledEarly = settled, earlyRemovals = f.sessions[0].removals;
  gate.resolve(); await Promise.all([rejected, close]);
  assert.equal(settledEarly, false); assert.equal(earlyRemovals, 0); assertClean(f.sessions[0]);
  assert.equal(f.context.listenerCount('page'), 0);
  await assert.rejects(b.listTargets(), error => error.code === 'BACKEND_CLOSED');
});

test('activity initialization exposes the cleanup handle before evaluating the current document', async () => {
  const f = fixture(), page = f.addPage('handle'), original = page.fail('Page.getFrameTree');
  const session = await f.context.newCDPSession(page);
  let handle;
  await assert.rejects(createUserActivityMonitor(session, { onAcquire: value => { handle = value; } }), error => error === original);
  assert(handle); assert.equal(session.scripts.size, 1);
  await handle.dispose(); assert.equal(session.scripts.size, 0); assert.equal(session.removals, 1);
});

test('a target-close cleanup rejection stays visible instead of treating local page closure as remote acknowledgement', async t => {
  const f = fixture(), page = f.addPage('closed-during-setup'), gate = deferred();
  page.fail('Runtime.evaluate', 0, gate);
  const cleanupError = page.fail('Page.removeScriptToEvaluateOnNewDocument', Infinity);
  const b = await backend(t, f), inventory = b.listTargets();
  const rejected = assert.rejects(inventory, error => error.code === 'TARGET_CLOSED' && error.details.cleanup.message === cleanupError.message);
  while (!f.sessions[0]?.calls.some(call => call.method === 'Runtime.evaluate')) await tick();
  page.closeFromOwner(); gate.resolve(); await rejected;
  await assert.rejects(b.close(), error => error === cleanupError);
  assert.equal(f.sessions[0].detached, false); assert.equal(f.sessions[0].scripts.size, 1);
  assert.equal(f.state.contextCloses, 0); assert.equal(f.state.disconnects, 0);
  // Only an acknowledged protocol recovery allows successful shutdown in this fixture.
  page.faults.delete('Page.removeScriptToEvaluateOnNewDocument');
  await b.close(); assertClean(f.sessions[0]);
});
