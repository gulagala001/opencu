import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBrowserBackend} from '../src/browser/backend.mjs';

async function fixture(t, count = 1) {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-live-descriptors-'));
  const pages = Array.from({length: count}, (_, index) => Object.assign(new EventEmitter(), {
    index, closed: false, title: `Page ${index}`, url: () => `https://example.invalid/${index}`,
    isClosed() { return this.closed; }, setDefaultTimeout() {}, evaluate: async () => null,
  }));
  const sessions = [];
  const context = Object.assign(new EventEmitter(), {
    pages: () => pages.filter(page => !page.closed), browser: () => null,
    async newCDPSession(page) {
      const session = Object.assign(new EventEmitter(), {
        targetReads: 0,
        async send(method) {
          if (method === 'Target.getTargetInfo') {
            session.targetReads++;
            if (session.read) return session.read();
            return {targetInfo: {targetId: `target-${page.index}`, title: page.title, url: page.url()}};
          }
          if (method === 'Page.addScriptToEvaluateOnNewDocument') return {identifier: 'activity'};
          if (method === 'Page.getFrameTree') return {frameTree: {frame: {id: 'frame'}}};
          if (method === 'Page.createIsolatedWorld') return {executionContextId: 1};
          if (method === 'Runtime.evaluate') return {result: {value: null}};
          return {};
        },
        async detach() {},
      });
      sessions[page.index] = session;
      return session;
    },
  });
  const backend = await createBrowserBackend({context, dataDir: directory});
  t.after(async () => { try { await backend.close(); } finally { await rm(directory, {recursive: true, force: true}); } });
  return {backend, pages, sessions};
}

test('verification returns the current validated descriptor using one live target read', async t => {
  const {backend, pages, sessions} = await fixture(t);
  const [target] = await backend.listTargets(), reads = sessions[0].targetReads;
  pages[0].title = 'Updated title 中文🙂';
  pages[0].url = () => 'https://example.invalid/updated';
  const verified = await backend.verify(target);
  assert.equal(verified.valid, true);
  assert.equal(verified.target.title, pages[0].title);
  assert.equal(verified.target.url, pages[0].url());
  assert.deepEqual(verified.target.identity, target.identity);
  assert.equal(sessions[0].targetReads - reads, 1);
  pages[0].title = 'Changed again';
  assert.equal((await backend.verify(target)).target.title, 'Changed again');
  assert.equal((await backend.verify({...target, identity: {...target.identity, targetId: 'different'}})).valid, false);
  pages[0].closed = true;
  assert.equal((await backend.verify(target)).valid, false);
});

test('independent inventory reads overlap and retain target order despite out-of-order replies', async t => {
  const {backend, sessions} = await fixture(t, 3);
  const targets = await backend.listTargets(), waiting = [];
  for (let index = 0; index < sessions.length; index++) sessions[index].read = () => new Promise(resolve => {
    waiting[index] = () => resolve({targetInfo: {targetId: `target-${index}`, title: `Fresh ${index}`, url: `https://example.invalid/fresh/${index}`}});
  });
  const pending = backend.listTargets();
  await new Promise(resolve => setImmediate(resolve));
  const started = waiting.filter(Boolean).length;
  // Always drain the fixture before reporting a failed overlap assertion.
  for (let pass = 0; pass < sessions.length; pass++) {
    for (let index = sessions.length - 1; index >= 0; index--) { const resolve = waiting[index]; waiting[index] = undefined; resolve?.(); }
    await new Promise(resolve => setImmediate(resolve));
  }
  const values = await pending;
  assert.equal(started, 3);
  assert.deepEqual(values.map(value => value.id), targets.map(value => value.id));
  assert.deepEqual(values.map(value => value.title), ['Fresh 0', 'Fresh 1', 'Fresh 2']);
});

test('inventory errors remain observable and the next call reads fresh values', async t => {
  const {backend, sessions, pages} = await fixture(t, 2);
  await backend.listTargets();
  const failure = new Error('Target information temporarily unavailable');
  sessions[0].read = async () => { throw failure; };
  await assert.rejects(backend.listTargets(), error => error === failure);
  delete sessions[0].read;
  pages[1].title = 'Recovered sibling';
  assert.deepEqual((await backend.listTargets()).map(value => value.title), ['Page 0', 'Recovered sibling']);
});
