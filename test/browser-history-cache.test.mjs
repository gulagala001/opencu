import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserHistory } from '../src/dsh/browser-history.mjs';

test('bounded history reads reuse parsed data but preserve external invalidation and response isolation', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'opencu-history-cache-'));
  const file = join(directory, 'browser-history.json'), original = fs.readFile;
  const store = createBrowserHistory(() => directory);
  t.after(async () => { fs.readFile = original; syncBuiltinESMExports(); await store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const row = { id: 'first', url: 'https://sample.invalid/', title: 'first', visitTime: Date.now(), extra: { value: 1 } };
  await fs.writeFile(file, JSON.stringify([row]));
  let reads = 0;
  fs.readFile = async (...args) => { if (args[0] === file) reads++; return original(...args); }; syncBuiltinESMExports();
  const first = await store.handle('search');
  first[0].extra.value = 9;
  assert.deepEqual(await store.handle('search'), [row]); assert.equal(reads, 1);
  const before = await fs.stat(file);
  const changed = { ...row, title: 'other' };
  await fs.writeFile(file, JSON.stringify([changed])); await fs.utimes(file, before.atime, before.mtime);
  assert.deepEqual(await store.handle('search'), [changed]); assert.equal(reads, 2);
  await fs.writeFile(file, '{broken'); await assert.rejects(store.handle('search'));
  await fs.unlink(file); assert.deepEqual(await store.handle('search'), []);
  await fs.writeFile(file, JSON.stringify([row]));
  assert.deepEqual(await store.handle('search'), [row]);
  const recorded = await store.handle('record', { url: row.url, title: 'new' });
  assert.deepEqual((await store.handle('search')).map(value => value.id), [recorded.id, row.id]);
  const large = { ...row, title: 'x'.repeat(4 * 1024 * 1024) };
  await fs.writeFile(file, JSON.stringify([large])); reads = 0;
  await store.handle('search', { text: 'no-match' }); await store.handle('search', { text: 'no-match' });
  assert.equal(reads, 2, 'oversized histories are read without retaining a parsed cache');
});

test('an in-flight read cannot repopulate the history cache after close', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'opencu-history-close-'));
  const file = join(directory, 'browser-history.json'), original = fs.readFile;
  const store = createBrowserHistory(() => directory);
  let release, enter, reads = 0;
  const entered = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; });
  t.after(async () => { release(); fs.readFile = original; syncBuiltinESMExports(); await store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  await fs.writeFile(file, JSON.stringify([{ id: 'only', url: 'https://sample.invalid/', visitTime: 1 }]));
  fs.readFile = async (...args) => { const value = await original(...args); if (args[0] === file) { reads++; if (reads === 1) { enter(); await gate; } } return value; }; syncBuiltinESMExports();
  const pending = store.handle('search'); await entered;
  await store.close(); release(); await pending; await store.handle('search');
  assert.equal(reads, 2, 'completed read returns its snapshot without resurrecting the closed cache');
});
