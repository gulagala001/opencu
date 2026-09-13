import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';

test('delayed navigation cannot invalidate current preview input; new navigation still does', async t => {
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.setDefaultTimeout(3000);
  const { outputFiles } = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {BrowserPreview} from './src/client/browser-preview.jsx';
    window.calls=[];window.navigations=[];
    window.EventSource=class{constructor(){this.listeners=new Map();window.stream=this;}addEventListener(name,fn){this.listeners.set(name,fn)}close(){}};
    window.emit=(type,value)=>window.stream.listeners.get(type)?.({data:JSON.stringify(value)});
    createRoot(document.getElementById('root')).render(<BrowserPreview sessionId="session" tabId="tab" visible state={{enabled:true,status:'idle',viewViewport:{layoutSupported:false}}} api={async(op,id,value)=>{window.calls.push({op,...value});return {enabled:true,status:'stopped'};}} url={()=>'/test'} onState={()=>{}} onError={message=>{throw Error(message)}} onNavigation={value=>window.navigations.push(value)} />);
  `, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic' });
  await page.setContent('<div id="root" style="width:700px;height:500px"></div>');
  await page.addScriptTag({ content: outputFiles[0].text });
  await page.waitForFunction(() => window.stream);
  const data = (await sharp({ create: { width: 400, height: 250, channels: 3, background: '#3877e8' } }).png().toBuffer()).toString('base64');
  const frame = { id: 'new-frame', actor: 'observer', tabId: 'tab', loaderId: 'new', width: 400, height: 250, data, mediaType: 'image/png', controlEpoch: 1, stopped: false, geometry: { width: 400, height: 250 } };
  await page.evaluate(frame => {
    emit('ready', { actor: 'observer', controlEpoch: 1 });
    emit('navigation', { loaderId: 'new', observedAt: 20, tabId: 'tab' });
    emit('frame', frame);
  }, frame);
  const img = page.locator('.tx-cu-live img').first(); await img.waitFor(); await img.evaluate(img => img.decode());
  await page.evaluate(() => emit('navigation', { loaderId: 'old', observedAt: 10, tabId: 'tab' }));
  await img.click({ position: { x: 40, y: 40 } });
  await page.waitForFunction(() => calls.some(call => call.type === 'pointerdown'));
  assert.deepEqual(await page.evaluate(() => navigations.map(n => n.loaderId)), ['new']);
  assert.equal(await page.evaluate(() => calls.find(call => call.type === 'pointerdown').frameId), 'new-frame');
  const changedData = (await sharp({ create: { width: 400, height: 250, channels: 3, background: '#00aa44' } }).png().toBuffer()).toString('base64');
  await page.evaluate(frame => {
    // CDP can publish the document's screenshot before navigation history has
    // returned. Deliver both before React renders or the new image decodes.
    emit('frame', { ...frame, id: 'raced-frame', loaderId: 'raced' });
    emit('navigation', { loaderId: 'raced', observedAt: 25, tabId: 'tab' });
  }, { ...frame, data: changedData });
  await img.evaluate(img => img.decode());
  assert.equal(await page.locator('.tx-cu-live').getAttribute('data-connection'), 'live', 'navigation for a frame already received must not strand the preview connecting');
  await page.evaluate(() => { calls.length = 0; });
  await img.click({ position: { x: 40, y: 40 } });
  await page.waitForFunction(() => calls.some(call => call.type === 'pointerdown'));
  assert.equal(await page.evaluate(() => calls.find(call => call.type === 'pointerdown').frameId), 'raced-frame');
  await page.evaluate(frame => {
    calls.length = 0;
    emit('frame', { ...frame, id: 'superseded-frame', loaderId: 'superseded' });
    emit('navigation', { loaderId: 'next', observedAt: 30, tabId: 'tab' });
  }, frame);
  await img.evaluate(img => img.decode());
  await page.locator('textarea').press('ArrowDown');
  assert.equal(await page.evaluate(() => calls.filter(call => call.type === 'keydown').length), 0, 'a late image load cannot restore input for a superseded document');
  await img.click({ position: { x: 40, y: 40 } });
  assert.equal(await page.evaluate(() => calls.filter(call => call.type === 'pointerdown').length), 0, 'a genuine navigation invalidates input until its own frame arrives');
  await page.evaluate(frame => emit('frame', { ...frame, id: 'next-frame', loaderId: 'next' }), frame);
  await img.click({ position: { x: 40, y: 40 } });
  await page.waitForFunction(() => calls.some(call => call.type === 'pointerdown'));
  assert.equal(await page.evaluate(() => calls.find(call => call.type === 'pointerdown').frameId), 'next-frame', 'identical pixels still advance the document identity');
});
