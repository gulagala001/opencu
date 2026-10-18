import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const tracked = file => execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const runtime = [];
for (const file of ['lib/client.js', 'lib/client.factory.mjs', 'lib/browser-surface.js', 'lib/presentation.js']) {
  const bytes = await readFile(new URL('../' + file, import.meta.url));
  assert.equal(sha256(bytes), sha256(tracked(file)), `Rebuilt production bytes differ from committed file: ${file}`);
  runtime.push({ file, sha256: sha256(bytes), bytes: bytes.length });
}
const normalize = records => records.map(({ source, ...record }) => record);
const file = 'lib/rea-assets/manifest.json';
assert.deepEqual(normalize(JSON.parse(await readFile(new URL('../' + file, import.meta.url), 'utf8'))), normalize(JSON.parse(tracked(file))), 'Rebuilt REA resource identities differ from the commit');
console.log(JSON.stringify({ runtime, reaManifest: 'resource identities match; source provenance locations are environment-dependent' }, null, 2));
