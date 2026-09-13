import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

const values = () => ({ name: document.querySelector('#name').value, note: document.querySelector('#note').value, checked: document.querySelector('#check').checked, language: document.querySelector('#language').value, choices: [...document.querySelector('#choices').selectedOptions].map(option => option.value), password: document.querySelector('#password')?.value ?? null, hidden: document.querySelector('#token')?.value ?? null, files: document.querySelector('#upload').files.length });

test('MHTML preserves current ordinary form values without changing the live document or exporting sensitive fields', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-form-export-'));
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/frame' ? '<input id="frame-value">' : `<!doctype html><title>Form export</title><input id="name" value="初始"><textarea id="note">旧备注</textarea><input id="check" type="checkbox" checked><select id="language"><option value="zh">中文</option><option value="en">English</option></select><select id="choices" multiple><option value="a" selected>A</option><option value="b">B</option></select><input id="password" type="password" value="initial-password-secret"><input id="token" type="hidden" value="hidden-token-secret"><input id="upload" type="file"><iframe src="/frame"></iframe><iframe src="/frame"></iframe>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = new BrowserHost(join(directory, 'profile'), { executablePath: await testBrowserExecutable(directory) }); let exported;
  t.after(async () => { await host.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); if (exported) await rm(dirname(exported), { recursive: true, force: true }); });
  const tab = await host.create('export', `http://127.0.0.1:${server.address().port}`);
  const record = await host.target('export', tab.id); await record.page.waitForLoadState('load');
  await record.page.locator('#name').fill('当前中文 <&"值');
  await record.page.locator('#note').fill('\n第一行\n第二行 & < >');
  await record.page.locator('#check').uncheck();
  await record.page.locator('#language').selectOption('en');
  await record.page.locator('#choices').selectOption(['b']);
  await record.page.locator('#password').fill('current-password-secret');
  await record.page.locator('#upload').setInputFiles({ name: 'private-file-name.txt', mimeType: 'text/plain', buffer: Buffer.from('private-file-content') });
  const childFrames = record.page.frames().filter(frame => frame !== record.page.mainFrame());
  await childFrames[0].locator('input').fill('相同 URL 第一框架'); await childFrames[1].locator('input').fill('相同 URL 第二框架');
  await record.page.evaluate(() => {
    const host = document.createElement('div'); host.id = 'shadow-form'; document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<textarea>旧 Shadow 值</textarea>';
    host.shadowRoot.querySelector('textarea').value = 'Shadow 中文新值';
    const select = document.createElement('select'); select.id = 'blank-select'; select.innerHTML = '<option>原选项</option>'; document.body.append(select); select.selectedIndex = -1;
  });
  const before = await record.page.evaluate(values);
  const html = await record.page.content();
  await record.page.evaluate(() => { window.exportEvents = []; new MutationObserver(() => exportEvents.push('mutation')).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); document.addEventListener('input', () => exportEvents.push('input')); document.addEventListener('change', () => exportEvents.push('change')); });
  exported = await host.invoke('export', tab.id, 'content.export', []);
  assert.deepEqual(await record.page.evaluate(values), before);
  assert.equal(await record.page.content(), html);
  assert.deepEqual(await record.page.evaluate(() => exportEvents), []);
  const archive = await readFile(exported, 'utf8');
  assert.equal(archive.includes('current-password-secret'), false);
  const reopened = await host.create('archive', pathToFileURL(exported).href);
  const saved = await host.target('archive', reopened.id); await saved.page.waitForLoadState('load');
  assert.deepEqual(await saved.page.evaluate(values), { ...before, password: '', hidden: null, files: 0 });
  assert.equal(await saved.page.locator('#shadow-form textarea').inputValue(), 'Shadow 中文新值');
  assert.equal(await saved.page.locator('#blank-select').inputValue(), '');
  const send = record.cdp.send.bind(record.cdp);
  record.cdp.send = async (method, args) => {
    const result = await send(method, args);
    if (method === 'Page.captureSnapshot') await record.page.locator('#name').fill('导出期间改变');
    return result;
  };
  await assert.rejects(host.invoke('export', tab.id, 'content.export', []), /form values changed while exporting/);
  const savedFrames = saved.page.frames().filter(frame => frame !== saved.page.mainFrame());
  assert.deepEqual(await Promise.all(savedFrames.map(frame => frame.locator('input').inputValue())), ['相同 URL 第一框架', '相同 URL 第二框架']);
});

test('MHTML converts the source charset with matching metadata and leaves ordinary XML data exportable', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-form-charset-')), exports = [];
  const server = createServer((req, res) => {
    if (req.url === '/xml') { res.setHeader('Content-Type', 'text/xml'); res.end('<root><input name="data">ordinary XML data</input></root>'); }
    else { res.setHeader('Content-Type', 'text/html; charset=windows-1252'); res.end(Buffer.from('<!doctype html><title>Café</title><input id="value" value="café">', 'latin1')); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = new BrowserHost(join(directory, 'profile'), { executablePath: await testBrowserExecutable(directory) });
  t.after(async () => { await host.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await Promise.all([directory, ...exports.map(dirname)].map(path => rm(path, { recursive: true, force: true }))); });
  const tab = await host.create('charset', `http://127.0.0.1:${server.address().port}`);
  const record = await host.target('charset', tab.id);
  await record.page.locator('#value').fill('当前中文é🌿');
  const exported = await host.invoke('charset', tab.id, 'content.export', []); exports.push(exported);
  const archive = await host.create('charset-archive', pathToFileURL(exported).href);
  const saved = await host.target('charset-archive', archive.id);
  assert.equal(await saved.page.title(), 'Café');
  assert.equal(await saved.page.locator('#value').inputValue(), '当前中文é🌿');
  assert.equal(await saved.page.evaluate(() => document.characterSet), 'UTF-8');
  await host.invoke('charset', tab.id, 'goto', [`http://127.0.0.1:${server.address().port}/xml`]);
  const send = record.cdp.send.bind(record.cdp); let rawXml;
  record.cdp.send = async (method, args) => { const result = await send(method, args); if (method === 'Page.captureSnapshot') rawXml = result.data; return result; };
  const xml = await host.invoke('charset', tab.id, 'content.export', []); exports.push(xml);
  assert.ok(rawXml.includes('ordinary XML data'));
  assert.equal(await readFile(xml, 'utf8'), rawXml, 'non-HTML document archives retain the browser output unchanged');
  await host.invoke('charset', tab.id, 'goto', [`http://127.0.0.1:${server.address().port}`]);
  await record.page.setContent('<iframe src="about:blank"><input value="fallback"></iframe><svg><input value="SVG data"/></svg><p>ordinary page</p>');
  const ordinary = await host.invoke('charset', tab.id, 'content.export', []); exports.push(ordinary);
  assert.ok((await readFile(ordinary, 'utf8')).includes('MIME-Version:'));
});
