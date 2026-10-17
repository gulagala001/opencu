import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createDocumentSource, documentSourceBytes } from '../src/client/document-source.mjs';

test('document sources have stable distinct identities and transfer only independent snapshots', () => {
  const original = new Uint8Array([9, 1, 2, 3, 8]), bytes = original.subarray(1, 4);
  const source = createDocumentSource(bytes), other = createDocumentSource(bytes);
  assert.equal(Object.isFrozen(source), true);
  assert.notEqual(String(source), String(other));
  assert.equal(String(source), String(source));
  const first = documentSourceBytes(source);
  assert.deepEqual(first, new Uint8Array([1, 2, 3]));
  const transferred = structuredClone(first, { transfer: [first.buffer] });
  assert.equal(first.byteLength, 0);
  transferred[0] = 7;
  assert.deepEqual(documentSourceBytes(source), new Uint8Array([1, 2, 3]));
  assert.deepEqual(original, new Uint8Array([9, 1, 2, 3, 8]));
  bytes[0] = 6;
  assert.deepEqual(documentSourceBytes(source), new Uint8Array([1, 2, 3]));
  for (const value of [undefined, null, '', 'data:application/pdf;base64,AQID', {}]) assert.equal(documentSourceBytes(value), undefined);
});

test('actual PDF loader accepts source bytes and preserves legacy data URL validation', async () => {
  const source = await readFile(new URL('../src/client/rea/document-da61479b7b62.js', import.meta.url), 'utf8');
  const decoder = source.split(String.fromCharCode(10)).find(line => line.startsWith('function s('));
  const decode = runInNewContext('(' + decoder + ')', { Host: { documentSourceBytes }, window: { atob }, Uint8Array });
  const original = new Uint8Array([0, 255, 128, 1]), token = createDocumentSource(original);
  assert.deepEqual(decode(token), original);
  assert.notEqual(decode(token).buffer, original.buffer);
  assert.deepEqual(decode('data:application/pdf;base64,AP+AAQ=='), original);
  assert.equal(decode('https://example.invalid/a.pdf'), null);
  assert.equal(decode('data:application/pdf;base64,invalid!'), null);
});

test('actual notebook decoder accepts snapshots and keeps legacy Base64 bytes', async () => {
  const source = await readFile(new URL('../src/client/rea/notebook-preview-panel-3f8901f8935f.js', import.meta.url), 'utf8');
  const decoder = source.split(String.fromCharCode(10)).find(line => line.startsWith('function je('));
  const decode = runInNewContext('(' + decoder + ')', { Host: { documentSourceBytes }, atob, Uint8Array });
  const bytes = new TextEncoder().encode(JSON.stringify({ cells: [], title: '中文🙂' }));
  assert.deepEqual(decode(createDocumentSource(bytes)), bytes);
  assert.deepEqual(decode(Buffer.from(bytes).toString('base64')), bytes);
  assert.throws(() => decode('invalid!'), { name: 'InvalidCharacterError' });
});
