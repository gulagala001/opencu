import assert from 'node:assert/strict';
import test from 'node:test';
import { extensionFixture } from './fixtures/extension-state.mjs';

test('one state query shares action/profile icons but the next query reads fresh values', async () => {
  const f = extensionFixture();
  try {
    const first = await f.read(); assert.equal(f.state.calls.length, 6); assert.equal(f.state.encodes, 6);
    for (let i = 0; i < 6; i++) assert.equal(first.actions.actions[i].iconDataUrl, first.profile.extensions[i].iconDataUrl);
    f.state.generation++; const second = await f.read();
    assert.equal(f.state.calls.length, 12); assert.notEqual(first.profile.extensions[0].iconDataUrl, second.profile.extensions[0].iconDataUrl);
    assert.equal(second.profile.extensions.length, 6); assert.equal(second.actions.actions.length, 6);
  } finally { await f.close(); }
});
test('tab overrides and missing actions keep their output without extra icon reads', async () => {
  const f = extensionFixture();
  try {
    f.state.actions = [{ id: 'extension-0', title: 'global', tabs: { 73: { title: 'tab', text: '7', color: [1, 2, 3, 255], enabled: false, popup: 'popup.html' } } }, { id: 'uninstalled', title: 'pending' }];
    const result = await f.read(); assert.equal(f.state.calls.length, 6);
    const action = result.actions.actions[0]; assert.equal(action.title, 'tab'); assert.equal(action.badgeText, '7');
    assert.equal(action.enabled, false); assert.equal(action.hasPopup, true); assert.equal(action.badgeBackgroundColor, 'rgba(1,2,3,1)');
    assert.equal(result.actions.actions[1].iconDataUrl, undefined); assert.equal(result.profile.extensions.length, 6);
  } finally { await f.close(); }
});
test('missing and forbidden icon paths stay absent and are retried in later queries', async () => {
  const f = extensionFixture();
  try {
    f.state.empty.add('/synthetic/extensions/0/icon.png'); f.state.extensions[1].manifest.icons = { 32: '../outside.png' };
    f.state.extensions[2].manifest.icons = {}; const first = await f.read();
    assert.equal(f.state.calls.length, 4); assert.equal(f.state.encodes, 3);
    assert.equal(first.profile.extensions[0].iconDataUrl, undefined);
    assert.equal(first.profile.extensions[1].iconDataUrl, undefined); assert.equal(first.profile.extensions[2].iconDataUrl, undefined);
    f.state.empty.clear(); const second = await f.read(); assert.equal(f.state.calls.length, 8);
    assert.ok(second.profile.extensions[0].iconDataUrl); assert.equal(second.profile.extensions[1].iconDataUrl, undefined);
  } finally { await f.close(); }
});
test('profiles do not share icons and a failed query never poisons a later read', async () => {
  const a = extensionFixture(), b = extensionFixture();
  try {
    b.state.generation = 9; const first = await a.read(), other = await b.read();
    assert.notEqual(first.profile.extensions[0].iconDataUrl, other.profile.extensions[0].iconDataUrl);
    a.state.failed.add('/synthetic/extensions/0/icon.png'); await assert.rejects(a.read(), /synthetic image failure/);
    a.state.failed.clear(); a.state.generation = 10; const retry = await a.read();
    assert.notEqual(first.profile.extensions[0].iconDataUrl, retry.profile.extensions[0].iconDataUrl);
    assert.equal((await b.read()).profile.extensions[0].iconDataUrl, other.profile.extensions[0].iconDataUrl);
  } finally { await a.close(); await b.close(); }
});
test('owner and liveness checks still run before native icon access', async () => {
  const f = extensionFixture();
  try {
    await assert.rejects(f.read({ isDestroyed: () => false }), /guest is unavailable/); assert.equal(f.state.calls.length, 0);
    f.state.unavailable = true; await assert.rejects(f.read(), /guest is unavailable/); assert.equal(f.state.calls.length, 0);
  } finally { await f.close(); }
});
