import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOpenCU } from '../src/dsh/shared.mjs';
import { installToolDefinitions } from '../src/dsh/tools.mjs';
import { modelResult } from '../src/dsh/model-output.mjs';

const require = createRequire(import.meta.url);
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);

test('model state projection avoids unused snapshots while full history, tools and REPL retain their contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-model-state-')), ctx = new Context();
  const target = { id: 'model:tab', kind: 'tab', backend: 'browser', title: 'Source title', identity: { incarnation: 1 } };
  const observation = { observationId: 'model-observation', ax: { nodes: [{ elementId: 1, role: 'button', name: 'Keep original', path: '/private/node' }] } };
  let releaseFails = false, lease, fiber;
  const backend = {
    async listTargets() { return [target]; }, async select() { return target; }, async verify() { return { valid: true, target }; },
    async observe() { return observation; }, async act() { return {}; },
    async release() { return releaseFails ? { released: false, failures: [{ error: 'isolated release failure' }] } : { released: true }; }, async close() {},
  };
  try {
    fiber = ctx.plugin({ name: 'model-state-fixture', apply(scope) {
      lease = acquireOpenCU(scope, { config: { dataDir: directory, browser: backend, nativeEnabled: false, extensionEnabled: false } });
    } });
    await fiber;
    assert.equal((await lease.request('select', { reference: { id: target.id } }, { sessionKey: 'isolated' })).ok, true);
    assert.equal((await lease.request('observe', { format: 'ax' }, { sessionKey: 'isolated' })).ok, true);
    await lease.request('annotate', { targetId: target.id, annotations: [{ note: 'Saved annotation', path: '/private/note' }] });
    const entry = globalThis[Symbol.for('opencu.shared-root.v1')].get(ctx.root), snapshot = entry.presentation.snapshot;
    let snapshots = 0;
    entry.presentation.snapshot = (...args) => { snapshots++; return snapshot(...args); };
    const full = await lease.request('state'); assert.equal(snapshots, 1); assert.ok(full.presentation);
    const compact = await lease.request('state', {}, { modelProjection: true });
    assert.deepEqual(compact, modelResult(full)); assert.equal(snapshots, 1);
    assert.equal(compact.state.lastObservation.observationId, observation.observationId); assert.equal(compact.state.annotationCount, 1);
    assert.equal(compact.state.selectedTarget, undefined); assert.equal(compact.state.annotations, undefined);
    assert.deepEqual(await lease.request('state', { includeHistory: true }, { modelProjection: true }), modelResult(full, { includeHistory: true }));
    assert.equal(snapshots, 1);
    // The internal flag cannot be enabled by UI payload fields.
    assert.ok((await lease.request('state', { modelProjection: true })).presentation); assert.equal(snapshots, 2);
    const inventory = await lease.request('targets', {}, { modelProjection: true }); assert.equal(snapshots, 2); assert.equal(inventory.targets[0].title, target.title);
    const tools = new Map();
    installToolDefinitions({ effect: work => work(), tools: { register: tool => tools.set(tool.name, tool) } }, lease, 'isolated');
    const exec = { signal: new AbortController().signal };
    assert.deepEqual(await tools.get('opencu_state').execute({}, exec), modelResult(full)); assert.equal(snapshots, 2);
    assert.equal((await tools.get('opencu_targets').execute({}, exec)).targets[0].title, target.title); assert.equal(snapshots, 2);
    const history = await tools.get('opencu_state').execute({ includeHistory: true }, exec);
    assert.equal(history.state.lastObservation.observation.ax.nodes[0].name, 'Keep original');
    assert.equal(history.state.lastObservation.observation.ax.nodes[0].path, undefined);
    history.state.lastObservation.observation.ax.nodes[0].name = 'caller edit'; history.state.annotations[0].annotations[0].note = 'caller edit';
    const retained = await lease.request('state'); assert.equal(retained.state.lastObservation.observation.ax.nodes[0].name, 'Keep original');
    assert.equal(retained.state.annotations[0].annotations[0].note, 'Saved annotation');
    const beforeREPL = snapshots;
    const run = code => lease.request('computer_use', { code }, { sessionKey: 'isolated' });
    const repl = await run('await cua.getState()'); const state = JSON.parse(repl.outputs.at(-1));
    assert.equal(state.lastObservation.observationId, observation.observationId); assert.equal(state.targets[0].title, target.title); assert.equal(snapshots, beforeREPL);
    const replFull = await run('await cua.getState({includeHistory:true})');
    assert.equal(JSON.parse(replFull.outputs.at(-1)).lastObservation.observation.ax.nodes[0].name, 'Keep original'); assert.equal(snapshots, beforeREPL);
    releaseFails = true; assert.equal((await lease.request('stop')).ok, false);
    const failed = await lease.request('state'), failedCompact = await lease.request('state', {}, { modelProjection: true });
    assert.deepEqual(failedCompact, modelResult(failed)); assert.equal(failedCompact.state.releasePending, true); assert.ok(failedCompact.state.releaseErrors.length);
    releaseFails = false; assert.equal((await lease.request('stop')).ok, true);
    assert.equal(observation.ax.nodes[0].name, 'Keep original');
    await lease.release(); lease = undefined; await fiber.dispose();
  } finally { releaseFails = false; await lease?.release(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); }
});
