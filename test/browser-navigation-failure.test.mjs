import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function fixture(firstError) {
  const events = [], loads = []; let succeeds = false, currentUrl = 'about:blank';
  const element = new EventTarget();
  Object.assign(element, { setAttribute() {}, isConnected: true,
    async loadURL(url) { loads.push(url); if (!succeeds && firstError) throw typeof firstError === 'function' ? await firstError() : firstError; currentUrl = url; element.dispatchEvent(new Event('did-navigate')); },
    reload() { loads.push('reload'); }, getURL: () => currentUrl, getTitle: () => '', isLoading: () => false,
    canGoBack: () => false, canGoForward: () => false, getZoomFactor: () => 1,
    isAudioMuted: () => false, isCurrentlyAudible: () => false });
  const hostElement = { webview: element, markRegistered: () => queueMicrotask(() => element.dispatchEvent(new Event('dom-ready'))) };
  const noop = () => {};
  const annotations = { install: async () => {}, subscribe: () => noop, invalidate: noop, dispose: async () => {} };
  const dependencies = {
    './rea/app-shared-2f2228189a8d.js': { Ff: { dispatchHostMessage: value => events.push(value) } },
    './rea/app-initial-c468e3fd7f91.js': { AW: { pages: { getHost: () => hostElement, disposeHost: noop }, removeTab: noop, isBrowserUseActive: () => false } },
    './rea/tab-content-6a1dfa5c5ac1.js': { jl: {} },
    './annotation-host.mjs': { createAnnotationHost: () => annotations },
    './rea-locale.mjs': { reaIntl: () => ({ locale: 'en', messages: {} }) },
    './extensions-host.mjs': { createExtensionsHost: () => ({ service: {}, dispose: noop }) },
    '../site-tools-policy.mjs': { siteToolsPolicyKey: '', siteToolsAllowed: () => false },
  };
  const context = vm.createContext({ console: { error() {} }, localStorage: { getItem: () => null, setItem() {} }, window: { addEventListener() {}, removeEventListener() {} }, setTimeout, clearTimeout, URL, queueMicrotask });
  const source = await readFile(new URL('../src/client/rea-browser-host.mjs', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => {
    const values = dependencies[specifier]; assert.ok(values, specifier);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [name,value] of Object.entries(values)) this.setExport(name,value); }, { context });
  });
  await module.evaluate();
  const desktop = { acquireOpenCU: async () => ({ lease: 'lease', partition: 'test' }), release: async () => {}, onOpenRequested: () => noop };
  const client = { subscribe: () => noop, getSnapshot: () => ({ sessions: [], connected: true }) };
  const transport = { setTabOwner() {}, attach: async () => noop };
  const host = module.namespace.createReaBrowserHost({ desktop, transport, client,
    sidebar: { mounted: { getSnapshot: () => 'session' }, tabsIn: () => [] },
    downloads: { attach: async () => noop }, history: { record: async () => ({ id: 'visit' }) } });
  const ids = { conversationId: 'session', browserTabId: 'tab', rendererInstanceId: 'renderer' };
  host.mountTab({ sessionId: 'session', tabId: 'tab', initialUrl: 'http://127.0.0.1:5173/', signal: new AbortController().signal });
  const ready = host.readyFor('session', 'tab'); ready.catch(() => {});
  await host.service.registerWebviewHostSession(ids);
  await host.service.registerWebviewHost(ids);
  return { host, ids, ready, loads, events, succeed: () => { succeeds = true; }, element };
}

test('initial connection refusal leaves a live guest that an explicit reload can recover', async () => {
  const error = Object.assign(new Error("ERR_CONNECTION_REFUSED (-102) loading 'http://127.0.0.1:5173/'"), { code: 'ERR_CONNECTION_REFUSED', errno: -102 });
  const f = await fixture(error);
  try {
    await f.ready;
    assert.deepEqual(f.loads, ['http://127.0.0.1:5173/']);
    assert.equal(f.host.navigationFailures.getSnapshot()[0].message, error.message);
    f.element.dispatchEvent(new Event('did-stop-loading'));
    assert.equal(f.events.at(-1).snapshot.url, 'http://127.0.0.1:5173/');
    assert.equal(f.events.at(-1).snapshot.isLoading, false);
    f.succeed();
    await f.host.service.runPageCommand({ ...f.ids, command: { type: 'reload' } });
    assert.deepEqual(f.loads, ['http://127.0.0.1:5173/', 'http://127.0.0.1:5173/']);
    assert.equal(f.host.navigationFailures.getSnapshot().length, 0);
  } finally { await f.host.dispose(); }
});

test('unknown guest initialization errors remain fatal', async () => {
  const f = await fixture(new Error('Unexpected guest transport failure'));
  try { await assert.rejects(f.ready, /Unexpected guest transport failure/); }
  finally { await f.host.dispose(); }
});

test('repeated connection refusal stays visible without automatic retries', async () => {
  const error = Object.assign(new Error('ERR_CONNECTION_REFUSED (-102)'), { errno: -102 });
  const f = await fixture(error);
  try {
    await f.ready; assert.equal(f.loads.length, 1);
    await assert.rejects(f.host.service.runPageCommand({ ...f.ids, command: { type: 'reload' } }), /ERR_CONNECTION_REFUSED/);
    assert.equal(f.loads.length, 2);
    assert.equal(f.host.navigationFailures.getSnapshot()[0].message, error.message);
  } finally { await f.host.dispose(); }
});

test('new URL navigation replaces the failed destination and clears its message on success', async () => {
  const f = await fixture(Object.assign(new Error('refused'), { code: 'ERR_CONNECTION_REFUSED' }));
  try {
    await f.ready; f.succeed();
    await f.host.service.runPageCommand({ ...f.ids, command: { type: 'navigate', url: 'https://example.invalid/new' } });
    assert.equal(f.loads.at(-1), 'https://example.invalid/new');
    assert.equal(f.host.navigationFailures.getSnapshot().length, 0);
  } finally { await f.host.dispose(); }
});

test('late old refusal does not overwrite a newer main-frame navigation', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const f = await fixture(() => pending);
  try {
    f.element.dispatchEvent(Object.assign(new Event('did-start-navigation'), { url: 'https://example.invalid/new', isMainFrame: true }));
    finish(Object.assign(new Error('old refusal'), { errno: -102 })); await f.ready;
    assert.equal(f.host.navigationFailures.getSnapshot().length, 0);
  } finally { await f.host.dispose(); }
});

test('cancelled initial navigation leaves a live guest without inventing a connection error', async () => {
  const f = await fixture(Object.assign(new Error('ERR_ABORTED'), { code: 'ERR_ABORTED', errno: -3 }));
  try {
    await f.ready; assert.equal(f.host.navigationFailures.getSnapshot().length, 0);
    f.succeed(); await f.host.service.runPageCommand({ ...f.ids, command: { type: 'navigate', url: 'https://example.invalid/new' } });
    assert.equal(f.loads.length, 2);
  } finally { await f.host.dispose(); }
});

test('dispose during initial navigation cannot resurrect a failure or a ready guest', async () => {
  let finish;
  const f = await fixture(() => new Promise(resolve => { finish = resolve; }));
  await f.host.dispose();
  finish(Object.assign(new Error('late refusal'), { errno: -102 }));
  await assert.rejects(f.ready);
  assert.equal(f.host.navigationFailures.getSnapshot().length, 0);
});

test('successful desktop initialization remains ready with no failure panel', async () => {
  const f = await fixture(null);
  try { await f.ready; assert.equal(f.host.navigationFailures.getSnapshot().length, 0); assert.equal(f.loads.length, 1); }
  finally { await f.host.dispose(); }
});

test('certificate and other navigation errors are not swallowed', async () => {
  const f = await fixture(Object.assign(new Error('ERR_CERT_AUTHORITY_INVALID'), { code: 'ERR_CERT_AUTHORITY_INVALID', errno: -202 }));
  try { await assert.rejects(f.ready, /ERR_CERT_AUTHORITY_INVALID/); }
  finally { await f.host.dispose(); }
});

test('Electron IPC-wrapped connection refusal preserves the exact diagnostic', async () => {
  const message = "Error invoking remote method 'GUEST_VIEW_MANAGER_CALL': Error: ERR_CONNECTION_REFUSED (-102) loading 'http://127.0.0.1:5173/'";
  const f = await fixture(new Error(message));
  try { await f.ready; assert.equal(f.host.navigationFailures.getSnapshot()[0].message, message); }
  finally { await f.host.dispose(); }
});

test('unrelated initialization errors merely mentioning connection refusal remain fatal', async () => {
  const f = await fixture(new Error('Adapter initialization failed after earlier ERR_CONNECTION_REFUSED (-102) loading another page'));
  try { await assert.rejects(f.ready, /Adapter initialization failed/); }
  finally { await f.host.dispose(); }
});

test('Electron IPC-wrapped initial cancellation keeps the live guest recoverable', async () => {
  const message = "Error invoking remote method 'GUEST_VIEW_MANAGER_CALL': Error: ERR_ABORTED (-3) loading 'http://127.0.0.1:5173/'";
  const f = await fixture(new Error(message));
  try {
    await f.ready; assert.equal(f.host.navigationFailures.getSnapshot().length, 0);
    f.succeed(); await f.host.service.runPageCommand({ ...f.ids, command: { type: 'navigate', url: 'https://example.invalid/new' } });
    assert.equal(f.loads.length, 2);
  } finally { await f.host.dispose(); }
});

test('unrelated initialization errors merely mentioning cancellation remain fatal', async () => {
  const f = await fixture(new Error('Adapter initialization failed after earlier ERR_ABORTED (-3) loading another page'));
  try { await assert.rejects(f.ready, /Adapter initialization failed/); }
  finally { await f.host.dispose(); }
});
