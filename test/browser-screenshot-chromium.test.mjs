// Real Chromium + Playwright Page/CDP + Sharp, with production relative imports.
// Race timing is deliberately injected; this is not an incidence estimate or DSH/macOS integration test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {observePage} from '../src/browser/observation.mjs';
import {actOnPage, releasePage} from '../src/browser/actions.mjs';

const html = `<style>body{margin:0;height:2200px}button{position:absolute;left:75px;width:50px;height:50px;border:0;padding:0}#A{top:75px;background:rgb(255,0,0)}#B{top:275px;background:rgb(0,0,255)}</style><button id="A" aria-label="A"></button><button id="B" aria-label="B"></button><script>window.events=[];for(const type of ['click','mousedown','mouseup','keydown','keyup'])document.addEventListener(type,e=>events.push({type,id:e.target.id,key:e.key,buttons:e.buttons}));</script>`;
let browser;
test.before(async () => {
  browser = await chromium.launch({headless:true, chromiumSandbox:true});
  console.log(`Chromium ${browser.version()}; Node ${process.version}; ${process.platform}/${process.arch}`);
});
test.after(async () => { await browser?.close(); });

async function fixture(t, dpr) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-chromium-'));
  t.after(() => rm(dataDir, {recursive:true, force:true}));
  const context = await browser.newContext({viewport:{width:800,height:600}, deviceScaleFactor:dpr, serviceWorkers:'block', offline:true});
  t.after(() => context.close());
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  await page.setContent(html);
  const session = await context.newCDPSession(page);
  const record = {id:'synthetic-page', page, session, documentGeneration:0, elements:new Map(), pending:new Set(), keys:new Set(), buttons:new Set(), pointer:{x:0,y:0}};
  const options = {dataDir, sharp, timeoutMs:5000, persistInputs:async()=>{}};
  const observe = () => observePage(record, {format:'screenshot', maxWidth:400}, options);
  const request = result => ({action:'click', x:50, y:50, coordinateSpace:'screenshot-pixels', observationId:result.observationId});
  const clicks = () => page.evaluate(() => events.filter(e=>e.type==='click').map(e=>e.id));
  return {page,record,options,observe,request,clicks,dataDir};
}

async function assertPng(source, width, height, x, y) {
  const metadata = await sharp(source).metadata();
  assert.equal(metadata.width, width); assert.equal(metadata.height, height);
  const {data} = await sharp(source).removeAlpha().extract({left:x,top:y,width:1,height:1}).raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([...data], [255,0,0], 'the captured target A is actually red in the PNG');
}

for (const dpr of [1,2]) {
  test(`capture race DPR ${dpr}: reject geometry change before saving`, {timeout:15000}, async t => {
    const f = await fixture(t,dpr), screenshot = f.page.screenshot.bind(f.page);
    f.page.screenshot = async options => {
      const bytes = await screenshot(options);
      await assertPng(bytes,800*dpr,600*dpr,100*dpr,100*dpr);
      await f.page.evaluate(() => scrollTo(0,200));
      return bytes;
    };
    // The pinned baseline accepts the old PNG and clicks B; the fix rejects it.
    let result, error;
    try { result = await f.observe(); } catch (caught) { error = caught; }
    if (result) {
      await actOnPage(f.record,f.request(result),f.options);
      t.diagnostic(`accepted PNG scrollY=${result.screenshot.viewport.scrollY}; actual click targets: ${JSON.stringify(await f.clicks())}`);
    }
    assert.equal(error?.code,'STALE_OBSERVATION');
    assert.deepEqual(await readdir(f.dataDir), [], 'rejected capture leaves no orphan image');
    assert.deepEqual(await f.clicks(), []);
  });

  test(`cursor race DPR ${dpr}: reject input after scrolling`, {timeout:15000}, async t => {
    const f = await fixture(t,dpr), result = await f.observe();
    await assertPng(result.screenshot.path,400,300,50,50);
    f.options.cursor = async () => { await f.page.evaluate(() => scrollTo(0,200)); };
    let error;
    try { await actOnPage(f.record,f.request(result),f.options); } catch (caught) { error = caught; }
    const hits = await f.clicks();
    t.diagnostic(`actual click targets: ${JSON.stringify(hits)}`);
    // Baseline emits B; fixed must reject and emit no click.
    assert.equal(error?.code,'STALE_SCREENSHOT');
    assert.deepEqual(hits,[]);
  });

  test(`normal DPR ${dpr}: downscaled PNG clicks A`, {timeout:15000}, async t => {
    const f = await fixture(t,dpr), result = await f.observe();
    assert.equal(result.screenshot.originalWidth,800*dpr);
    assert.equal(result.screenshot.originalHeight,600*dpr);
    assert.equal(result.screenshot.viewport.deviceScaleFactor,dpr);
    await assertPng(result.screenshot.path,400,300,50,50);
    await actOnPage(f.record,f.request(result),f.options);
    assert.deepEqual(await f.clicks(),['A']);
  });

  test(`cancel DPR ${dpr}: abort cursor prevents dispatch`, {timeout:15000}, async t => {
    const f = await fixture(t,dpr), result = await f.observe(), controller = new AbortController();
    f.options.cursor = async () => { controller.abort(); };
    await assert.rejects(actOnPage(f.record,{...f.request(result),signal:controller.signal},f.options),{code:'CONTROL_STOPPED'});
    assert.deepEqual(await releasePage(f.record,1000),[]);
    assert.deepEqual(await f.page.evaluate(() => events),[]);
  });

  test(`release DPR ${dpr}: held input releases despite stale screenshot`, {timeout:15000}, async t => {
    const f = await fixture(t,dpr), result = await f.observe();
    await actOnPage(f.record,{...f.request(result),action:'mouseDown'},f.options);
    await actOnPage(f.record,{action:'keyDown',key:'Shift'},f.options);
    await f.page.evaluate(() => scrollTo(0,200));
    assert.deepEqual(await releasePage(f.record,1000),[]);
    assert.equal(f.record.buttons.size,0); assert.equal(f.record.keys.size,0);
    const events = await f.page.evaluate(() => window.events);
    assert.ok(events.some(e=>e.type==='mousedown'));
    assert.ok(events.some(e=>e.type==='mouseup' && e.buttons===0));
    assert.ok(events.some(e=>e.type==='keyup' && e.key==='Shift'));
  });
}
