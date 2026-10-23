import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionFolderFixture, deferred, tick } from './fixtures/extension-folder.mjs';
const etag = '"' + 'a'.repeat(64) + '"';
function response(method, options = {}) { return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/zip', 'content-length': '4', etag }), body: method === 'HEAD' ? null : new Blob(['PK\x03\x04']).stream(), ...options }; }
function globals(saved, base = 'https://dsh.example/mount/', bytes = 4) {
  return { Blob, Headers, document: { baseURI: base, createElement(tag) { assert.equal(tag, 'a'); return { click() { saved.push({ href: this.href, download: this.download }); } }; } },
    URL: class extends URL { static createObjectURL(blob) { assert.equal(blob.size, bytes); assert.equal(blob.type, 'application/zip'); return 'blob:synthetic-download'; } static revokeObjectURL() {} }, setTimeout: () => 1 };
}
test('actual production index/registry + Provider/button downloads without desktop or active session and keeps path/copy', async t => {
  const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (url, request) => response(request.method) }); t.after(() => f.unmount());
  await f.show(); await f.copy(); await f.download();
  assert.equal(saved.length, 1); assert.equal(saved[0].download, 'opencu-extension.zip');
  assert.match(f.text(), /download started/); assert.match(f.text(), /permanent local folder/); assert.match(f.text(), /manifest.json/); assert.match(f.text(), /does not make loopback pairing reachable/);
  assert.match(f.text(), /Path copied/); assert.equal(f.production.scopes.size, 0);
  assert.deepEqual(f.requests.filter(x => x.url).map(x => [x.url, x.method, x.credentials]), [['api/opencu/extension.zip', 'HEAD', 'same-origin'], ['api/opencu/extension.zip', 'GET', 'same-origin']]);
});
for (const base of ['https://dsh.example/', 'https://dsh.example/mount/', 'https://dsh.example/mount/index.html', 'dsh-app://app/']) test(`document-relative download preserves proxy base ${base}`, async t => {
  const saved = [], urls = [], env = globals(saved, base), f = await extensionFolderFixture({ globals: env, downloadFetch: async (url, request) => { urls.push(new URL(url, env.document.baseURI).href); return response(request.method); } }); t.after(() => f.unmount());
  // A route change does not alter the frozen <base>; the service never uses location.origin.
  env.location = { href: 'https://dsh.example/different/pushState' };
  await f.download(); assert.deepEqual(urls, [new URL('api/opencu/extension.zip', base).href, new URL('api/opencu/extension.zip', base).href]);
});
for (const absent of [['HEAD'], ['GET'], ['HEAD', 'GET']]) test(`desktop forwarding may omit Content-Length on ${absent.join(' and ')}`, async t => {
  const saved = [], f = await extensionFolderFixture({ globals: globals(saved, 'dsh-app://app/'), downloadFetch: async (_url, request) => {
    const result = response(request.method);
    if (absent.includes(request.method)) result.headers.delete('content-length');
    return result;
  } }); t.after(() => f.unmount());
  await f.download(); assert.equal(saved.length, 1); assert.match(f.text(), /download started/);
});
test('repeated click shares one pending operation; explicit cancel stops late HEAD before GET/save', async t => {
  const saved = [], head = deferred(), f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: () => head.promise }); t.after(() => f.unmount());
  const pending = f.download(); await f.download(); assert.equal(f.requests.filter(x => x.url).length, 1);
  f.cancelDownload(); head.resolve(response('HEAD')); await pending; assert.equal(saved.length, 0); assert.equal(f.requests.filter(x => x.url).length, 1); assert.match(f.text(), /Download cancelled/);
});
for (const phase of ['HEAD', 'GET']) test(`unmount cancels ${phase} and ignores late completion`, async t => {
  const saved = [], held = deferred();
  const f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: (_url, request) => request.method === phase ? held.promise : Promise.resolve(response(request.method)) }); t.after(() => f.unmount());
  const pending = f.download(); await tick(); f.unmount(); const writes = f.writes(); held.resolve(response(phase)); await pending;
  assert.equal(saved.length, 0); assert.equal(f.writes(), writes); assert(f.requests.find(x => x.method === phase).signal.aborted);
});
for (const kind of ['HEAD HTTP', 'GET HTTP', 'disconnect', 'bad type', 'bad length', 'changed digest', 'truncated']) test(`visible download failure without success: ${kind}`, async t => {
  const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => {
    if (kind === 'disconnect' && request.method === 'GET') throw new Error('Synthetic disconnected');
    if (kind === `${request.method} HTTP`) return response(request.method, { ok: false, status: 503 });
    const result = response(request.method);
    if (kind === 'bad type') result.headers.set('content-type', 'text/html');
    if (kind === 'bad length') result.headers.set('content-length', '0');
    if (kind === 'changed digest' && request.method === 'GET') result.headers.set('etag', '"' + 'b'.repeat(64) + '"');
    if (kind === 'truncated' && request.method === 'GET') result.body = new Blob(['PK']).stream();
    return result;
  } }); t.after(() => f.unmount());
  await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /alert/); assert.doesNotMatch(f.text(), /download started/);
});
test('a failed attempt can retry; downloading never triggers permissions or session approval', async t => {
  const saved = []; let failing = true;
  const f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => { if (failing) throw new Error('Synthetic offline'); return response(request.method); } }); t.after(() => f.unmount());
  await f.download(); failing = false; await f.download(); assert.equal(saved.length, 1); assert(!f.requests.some(x => /permission|appApprovals/.test(x.method)));
});
test('explicit cancel during GET prevents saving even if the response completes late', async t => {
  const saved = [], held = deferred(), f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: (_url, request) => request.method === 'GET' ? held.promise : Promise.resolve(response(request.method)) }); t.after(() => f.unmount());
  const pending = f.download(); await tick(); assert.equal(f.requests.filter(x => x.url).length, 2);
  f.cancelDownload(); held.resolve(response('GET')); await pending; assert.equal(saved.length, 0); assert.match(f.text(), /Download cancelled/);
});

const maxBytes = 8 * 1024 * 1024;
for (const method of ['HEAD', 'GET']) {
  for (const value of ['', '0', '-4', '+4', '4.0', '4e0', '0x4', '4, 4', 'NaN', 'Infinity', '9007199254740993', String(maxBytes + 1)]) {
    test(`rejects malformed or oversized ${method} Content-Length ${JSON.stringify(value)}`, async t => {
      const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => {
        const result = response(request.method);
        if (request.method === method) result.headers.set('content-length', value);
        return result;
      } }); t.after(() => f.unmount());
      await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /alert/); assert.doesNotMatch(f.text(), /download started/);
      if (method === 'HEAD') assert.equal(f.requests.filter(x => x.url).length, 1);
    });
  }
  for (const [header, value] of [['content-type', null], ['content-type', 'text/html'], ['etag', null], ['etag', `W/${etag}`], ['etag', '"' + 'A'.repeat(64) + '"'], ['content-range', 'bytes 0-3/100']]) {
    test(`rejects invalid ${method} ${header} ${value}`, async t => {
      const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => {
        const result = response(request.method); result.headers.delete('content-length');
        if (request.method === method) {
          if (value === null) result.headers.delete(header); else result.headers.set(header, value);
        }
        return result;
      } }); t.after(() => f.unmount());
      await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /alert/);
    });
  }
  test(`rejects partial ${method} responses even with ZIP metadata`, async t => {
    const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => response(request.method, { status: request.method === method ? 206 : 200 }) });
    t.after(() => f.unmount()); await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /HTTP 206/);
  });
  for (const size of [2, 6]) test(`body must match ${method} length when the other header is absent (${size} bytes)`, async t => {
    const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => {
      const result = response(request.method);
      if (request.method !== method) result.headers.delete('content-length');
      if (request.method === 'GET') result.body = new Blob([new Uint8Array(size)]).stream();
      return result;
    } }); t.after(() => f.unmount());
    await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /incomplete/);
  });
}
test('different HEAD and GET lengths reject before consuming and cancel the body', async t => {
  const saved = []; let reads = 0, cancelled = false;
  const body = new ReadableStream({ pull() { reads++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => {
    const result = response(request.method);
    if (request.method === 'GET') { result.body = body; result.headers.set('content-length', '5'); }
    return result;
  } }); t.after(() => f.unmount());
  await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /download changed/);
  assert.equal(reads, 0); assert(cancelled); assert(!body.locked);
});
for (const bytes of [1, maxBytes]) test(`unknown-length body accepts the ${bytes}-byte boundary`, async t => {
  const saved = [], f = await extensionFolderFixture({ globals: globals(saved, undefined, bytes), downloadFetch: async (_url, request) => {
    const result = response(request.method); result.headers.delete('content-length');
    if (request.method === 'GET') result.body = new Blob([new Uint8Array(bytes)]).stream();
    return result;
  } }); t.after(() => f.unmount());
  await f.download(); assert.equal(saved.length, 1); assert.match(f.text(), /download started/);
});
for (const body of [null, 'empty', 'error']) test(`unknown-length ${body} body never starts a download`, async t => {
  const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => {
    const result = response(request.method); result.headers.delete('content-length');
    if (request.method === 'GET') result.body = body === null ? null : body === 'empty' ? new Blob([]).stream() : new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(4)); }, pull(controller) { controller.error(new Error('Synthetic body disconnected')); },
    });
    return result;
  } }); t.after(() => f.unmount());
  await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /alert/); assert.doesNotMatch(f.text(), /download started/);
});
for (const declared of [null, '4']) test(`stream stops as soon as it exceeds ${declared ?? 'the 8 MiB cap'}`, async t => {
  const saved = []; let reads = 0, cancelled = false;
  const body = new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(declared ? 5 : 1024 * 1024)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => {
    const result = response(request.method);
    if (declared === null) result.headers.delete('content-length');
    if (request.method === 'GET') result.body = body;
    return result;
  } }); t.after(() => f.unmount());
  await f.download(); assert.equal(saved.length, 0); assert.match(f.text(), /alert/);
  assert.equal(reads, declared ? 1 : 9); assert(cancelled); assert(!body.locked);
});
for (const action of ['cancel', 'unmount']) test(`${action} cancels a pending body read and releases its reader`, { timeout: 2000 }, async t => {
  const saved = [], reading = deferred(); let cancelled = false;
  const body = new ReadableStream({ pull() { reading.resolve(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (_url, request) => response(request.method, request.method === 'GET' ? { body } : {}) });
  t.after(() => f.unmount()); const pending = f.download(); await reading.promise;
  if (action === 'cancel') f.cancelDownload(); else f.unmount();
  const writes = f.writes(); await pending; assert.equal(saved.length, 0); assert(cancelled); assert(!body.locked);
  if (action === 'cancel') assert.match(f.text(), /Download cancelled/); else assert.equal(f.writes(), writes);
});
test('late GET after cancellation is cancelled without starting a body read', async t => {
  const saved = [], held = deferred(); let reads = 0, cancelled = false;
  const body = new ReadableStream({ pull() { reads++; }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: (_url, request) => request.method === 'GET' ? held.promise : Promise.resolve(response(request.method)) });
  t.after(() => f.unmount()); const pending = f.download(); await tick(); f.cancelDownload();
  held.resolve(response('GET', { body })); await pending;
  assert.equal(saved.length, 0); assert.equal(reads, 0); assert(cancelled); assert(!body.locked);
});
