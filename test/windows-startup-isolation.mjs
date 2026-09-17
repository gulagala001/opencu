import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import { startFixture } from './fixtures/computer-use/server.mjs';
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
    const fixture = await startFixture(), requests = new Map();
    const originalEmit = http.Server.prototype.emit;
    http.Server.prototype.emit = function(event, ...args) {
      if (event === 'request') requests.set(args[0].url, (requests.get(args[0].url) ?? 0) + 1);
      return originalEmit.call(this, event, ...args);
    };
    t.after(async () => { http.Server.prototype.emit = originalEmit; await fixture.close(); });
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
      const path = '/probe?case=' + i, url = fixture.url + path;
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
