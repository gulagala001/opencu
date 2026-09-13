import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { ImageCoordinates } from '../src/computer-use/image-coordinates.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

function center(image, color) {
  let x = 0, y = 0, count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const [red, green, blue] = image.data.subarray(index, index + 3);
    if (color === 'red' ? red > 170 && green < 90 && blue < 110 : blue > 170 && red < 90 && green > 60 && green < 140) {
      x += (index / 4) % image.info.width; y += Math.floor(index / 4 / image.info.width); count++;
    }
  }
  assert.ok(count > 100, `${color} target must be present in the cropped pixels`);
  return [x / count, y / count];
}

test('scrolling an open-shadow container rejects old crop coordinates before input and a fresh crop restores control', { timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-shadow-scroll-'));
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  const run = async (code, coordinateFrames) => { const result = await manager.execute('shadow', code, { coordinateFrames }); assert.equal(result.error, undefined, JSON.stringify(result.error)); return result; };
  await run("const tab = await cua.createBrowserTab('browser');");
  const target = manager.status('shadow').target, record = await manager.browser.target('shadow', target.id), page = record.page;
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.setContent('<style>body{margin:0;overflow:hidden}#outside{position:absolute;left:20px;top:20px}#host{position:absolute;left:80px;top:90px}</style><input id="outside"><div id="host"></div>');
  await page.evaluate(() => {
    const shadow = document.querySelector('#host').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>#scroller{position:relative;width:620px;height:370px;overflow:auto;border:4px solid}#content{position:relative;height:900px}input,button{position:absolute;box-sizing:border-box;border:0;height:40px;color:white}#target{left:50px;top:320px;width:180px;background:rgb(220,40,60)}#save{left:320px;top:320px;width:120px;background:rgb(40,100,220)}#decoy{left:50px;top:400px;width:180px;background:rgb(40,170,60)}</style><div id="scroller"><div id="content"><input id="target"><button id="save">Save shadow</button><input id="decoy"></div></div>';
    window.shadowClicks = []; window.savedShadowValue = null;
    shadow.addEventListener('click', event => shadowClicks.push(event.target.id));
    shadow.querySelector('#save').onclick = () => { window.savedShadowValue = shadow.querySelector('#target').value; };
    shadow.querySelector('#scroller').scrollTop = 180;
  });
  assert.equal(await page.evaluate(() => document.querySelector('#scroller')), null, 'the scroller is genuinely inside an open shadow root');
  const driver = await page.context().newCDPSession(page), before = await driver.send('Page.getLayoutMetrics');
  const coordinates = new ImageCoordinates(); let sequence = 0;
  const screenshot = async width => {
    const result = await run('await tab.getScreenshot({clip:{x:100,y:120,width:540,height:300}});');
    const block = result.blocks.find(block => block.type === 'image'); assert.ok(block?.capture?.geometry?.region);
    const preview = await sharp(Buffer.from(block.data, 'base64')).resize({ width }).png().toBuffer(), metadata = await sharp(preview).metadata();
    const ref = { attachmentId: `shadow-crop-${++sequence}` }; coordinates.remember('shadow', block.capture, ref);
    const attachments = { async readImageRequest() { return metadata; } }, dispose = coordinates.watch(attachments);
    try { for await (const _ of coordinates.stream('shadow', async function* () { yield await attachments.readImageRequest(ref); })) {} } finally { dispose(); }
    return { image: await sharp(preview).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), frames: coordinates.frames('shadow') };
  };
  const initial = await screenshot(270), point = center(initial.image, 'red'), generation = record.generation;
  await page.locator('#scroller').evaluate(element => { element.scrollTop = 260; });
  assert.equal(await page.locator('#scroller').evaluate(element => element.scrollTop), 260);
  assert.equal(record.generation, generation, 'the document did not navigate');
  assert.deepEqual((await driver.send('Page.getLayoutMetrics')).cssVisualViewport, before.cssVisualViewport);
  const stale = await manager.execute('shadow', `await tab.click(${JSON.stringify(point)});`, { coordinateFrames: initial.frames });
  assert.match(stale.error?.message, /screenshot geometry has changed/);
  assert.deepEqual(await page.evaluate(() => shadowClicks), [], 'stale coordinates must fail before clicking the newly exposed decoy');
  const fresh = await screenshot(405);
  await run(`await tab.click(${JSON.stringify(center(fresh.image, 'red'))}); await tab.typeText('Shadow 中文恢复'); await tab.click(${JSON.stringify(center(fresh.image, 'blue'))});`, fresh.frames);
  assert.equal(await page.evaluate(() => savedShadowValue), 'Shadow 中文恢复');
  assert.deepEqual(await page.evaluate(() => shadowClicks), ['target', 'save']);
  assert.equal(await page.locator('#decoy').inputValue(), ''); assert.equal(await page.locator('#outside').inputValue(), '');
  assert.equal(await page.locator('#scroller').evaluate(element => element.scrollTop), 260);
  assert.deepEqual((await driver.send('Page.getLayoutMetrics')).cssVisualViewport, before.cssVisualViewport);
});
