import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputerRepl } from '../src/dsh/computer-repl.mjs';
import { createTextAnnotations, installQuoteCompanion } from '../src/client/text-annotations.mjs';

test('the native quote can load before or after OpenCU, and unmount restores the original registration', () => {
  for (const nativeFirst of [false, true]) {
    let entries = [], update, retired;
    const native = { component() {}, options: { key: 'quote' }, locale: 'messageQuotes' };
    const thirdParty = { component() {}, options: { key: 'quote', priority: -10 } };
    const slots = {
      entries: () => entries,
      entriesOfSlot: () => entries.filter(entry => entry !== retired).slice(0, 1),
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
    retired = entries[0]; update(); update();
    assert.deepEqual(entries, [native]);
    dispose(); assert.deepEqual(entries, [native]); assert.equal(update, undefined);
  }
});

test('one selection moves from the host surface to the editor, with distinct quote and annotation receipts', async t => {
  const row = { isConnected: true, dataset: { chatNodeKey: 'message', chatTurn: '2' },
    closest: () => ({ dataset: { conversationSession: 'session' } }) };
  const node = { nodeType: 3, parentElement: { closest: selector => selector.startsWith('[data-chat-node-key]') ? row : null } };
  const range = { startContainer: node, endContainer: node, cloneRange: () => ({ ...range, toString: () => 'prefix' }),
    selectNodeContents() {}, setEnd() {}, compareBoundaryPoints: () => 0, getBoundingClientRect: () => ({ left: 10, top: 20, bottom: 30 }) };
  const selection = { rangeCount: 1, toString: () => 'selected', getRangeAt: () => range,
    removeAllRanges() { this.rangeCount = 0; } };
  const doc = new EventTarget(), calls = [], storage = new Map(), restore = [];
  doc.getSelection = () => selection;
  for (const [key, value] of Object.entries({ document: doc, window: new EventTarget(), Node: { ELEMENT_NODE: 1 },
    Range: { START_TO_START: 0, END_TO_END: 2 }, MutationObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    navigator: { clipboard: { writeText: async text => calls.push(['copy', text]) } } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    restore.push(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; });
  }
  let writable = false, release;
  const actions = createTextAnnotations({ notify: (_id, error) => assert.fail(error),
    insertQuote: value => { calls.push(['quote', value.quoteText]); return writable; },
    submit: async (value, directly) => calls.push(['annotation', value.body, value.text, value.start, directly]) });
  t.after(() => { try { actions.dispose(); } finally { restore.forEach(fn => fn()); } });
  actions.start();
  const toolbar = { closest: () => ({ parentElement: { contains: item => item === row } }) };
  const selected = () => actions.state.getSnapshot();
  release = actions.attachQuote('native', toolbar, () => 'native text', () => release());
  assert.equal(selected().quoteSurface, 'native'); assert.equal(await actions.copy('native'), true);
  actions.edit('native'); assert.equal(selected().editing, true);
  await actions.submit(' '); assert.match(selected().error, /could not accept/); assert.equal(selection.rangeCount, 1);
  writable = true; await actions.submit(''); assert.equal(selected(), null); assert.equal(selection.rangeCount, 0);
  selection.rangeCount = 1; doc.dispatchEvent(new Event('pointerup'));
  assert.equal(selected().quoteSurface, undefined); actions.edit();
  await actions.submit('comment'); assert.equal(selected(), null);
  assert.deepEqual(calls, [['copy', 'native text'], ['quote', 'native text'], ['quote', 'native text'], ['annotation', 'comment', 'selected', 6, false]]);
  selection.rangeCount = 1; let cleared = 0;
  release = actions.attachQuote('cancel', toolbar, () => 'native text', () => release(), () => { cleared++; selection.removeAllRanges(); });
  actions.edit('cancel'); actions.body('retained draft'); actions.close();
  assert.equal(cleared, 1); assert.equal(selection.rangeCount, 0); assert.ok([...storage.values()].includes('retained draft'));
  selection.rangeCount = 1; doc.dispatchEvent(new Event('pointerup')); actions.edit();
  range.compareBoundaryPoints = () => 1; actions.close();
  assert.equal(selection.rangeCount, 1, 'closing an old editor preserves a different selection');
});

test('automatic browser routing reuses only eligible tabs; otherwise opens the unique built-in window', async t => {
  const url = 'https://example.test/', local = 'dsh:here', external = 'extension:owner';
  const tab = (id, browserId, sessionId) => ({ id, backend: 'browser', browserId, sessionId, url,
    provider: browserId === external ? 'extension' : 'dsh', identity: { id }, verified: true });
  const ours = tab('ours', local, 'session'), theirs = tab('theirs', local, 'other'), personal = tab('personal', external);
  let targets = [ours, theirs, personal], preference = 'built-in', enabled = true, builtIn = [local], focusFails = false;
  const calls = [], fresh = tab('fresh', local, 'session');
  const repl = createComputerRepl(async (endpoint, args) => {
    calls.push([endpoint, args]);
    if (endpoint === 'browserRoute') return { enabled, preference, builtIn, sessionId: 'session' };
    if (endpoint === 'targets') return { targets, browsers: [{ id: local }, { id: external, connected: true }] };
    if (endpoint === 'select') return { target: [...targets, fresh].find(value => value.id === args.reference.id) };
    if (endpoint === 'openTarget') return { target: fresh };
    if (endpoint === 'observe') return { observation: { id: 'ax', ax: { text: '' } } };
    if (endpoint === 'focus' && focusFails) throw Object.assign(Error('foreground required'), { code: 'FOREGROUND_REQUIRED' });
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
  targets = [ours]; focusFails = true; calls.length = 0;
  await assert.rejects(open({ visible: true }), /remains selected/);
  assert.equal(calls.filter(([method]) => method === 'select').length, 1);
  assert.equal(calls.filter(([method]) => method === 'openTarget').length, 0);
  targets = []; focusFails = false;
  builtIn = []; calls.length = 0; await assert.rejects(open(), /No built-in browser/);
  assert.deepEqual(calls.map(([method]) => method), ['browserRoute', 'targets']);
  enabled = false; await assert.rejects(open(), /requires OMD/);
});
