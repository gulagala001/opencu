import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { frontendComponents } from './fixtures/frontend-components.mjs';

const html = (await readFile(new URL('../browser-extension/popup.html', import.meta.url), 'utf8'))
  .replace(/<link rel="stylesheet"[^>]*>/u, '')
  .replace(/<script src="popup\.js" type="module"><\/script>/u, '');
const script = await readFile(new URL('../browser-extension/popup.js', import.meta.url), 'utf8');

for (const { action, button } of [
  { action: 'stop', button: '停止' },
  { action: 'disconnect', button: '断开连接' },
]) {
  test(`popup sends ${action} clicked during a pending status refresh`, async t => {
    const { page } = await frontendComponents(t);
    await page.setContent(html);
    await page.evaluate(() => {
      const current = { connected: true, controls: [{ id: 71, title: 'Fixture tab', url: 'https://example.test/' }] };
      const calls = [];
      let statuses = 0;
      window.popupProbe = { calls, pending: false, release: null };
      window.chrome = { runtime: { sendMessage: message => {
        calls.push(message);
        if (message.action === 'status' && ++statuses === 2) {
          window.popupProbe.pending = true;
          return new Promise(resolve => { window.popupProbe.release = () => resolve(current); });
        }
        return Promise.resolve(message.action === 'status' ? current : { ...current, controls: [] });
      } } };
    });
    await page.addScriptTag({ type: 'module', content: script });
    await page.getByRole('button', { name: button, exact: true }).waitFor();
    await page.waitForFunction(() => window.popupProbe.pending);
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.evaluate(() => window.popupProbe.release());
    await page.waitForFunction(expected => window.popupProbe.calls.some(call => call.action === expected), action, { timeout: 2000 });
  });
}

test('popup keeps the Stop button through a status refresh between pointer down and up', async t => {
  const { page } = await frontendComponents(t);
  await page.setContent(html);
  await page.evaluate(() => {
    const calls = [], current = { connected: true, controls: [{ id: 71, title: 'Fixture tab', url: 'https://example.test/' }] };
    window.popupProbe = { calls, poll: null };
    window.chrome = { runtime: { sendMessage: message => {
      calls.push(message);
      return Promise.resolve(message.action === 'stop' ? { ...current, controls: [] } : current);
    } } };
    window.setInterval = callback => { window.popupProbe.poll = callback; return 1; };
  });
  await page.addScriptTag({ type: 'module', content: script });
  const stop = page.getByRole('button', { name: '停止', exact: true });
  await stop.waitFor();
  const original = await stop.elementHandle(), box = await stop.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.evaluate(() => window.popupProbe.poll());
  const sameButton = await original.evaluate(element => element.isConnected);
  await page.mouse.up();
  const stopSent = await page.evaluate(() => window.popupProbe.calls.some(call => call.action === 'stop' && call.tabId === 71));
  assert.deepEqual({ sameButton, stopSent }, { sameButton: true, stopSent: true });
});

test('popup exposes transport failure and stop retry without losing the retained button', async t => {
  const {page, errors} = await frontendComponents(t, {width: 320, height: 620});
  await page.setContent(html);
  await page.addStyleTag({content: await readFile(new URL('../browser-extension/popup.css', import.meta.url), 'utf8')});
  await page.evaluate(() => {
    const state = {connected: true, controls: [{id: 71, title: 'Fixture tab', url: 'https://example.test/'}]};
    window.popupProbe = {state, unavailable: false};
    window.chrome = {runtime: {sendMessage: async () => {
      if (window.popupProbe.unavailable) throw Error('Fixture transport disconnected');
      return window.popupProbe.state;
    }}};
    window.setInterval = callback => {window.popupProbe.poll = callback; return 1;};
  });
  await page.addScriptTag({type: 'module', content: script});
  await page.getByText('已连接 Oh My DSH', {exact: true}).waitFor();
  const button = await page.getByRole('button', {name: '停止', exact: true}).elementHandle();
  await page.evaluate(async () => {window.popupProbe.unavailable = true; await window.popupProbe.poll();});
  await page.getByText('连接状态暂不可用', {exact: true}).waitFor();
  assert.equal(await page.getByRole('button', {name: '停止', exact: true}).isEnabled(), false);
  await page.getByRole('button', {name: '连接 Oh My DSH', exact: true}).waitFor();
  await page.evaluate(async () => {
    window.popupProbe.unavailable = false;
    window.popupProbe.state.controls[0].stopError = 'Fixture pending key release';
    await window.popupProbe.poll();
  });
  await page.getByRole('button', {name: '重试停止', exact: true}).waitFor();
  await page.getByRole('alert').filter({hasText: 'pending key release'}).waitFor();
  assert.equal(await button.evaluate(node => node.isConnected), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.emulateMedia({colorScheme: 'dark'});
  assert.deepEqual(errors, []);
});
