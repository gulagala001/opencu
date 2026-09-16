import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';

test('missing tabGroups API does not prevent worker startup, native connection or popup', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-no-groups-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const extension = join(root, 'extension');
  await cp(new URL('../browser-extension', import.meta.url), extension, { recursive: true });
  const path = join(extension, 'manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.permissions = manifest.permissions.filter(value => value !== 'tabGroups');
  await writeFile(path, JSON.stringify(manifest));
  const env = await extensionFixture(t, { extensionPath: extension, args: ['--password-store=basic', '--use-mock-keychain'] });
  const worker = env.context.serviceWorkers().find(value => value.url() === env.origin + 'worker.js');
  assert.equal(await worker.evaluate(() => typeof chrome.tabGroups), 'undefined');
  const page = await env.context.newPage(); await page.goto(env.fixture.url);
  const tabs = await env.hub.call(env.browser.id, 'tabs.list', {});
  assert.ok(tabs.some(tab => tab.url === env.fixture.url + '/'));
  await env.popup.getByText('已连接 Oh My DSH', { exact: true }).waitFor();
});
