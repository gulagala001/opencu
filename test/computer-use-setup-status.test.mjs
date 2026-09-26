import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';

function fixture() {
  return Object.assign(Object.create(ComputerUseManager.prototype), {
    extensionReady: Promise.resolve(), browser: { runtimePath: process.execPath },
    native: { supported: () => true, available: () => true, uninstall() {},
      installationStatus: async () => ({ version: 'fixture' }),
      permissions: async () => ({ platform: 'win32', interactive: true, capture_supported: true }) },
    extensionHub: { list: () => [{ id: 'connected-browser' }], server: {} },
    extensionInstaller: { supported: () => true, platform: 'win32', extensionPath: 'fixture-extension',
      status: async () => ({ supported: true, prepared: true, platform: 'win32' }) },
  });
}
test('extension status failure preserves browser and native status, then recovers', async () => {
  const manager = fixture();
  manager.extensionInstaller.status = async () => { throw new Error('registry query failed'); };
  const failed = await manager.setupStatus();
  assert.equal(failed.browser.installed, true);
  assert.equal(failed.native.installed, true);
  assert.equal(failed.native.version, 'fixture');
  assert.equal(failed.extension.installation.supported, true);
  assert.equal(failed.extension.installation.prepared, null, 'failed query is unknown, not uninstalled');
  assert.match(failed.extension.error, /registry query failed/);
  assert.equal(failed.extension.browsers.length, 1, 'live connection is retained');
  manager.extensionInstaller.status = async () => ({ supported: true, prepared: true });
  const recovered = await manager.setupStatus();
  assert.equal(recovered.extension.installation.prepared, true);
  assert.equal(recovered.extension.error, null);
});
test('native availability failure does not erase the browser or extension', async () => {
  const manager = fixture(); manager.native.available = () => { throw new Error('native receipt denied'); };
  const status = await manager.setupStatus();
  assert.equal(status.native.supported, true);
  assert.equal(status.native.installed, null);
  assert.match(status.native.error, /native receipt denied/);
  assert.equal(status.browser.installed, true);
  assert.equal(status.extension.installation.prepared, true);
});

test('browser status failure remains local to the browser', async () => {
  const manager = fixture(); manager.browser.runtimePath = {};
  const status = await manager.setupStatus();
  assert.equal(status.browser.installed, null);
  assert.ok(status.browser.error);
  assert.equal(status.native.installed, true);
  assert.equal(status.extension.installation.prepared, true);
});
