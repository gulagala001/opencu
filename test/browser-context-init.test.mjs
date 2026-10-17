import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserBackend } from '../src/browser/backend.mjs';

test('a supplied context never touches the Playwright loader and remains externally owned', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-context-init-'));
  const context = Object.assign(new EventEmitter(), { pages: () => [], browser: () => null, close() { throw Error('caller owns context'); } });
  const backend = await createBrowserBackend({ dataDir: directory, context, get playwright() { throw Error('unused dependency accessed'); } });
  t.after(async () => { try { await backend.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  assert.deepEqual(await backend.listTargets(), []);
  assert.equal(context.listenerCount('page'), 1);
  await backend.close(); assert.equal(context.listenerCount('page'), 0);
});

test('CDP and owned-browser initialization still use their Playwright connection and launch contracts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-playwright-init-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const context = Object.assign(new EventEmitter(), { pages: () => [] });
  let connected = 0, released = 0;
  const browser = { contexts: () => [context], async close() { released++; } };
  const cdp = await createBrowserBackend({ dataDir: join(directory, 'cdp'), cdpEndpoint: 'ws://isolated.invalid/devtools/browser',
    playwright: { chromium: { async connectOverCDP(endpoint, options) {
      assert.equal(endpoint, 'ws://isolated.invalid/devtools/browser'); assert.equal(options.timeout, 10000); connected++; return browser;
    } } } });
  try { assert.deepEqual(await cdp.listTargets(), []); assert.equal(connected, 1); } finally { await cdp.close(); }
  assert.equal(released, 1); assert.equal(context.listenerCount('page'), 0);
  const owned = await createBrowserBackend({ dataDir: join(directory, 'owned'), headless: false,
    playwright: { chromium: { async launchPersistentContext(profile, options) {
      assert.equal(profile, join(directory, 'owned', 'browser-profile')); assert.equal(options.headless, false);
      assert.equal(options.viewport, null); assert.equal(options.acceptDownloads, true); throw Error('isolated launch boundary');
    } } } });
  try { await assert.rejects(owned.listTargets(), /isolated launch boundary/); } finally { await owned.close(); }
});
