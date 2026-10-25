import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { dependencyRequire } from '../scripts/dependencies.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = dependencyRequire();

// Real React, REA providers, notifications, styles and portal lifecycle. Only
// the surrounding host page and empty retained-page list are synthetic.
test('REA overlays preserve page hit-testing, notification actions and cleanup', { timeout: 60000 }, async t => {
  const { outputFiles } = await require('esbuild').build({
    absWorkingDir: root, entryPoints: ['test/fixtures/portal-safety.jsx'],
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': 'document.baseURI', 'import.meta.resolve': 'undefined' },
    loader: { '.css': 'text' }, logLevel: 'silent',
    plugins: [{ name: 'test-host-boundary', setup(b) {
      b.onResolve({ filter: /^react-host$/ }, () => ({ path: require.resolve('react') }));
      b.onResolve({ filter: /^(react|react-dom|react-compiler-runtime)(\/|$)/ }, args => ({ path: require.resolve(args.path) }));
      b.onResolve({ filter: /.*/ }, args => args.kind === 'dynamic-import' ? { path: args.path, external: true } : undefined);
    } }],
  });
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/fixture.js' ? outputFiles[0].contents : '<!doctype html><html><head></head><body><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 822 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.portalFixture);
  await page.addStyleTag({ content: '.fixed{position:fixed}.z-\\[60\\]{z-index:60}' });
  await page.evaluate(() => {
    for (const [x, y] of [[20,20],[1180,20],[20,730],[1180,730],[600,380]]) {
      const button = document.createElement('button'); button.textContent = 'Host control';
      button.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:70px;height:40px`;
      button.onclick = () => { window.hostClicks = (window.hostClicks ?? 0) + 1; };
      document.body.append(button);
    }
    window.portalFixture.mount('hidden', true);
  });
  await page.locator('.codex-toast-area').waitFor({ state: 'attached' });
  async function clickPage() {
    const before = await page.evaluate(() => window.hostClicks ?? 0);
    for (const [x,y] of [[55,40],[1215,40],[55,750],[1215,750],[635,400]]) await page.mouse.click(x,y);
    assert.equal(await page.evaluate(() => window.hostClicks), before + 5);
  }
  await clickPage(); // No host utility stylesheet at all.
  await page.addStyleTag({ content: 'body>div,[data-embedded-frame-host-root],[data-browser-host-root],.codex-toast-area,.pointer-events-none{pointer-events:auto!important}' });
  await clickPage(); // Even hostile host !important rules cannot turn carriers opaque.
  assert.equal(await page.evaluate(() => document.querySelector('.codex-toast-area')), null);
  await page.evaluate(() => window.portalFixture.notify('Hidden host notification'));
  await page.getByText('Hidden host notification', { exact: true }).waitFor();
  await clickPage(); // Visible notification must not block the rest of the page.
  await page.locator('[data-sonner-toast] button').click();
  await page.locator('[data-sonner-toast]').waitFor({ state: 'detached' });

  await page.evaluate(() => { window.portalFixture.mount('one'); window.portalFixture.mount('two'); });
  await page.evaluate(() => window.portalFixture.unmount('one')); // Out-of-order provider cleanup.
  await page.evaluate(() => window.portalFixture.notify('Move this notification'));
  await page.locator('[data-test-portal="two"] [data-sonner-toast]').waitFor();
  await page.evaluate(() => window.portalFixture.move('two'));
  // REA dismisses the old viewport's notifications on unmount. Subsequent
  // notifications must use the new styled portal, never the detached one.
  await page.evaluate(() => window.portalFixture.notify('After portal move'));
  await page.getByText('After portal move', { exact: true }).waitFor();
  await page.locator('[data-test-portal="two"] [data-sonner-toast]').waitFor();
  await page.locator('[data-test-portal="two"] [data-sonner-toast] button').click();
  await page.locator('[data-sonner-toast]').waitFor({ state: 'detached' });
  await page.evaluate(() => window.portalFixture.unmount('two'));
  await page.evaluate(() => window.portalFixture.notify('Fallback host still works'));
  await page.getByText('Fallback host still works', { exact: true }).waitFor();
  await page.locator('[data-sonner-toast] button').click();
  await page.locator('[data-sonner-toast]').waitFor({ state: 'detached' });

  assert.equal(await page.evaluate(() => window.portalFixture.guestRoots().reused), true);
  await clickPage();
  await page.getByText('Guest control', { exact: true }).click();
  assert.equal(await page.evaluate(() => window.guestClicks), 1);
  await page.evaluate(() => { document.querySelector('[data-embedded-frame-host-root]').remove(); window.portalFixture.unmount('hidden'); });
  await page.waitForFunction(() => document.querySelectorAll('[data-opencu-portal]').length === 0);
  await clickPage();
  await page.evaluate(() => window.portalFixture.mount('remounted', true));
  await page.locator('.codex-toast-area').waitFor({ state: 'attached' });
  await clickPage();
  await page.evaluate(() => window.portalFixture.unmount('remounted'));
  await page.waitForFunction(() => document.querySelectorAll('[data-opencu-portal]').length === 0);
  await page.addStyleTag({ content: '[data-opencu-cursor]{pointer-events:auto!important}' });
  await page.addScriptTag({ content: await readFile(new URL('../lib/page-cursor.js', import.meta.url), 'utf8') });
  await page.evaluate(() => window.__opencuCursor.update({ visible: true, x: 635, y: 400, animateMovement: false }));
  await page.locator('[data-opencu-cursor]').waitFor({ state: 'attached' });
  await clickPage();
  await page.evaluate(() => window.__opencuCursor.dispose());
  assert.equal(await page.locator('[data-opencu-cursor]').count(), 0);
  assert.deepEqual(errors, []);
});
