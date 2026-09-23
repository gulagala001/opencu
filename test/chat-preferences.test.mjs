import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareChatPreferenceMigration } from '../src/host/chat-preferences.mjs';

async function fixture(t, mode, namespace = 'opencu-ui-chat') {
  const home = await mkdtemp(join(tmpdir(), 'opencu-chat-migration-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const row = { entry: { options: { id: namespace } }, override: mode === undefined ? {} : { transcriptView: mode } };
  const updates = [];
  const ctx = { root: { loader: { await: async () => {} } }, settings: { update: async (ns, patch) => {
    assert.equal(ns, namespace); updates.push(patch); Object.assign(row.override, patch);
  } } };
  ctx.get = name => name === 'profileContext' ? { home, dir: home }
    : name === 'configEditor' ? { configuration: () => [row] } : undefined;
  return { ctx, row, updates, home, namespace, marker: join(home, `.${namespace}-transcript-v2.json`) };
}

for (const [before, after] of [['compact', 'standard'], ['detailed', 'standard'], ['normal', 'standard'], ['expanded', 'detailed']]) {
  test(`old ${before} keeps its display behavior once, later choices survive restart`, async t => {
    const f = await fixture(t, before, 'omd-ui-chat');
    await (await prepareChatPreferenceMigration(f.ctx, f.namespace))();
    assert.equal(f.row.override.transcriptView, after);
    f.row.override.transcriptView = 'detailed';
    await (await prepareChatPreferenceMigration(f.ctx, f.namespace))();
    assert.equal(f.row.override.transcriptView, 'detailed');
    assert.deepEqual(f.updates, [{ transcriptView: after }]);
  });
}

test('a crash after applying expanded does not translate detailed again', async t => {
  const f = await fixture(t, 'expanded'), update = f.ctx.settings.update;
  f.ctx.settings.update = async (...args) => { await update(...args); throw Error('interrupted after saving'); };
  await assert.rejects((await prepareChatPreferenceMigration(f.ctx, f.namespace))(), /interrupted/);
  assert.equal(f.row.override.transcriptView, 'detailed');
  f.ctx.settings.update = update;
  await (await prepareChatPreferenceMigration(f.ctx, f.namespace))();
  assert.equal(f.row.override.transcriptView, 'detailed');
  assert.equal(f.updates.length, 1);
  assert.equal(JSON.parse(await readFile(f.marker, 'utf8')).done, true);
});

test('fresh native aliases and intervening user choices are not rewritten', async t => {
  const fresh = await fixture(t);
  await writeFile(join(fresh.home, 'settings.yaml'), JSON.stringify({ 'ui-chat': { transcriptView: 'compact' } }));
  const migrate = await prepareChatPreferenceMigration(fresh.ctx, fresh.namespace);
  fresh.row.override.transcriptView = 'compact';
  await migrate();
  assert.equal(fresh.row.override.transcriptView, 'compact');
  assert.deepEqual(fresh.updates, []);
  const existing = await fixture(t, 'detailed');
  const preserve = await prepareChatPreferenceMigration(existing.ctx, existing.namespace);
  existing.row.override.transcriptView = 'verbose';
  await preserve();
  assert.equal(existing.row.override.transcriptView, 'verbose');
});

test('legacy own settings are translated after import, preserving unrelated preferences', async t => {
  const f = await fixture(t);
  await writeFile(join(f.home, `.${f.namespace}-settings-v4.json`), '{}');
  await writeFile(join(f.home, 'settings.yaml.imported'), JSON.stringify({ [f.namespace]: { transcriptView: 'compact' } }));
  const migrate = await prepareChatPreferenceMigration(f.ctx, f.namespace);
  f.row.override = { transcriptView: 'compact', linkOpening: 'new-tab' };
  await migrate();
  assert.deepEqual(f.row.override, { transcriptView: 'standard', linkOpening: 'new-tab' });
});

test('a new installation keeps explicitly supplied current modes', async t => {
  const f = await fixture(t);
  await writeFile(join(f.home, 'settings.yaml.imported'), JSON.stringify({ [f.namespace]: { transcriptView: 'detailed' } }));
  const migrate = await prepareChatPreferenceMigration(f.ctx, f.namespace);
  f.row.override.transcriptView = 'detailed';
  await migrate();
  assert.deepEqual(f.updates, []);
  assert.equal(f.row.override.transcriptView, 'detailed');
});
