import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture } from './fixtures/computer-use/server.mjs';

test('cross-origin fixture responds on both localhost loopback families', async t => {
  const fixture = await startFixture(); t.after(() => fixture.close());
  const port = new URL(fixture.url).port;
  for (const host of ['127.0.0.1', '[::1]']) {
    const response = await fetch(`http://${host}:${port}/frame`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /框架按钮/);
  }
});
