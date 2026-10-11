import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserWorkspaceTabs } from '../src/client/browser-workspace-tabs.mjs';

function fixture(api) {
  const controller = new AbortController();
  const tab = { id: 'launch', kind: 'browser', contentId: 'sidebar://browser/one', signal: controller.signal,
    navigation: { revision: 1, params: { url: 'https://example.com/order' } } };
  let rows = [tab], placement;
  const sidebar = {
    tabsIn: () => rows,
    openResourceIn(sessionId, contentId, options) {
      placement = { sessionId, contentId, ...options };
      rows = rows.filter(row => row.id !== options.replaceTab);
      rows.push({ id: 'page', kind: options.kind, contentId });
      controller.abort();
    },
    closeIn(_sessionId, id) { rows = rows.filter(row => row.id !== id); },
    focus() {},
  };
  const workspace = createBrowserWorkspaceTabs({ sidebar, kind: 'opencu-browser-resource', api });
  return { tab, controller, workspace, sidebar, placement: () => placement };
}

test('native Browser URL routes once into the real OpenCU tab in the original pane', async () => {
  const calls = [];
  const target = { kind: 'tab', id: 'actual-tab', browserId: 'desktop-browser', url: 'https://example.com/order' };
  const f = fixture(async (op, id, value) => {
    calls.push({ op, id, value });
    return op === 'state' ? { enabled: true, controlEpoch: 3 } : { viewTarget: target };
  });
  const one = f.workspace.openFromHost('session', f.tab, { paneId: 'right-pane' });
  assert.equal(one, f.workspace.openFromHost('session', f.tab, { paneId: 'right-pane' }));
  const result = await one;
  assert.equal(result.identity.tabId, target.id);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].value, { action: 'new', browserId: 'browser', url: target.url, controlEpoch: 3 });
  assert.equal(f.placement().paneId, 'right-pane');
  assert.equal(f.placement().replaceTab, 'launch');
  await f.workspace.dispose();
});

test('blank browser pages remain passive and unsafe URLs never reach the runtime', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; });
  assert.equal(await f.workspace.openFromHost('session', { ...f.tab, navigation: {} }), null);
  for (const url of ['javascript:alert(1)', 'file:///private/data', 'https://example.com/\nsecret']) {
    await assert.rejects(f.workspace.openFromHost('session', { ...f.tab, navigation: { params: { url } } }), { code: 'INVALID_BROWSER_ADDRESS' });
  }
  assert.equal(calls, 0);
  await f.workspace.dispose();
});

test('closing the launcher or disposing the plugin cancels pending navigation', async () => {
  for (const closing of ['tab', 'plugin']) {
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const f = fixture(async (op, id, value, signal) => {
      if (op === 'state') return { enabled: true, controlEpoch: 3 };
      started();
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    });
    const opening = f.workspace.openFromHost('session', f.tab);
    const rejected = assert.rejects(opening, { name: 'AbortError' });
    await ready;
    if (closing === 'tab') f.controller.abort();
    else await f.workspace.dispose();
    await rejected;
    assert.equal(f.placement(), undefined);
    await f.workspace.dispose();
  }
});

test('a failed route can be retried without reusing the rejected operation', async () => {
  let reads = 0;
  const f = fixture(async op => {
    if (op === 'state' && reads++ === 0) throw new Error('Connection interrupted');
    if (op === 'state') return { enabled: true, controlEpoch: 4 };
    return { target: { kind: 'tab', id: 'new', browserId: 'desktop-browser' } };
  });
  await assert.rejects(f.workspace.openFromHost('session', f.tab), /Connection interrupted/);
  await f.workspace.openFromHost('session', f.tab);
  assert.equal(reads, 2);
  await f.workspace.dispose();
});
