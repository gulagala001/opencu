import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(process.argv[2]), sdk = resolve(process.argv[3]);
const require = createRequire(join(sdk, 'package.json'));
const ts = require('typescript');
const output = join(root, 'opencu-policy');
await mkdir(output, { recursive: true });
// Execute the actual patched owner/lease guards; fake only Electron's unavailable external host process.
const guestSource = await readFile(join(root, 'apps/desktop/src/browser-guests.ts'), 'utf8');
for (const [name, source] of [['browser-guests', guestSource], ['opencu-guest-adapter', await readFile(join(root, 'apps/desktop/src/opencu-guest-adapter.ts'), 'utf8')], ['opencu-permissions', await readFile(join(root, 'apps/desktop/src/opencu-permissions.ts'), 'utf8')]]) {
  await writeFile(join(output, name + '.cjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.CommonJS } }).outputText);
}
const check = `
const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
const sessions = new Map();
function makeSession() { return { extensions: { getExtension(id) { return id === 'installed' ? {} : null; } }, setPermissionRequestHandler(){}, setPermissionCheckHandler(){}, setDevicePermissionHandler(){}, setDisplayMediaRequestHandler(){}, on(){}, webRequest: { onBeforeRequest(handler) { this.before = handler; } } }; }
Module._load = function(name, parent, main) {
  if (name === 'electron') return { app: { isPackaged: true }, session: { fromPartition(name) { if (!sessions.has(name)) sessions.set(name, makeSession()); return sessions.get(name); } } };
  if (name === './opencu-guest-adapter.ts') return load.call(this, './opencu-guest-adapter.cjs', parent, main);
  if (name === './opencu-permissions.ts') return load.call(this, './opencu-permissions.cjs', parent, main);
  if (name === './opencu-extensions.ts') return { prepareOpenCUExtensions() {}, attachOpenCUExtensionGuest() {}, operateOpenCUExtensions() {} };
  if (name === './opencu-downloads.ts') return { openCUDownloadOperation(lease, operation, args) { if (operation === 'configure') lease.downloadDirectory = args.directory; return Promise.resolve(true); }, captureOpenCUDownload(lease) { return !!lease.downloadDirectory; } };
  if (name === './opencu-profile.ts') return { operateOpenCUProfile: async () => true };
  if (name === './opencu-automation.ts') return { openCUAutomation: async () => true };
  if (name === './ipc.ts') return { DESKTOP_IPC: {} };
  return load.apply(this, arguments);
};
const { DesktopBrowserGuests } = require('./browser-guests.cjs');
(async () => {
  const owner = { isDestroyed: () => false }, other = { isDestroyed: () => false };
  const guests = new DesktopBrowserGuests(() => 'http://127.0.0.1:12345/');
  const normal = guests.acquire(owner, 'workspace');
  assert.throws(() => guests.operateOpenCU(owner, normal.lease, 'profile', 'summary', {}));
  const reservation = guests.acquireOpenCU(owner);
  assert.throws(() => guests.operateOpenCU(other, reservation.lease, 'profile', 'summary', {}));
  assert.throws(() => guests.operateOpenCU(owner, 'missing', 'profile', 'summary', {}));
  assert.throws(() => guests.operateOpenCU(owner, reservation.lease, 'automation', 'observe', {}));
  assert.equal(await guests.operateOpenCU(owner, reservation.lease, 'profile', 'summary', {}), true);
  await guests.operateOpenCU(owner, reservation.lease, 'downloads', 'configure', { directory: '/owned-downloads' });
  assert.equal(guests.leases.get(reservation.lease).openCU.downloadDirectory, '/owned-downloads');
  let result;
  const evaluate = (value, url) => { value.webRequest.before({ url }, reply => { result = reply.cancel }); return result; };
  assert.equal(evaluate(sessions.get(normal.partition), 'http://localhost:12345/api/private'), true);
  assert.equal(evaluate(sessions.get(normal.partition), 'chrome-extension://installed/page.html'), true);
  assert.equal(evaluate(sessions.get(normal.partition), 'https://example.com/'), false);
  const profile = sessions.get(reservation.partition);
  assert.equal(evaluate(profile, 'http://127.0.0.1:12345/api/private'), true);
  assert.equal(evaluate(profile, 'file:///private/file'), true);
  assert.equal(evaluate(profile, 'chrome-extension://missing/page.html'), true);
  assert.equal(evaluate(profile, 'chrome-extension://installed/page.html'), false);
  const { EventEmitter } = require('node:events');
  const contents = new EventEmitter();
  contents.isDestroyed = () => false; contents.getURL = () => 'https://example.com/'; contents.session = profile;
  const live = guests.leases.get(reservation.lease); live.attached = true; live.guest = contents;
  const identity = { conversationId: 'session', browserTabId: 'tab', mountGeneration: 1 };
  await guests.operateOpenCU(owner, reservation.lease, 'permissions', 'configure', identity);
  let allowed;
  const permissions = guests.openCU.permissions;
  permissions.request(contents, 'geolocation', value => { allowed = value; }, { requestingUrl: 'https://example.com/' });
  const [prompt] = await guests.operateOpenCU(owner, reservation.lease, 'permissions', 'list', {});
  await guests.operateOpenCU(owner, reservation.lease, 'permissions', 'configure', { ...identity, mountGeneration: 2 });
  assert.equal(await guests.operateOpenCU(owner, reservation.lease, 'permissions', 'respond', { ...identity, id: prompt.id, action: 'allow-this-time' }), false);
  assert.equal(await guests.operateOpenCU(owner, reservation.lease, 'permissions', 'respond', { ...identity, mountGeneration: 2, id: prompt.id, action: 'allow-this-time' }), true);
  assert.equal(allowed, true);
  assert.equal(permissions.check(contents, 'geolocation', 'https://example.com/'), true);
  assert.equal(permissions.check(contents, 'geolocation', 'https://another.example/'), false);
  await assert.rejects(async () => guests.operateOpenCU(owner, reservation.lease, 'permissions', 'configure', { ...identity, browserTabId: 'different' }));
  permissions.request(contents, 'notifications', value => { allowed = value; }, { requestingUrl: 'https://example.com/' });
  guests.openCU.release(live);
  assert.equal(allowed, false); assert.equal(permissions.guests.size, 0);
  delete live.guest;
  await guests.release(other, reservation.lease).then(() => assert.fail('foreign release succeeded'), () => {});
  await guests.release(owner, reservation.lease);
  assert.throws(() => guests.operateOpenCU(owner, reservation.lease, 'profile', 'summary', {}));
  console.log('Patched DesktopBrowserGuests rejects wrong owner, ordinary/stale/unattached lease; application/file/unknown-extension requests remain denied; permission prompts reject stale mount/changed target and deny on release; release invalidates only its reservation');
})().catch(error => { console.error(error); process.exitCode = 1; });
`;
await writeFile(join(output, 'check.cjs'), check);
const result = spawnSync(process.execPath, [join(output, 'check.cjs')], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
// This check cannot execute Electron windows or permissions; check-host covers their real types.
