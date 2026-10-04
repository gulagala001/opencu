import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { validateEmulation } from '../src/computer-use/browser-emulation.mjs';

async function setup(t, backend) {
  const root = await mkdtemp(join(tmpdir(), 'opencu-emulation-')), cleanups = [];
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, ua: req.headers['user-agent'] });
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html>${req.url === '/no-meta' ? '' : '<meta name="viewport" content="width=device-width,initial-scale=1">'}<style>body{margin:0;height:1500px}button{position:absolute;left:24px;top:24px;width:100px;height:48px}</style><button>Tap</button><script>window.events=[];for(const type of ['touchstart','touchend','click'])document.querySelector('button').addEventListener(type,()=>events.push(type));</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const fixture = { url: 'http://127.0.0.1:' + server.address().port };
  let manager;
  t.after(async () => {
    try { await manager?.close(); }
    finally { for (const close of cleanups) await close(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
  });
  const external = backend === 'extension' ? await extensionFixture({ after: close => cleanups.push(close) }, { fixture, viewport: null }) : null;
  manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'absent') }, ...(external ? { extensionHub: external.hub } : {}) });
  const browserId = external?.browser.id ?? 'browser';
  const run = async code => { if(process.env.OPENCU_EMULATION_DEBUG)console.log(backend,code); const result = await manager.execute('test', code); assert.equal(result.error, undefined, JSON.stringify(result.error)); return result; };
  await run(`var browser=await cua.getBrowser({id:${JSON.stringify(browserId)}});var tab=await cua.createBrowserTab(${JSON.stringify(browserId)},${JSON.stringify(fixture.url)});await tab.markDeliverable();`);
  const browser = manager.browserFor(browserId), id = manager.status('test').target.id;
  const record = await browser.target('test', id);
  const inspect = () => record.page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio, coarse: matchMedia('(pointer:coarse)').matches, touch: navigator.maxTouchPoints, ua: navigator.userAgent }));
  return { manager, browser, browserId, run, record, inspect, fixture, requests, id };
}

test('device emulation rejects malformed settings without accepting silent extras', () => {
  for (const value of [null, [], { width: 411 }, { hasTouch: 1 }, { isMobile: 'true' }, { deviceScaleFactor: NaN }, { deviceScaleFactor: 0 }, { deviceScaleFactor: 11 }, { userAgent: '' }, { userAgent: 'x\ny' }]) assert.throws(() => validateEmulation(value));
  assert.deepEqual(validateEmulation({ hasTouch: false, deviceScaleFactor: 3.5 }), { hasTouch: false, deviceScaleFactor: 3.5 });
});

test('failed turn cleanup remains visible and blocks new execution until restoration is retried', { timeout: 15000 }, async t => {
  const s = await setup(t, 'managed');
  await s.run("await tab.emulation.set({userAgent:'Turn cleanup fixture'});");
  const send = s.record.cdp.send.bind(s.record.cdp); let fail = true;
  s.record.cdp.send = (method, params) => {
    if (method === 'Emulation.setUserAgentOverride' && params.userAgent === '' && fail) { fail = false; return Promise.reject(new Error('injected turn restoration failure')); }
    return send(method, params);
  };
  await assert.rejects(s.manager.endTurn('test'), /injected turn restoration failure/);
  assert.equal(s.manager.status('test').status, 'error');
  await assert.rejects(s.manager.execute('test', 'nodeRepl.write(1)'), /stopped by the user/);
  await s.manager.stop('test');
  assert.equal(s.browser.emulations.size, 0);
  await s.manager.resume('test');
  assert.equal(s.manager.status('test').status, 'idle');
});

for (const backend of ['managed', 'extension']) test(backend + ' device simulation preserves coordinates, inherits before navigation and restores on stop', { timeout: 60000 }, async t => {
  const s = await setup(t, backend), original = await s.inspect();
  await s.run("await tab.viewport.set({width:411,height:800});await tab.emulation.set({deviceScaleFactor:3.5,hasTouch:true,isMobile:true,userAgent:'OpenCU Mobile Fixture'});");
  const mobile = await s.inspect();
  assert.deepEqual(mobile, { width: 411, dpr: 3.5, coarse: true, touch: 1, ua: 'OpenCU Mobile Fixture' });
  const capture = await s.run('await tab.getScreenshot();');
  const image = capture.blocks.find(block => block.type === 'image');
  assert.equal((await sharp(Buffer.from(image.data, 'base64')).metadata()).width, 411);
  await s.run('await tab.click([60,45]);');
  assert.deepEqual(await s.record.page.evaluate(() => events), ['touchstart', 'touchend', 'click']);
  await s.run("await tab.playwright.getByRole('button',{name:'Tap',exact:true}).click();");
  assert.deepEqual(await s.record.page.evaluate(() => events.slice(-3)), ['touchstart', 'touchend', 'click']);
  const crop=await s.run('await nodeRepl.emitImage(await tab.screenshot({clip:{x:24,y:24,width:100,height:48}}));');
  const cropMeta=await sharp(Buffer.from(crop.blocks.find(block=>block.type==='image').data,'base64')).metadata();
  assert.deepEqual([cropMeta.width,cropMeta.height],[100,48]);
  await s.run("await tab.viewport.set({width:420,height:810});await tab.reload();");
  assert.equal((await s.inspect()).dpr, 3.5);
  assert.equal(s.requests.filter(r => r.url === '/').at(-1).ua, 'OpenCU Mobile Fixture');
  await s.run("await tab.emulation.set({hasTouch:false});");
  assert.deepEqual(await s.inspect(), { ...original, width: 420 });
  await s.run("await tab.emulation.reset();await tab.viewport.reset();");
  assert.deepEqual(await s.inspect(), original);
  await s.run("var emulation=await browser.capabilities.get('emulation');await emulation.set({deviceScaleFactor:2,hasTouch:true,isMobile:true,userAgent:'OpenCU Inherited Fixture'});var viewport=await browser.capabilities.get('viewport');await viewport.set({width:390,height:780});");
  await s.run(`var second=await cua.createBrowserTab(${JSON.stringify(s.browserId)},${JSON.stringify(s.fixture.url + '/new')});await second.markDeliverable();`);
  assert.equal(s.requests.find(r => r.url === '/new').ua, 'OpenCU Inherited Fixture');
  const secondId = s.manager.status('test').target.id, second = await s.browser.target('test', secondId);
  assert.deepEqual(await second.page.evaluate(() => [innerWidth, devicePixelRatio, navigator.maxTouchPoints]), [390, 2, 1]);
  await s.manager.stop('test');
  await assert.rejects(s.manager.execute('test', 'await cua.getState();'), /stopped by the user/);
  const observer = await s.browser.target('observer', secondId, { claim: false });
  assert.deepEqual(await observer.page.evaluate(() => [devicePixelRatio, navigator.maxTouchPoints, navigator.userAgent]), [original.dpr, original.touch, original.ua]);
  assert.equal(s.browser.emulations.size, 0);
  assert.equal(s.browser.emulationPresets.size, 0);
  await s.manager.resume('test');
  await s.run(`var tab=await cua.getTab(${JSON.stringify(s.id)},{browser:${JSON.stringify(s.browserId)}});await tab.emulation.set({isMobile:true});await tab.goto(${JSON.stringify(s.fixture.url + '/no-meta')});`);
  const rebound = await s.browser.target('test', s.id);
  assert.ok(await rebound.page.evaluate(() => innerWidth >= 980), 'mobile layout applies to a document without a viewport meta tag');
  await s.manager.reset('test');
  assert.equal(s.browser.emulations.size, 0);
});
