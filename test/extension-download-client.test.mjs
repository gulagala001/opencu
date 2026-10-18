import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionFolderFixture, deferred, tick } from './fixtures/extension-folder.mjs';
const etag = '"' + 'a'.repeat(64) + '"';
function response(method, options = {}) { return { ok: true, headers: new Headers({ 'content-type': 'application/zip', 'content-length': '4', etag }), blob: async () => new Blob(['PK\x03\x04']), ...options }; }
function globals(saved, base = 'https://dsh.example/mount/') {
  return { Blob, Headers, document: { baseURI: base, createElement(tag) { assert.equal(tag, 'a'); return { click() { saved.push({ href: this.href, download: this.download }); } }; } },
    URL: class extends URL { static createObjectURL(blob) { assert.equal(blob.size, 4); return 'blob:synthetic-download'; } static revokeObjectURL() {} }, setTimeout: () => 1 };
}
test('actual production index/registry + Provider/button downloads without desktop or active session and keeps path/copy', async t => {
  const saved = [], f = await extensionFolderFixture({ globals: globals(saved), downloadFetch: async (url, request) => response(request.method) }); t.after(() => f.unmount());
  await f.show(); await f.copy(); await f.download();
  assert.equal(saved.length, 1); assert.equal(saved[0].download, 'opencu-extension.zip');
  assert.match(f.text(), /download started/); assert.match(f.text(), /permanent local folder/); assert.match(f.text(), /manifest.json/); assert.match(f.text(), /does not make loopback pairing reachable/);
  assert.match(f.text(), /Path copied/); assert.equal(f.production.scopes.size, 0);
  assert.deepEqual(f.requests.filter(x => x.url).map(x => [x.url, x.method, x.credentials]), [['api/opencu/extension.zip', 'HEAD', 'same-origin'], ['api/opencu/extension.zip', 'GET', 'same-origin']]);
});
for (const base of ['https://dsh.example/', 'https://dsh.example/mount/', 'https://dsh.example/mount/index.html']) test(`document-relative download preserves proxy base ${base}`, async t => {
  const saved = [], urls = [], env = globals(saved, base), f = await extensionFolderFixture({ globals: env, downloadFetch: async (url, request) => { urls.push(new URL(url, env.document.baseURI).href); return response(request.method); } }); t.after(() => f.unmount());
  // A route change does not alter the frozen <base>; the service never uses location.origin.
  env.location = { href: 'https://dsh.example/different/pushState' };
  await f.download(); assert.deepEqual(urls, [new URL('api/opencu/extension.zip', base).href, new URL('api/opencu/extension.zip', base).href]);
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
    if (kind === 'truncated') result.blob = async () => new Blob(['PK']);
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
