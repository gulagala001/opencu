import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

// Opt-in smoke: real installed DSH loader, tools and durable attachment store.
// No replacement SDK, model/account, or current DSH profile is involved.
test('adapter loads in a real isolated DSH profile and projects a real screenshot attachment', { skip: !process.env.OPENCU_DSH_SMOKE }, async () => {
  const installation = process.env.OPENCU_DSH_INSTALL || fileURLToPath(new URL('../../oh-my-dsh/package.json', import.meta.url));
  const workspaceRequire = createRequire(installation);
  const dshPackage = workspaceRequire.resolve('@deepseek-ai/dsh/package.json');
  const requireDsh = createRequire(dshPackage);
  const module = async name => import(pathToFileURL(requireDsh.resolve(name)).href);
  const { runProfile } = await module('@deepseek-ai/dsh/profile-boot');
  const { createLaunchEnvironmentSnapshot } = await module('@deepseek-ai/dsh-launch-environment');
  const home = await mkdtemp(join(tmpdir(), 'opencu-real-dsh-'));
  const profileDir = join(home, 'profiles', 'opencu-smoke');
  await mkdir(profileDir, { recursive: true });
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'opencu-isolated-profile', private: true, type: 'module', dsh: { profile: { bundles: [] } } }));
  const patchPath = join(profileDir, 'cordis.patch.yml');
  await writeFile(patchPath, '[]\n');
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  let runtime, plugin, peer;
  const pluginPath = process.env.OPENCU_DSH_PLUGIN || fileURLToPath(new URL('../src/dsh/index.mjs', import.meta.url));
  const openCU = await import(pathToFileURL(pluginPath).href);
  const config = { dataDir: join(home, 'opencu'), nativeEnabled: false, extensionEnabled: false, headless: true, registerTools: true };
  try {
    runtime = await runProfile({ profile: 'opencu-smoke',
      environment: createLaunchEnvironmentSnapshot([{ source: 'process', values: { DSH_HOME: home } }]), args: [], patchFiles: [],
      resolvedProfile: { installAnchor: dshPackage, profile: { name: 'opencu-smoke', dir: profileDir, layers: [], skippedBundles: [], patchPath,
        patches: [{ insert: [
          { id: 'system-prompt', name: requireDsh.resolve('@deepseek-ai/dsh-system-prompt'), config: { includeHarnessIdentity: false, includeRuntimeContext: false } },
          { id: 'tools', name: requireDsh.resolve('@deepseek-ai/dsh-tools'), config: { mode: 'native' } },
          { id: 'attachments', name: requireDsh.resolve('@deepseek-ai/dsh-attachment-local'), config: { dshHome: home } },
        ] }] } },
    });
    plugin = await runtime.ctx.plugin(openCU.default, config);
    const tools = runtime.ctx.get('tools');
    assert.ok(tools, 'real ToolRuntime mounted');
    const execute = (name, args) => tools.execute({ callId: `smoke-${name}`, name, arguments: args, signal: new AbortController().signal });
    const inventory = await execute('opencu_targets', {});
    assert.equal(inventory.isError, false, JSON.stringify(inventory));
    const targets = JSON.parse(inventory.content.find(block => block.type === 'text').text).targets;
    const target = targets.find(item => item.backend === 'browser');
    assert.ok(target, 'plugin must launch its own real browser without an external service');
    const selected = await execute('opencu_select', { reference: target.id });
    assert.equal(selected.isError, false, JSON.stringify(selected));
    const observation = await execute('opencu_observe', { targetId: target.id, format: 'both' });
    assert.equal(observation.isError, false, JSON.stringify(observation));
    const image = observation.content.find(block => block.type === 'image');
    assert.ok(image?.attachment?.attachmentId, 'real durable image attachment required');
    const stored = await runtime.ctx.attachments.readImage(image.attachment);
    assert.ok(stored.data.length > 0);
    assert.ok(runtime.ctx.attachments.imageHostPath(image.attachment).startsWith(`${home}/`));
    const held = await execute('opencu_act', { targetId: target.id, action: 'keyDown', key: 'Shift' });
    assert.equal(held.isError, false, JSON.stringify(held));
    await plugin.restart();
    const restarted = JSON.parse((await execute('opencu_state', {})).content.find(block => block.type === 'text').text);
    assert.equal(restarted.state.releasePending, false);
    assert.equal(restarted.state.targets.find(item => item.id === target.id)?.cold, true);
    assert.ok((await runtime.ctx.attachments.readImage(image.attachment)).data.length > 0);
    const service = runtime.ctx.get('opencu');
    const peerCU = process.env.OPENCU_DSH_PEER_PLUGIN ? await import(pathToFileURL(process.env.OPENCU_DSH_PEER_PLUGIN).href) : openCU;
    peer = await runtime.ctx.plugin({ name: 'opencu-integration-lease', async apply(ctx) {
      await peerCU.installTools(ctx, { namespace: 'integration-smoke', config }).ready;
    } });
    assert.equal(runtime.ctx.get('opencu'), service);
    await plugin.dispose();
    assert.equal(runtime.ctx.get('opencu'), service, 'remaining integration keeps the same core');
    assert.equal((await execute('opencu_state', {})).isError, false, 'remaining tools stay registered');
    await peer.dispose();
    assert.equal(runtime.ctx.get('opencu'), undefined);
    const stopped = JSON.parse(await readFile(join(home, 'opencu/controller.json'), 'utf8'));
    assert.equal(stopped.closed, true); assert.equal(stopped.releasePending, false);
    plugin = await runtime.ctx.plugin(openCU.default, config);
    assert.equal((await execute('opencu_targets', {})).isError, false);
    assert.ok((await runtime.ctx.attachments.readImage(image.attachment)).data.length > 0);
    console.log(JSON.stringify({ profile: profileDir, adapter: 'loaded', lifecycle: 'restart, shared lease removal, disable/re-enable; persistent image retained', screenshot: image.attachment, bytesRead: stored.data.length }));
  } finally {
    if (runtime) {
      await runtime.shutdown.shutdown(0);
      let text;
      try { text = await readFile(join(home, 'opencu/controller.json'), 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (text) {
        const state = JSON.parse(text);
        assert.equal(state.closed, true);
        assert.equal(state.releasePending, false);
        assert.deepEqual(state.releaseErrors, []);
      }
    }
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
  }
});
