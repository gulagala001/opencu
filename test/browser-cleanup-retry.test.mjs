import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBrowserBackend } from '../src/browser/backend.mjs';
import { createUserActivityMonitor } from '../src/browser/user-activity.mjs';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-browser-cleanup-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
function protocol({ registrationFailures = 0, closeFailures = 0, removalFailures = 0, disposalFailures = 0, closeGate, removalGate } = {}) {
  const state = { closed: false, closes: 0, detaches: 0, removals: 0, disposals: 0, sessions: 0 };
  const scripts = new Set();
  const original = Object.assign(new Error('Synthetic initial registration failure'), { code: 'REGISTRATION_FAILED' });
  const cleanup = Object.assign(new Error('Synthetic context cleanup failure'), { code: 'CONTEXT_CLOSE_FAILED' });
  const removal = new Error('Synthetic script removal failure');
  const disposal = new Error('Synthetic navigation during activity disposal');
  const page = Object.assign(new EventEmitter(), {
    setDefaultTimeout() {}, isClosed: () => state.closed,
    title: async () => 'Synthetic page', url: () => 'about:blank', evaluate: async () => null,
  });
  const session = Object.assign(new EventEmitter(), {
    async detach() { state.detaches++; },
    async send(method, args) {
      if (method === 'Target.getTargetInfo') {
        if (registrationFailures > 0) { registrationFailures--; throw original; }
        return { targetInfo: { targetId: 'synthetic-target', browserContextId: 'synthetic-context', title: 'Synthetic page', url: page.url() } };
      }
      if (method === 'Page.addScriptToEvaluateOnNewDocument') { scripts.add('activity-script'); return { identifier: 'activity-script' }; }
      if (method === 'Page.removeScriptToEvaluateOnNewDocument') {
        state.removals++;
        if (removalGate) await removalGate.promise;
        if (removalFailures > 0) { removalFailures--; throw removal; }
        // Removing an already removed identifier is not assumed to be idempotent.
        if (!scripts.delete(args.identifier)) throw new Error('Synthetic missing script identifier');
        return {};
      }
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'synthetic-frame' } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 1 };
      if (method === 'Runtime.evaluate') {
        if (args.expression.includes('globalThis.opencuActivity.dispose()')) {
          state.disposals++;
          if (disposalFailures > 0) { disposalFailures--; throw disposal; }
        }
        return { result: { value: null } };
      }
      return {};
    },
  });
  const context = Object.assign(new EventEmitter(), {
    browser: () => browser, pages: () => state.closed ? [] : [page],
    async newCDPSession() { state.sessions++; return session; },
    async close() {
      state.closes++;
      if (closeGate) await closeGate.promise;
      if (closeFailures > 0) { closeFailures--; throw cleanup; }
      state.closed = true;
    },
  });
  const browser = { contexts: () => [context], close: () => context.close() };
  const playwright = { chromium: { launchPersistentContext: async () => context, connectOverCDP: async () => browser } };
  return { state, scripts, context, session, playwright, original, cleanup, removal, disposal };
}

for (const mode of ['owned', 'cdp']) test(`${mode}: failed initialization cleanup stays visible and close retries the same resource`, async t => {
  const f = protocol({ registrationFailures: 1, closeFailures: 2 });
  let acquisitions = 0;
  const playwright = { chromium: {
    async launchPersistentContext() { acquisitions++; return f.context; },
    async connectOverCDP() { acquisitions++; return f.context.browser(); },
  } };
  const backend = await createBrowserBackend({ dataDir: await temporary(t), playwright,
    ...(mode === 'cdp' ? { cdpEndpoint: 'ws://synthetic.invalid/lifecycle' } : {}) });
  await assert.rejects(backend.listTargets(), error => error === f.original);
  assert.deepEqual(f.original.details.cleanup, { code: 'CONTEXT_CLOSE_FAILED', message: f.cleanup.message });
  assert.equal(f.state.closed, false);
  await assert.rejects(backend.listTargets(), error => error === f.original);
  assert.equal(acquisitions, 1, 'do not acquire another resource while failed cleanup owns the first');
  assert.equal(f.state.closes, 1);
  await assert.rejects(backend.close(), error => error === f.cleanup);
  assert.equal(f.state.closed, false, 'a failed retry must not be reported as closed');
  await backend.close();
  assert.equal(f.state.closed, true); assert.equal(f.state.closes, 3);
  await backend.close(); assert.equal(f.state.closes, 3);
});

test('successful initialization cleanup permits a clean launch retry', async t => {
  const first = protocol({ registrationFailures: 1 }), second = protocol();
  let acquisitions = 0;
  const backend = await createBrowserBackend({ dataDir: await temporary(t), playwright: { chromium: {
    async launchPersistentContext() { return ++acquisitions === 1 ? first.context : second.context; },
  } } });
  await assert.rejects(backend.listTargets(), error => error === first.original);
  assert.equal(first.state.closed, true);
  assert.equal((await backend.listTargets()).length, 1); assert.equal(acquisitions, 2);
  await backend.close(); assert.equal(second.state.closed, true);
});

test('concurrent initial inventories wait for the same failed cleanup and retain its details', async t => {
  const closeGate = deferred(), f = protocol({ registrationFailures: 1, closeFailures: 1, closeGate });
  const backend = await createBrowserBackend({ dataDir: await temporary(t), playwright: f.playwright });
  let settled = 0;
  const calls = [backend.listTargets(), backend.listTargets()].map(call => call.then(
    () => { settled++; throw new Error('Inventory should fail'); },
    error => { settled++; return error; },
  ));
  while (!f.state.closes) await new Promise(resolve => setImmediate(resolve));
  const settledBeforeCleanup = settled;
  closeGate.resolve();
  const errors = await Promise.all(calls);
  await backend.close();
  assert.equal(settledBeforeCleanup, 0, 'all callers must wait for cleanup, including concurrent initialization callers');
  assert.equal(errors[0], f.original); assert.equal(errors[1], f.original);
  assert.equal(errors[0].details.cleanup.code, 'CONTEXT_CLOSE_FAILED');
  await backend.close(); assert.equal(f.state.closed, true);
});

test('activity disposal retries only the unfinished step after script removal succeeds', async () => {
  const f = protocol({ disposalFailures: 1 }), monitor = await createUserActivityMonitor(f.session);
  await assert.rejects(monitor.dispose(), error => error === f.disposal);
  assert.equal(f.state.removals, 1); assert.equal(f.scripts.size, 0);
  await monitor.dispose(); await monitor.dispose();
  assert.equal(f.state.removals, 1); assert.equal(f.state.disposals, 2);
});

test('activity disposal preserves and retries a failed script removal', async () => {
  const f = protocol({ removalFailures: 1 }), monitor = await createUserActivityMonitor(f.session);
  await assert.rejects(monitor.dispose(), error => error === f.removal);
  assert.equal(f.state.disposals, 0); assert.equal(f.scripts.size, 1);
  await monitor.dispose();
  assert.equal(f.state.removals, 2); assert.equal(f.state.disposals, 1); assert.equal(f.scripts.size, 0);
});

test('concurrent activity disposal shares one operation and success remains idempotent', async () => {
  const removalGate = deferred(), f = protocol({ removalGate }), monitor = await createUserActivityMonitor(f.session);
  const first = monitor.dispose(), second = monitor.dispose();
  const startedRemovals = f.state.removals;
  removalGate.resolve(); const results = await Promise.allSettled([first, second]);
  assert.equal(first, second); assert.equal(startedRemovals, 1);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled']);
  await monitor.dispose();
  assert.equal(f.state.removals, 1); assert.equal(f.state.disposals, 1);
});

test('managed plugin disable and unload recover the original failed initialization cleanup', async t => {
  const f = protocol({ registrationFailures: 1, closeFailures: 1 });
  let config = { dataDir: await temporary(t), managedHeadless: true, browserEnabled: true,
    nativeEnabled: false, extensionEnabled: false, browserOptions: { playwright: f.playwright } };
  const runtime = createPluginRuntime({ getConfig: () => config });
  const initial = await runtime.request('targets');
  assert.equal(initial.targets.length, 0); assert.ok(initial.errors.length);
  config = { ...config, browserEnabled: false };
  assert.equal((await runtime.request('reconfigure')).ok, true);
  assert.equal(f.state.closed, true); assert.equal(f.state.closes, 2);
  assert.equal((await runtime.close()).ok, true);
});

test('managed plugin reconfiguration retries a partial activity disposal without losing the original error', async t => {
  const f = protocol({ disposalFailures: 1 });
  let config = { dataDir: await temporary(t), managedHeadless: true, browserEnabled: true,
    nativeEnabled: false, extensionEnabled: false, browserOptions: { playwright: f.playwright } };
  const runtime = createPluginRuntime({ getConfig: () => config });
  assert.equal((await runtime.request('targets')).targets.length, 1);
  config = { ...config, browserEnabled: false };
  await assert.rejects(runtime.request('reconfigure'), error => error.code === 'CLOSE_FAILED'
    && JSON.stringify(error.details).includes(f.disposal.message));
  assert.equal(f.state.closed, false); assert.equal(f.state.closes, 0);
  assert.equal((await runtime.request('reconfigure')).ok, true);
  assert.equal(f.state.closed, true); assert.equal(f.state.removals, 1); assert.equal(f.state.detaches, 1);
  assert.equal((await runtime.close()).ok, true);
});
