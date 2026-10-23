import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { build } from 'esbuild';
import { Context } from '@deepseek-ai/cordis';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { extensionFolderFixture } from './fixtures/extension-folder.mjs';
import pin from './fixtures/dsh-connection.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(join(root, '.local'), { recursive: true });
const stage = await mkdtemp(join(root, '.local/connection-test-')); after(() => rm(stage, { recursive: true, force: true }));
assert.equal(pin.commit, '687f282e8625c6b8d11ff58211a90524be2e4317');
for (const [name, hash] of Object.entries(pin.files)) {
  const data = await readFile(new URL('./fixtures/dsh-connection/' + name, import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'), hash);
  assert.equal(createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'), pin.gitBlobs[name]);
}
await build({ entryPoints: [join(root, 'test/fixtures/dsh-connection/index.ts')], outfile: join(stage, 'connection.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external',
  plugins: [{ name: 'synthetic-memory-credential-key', setup(b) { b.onResolve({ filter: /^@deepseek-ai\/dsh-credentials$/ }, () => ({ path: join(root, 'test/fixtures/connection-credential-key.mjs') })); } }] });
const official = await import(pathToFileURL(join(stage, 'connection.mjs')));
const mocked = new Set(['runtime', 'tools', 'config', 'computer', 'activity', 'browser-host', 'presentation', 'preferences', 'browser-history'].map(name => new URL(`../src/dsh/${name}.mjs`, import.meta.url).href));
const boundary = new URL('./fixtures/extension-download-host.mjs', import.meta.url).href;
const hook = registerHooks({ resolve(name, context, next) {
  if (name.startsWith('.') && mocked.has(new URL(name, context.parentURL).href)) return { url: boundary, shortCircuit: true };
  return next(name, context);
} });
const { acquireOpenCU } = await import('../src/dsh/shared.mjs'); hook.deregister();

async function fixture(t) {
  const ctx = new Context(), routes = [], records = new Map();
  ctx.provide('credentials', { async modifyRecord(key, callback) { const result = await callback(records.get(key)); if (result) records.set(key, result); return records.get(key); } });
  ctx.provide('attachments', { imageLimits: { maxMessageImageBytes: 1024 } });
  ctx.provide('webServer', { host: '127.0.0.1', protocol: 'http:', register(route) { routes.push(route); return () => { routes.splice(routes.indexOf(route), 1); }; } });
  await ctx.plugin(official);
  const lease = acquireOpenCU(ctx, { config: { dataDir: '/synthetic-secret-root' } });
  for (let tries = 0; tries < 100 && !routes.some(route => route.path === '/api'); tries++) await new Promise(resolve => setImmediate(resolve));
  // Wait for the real shared registration's manifest reads and injection callback.
  for (let tries = 0; tries < 100 && !ctx.connection.fetchRoutes.has('/api/opencu/extension.zip'); tries++) await new Promise(resolve => setTimeout(resolve, 5));
  assert(ctx.connection.fetchRoutes.has('/api/opencu/extension.zip'));
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://synthetic.invalid').pathname;
    if (path === '/') { if (ctx.connection.authorizeIndex(request, response)) response.end('synthetic index'); return; }
    const route = routes.find(route => route.kind === 'prefix' ? path.startsWith(route.path) : path === route.path);
    if (!route) { response.writeHead(404); response.end(); return; }
    void route.handler(request, response).catch(error => { if (!response.destroyed) { response.writeHead(500); response.end(); } });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(ctx.connection.authenticatedUrl(base + '/'), { redirect: 'manual' });
  assert.equal(login.status, 303); const cookie = login.headers.get('set-cookie').split(';')[0];
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await lease.release(); await ctx.fiber.dispose(); });
  return { ctx, base, cookie, get: (method = 'GET', headers = {}, path = '/api/opencu/extension.zip') => new Promise((resolve, reject) => {
    const req = httpRequest(base + path, { method, headers: { cookie, ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
    }); req.on('error', reject); req.end();
  }) };
}
test('real shared -> official Connection HTTP admission -> exact owner route serves identical GET/HEAD metadata and ZIP', async t => {
  const f = await fixture(t), head = await f.get('HEAD'), get = await f.get();
  assert.equal(head.status, 200); assert.equal(get.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const key of ['content-type', 'content-length', 'content-disposition', 'etag', 'cache-control', 'x-content-type-options']) assert.equal(head.headers.get(key), get.headers.get(key));
  const bytes = Buffer.from(await get.arrayBuffer()); assert(bytes.equals(await readFile(new URL('../lib/extension.zip', import.meta.url))));
  assert.equal(head.headers.get('etag'), `"${createHash('sha256').update(bytes).digest('hex')}"`);
  assert.equal(head.headers.get('content-length'), String(bytes.length)); assert.equal(head.headers.get('content-type'), 'application/zip');
  assert.match(head.headers.get('content-disposition'), /^attachment; filename="opencu-extension-0\.2\.0.zip"$/);
  assert.equal((await f.get('GET', { origin: f.base })).status, 200);
});
for (const method of ['GET', 'HEAD']) test(`real Connection denies missing/tampered cookies, wrong Host/Origin for ${method}`, async t => {
  const f = await fixture(t);
  for (const [headers, status] of [[{ cookie: '' }, 401], [{ cookie: f.cookie + 'tampered' }, 401], [{ host: 'attacker.invalid' }, 403], [{ origin: 'https://attacker.invalid' }, 403], [{ origin: 'null' }, 403], [{ 'sec-fetch-site': 'cross-site' }, 403], [{ cookie: '', authorization: 'Bearer synthetic' }, 401]]) assert.equal((await f.get(method, headers)).status, status, JSON.stringify(headers));
  const token = new URL(f.ctx.connection.authenticatedUrl(f.base + '/')).search;
  assert.equal((await f.get(method, { cookie: '' }, '/api/opencu/extension.zip' + token)).status, 401);
});
test('real exact dispatcher rejects nonowner, query and alternate paths without adding a route', async t => {
  const f = await fixture(t), handler = f.ctx.connection.createSharedFetchHandler('/api');
  const denied = await handler.fetch(new Request(f.base + '/api/opencu/extension.zip'), { principal: { kind: 'synthetic-nonowner' } }); assert.equal(denied.status, 403);
  assert.equal((await f.get('GET', {}, '/api/opencu/extension.zip?path=/synthetic-secret')).status, 400);
  for (const path of ['/api/opencu/extension.zip/secret', '/api/opencu/extension-secret.zip']) assert.equal((await f.get('GET', {}, path)).status, 404);
  assert.equal((await f.get('POST')).status, 404);
});
test('real HTTP disconnect aborts the registered production request and leaves later downloads usable', async t => {
  const f = await fixture(t), record = f.ctx.connection.fetchRoutes.get('/api/opencu/extension.zip'), original = record.fetch;
  const entered = Promise.withResolvers(), held = Promise.withResolvers();
  record.fetch = async request => { entered.resolve(request); await held.promise; return original(request); };
  const client = httpRequest(f.base + '/api/opencu/extension.zip', { headers: { cookie: f.cookie } });
  client.on('error', () => {}); client.end(); const request = await entered.promise; client.destroy();
  for (let tries = 0; tries < 100 && !request.signal.aborted; tries++) await new Promise(resolve => setTimeout(resolve, 5));
  assert(request.signal.aborted); record.fetch = original; held.resolve();
  assert.equal((await f.get()).status, 200);
});

for (const transport of [
  { name: 'ordinary HTTP' },
  { name: 'HEAD without length', omit: ['HEAD'] },
  { name: 'chunked GET', omit: ['GET'] },
  { name: 'HEAD and GET without length', omit: ['HEAD', 'GET'] },
  { name: 'gzip HEAD', gzip: ['HEAD'] },
  { name: 'gzip GET', gzip: ['GET'] },
  { name: 'gzip HEAD and GET', gzip: ['HEAD', 'GET'] },
  { name: 'desktop forwarding after gzip decoding', gzip: ['HEAD', 'GET'], desktop: true },
]) test(`production settings download preserves exact ZIP bytes over ${transport.name}`, async t => {
  const host = await fixture(t), expected = await readFile(new URL('../lib/extension.zip', import.meta.url));
  const compressed = gzipSync(expected), record = host.ctx.connection.fetchRoutes.get('/api/opencu/extension.zip'), original = record.fetch;
  // Simulate transport transformations after the real distribution handler.
  // The official HTTP bridge and fetch decoding still run over a real socket.
  record.fetch = async request => {
    const upstream = await original(request), headers = new Headers(upstream.headers);
    let body = upstream.body;
    if (transport.gzip?.includes(request.method)) {
      if (body) { await upstream.arrayBuffer(); body = compressed; }
      headers.set('content-encoding', 'gzip'); headers.set('content-length', String(compressed.length));
    }
    if (transport.omit?.includes(request.method)) headers.delete('content-length');
    return new Response(body, { status: upstream.status, headers });
  };
  let blob, clicked = 0;
  const client = await extensionFolderFixture({ globals: { Blob,
    document: { baseURI: transport.desktop ? 'dsh-app://app/' : host.base + '/', createElement: () => ({ click() { clicked++; } }) },
    URL: class extends URL { static createObjectURL(value) { blob = value; return 'blob:synthetic-zip'; } static revokeObjectURL() {} }, setTimeout: () => 1,
  }, downloadFetch: async (url, request) => {
    assert.equal(url, 'api/opencu/extension.zip'); assert.equal(request.credentials, 'same-origin');
    assert.equal(request.cache, 'no-store'); assert.equal(request.redirect, 'error');
    const upstream = await fetch(new URL(url, host.base), { ...request, headers: { cookie: host.cookie } });
    if (!transport.desktop) return upstream;
    const headers = new Headers(upstream.headers);
    for (const key of ['content-length', 'content-encoding', 'transfer-encoding']) headers.delete(key);
    return new Response(upstream.body, { status: upstream.status, headers });
  } }); t.after(() => client.unmount());
  await client.download(); assert.equal(clicked, 1, client.text()); assert.match(client.text(), /download started/);
  assert.equal(blob.type, 'application/zip'); assert(Buffer.from(await blob.arrayBuffer()).equals(expected));
  assert.deepEqual(client.requests.filter(x => x.url).map(x => x.method), ['HEAD', 'GET']);
});
