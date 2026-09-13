import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

test('cold browser targets commit their first requested URL exactly once', { timeout: 180000 }, async t => {
  const fixture = await startFixture(); t.after(() => fixture.close());
  const open = BrowserTransport.prototype.open, write = BrowserTransport.prototype.write;
  const traces = new WeakMap(); let active;
  const methods = new Set(['Page.navigate', 'Page.stopLoading', 'Page.getFrameTree', 'Page.setLifecycleEventsEnabled', 'Target.createTarget', 'Browser.getVersion', 'Browser.close']);
  BrowserTransport.prototype.open = function () {
    const state = { evidence: active, pending: new Set() }; traces.set(this, state);
    open.call(this);
    this.socket?.on('message', data => {
      const message = JSON.parse(data.toString());
      if (state.pending.delete(message.id) || /^(Page\.(frameNavigated|frameStartedNavigating|frameRequestedNavigation|frameStartedLoading|frameStoppedLoading|lifecycleEvent)|Target\.(targetCreated|targetDestroyed|attachedToTarget|detachedFromTarget)|Network\.loadingFailed)$/.test(message.method ?? '')) state.evidence.protocol.push({ at: Date.now(), direction: 'received', ...message });
    });
  };
  BrowserTransport.prototype.write = function (message) {
    const state = traces.get(this);
    if (state && methods.has(message.method)) { state.pending.add(message.id); state.evidence.protocol.push({ at: Date.now(), direction: 'sent', ...message }); }
    return write.call(this, message);
  };
  t.after(() => { BrowserTransport.prototype.open = open; BrowserTransport.prototype.write = write; });
  for (let attempt = 0; attempt < 5; attempt++) await t.test('fresh profile ' + (attempt + 1), async () => {
    const root = await mkdtemp(join(tmpdir(), 'opencu-cold-navigation-'));
    active = { attempt, protocol: [] }; const evidence = active;
    // Exercise the same installed Windows Chrome as the failing production
    // host path; macOS uses only the isolated mock-keychain test launcher.
    const executablePath = process.platform === 'darwin' ? await testBrowserExecutable(root) : undefined;
    const host = new BrowserHost(root, { executablePath });
    try {
      const tab = await host.create('cold', fixture.url);
      assert.equal(tab.url, fixture.url + '/');
      assert.match((await host.invoke('cold', tab.id, 'getAXState', [])).state, /测试工作台/);
      const requests = evidence.protocol.filter(row => row.direction === 'sent' && row.method === 'Page.navigate' && row.params.url === new URL(fixture.url).href);
      assert.equal(requests.length, 1, 'the first requested URL must not be retried');
    } catch (error) {
      evidence.error = { message: error.message, stack: error.stack };
      t.diagnostic(JSON.stringify({ attempt, error: error.message, recentProtocol: evidence.protocol.slice(-8) })); throw error;
    } finally {
      evidence.runtimePath = host.runtimePath;
      evidence.run = host.run && { browserPid: host.run.browserPid, guardianPid: host.run.child?.pid, lost: host.run.lost, phase: host.run.phase, stderr: host.run.stderr };
      try {
        if (process.env.TRISOUL_CU_UI_ARTIFACTS) {
          await mkdir('cu-artifacts', { recursive: true });
          await writeFile(join('cu-artifacts', `cold-navigation-${process.pid}-${attempt}.json`), JSON.stringify(evidence, null, 2));
        }
      } finally { await host.close(); await rm(root, { recursive: true, force: true }); }
    }
  });
});
