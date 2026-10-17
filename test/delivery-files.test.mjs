import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeliveryFiles } from '../src/dsh/delivery-files.mjs';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

const reference = (text, name = 'proof.txt') => ({ attachmentId: 'sha256:' + createHash('sha256').update(text).digest('hex'), name, bytes: Buffer.byteLength(text) });

test('delivery batches preserve first references, concurrent commits and cold attachment resolution', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-delivery-batch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createDeliveryFiles(() => directory), first = reference('first'), second = reference('second'), third = reference('third');
  await Promise.all([store.retainAll([first, { ...first, bytes: 999 }, second]), store.retain(third)]);
  const index = join(directory, 'delivered-files', 'index.json'), before = await readFile(index, 'utf8');
  const records = JSON.parse(before);
  assert.deepEqual(Object.values(records), [first, second, third]);
  await store.retainAll([first, second, third]);
  assert.equal(await readFile(index, 'utf8'), before);
  await store.close();
  const reopened = createDeliveryFiles(() => directory);
  let reads = 0;
  const attachments = { async *readFileStream(ref) { assert.deepEqual(ref, first); reads++; yield Buffer.from('first'); } };
  const result = await reopened.resolve(first, attachments);
  assert.equal(await readFile(result.path, 'utf8'), 'first');
  assert.equal((await reopened.resolve(first, attachments)).path, result.path);
  assert.equal(reads, 1);
  assert.equal((await stat(index)).mode & 0o777, 0o600);
  await reopened.close();
});

test('invalid batches and failed atomic replacement publish nothing and can retry', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-delivery-batch-failure-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createDeliveryFiles(() => directory), first = reference('first'), second = reference('second');
  await store.retain(first);
  assert.throws(() => store.retainAll([second, { ...first, name: '../escape.txt' }]), /Invalid delivered file/);
  const index = join(directory, 'delivered-files', 'index.json'), saved = index + '.saved';
  await rename(index, saved); await mkdir(index);
  await assert.rejects(store.retainAll([second]));
  await assert.rejects(store.resolve(second, {}), /not in this OpenCU delivery registry/);
  await rm(index, { recursive: true }); await rename(saved, index);
  await store.retainAll([second]);
  assert.deepEqual(Object.values(JSON.parse(await readFile(index, 'utf8'))), [first, second]);
  await store.close();
});

test('runtime delivery lists commit completed prefixes on failure and reopen all references after retry', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-delivery-runtime-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { dataDir: directory, browserEnabled: false, nativeEnabled: false, extensionEnabled: false };
  let runtime = createPluginRuntime(config);
  const stored = new Map(); let fail = true, saves = 0;
  const attachments = {
    async saveFileStream({ data, name }) {
      if (fail && name === 'second.txt') throw Error('isolated attachment failure');
      const chunks = []; for await (const chunk of data) chunks.push(chunk);
      const bytes = Buffer.concat(chunks), ref = reference(bytes.toString(), name);
      stored.set(ref.attachmentId, bytes); saves++; return ref;
    },
    async *readFileStream(ref) { yield stored.get(ref.attachmentId); },
  };
  try {
    const { directory: downloads } = await runtime.request('downloads/configure');
    for (const [name, startedAtMs] of [['first.txt', 2], ['second.txt', 1]]) {
      const id = randomUUID(); await mkdir(join(downloads, id)); await writeFile(join(downloads, id, name), name);
      await runtime.request('downloads/update', { download: { id, filename: name, startedAtMs, status: 'complete', receivedBytes: Buffer.byteLength(name) } });
    }
    await assert.rejects(runtime.request('deliveries', {}, { attachments }), /isolated attachment failure/);
    const index = join(directory, 'delivered-files', 'index.json');
    assert.deepEqual(Object.values(JSON.parse(await readFile(index, 'utf8'))).map(ref => ref.name), ['first.txt']);
    fail = false;
    const result = await runtime.request('deliveries', {}, { attachments });
    assert.equal(result.deliveries.length, 2); assert.equal(saves, 2);
    assert.ok(result.deliveries.every(item => item.deliverable && !('path' in item)));
    await runtime.close(); runtime = createPluginRuntime(config);
    for (const item of result.deliveries) {
      const resolved = await runtime.request('files/resolve', item.file, { attachments });
      assert.equal(await readFile(resolved.path, 'utf8'), item.file.name);
    }
  } finally { await runtime.close(); }
});
