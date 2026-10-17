import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rmdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExtensionBackend } from '../src/extension/backend.mjs';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

async function fixture(t, initialJournal) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-event-retry-'));
  if (initialJournal !== undefined) await writeFile(join(dataDir, 'extension-downloads.jsonl'), initialJournal);
  const server = createServer(), token = 'isolated-event-retry-token-0123456789';
  const backend = createExtensionBackend({ server, token, dataDir });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + backend.path;
  const post = async (route, value) => {
    const response = await fetch(base + '/' + route, { method: 'POST', headers: {
      Origin: 'chrome-extension://' + 'a'.repeat(32), Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    }, body: JSON.stringify(value) });
    return { status: response.status, body: await response.json() };
  };
  const hello = { protocol: 1, authorized: true, debuggerConsent: true,
    instanceId: 'profile-event-retry', browserInstanceId: 'browser-event-retry', epoch: 'epoch-event-retry' };
  const connected = await post('connect', hello);
  assert.equal(connected.status, 200);
  const session = { sessionId: connected.body.sessionId, epoch: hello.epoch };
  t.after(async () => {
    try {
      if (backend.getDiagnostics().connectedBrowsers) await post('disconnect', { ...session, events: [] });
      await backend.close();
    }
    finally { await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); }
  });
  return { backend, dataDir, token, session, post,
    poll: events => post('poll', { ...session, events }),
    journal: join(dataDir, 'extension-downloads.jsonl') };
}
const event = (eventId, download = {}) => ({ eventId, type: 'changed', download: { id: 7, ...download } });

test('download event retries recover after a failed journal write without acknowledging lost data', async t => {
  const f = await fixture(t);
  await mkdir(f.journal);
  const value = event('retry-after-storage-repair', { state: 'in_progress', filename: '/isolated/proof.txt' });
  const failed = await f.poll([value]);
  assert.equal(failed.status, 400);
  assert.equal(failed.body.error.code, 'EISDIR');
  assert.equal(failed.body.acknowledgedEvents, undefined);
  assert.deepEqual(await f.backend.listDownloads(), []);
  await rmdir(f.journal);
  const retried = await f.poll([value]);
  assert.equal(retried.status, 200);
  assert.deepEqual(retried.body.acknowledgedEvents, [value.eventId]);
  await f.poll([value]);
  const lines = (await readFile(f.journal, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).download.state, 'in_progress');
});

test('concurrent download events serialize deduplication and merge against committed metadata', async t => {
  const f = await fixture(t), first = event('first', { state: 'in_progress', filename: '/isolated/proof.txt' });
  const results = await Promise.all([f.poll([first]), f.poll([first]), f.poll([event('finished', { state: 'complete', bytesReceived: 4 })])]);
  assert.ok(results.every(result => result.status === 200));
  const lines = (await readFile(f.journal, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(row => row.eventId), ['profile-event-retry/first', 'profile-event-retry/finished']);
  assert.equal(lines[1].download.filename, '/isolated/proof.txt');
  assert.equal((await f.backend.listDownloads())[0].state, 'complete');
  const disconnected = await f.post('disconnect', { ...f.session, events: [] });
  assert.equal(disconnected.status, 200);
  await f.backend.close();
  const restored = createExtensionBackend({ token: f.token, dataDir: f.dataDir });
  try {
    const records = await restored.listDownloads();
    assert.equal(records[0].filename, '/isolated/proof.txt');
    assert.equal(records[0].state, 'complete');
  } finally { await restored.close(); }
});

for (const partial of [false, true]) test('new acknowledged events survive reopening after ' + (partial ? 'a truncated tail' : 'an unterminated complete tail'), async t => {
  const previous = { eventId: 'profile-event-retry/previous', type: 'changed', download: { id: 'profile-event-retry/1', nativeId: 1, state: 'complete', durableDownloadConsent: false } };
  const prefix = JSON.stringify(previous) + (partial ? '\n{"eventId":"unfinished' : '');
  const f = await fixture(t, prefix);
  assert.equal((await f.backend.listDownloads()).length, 1);
  const value = event('after-crash', { state: 'complete', filename: '/isolated/after-crash.txt' });
  assert.deepEqual((await f.poll([value])).body.acknowledgedEvents, [value.eventId]);
  const text = await readFile(f.journal, 'utf8');
  assert.equal(text.startsWith(prefix), true, 'The original tail remains intact as evidence');
  await f.post('disconnect', { ...f.session, events: [] }); await f.backend.close();
  const restored = createExtensionBackend({ token: f.token, dataDir: f.dataDir });
  try {
    const records = await restored.listDownloads();
    assert.equal(records.length, 2, 'A new acknowledged event must not be glued to a previous unterminated line');
    assert.equal(records.find(record => record.nativeId === 7).filename, '/isolated/after-crash.txt');
  } finally { await restored.close(); }
});

test('a partial append failure does not consume the event or corrupt its next retry', async t => {
  const f = await fixture(t), append = fs.appendFile;
  const value = event('partial-append', { state: 'complete', filename: '/isolated/partial.txt' });
  fs.appendFile = async (path, data, options) => {
    if (path !== f.journal) return append(path, data, options);
    await append(path, Buffer.from(data).subarray(0, 31), options);
    throw Object.assign(new Error('Isolated partial disk write'), { code: 'ENOSPC' });
  };
  syncBuiltinESMExports();
  try {
    const failed = await f.poll([value]);
    assert.equal(failed.status, 400);
    assert.equal(failed.body.error.code, 'ENOSPC');
    assert.equal(failed.body.acknowledgedEvents, undefined);
    assert.deepEqual(await f.backend.listDownloads(), []);
  } finally { fs.appendFile = append; syncBuiltinESMExports(); }
  const prefix = await readFile(f.journal, 'utf8');
  assert.equal(prefix.length, 31);
  assert.deepEqual((await f.poll([value])).body.acknowledgedEvents, [value.eventId]);
  assert.ok((await readFile(f.journal, 'utf8')).startsWith(prefix));
  await f.post('disconnect', { ...f.session, events: [] }); await f.backend.close();
  const restored = createExtensionBackend({ token: f.token, dataDir: f.dataDir });
  try {
    const records = await restored.listDownloads();
    assert.equal(records.length, 1);
    assert.equal(records[0].filename, '/isolated/partial.txt');
  } finally { await restored.close(); }
});
