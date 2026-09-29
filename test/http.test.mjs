import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJsonBody, sendJson } from '../src/http.mjs';

test('JSON body preserves UTF-8 at every split and refuses oversized or malformed input', async () => {
  const value = { path: '中文路径/项目/😀.json', enabled: true }, bytes = Buffer.from(JSON.stringify(value));
  for (let i = 0; i <= bytes.length; i++) assert.deepEqual(await readJsonBody(Readable.from([bytes.subarray(0, i), bytes.subarray(i)])), value);
  await assert.rejects(readJsonBody(Readable.from([bytes]), { maxBytes: bytes.length - 1 }), e => e.statusCode === 413);
  await assert.rejects(readJsonBody(Readable.from([Buffer.from([0xff])])));
  await assert.rejects(readJsonBody(Readable.from(['{bad'])));
  assert.deepEqual(await readJsonBody(Readable.from([])), {});
});

test('JSON body reading has a bounded deadline', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(readJsonBody((async function* () { await new Promise(() => {}); })(), { timeoutMs: 5 }), e => e.statusCode === 408); }
  finally { clearTimeout(keepAlive); }
});

test('JSON replies serialize before headers and never write to ended responses', () => {
  const response = () => ({ headersSent: false, destroyed: false, writableEnded: false,
    writeHead(status, headers) { this.headersSent = true; this.status = status; this.headers = headers; },
    end(body) { this.body = body; this.writableEnded = true; }, destroy() { this.destroyed = true; } });
  for (const status of [200, 400, 408, 413]) {
    const res = response(); sendJson(res, status, { text: '中文' });
    assert.equal(res.status, status); assert.deepEqual(JSON.parse(res.body), { text: '中文' });
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.headers.Connection, [408, 413].includes(status) ? 'close' : undefined);
    sendJson(res, 500, { error: 'late' }); assert.equal(res.status, status);
  }
  const partial = response(); partial.headersSent = true;
  sendJson(partial, 500, {}); assert.equal(partial.destroyed, true); assert.equal(partial.body, undefined);
  const broken = response(); broken.destroyed = true; sendJson(broken, 200, {}); assert.equal(broken.status, undefined);
  const cyclic = {}; cyclic.self = cyclic;
  const res = response(); assert.throws(() => sendJson(res, 200, cyclic)); assert.equal(res.headersSent, false);
});
