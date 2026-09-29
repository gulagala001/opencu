import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';
import { BrowserViews } from '../src/computer-use/browser-view.mjs';
import { viewportGeometry } from '../src/computer-use/browser-screenshot.mjs';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

async function within(pending, milliseconds, message) {
  let timer;
  try { return await Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

for (const transition of ['none', 'metrics', 'capture', 'lost-reply', 'stale', 'dialog', 'dialog-capture', 'stop']) test(`initial preview without screencast notifications: ${transition}`, { timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-initial-preview-'));
  const server = createServer((req, res) => {
    const color = req.url.startsWith('/changed') ? '20,100,200' : '240,245,250';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><style>body{margin:0;background:rgb(${color})}input{margin:40px}</style><input aria-label="Note"><script>window.fixtureEvents=[];document.querySelector('input').oninput=()=>fixtureEvents.push('input')</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixture = { url: `http://127.0.0.1:${server.address().port}`, close: () => {
    server.closeAllConnections(); return new Promise(resolve => server.close(resolve));
  } };
  let manager, close, controller, releaseCapture, dialogExecution, liveDialog;
  let promptCompleted = false;
  const entered = Promise.withResolvers(), finished = Promise.withResolvers(), dialogReady = Promise.withResolvers();
  const frames = [], events = [];
  t.after(async () => {
    releaseCapture?.();
    if (liveDialog && !promptCompleted) await liveDialog.dismiss().catch(() => {});
    try { await close?.(); }
    finally {
      try { await manager?.close(); }
      finally { await fixture.close(); await rm(root, { recursive: true, force: true }); }
    }
  });
  manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'absent') } });
  const tab = await manager.dispatch('initial-preview', 'createBrowserTab', ['browser', fixture.url], t.signal);
  controller = await manager.browser.target('initial-preview', tab.id);
  await controller.page.waitForLoadState('load');
  const before = manager.status('initial-preview');
  let navigated = false, prompted = false;
  const openPrompt = async () => {
    prompted = true;
    const opened = controller.page.waitForEvent('dialog');
    dialogExecution = controller.page.evaluate(() => alert('Initial preview must not answer this prompt')).then(() => { promptCompleted = true; });
    void dialogExecution.catch(() => {});
    liveDialog = await opened;
    await within(dialogReady.promise, 5000, 'The preview did not observe the real prompt');
    entered.resolve();
  };
  const navigate = async () => { navigated = true; await controller.page.goto(fixture.url + '/changed', { waitUntil: 'load' }); };
  const target = manager.browser.target.bind(manager.browser), patched = new WeakSet();
  manager.browser.target = async (...args) => {
    const record = await target(...args);
    if (args[0].startsWith('preview-') && !patched.has(record.cdp)) {
      patched.add(record.cdp);
      const on = record.cdp.on.bind(record.cdp);
      const send = record.cdp.send.bind(record.cdp); let metrics = 0;
      record.cdp.send = async (method, ...params) => {
        const result = await send(method, ...params);
        // The first metrics call initializes the observer; the second belongs
        // to its queued initial image. Navigation invalidates that pending read.
        if (method === 'Page.getLayoutMetrics' && ++metrics === 2) {
          if (transition === 'metrics') await navigate();
          if (transition === 'dialog') await openPrompt();
        }
        return result;
      };
      record.cdp.on = (event, listener) => on(event, event === 'Page.screencastFrame'
        ? frame => { void record.cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {}); }
        : listener);
    }
    return record;
  };
  const lostReply = Promise.withResolvers();
  let captureTransport, captureSession;
  if (transition === 'lost-reply') {
    const originalWrite = BrowserTransport.prototype.write;
    let intercepted = false, restore;
    BrowserTransport.prototype.write = function(message) {
      if (!intercepted && message.method === 'Page.captureScreenshot') {
        intercepted = true; captureTransport = this; captureSession = message.sessionId;
        const socket = this.socket, emit = socket.emit;
        socket.emit = function(event, ...args) {
          // Chrome still creates a real PNG. Lose only that protocol reply,
          // before either our transport or Playwright can settle the capture.
          if (event === 'message') {
            const reply = JSON.parse(args[0].toString());
            if (reply.id === message.id) { lostReply.resolve(reply); return true; }
          }
          return emit.call(this, event, ...args);
        };
        restore = () => { socket.emit = emit; };
      }
      return originalWrite.call(this, message);
    };
    t.after(() => { BrowserTransport.prototype.write = originalWrite; restore?.(); });
  }
  let captures = 0;
  const observe = manager.browser.observeScreenshot.bind(manager.browser);
  manager.browser.observeScreenshot = async (...args) => {
    const first = ++captures === 1;
    try {
      if (transition === 'stop' && first) {
        const gate = Promise.withResolvers(); releaseCapture = gate.resolve;
        entered.resolve(); await gate.promise;
      }
      const pending = observe(...args);
      if (transition === 'lost-reply' && first) {
        void pending.catch(() => {});
        const reply = await within(lostReply.promise, 5000, 'No actual screenshot reply was intercepted');
        assert.equal(Buffer.from(reply.result.data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        await navigate();
      }
      const result = await pending;
      if (transition === 'capture' && !navigated) await navigate();
      if (transition === 'dialog-capture' && !prompted) await openPrompt();
      if (transition === 'stale' && first) throw Object.assign(new Error('The renderer changed during its first capture'), { code: 'STALE_SCREENSHOT' });
      return result;
    } finally { if (first) finished.resolve(); }
  };
  const ready = Promise.withResolvers(); void ready.promise.catch(() => {});
  close = await manager.watchBrowser('initial-preview', tab.id, (event, value) => {
    events.push(event);
    if (event === 'frame') { frames.push(value); ready.resolve(value); }
    if (event === 'dialog' && value) dialogReady.resolve(value);
    if (event === 'failure') ready.reject(new Error(value.message));
  }, t.signal);
  if (transition === 'stop') {
    await within(entered.promise, 5000, 'Initial capture never started');
    await within(close(), 3000, 'Closing the preview waited for its blocked capture'); close = undefined;
    releaseCapture(); await within(finished.promise, 5000, 'The released capture did not settle');
    assert.equal(frames.length, 0, 'a late capture cannot publish after observation stops: ' + events.join(','));
    assert.equal(manager.browserViews.views.has(tab.id), false);
    assert.equal(controller.page.isClosed(), false, 'closing a preview preserves the controlled page');
    assert.equal(manager.status('initial-preview').controlEpoch, before.controlEpoch);
    return;
  }
  if (transition.startsWith('dialog')) {
    const dialog = await within(dialogReady.promise, 5000, 'The real page prompt was not retained');
    assert.match(dialog.message, /must not answer/);
    await within(manager.browserViews.views.get(tab.id).flushing ?? Promise.resolve(), 5000, 'The in-flight initial image did not settle after observing the dialog');
    assert.equal(frames.length, 0, 'initial capture must not publish through an observed dialog: ' + events.join(','));
    assert.ok(manager.browserViews.views.get(tab.id).dialog, 'the observed prompt must remain available');
    assert.equal(promptCompleted, false, 'the preview must not answer the prompt automatically');
    await liveDialog.dismiss();
    await dialogExecution;
  }
  const frame = await within(ready.promise, manager.browserViews.observationTimeoutMs, 'The static preview never received its initial frame');
  if (transition === 'stale') assert.ok(captures >= 2, 'a transient stale initial screenshot must be observed again');
  if (captureTransport) {
    assert.equal(captureTransport.sessions.has(captureSession), false, 'navigation detaches the orphaned screenshot session');
    assert.equal([...captureTransport.commands.values()].some(command => command.sessionId === captureSession), false, 'the native capture must settle at detach');
    assert.equal([...captureTransport.requests.values()].some(request => request.sessionId === captureSession), false, 'detached capture requests cannot accumulate');
  }
  assert.ok(captures > 0, 'a real observation must establish the missing initial image');
  assert.equal(frame.mediaType, 'image/png');
  assert.equal(Buffer.from(frame.data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(frame.width > 400 && frame.height > 200);
  const changed = ['metrics', 'capture', 'lost-reply'].includes(transition);
  assert.equal(frame.url, fixture.url + (changed ? '/changed' : '/'));
  assert.equal(navigated, changed);
  const pixel = await sharp(Buffer.from(frame.data, 'base64')).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixel], changed ? [20, 100, 200] : [240, 245, 250], 'pixels must belong to the published document');
  assert.equal(frame.loaderId, manager.browserViews.views.get(tab.id).loaderId);
  assert.equal(manager.status('initial-preview').controlEpoch, before.controlEpoch);
  assert.equal(manager.status('initial-preview').status, before.status);
  assert.deepEqual(await controller.page.evaluate(() => fixtureEvents), []);
});

test('continuously stale initial screenshots fail within the observation retry budget', { timeout: 2000 }, async t => {
  let captures = 0;
  const published = [], metrics = { cssLayoutViewport: { clientWidth: 800, clientHeight: 600 },
    cssVisualViewport: { clientWidth: 800, clientHeight: 600, pageX: 0, pageY: 0, offsetX: 0, offsetY: 0, scale: 1, zoom: 1 }, visualViewport: { clientWidth: 800 } };
  const views = new BrowserViews({ disconnect: async () => {}, observeScreenshot: async () => {
    captures++; throw Object.assign(new Error('Repeated renderer changes'), { code: 'STALE_SCREENSHOT' });
  } });
  views.observationTimeoutMs = 150;
  const view = { tabId: 'initial', sessionId: 'preview-test', listeners: new Set([() => {}]), frames: [],
    ready: Promise.resolve(), loaderId: 'doc', initialGeometry: viewportGeometry(metrics),
    record: { page: { url: () => 'about:blank' } }, cdp: { send: async () => metrics },
    document: new AbortController(), lifetime: new AbortController(),
    pending: { loaderId: 'doc', captureOnly: true }, publish: (event, value) => published.push({ event, value }) };
  views.views.set(view.tabId, view);
  t.after(() => views.stop(view));
  await views.flush(view); await view.stopping;
  assert.ok(captures > 1, 'a transient stale result must receive another observation');
  assert.equal(view.latest, undefined);
  assert.equal(view.closed, true, 'persistent instability must end the failed observation');
  assert.equal(views.views.has(view.tabId), false);
  assert.equal(published.length, 1);
  assert.equal(published[0].event, 'failure');
  assert.match(published[0].value.message, /Repeated renderer changes/);
});
