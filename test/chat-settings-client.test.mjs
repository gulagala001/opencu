import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatSettings } from '../src/client/chat-settings.mjs';

function form(mode = 'host') {
  const listeners = new Set(), calls = [];
  let snapshot = { mode, writable: mode === 'host', value: { transcriptView: 'detailed', performanceUsage: 'detailed' } };
  return {
    calls, listeners,
    getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    accept(value) { snapshot = { ...snapshot, value: { ...snapshot.value, ...value } }; for (const listener of listeners) listener(); },
    set(field, value) { return new Promise((resolve, reject) => calls.push({ field, value, resolve, reject })); },
  };
}

test('pending Chat choices survive stale describes and keep the last explicit choice queued', async () => {
  const host = form(), settings = createChatSettings(() => host, () => () => {});
  try {
    const compact = settings.set('transcriptView', 'compact');
    const first = settings.getSnapshot(); assert.equal(settings.getSnapshot(), first, 'snapshots retain reference identity between changes');
    host.accept({ transcriptView: 'detailed' });
    assert.equal(settings.getSnapshot().value.transcriptView, 'compact', 'an older describe cannot erase the pending choice');
    const detailed = settings.set('transcriptView', 'detailed');
    assert.deepEqual(host.calls.map(call => call.value), ['compact', 'detailed']);
    host.calls[0].resolve(true); await compact;
    host.accept({ transcriptView: 'compact' });
    assert.equal(settings.getSnapshot().value.transcriptView, 'detailed', 'the superseded acknowledgement cannot replace the latest selection');
    host.accept({ transcriptView: 'detailed' }); host.calls[1].resolve(true); await detailed;
    assert.equal(settings.getSnapshot(), host.getSnapshot());
    host.accept({ transcriptView: 'verbose' }); assert.equal(settings.getSnapshot().value.transcriptView, 'verbose', 'external changes resume after settlement');
  } finally { settings.dispose(); }
});

test('the namespace remains fenced across fields and restores accepted values on refusal or transport failure', async () => {
  const host = form(), settings = createChatSettings(() => host, () => () => {});
  try {
    const transcript = settings.set('transcriptView', 'compact'), performance = settings.set('performanceUsage', 'compact');
    host.calls[0].resolve(true); await transcript;
    host.accept({ transcriptView: 'detailed', performanceUsage: 'detailed' });
    assert.deepEqual(settings.getSnapshot().value, { transcriptView: 'compact', performanceUsage: 'compact' });
    host.accept({ transcriptView: 'compact' }); host.calls[1].resolve(false); assert.equal(await performance, false);
    assert.deepEqual(settings.getSnapshot().value, { transcriptView: 'compact', performanceUsage: 'detailed' });
    const failed = settings.set('transcriptView', 'verbose');
    host.calls[2].reject(new Error('wire lost')); await assert.rejects(failed, /wire lost/);
    assert.equal(settings.getSnapshot().value.transcriptView, 'compact');
    host.set = () => { throw new Error('synchronous refusal'); };
    await assert.rejects(settings.set('transcriptView', 'verbose'), /synchronous refusal/);
    assert.equal(settings.getSnapshot(), host.getSnapshot());
  } finally { settings.dispose(); }
});

test('pending owners remain isolated; disposal does not cancel writes or change memory-only policy', async () => {
  const standalone = form(), integrated = form(), memory = form('memory'); let owner = standalone, changed, live = true;
  const settings = createChatSettings(() => { if (!live) throw new Error('disposed scope'); return owner; }, listener => { changed = listener; return () => { changed = null; }; });
  let updates = 0; settings.subscribe(() => updates++);
  const pending = settings.set('transcriptView', 'compact');
  owner = integrated; changed(); assert.equal(settings.getSnapshot().value.transcriptView, 'detailed');
  owner = standalone; changed(); assert.equal(settings.getSnapshot().value.transcriptView, 'compact');
  owner = integrated; changed();
  standalone.accept({ transcriptView: 'compact' }); standalone.calls[0].resolve(true); await pending;
  assert.equal(settings.getSnapshot(), integrated.getSnapshot());
  owner = memory; changed(); const before = updates;
  const local = settings.set('performanceUsage', 'compact'); memory.calls[0].resolve(false); await local;
  assert.equal(updates, before, 'memory-only choices remain the native policy’s process-local state');
  owner = integrated; changed(); const closing = settings.set('transcriptView', 'verbose');
  settings.dispose(); live = false; const stopped = updates;
  integrated.accept({ transcriptView: 'verbose' }); integrated.calls[0].resolve(true); await closing;
  assert.equal(updates, stopped); assert.equal(integrated.listeners.size, 0); assert.equal(changed, null);
});

test('subscriber failures and reentrant choices cannot interrupt or reorder native writes', async t => {
  const host = form(), settings = createChatSettings(() => host, () => () => {}), errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  settings.subscribe(() => { throw new Error('observer failed'); });
  let newer;
  settings.subscribe(() => {
    if (settings.getSnapshot().value.transcriptView === 'compact') newer = settings.set('transcriptView', 'verbose');
  });
  try {
    const older = settings.set('transcriptView', 'compact');
    assert.deepEqual(host.calls.map(call => call.value), ['compact', 'verbose']);
    host.calls[0].resolve(true); await older;
    host.calls[1].reject(new Error('last write failed')); await assert.rejects(newer, /last write failed/);
    assert.equal(settings.getSnapshot(), host.getSnapshot(), 'the last rejection removes the overlay even after an earlier success');
    assert.ok(errors.some(args => args[1]?.message === 'observer failed'));
    host.accept({ transcriptView: 'standard' }); assert.equal(settings.getSnapshot().value.transcriptView, 'standard');
    const recovered = settings.set('transcriptView', 'detailed');
    host.accept({ transcriptView: 'detailed' }); host.calls[2].resolve(true); await recovered;
    assert.equal(settings.getSnapshot(), host.getSnapshot());
  } finally { settings.dispose(); }
});
