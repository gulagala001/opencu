import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const require = createRequire(import.meta.url);
const source = new URL('../host/browser-surfaces.ts', import.meta.url);
const { code } = await transform(await readFile(source, 'utf8'), { loader: 'ts', format: 'cjs', target: 'node22', define: { 'import.meta.url': JSON.stringify(source.href) } });

function fixture(t) {
  const children = [], events = [], ids = { sessionId: 'session', tabId: 'tab' };
  let releaseFailures = 0, closeFailures = 0, load;
  const contents = id => Object.assign(new EventEmitter(), { id, destroyed: false, mainFrame: { url: '' },
    isDestroyed() { return this.destroyed; }, getURL() { return this.mainFrame.url; }, getZoomFactor: () => 1,
    setZoomFactor() {}, setBackgroundThrottling() {}, invalidate() {}, setWindowOpenHandler() {}, send() {},
    loadURL(url) { this.mainFrame.url = url; return load?.promise ?? Promise.resolve(); },
    close() { events.push('destroy'); if (closeFailures-- > 0) throw Error('synthetic native close failure'); this.destroyed = true; this.emit('destroyed'); },
  });
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = contents('window'); this.contentView = { addChildView() {}, removeChildView() {} }; }
    static fromWebContents() { return window; }
    isDestroyed() { return this.destroyed === true; }
    setIgnoreMouseEvents() {}
    destroy() { this.destroyed = true; }
  }
  const window = new Window(), owner = contents('owner'); owner.session = {};
  class View {
    constructor() { this.webContents = contents('child-' + children.length); children.push(this.webContents); }
    getBounds() { return this.bounds; }
    setBounds(bounds) { this.bounds = bounds; }
  }
  const electron = { app: { commandLine: { appendSwitch() {} } }, BrowserWindow: Window, WebContentsView: View };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'electron' ? electron : require(name), module, module.exports);
  const host = new module.exports.OpenCUBrowserSurfaces(() => {}, async child => {
    events.push('release:' + child.id); if (releaseFailures-- > 0) throw Error('synthetic input release failure');
  }, () => false);
  const ownerEvent = { sender: owner, senderFrame: owner.mainFrame };
  const create = () => host.operate(ownerEvent, 'create', { ...ids, initialUrl: 'about:blank', locale: 'en', theme: 'light' });
  const initialize = () => { const child = children.at(-1); return host.operate({ sender: child, senderFrame: child.mainFrame }, 'init', {}); };
  const close = () => host.operate(ownerEvent, 'close', ids);
  t.after(async () => { releaseFailures = closeFailures = 0; load?.resolve(); await close(); });
  return { host, create, initialize, close, children, events, ownerEvent, ids,
    set releaseFailures(value) { releaseFailures = value; }, set closeFailures(value) { closeFailures = value; }, set load(value) { load = value; } };
}

for (const failure of ['release', 'close']) test('host retries exact surface cleanup after ' + failure + ' failure', async t => {
  const f = fixture(t), creating = f.create(); await f.initialize(); await creating;
  f[failure + 'Failures'] = 1;
  await assert.rejects(f.close(), error => /synthetic .* failure/.test([error.message, ...(error.errors ?? []).map(value => value.message)].join(' ')));
  const attempts = f.events.filter(value => value.startsWith('release:')).length;
  await assert.rejects(f.create(), /no longer available|closed/);
  if (failure === 'release') assert.equal(f.children[0].isDestroyed(), false, 'unknown input release keeps its exact guest available for retry');
  await f.close();
  assert.equal(f.events.filter(value => value.startsWith('release:')).length, attempts + 1, 'a missing record is not a successful retry');
  assert.equal(f.children.length, 1, 'failed cleanup keeps the original occurrence');
  assert.equal(f.children[0].isDestroyed(), true);
});

test('host close rejects an in-flight creation and a late load cannot revive its surface', async t => {
  const f = fixture(t), load = Promise.withResolvers(); f.load = load;
  const creating = f.create().then(value => ({ value }), error => ({ error })); await f.initialize();
  await f.close(); load.resolve();
  const result = await creating;
  assert.ok(result.error); assert.equal(f.children[0].isDestroyed(), true);
  assert.equal(f.events.filter(value => value.startsWith('release:')).length, 1);
});
