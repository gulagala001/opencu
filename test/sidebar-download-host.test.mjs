import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { createSidebarDownloads } from '../src/dsh/downloads.mjs';

test('actual desktop events stay ordered within one clock tick and after the clock moves backwards', async t => {
  const scratch = new URL('../.local/', import.meta.url); await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(new URL('download-host-', scratch).pathname);
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = 1000;
  const context = vm.createContext({ Buffer, console, Date: class extends Date { static now() { return now; } } });
  const { code } = await transform(await readFile(new URL('../host/downloads.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' });
  const source = new vm.SourceTextModule(code, { context });
  await source.link(async name => {
    const value = name === 'electron' ? { app: {}, dialog: {}, shell: {} } : await import(name);
    return new vm.SyntheticModule(Object.keys(value), function () { for (const [key, item] of Object.entries(value)) this.setExport(key, item); }, { context });
  });
  await source.evaluate();
  const store = createSidebarDownloads(() => root); t.after(() => store.close());
  const lease = { owner: {}, downloads: new Set(), downloadDirectory: await store.location() };
  const item = new EventEmitter(); let paused = false;
  Object.assign(item, { getFilename: () => 'report.txt', getURL: () => 'https://example.test/report', getTotalBytes: () => 8,
    getReceivedBytes: () => 4, isPaused: () => paused, canResume: () => paused, setSavePath() {} });
  assert.equal(source.namespace.captureOpenCUDownload(lease, item), true);
  const snapshot = async () => (await source.namespace.openCUDownloadOperation(lease, 'list', {}))[0];
  const started = await snapshot();
  item.emit('updated', {}, 'progressing'); const progress = await snapshot();
  paused = true; item.emit('updated', {}, 'progressing'); const pause = await snapshot();
  now = 1; paused = false; item.emit('updated', {}, 'progressing'); const resumed = await snapshot();
  item.emit('done', {}, 'cancelled'); const canceled = await snapshot();
  const receipts = [started, progress, pause, resumed, canceled];
  for (let i = 1; i < receipts.length; i++) assert(receipts[i].updatedAtMs > receipts[i - 1].updatedAtMs);
  await store.update(resumed); await store.update(pause);
  assert.equal((await store.list())[0].status, 'in_progress');
  await store.update(canceled); await store.update(progress);
  assert.equal((await store.list())[0].status, 'canceled');
  const durable = JSON.parse(await readFile(join(lease.downloadDirectory, canceled.id, 'record.json'), 'utf8'));
  assert.equal(durable.updatedAtMs, canceled.updatedAtMs); assert.equal(durable.status, 'canceled');
  assert.equal(lease.downloads.size, 0);
});
