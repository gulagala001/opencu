import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { NativeHost } from '../src/computer-use/native.mjs';
import { WindowsNativeHost } from '../src/computer-use/windows-native.mjs';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';

const wsl = { platform: 'linux', osRelease: '6.6.87.2-microsoft-standard-WSL2' };
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'opencu-wsl-'));
  const binary = join(root, 'Windows desktop.exe'); await writeFile(binary, 'fixture');
  const state = { build: 'a'.repeat(64), protocol: 1, name: 'oh-my-dsh-windows-desktop', clients: [] };
  const native = { ...wsl, binary,
    runtime: { inspect: async () => ({ name: state.name, protocol: state.protocol, build: state.build }) },
    client: () => {
      const build = state.liveBuild ?? state.build, calls = [];
      const client = { closed: false, calls,
        initialize: async () => ({ serverInfo: { name: 'trisoul-computer-use', version: '0.1.1' }, _meta: { trisoul: { platform: 'win32', protocol: state.liveProtocol ?? 1, build } } }),
        call: async (name, args) => { calls.push({ name, args }); return { structuredContent: name === 'check_permissions' ? { platform: 'win32', interactive: true, capture_supported: true } : name === 'launch_app' ? { pid: 123, window_id: 456, process_identity: '123:created', app_id: 'fixture', app_name: 'Fixture' } : {} }; },
        close: async () => { client.closed = true; },
      }; state.clients.push(client); return client;
    }, ...options };
  const extensionHub = Object.assign(new EventEmitter(), { list: () => [] });
  const manager = new ComputerUseManager(root, { native, extensionHub });
  // Keep extension setup entirely local; this test exercises native routing.
  manager.extensionInstaller.status = async () => ({ supported: false, platform: 'linux' });
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  return { manager, host: manager.native, state, binary };
}

test('WSL with an explicit executable selects Windows native control and reports its platform', async t => {
  const { manager, host } = await fixture(t);
  assert.ok(host instanceof WindowsNativeHost);
  assert.equal(host.supported(), true);
  const status = (await manager.setupStatus()).native;
  assert.equal(status.platform, 'win32'); assert.equal(status.bridge, true);
  assert.equal(status.external, true); assert.equal(status.removable, false);
  assert.equal(status.installed, true); assert.equal(status.interactive, true);
  assert.equal(status.captureSupported, true); assert.equal(status.error, undefined);
  const app = await host.bind('control', 'Fixture'); assert.equal(app.kind, 'app');
  const docs = await manager.execute('docs', "nodeRepl.write(await cua.documentation('app'));");
  assert.equal(docs.error, undefined);
  assert.match(docs.blocks[0].text, /Windows desktop behavior/);
});

test('WSL detection does not redirect ordinary Linux, macOS, or WSL without an executable', async t => {
  for (const options of [{ binary: undefined }, { osRelease: '6.8.0-generic' }, { platform: 'darwin' }]) {
    const { host } = await fixture(t, options);
    assert.equal(host.constructor, NativeHost);
  }
  const { host } = await fixture(t, { platform: 'win32', osRelease: '10.0.22631' });
  assert.ok(host instanceof WindowsNativeHost); assert.equal(host.bridge, false);
  assert.deepEqual(await host.expectedBuild(), await windowsNativeBuild(), 'native Windows keeps source build validation');
  const first = await fixture(t, { osRelease: '4.4.0-19041-Microsoft' });
  assert.ok(first.host instanceof WindowsNativeHost, 'WSL1 also exposes a Microsoft kernel');
});

test('external WSL runtime keeps disk/live build checks and read-only permission sessions', async t => {
  const { host, state } = await fixture(t);
  await host.permissions('ui-permissions');
  assert.equal(state.clients[0].calls[0].args.read_only, true);
  await host.bind('control', 'Fixture');
  assert.equal(state.clients[1].calls[0].args.read_only, false);
  state.build = 'b'.repeat(64);
  assert.equal((await host.installationStatus()).restartRequired, true);
  await assert.rejects(host.bind('control', 'Fixture'), /更新或重启/);
  await assert.rejects(host.install(), /手动指定/);
  await assert.rejects(host.uninstall(), /手动指定/);
  await host.release('control');
  await host.bind('control', 'Fixture');
  assert.equal(state.clients.at(-1).closed, false);
});

test('WSL rejects missing, unversioned, foreign, or mismatched programs before starting a session', async t => {
  const { host, state, binary, manager } = await fixture(t);
  for (const patch of [{ protocol: 2 }, { name: 'foreign' }, { build: undefined }, { build: 'development' }]) {
    const prior = { ...state }; Object.assign(state, patch);
    await assert.rejects(host.connection('invalid'), /匹配的 Windows/);
    Object.assign(state, prior);
  }
  assert.equal(state.clients.length, 0);
  for (const patch of [{ liveBuild: 'c'.repeat(64) }, { liveProtocol: 2 }]) {
    Object.assign(state, patch);
    await assert.rejects(host.connection('invalid'), /不匹配|更新或重启/);
    assert.equal(state.clients.at(-1).closed, true);
    assert.equal(state.clients.at(-1).calls.length, 0);
    delete state.liveBuild; delete state.liveProtocol;
  }
  await rm(binary);
  assert.equal(host.available(), false);
  const status = (await manager.setupStatus()).native;
  assert.equal(status.installed, false); assert.equal(status.external, true);
});
