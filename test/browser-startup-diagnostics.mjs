// Isolated Windows cold-start experiment; no user profiles or navigation retries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
const send = BrowserTransport.prototype.send;
for (const mode of ['baseline', 'background', 'new-window', 'explicit-blank']) test(mode, { timeout: 120000 }, async t => {
  const fixture = await startFixture(); t.after(() => fixture.close());
  BrowserTransport.prototype.send = function (message) {
    if (message.method === 'Target.createTarget') {
      message = { ...message, params: { ...message.params,
        ...(mode === 'background' ? { background: true } : {}),
        ...(mode === 'new-window' ? { newWindow: true, background: true } : {}) } };
    }
    return send.call(this, message);
  };
  t.after(() => { BrowserTransport.prototype.send = send; });
  for (let i = 0; i < 5; i++) await t.test(String(i), async () => {
    const root = await mkdtemp(join(tmpdir(), 'cu-cold-probe-'));
    const host = new BrowserHost(root, { executablePath: await testBrowserExecutable(root) });
    if (mode === 'explicit-blank') {
      const bind = host.bind.bind(host);
      host.bind = async (...args) => { const record = await bind(...args); await record.page.goto('about:blank', { waitUntil: 'load' }); return record; };
    }
    try { const tab = await host.create('probe', fixture.url); assert.equal(tab.url, fixture.url + '/'); }
    finally { await host.close(); await rm(root, { recursive: true, force: true }); }
  });
});
