import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { ImageCoordinates } from '../src/computer-use/image-coordinates.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

function center(image, color) {
  let x = 0, y = 0, count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const [red, green, blue] = image.data.subarray(index, index + 3);
    if (color === 'red' ? red > 170 && green < 90 && blue < 110 : blue > 170 && red < 90 && green > 60 && green < 140) {
      x += (index / 4) % image.info.width; y += Math.floor(index / 4 / image.info.width); count++;
    }
  }
  assert.ok(count > 100, `${color} field or button must be visible in actual cropped pixels`);
  return [x / count, y / count];
}

for (const backend of ['managed', 'extension']) test(backend + ': cropped coordinates operate only the scrolled inner frame and recover after its scroll changes', { timeout: 45000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-crop-frames-')), cleanups = []; let manager;
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const port = server.address().port;
    if (req.url === '/inner') res.end(`<style>body{margin:0;height:1200px}input,button{position:absolute;box-sizing:border-box;border:0;height:44px;color:white}#inner-input{left:60px;top:420px;width:180px;background:rgb(220,40,60)}#inner-save{left:300px;top:420px;width:120px;background:rgb(40,100,220)}#decoy{left:60px;top:500px;width:180px;background:rgb(40,170,60)}output{position:absolute;left:60px;top:590px}</style><input id="inner-input" aria-label="Inner note"><button id="inner-save" onclick="document.querySelector('output').textContent=document.querySelector('#inner-input').value;window.saves=(window.saves||0)+1">Save inner</button><input id="decoy" aria-label="Decoy"><output>not saved</output>`);
    else if (req.url === '/outer') res.end(`<style>body{margin:0;overflow:hidden}input{position:absolute;left:20px;top:15px}iframe{position:absolute;left:25px;top:65px;width:740px;height:460px;border:4px solid}</style><input aria-label="Outer frame note"><iframe title="Inner" src="http://127.0.0.1:${port}/inner"></iframe>`);
    else res.end(`<style>body{margin:0;overflow:hidden}input{position:absolute;left:20px;top:20px}iframe{position:absolute;left:70px;top:90px;width:850px;height:630px;border:5px solid}</style><input aria-label="Main note"><iframe title="Outer" src="http://localhost:${port}/outer"></iframe>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixture = { url: `http://127.0.0.1:${server.address().port}` };
  t.after(async () => { try { await manager?.close(); } finally { for (const cleanup of cleanups) await cleanup(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (!process.env.TRISOUL_CU_UI_ARTIFACTS) await rm(root, { recursive: true, force: true }); } });
  const external = backend === 'extension' ? await extensionFixture({ after: cleanup => cleanups.push(cleanup) }, { fixture, headless: true }) : null;
  manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, ...(external ? { extensionHub: external.hub } : {}), native: { binary: join(root, 'missing-native') } });
  const run = async (code, coordinateFrames) => { const result = await manager.execute('frames', code, { coordinateFrames }); assert.equal(result.error, undefined, JSON.stringify(result.error)); return result; };
  await run(`const tab = await cua.createBrowserTab(${JSON.stringify(external?.browser.id ?? 'browser')}, ${JSON.stringify(fixture.url)}); await tab.markDeliverable(); await tab.playwright.waitForLoadState('load');`);
  const target = manager.status('frames').target, host = manager.browserForTab(target.id, target.browserId), record = await host.target('frames', target.id), page = record.page;
  await page.setViewportSize({ width: 1200, height: 900 });
  const driver = await page.context().newCDPSession(page);
  await driver.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 2, mobile: false });
  assert.equal(await page.evaluate(() => devicePixelRatio), 2, 'the coordinate flow must run at an actual device pixel ratio of two');
  const outer = await (await page.locator('iframe[title=Outer]').elementHandle()).contentFrame();
  const inner = await (await outer.locator('iframe[title=Inner]').elementHandle()).contentFrame();
  assert.ok(outer.url().startsWith('http://localhost:') && inner.url().startsWith('http://127.0.0.1:'), 'the inner frame crosses two actual origin boundaries');
  await inner.evaluate(() => scrollTo(0, 240));
  assert.equal(await inner.evaluate(() => scrollY), 240);
  const before = await driver.send('Page.getLayoutMetrics');
  const coordinates = new ImageCoordinates(); let sequence = 0;
  const screenshot = async width => {
    const result = await run('await tab.getScreenshot({clip:{x:130,y:230,width:560,height:310}});');
    const block = result.blocks.find(block => block.type === 'image'); assert.ok(block?.capture?.geometry?.region);
    if (process.env.TRISOUL_CU_UI_ARTIFACTS) {
      const path = join(root, `crop-${sequence + 1}.png`); await writeFile(path, Buffer.from(block.data, 'base64'));
      const full = (await run('await tab.getScreenshot();')).blocks.find(block => block.type === 'image'); await writeFile(join(root, `full-${sequence + 1}.png`), Buffer.from(full.data, 'base64'));
      const raw = await record.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      const rawBytes = Buffer.from(raw.data, 'base64'), rawMetadata = await sharp(rawBytes).metadata();
      await writeFile(join(root, `raw-${sequence + 1}.png`), rawBytes);
      const metrics = await driver.send('Page.getLayoutMetrics');
      t.diagnostic(JSON.stringify({ path, capture: block.capture, rawPng: { width: rawMetadata.width, height: rawMetadata.height }, cssVisualViewport: metrics.cssVisualViewport, visualViewport: metrics.visualViewport, cssLayoutViewport: metrics.cssLayoutViewport, layoutViewport: metrics.layoutViewport, dpr: [await page.evaluate(() => devicePixelRatio), await outer.evaluate(() => devicePixelRatio), await inner.evaluate(() => devicePixelRatio)], scroll: await inner.evaluate(() => scrollY) }));
    }
    const preview = await sharp(Buffer.from(block.data, 'base64')).resize({ width }).png().toBuffer(), metadata = await sharp(preview).metadata();
    const ref = { attachmentId: `inner-crop-${++sequence}` }; coordinates.remember('frames', block.capture, ref);
    const attachments = { async readImageRequest() { return metadata; } }, dispose = coordinates.watch(attachments);
    try { for await (const _ of coordinates.stream('frames', async function* () { yield await attachments.readImageRequest(ref); })) {} } finally { dispose(); }
    return { image: await sharp(preview).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), frames: coordinates.frames('frames') };
  };
  const saveFrom = async (shot, value) => {
    const input = center(shot.image, 'red'), button = center(shot.image, 'blue');
    await run(`await tab.click(${JSON.stringify(input)}); await tab.pressKey(${JSON.stringify(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')}); await tab.typeText(${JSON.stringify(value)}); await tab.click(${JSON.stringify(button)});`, shot.frames);
    assert.equal(await inner.locator('#inner-input').inputValue(), value);
    assert.equal(await inner.locator('output').textContent(), value);
    assert.equal(await page.getByRole('textbox', { name: 'Main note', exact: true }).inputValue(), '');
    assert.equal(await outer.getByRole('textbox', { name: 'Outer frame note', exact: true }).inputValue(), '');
    assert.equal(await inner.locator('#decoy').inputValue(), '');
  };
  const initial = await screenshot(280);
  await saveFrom(initial, '内层中文，首次保存');
  const generation = record.generation;
  await inner.evaluate(() => scrollTo(0, 320));
  assert.equal(await inner.evaluate(() => scrollY), 320);
  assert.equal(await page.evaluate(() => scrollY), 0); assert.equal(await outer.evaluate(() => scrollY), 0);
  const afterScroll = await driver.send('Page.getLayoutMetrics');
  assert.deepEqual(afterScroll.cssVisualViewport, before.cssVisualViewport, 'only the inner document scrolls, not the top-level viewport');
  // Probe without typing so a regression cannot modify the decoy. Complete
  // the fresh-image recovery checks before asserting rejection below.
  const old = await manager.execute('frames', `await tab.click(${JSON.stringify(center(initial.image, 'red'))});`, { coordinateFrames: initial.frames });
  const focused = await inner.evaluate(() => document.activeElement.id);
  if (old.error) assert.match(old.error.message, /screenshot.*changed|stale.*screenshot/i);
  else assert.equal(focused, 'decoy', 'an accepted old coordinate is a physical pixel, not the original field identity');
  t.diagnostic(JSON.stringify({ backend, devicePixelRatio: await page.evaluate(() => devicePixelRatio), oldScreenshotRejected: !!old.error, focusedAfterOldPoint: focused, generationBeforeInnerScroll: generation, generationAfterInnerScroll: record.generation, mainScroll: await page.evaluate(() => scrollY), outerScroll: await outer.evaluate(() => scrollY), innerScroll: await inner.evaluate(() => scrollY) }));
  const refreshed = await screenshot(420);
  await saveFrom(refreshed, '内层中文，重新截图后保存');
  assert.equal(await inner.evaluate(() => saves), 2);
  assert.ok(old.error, 'the old crop must be rejected after the inner document scrolls; accepting it focuses the decoy');
  assert.equal(await page.evaluate(() => devicePixelRatio), 2);
  assert.deepEqual((await driver.send('Page.getLayoutMetrics')).cssVisualViewport, before.cssVisualViewport);
});
