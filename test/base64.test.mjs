import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBase64 } from '../src/client/base64.mjs';

test('preallocated decoder preserves atob bytes, whitespace, padding and invalid-input behavior', () => {
  const bytes = new Uint8Array(65537); for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
  assert.deepEqual(decodeBase64(Buffer.from(bytes).toString('base64')), bytes);
  for (const value of ['', 'Zg', 'Zg==', ' Zm9v\nYmFy\t', '5Lit5paH8J+Sqg==', '/wCA']) {
    const expected = Uint8Array.from(atob(value), char => char.charCodeAt(0));
    assert.deepEqual(decodeBase64(value), expected);
  }
  for (const value of ['x', 'x===', 'Zg=', 'Zm-9v', 'Zm9v!']) {
    assert.throws(() => atob(value), { name: 'InvalidCharacterError' });
    assert.throws(() => decodeBase64(value), { name: 'InvalidCharacterError' });
  }
  assert.equal(new TextDecoder().decode(decodeBase64('5Lit5paH8J+Sqg==')), '中文💪');
});
