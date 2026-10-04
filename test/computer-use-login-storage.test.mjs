import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

test('managed browser shares same-origin cookies/localStorage; sessionStorage belongs to the original tab and survives disconnect/rebind', { timeout: 45000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-login-storage-'));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/login') res.setHeader('Set-Cookie', 'fixture-auth=test-only-session; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600');
    res.end('<!doctype html><title>Isolated login fixture</title><script>window.requestCookie=' + JSON.stringify(req.headers.cookie ?? '') + '</script><p>Isolated login fixture</p>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const host = new BrowserHost(join(root, 'profile'), { executablePath: await testBrowserExecutable(root) });
  t.after(async () => {
    await host.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const session = 'login-fixture', first = await host.create(session, origin + '/login');
  const original = await host.target(session, first.id);
  await original.page.evaluate(() => { localStorage.setItem('fixture-login', 'shared-local'); sessionStorage.setItem('fixture-login', 'original-tab'); });
  const second = await host.create(session, origin + '/');
  const next = await host.target(session, second.id);
  assert.deepEqual(await next.page.evaluate(() => ({ cookie: window.requestCookie, local: localStorage.getItem('fixture-login'), session: sessionStorage.getItem('fixture-login'), visibleCookie: document.cookie })), {
    cookie: 'fixture-auth=test-only-session', local: 'shared-local', session: null, visibleCookie: '',
  }, 'a fresh independent tab shares HttpOnly login cookies and origin storage, without copying the original tab sessionStorage');
  await next.page.evaluate(() => sessionStorage.setItem('fixture-login', 'second-tab'));
  assert.equal(await original.page.evaluate(() => sessionStorage.getItem('fixture-login')), 'original-tab');
  await original.page.reload();
  assert.equal(await original.page.evaluate(() => sessionStorage.getItem('fixture-login')), 'original-tab', 'reload keeps tab-scoped login storage');

  const processId = host.browserPid;
  await host.disconnect(session);
  assert.equal(host.connections.has(session), false);
  assert.ok((await host.list(session)).some(tab => tab.id === first.id), 'disconnect keeps the original tab available for explicit rebinding');
  const rebound = await host.target(session, first.id);
  assert.equal(rebound.id, first.id);
  assert.equal(host.browserPid, processId, 'rebind uses the existing isolated browser');
  assert.deepEqual(await rebound.page.evaluate(() => ({ cookie: window.requestCookie, local: localStorage.getItem('fixture-login'), session: sessionStorage.getItem('fixture-login') })), {
    cookie: 'fixture-auth=test-only-session', local: 'shared-local', session: 'original-tab',
  });
  const secondRebound = await host.target(session, second.id);
  assert.equal(await secondRebound.page.evaluate(() => sessionStorage.getItem('fixture-login')), 'second-tab');
});
