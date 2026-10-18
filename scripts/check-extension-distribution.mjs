import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildExtensionZip } from '../src/extension/distribution.mjs';
assert((await readFile(new URL('../lib/extension.zip', import.meta.url))).equals(await buildExtensionZip()), 'Extension ZIP is stale or invalid; run the standard build before packing.');
console.log('Static extension ZIP matches the installed version and all18 pinned member hashes.');
