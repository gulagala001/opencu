import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Build output is not committed. Rebuild from the same checkout and require identical bytes,
// so a release package can always be reproduced from its tagged source.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['lib/client.js', 'lib/browser-surface.js', 'lib/presentation.js', 'lib/page-annotations.js', 'lib/page-cursor.js', 'lib/rea-assets/manifest.json'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshot = async () => Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await readFile(new URL('../' + file, import.meta.url)))])));
const normalize = text => JSON.stringify(JSON.parse(text).map(({ source, ...record }) => record));
const manifest = async () => normalize(await readFile(new URL('../lib/rea-assets/manifest.json', import.meta.url), 'utf8'));
const before = await snapshot(), identities = await manifest();
const rebuilt = spawnSync(process.execPath, ['scripts/build-client.mjs'], { cwd: root, stdio: 'inherit' });
assert.equal(rebuilt.status, 0, 'Client rebuild failed');
const after = await snapshot();
for (const file of files) if (file !== 'lib/rea-assets/manifest.json') assert.equal(after[file], before[file], `Rebuilt production bytes differ: ${file}`);
// Source provenance paths depend on the machine; resource identities must not.
assert.equal(await manifest(), identities, 'Rebuilt REA resource identities differ');
console.log(JSON.stringify(after, null, 2));
