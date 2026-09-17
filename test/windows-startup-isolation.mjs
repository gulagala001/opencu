import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';

const originalFork = childProcess.fork, originalConnect = chromium.connectOverCDP;
for (const mode of ['baseline', 'native-transport', 'startup-window', 'stop-blank-loading']) {
  test(mode, { timeout: 180000 }, async t => {
    childProcess.fork = function(module, args, options) {
      if (mode === 'startup-window' && String(module).endsWith('browser-process.mjs'))
        args = [...args.filter(arg => arg !== '--no-startup-window'), 'about:blank'];
      return originalFork(module, args, options);
    };
    syncBuiltinESMExports();
    chromium.connectOverCDP = function(endpoint, options) {
      if (mode === 'native-transport' && endpoint instanceof BrowserTransport) {
        const address = endpoint.endpoint; endpoint.close();
        return originalConnect.call(this, address, options);
      }
      return originalConnect.call(this, endpoint, options);
    };
    t.after(() => { childProcess.fork = originalFork; syncBuiltinESMExports(); chromium.connectOverCDP = originalConnect; });
    const requests = new Map();
    const server = createServer((req, res) => {
      requests.set(req.url, (requests.get(req.url) ?? 0) + 1);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Startup ready</title><h1>Ready</h1>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    for (let i = 0; i < 10; i++) await t.test('fresh profile ' + i, async () => {
      const root = await mkdtemp(join(tmpdir(), 'cu-startup-isolated-'));
      const host = new BrowserHost(root, { executablePath: chromium.executablePath() });
      if (mode === 'stop-blank-loading') {
        const bind = host.bind.bind(host);
        host.bind = async (...args) => {
          const record = await bind(...args), goto = record.page.goto.bind(record.page);
          record.page.goto = async (...params) => {
            assert.equal(record.page.url(), 'about:blank');
            await record.cdp.send('Page.stopLoading');
            return goto(...params);
          };
          return record;
        };
      }
      const path = '/probe?case=' + i, url = `http://127.0.0.1:${server.address().port}${path}`;
      const began = performance.now();
      try {
        const tab = await host.create('probe', url);
        assert.equal(tab.url, url);
        assert.equal((await host.target('probe', tab.id)).page.url(), url);
        assert.equal(requests.get(path), 1, 'never retry the destination request');
      } finally {
        console.log(JSON.stringify({ mode, trial: i, requests: requests.get(path) ?? 0, elapsedMs: Math.round(performance.now() - began) }));
        await host.close(); await rm(root, { recursive: true, force: true });
      }
    });
  });
}
