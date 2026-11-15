import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputerRepl } from '../src/dsh/computer-repl.mjs';
import { installQuoteCompanion } from '../src/client/text-annotations.mjs';

test('the native quote can load before or after OpenCU, and unmount restores the original registration', () => {
  for (const nativeFirst of [false, true]) {
    let entries = [], update;
    const native = { component() {}, options: { key: 'quote' }, locale: 'messageQuotes' };
    const thirdParty = { component() {}, options: { key: 'quote', priority: -10 } };
    const slots = {
      entries: () => entries,
      entriesOfSlot: () => entries.slice(0, 1),
      subscribe(_key, fn) { update = fn; return () => { update = undefined; }; },
      register({ key, priority }, component) {
        const entry = { component, options: { key, priority } };
        entries = [entry, ...entries];
        return () => { entries = entries.filter(item => item !== entry); };
      },
    };
    if (nativeFirst) entries.push(native);
    const dispose = installQuoteCompanion(slots, () => ({}), component => { assert.equal(component, native.component); return function Combined() {}; });
    if (!nativeFirst) { assert.equal(entries.length, 0); entries.push(native); update(); }
    assert.equal(entries.length, 2);
    const combined = entries[0]; update(); assert.equal(entries[0], combined);
    entries.unshift(thirdParty); update(); assert.deepEqual(entries, [thirdParty, native]);
    entries.shift(); update(); assert.equal(entries.length, 2);
    dispose(); assert.deepEqual(entries, [native]); assert.equal(update, undefined);
  }
});

test('automatic browser routing reuses only eligible tabs; otherwise opens the unique built-in window', async t => {
  const url = 'https://example.test/', local = 'dsh:here', external = 'extension:owner';
  const tab = (id, browserId, sessionId) => ({ id, backend: 'browser', browserId, sessionId, url,
    provider: browserId === external ? 'extension' : 'dsh', identity: { id }, verified: true });
  const ours = tab('ours', local, 'session'), theirs = tab('theirs', local, 'other'), personal = tab('personal', external);
  let targets = [ours, theirs, personal], preference = 'built-in', enabled = true, builtIn = [local];
  const calls = [], fresh = tab('fresh', local, 'session');
  const repl = createComputerRepl(async (endpoint, args) => {
    calls.push([endpoint, args]);
    if (endpoint === 'browserRoute') return { enabled, preference, builtIn, sessionId: 'session' };
    if (endpoint === 'targets') return { targets, browsers: [{ id: local }, { id: external, connected: true }] };
    if (endpoint === 'select') return { target: [...targets, fresh].find(value => value.id === args.reference.id) };
    if (endpoint === 'openTarget') return { target: fresh };
    if (endpoint === 'observe') return { observation: { id: 'ax', ax: { text: '' } } };
    return { ok: true, released: true };
  });
  t.after(() => repl.close());
  const open = (options = {}) => repl.run({ code: `await cua.openBrowser(${JSON.stringify(url)}, ${JSON.stringify(options)})` });
  await open({ reuseAuthorized: true });
  assert.equal(calls.findLast(([method]) => method === 'select')[1].reference.id, ours.id);
  preference = 'reuse';
  await assert.rejects(open({ reuseAuthorized: true }), /Multiple tabs match/);
  targets = [theirs, personal]; calls.length = 0;
  await open({ reuseAuthorized: true });
  assert.equal(calls.findLast(([method]) => method === 'select')[1].reference.id, personal.id);
  calls.length = 0; await open();
  assert.deepEqual(calls.find(([method]) => method === 'openTarget')[1], { browserId: local, url });
  builtIn = []; calls.length = 0; await assert.rejects(open(), /No built-in browser/);
  assert.deepEqual(calls.map(([method]) => method), ['browserRoute', 'targets']);
  enabled = false; await assert.rejects(open(), /requires OMD/);
});
