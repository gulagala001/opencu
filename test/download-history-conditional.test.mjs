import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

test('conditional download history detects file appearance, disappearance, updates and removal without changing default reads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-download-conditional-'));
  const id = '00000000-0000-4000-8000-000000000001', folder = join(directory, 'sidebar-downloads'), file = join(folder, id, 'sample.txt');
  let runtime;
  try {
    await mkdir(join(folder, id), { recursive: true });
    await writeFile(join(folder, 'index.json'), JSON.stringify([{ id, filename: 'sample.txt', startedAtMs: 1, status: 'complete', bytes: 3 }]));
    runtime = createPluginRuntime({ dataDir: directory, browserEnabled: false, nativeEnabled: false, extensionEnabled: false });
    const request = args => runtime.request('downloads/history', args);
    const first = await request({ conditional: true });
    assert.match(first.revision, /^[a-f0-9]{64}$/); assert.equal(first.value.downloads[0].fileExists, false);
    const same = await request({ conditional: true, after: first.revision });
    assert.deepEqual(same, { ok: true, revision: first.revision, unchanged: true });
    const full = await request({ after: first.revision });
    assert.equal(full.unchanged, undefined); assert.equal(full.revision, undefined); assert.deepEqual(full.value.downloads, first.value.downloads);
    await writeFile(file, 'abc');
    const appeared = await request({ conditional: true, after: first.revision });
    assert.notEqual(appeared.revision, first.revision); assert.equal(appeared.value.downloads[0].fileExists, true);
    await unlink(file);
    const vanished = await request({ conditional: true, after: appeared.revision });
    assert.equal(vanished.value.downloads[0].fileExists, false);
    const filtered = await request({ conditional: true, after: vanished.revision, text: 'absent' });
    assert.deepEqual(filtered.value.downloads, []);
    const next = { id: '00000000-0000-4000-8000-000000000002', filename: 'active.txt', startedAtMs: 2, status: 'in_progress', receivedBytes: 2 };
    await runtime.request('downloads/update', { download: next });
    const changed = await request({ conditional: true, after: vanished.revision });
    assert.equal(changed.value.downloads.length, 2); assert.equal(changed.value.downloads[0].receivedBytes, 2);
    await runtime.request('downloads/remove', { id });
    const removed = await request({ conditional: true, after: changed.revision });
    assert.deepEqual(removed.value.downloads.map(value => value.id), [next.id]);
    first.value.downloads[0].filename = 'caller mutation';
    assert.equal((await request({})).value.downloads[0].filename, 'active.txt');
  } finally { await runtime?.close(); await rm(directory, { recursive: true, force: true }); }
});
