import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverBrowserSelection } from '../src/client/annotation-delivery.mjs';

test('a lost admission reply retries the same selection before sending newly added comments', async t => {
  const old = globalThis.localStorage, storage = new Map(), received = new Set(), calls = [];
  globalThis.localStorage = { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  t.after(() => { if (old) globalThis.localStorage = old; else delete globalThis.localStorage; });
  let items = [{ id: 'a' }], loseReply = true, failCache = true;
  const send = () => deliverBrowserSelection({ scope: 'fixture', direct: true, items: [...items], current: () => items,
    deliver: async (comments, _direct, id) => {
      received.add(id); calls.push([comments.map(x => x.id), id]);
      if (loseReply) { loseReply = false; throw Error('reply lost'); }
    },
    mark: comments => {
      if (failCache) { failCache = false; throw Error('disk full'); }
      items = items.filter(item => !comments.includes(item));
    },
  });
  await assert.rejects(send(), /reply lost/);
  items.push({ id: 'b' });
  await assert.rejects(send(), error => error.accepted && /disk full/.test(error.message));
  await send();
  assert.deepEqual(calls.map(([ids]) => ids), [['a'], ['a'], ['b']]);
  assert.equal(calls[0][1], calls[1][1]); assert.equal(received.size, 2); assert.deepEqual(items, []);
});
