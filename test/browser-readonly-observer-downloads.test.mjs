import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { isolateTestDownloads, testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

const until = async fn => {
  for (let count = 0; count < 150; count++) { const value = await fn(); if (value) return value; await delay(30); }
  throw new Error('Download observer fixture did not settle');
};

for (const noDefaults of [false, true]) test(`independent CDP ${noDefaults ? 'read-only observer preserves' : 'default controller owns'} the actual download directory`, { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-observer-download-')), fixture = await startFixture();
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  await isolateTestDownloads(root);
  let observer;
  t.after(async () => { await observer?.close(); await manager.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const tab = await manager.dispatch('owned', 'createBrowserTab', ['browser', fixture.url]);
  const controller = await manager.browser.target('owned', tab.id);
  observer = await chromium.connectOverCDP(manager.browser.run.endpoint, { noDefaults });
  const context = observer.contexts()[0]; context.on('dialog', () => {});
  const page = context.pages().find(page => page.url().startsWith(fixture.url));
  const nativeDownload = controller.page.waitForEvent('download');
  const observedDownload = noDefaults ? null : page.waitForEvent('download');
  await page.locator('#download').click();
  const [native, observed] = await Promise.all([nativeDownload, observedDownload]);
  const [nativePath, observedPath] = await Promise.all([native.path(), observed?.path() ?? null]);
  const entry = await until(() => [...manager.browser.downloadHistory.values()].find(entry => entry.state === 'completed'));
  const actual = noDefaults ? nativePath : observedPath;
  const bytes = await readFile(actual);
  assert.equal(bytes.toString('utf8'), 'TRISOUL_COMPUTER_USE_FIXTURE\n');
  assert.equal(existsSync(nativePath), noDefaults, 'only the connection configuring Chromium owns the real file path');
  if (noDefaults) await until(() => manager.listDownloads('owned')[0]?.canDownload);
  else assert.equal(manager.listDownloads('owned')[0].canDownload, false, 'a separate default controller must not grant OpenCU access to its temporary file');
  const saved = join(root, 'saved.txt');
  await (noDefaults ? native : observed).saveAs(saved);
  assert.deepEqual(await readFile(saved), bytes);
  const report = { noDefaults, managedDirectory: join(root, 'browser-profile', 'downloads'), nativePath, observedPath, actualPath: actual,
    nativeExistsBeforeClose: existsSync(nativePath), observedExistsBeforeClose: observedPath !== null && existsSync(observedPath),
    history: { ...entry }, publicRecord: manager.listDownloads('owned')[0], savedPath: saved,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
  await observer.close(); observer = undefined;
  report.nativeExistsAfterObserverClose = existsSync(nativePath);
  report.observedExistsAfterObserverClose = observedPath !== null && existsSync(observedPath);
  report.savedExistsAfterObserverClose = existsSync(saved);
  assert.equal(existsSync(saved), true, 'an explicit saved copy outlives the independent connection');
  assert.equal(existsSync(actual), noDefaults, 'default connection artifacts are temporary; managed controller files persist');
  if (process.env.OPENCU_DOWNLOAD_OBSERVER_ARTIFACTS) {
    const directory = resolve(process.env.OPENCU_DOWNLOAD_OBSERVER_ARTIFACTS); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, noDefaults ? 'read-only.json' : 'default-controller.json'), JSON.stringify(report, null, 2) + '\n');
  }
});

test('a completed managed download remains readable during stopped observation after the model controller leaves', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-observer-only-download-')), fixture = await startFixture();
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  const isolatedDefaultDirectory = await isolateTestDownloads(root);
  let observer, closePreview;
  t.after(async () => { await observer?.close(); await closePreview?.(); await manager.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const initial = await manager.execute('owned', `var ownedTab = await cua.createBrowserTab('browser', ${JSON.stringify(fixture.url)}); await ownedTab.markDeliverable();`);
  assert.equal(initial.error, undefined, initial.error?.message);
  const tab = manager.status('owned').target;
  const browser = manager.browser;
  let frame;
  closePreview = await manager.watchBrowser('owned', tab.id, (event, value) => { if (event === 'frame') frame = value; });
  await until(() => frame);
  browser.keepForUser('owned', tab.id); await manager.endTurn('owned'); await manager.stop('owned');
  assert.equal(browser.connections.has('owned'), false, 'the model controller has actually left');
  observer = await chromium.connectOverCDP(browser.run.endpoint, { noDefaults: true });
  const context = observer.contexts()[0]; context.on('dialog', () => {});
  const page = context.pages().find(page => page.url().startsWith(fixture.url));
  await page.locator('#download').click();
  const entry = await until(() => [...browser.downloadHistory.values()].find(entry => entry.state === 'completed'));
  const expected = join(browser.directory, 'downloads', entry.id);
  const downloadsPage = await context.newPage(); await downloadsPage.goto('chrome://downloads/');
  const downloads = await until(async () => {
    const items = await downloadsPage.locator('downloads-manager').evaluate(manager => manager.items ?? manager.items_ ?? []);
    return items.length ? items : null;
  });
  const download = downloads.find(item => item.url === fixture.url + '/download');
  assert.ok(download, 'the isolated Chromium history identifies this fixture download');
  const actual = download.filePath;
  assert.ok(actual.startsWith(root + '/'), 'the fixture Chromium fallback download stays inside its disposable profile root');
  const bytes = await readFile(actual);
  assert.equal(bytes.toString('utf8'), 'TRISOUL_COMPUTER_USE_FIXTURE\n');
  const report = { controllerConnected: browser.connections.has('owned'), isolatedDefaultDirectory, expectedManagedPath: expected, expectedManagedPathExists: existsSync(expected), actualPath: actual, actualExists: true,
    history: { ...entry }, publicRecord: manager.listDownloads('owned')[0], bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), chromiumDownload: download };
  if (process.env.OPENCU_DOWNLOAD_OBSERVER_ARTIFACTS) {
    const directory = resolve(process.env.OPENCU_DOWNLOAD_OBSERVER_ARTIFACTS); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'observer-only.json'), JSON.stringify(report, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  }
  await until(() => manager.listDownloads('owned')[0]?.canDownload);
  assert.equal(await readFile(manager.downloadFile('owned', entry.id).path, 'utf8'), bytes.toString('utf8'), 'the public download route exposes the actual managed file');
});
