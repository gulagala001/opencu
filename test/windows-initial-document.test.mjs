import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHost } from '../src/computer-use/browser.mjs';

function fixture({ initialize = async () => {} } = {}) {
  let initialized; const entering = new Promise(resolve => { initialized = resolve; });
  const calls = []; let current = 'about:blank';
  const page = {
    waitForLoadState: async () => {},
    waitForFunction: async () => ({ dispose: async () => {} }),
    goto: async (url, options) => { calls.push({ url, options }); if (url === 'about:blank') { initialized(); await initialize(); } current = url; },
    url: () => current, title: async () => 'Fixture', close: async () => { calls.push({ closed: true }); },
  };
  const host = { connection: async () => ({ context: { newPage: async () => page } }),
    bind: async () => ({ id: 'new-page', page, cdp: { send: async method => { assert.equal(method, 'Page.stopLoading'); assert.equal(current, 'about:blank'); } } }),
    claim() {}, checkConnection() {}, viewportPresets: new Map(), records: new Map(), disconnect: async () => {},
  };
  return { host, calls, entering };
}

test('Windows explicitly commits an empty document before its single destination request', { skip: process.platform !== 'win32' }, async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const f = fixture({ initialize: () => waiting });
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/');
  await f.entering;
  assert.deepEqual(f.calls, [{ url: 'about:blank', options: { waitUntil: 'load' } }]);
  release(); await pending;
  assert.deepEqual(f.calls.map(call => call.url), ['about:blank', 'https://fixture.test/']);
});

test('Stop during empty-document initialization prevents the destination request', { skip: process.platform !== 'win32' }, async () => {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  const f = fixture({ initialize: () => waiting }), controller = new AbortController();
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/', controller.signal);
  await f.entering; controller.abort(); release();
  await assert.rejects(pending, /abort/i);
  assert.equal(f.calls.some(call => call.url === 'https://fixture.test/'), false);
  assert.equal(f.calls.at(-1).closed, true);
});

test('empty-document errors are not hidden or followed by a destination retry', { skip: process.platform !== 'win32' }, async () => {
  const failure = new Error('initial document failed');
  const f = fixture({ initialize: async () => { throw failure; } });
  await assert.rejects(BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/'), error => error === failure);
  assert.equal(f.calls.filter(call => call.url).length, 1);
  assert.equal(f.calls.at(-1).closed, true);
});

test('an explicitly requested blank page is still navigated to exactly once', async () => {
  const f = fixture(); await BrowserHost.prototype.create.call(f.host, 'session', 'about:blank');
  assert.deepEqual(f.calls.map(call => call.url), ['about:blank']);
});

test('other platforms add no preparatory navigation', { skip: process.platform === 'win32' }, async () => {
  const f = fixture(); await BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/');
  assert.deepEqual(f.calls.map(call => call.url), ['https://fixture.test/']);
});
