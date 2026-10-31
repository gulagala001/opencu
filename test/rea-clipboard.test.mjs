import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { dependencyRequire } from '../scripts/dependencies.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = dependencyRequire();

test('REA copy, navigation and file actions use DSH services and honor failure results', { timeout: 60000 }, async t => {
  const { outputFiles } = await require('esbuild').build({
    absWorkingDir: root,
    stdin: { resolveDir: root, loader: 'jsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { initializeRea, ReaProviders } from './src/client/rea-root.jsx';
      import { installReaServices } from './src/client/rea-services.mjs';
      import { createReaPortal } from './src/client/portal-host.mjs';
      import { Ia } from './src/client/rea/mcp-tool-item-content-f32f64d93b42.js';
      import * as Shared from './src/client/rea/app-shared-2f2228189a8d.js';
      import * as Initial from './src/client/rea/app-initial-c468e3fd7f91.js';
      import { Ze as FileActions, tt as DownloadButton, U } from './src/client/rea/artifact-preview-header-464ed5168662.js';
      import { reaIntl } from './src/client/rea-locale.mjs';
      import styles from './src/client/rea-styles.css';
      const fixture = window.copyFixture = { calls: [], confirmed: 0, mode: 'native',
        links: [], files: [], guard: 'ready', guarded: 0, notices: [],
        copy: (...args) => Shared.TNi(...args), locale: () => reaIntl(),
        open: Initial.QO, newTab: Initial.Gyn, copyFile: args => Initial.dsa(null, args),
        image: path => Shared.j2(path, 'local', null), downloadLink: Initial.qyn };
      installReaServices({
        navigation: { open: async args => { fixture.links.push(args); } },
        downloads: { downloadUrl: async args => { fixture.files.push(['downloadUrl', args]); return true; } },
        workspaceFiles: {
          read: async args => { fixture.files.push(['read', args]); return args.representation === 'text' ? { text: 'current file' } : { blob: 'image-bytes' }; },
          saveCopy: async args => { fixture.files.push(['saveCopy', args]); return { path: '/saved/fixture.xlsx' }; },
        },
        openIn: {
          getTargets: async () => ({ mode: 'native', preferredTarget: 'systemDefault', availableTargets: ['systemDefault'],
            targets: [{ id: 'systemDefault', target: 'systemDefault', kind: 'native', label: 'Default application', available: true }] }),
          open: async args => { fixture.files.push(['open', args]); return { success: true }; },
        },
        notify: (_tone, message) => { fixture.notices.push(message); Shared.WFt().danger(message); },
        clipboard: { writeText(text) {
        fixture.calls.push(text);
        if (fixture.mode === 'throw') throw new Error('Clipboard denied');
        if (fixture.mode === 'pending') return new Promise((resolve, reject) => {
          fixture.resolve = resolve; fixture.reject = () => reject(new Error('Clipboard denied'));
        });
        return navigator.clipboard.writeText(text);
      } } });
      initializeRea(); Ia(); U();
      const mount = document.createElement('div'); document.body.append(mount);
      const { portal } = createReaPortal(styles, { reaRoot: '', codexWindowType: 'electron' }, 60);
      createRoot(mount).render(<ReaProviders portal={portal} path="/clipboard-test">
        <Shared._lt scope={Shared.jX} value={{ clientThreadId: 'local:fixture', routeConversationId: 'fixture' }}>
        <Shared._lt scope={Shared.h1} value={{ routeKind: 'local-thread', pathname: '/ca/fixture', conversationId: 'fixture', hostId: 'local' }}>
        <Shared._lt scope={Shared.j0r} value={{ kind: 'local', placement: 'main', conversationId: 'fixture', clientThreadId: 'local:fixture', routeConversationId: 'fixture' }}>
        <Shared.kqi content={'{"result":"中文🙂"}'} language="plaintext" onCopyCode={() => fixture.confirmed++} />
        <div id="file-actions"><FileActions hostId="local" path="/fixture.xlsx" title="fixture.xlsx" showLabel
          onBeforeOpen={() => { fixture.guarded++; if (fixture.guard === 'throw') throw Error('Preparation failed'); return fixture.guard !== 'blocked'; }} /></div>
        <div id="download-action"><DownloadButton hostId="local" path="/fixture.xlsx" /></div>
        </Shared._lt></Shared._lt></Shared._lt>
      </ReaProviders>);
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': 'document.baseURI', 'import.meta.resolve': 'undefined' },
    loader: { '.css': 'text' }, logLevel: 'silent',
    plugins: [{ name: 'test-host-boundary', setup(b) {
      b.onResolve({ filter: /^react-host$/ }, () => ({ path: require.resolve('react') }));
      b.onResolve({ filter: /^(react|react-dom|react-compiler-runtime)(\/|$)/ }, args => ({ path: require.resolve(args.path) }));
      b.onResolve({ filter: /.*/ }, args => args.kind === 'dynamic-import' ? { path: args.path, external: true } : undefined);
    } }],
  });
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(outputFiles[0].contents); }
    else if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="zh-CN"><body><script src="/fixture.js"></script></body></html>'); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const copy = page.getByRole('button', { name: '复制', exact: true });
  await copy.waitFor({ timeout: 5000 }).catch(async error => {
    throw new Error(`Copy button did not mount: ${errors.join('; ')}`, { cause: error });
  });

  // Real native Chromium clipboard, without any Codex RPC resource or service.
  assert.equal(await page.evaluate(() => window.copyFixture.copy('中文🙂\nraw tool output')), true);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '中文🙂\nraw tool output');
  assert.equal(requests.some(url => url.includes('rpc-')), false);
  assert.equal(await page.evaluate(() => window.copyFixture.copy(Promise.resolve('deferred text'))), true);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'deferred text');

  // The real code-snippet button must pass its pending result to REA's copy button.
  await page.evaluate(() => { window.copyFixture.mode = 'pending'; });
  await copy.click();
  assert.equal(await page.evaluate(() => window.copyFixture.confirmed), 0);
  assert.equal(await page.getByText('已复制', { exact: true }).count(), 0);
  await page.evaluate(() => window.copyFixture.reject());
  await page.getByText('无法复制到剪贴板', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.copyFixture.confirmed), 0);
  assert.equal(await page.getByText('已复制', { exact: true }).count(), 0);
  assert.doesNotMatch(await page.locator('[data-sonner-toast]').innerText(), /ChatGPT|Codex|焦点/);
  await page.locator('[data-sonner-toast] button').click();

  await copy.click();
  await page.waitForFunction(() => window.copyFixture.calls.length === 4);
  await page.evaluate(() => window.copyFixture.resolve());
  await page.waitForFunction(() => window.copyFixture.confirmed === 1);
  await page.getByText('已复制', { exact: true }).first().waitFor();

  assert.equal(await page.evaluate(() => {
    window.copyFixture.mode = 'throw';
    return window.copyFixture.copy('denied', undefined, () => window.copyFixture.confirmed++);
  }), false);
  assert.equal(await page.evaluate(() => window.copyFixture.confirmed), 1);
  assert.equal(await page.evaluate(() => window.copyFixture.copy({ 'text/plain': 'table', 'text/html': '<b>table</b>' })), true);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'table');
  assert.equal(await page.evaluate(async () => (await navigator.clipboard.read())[0].types.includes('text/html')), true);
  assert.doesNotMatch(await page.evaluate(() => {
    document.documentElement.lang = 'en'; return window.copyFixture.locale().messages['clipboard.copyError.description'];
  }), /ChatGPT|Codex|focused/);

  await page.evaluate(() => { window.copyFixture.mode = 'native'; });
  assert.equal(await page.evaluate(() => window.copyFixture.copyFile({ hostId: 'local', path: '/fixture.txt' })), true);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'current file');
  assert.equal(await page.evaluate(() => window.copyFixture.image('/fixture.png')), 'data:image/png;base64,image-bytes');
  await page.evaluate(async () => {
    window.copyFixture.open({ href: 'https://example.test/a', conversationId: 'A' });
    window.copyFixture.newTab({ url: 'https://example.test/b', conversationId: 'B' });
    await window.copyFixture.downloadLink({ url: 'https://example.test/file', conversationId: 'C' });
  });
  await page.waitForFunction(() => window.copyFixture.links.length === 2);
  assert.deepEqual(await page.evaluate(() => window.copyFixture.links.map(value => value.conversationId)), ['A', 'B']);
  assert.equal(await page.evaluate(() => window.copyFixture.files.find(([kind]) => kind === 'downloadUrl')[1].conversationId), 'C');

  const open = page.locator('#file-actions button').first();
  await page.evaluate(() => { window.copyFixture.guard = 'blocked'; }); await open.click();
  await page.waitForFunction(() => window.copyFixture.guarded === 1);
  assert.equal(await page.evaluate(() => window.copyFixture.files.filter(([kind]) => kind === 'open').length), 0);
  await page.evaluate(() => { window.copyFixture.guard = 'throw'; }); await open.click();
  await page.getByText('Preparation failed', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.copyFixture.files.filter(([kind]) => kind === 'open').length), 0);
  await page.evaluate(() => { window.copyFixture.guard = 'ready'; }); await open.click();
  await page.waitForFunction(() => window.copyFixture.files.some(([kind]) => kind === 'open'));
  await page.locator('#download-action button').click();
  await page.waitForFunction(() => window.copyFixture.files.some(([kind]) => kind === 'saveCopy'));
  await page.locator('#file-actions button').last().click();
  await page.getByRole('menu').waitFor();
  assert.doesNotMatch(await page.getByRole('menu').innerText(), /Google|ChatGPT|Codex/);
  assert.deepEqual(errors, []);
});
