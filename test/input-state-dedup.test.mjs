import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInputState } from '../src/browser/input-state.mjs';
import { actOnPage, releasePage } from '../src/browser/actions.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), 'opencu-input-dedup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'browser-inputs.json'), state = await createInputState(directory, 'browser');
  const record = { id: 'tab', identity: { browserId: 'browser', connectionId: 'owned:original', targetId: 'tab' }, keys: new Set(), buttons: new Set() };
  state.adopt(record);
  return { directory, path, state, record, read: async () => JSON.parse(await fs.readFile(path, 'utf8')) };
}

test('unchanged input journals coalesce only after a successful commit and detect changed files', async t => {
  const f = await fixture(t), original = fs.writeFile; let writes = 0;
  fs.writeFile = async (...args) => { if (String(args[0]).startsWith(f.path + '.')) writes++; return original(...args); };
  syncBuiltinESMExports();
  try {
    await Promise.all(Array.from({ length: 12 }, () => f.state.persist())); assert.equal(writes, 1);
    const before = await fs.stat(f.path);
    await fs.writeFile(f.path, '[ ]'); await fs.utimes(f.path, before.atime, before.mtime);
    await f.state.persist(); assert.equal(writes, 2); assert.deepEqual(await f.read(), []);
    await fs.unlink(f.path); await f.state.persist(); assert.equal(writes, 3);
    const external = join(f.directory, 'external.json'); await fs.writeFile(external, 'keep external');
    await fs.unlink(f.path); await fs.symlink(external, f.path); await f.state.persist(); assert.equal(writes, 4);
    assert.equal(await fs.readFile(external, 'utf8'), 'keep external'); assert.equal((await fs.lstat(f.path)).isSymbolicLink(), false);
    assert.equal((await fs.stat(f.path)).mode & 0o777, 0o600);
    f.record.keys.add('Shift'); const down = f.state.persist(); f.record.keys.clear(); const up = f.state.persist(); await Promise.all([down, up]);
    assert.equal(writes, 6); assert.deepEqual(await f.read(), []);
  } finally { fs.writeFile = original; syncBuiltinESMExports(); }
});

for (const phase of ['write', 'rename']) test('failed journal ' + phase + ' retains the old commit and retries without temporary files', async t => {
  const f = await fixture(t), write = fs.writeFile, rename = fs.rename;
  await f.state.persist(); f.record.keys.add('Shift');
  try {
    fs.writeFile = async (...args) => { if (phase === 'write' && String(args[0]).startsWith(f.path + '.')) throw Error('isolated write failure'); return write(...args); };
    fs.rename = async (...args) => { if (phase === 'rename' && args[1] === f.path) throw Error('isolated rename failure'); return rename(...args); };
    syncBuiltinESMExports(); await assert.rejects(f.state.persist(), /isolated/);
    assert.deepEqual(await f.read(), []); assert.equal((await fs.readdir(f.directory)).some(name => name.endsWith('.tmp')), false);
    fs.writeFile = write; fs.rename = rename; syncBuiltinESMExports(); await f.state.persist();
    assert.deepEqual((await f.read())[0].keys, ['Shift']);
    const restored = await createInputState(f.directory, 'browser'), recovered = { ...f.record, keys: new Set(), buttons: new Set() };
    assert.equal(restored.hasPending(), true); restored.adopt(recovered); assert.deepEqual([...recovered.keys], ['Shift']); assert.equal(restored.hasPending(), false);
    const foreign = await createInputState(f.directory, 'other-browser'); assert.equal(foreign.hasForeign(), true); await foreign.persist(); assert.deepEqual((await f.read())[0].keys, ['Shift']);
  } finally { fs.writeFile = write; fs.rename = rename; syncBuiltinESMExports(); }
});

test('actual actions keep down-before-dispatch and failed-release recovery with journal deduplication', async t => {
  const f = await fixture(t); let downs = 0, failUp = false;
  const record = { ...f.record, pending: new Set(), documentGeneration: 0, session: { async send() { return {}; } }, page: {
    isClosed: () => false,
    keyboard: { async down(key) { assert.ok((await f.read())[0].keys.includes(key)); downs++; }, async up(key) { assert.ok((await f.read())[0].keys.includes(key)); if (failUp) throw Error('isolated release failure'); } },
    mouse: { async down({ button }) { assert.ok((await f.read())[0].buttons.includes(button)); downs++; }, async up({ button }) { assert.ok((await f.read())[0].buttons.includes(button)); } },
  } };
  f.state.adopt(record); await f.state.persist();
  const options = { persistInputs: f.state.persist };
  await actOnPage(record, { action: 'keyDown', key: 'Shift' }, options); await f.state.persist();
  failUp = true; const failed = await releasePage(record, 100); assert.equal(failed.length, 1); await f.state.persist(); assert.deepEqual((await f.read())[0].keys, ['Shift']);
  failUp = false; assert.deepEqual(await releasePage(record, 100), []); await f.state.persist(); assert.deepEqual(await f.read(), []);
  await actOnPage(record, { action: 'mouseDown', button: 'left' }, options); await f.state.persist();
  await actOnPage(record, { action: 'mouseUp', button: 'left' }, options); await f.state.persist(); assert.deepEqual(await f.read(), []);
  assert.equal(downs, 2);
  const original = fs.rename;
  try {
    fs.rename = async (...args) => { if (args[1] === f.path) throw Error('isolated down persistence failure'); return original(...args); }; syncBuiltinESMExports();
    await assert.rejects(actOnPage(record, { action: 'keyDown', key: 'Control' }, options), /isolated down persistence/); assert.equal(downs, 2);
  } finally { fs.rename = original; syncBuiltinESMExports(); }
});
