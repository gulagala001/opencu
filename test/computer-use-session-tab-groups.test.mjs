import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ExtensionBrowser } from '../src/computer-use/extension-browser.mjs';
import { BrowserViews } from '../src/computer-use/browser-view.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';

async function until(read, check) {
  for (let i = 0; i < 200; i++) { const value = await read(); if (check(value)) return value; await delay(25); }
  assert.fail('Native session tab groups did not reach their expected state');
}
const nativeTab = (worker, id) => worker.evaluate(id => chrome.tabs.get(id), id);
const nativeGroup = (worker, id) => worker.evaluate(id => chrome.tabGroups.get(id), id);

test('native groups: explicit control, parallel sessions, renames, previews, stop/resume, handoff', { timeout: 60000 }, async t => {
  let host, views;
  t.after(async () => { await views?.close(); await host?.close(); });
  const env = await extensionFixture(t);
  const worker = env.context.serviceWorkers().find(w => w.url() === env.origin + 'worker.js');
  const titles = { alpha: '魔方任务', beta: '双子塔任务' };
  host = new ExtensionBrowser(env.hub, env.browser, { getSessionTitle: id => titles[id] });
  views = new BrowserViews(host);
  assert.equal(host.sessionTabGroups, true);
  const untouched = await env.context.newPage(); await untouched.goto(env.fixture.url + '/untouched');
  const existing = await env.context.newPage(); await existing.goto(env.fixture.url);
  const listed = await host.list('alpha');
  const old = listed.find(tab => tab.url === env.fixture.url + '/');
  const unrelated = listed.find(tab => tab.url.endsWith('/untouched'));
  const original = await nativeTab(worker, unrelated.nativeTabId);
  const personalGroup = await worker.evaluate(async id => {
    const group = await chrome.tabs.group({ tabIds: [id] });
    await chrome.tabGroups.update(group, { title: '个人分组', color: 'grey' }); return group;
  }, unrelated.nativeTabId);
  // Observing a page must not reserve or group it.
  await host.target('preview-only', old.id, { claim: false });
  assert.equal((await nativeTab(worker, old.nativeTabId)).groupId, -1);
  await host.disconnect('preview-only');
  await host.target('alpha', old.id);
  const first = await nativeTab(worker, old.nativeTabId), group = await nativeGroup(worker, first.groupId);
  assert.equal(group.title, 'OMD · 魔方任务');
  const [a, b] = await Promise.all([host.create('alpha', env.fixture.url + '/a'), host.create('beta', env.fixture.url + '/b')]);
  assert.equal((await nativeTab(worker, a.nativeTabId)).groupId, first.groupId, 'one native group per session/window');
  const other = await nativeTab(worker, b.nativeTabId), otherGroup = await nativeGroup(worker, other.groupId);
  assert.notEqual(other.groupId, first.groupId); assert.notEqual(otherGroup.color, group.color);
  await assert.rejects(host.target('beta', old.id), /another conversation/);
  titles.alpha = '魔方任务已改名'; await host.renameSessionGroup('alpha', titles.alpha);
  assert.equal((await nativeGroup(worker, first.groupId)).title, 'OMD · 魔方任务已改名');
  const unsubscribe = await views.subscribe(old.id, () => {});
  await host.disconnect('alpha');
  assert.equal((await nativeGroup(worker, first.groupId)).title, 'OMD · 魔方任务已改名（已停止）');
  assert.equal((await nativeGroup(worker, other.groupId)).title, 'OMD · 双子塔任务', 'another session keeps controlling');
  await host.target('alpha', old.id);
  assert.equal((await nativeTab(worker, old.nativeTabId)).groupId, first.groupId);
  assert.equal((await nativeGroup(worker, first.groupId)).title, 'OMD · 魔方任务已改名');
  host.keepForUser('alpha', a.id); await host.endTurn('alpha');
  assert.equal(existing.isClosed(), false);
  assert.equal((await nativeGroup(worker, first.groupId)).title, 'OMD · 魔方任务已改名（已停止）');
  await host.target('beta', old.id);
  assert.equal((await nativeTab(worker, old.nativeTabId)).groupId, other.groupId, 'a new explicit owner transfers only that tab');
  const after = await nativeTab(worker, unrelated.nativeTabId);
  assert.equal(after.windowId, original.windowId); assert.equal(after.groupId, personalGroup);
  assert.equal((await nativeGroup(worker, personalGroup)).title, '个人分组');
  await unsubscribe();
});

test('native groups: opener tabs, multiple windows, pinned tabs and capability fallback', { timeout: 60000 }, async t => {
  let host, views;
  t.after(async () => { await views?.close(); await host?.close(); });
  const env = await extensionFixture(t);
  const worker = env.context.serviceWorkers().find(w => w.url() === env.origin + 'worker.js');
  host = new ExtensionBrowser(env.hub, env.browser, { getSessionTitle: () => '网页任务' });
  const tab = await host.create('session-a', env.fixture.url);
  const first = await nativeTab(worker, tab.nativeTabId);
  const childId = await worker.evaluate(async id => (await chrome.tabs.create({ openerTabId: id, url: 'about:blank', active: false })).id, tab.nativeTabId);
  try { await until(() => nativeTab(worker, childId), value => value.groupId === first.groupId); }
  catch (error) { console.log('GROUP DIAGNOSTICS', JSON.stringify(await worker.evaluate(async () => ({ groups: await chrome.tabGroups.query({}), tabs: await chrome.tabs.query({}), stored: await chrome.storage.session.get(null) })))); console.log('POPUP', await env.popup.evaluate(() => chrome.runtime.sendMessage({ action: 'status' }))); throw error; }
  const windowTab = await worker.evaluate(async () => {
    const window = await chrome.windows.create({ url: 'about:blank', focused: false }); return window.tabs[0];
  });
  await until(() => nativeTab(worker, windowTab.id), value => value.status === 'complete');
  const external = (await host.list('session-a')).find(tab => tab.nativeTabId === windowTab.id);
  await host.target('session-a', external.id);
  const second = await nativeTab(worker, windowTab.id);
  assert.equal(second.windowId, windowTab.windowId, 'grouping must not move a tab between windows');
  assert.notEqual(second.groupId, first.groupId);
  assert.equal((await nativeGroup(worker, second.groupId)).color, (await nativeGroup(worker, first.groupId)).color);
  const pin = await worker.evaluate(async () => chrome.tabs.create({ url: 'about:blank', active: false, pinned: true }));
  await until(() => nativeTab(worker, pin.id), value => value.status === 'complete');
  const pinned = (await host.list('session-a')).find(tab => tab.nativeTabId === pin.id);
  await host.target('session-a', pinned.id);
  assert.equal((await nativeTab(worker, pin.id)).pinned, true, 'presentation must not unpin a user tab');
  const status = await env.popup.evaluate(() => chrome.runtime.sendMessage({ action: 'status' }));
  assert.match(status.error, /标签分组/); assert.match(status.detail, /固定/);
  await worker.evaluate(id => chrome.tabs.update(id, { pinned: false }), pin.id);
  await until(() => nativeTab(worker, pin.id), value => value.groupId !== -1);
  // Old extensions keep their existing control path; setup reports the update.
  const legacy = new ExtensionBrowser(env.hub, { ...env.browser, capabilities: ['cursor-overlay'] });
  try { assert.equal(legacy.sessionTabGroups, false); await legacy.groupSession('legacy', {}); }
  finally { await legacy.close(); }
});
