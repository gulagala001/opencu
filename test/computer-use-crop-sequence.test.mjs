import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { ImageCoordinates } from '../src/computer-use/image-coordinates.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { panViewport } from './fixtures/computer-use/viewport.mjs';

function centroid(image, color, half) {
  let x = 0, y = 0, count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const px = (index / 4) % image.info.width;
    if (half !== undefined && (px < image.info.width / 2) !== half) continue;
    const [red, green, blue] = image.data.subarray(index, index + 3);
    if (color === 'red' ? red > 150 && green < 100 && blue < 120 : blue > 150 && red < 100 && green > 50 && green < 160) {
      x += px; y += Math.floor(index / 4 / image.info.width); count++;
    }
  }
  assert.ok(count > 30, `the actual ${color} target must appear in the requested cropped image`);
  return [x / count, y / count];
}

for (const backend of ['managed', 'extension']) for (const deviceScaleFactor of [1, 2]) test(backend + ` DPR${deviceScaleFactor}: cropped drag and A/B/A image reuse preserve origins across zoom, pan and different request sizes`, { timeout: 45000, skip: backend === 'extension' && process.platform === 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-crop-sequence-')), cleanups = []; let manager;
  t.after(async () => { try { await manager?.close(); } finally { for (const cleanup of cleanups) await cleanup(); await rm(root, { recursive: true, force: true }); } });
  const external = backend === 'extension' ? await extensionFixture({ after: cleanup => cleanups.push(cleanup) }, { headless: true }) : null;
  const fixture = external?.fixture ?? await startFixture(); if (!external) cleanups.push(() => fixture.close());
  manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, ...(external ? { extensionHub: external.hub } : {}), native: { binary: join(root, 'missing-native') } });
  const run = async (code, coordinateFrames) => {
    const result = await manager.execute('crop', code, { coordinateFrames });
    assert.equal(result.error, undefined, JSON.stringify(result.error)); return result;
  };
  const imageBlock = result => {
    const block = result.blocks.find(block => block.type === 'image');
    assert.ok(block?.capture?.geometry?.region); return block;
  };
  await run(`const tab = await cua.createBrowserTab(${JSON.stringify(external?.browser.id ?? 'browser')}, ${JSON.stringify(fixture.url + '/geometry')}); await tab.markDeliverable();`);
  const target = manager.status('crop').target, browser = manager.browserForTab(target.id, target.browserId);
  const page = external ? external.context.pages().find(page => page.url().endsWith('/geometry')) : (await browser.target('observer', target.id, { claim: false })).page;
  await page.setViewportSize({ width: 1800, height: 1200 });
  const driver = await page.context().newCDPSession(page);
  await driver.send('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1200, deviceScaleFactor, mobile: false });
  if (external) {
    const worker = external.context.serviceWorkers().find(worker => worker.url() === external.origin + 'worker.js');
    await worker.evaluate(id => chrome.tabs.setZoom(id, 1.5), target.nativeTabId);
  }
  await page.reload();
  assert.equal(await page.evaluate(() => devicePixelRatio), deviceScaleFactor * (external ? 1.5 : 1));
  await driver.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await panViewport(driver);
  const before = await driver.send('Page.getLayoutMetrics');
  assert.equal(before.cssVisualViewport.scale, 2);
  assert.equal(before.cssVisualViewport.zoom, external ? 1.5 : 1);
  assert.ok(before.cssVisualViewport.pageX > 20 && before.cssVisualViewport.offsetX > 20);

  const coordinates = new ImageCoordinates();
  const projected = async (block, id, width) => {
    const preview = await sharp(Buffer.from(block.data, 'base64')).resize({ width }).png().toBuffer();
    const metadata = await sharp(preview).metadata(), ref = { attachmentId: id };
    coordinates.remember('crop', block.capture, ref);
    const attachments = { async readImageRequest() { return metadata; } }, dispose = coordinates.watch(attachments);
    try { for await (const _ of coordinates.stream('crop', async function* () { yield await attachments.readImageRequest(ref); })) {} }
    finally { dispose(); }
    return { image: await sharp(preview).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), frames: coordinates.frames('crop') };
  };
  const cropA = { x: 90, y: 90, width: 440, height: 215 }, cropB = { x: 160, y: 80, width: 160, height: 120 };
  const first = imageBlock(await run(`const cropA = await tab.screenshot({clip:${JSON.stringify(cropA)}}); await nodeRepl.emitImage(cropA);`));
  const firstPreview = await projected(first, 'crop-a', 330);
  const second = imageBlock(await run(`const cropB = await tab.screenshot({clip:${JSON.stringify(cropB)}}); await nodeRepl.emitImage(cropB);`));
  const secondPreview = await projected(second, 'crop-b', 300);
  const repeated = imageBlock(await run('await nodeRepl.emitImage(cropA);'));
  assert.equal(repeated.data, first.data, 'A is the original captured byte buffer, not a new screenshot');
  assert.deepEqual(repeated.capture.geometry.region, first.capture.geometry.region);
  assert.notDeepEqual(repeated.capture.geometry.region, second.capture.geometry.region);
  const repeatedPreview = await projected(repeated, 'crop-a', 660);
  assert.notEqual(firstPreview.image.info.width, repeatedPreview.image.info.width);
  const key = JSON.stringify(['tab', target.browserId, target.id]);
  assert.deepEqual(firstPreview.frames.get(key).geometry.region, first.capture.geometry.region, 'older request mappings remain immutable');
  assert.deepEqual(secondPreview.frames.get(key).geometry.region, second.capture.geometry.region);
  assert.equal(repeatedPreview.frames.get(key).previewWidth, 660);
  await run(`await tab.click(${JSON.stringify(centroid(repeatedPreview.image, 'red'))});`, repeatedPreview.frames);
  assert.equal(await page.evaluate(() => geometryFixture.redHit), true, 'the delayed A image uses A origin and its new request dimensions, not B mapping');

  const dragging = imageBlock(await run(`await tab.getScreenshot({clip:${JSON.stringify(cropA)}});`));
  const dragPreview = await projected(dragging, 'crop-drag', 550);
  const from = centroid(dragPreview.image, 'blue', true), to = centroid(dragPreview.image, 'blue', false);
  await run(`await tab.drag(${JSON.stringify(from)}, ${JSON.stringify(to)});`, dragPreview.frames);
  assert.equal(await page.evaluate(() => geometryFixture.dragComplete), true, 'both drag endpoints must map through the nonzero crop origin');
  assert.deepEqual(await page.evaluate(() => geometryFixture.events.map(event => event.type)), ['red-hit', 'drag-start', 'drag-complete']);
  const after = await driver.send('Page.getLayoutMetrics');
  assert.deepEqual(after.cssVisualViewport, before.cssVisualViewport, 'cropping, replaying images, clicks and drag must preserve page zoom and pan');
  assert.deepEqual(after.cssLayoutViewport, before.cssLayoutViewport);
});
