import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { desktopBrowserHost, resolveDesktopBrowserHost, DesktopBrowserCompatibilityError } from '../src/client/host-compat.mjs';
import build from '../src/client/host-target.mjs';
import { createAppApprovals } from '../src/dsh/app-approvals.mjs';

const capabilities = ['artifactDocuments', 'tabCloseGuards', 'browserSurfaces', 'presentationSessions',
  'presentationHitRegions', 'backgroundInput', 'structuredErrors', 'initialNavigation'];
const methods = ['acquireOpenCU', 'release', 'onOpenRequested', 'downloads', 'permissions', 'automation',
  'extensions', 'profile', 'presentation', 'files', 'onPresentationEvent', 'onExtensionEvent', 'surface', 'onSurfaceEvent'];
function install(t, browser) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'dshDesktop');
  Object.defineProperty(globalThis, 'dshDesktop', { configurable: true, value: { browser } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'dshDesktop', previous) : delete globalThis.dshDesktop);
}
function compatible(calls) {
  return { openCU: { revision: 2, hostVersion: build.version, capabilities: [...capabilities] },
    ...Object.fromEntries(methods.map(name => [name, async () => {
      calls.push(name); return { opencuReply: 1, ok: true, value: name };
    }])) };
}

test('ordinary web has no desktop bridge and no compatibility error', t => {
  install(t, undefined);
  assert.deepEqual(resolveDesktopBrowserHost(), { desktop: undefined, error: null });
});

test('stock DSH browser bridge resolves unavailable without throwing from the client probe', t => {
  let calls = 0;
  // Official rc.2 preload-browser exposes these three operations, without OpenCU extensions.
  const browser = Object.fromEntries(['acquire', 'release', 'onOpenRequested'].map(name => [name, () => { calls++; }]));
  install(t, browser);
  assert.throws(desktopBrowserHost, /matching desktop host adapter/);
  assert.throws(desktopBrowserHost, error => error instanceof DesktopBrowserCompatibilityError && error.code === 'DESKTOP_ADAPTER_INCOMPATIBLE');
  const result = resolveDesktopBrowserHost();
  assert.equal(result.desktop, undefined);
  assert.match(result.error, /matching desktop host adapter/);
  assert.equal(calls, 0, 'Do not attempt to use the stock bridge as an older protocol');
});

for (const [name, invalidate, pattern] of [
  ['wrong revision', value => { value.openCU.revision = 1; }, /matching desktop host adapter/],
  ['wrong host version', value => { value.openCU.hostVersion = '0.0.0'; }, /matching desktop host adapter/],
  ['missing capability', value => { value.openCU.capabilities.splice(0, 1); }, /artifactDocuments/],
  ['missing operation', value => { delete value.surface; }, /surface/],
]) test(`${name} remains disabled with an explicit diagnostic and no bridge calls`, t => {
  const calls = [], browser = compatible(calls); invalidate(browser); install(t, browser);
  assert.throws(desktopBrowserHost, pattern);
  const result = resolveDesktopBrowserHost();
  assert.equal(result.desktop, undefined); assert.match(result.error, pattern); assert.deepEqual(calls, []);
});

test('a compatible bridge retains structured IPC validation', async t => {
  const calls = [], browser = compatible(calls); install(t, browser);
  const { desktop, error } = resolveDesktopBrowserHost();
  assert.equal(error, null); assert.deepEqual(calls, []);
  assert.equal(await desktop.automation(), 'automation');
  assert.equal(await desktop.surface(), 'surface');
  browser.surface = async () => ({ ok: true, value: 'unverified' });
  await assert.rejects(desktop.surface(), /matching desktop adapter/);
});

test('unexpected desktop getter failures preserve the original error and stack', t => {
  install(t, undefined);
  const error = new TypeError('Unexpected desktop getter failure');
  const stack = error.stack;
  Object.defineProperty(globalThis, 'dshDesktop', { configurable: true, get() { throw error; } });
  assert.throws(resolveDesktopBrowserHost, actual => actual === error && actual.stack === stack);
});

test('unexpected internal validation TypeErrors are not treated as incompatible adapters', t => {
  const calls = [], browser = compatible(calls);
  const error = new TypeError('Unexpected capability validation failure');
  const stack = error.stack;
  browser.openCU.capabilities = { includes() { throw error; } };
  install(t, browser);
  assert.throws(resolveDesktopBrowserHost, actual => actual === error && actual.stack === stack);
  assert.deepEqual(calls, []);
});

test('unsupported browser integration never grants native application access', async t => {
  install(t, {});
  assert.equal(resolveDesktopBrowserHost().desktop, undefined);
  const directory = await mkdtemp(join(tmpdir(), 'opencu-native-approval-'));
  const approvals = createAppApprovals(() => directory);
  t.after(async () => { await approvals.close(); await rm(directory, { recursive: true, force: true }); });
  let settled = false;
  const pending = approvals.authorize({ id: 'native:synthetic:window:1', backend: 'native', name: 'Synthetic app',
    identity: { executable: 'C:\\Synthetic\\test.exe' } }, 'owner').then(() => { settled = true; });
  const deadline = Date.now() + 1000;
  while (!approvals.pending('owner').length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  const requests = approvals.pending('owner');
  assert.equal(requests.length, 1); assert.equal(settled, false);
  assert.deepEqual(approvals.pending('other'), []);
  await assert.rejects(approvals.respond({ conversationId: 'other', requestId: requests[0].id, action: 'accept', persist: 'session' }), /no longer pending/);
  assert.equal(settled, false);
  // Synthetic explicit user response, never an automatic fallback from host incompatibility.
  await approvals.respond({ conversationId: 'owner', requestId: requests[0].id, action: 'accept', persist: 'session' });
  await pending; assert.equal(settled, true);
  assert.deepEqual(await approvals.read(), { approvedApps: [] });
});

test('client source wires the safe probe, retained approval/settings slots and visible diagnostic', async () => {
  const source = await readFile(new URL('../src/client/index.jsx', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../src/client/capability-settings.jsx', import.meta.url), 'utf8');
  assert.match(source, /const \{ desktop, error: desktopAdapterError \} = resolveDesktopBrowserHost\(\)/);
  assert.match(source, /inAppBrowser: host\.service\.available, desktopAdapterError/);
  assert.match(source, /name: 'settings\.section', id: 'opencu-capabilities'/);
  assert.match(source, /name: 'tool\.call\.toolview', key/);
  assert.match(settings, /state\.desktopAdapterError \|\| text\('desktopRequired'/);
});
