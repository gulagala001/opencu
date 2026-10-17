import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile(new URL('../src/client/portal-host.mjs', import.meta.url), 'utf8');
const baseCssPath = process.env.OPENCU_TEST_HOST_BASE_CSS;

test('transparent REA carriers preserve host drag rows while menu content remains clickable', { skip: !baseCssPath }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const base = await readFile(baseCssPath, 'utf8');
    await page.setContent(`<html data-platform="darwin"><head><style>${base}</style></head><body><div id="root"><header data-window-drag style="height:50px;width:800px"><button id="control">Action</button></header></div></body></html>`);
    await page.addScriptTag({ type: 'module', content: `${source}\nwindow.portalHost = { createReaPortal, guestPortalStyles };` });
    await page.waitForFunction(() => window.portalHost);
    const result = await page.evaluate(() => {
      function draggable(x, y) {
        let value = false;
        function visit(root) {
          for (const element of root.children) {
            const style = getComputedStyle(element), box = element.getBoundingClientRect();
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const region = style.getPropertyValue('-webkit-app-region');
            if (box.width && box.height && x >= box.left && x < box.right && y >= box.top && y < box.bottom && ['drag', 'no-drag'].includes(region)) value = region === 'drag';
            visit(element.shadowRoot ?? element);
          }
        }
        visit(document.documentElement);
        return value;
      }
      const broken = document.createElement('div');
      broken.style.cssText = 'position:fixed;inset:0;pointer-events:none';
      document.body.append(broken);
      const before = draggable(400, 20); broken.remove();
      const carriers = [50, 70, 50].map(z => window.portalHost.createReaPortal('', { reaRoot: '' }, z));
      const embedded = document.createElement('div'); embedded.dataset.embeddedFrameHostRoot = 'true'; document.body.append(embedded);
      const style = document.createElement('style'); style.textContent = window.portalHost.guestPortalStyles; document.head.append(style);
      const restored = draggable(400, 20);
      const menu = document.createElement('div');
      menu.style.cssText = 'position:fixed;left:350px;top:10px;width:150px;height:80px;background:white';
      const button = document.createElement('button'); button.textContent = 'Menu action';
      window.menuClicks = 0; button.onclick = () => window.menuClicks++;
      menu.append(button); carriers[1].portal.append(menu);
      return { before, restored, covered: draggable(400, 20), outside: draggable(700, 20), control: draggable(20, 20), carriers: carriers.map(({ host }) => getComputedStyle(host).getPropertyValue('-webkit-app-region')), embedded: getComputedStyle(embedded).getPropertyValue('-webkit-app-region') };
    });
    assert.equal(result.before, false, 'reproduces the full-window no-drag subtraction');
    assert.equal(result.restored, true);
    assert.equal(result.covered, false, 'the visible menu still subtracts its own box');
    assert.equal(result.outside, true);
    assert.equal(result.control, false);
    assert.deepEqual(result.carriers, ['none', 'none', 'none']);
    assert.equal(result.embedded, 'none');
    await page.getByText('Menu action', { exact: true }).click();
    assert.equal(await page.evaluate(() => window.menuClicks), 1);
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
});
