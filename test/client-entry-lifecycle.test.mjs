import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
async function fixture(importModuleDynamically) {
  let registration;
  const context = vm.createContext({ window: { __ModuleLoader__: { load(value) { registration = value; } } } });
  new vm.Script(source, { importModuleDynamically: specifier => importModuleDynamically(specifier, context) }).runInContext(context);
  const plugin = registration.factory(() => ({}));
  return { plugin, context };
}
async function runtime(context) {
  const module = new vm.SourceTextModule('export function bindHostReact() {} export function apply() { globalThis.mounts = (globalThis.mounts ?? 0) + 1; }', { context });
  await module.link(() => { throw Error('Unexpected runtime dependency'); });
  await module.evaluate();
  return module;
}
test('failed client fetch can be retried by the next activation', async () => {
  let requests = 0;
  let fail;
  const first = new Promise((_resolve, reject) => { fail = reject; });
  const { plugin, context } = await fixture((_url, context) => ++requests === 1 ? first : runtime(context));
  const ctx = { fiber: { uid: 1 } };
  const applying = plugin.apply(ctx);
  fail(Error('transport failed'));
  await assert.rejects(applying, /transport failed/);
  await plugin.apply(ctx);
  assert.equal(requests, 2);
  assert.equal(context.mounts, 1);
});
test('disposing during client loading prevents a late mount', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const { plugin, context } = await fixture(async (_url, context) => { await gate; return runtime(context); });
  const ctx = { fiber: { uid: 1 } }, applying = plugin.apply(ctx);
  ctx.fiber.uid = null;
  finish();
  await applying;
  assert.equal(context.mounts, undefined);
});
