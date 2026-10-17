import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { optimizeBase64 } from '../scripts/base64-transform.mjs';
import { decodeBase64 } from '../src/client/base64.mjs';

test('build decoder transform requires exact callback and unshadowed globals', () => {
  const source = 'function run(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }';
  const transformed = optimizeBase64(source, 1);
  const helper = transformed.match(/decodeBase64 as (\w+)/)[1];
  const run = runInNewContext(transformed.replace(/^import .*;\n/, '') + ';run', { [helper]: decodeBase64 });
  for (const value of ['', 'Zg==', '5Lit5paH8J+Sqg==', '/wCA', ' Zm9v\nYmFy\t']) assert.deepEqual(run(value), Uint8Array.from(atob(value), char => char.charCodeAt(0)));
  assert.throws(() => run('invalid!'), { name: 'InvalidCharacterError' });
  for (const changed of [
    'function run(atob, value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }',
    'function run(Uint8Array, value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }',
    'function run(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(1)); }',
    'function run(value) { return Uint8Array.from(atob(value), async char => char.charCodeAt(0)); }',
    'function run(value) { return Uint8Array.from(atob(value), (char, index) => char.charCodeAt(0)); }',
    'function run(value) { return Uint8Array.from(atob(value), char => other.charCodeAt(0)); }',
    'function run(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0), owner); }',
  ]) assert.equal(optimizeBase64(changed, 0), changed);
  const collision = 'function _opencuDecodeBase64() {};' + source;
  assert.match(optimizeBase64(collision, 1), /decodeBase64 as _opencuDecodeBase64_/);
  assert.throws(() => optimizeBase64(source, 2), /expected 2, found 1/);
  const nested = 'function run(value) { return Uint8Array.from(atob(String(Uint8Array.from(atob(value), char => char.charCodeAt(0)))), char => char.charCodeAt(0)); }';
  assert.doesNotThrow(() => optimizeBase64(nested, 1));
  assert.match(optimizeBase64(source.replace('atob(value)', 'atob(_opencuDecodeBase64)'), 1), /decodeBase64 as _opencuDecodeBase64_/);
});

test('actual REA binary and compressed-content modules retain all expected decoder callsites', async () => {
  for (const [file, count] of [['wasm-7a831618ae1c.js', 1], ['app-initial-c468e3fd7f91.js', 5]]) {
    const source = await readFile(new URL('../src/client/rea/' + file, import.meta.url), 'utf8');
    const transformed = optimizeBase64(source, count);
    assert.equal((transformed.match(/import { decodeBase64 as /g) || []).length, 1);
    assert.notEqual(transformed, source);
  }
});
