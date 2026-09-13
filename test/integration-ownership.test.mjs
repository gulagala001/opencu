import test from 'node:test';
import assert from 'node:assert/strict';
import { Context, Service } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireComputerUse } from '../src/integration.mjs';

class Settings extends Service {
  constructor(ctx, data) { super(ctx, 'settings'); this.data = data; this.sections = new Set(); }
  section(name) { return this.data[name]; }
  installSection(owner, name, schema, base, hooks) {
    assert.ok(!this.sections.has(name));
    owner.effect(() => { this.sections.add(name); return () => this.sections.delete(name); });
    hooks.setSource(() => ({ ...base, ...this.data[name] }));
  }
}
class Tools extends Service {
  constructor(ctx) { super(ctx, 'tools'); this.entries = new Map(); }
  register(tool) {
    this.ctx.effect(() => {
      assert.ok(!this.entries.has(tool.name), 'no duplicate tool registration');
      this.entries.set(tool.name, tool);
      return () => this.entries.delete(tool.name);
    });
  }
}
for (const order of ['standalone-first', 'integration-first']) test('shared ownership: ' + order, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-owners-'));
  const ctx = new Context();
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); });
  for (const name of ['llm', 'agents', 'sessions', 'sessionProjections']) ctx.provide(name, {});
  const settings = new Settings(ctx, { 'trisoul-x': { dataDir: directory, computerUseEnabled: false, computerUseNativeBinary: join(directory, 'missing-native') }, opencu: { computerUseEnabled: true } });
  const tools = new Tools(ctx);
  let one, two;
  const integration = { dataDir: join(directory, 'computer-use'), getConfig: () => settings.section('trisoul-x') };
  const standalone = { config: {} };
  const first = ctx.plugin(scope => { one = acquireComputerUse(scope, order === 'standalone-first' ? standalone : integration); });
  await first;
  const second = ctx.plugin(scope => { two = acquireComputerUse(scope, order === 'standalone-first' ? integration : standalone); });
  await second; await one.fiber;
  assert.equal(one, two);
  assert.equal(one.computerUse, two.computerUse);
  assert.equal(one.config().computerUseEnabled, true, 'explicit OpenCU setting takes precedence');
  assert.equal(one.config().computerUseNativeBinary, join(directory, 'missing-native'), 'preserve legacy runtime path');
  assert.deepEqual([...tools.entries.keys()], ['computer_use', 'computer_use_reset']);
  let closed = 0;
  const originalClose = one.computerUse.close.bind(one.computerUse);
  one.computerUse.close = async () => { closed++; await originalClose(); };
  await first.dispose();
  assert.equal(closed, 0, 'removing either first owner retains the runtime');
  assert.equal(tools.entries.size, 2);
  await second.dispose();
  assert.equal(closed, 1);
  assert.equal(tools.entries.size, 0, 'last unload removes the tools');
  assert.equal(settings.sections.size, 0);
  let fresh;
  const third = ctx.plugin(scope => { fresh = acquireComputerUse(scope, standalone); });
  await third; await fresh.fiber;
  assert.notEqual(fresh.computerUse, one.computerUse, 'reinstall creates a usable fresh runtime');
  assert.equal(tools.entries.size, 2);
  await third.dispose();
});
