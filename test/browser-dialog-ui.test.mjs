import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { trackBrowserFrames, previewPointer } from './fixtures/computer-use/preview-input.mjs';
import { extensionSocketPath } from '../src/computer-use/extension-hub.mjs';

for (const backend of ['managed', 'extension']) test(backend + ' browser dialogs: UI delivery, navigation ordering and mouse release', {
  timeout: 90000, skip: backend === 'extension' && process.platform === 'win32',
}, async t => {
  const f = await frontendFixture(t), { page, home, root, sessionId } = f;
  await trackBrowserFrames(f.context); await page.reload();
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).waitFor();
  const fixture = await startFixture(); t.after(() => fixture.close());
  const endpoint = path => new URL('/trisoul-x/computer-use/' + path + '?session=' + sessionId, page.url()).href;
  const state = async () => (await page.request.get(endpoint('state'))).json();
  let external, controlled, browserId = 'browser';
  t.after(() => controlled?.close());
  if (backend === 'extension') {
    const prepared = await (await page.request.post(endpoint('setup'), { data: { action: 'install-extension' } })).json();
    assert.equal(prepared.extension?.installation?.prepared, true);
    external = await extensionFixture(t, { socketPath: extensionSocketPath(join(home, 'trisoul-x/computer-use')), fixture,
      profile: join(root, 'chrome-profile'), extensionPath: prepared.extension.installation.extensionPath, prepared: true });
    browserId = external.browser.id;
  }
  let sent = false;
  f.replyWith(() => {
    if (sent) return { delta: { role: 'assistant', content: '对话框页面就绪。' }, finish_reason: 'stop' };
    sent = true;
    return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'dialog-browser', type: 'function', function: { name: 'computer_use',
      arguments: JSON.stringify({ title: '打开对话框测试页面', code: `var tab = await cua.createBrowserTab(${JSON.stringify(browserId)}, ${JSON.stringify(fixture.url)}); await tab.markDeliverable(); await tab.getScreenshot();` }) } }] }, finish_reason: 'tool_calls' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '准备对话框页面' }] });
  await page.getByText('对话框页面就绪。', { exact: true }).waitFor();
  assert.ok((await state()).target, JSON.stringify(await state()));
  await until(async () => (await state()).previewAt);
  if (!external) {
    const [port, path] = (await readFile(join(home, 'trisoul-x/computer-use/browser-profile/DevToolsActivePort'), 'utf8')).trim().split('\n');
    controlled = await chromium.connectOverCDP(`ws://127.0.0.1:${port}${path}`);
  } else controlled = { contexts: () => [external.context], close: async () => {} };
  controlled.contexts()[0].on('dialog', () => {});
  const target = controlled.contexts()[0].pages().find(p => p.url().startsWith(fixture.url)); assert.ok(target);
  target.on('dialog', () => {});
  let cdp = await target.context().newCDPSession(target), box;
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
  const image = page.locator('.tx-cu-pane .tx-cu-live img').first(); await image.waitFor();
  const { click } = previewPointer(page, image, () => cdp, backend);
  await click(target.getByRole('button', { name: '打开对话框', exact: true }));
  await page.getByLabel('网页提示输入').fill('真实界面弹窗');
  await page.locator('.tx-cu-dialog').getByRole('button', { name: '确定', exact: true }).click();
  await target.waitForFunction(() => fixtureEvents.at(-1)?.value === '真实界面弹窗');
  const address = page.getByLabel('浏览器地址');
  // Delay a completed response to reproduce rapid typing while the previous
  // request is still in flight. The second Enter must not disappear.
  await page.evaluate(delayedUrl => {
    window.__cuDelayedNavigationUrl = delayedUrl;
    const original = window.fetch;
    window.__cuRestoreFetch = () => { window.fetch = original; delete window.__cuRestoreFetch; };
    window.fetch = async (...args) => {
      let delayed = false;
      if (typeof args[0] === 'string' && args[0].includes('/trisoul-x/computer-use/navigate?')) {
        try { delayed = JSON.parse(args[1]?.body ?? '{}').url === delayedUrl; } catch {}
      }
      let complete;
      if (delayed) window.__cuDelayDone = new Promise(resolve => { complete = resolve; });
      try { const response = await original.apply(window, args); if (delayed) await new Promise(resolve => { window.__cuReleaseNavigationResponse = resolve; }); return response; }
      finally { complete?.(); }
    };
  }, fixture.url + '/final');
  await address.fill(fixture.url + '/final'); await address.press('Enter');
  await until(() => controlled.contexts()[0].pages().some(p => p.url() === fixture.url + '/final'));
  const second = controlled.contexts()[0].pages().find(p => p.url() === fixture.url + '/final');
  cdp = await second.context().newCDPSession(second);
  // Retain a real old observation before navigating away. A browser URL can
  // change before the extension emits its navigation event on slower CI hosts.
  await page.waitForFunction(() => (window.__cuDelayedNavigations ?? []).length > 0 && Boolean(window.__cuReleaseNavigationResponse));
  await address.fill(fixture.url + '/mousedown-dialog'); await address.press('Enter');
  await until(() => second.url().endsWith('/mousedown-dialog'));
  await page.evaluate(() => { window.__cuReleaseNavigationResponse(); delete window.__cuReleaseNavigationResponse; });
  await page.evaluate(async () => { await window.__cuDelayDone; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); window.__cuRestoreFetch(); delete window.__cuDelayDone; });
  assert.ok(await page.evaluate(() => (window.__cuDelayedNavigations ?? []).length), 'the fixture must really retain an old navigation observation');
  await page.evaluate(async () => { for (const deliver of window.__cuDelayedNavigations) deliver(); delete window.__cuDelayedNavigationUrl; delete window.__cuDelayedNavigations; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  assert.equal(await address.inputValue(), fixture.url + '/mousedown-dialog', 'the old completed response cannot overwrite the later address');
  const dialogInputs = [], nativeDialogs = [];
  const observeInput = async response => {
    if (new URL(response.url()).pathname !== '/trisoul-x/computer-use/input') return;
    const request = response.request().postDataJSON();
    const result = await response.json().catch(() => ({}));
    dialogInputs.push({ type: request.type, x: request.x, y: request.y, frameId: request.frameId, controlEpoch: request.controlEpoch, status: response.status(), error: result.error });
  };
  page.on('response', observeInput);
  second.on('dialog', value => nativeDialogs.push(value.message()));
  await page.evaluate(() => {
    window.__dialogInputTrace = [];
    document.addEventListener('pointerdown', event => {
      const live = document.querySelector('.tx-cu-pane .tx-cu-live');
      window.__dialogInputTrace.push({ target: event.target.className, x: event.clientX, y: event.clientY, connection: live?.dataset.connection, resizing: live?.dataset.layoutBusy });
    }, { capture: true, once: true });
  });
  await click(second.getByRole('button', { name: '打开对话框', exact: true }));
  try { await page.getByText('On down', { exact: true }).waitFor(); }
  catch (error) {
    console.log('Dialog delivery diagnostics', JSON.stringify({ inputs: dialogInputs, nativeDialogs, ui: await page.evaluate(() => window.__dialogInputTrace), pageEvents: await Promise.race([second.evaluate(() => ({ events: fixtureEvents, clicks: window.geometryFixture?.clicks, active: document.activeElement?.outerHTML?.slice(0,300) })), delay(1000).then(() => 'dialog blocks page evaluation')]) }));
    throw error;
  }
  page.off('response', observeInput);
  await page.getByLabel('网页提示输入').fill('鼠标已释放');
  await page.locator('.tx-cu-dialog').getByRole('button', { name: '确定', exact: true }).click();
  await second.waitForFunction(() => fixtureEvents.at(-1)?.value === '鼠标已释放');
  await page.locator('.tx-cu-dialog').waitFor({ state: 'detached' });
  const moves = await second.evaluate(() => fixtureMoveCount); box = await image.boundingBox();
  await page.mouse.move(box.x + box.width - 5, box.y + 15);
  await second.waitForFunction(previous => fixtureMoveCount > previous && fixtureLastButtons === 0, moves);
  await address.fill(fixture.url + '/slow-navigation?replace'); await address.press('Enter');
  await until(() => fixture.navigationRequests.at(-1)?.state === 'started');
  await address.fill(fixture.url + '/interrupted'); await address.press('Enter');
  await until(() => second.url().endsWith('/interrupted'));
  assert.equal(fixture.navigationRequests.at(-1).state, 'cancelled', 'the new URL cancels the old request instead of waiting for it to finish');
  assert.deepEqual(f.errors, []);
});
