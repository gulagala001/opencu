import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionTabGroups, conversationInfo } from '../browser-extension/session-groups.js';

function fixture() {
  const tabs = new Map(), native = new Map(), controls = new Map(), stored = {};
  let sequence = 100, created = 0;
  const get = (map, id, kind) => { if (!map.has(id)) throw new Error(`No ${kind} with id: ${id}`); return { ...map.get(id) }; };
  const api = {
    storage: { session: { async get(key) { return { [key]: structuredClone(stored[key]) }; }, async set(value) { Object.assign(stored, structuredClone(value)); } } },
    tabGroups: {
      async get(id) { return get(native, id, 'group'); },
      async update(id, patch) { get(native, id, 'group'); Object.assign(native.get(id), patch); return { ...native.get(id) }; },
    },
    tabs: {
      async get(id) { return get(tabs, id, 'tab'); },
      async group({ tabIds, groupId, createProperties }) {
        if (groupId === undefined) { created++; groupId = ++sequence; native.set(groupId, { id: groupId, windowId: createProperties.windowId, title: '', color: 'grey' }); }
        const group = get(native, groupId, 'group');
        for (const id of tabIds) {
          const tab = tabs.get(id); assert.equal(tab.windowId, group.windowId, 'no cross-window tab movement');
          const previous = tab.groupId; tab.groupId = groupId;
          if (previous !== groupId && ![...tabs.values()].some(tab => tab.groupId === previous)) native.delete(previous);
        }
        return groupId;
      },
    },
  };
  const tab = (id, windowId = 1) => { tabs.set(id, { id, windowId, groupId: -1, pinned: false }); return tabs.get(id); };
  const control = id => { const item = { tabId: id, stopped: false, stoppedActors: new Set() }; controls.set(id, item); return item; };
  const groups = new SessionTabGroups(api, controls);
  return { tabs, native, controls, stored, api, tab, control, groups, created: () => created };
}

test('simultaneous claims coalesce by ID/window; duplicate titles never merge conversations', async () => {
  const f = fixture(); f.tab(1); f.tab(2); f.tab(3); f.tab(4, 2); f.tab(99);
  const title = { id: 'session-one', title: '相同名称' };
  await Promise.all([f.groups.claim(f.control(1), 'a', title), f.groups.claim(f.control(2), 'b', title)]);
  assert.equal(f.created(), 1); assert.equal(f.tabs.get(1).groupId, f.tabs.get(2).groupId);
  await f.groups.claim(f.control(3), 'c', { ...title, id: 'session-two' });
  const first = f.native.get(f.tabs.get(1).groupId), second = f.native.get(f.tabs.get(3).groupId);
  assert.notEqual(first.id, second.id); assert.notEqual(first.color, second.color);
  await f.groups.claim(f.control(4), 'd', title);
  const otherWindow = f.native.get(f.tabs.get(4).groupId);
  assert.notEqual(first.id, otherWindow.id); assert.equal(first.color, otherWindow.color);
  assert.equal(f.tabs.get(99).groupId, -1); assert.equal(f.tabs.get(99).windowId, 1);
});

test('a stop racing group creation cannot leave a live-control label', async () => {
  const f = fixture(); f.tab(1); const control = f.control(1);
  let unblock, started;
  const wait = new Promise(resolve => { unblock = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const group = f.api.tabs.group;
  f.api.tabs.group = async params => { started(); await wait; return group(params); };
  const pending = f.groups.claim(control, 'a', { id: 'race', title: '竞态' });
  await entered; control.stopped = true;
  const released = f.groups.release(control); unblock(); await Promise.all([pending, released]);
  assert.equal(f.native.get(f.tabs.get(1).groupId).title, 'OMD · 竞态（已停止）');
  assert.equal(control.groupActors.size, 0);
  const count = f.created(); await f.groups.claim(control, 'a', { id: 'race', title: '旧回调' });
  assert.equal(f.created(), count);
});

test('worker recovery retains native IDs but clears stale controlling labels', async () => {
  const f = fixture(); f.tab(1);
  await f.groups.claim(f.control(1), 'old', { id: 'persisted', title: '保留的网页' });
  const groupId = f.tabs.get(1).groupId;
  const controls = new Map(), restored = new SessionTabGroups(f.api, controls);
  await restored.queue;
  assert.equal(f.native.get(groupId).title, 'OMD · 保留的网页（已停止）');
  const next = { tabId: 1, stopped: false, stoppedActors: new Set() }; controls.set(1, next);
  await restored.claim(next, 'new', { id: 'persisted', title: '保留的网页' });
  assert.equal(f.tabs.get(1).groupId, groupId); assert.equal(f.native.get(groupId).title, 'OMD · 保留的网页');
  await restored.rename({ id: 'persisted', title: '新名字' });
  assert.equal(f.native.get(groupId).title, 'OMD · 新名字');
});

test('recovery does not adopt a group whose saved identity no longer matches', async () => {
  const f = fixture(); f.tab(1); await f.groups.claim(f.control(1), 'a', { id: 'old', title: '旧任务' });
  const id = f.tabs.get(1).groupId; f.native.get(id).title = '用户自己的组';
  const restored = new SessionTabGroups(f.api, new Map()); await restored.queue;
  assert.equal(restored.groups.size, 0); assert.equal(f.native.get(id).title, '用户自己的组');
});

test('one actor stopping does not clear another controller; observers never create groups', async () => {
  const f = fixture(); f.tab(1); const control = f.control(1), info = { id: 'multi', title: '控制任务' };
  assert.equal(f.created(), 0);
  await f.groups.claim(control, 'a', info); await f.groups.claim(control, 'b', info);
  control.stoppedActors.add('a'); await f.groups.release(control, 'a');
  assert.equal(f.native.get(f.tabs.get(1).groupId).title, 'OMD · 控制任务');
  control.stoppedActors.add('b'); await f.groups.release(control, 'b');
  assert.equal(f.native.get(f.tabs.get(1).groupId).title, 'OMD · 控制任务（已停止）');
});

test('pinned tabs stay pinned and can retry; missing native groups can be recreated', async () => {
  const f = fixture(); f.tab(1).pinned = true; const control = f.control(1), info = { id: 'retry', title: '重试' };
  await assert.rejects(f.groups.claim(control, 'a', info), /固定/);
  assert.equal(f.tabs.get(1).pinned, true); assert.equal(f.created(), 0);
  f.tabs.get(1).pinned = false; await f.groups.claim(control, 'a', info);
  const old = f.tabs.get(1).groupId; f.native.delete(old); f.tabs.get(1).groupId = -1;
  await f.groups.claim(control, 'a', info); assert.notEqual(f.tabs.get(1).groupId, old);
});

test('group titles are single-line, bounded, Unicode-safe and have unnamed-session fallbacks', () => {
  assert.deepEqual(conversationInfo({ id: 'session-123456789', title: '' }), { id: 'session-123456789', title: '12345678' });
  const value = conversationInfo({ id: 'id', title: '\n中文\u202e  测试\t' + '🧭'.repeat(100) });
  assert.equal([...value.title].length, 64); assert.doesNotMatch(value.title, /[\n\t\u202e]/);
  assert.throws(() => conversationInfo({ id: '', title: '' }), /Invalid/);
  assert.throws(() => conversationInfo({ id: 'id', title: {} }), /Invalid/);
});


test('pinning a controlled tab removes its stale active membership without moving other tabs', async () => {
  const f = fixture(); f.tab(1); f.tab(2);
  const control = f.control(1), second = f.control(2), info = { id: 'pin-later', title: '固定测试' };
  await f.groups.claim(control, 'a', info); await f.groups.claim(second, 'b', info);
  const groupId = f.tabs.get(1).groupId;
  second.stopped = true; await f.groups.release(second);
  f.tabs.get(1).pinned = true; f.tabs.get(1).groupId = -1;
  await assert.rejects(f.groups.moved(1), /固定/);
  assert.equal(f.groups.members.has(1), false);
  assert.equal(f.native.get(groupId).title, 'OMD · 固定测试（已停止）');
  assert.equal(f.tabs.get(2).groupId, groupId);
});
