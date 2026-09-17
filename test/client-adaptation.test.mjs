import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputerStatePool } from '../src/client/state-pool.mjs';
import { decorateSlot } from '../src/client/slot-decoration.mjs';
import { hostPreviewUrl, openHostBrowserPreview } from '../src/client/host-browser.mjs';
import { processSummaries, operationSummary, operationIcon, operationState } from '../src/client/computer-groups.mjs';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test('chip and pane share one request, reject a late poll after navigation and dispose by last owner', async () => {
  const events = new EventTarget(), pending = [];
  const pool = createComputerStatePool({ events, visibility: null, interval: 10000, read: (id, signal) => new Promise(resolve => pending.push({ id, signal, resolve })) });
  const a = pool.subscribe('s', () => {}), b = pool.subscribe('s', () => {});
  assert.equal(pending.length, 1);
  pool.publish('s', { controlEpoch: 2, navigationRevision: 2, target: 'new' });
  pending[0].resolve({ controlEpoch: 1, navigationRevision: 1, target: 'old' }); await delay(1);
  assert.equal(pool.snapshot('s').state.target, 'new');
  pool.publish('s', { controlEpoch: 1, navigationRevision: 3, target: 'stale' });
  assert.equal(pool.snapshot('s').state.target, 'new');
  a(); assert.equal(pool.snapshot('s').state.target, 'new'); b(); assert.equal(pool.snapshot('s').state, null);
  const c = pool.subscribe('s', () => {}); assert.equal(pending.length, 2); c(); assert.ok(pending[1].signal.aborted);
  pending[1].resolve({ target: 'late' }); await delay(1); assert.equal(pool.snapshot('s').state, null);
});

test('CU state sharing remains session-isolated and applies host mutation events', async () => {
  const events = new EventTarget(); let reads = 0;
  const pool = createComputerStatePool({ events, visibility: null, interval: 10000, read: async id => { reads++; return { id }; } });
  const a = pool.subscribe('a', () => {}), b = pool.subscribe('b', () => {}); await delay(1);
  assert.equal(reads, 2); assert.equal(pool.snapshot('a').state.id, 'a');
  const event = new Event('trisoul-cu-state'); event.detail = { id: 'b', state: { id: 'b', target: 'changed' } }; events.dispatchEvent(event);
  assert.equal(pool.snapshot('a').state.target, undefined); assert.equal(pool.snapshot('b').state.target, 'changed'); a(); b();
});

function slotFixture() {
  const entries = [], listeners = new Set(); const emit = () => { for (const listener of listeners) listener(); };
  return { entries, listeners, entriesOfSlot: () => [...entries].sort((a, b) => (a.options.priority || 0) - (b.options.priority || 0)),
    subscribe: (_name, listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    register(options, component) { const entry = { options, component }; entries.push(entry); emit(); return () => { const index = entries.indexOf(entry); if (index !== -1) entries.splice(index, 1); emit(); }; },
  };
}
test('live renderer removal, replacement and two adapter layers never retain or recursively wrap a dead provider', () => {
  const slots = slotFixture(), wrap = label => original => ({ options: { ...original.options, priority: (original.options.priority || 0) - 1 }, component: () => label + '(' + original.component() + ')' });
  let removeHost = slots.register({ name: 'test', key: 'one' }, () => 'host');
  const a = decorateSlot(slots, 'test', () => true, wrap('A'));
  const b = decorateSlot(slots, 'test', () => true, wrap('B'));
  assert.equal(slots.entriesOfSlot()[0].component(), 'B(A(host))'); assert.equal(slots.entries.length, 3);
  removeHost(); assert.equal(slots.entries.length, 0);
  removeHost = slots.register({ name: 'test', key: 'one' }, () => 'new');
  assert.equal(slots.entriesOfSlot()[0].component(), 'B(A(new))'); assert.equal(slots.entries.length, 3);
  a(); assert.equal(slots.entriesOfSlot()[0].component(), 'B(new)'); assert.equal(slots.entries.length, 2);
  b(); assert.equal(slots.entries.length, 1); assert.equal(slots.listeners.size, 0); removeHost();
});

test('official browser preview uses the owning tab navigation without controlling or replacing the CU target', () => {
  const target = { kind: 'tab', id: 'one', url: 'http://127.0.0.1:8080/first' }, before = structuredClone(target);
  const calls = [], actions = { openTab: (...args) => calls.push(args) };
  const url = hostPreviewUrl(target, { tabId: 'one', url: 'https://example.com/second?q=1' });
  assert.ok(openHostBrowserPreview(actions, url)); assert.deepEqual(calls, [['browser', { params: { url } }]]); assert.deepEqual(target, before);
  assert.equal(hostPreviewUrl(target, { tabId: 'other', url: 'https://wrong.example' }), target.url);
  for (const url of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///etc/passwd', 'not a URL']) assert.equal(openHostBrowserPreview(actions, url), false);
  assert.equal(hostPreviewUrl({ kind: 'app' }), null); assert.equal(calls.length, 1);
});

test('one-pass process summaries exactly match the per-turn history scan', () => {
  const nodes = Array.from({ length: 500 }, (_, i) => ({ key: String(i), kind: i % 3 ? 'tool-call' : 'context', location: { turn: { turn: i % 35 } }, data: { root: { call: { name: i % 2 ? 'read' : 'computer_use' }, kind: 'tool-result', isError: i % 17 === 0 } } }));
  const snapshot = { order: nodes.map(n => n.key), nodes: new Map(nodes.map(n => [n.key, n])) }, results = processSummaries(snapshot);
  for (let turn = 0; turn < 35; turn++) {
    const calls = nodes.filter(n => n.kind === 'tool-call' && n.location.turn.turn === turn).map(n => n.data.root), names = calls.map(c => c.call.name);
    assert.deepEqual(results.get(turn), { label: operationSummary(names), icon: operationIcon(names), failures: calls.filter(c => operationState(c) === 'error').length, stopped: calls.filter(c => operationState(c) === 'stopped').length });
  }
});
