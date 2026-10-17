import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserHistory } from '../src/dsh/browser-history.mjs';

test('bulk history removal retains URL/local-calendar-day semantics, duplicates and original order', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-history-remove-'));
  const store = createBrowserHistory(() => directory);
  t.after(async () => { try { await store.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const day = new Date(2026, 9, 16, 0, 1).getTime();
  const rows = [
    { id: 'late', url: 'https://sample.invalid/a', visitTime: new Date(2026, 9, 16, 23, 59).getTime() },
    { id: 'other-url', url: 'https://sample.invalid/b', visitTime: day },
    { id: 'early', url: 'https://sample.invalid/a', visitTime: day },
    { id: 'previous-day', url: 'https://sample.invalid/a', visitTime: day - 86400000 },
    { id: 'invalid-date', url: 'https://sample.invalid/c', visitTime: 'invalid' },
    { id: 'case-sensitive', url: 'https://sample.invalid/A', visitTime: day },
  ].map(row => ({ ...row, title: row.id, isActorVisit: false }));
  const file = join(directory, 'browser-history.json');
  await writeFile(file, JSON.stringify(rows) + '\n');
  await store.handle('remove', { entries: [] });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), rows);
  const entries = [{ url: rows[0].url, visitTime: day }, { url: rows[0].url, visitTime: day },
    { url: 'https://missing.invalid/', visitTime: day }, { url: rows[4].url, visitTime: 'invalid' }];
  const expected = rows.filter(row => !entries.some(item => item.url === row.url
    && new Date(item.visitTime).toDateString() === new Date(row.visitTime).toDateString()));
  assert.deepEqual(await store.handle('remove', { entries }), { removed: true });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), expected);
  await store.close();
  const reopened = createBrowserHistory(() => directory);
  try { assert.deepEqual(await reopened.handle('search', { maxResults: 100 }), expected); } finally { await reopened.close(); }
});

test('queued removals preserve later records and invalid input never changes persisted history', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-history-queue-'));
  const store = createBrowserHistory(() => directory);
  t.after(async () => { try { await store.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const file = join(directory, 'browser-history.json');
  const first = await store.handle('record', { url: 'https://sample.invalid/a', title: 'original' });
  const remove = store.handle('remove', { entries: [first] });
  const record = store.handle('record', { url: first.url, title: 'new visit' });
  await remove; const later = await record;
  assert.deepEqual(await store.handle('search'), [later]);
  const before = await readFile(file, 'utf8');
  await assert.rejects(store.handle('remove', { entries: null }), /Expected history/);
  assert.equal(await readFile(file, 'utf8'), before);
});
