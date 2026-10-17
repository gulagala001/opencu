import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from '../src/core/storage.mjs';
import { createInputState } from '../src/browser/input-state.mjs';

for (const kind of ['controller', 'input']) for (const change of ['replace', 'modify']) test(kind + ' commit cache rejects a file changed during rename: ' + change, async t => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'opencu-commit-identity-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = kind === 'controller' ? await createStorage(directory) : null;
  const input = kind === 'input' ? await createInputState(directory, 'browser') : null;
  const path = join(directory, kind === 'controller' ? 'controller.json' : 'browser-inputs.json');
  const expected = kind === 'controller' ? { mode: 'active' } : [], rename = fs.rename;
  const persist = () => store ? store.write('controller.json', expected) : input.persist();
  let changed = false;
  try {
    fs.rename = async (...args) => {
      await rename(...args);
      if (args[1] === path && !changed) {
        changed = true;
        if (change === 'replace') {
          const external = path + '.outside'; await fs.writeFile(external, '"external replacement"'); await rename(external, path);
        } else await fs.writeFile(path, '"external modification"');
      }
    };
    syncBuiltinESMExports(); await persist();
    assert.equal(typeof JSON.parse(await fs.readFile(path, 'utf8')), 'string');
    fs.rename = rename; syncBuiltinESMExports(); await persist();
    assert.deepEqual(JSON.parse(await fs.readFile(path, 'utf8')), expected);
    assert.equal((await fs.readdir(directory)).some(name => name.endsWith('.tmp')), false);
  } finally { fs.rename = rename; syncBuiltinESMExports(); await store?.close(); }
});
