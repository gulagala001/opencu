import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../src/runtime.mjs';
import { createBrowserHost } from '../src/dsh/browser-host.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-runtime-browser-'));
  const host = createBrowserHost();
  let launches = 0, connections = 0;
  const runtime = await createRuntime({
    dataDir, nativeEnabled: false, extensionEnabled: false, dshBrowser: host.backend,
    browserOptions: { playwright: { chromium: {
      async launchPersistentContext() { launches++; throw new Error('Unexpected managed Chromium launch'); },
      async connectOverCDP() { connections++; throw new Error('Explicit CDP connection attempted'); },
    } } },
    ...options,
  });
  t.after(async () => { await runtime.close(); host.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { runtime, host, dataDir, launches: () => launches, connections: () => connections };
}

test('DSH inventory never launches a redundant managed Chromium, including with no sidebar tabs', async t => {
  const f = await fixture(t);
  const first = await f.runtime.listTargets();
  assert.equal(first.ok, true);
  assert.deepEqual(first.targets, []);
  assert.deepEqual(first.errors, []);
  assert.equal(f.launches(), 0);
  assert.equal(f.runtime.runtimeInfo.backends.browser, false);
  assert.equal(f.runtime.runtimeInfo.backends.dsh, true);
  const { rendererId } = await f.host.handle('browser/connect', {});
  await f.host.handle('browser/publish', { rendererId, targets: [{ id: 'sidebar-tab', url: 'about:blank', title: 'DSH tab', identity: { rendererId, guestId: 'guest' } }] });
  const next = await f.runtime.listTargets();
  assert.equal(next.ok, true);
  assert.deepEqual(next.targets.map(target => [target.id, target.provider]), [['sidebar-tab', 'dsh']]);
  assert.equal(f.launches(), 0);
  await assert.rejects(access(join(f.dataDir, 'browser')), { code: 'ENOENT' });
  await f.host.handle('browser/disconnect', { rendererId });
  assert.equal((await f.runtime.close()).ok, true);
  assert.equal(f.launches(), 0);
});

test('computer_use discovery uses the DSH backend without creating a managed browser profile', async t => {
  const { createPluginRuntime } = await import('../src/dsh/runtime.mjs');
  const { createComputerSession } = await import('../src/dsh/computer.mjs');
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-discovery-'));
  const host = createBrowserHost();
  const runtime = createPluginRuntime({ dataDir, nativeEnabled: false, extensionEnabled: false, dshBrowser: host.backend });
  const computer = createComputerSession((method, args) => runtime.request(method, args));
  t.after(async () => { await computer.reset(); await runtime.close(); host.close(); await rm(dataDir, { recursive: true, force: true }); });
  for (let index = 0; index < 2; index++) {
    const result = await computer.run({ code: 'await cua.getState()', title: 'Discover targets' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(result.outputs.at(-1)).targets, []);
  }
  const state = await runtime.request('state');
  assert.equal(state.service.backends.browser, false);
  assert.equal(state.service.backends.dsh, true);
  await assert.rejects(access(join(dataDir, 'browser')), { code: 'ENOENT' });
});

test('an explicit CDP endpoint still connects alongside DSH without launching Chromium', async t => {
  const f = await fixture(t, { cdpEndpoint: 'ws://127.0.0.1:1/devtools/browser/explicit' });
  const result = await f.runtime.listTargets();
  assert.equal(f.runtime.runtimeInfo.backends.browser, true);
  assert.equal(f.connections(), 1);
  assert.equal(f.launches(), 0);
  assert.match(JSON.stringify(result.errors), /Explicit CDP connection attempted/);
});

test('standalone runtime retains its managed browser backend', async t => {
  const f = await fixture(t, { dshBrowser: undefined });
  const result = await f.runtime.listTargets();
  assert.equal(f.runtime.runtimeInfo.backends.browser, true);
  assert.equal(f.launches(), 1);
  assert.match(JSON.stringify(result.errors), /Unexpected managed Chromium launch/);
});
