import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { BrowserActions } from '../src/computer-use/browser-actions.mjs';
import { withViewportTransaction } from '../src/computer-use/browser-screenshot.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';

for (const mode of ['disconnect', 'close', 'detach']) test('browser transport ' + mode + ' rejects pending real CDP sessions', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'omd-transport-close-'));
  const host = new BrowserHost(root, { executablePath: await testBrowserExecutable(root) }); let browser, transport;
  t.after(async () => { transport?.close(); await browser?.close(); await host.close(); await rm(root, { recursive: true, force: true }); });
  const run = await host.start();
  transport = new BrowserTransport(run.endpoint);
  browser = await chromium.connectOverCDP(transport, { isLocal: true });
  const page = await browser.contexts()[0].newPage(), cdp = await page.context().newCDPSession(page);
  const write = transport.write.bind(transport); let sent, request;
  const intercepted = new Promise(resolve => { sent = resolve; });
  transport.write = message => {
    if (message.method === 'Runtime.evaluate' && message.params.expression === '21 * 2') { request = message; sent(); return; }
    write(message);
  };
  // A real Playwright CDPSession waits for this intentionally withheld reply.
  // Losing the real WebSocket must reject it even without a detach event.
  const pending = cdp.send('Runtime.evaluate', { expression: '21 * 2', returnByValue: true });
  pending.catch(() => {}); await intercepted;
  if (mode === 'detach') await cdp.detach();
  else if (mode === 'close') transport.close(); else transport.socket.terminate();
  let timer;
  try {
    await assert.rejects(Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CDP request remained pending after disconnect')), 1000); })]), /transport closed|browser.*closed|session.*closed|Target closed/i);
  } finally { clearTimeout(timer); }
  if (mode === 'detach') {
    assert.equal(transport.requests.has(request.id), false, 'detached requests cannot accumulate on a live connection');
    assert.equal(page.isClosed(), false);
    const next = await page.context().newCDPSession(page);
    assert.equal((await next.send('Runtime.evaluate', { expression: '6 * 7', returnByValue: true })).result.value, 42);
    await next.detach();
  }
});


test('cancelling an orphaned viewport capture detaches through a real dialog without changing external emulation', { timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-capture-dialog-'));
  const host = new BrowserHost(root, { executablePath: await testBrowserExecutable(root) });
  let browser, transport, dialog;
  t.after(async () => {
    await dialog?.dismiss().catch(() => {});
    transport?.close(); await browser?.close(); await host.close(); await rm(root, { recursive: true, force: true });
  });
  const run = await host.start();
  transport = new BrowserTransport(run.endpoint);
  browser = await chromium.connectOverCDP(transport, { isLocal: true });
  const page = await browser.contexts()[0].newPage(), cdp = await page.context().newCDPSession(page);
  await page.setContent('<style>body{margin:0;background:#acf}</style>Retained viewport');
  const { targetInfo } = await cdp.send('Target.getTargetInfo');
  const record = { id: targetInfo.targetId, page, cdp, transport }, actions = new BrowserActions();
  await actions.setViewport(record, { width: 640, height: 360 });
  await page.waitForFunction(() => innerWidth === 640 && innerHeight === 360);
  const write = transport.write.bind(transport), entered = Promise.withResolvers();
  let request;
  transport.write = message => {
    // Hold one actual CDPSession command without its reply. Other protocol
    // traffic, including the real page dialog and detach, still reaches Chrome.
    if (!request && message.method === 'Page.captureScreenshot') { request = message; entered.resolve(); return; }
    write(message);
  };
  const cancellation = new AbortController();
  const capture = actions.observeScreenshot(record, {}, cancellation.signal);
  const rejected = assert.rejects(capture, /cancel orphaned viewport capture/);
  await entered.promise;
  let returned = false;
  const opened = page.waitForEvent('dialog');
  const execution = page.evaluate(() => alert('Keep this real prompt open')).then(() => { returned = true; });
  void execution.catch(() => {});
  dialog = await opened;
  cancellation.abort(new Error('cancel orphaned viewport capture'));
  await rejected;
  let timer;
  try {
    assert.equal(await Promise.race([
      withViewportTransaction(record, () => 42),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Detach or the viewport transaction remained blocked by the dialog')), 3000); }),
    ]), 42);
  } finally { clearTimeout(timer); }
  assert.equal(returned, false, 'cancellation must not answer the page dialog');
  assert.equal(page.isClosed(), false);
  assert.equal(transport.sessions.has(request.sessionId), false);
  assert.equal(transport.commands.has(request.id), false);
  assert.equal(transport.requests.has(request.id), false);
  await dialog.dismiss(); dialog = null; await execution;
  assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), { width: 640, height: 360 });
  const fresh = await actions.observeScreenshot(record, {});
  assert.equal(fresh.screenshotFrame.layoutWidth, 640);
  assert.equal(fresh.screenshotFrame.layoutHeight, 360);
  await actions.setViewport(record, { width: 720, height: 400 });
  await page.waitForFunction(() => innerWidth === 720 && innerHeight === 400);
});
