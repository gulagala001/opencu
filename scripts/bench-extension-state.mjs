import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extensionFixture, hostSource } from '../test/fixtures/extension-state.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)), ref = process.argv[2];
if (!ref || ref.startsWith('-')) throw Error('Usage: node scripts/bench-extension-state.mjs <baseline commit>');
const sources = { baseline: execFileSync('git', ['show', `${ref}:host/extensions.ts`], { cwd: root, encoding: 'utf8' }), current: hostSource() }, samples = [];
for (let pair = 0; pair < 3; pair++) for (const variant of pair % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
  const f = extensionFixture(sources[variant]);
  try {
    const results = []; for (let i = 0; i < 12; i++) results.push(await f.read());
    assert.equal(results.length, 12); assert.ok(results.every(x => x.profile.extensions.length === 6 && x.actions.actions.length === 6));
    samples.push({ pair, variant, sourceSha256: f.sourceSha256, loads: f.state.calls.length, encodes: f.state.encodes,
      responseSha256: createHash('sha256').update(JSON.stringify(results)).digest('hex') });
  } finally { await f.close(); }
}
assert.equal(new Set(samples.map(x => x.responseSha256)).size, 1, 'Complete responses changed');
console.log(JSON.stringify({ kind: 'Production host adapter with controlled Electron boundary; API call counts, not native decoding time, physical IO or full-app latency',
  platform: process.platform, node: process.version, extensions: 6, queries: 12, pairs: 3, concurrency: 1, samples }, null, 2));
