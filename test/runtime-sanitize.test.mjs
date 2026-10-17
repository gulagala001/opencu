import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

test('runtime sanitization keeps own special keys and independent snapshots without leaking private fields', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-runtime-sanitize-'));
  const target = { id: 'sanitize:tab', kind: 'tab', identity: { incarnation: 1 } };
  const node = JSON.parse('{"elementId":1,"name":"original","__proto__":{"safe":true,"path":"private"},"constructor":{"value":2},"path":"private","nested":[{"dataDir":"private","dataUrl":"private","base64":"private","value":0}]}');
  const backend = {
    async listTargets() { return [target]; }, async select() { return target; },
    async verify() { return { valid: true, target }; },
    async observe() { return { observationId: 'sanitize-observation', ax: { nodes: [node] } }; },
    async act() { return {}; }, async release() { return { released: true }; }, async close() {},
  };
  const runtime = createPluginRuntime({ dataDir: directory, browser: backend, nativeEnabled: false, extensionEnabled: false });
  t.after(async () => { try { await runtime.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  assert.equal((await runtime.request('select', { reference: { id: target.id } })).ok, true);
  const result = await runtime.request('observe', { format: 'ax' }), value = result.observation.ax.nodes[0];
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, '__proto__'), true);
  assert.deepEqual(value.__proto__, { safe: true });
  assert.deepEqual(value.constructor, { value: 2 });
  assert.deepEqual(value.nested, [{ value: 0 }]);
  assert.equal(value.path, undefined);
  value.name = 'caller edit'; value.__proto__.safe = false; value.nested[0].value = 9;
  const saved = (await runtime.request('state')).state.lastObservation.observation.ax.nodes[0];
  assert.equal(saved.name, 'original'); assert.equal(saved.__proto__.safe, true); assert.equal(saved.nested[0].value, 0);
  assert.equal(node.name, 'original'); assert.equal(node.nested[0].value, 0);
});
