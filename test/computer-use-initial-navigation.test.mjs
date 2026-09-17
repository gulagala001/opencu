import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHost } from '../src/computer-use/browser.mjs';

function fixture() {
  let ready, fail, entered, current = 'about:blank';
  const waiting = new Promise(resolve => { entered = resolve; });
  const initial = new Promise((resolve, reject) => { ready = resolve; fail = reject; });
  const calls = [];
  const page = {
    waitForLoadState: async state => { assert.equal(state, process.platform === 'win32' ? 'networkidle' : 'domcontentloaded'); calls.push('initial'); entered(); await initial; },
    waitForFunction: async predicate => { assert.match(predicate.toString(), /document.readyState/); calls.push('document'); return { dispose: async () => {} }; },
    goto: async url => { calls.push('goto'); current = url; },
    title: async () => 'Loaded page', url: () => current,
    close: async () => { calls.push('close'); },
  };
  const record = { id: 'page', page };
  const host = {
    connection: async () => ({ context: { newPage: async () => page } }),
    bind: async () => record, claim: () => {}, viewportPresets: new Map(),
    disconnect: async () => { fail(new Error('connection closed')); },
    records: new Map(), checkConnection: () => {},
  };
  return { host, calls, waiting, ready };
}
test('the first requested URL waits for the initial document and is sent exactly once', async () => {
  const f = fixture(), pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/');
  await f.waiting; assert.deepEqual(f.calls, ['initial']);
  f.ready(); const result = await pending;
  assert.deepEqual(f.calls, ['initial', 'document', 'goto']); assert.equal(result.url, 'https://fixture.test/');
});
test('cancelling during initial document readiness never starts the requested navigation', async () => {
  const f = fixture(), controller = new AbortController();
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/', controller.signal);
  await f.waiting; controller.abort();
  await assert.rejects(pending, /closed|abort/i);
  assert.deepEqual(f.calls, ['initial', 'close']);
});
