import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createSidebarDownloads } from '../src/dsh/downloads.mjs';

async function fixture(t) {
  const scratch = new URL('../.local/', import.meta.url);
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(new URL('sidebar-downloads-', scratch).pathname);
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createSidebarDownloads(() => root), directory = await store.location();
  t.after(() => store.close());
  const value = (patch = {}) => ({ id: randomUUID(), filename: 'report.txt', url: 'https://example.test/report',
    startedAtMs: 100, updatedAtMs: 200, status: 'in_progress', receivedBytes: 4, totalBytes: 8,
    canPause: true, canResume: false, canCancel: true, fileExists: false, ...patch });
  const disk = async record => {
    await mkdir(join(directory, record.id), { recursive: true });
    await writeFile(join(directory, record.id, 'record.json'), JSON.stringify(record));
  };
  return { root, store, directory, value, disk, reopen: () => createSidebarDownloads(() => root) };
}

for (const status of ['failed', 'canceled']) test(`late progress cannot revive a ${status} download, including after reload`, async t => {
  const f = await fixture(t), progress = f.value(), terminal = { ...progress, updatedAtMs: 300, status, canPause: false, canCancel: false };
  await f.disk(progress); await f.store.update(terminal);
  await f.store.update(progress);
  assert.equal((await f.store.list())[0].status, status);
  const reopened = f.reopen(); t.after(() => reopened.close());
  assert.equal((await reopened.list())[0].status, status, 'older desktop journal cannot replace the indexed terminal receipt');
  await reopened.update(progress);
  assert.equal((await reopened.list())[0].status, status);
});

test('reordered progress keeps the newer pause and duplicate receipts do not rewrite history', async t => {
  const f = await fixture(t), progress = f.value(), paused = { ...progress, updatedAtMs: 300, status: 'paused', canPause: false, canResume: true };
  await f.store.update(paused);
  const before = await stat(join(f.directory, 'index.json'), { bigint: true });
  await f.store.update(progress); await f.store.update(paused);
  assert.equal((await f.store.list())[0].status, 'paused');
  assert.equal((await stat(join(f.directory, 'index.json'), { bigint: true })).ino, before.ino);
});

test('missing completed files remain terminal history and do not block other downloads', async t => {
  const f = await fixture(t), complete = f.value({ status: 'complete', receivedBytes: 8, canPause: false, canCancel: false });
  await f.store.update(complete);
  const other = f.value(); await f.store.update(other);
  const rows = await f.store.list(), missing = rows.find(row => row.id === complete.id);
  assert.equal(rows.length, 2); assert.equal(missing.status, 'complete');
  assert.equal(missing.fileExists, false); assert.equal(missing.fileError.code, 'ENOENT');
  await f.store.update({ ...complete, status: 'in_progress' });
  assert.equal((await f.store.list()).find(row => row.id === complete.id).status, 'complete');
});

test('cold interruption is a view of the producer receipt, including a missing desktop journal', async t => {
  const f = await fixture(t), progress = f.value();
  await f.store.update(progress);
  const cold = f.reopen(); t.after(() => cold.close());
  const [interrupted] = await cold.list();
  assert.equal(interrupted.status, 'failed'); assert.equal(interrupted.canResume, false); assert.equal(interrupted.canCancel, false);
  await cold.update(f.value({ status: 'canceled' }));
  const saved = JSON.parse(await readFile(join(f.directory, 'index.json'), 'utf8')).find(row => row.id === progress.id);
  assert.equal(saved.status, 'in_progress', 'an unrelated save must not turn inferred interruption into a producer failure');
  await cold.update(progress);
  assert.equal((await cold.list()).find(row => row.id === progress.id).status, 'in_progress', 'live host can reconfirm an unchanged receipt');
});

test('cold reconciliation keeps the newest receipt and accepts a later real completion', async t => {
  const f = await fixture(t), progress = f.value({ updatedAtMs: 300, receivedBytes: 6 });
  await f.store.update(progress); await f.disk({ ...progress, updatedAtMs: 100, receivedBytes: 0 });
  const cold = f.reopen(); t.after(() => cold.close());
  assert.equal((await cold.list())[0].receivedBytes, 6);
  await cold.update({ ...progress, updatedAtMs: 200, receivedBytes: 4 });
  assert.equal((await cold.list())[0].receivedBytes, 6);
  const bytes = Buffer.from('finished'); await writeFile(join(f.directory, progress.id, progress.filename), bytes);
  const complete = { ...progress, updatedAtMs: 400, status: 'complete', receivedBytes: bytes.length };
  await cold.update(complete);
  const [record] = await cold.list();
  assert.equal(record.status, 'complete'); assert.equal(record.fileExists, true);
  assert.equal(record.sha256, createHash('sha256').update(bytes).digest('hex'));
});

test('legacy inferred failures recover from real producer receipts without losing removal tombstones', async t => {
  const f = await fixture(t), progress = f.value();
  await f.disk(progress);
  await writeFile(join(f.directory, 'index.json'), JSON.stringify([{ ...progress, status: 'failed',
    error: 'The download was interrupted when its desktop host exited', canPause: false, canResume: false, canCancel: false }]));
  const cold = f.reopen(); t.after(() => cold.close());
  assert.equal((await cold.list())[0].status, 'failed');
  await cold.update(progress); assert.equal((await cold.list())[0].status, 'in_progress');
  const again = f.reopen(); t.after(() => again.close());
  await again.remove(progress.id); await again.update(progress);
  assert.deepEqual(await again.list(), []);
  const final = f.reopen(); t.after(() => final.close());
  assert.deepEqual(await final.list(), []);
  assert.equal(JSON.parse(await readFile(join(f.directory, progress.id, 'record.json'), 'utf8')).id, progress.id);
});

test('a restored file needs a matching completion receipt before its bytes become deliverable', async t => {
  const f = await fixture(t), complete = f.value({ status: 'complete', receivedBytes: 8 });
  await f.store.update(complete);
  await mkdir(join(f.directory, complete.id));
  await writeFile(join(f.directory, complete.id, complete.filename), 'finished');
  assert.equal((await f.store.list())[0].fileExists, false, 'size alone is not a captured file receipt');
  await f.store.update({ ...complete, filename: 'other.txt' });
  assert.equal((await f.store.list())[0].fileExists, false);
  await f.store.update(complete);
  const [record] = await f.store.list();
  assert.equal(record.fileExists, true); assert.equal(record.fileError, undefined);
  assert.equal(record.sha256, createHash('sha256').update('finished').digest('hex'));
});

test('a failed index commit leaves both live state and the durable receipt recoverable', async t => {
  const f = await fixture(t), progress = f.value(); await f.store.update(progress);
  await mkdir(join(f.directory, 'index.json.tmp'));
  await assert.rejects(f.store.update({ ...progress, status: 'canceled', updatedAtMs: 300 }));
  assert.equal((await f.store.list())[0].status, 'in_progress');
  await rm(join(f.directory, 'index.json.tmp'), { recursive: true });
  await f.store.update({ ...progress, status: 'canceled', updatedAtMs: 300 });
  assert.equal((await f.store.list())[0].status, 'canceled');
});
