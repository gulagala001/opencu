import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rmdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeliveryStore } from '../src/browser/deliveries.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('an import whose index failed retries its existing copy without rereading the source', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-delivery-index-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'proof.txt'), deliveries = join(directory, 'deliveries'), index = join(deliveries, 'index.json');
  await writeFile(source, 'durable proof');
  const store = await createDeliveryStore(directory);
  await mkdir(index);
  await assert.rejects(store.importFile(source, { sourceId: 'isolated-source' }), { code: 'EISDIR' });
  assert.deepEqual(await store.list(), [], 'A failed index must not publish an in-memory complete record');
  const entries = await readdir(deliveries), copies = entries.filter(name => name.endsWith('-proof.txt'));
  assert.equal(copies.length, 1);
  assert.equal(entries.some(name => name.endsWith('.tmp') || name.endsWith('.part')), false);
  assert.equal(await readFile(join(deliveries, copies[0]), 'utf8'), 'durable proof');
  assert.equal(await readFile(source, 'utf8'), 'durable proof');
  await assert.rejects(store.importFile(source, { sourceId: 'isolated-source' }), { code: 'EISDIR' });
  assert.equal((await readdir(deliveries)).filter(name => name.endsWith('-proof.txt')).length, 1, 'Repeated index failures must not recopy the source');
  await rename(source, source + '.moved');
  await rmdir(index);
  const [result, concurrent] = await Promise.all([
    store.importFile(source, { sourceId: 'isolated-source' }),
    store.importFile(source, { sourceId: 'isolated-source' }),
  ]);
  assert.equal(concurrent.id, result.id);
  assert.equal(result.path, join(deliveries, copies[0]));
  assert.equal(result.status, 'complete');
  const persisted = JSON.parse(await readFile(index, 'utf8'));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, result.id);
  const reopened = await createDeliveryStore(directory), restored = await reopened.list();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].sha256, result.sha256);
  assert.equal(await readFile(restored[0].path, 'utf8'), 'durable proof');
  assert.equal((await readdir(deliveries)).filter(name => name.endsWith('-proof.txt')).length, 1, 'Retry commits the preserved copy instead of creating another');
  assert.equal(await readFile(source + '.moved', 'utf8'), 'durable proof');
  await store.flush(); await reopened.flush();
});

for (const temporary of [false, true]) test('a fresh process recovers a copied import from ' + (temporary ? 'temporary copy' : 'final copy') + ' without the original source', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-delivery-cold-index-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'proof.txt'), deliveries = join(directory, 'deliveries'), index = join(deliveries, 'index.json');
  await writeFile(source, 'durable proof');
  const store = await createDeliveryStore(directory);
  const previous = await store.importFile(source, { sourceId: 'previous-source' });
  await rename(index, index + '.saved'); await mkdir(index);
  await assert.rejects(store.importFile(source, { sourceId: 'cold-source' }), { code: 'EISDIR' });
  const copied = (await readdir(deliveries)).find(name => name.endsWith('-proof.txt') && join(deliveries, name) !== previous.path);
  assert.ok(copied);
  if (temporary) await rename(join(deliveries, copied), join(deliveries, copied) + '.part');
  await rename(source, source + '.moved'); await rmdir(index); await rename(index + '.saved', index);
  const moduleURL = new URL('../src/browser/deliveries.mjs', import.meta.url).href;
  const script = 'const {createDeliveryStore}=await import(' + JSON.stringify(moduleURL) + ');'
    + 'const store=await createDeliveryStore(' + JSON.stringify(directory) + ');'
    + 'const record=await store.importFile(' + JSON.stringify(source) + ',{sourceId:"cold-source"});'
    + 'await store.flush();console.log(JSON.stringify({record,records:await store.list()}));';
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script]);
  const recovered = JSON.parse(stdout);
  assert.equal(recovered.record.path, join(deliveries, copied));
  assert.equal(recovered.records.length, 2);
  assert.equal(recovered.records.find(record => record.sourceId === 'previous-source').path, previous.path);
  assert.ok(recovered.records.every(record => record.status === 'complete'));
  assert.equal(await readFile(recovered.record.path, 'utf8'), 'durable proof');
  assert.equal(await readFile(source + '.moved', 'utf8'), 'durable proof');
  assert.equal((await readdir(deliveries)).filter(name => name.endsWith('-proof.txt')).length, 2);
  assert.equal((await readdir(deliveries)).some(name => name.endsWith('.import.json') || name.endsWith('.part')), false);
});

test('pending import recovery rejects altered copies and paths without discarding evidence', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-delivery-recovery-guard-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'proof.txt'), deliveries = join(directory, 'deliveries'), index = join(deliveries, 'index.json');
  await writeFile(source, 'durable proof');
  const store = await createDeliveryStore(directory);
  await mkdir(index);
  await assert.rejects(store.importFile(source, { sourceId: 'guard-source' }), { code: 'EISDIR' });
  const entry = (await readdir(deliveries)).find(name => name.endsWith('.import.json'));
  const journal = join(deliveries, entry), record = JSON.parse(await readFile(journal, 'utf8'));
  await rmdir(index);
  const altered = 'changed proof';
  await writeFile(record.path, altered);
  const reopened = await createDeliveryStore(directory);
  await assert.rejects(reopened.importFile(source, { sourceId: 'guard-source' }), /Pending download copy changed/);
  assert.deepEqual(await reopened.list(), []);
  assert.equal(await readFile(record.path, 'utf8'), altered);
  assert.equal(await readFile(source, 'utf8'), 'durable proof');
  await writeFile(journal, JSON.stringify({ ...record, path: source }));
  await assert.rejects(createDeliveryStore(directory), /Invalid pending download import/);
  assert.equal(await readFile(source, 'utf8'), 'durable proof');
  await writeFile(journal, JSON.stringify(record)); await writeFile(record.path, 'durable proof');
  const repaired = await createDeliveryStore(directory), result = await repaired.importFile(source, { sourceId: 'guard-source' });
  assert.equal(result.path, record.path);
  assert.equal((await repaired.list())[0].status, 'complete');
  assert.equal((await readdir(deliveries)).some(name => name.endsWith('.import.json')), false);
});
