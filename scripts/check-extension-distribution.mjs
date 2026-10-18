import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildExtensionZip } from '../src/extension/distribution.mjs';
assert((await readFile(new URL('../lib/extension.zip', import.meta.url))).equals(await buildExtensionZip()), 'Extension ZIP is stale or invalid; run the standard build before packing.');
console.error('Static extension ZIP matches the installed version and all pinned member hashes.');
if (process.argv[2]) {
  const { execFileSync } = await import('node:child_process');
  const { default: distribution } = await import('../src/extension/distribution.json', { with: { type: 'json' } });
  const archive = process.argv[2], tar = args => execFileSync('tar', args, { maxBuffer: 64 * 1024 * 1024 });
  const names = tar(['-tzf', archive]).toString().trimEnd().split('\n');
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert(name.startsWith('package/') && !name.includes('\\') && !name.split('/').includes('..'));
  const read = file => tar(['-xOzf', archive, '--', 'package/' + file]);
  assert(read('lib/extension.zip').equals(await buildExtensionZip()), 'Packed extension ZIP differs from this build');
  const extensionNames = names.filter(name => name.startsWith('package/extension/')).map(name => name.slice('package/extension/'.length)).sort();
  assert.deepEqual(extensionNames, Object.keys(distribution.files).sort(), 'Packaged static extension member set differs');
  for (const name of extensionNames) assert(read('extension/' + name).equals(await readFile(new URL('../extension/' + name, import.meta.url))), `Packed extension differs: ${name}`);
  assert.equal(JSON.parse(read('package.json')).version, distribution.packageVersion);
  assert(read('src/extension/distribution.json').equals(await readFile(new URL('../src/extension/distribution.json', import.meta.url))));
  console.error('Actual npm package ZIP and all pinned static extension files match the fixed build exactly.');
}
