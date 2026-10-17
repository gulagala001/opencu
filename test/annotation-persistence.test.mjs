import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

for (const phase of ['write', 'rename']) test('annotation ' + phase + ' failure preserves old records and permits retry after reopening', async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'opencu-annotations-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'annotations.json'), previous = [{ id: 'previous', note: 'Keep saved annotation' }];
  await fs.writeFile(file, JSON.stringify(previous));
  await fs.writeFile(join(directory, 'controller.json'), JSON.stringify({ version: 1,
    targets: [{ id: 'isolated:target', backend: 'browser', identity: { instance: 'private' } }] }));
  const config = { dataDir: directory, browserEnabled: false, nativeEnabled: false, extensionEnabled: false };
  let runtime = createPluginRuntime(config);
  const write = fs.writeFile, rename = fs.rename;
  try {
    await runtime.request('state');
    let injected = false;
    fs.writeFile = async (path, data, options) => {
      if (phase === 'write' && !injected && [file, file + '.tmp'].includes(String(path))) {
        injected = true;
        await write(path, String(data).slice(0, 18), options);
        throw Object.assign(Error('Isolated partial write failure'), { code: 'ENOSPC' });
      }
      return write(path, data, options);
    };
    fs.rename = async (from, to) => {
      if (phase === 'rename' && !injected && String(to) === file) {
        injected = true;
        throw Object.assign(Error('Isolated rename failure'), { code: 'EACCES' });
      }
      return rename(from, to);
    };
    syncBuiltinESMExports();
    await assert.rejects(runtime.request('annotate', { targetId: 'isolated:target', annotations: [{ text: 'New annotation' }] }), { code: phase === 'write' ? 'ENOSPC' : 'EACCES' });
    assert.equal(injected, true);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), previous);
    assert.deepEqual((await runtime.request('state')).state.annotations, previous);
    assert.equal((await fs.readdir(directory)).includes('annotations.json.tmp'), false);
    fs.writeFile = write; fs.rename = rename; syncBuiltinESMExports();
    const result = await runtime.request('annotate', { targetId: 'isolated:target', annotations: [{ text: 'New annotation' }] });
    assert.equal(result.ok, true);
    await runtime.close();
    runtime = createPluginRuntime(config);
    const state = await runtime.request('state');
    assert.equal(state.state.annotations.length, 2);
    assert.deepEqual(state.state.annotations[0], previous[0]);
    assert.equal(state.state.annotations[1].id, result.annotation.id);
  } finally {
    fs.writeFile = write; fs.rename = rename; syncBuiltinESMExports();
    await runtime.close();
  }
});
