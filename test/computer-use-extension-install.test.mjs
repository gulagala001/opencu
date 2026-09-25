import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExtensionInstaller } from '../src/computer-use/extension-install.mjs';
import { ExtensionHub, extensionSocketPath } from '../src/computer-use/extension-hub.mjs';

async function installerFor(t) {
  const root = await mkdtemp(join(tmpdir(), "trisoul-cu-install-中文-'"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'); await cp(new URL('../browser-extension', import.meta.url), source, { recursive: true });
  const installer = new ExtensionInstaller(join(root, 'runtime'), join(root, 'bridge.sock'), { source, chromeUserDataDir: join(root, 'chrome') });
  return { installer, root, source };
}

test('Chrome setup prepares an owned, versioned bridge and detects repaired or updated files', { skip: process.platform === 'win32' }, async t => {
  const { installer, source } = await installerFor(t);
  assert.equal((await installer.status()).prepared, false);
  const results = await Promise.all([installer.prepare(), installer.prepare()]);
  assert.ok(results.every(result => result.prepared && !result.preparing));
  const initial = await installer.status(), before = await stat(installer.launcher);
  const registration = JSON.parse(await readFile(installer.registration, 'utf8'));
  assert.deepEqual(registration.allowed_origins, ['chrome-extension://' + initial.extensionId + '/']);
  assert.equal(registration.path, installer.launcher);
  assert.equal((await stat(installer.launcher)).mode & 0o777, 0o700);
  await installer.prepare(); assert.equal((await stat(installer.launcher)).mtimeMs, before.mtimeMs);
  assert.equal((await installer.status([{ build: initial.build }])).reloadRequired, false);
  await writeFile(join(installer.extensionPath, 'popup.js'), 'damaged fixture');
  assert.equal((await installer.status()).prepared, false);
  await installer.prepare(); assert.equal((await installer.status()).prepared, true);
  await writeFile(join(source, 'popup.js'), (await readFile(join(source, 'popup.js'), 'utf8')) + '\n// fixture update\n');
  assert.equal((await installer.status()).updateAvailable, true);
  await installer.prepare();
  const updated = await installer.status([{ build: initial.build }]);
  assert.notEqual(updated.build, initial.build); assert.equal(updated.reloadRequired, true);
  assert.match(await readFile(join(installer.extensionPath, 'worker.js'), 'utf8'), new RegExp(updated.build));
});

test('Chrome setup preserves another instance registration', { skip: process.platform === 'win32' }, async t => {
  const { installer } = await installerFor(t);
  await mkdir(join(installer.profile, 'NativeMessagingHosts'), { recursive: true });
  const other = JSON.stringify({ name: 'ai.trisoul.computer_use', path: '/another/trisoul/native-host' });
  await writeFile(installer.registration, other);
  await assert.rejects(installer.prepare(), /其他实例/);
  assert.equal(await readFile(installer.registration, 'utf8'), other);
  assert.equal((await installer.status()).prepared, false);
});

test('a fresh installation migrates our old registration, preserves its extension path and prevents startup stealing it back', { skip: process.platform === 'win32' }, async t => {
  const { installer: old, root, source } = await installerFor(t);
  await old.prepare();
  const next = new ExtensionInstaller(join(root, 'next'), join(root, 'next.sock'), { source, chromeUserDataDir: old.profile });
  await next.prepare();
  assert.equal((await next.status()).prepared, true);
  assert.equal(next.extensionPath, old.extensionPath);
  assert.equal(JSON.parse(await readFile(old.receipt, 'utf8')).supersededBy, next.launcher);
  assert.equal(JSON.parse(await readFile(join(next.directory, 'connection-backup.json'), 'utf8')).registration.path, old.launcher);
  await assert.rejects(old.prepare(), /迁移/);
  assert.equal(JSON.parse(await readFile(next.registration, 'utf8')).path, next.launcher);
  const restarted = new ExtensionInstaller(join(root, 'next'), join(root, 'next.sock'), { source, chromeUserDataDir: old.profile });
  assert.equal((await restarted.status()).extensionPath, old.extensionPath);
  await old.prepare({ takeover: true });
  assert.equal((await old.status()).prepared, true);
  await assert.rejects(next.prepare(), /迁移/);
});

test('migration does not trust a matching host name without an owned receipt and matching extension identity', { skip: process.platform === 'win32' }, async t => {
  const { installer: old, root, source } = await installerFor(t); await old.prepare();
  const record = JSON.parse(await readFile(old.receipt, 'utf8'));
  await writeFile(old.receipt, JSON.stringify({ ...record, extensionId: 'unrelated' }));
  const before = await readFile(old.registration);
  const next = new ExtensionInstaller(join(root, 'next'), join(root, 'next.sock'), { source, chromeUserDataDir: old.profile });
  await assert.rejects(next.prepare({ takeover: true }), /其他实例/);
  assert.deepEqual(await readFile(old.registration), before);
});

test('live Chrome automatically leaves the old installation and connects to the new owner without losing tabs', { timeout: process.platform === 'win32' ? 180000 : 30000 }, async t => {
  let next, hub;
  t.after(async () => { await next?.unregister(); await hub?.close(); });
  const { extensionFixture } = await import('./fixtures/computer-use/extension.mjs');
  const env = await extensionFixture(t, { install: true, args: ['--password-store=basic', '--use-mock-keychain'] });
  const page = await env.context.newPage(); await page.goto(env.fixture.url);
  await page.evaluate(() => localStorage.setItem('migration', 'keep'));
  const target = (await env.hub.call(env.browser.id, 'tabs.list')).find(tab => tab.url === env.fixture.url + '/');
  const leaseId = 'migration-input-lease';
  await env.hub.call(env.browser.id, 'attach', { tabId: Number(target.id), leaseId });
  await page.evaluate(() => { window.migrationKeyUps = []; addEventListener('keyup', event => migrationKeyUps.push(event.code)); });
  await env.hub.call(env.browser.id, 'command', { tabId: Number(target.id), leaseId, method: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 } });
  const directory = join(env.root, 'next'), socket = extensionSocketPath(directory);
  next = new ExtensionInstaller(directory, socket, { source: env.installer.source, chromeUserDataDir: env.installer.profile, hostName: env.installer.hostName });
  await next.windows?.ensure();
  hub = new ExtensionHub(socket, { windowsRuntime: next.windows }); await hub.start();
  await next.prepare();
  for (let i = 0; i < 100 && (!hub.list().length || env.hub.list().length); i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(env.hub.list().length, 0, 'old bridge disconnected');
  assert.equal(hub.list().length, 1, 'browser reconnected automatically');
  assert.equal(next.extensionPath, env.installer.extensionPath, 'Chrome keeps its loaded directory');
  assert.equal((await next.status(hub.list())).reloadRequired, false);
  assert.equal(await page.evaluate(() => localStorage.getItem('migration')), 'keep');
  assert.ok((await page.evaluate(() => migrationKeyUps)).includes('ShiftLeft'), 'held input is released before switching owners');
  assert.ok((await hub.call(hub.list()[0].id, 'tabs.list')).some(tab => tab.url === env.fixture.url + '/'));
  await env.popup.getByRole('button', { name: '断开连接', exact: true }).click();
  await env.popup.getByRole('button', { name: '连接 Oh My DSH', exact: true }).waitFor();
  await new Promise(resolve => setTimeout(resolve, 750));
  assert.equal(hub.list().length, 0, 'explicit disconnect is never undone by reconnect');
});

test('desktop Electron runtime starts the native bridge as Node', { skip: process.platform !== 'darwin' || !process.env.OPENCU_ELECTRON_EXECUTABLE, timeout: 30000 }, async t => {
  const { extensionFixture } = await import('./fixtures/computer-use/extension.mjs');
  const env = await extensionFixture(t, { install: true, nodePath: process.env.OPENCU_ELECTRON_EXECUTABLE, args: ['--password-store=basic', '--use-mock-keychain'] });
  assert.equal(env.hub.list().length, 1);
  assert.equal((await env.installer.status(env.hub.list())).prepared, true);
});

test('a failed first Chrome registration can be retried without claiming unrelated files', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async t => {
  const { installer } = await installerFor(t), registrationDir = join(installer.profile, 'NativeMessagingHosts');
  await mkdir(registrationDir, { recursive: true }); await chmod(registrationDir, 0o500);
  try { await assert.rejects(installer.prepare(), error => error.code === 'EACCES'); }
  finally { await chmod(registrationDir, 0o700); }
  assert.equal((await installer.status()).prepared, false);
  await installer.prepare(); assert.equal((await installer.status()).prepared, true);
});

test('the installed bridge really connects Chrome and reports the build loaded after update', { skip: process.platform === 'win32', timeout: 30000 }, async t => {
  const { extensionFixture } = await import('./fixtures/computer-use/extension.mjs');
  const env = await extensionFixture(t, { install: true, prefix: "trisoul-ext-中文-'-" });
  const before = await env.installer.status(env.hub.list());
  assert.equal(before.prepared, true); assert.equal(before.reloadRequired, false);
  assert.equal(env.browser.build, before.build);
  const page = await env.context.newPage(); await page.goto(env.fixture.url);
  await page.evaluate(() => localStorage.setItem('installer-session', 'preserve'));
  assert.ok((await env.hub.call(env.browser.id, 'tabs.list')).some(tab => tab.url === env.fixture.url + '/'));
  const extensionSettings = await env.context.newPage(); await extensionSettings.goto('chrome://extensions');
  const developerMode = extensionSettings.getByRole('button', { name: /^(开发者模式|Developer mode)$/ });
  if (await developerMode.getAttribute('aria-pressed') !== 'true') await developerMode.click();
  const popupScript = join(env.installer.source, 'popup.js');
  await writeFile(popupScript, (await readFile(popupScript, 'utf8')) + '\n// next installed fixture build\n');
  await env.installer.prepare();
  assert.equal((await env.installer.status(env.hub.list())).reloadRequired, true, 'copying files cannot claim the browser has loaded them');
  await extensionSettings.getByRole('button', { name: /^(重新加载|Reload)$/ }).click();
  for (let i = 0; i < 200 && env.hub.list()[0]?.build !== (await env.installer.bundle()).build; i++) await new Promise(resolve => setTimeout(resolve, 25));
  const after = await env.installer.status(env.hub.list());
  assert.equal(after.reloadRequired, false); assert.equal(env.hub.list()[0]?.build, after.build);
  assert.notEqual(after.build, before.build);
  assert.equal(page.isClosed(), false); assert.equal(await page.evaluate(() => localStorage.getItem('installer-session')), 'preserve');
});
