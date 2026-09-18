import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHost } from '../src/computer-use/browser.mjs';

function fixture({ retire = async () => {}, initialUrl = 'about:blank' } = {}) {
  let ready, fail, entered, current = initialUrl, retiring;
  const waiting = new Promise(resolve => { entered = resolve; });
  const stopped = new Promise(resolve => { retiring = resolve; });
  const initial = new Promise((resolve, reject) => { ready = resolve; fail = reject; });
  const calls = [];
  const page = {
    waitForLoadState: async state => { assert.equal(state, process.platform === 'win32' ? 'networkidle' : 'domcontentloaded'); calls.push('initial'); entered(); await initial; },
    waitForFunction: async predicate => { assert.match(predicate.toString(), /document.readyState/); calls.push('document'); return { dispose: async () => {} }; },
    goto: async url => { calls.push('goto'); current = url; },
    title: async () => 'Loaded page', url: () => current,
    close: async () => { calls.push('close'); },
  };
  const record = { id: 'page', page, cdp: { send: async method => {
    assert.equal(method, 'Page.stopLoading'); assert.equal(current, 'about:blank');
    calls.push('retire'); retiring(); await retire();
  } } };
  const host = {
    connection: async () => ({ context: { newPage: async () => page } }),
    bind: async () => record, claim: () => {}, viewportPresets: new Map(),
    disconnect: async () => { fail(new Error('connection closed')); },
    records: new Map(), checkConnection: () => {},
  };
  return { host, calls, waiting, ready, stopped };
}
test('the first requested URL waits for the initial document and is sent exactly once', async () => {
  const f = fixture(), pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/');
  await f.waiting; assert.deepEqual(f.calls, ['initial']);
  f.ready(); const result = await pending;
  assert.deepEqual(f.calls, ['initial', 'document', ...(process.platform === 'win32' ? ['retire'] : []), 'goto']);
  assert.equal(result.url, 'https://fixture.test/');
});
test('cancelling during initial document readiness never starts the requested navigation', async () => {
  const f = fixture(), controller = new AbortController();
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/', controller.signal);
  await f.waiting; controller.abort();
  await assert.rejects(pending, /closed|abort/i);
  assert.deepEqual(f.calls, ['initial', 'close']);
});
test('Windows first navigation waits for the native blank-loading acknowledgement', { skip: process.platform !== 'win32' }, async () => {
  let release; const barrier = new Promise(resolve => { release = resolve; });
  const f = fixture({ retire: () => barrier });
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/');
  f.ready(); await f.stopped;
  assert.equal(f.calls.includes('goto'), false);
  release(); await pending;
  assert.equal(f.calls.filter(value => value === 'goto').length, 1);
});
test('Stop during native initial loading never dispatches the destination afterwards', { skip: process.platform !== 'win32' }, async () => {
  let release; const barrier = new Promise(resolve => { release = resolve; });
  const f = fixture({ retire: () => barrier }), controller = new AbortController();
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/', controller.signal);
  f.ready(); await f.stopped; controller.abort(); release();
  await assert.rejects(pending, /abort/i);
  assert.deepEqual(f.calls, ['initial', 'document', 'retire', 'close']);
});
test('native initialization errors keep their identity and cannot trigger a navigation retry', { skip: process.platform !== 'win32' }, async () => {
  const failure = new Error('native initialization failed');
  const f = fixture({ retire: async () => { throw failure; } });
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/');
  f.ready(); await assert.rejects(pending, error => error === failure);
  assert.equal(f.calls.includes('goto'), false);
});
test('initialization never stops loading a target that is no longer blank', { skip: process.platform !== 'win32' }, async () => {
  const f = fixture({ initialUrl: 'https://already-changed.test/' });
  const pending = BrowserHost.prototype.create.call(f.host, 'session', 'https://fixture.test/');
  f.ready(); await assert.rejects(pending, /target changed/);
  assert.deepEqual(f.calls, ['initial', 'document', 'close']);
});
