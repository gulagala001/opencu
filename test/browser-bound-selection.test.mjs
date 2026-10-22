import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createBrowserBackend} from '../src/browser/backend.mjs';
import {createCompositeBrowserBackend} from '../src/browser/composite.mjs';

// Real backend selection with synthetic CDP endpoints; no input is dispatched.
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-bound-selection-'));
  const state = {reads: [], hooks: {}, unrelatedReads: 0};
  const pages = ['A', 'B', 'C'].map(name => Object.assign(new EventEmitter(), {
    name, titleValue: 'Shared title', urlValue: `https://${name.toLowerCase()}.invalid/`, closed: false,
    targetId: name, isClosed() { return this.closed; }, url() { return this.urlValue; },
    title() { return Promise.resolve(this.titleValue); }, setDefaultTimeout() {}, evaluate: async () => true,
  }));
  const context = Object.assign(new EventEmitter(), {pages: () => pages.filter(page => !page.closed), browser: () => ({})});
  context.newCDPSession = async page => Object.assign(new EventEmitter(), {
    detach: async () => {},
    async send(method) {
      if (method === 'Target.getTargetInfo') {
        state.reads.push(page.name); await state.hooks.read?.(page);
        return {targetInfo: {targetId: page.targetId, browserContextId: 'test-context', title: page.titleValue, url: page.urlValue}};
      }
      if (method === 'Page.getFrameTree') return {frameTree: {frame: {id: page.name}}};
      if (method === 'Page.createIsolatedWorld') return {executionContextId: 1};
      if (method === 'Runtime.evaluate') return {result: {value: null}};
      return {};
    },
  });
  const backend = await createBrowserBackend({dataDir: directory, context, instanceId: 'selection-test'});
  const composite = createCompositeBrowserBackend({browser: backend, dsh: {...backend,
    listTargets: async () => { state.unrelatedReads++; return []; }, close: async () => {}, release: async () => ({released: true}),
  }});
  t.after(async () => { state.hooks = {}; await composite.close(); await rm(directory, {recursive: true, force: true}); });
  const [target] = await backend.listTargets(); state.reads.length = 0;
  return {backend, composite, target, pages, state};
}

test('exact selection checks one live occurrence without rescanning other tabs or providers', async t => {
  const {backend, composite, target, pages, state} = await fixture(t);
  let selected = await backend.select(target);
  assert.deepEqual(selected.identity, target.identity); assert.deepEqual(state.reads, ['A']);
  state.reads.length = 0;
  pages[0].titleValue = 'Fresh title'; pages[0].urlValue = 'https://a.invalid/updated';
  selected = await composite.select({id: target.id, identity: target.identity, provider: 'browser'});
  assert.equal(selected.title, 'Fresh title'); assert.equal(selected.url, pages[0].urlValue);
  assert.deepEqual(state.reads, ['A']); assert.equal(state.unrelatedReads, 0);
});

test('exact selection rejects replaced, missing, crashed and mismatched live CDP occurrences', async t => {
  const {backend, target, pages, state} = await fixture(t);
  await assert.rejects(backend.select({...target, identity: {...target.identity, connectionId: 'replacement'}}), {code: 'TARGET_IDENTITY_CHANGED'});
  assert.deepEqual(state.reads, []);
  await assert.rejects(backend.select({...target, id: 'missing'}), {code: 'TARGET_CLOSED'});
  pages[0].targetId = 'replacement';
  await assert.rejects(backend.select(target), {code: 'TARGET_IDENTITY_CHANGED'});
  pages[0].targetId = 'A'; pages[0].emit('crash');
  await assert.rejects(backend.select(target), {code: 'TARGET_CRASHED'});
});

test('reference fields and expected metadata remain constraints on the fresh result', async t => {
  const {backend, composite, target} = await fixture(t);
  for (const change of [{title: 'different'}, {url: 'https://wrong.invalid/'}, {kind: 'window'}, {browserId: 'other'}, {backend: 'native'}, {targetId: 'missing'}]) {
    await assert.rejects(backend.select({...target, ...change}));
    await assert.rejects(composite.select({...target, provider: 'browser', ...change}));
  }
  for (const selectedBackend of [backend, composite]) {
    const reference = {...target, ...(selectedBackend === composite ? {provider: 'browser'} : {})};
    await assert.rejects(selectedBackend.select({...reference, expected: {title: 'wrong'}}), {code: 'TARGET_IDENTITY_CHANGED'});
    assert.equal((await selectedBackend.select({...reference, expected: {url: target.url, identity: target.identity}})).id, target.id);
  }
});

test('generic selection still discovers live matches and reports ambiguity', async t => {
  const {backend, composite, target, state} = await fixture(t);
  await assert.rejects(composite.select({title: 'Shared title'}), {code: 'AMBIGUOUS_TARGET'});
  assert.equal(state.unrelatedReads, 1);
  assert.equal((await backend.select(target.id)).id, target.id);
  assert.equal((await composite.select({id: target.id})).id, target.id);
  assert.equal(state.unrelatedReads, 2);
});

test('cancelled targeted reads stop waiting without fallback or a late selection', async t => {
  const {backend, composite, target, state} = await fixture(t);
  for (const selectedBackend of [backend, composite]) {
    const reference = {...target, ...(selectedBackend === composite ? {provider: 'browser'} : {})};
    const aborted = AbortSignal.abort(); state.reads.length = 0;
    await assert.rejects(selectedBackend.select(reference, {signal: aborted}), {code: 'CONTROL_STOPPED'});
    assert.deepEqual(state.reads, []);
    const entered = Promise.withResolvers(), gate = Promise.withResolvers(), aborter = new AbortController();
    state.hooks.read = async () => { entered.resolve(); await gate.promise; };
    const pending = selectedBackend.select(reference, {signal: aborter.signal});
    await entered.promise; aborter.abort();
    try { await assert.rejects(pending, {code: 'CONTROL_STOPPED'}); }
    finally { state.hooks = {}; gate.resolve(); await new Promise(resolve => setImmediate(resolve)); }
    assert.deepEqual(state.reads, ['A']); assert.equal(state.unrelatedReads, 0);
  }
});

test('read failure or a provider returning a different occurrence is rejected without rediscovery', async t => {
  const {backend, composite, target, state} = await fixture(t);
  state.hooks.read = () => { throw Object.assign(Error('CDP disconnected'), {code: 'SYNTHETIC_DISCONNECT'}); };
  await assert.rejects(composite.select({...target, provider: 'browser'}), {code: 'SYNTHETIC_DISCONNECT'});
  state.hooks = {}; const original = backend.select;
  backend.select = async () => ({...target, identity: {...target.identity, targetId: 'wrong'}});
  try { await assert.rejects(composite.select({...target, provider: 'browser'}), {code: 'TARGET_IDENTITY_CHANGED'}); }
  finally { backend.select = original; }
  assert.equal(state.unrelatedReads, 0);
});
