import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from '../src/core/storage.mjs';

test('unchanged durable state skips writes but detects external replacement, removal and links', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'opencu-storage-dedup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await createStorage(directory), target = join(directory, 'controller.json');
  const original = fs.open; let writes = 0;
  fs.open = async (...args) => { if (String(args[0]).startsWith(target + '.')) writes++; return original(...args); };
  syncBuiltinESMExports();
  try {
    const value = { title: 'unchanged', userActivity: [] };
    await Promise.all(Array.from({ length: 12 }, () => store.write('controller.json', value)));
    assert.equal(writes, 1);
    const before = await fs.stat(target);
    await fs.writeFile(target, JSON.stringify({ ...value, title: 'different' }, null, 2));
    await fs.utimes(target, before.atime, before.mtime);
    await store.write('controller.json', value); assert.equal(writes, 2);
    assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), value);
    await fs.unlink(target); await store.write('controller.json', value); assert.equal(writes, 3);
    const outside = join(directory, 'external.json'); await fs.writeFile(outside, 'external proof');
    await fs.unlink(target); await fs.symlink(outside, target);
    await store.write('controller.json', value); assert.equal(writes, 4);
    assert.equal(await fs.readFile(outside, 'utf8'), 'external proof');
    assert.equal((await fs.lstat(target)).isSymbolicLink(), false);
    assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
  } finally { fs.open = original; syncBuiltinESMExports(); await store.close(); }
});

for (const phase of ['write', 'sync', 'rename']) test('failed ' + phase + ' does not cache a commit or lose retry', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'opencu-storage-retry-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await createStorage(directory), target = join(directory, 'controller.json');
  const open = fs.open, rename = fs.rename;
  try {
    await store.write('controller.json', { revision: 1 });
    fs.open = async (...args) => {
      const file = await open(...args);
      if (String(args[0]).startsWith(target + '.') && phase !== 'rename') file[phase === 'write' ? 'writeFile' : 'sync'] = async () => { throw Error('isolated ' + phase + ' failure'); };
      return file;
    };
    fs.rename = async (...args) => { if (phase === 'rename' && args[1] === target) throw Error('isolated rename failure'); return rename(...args); };
    syncBuiltinESMExports();
    await assert.rejects(store.write('controller.json', { revision: 2 }), /isolated/);
    assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { revision: 1 });
    assert.equal((await fs.readdir(directory)).some(name => name.endsWith('.tmp')), false);
    fs.open = open; fs.rename = rename; syncBuiltinESMExports();
    await store.write('controller.json', { revision: 2 });
    assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { revision: 2 });
  } finally { fs.open = open; fs.rename = rename; syncBuiltinESMExports(); await store.close(); }
});
