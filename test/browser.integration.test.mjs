import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/core/controller.mjs';
import {createBrowserBackend} from '../src/browser/backend.mjs';

const playwright = await import(process.env.OPENCU_PLAYWRIGHT_MODULE ?? 'playwright');
const sharp = (await import(process.env.OPENCU_SHARP_MODULE ?? 'sharp')).default;
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result; }
async function fixture() {
  const server = createServer((request, response) => {
    if (request.url === '/file') {
      response.writeHead(200, {'content-type': 'text/plain', 'content-disposition': 'attachment; filename="evidence.txt"'});
      response.end('durable OpenCU download\n');
      return;
    }
    response.writeHead(200, {'content-type': 'text/html'});
    response.end(`<!doctype html><title>${request.url === '/two' ? 'Second' : 'OpenCU fixture'}</title>
      <style>body{font:20px sans-serif;padding:20px}button,input,select,a{margin:8px}#space{height:1500px}</style>
      <h1>Real browser journey</h1><label>Name <input aria-label="Name"></label>
      <button onclick="document.querySelector('#result').textContent='Clicked'">Run</button>
      <select aria-label="Choice"><option value="a">Alpha</option><option value="b">Beta</option></select>
      <a href="/file" download>Download evidence</a><a href="/two">Second page</a><p id="result">Ready</p><div id="space"></div>
      <script>window.events=[]; for (const kind of ['keydown','keyup','mousedown','mouseup']) document.addEventListener(kind,e=>events.push({kind,key:e.key,button:e.button,shift:e.shiftKey}));</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {server, url, close: () => new Promise(resolve => server.close(resolve))};
}
async function directory() { return mkdtemp(join(tmpdir(), 'opencu-browser-')); }
function element(observation, role, name) {
  const entry = observation.ax.nodes.find(node => node.role === role && node.name === name);
  assert.ok(entry?.elementId, `Missing AX element ${role} ${name}`);
  return {elementId: entry.elementId, observationId: observation.observationId};
}

test('real Chromium: AX/screenshot, input, navigation/tabs, release and persistent downloads', async t => {
  const site = await fixture();
  const dataDir = await directory();
  const context = await playwright.chromium.launchPersistentContext(join(dataDir, 'profile'), {headless: true, viewport: {width: 900, height: 650}, acceptDownloads: true});
  const page = context.pages()[0];
  const backend = await createBrowserBackend({dataDir, context, instanceId: 'integration-session', playwright, sharp});
  let controller = await createController({dataDir, browser: backend});
  t.after(async () => { await controller.close(); await context.close(); await site.close(); });
  const target = ok(await controller.listTargets()).targets[0];
  ok(await controller.focus({reference: target}));
  assert.equal(ok(await controller.getState()).state.activeTargetId, null, 'opening an inventory reference does not select a tool target');
  assert.equal((await controller.focus({reference: {...target, identity: {...target.identity, targetId: 'replaced'}}})).error.code, 'TARGET_IDENTITY_CHANGED');
  ok(await controller.selectTarget({id: target.id, expected: {url: 'about:blank'}}));
  ok(await controller.act({action: 'navigate', url: site.url}));
  let observation = ok(await controller.observe({format: 'both', maxWidth: 600})).observation;
  assert.ok(observation.text.includes('Real browser journey'));
  assert.equal(observation.screenshot.width, 600);
  const image = await sharp(await readFile(observation.screenshot.path)).metadata();
  assert.equal(image.format, 'png');
  assert.equal(image.height, observation.screenshot.height);
  const name = element(observation, 'textbox', 'Name');
  ok(await controller.act({action: 'fill', ...name, value: 'OpenCU 中文'}));
  assert.equal(await page.locator('input').inputValue(), 'OpenCU 中文');
  ok(await controller.act({action: 'press', key: 'End'}));
  ok(await controller.act({action: 'type', text: ' real'}));
  ok(await controller.act({action: 'press', key: '+'}));
  assert.equal(await page.locator('input').inputValue(), 'OpenCU 中文 real+');
  ok(await controller.act({action: 'press', key: 'Backspace'}));
  assert.equal(await page.locator('input').inputValue(), 'OpenCU 中文 real');
  ok(await controller.act({action: 'click', ...element(observation, 'button', 'Run')}));
  assert.equal(await page.locator('#result').textContent(), 'Clicked');
  ok(await controller.act({action: 'selectOption', ...element(observation, 'combobox', 'Choice'), value: 'b'}));
  assert.equal(await page.locator('select').inputValue(), 'b');
  assert.equal(ok(await controller.observe({format: 'ax'})).userActivity, null, 'automated input is not reported as user activity');
  const invalidKey = await controller.act({action: 'press', key: 'Shift+ESC'});
  assert.equal(invalidKey.ok, false);
  assert.match(invalidKey.error.message, /Unknown key/);
  assert.notEqual(ok(await controller.getState()).state.mode, 'release_failed');
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'browser-inputs.json'), 'utf8')), []);
  ok(await controller.resume({targetId: target.id}));
  ok(await controller.act({action: 'press', key: 'Escape'}));
  await page.locator('input').click();
  await page.keyboard.insertText('user changed the page');
  assert.ok(ok(await controller.observe({format: 'ax'})).userActivity.sequence > 0);
  assert.equal(ok(await controller.getState()).state.mode, 'active', 'user activity does not take over or lock control');
  ok(await controller.act({action: 'keyDown', key: 'Shift'}));
  ok(await controller.act({action: 'mouseDown', x: 20, y: 20}));
  ok(await controller.stop());
  assert.equal((await controller.act({action: 'type', text: 'blocked'})).error.code, 'CONTROL_STOPPED');
  const events = await page.evaluate(() => events);
  assert.ok(events.some(event => event.kind === 'keyup' && event.key === 'Shift'));
  assert.ok(events.some(event => event.kind === 'mouseup' && event.button === 0));
  ok(await controller.resume({targetId: target.id}));
  observation = ok(await controller.observe({format: 'ax'})).observation;
  const download = ok(await controller.act({action: 'download', ...element(observation, 'link', 'Download evidence')})).result.delivery;
  assert.equal(download.status, 'complete');
  assert.equal(await readFile(download.path, 'utf8'), 'durable OpenCU download\n');
  const stale = element(observation, 'button', 'Run');
  ok(await controller.act({action: 'navigate', url: `${site.url}/two`}));
  assert.equal((await controller.act({action: 'click', ...stale})).error.code, 'STALE_ELEMENT');
  ok(await controller.resume({targetId: target.id}));
  ok(await controller.act({action: 'back'}));
  assert.equal(page.url(), `${site.url}/`);
  ok(await controller.act({action: 'forward'}));
  assert.equal(page.url(), `${site.url}/two`);
  ok(await controller.act({action: 'reload'}));
  const newTab = ok(await controller.act({action: 'newTab', url: site.url})).result.target;
  assert.equal(ok(await controller.getState()).state.targets.length, 2);
  ok(await controller.act({targetId: newTab.id, action: 'closeTab'}));
  ok(await controller.notifyUserActivity({targetId: target.id, kind: 'pointer'}));
  assert.equal(ok(await controller.getState()).state.mode, 'active');
  ok(await controller.observe({targetId: target.id, format: 'ax'}));
  ok(await controller.act({targetId: target.id, action: 'click', x: 10, y: 10}));
  ok(await controller.close());
  assert.equal(context.pages().length, 1, 'external context is not destroyed');
  const nextBackend = await createBrowserBackend({dataDir, context, instanceId: 'integration-session', playwright, sharp});
  controller = await createController({dataDir, browser: nextBackend});
  assert.equal(ok(await controller.getState()).state.mode, 'recovery_required');
  ok(await controller.resume({targetId: target.id}));
  assert.equal(ok(await controller.deliveries()).deliveries[0].id, download.id);
  assert.equal(ok(await controller.deliveries()).deliveries[0].status, 'complete');
});

test('headed managed browser keeps native geometry during repeated observation and monitoring', {skip: process.env.OPENCU_HEADED_CHECK !== '1'}, async t => {
  const site = await fixture(), dataDir = await directory();
  let context, session;
  const backend = await createBrowserBackend({dataDir, headless: false, sharp, playwright: {chromium: {
    async launchPersistentContext(...args) {
      context = await playwright.chromium.launchPersistentContext(...args);
      return context;
    },
  }}});
  t.after(async () => { await session?.detach(); await backend.close(); await site.close(); });
  const [target] = await backend.listTargets(), page = context.pages()[0];
  assert.equal(page.viewportSize(), null, 'headed monitoring must not emulate a fixed viewport/DPR');
  await backend.act(target, {action: 'navigate', url: site.url});
  session = await context.newCDPSession(page);
  const {windowId} = await session.send('Browser.getWindowForTarget');
  const geometry = () => page.evaluate(() => ({width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio, scrollX, scrollY}));
  const before = await geometry(), bounds = (await session.send('Browser.getWindowBounds', {windowId})).bounds;
  for (let index = 0; index < 5; index++) {
    const [preview, observation] = await Promise.all([backend.preview(target), backend.observe(target, {format: 'both', maxWidth: 600})]);
    assert.deepEqual(await geometry(), before);
    assert.deepEqual((await session.send('Browser.getWindowBounds', {windowId})).bounds, bounds);
    assert.equal(preview.width, before.width);
    assert.equal(preview.height, before.height);
    assert.equal(observation.screenshot.viewport.deviceScaleFactor, before.deviceScaleFactor);
    assert.equal(observation.screenshot.originalWidth, Math.round(before.width * before.deviceScaleFactor));
    assert.equal(observation.screenshot.width, Math.min(600, observation.screenshot.originalWidth));
  }
  const next = (await backend.act(target, {action: 'newTab', url: `${site.url}/two`})).target;
  assert.ok(context.pages().every(page => page.viewportSize() === null), 'new tabs must retain native window sizing');
  await backend.preview(next);
  assert.deepEqual((await session.send('Browser.getWindowBounds', {windowId})).bounds, bounds);
  t.diagnostic(JSON.stringify({captures: 11, geometry: before, bounds, nativeViewport: true}));
});

test('owned persistent browser cold restart never adopts a same-URL replacement tab', async () => {
  const dataDir = await directory();
  let controller = await createController({dataDir, browser: {playwright, sharp, headless: true}});
  const target = ok(await controller.listTargets()).targets[0];
  ok(await controller.selectTarget(target.id));
  ok(await controller.close());
  controller = await createController({dataDir, browser: {playwright, sharp, headless: true}});
  const current = ok(await controller.listTargets()).targets[0];
  assert.notEqual(current.id, target.id);
  assert.equal((await controller.resume({targetId: target.id})).error.code, 'TARGET_IDENTITY_CHANGED');
  ok(await controller.selectTarget(current.id));
  assert.equal((await controller.act({targetId: current.id, action: 'click', x: 1, y: 1})).error.code, 'CONTROL_STOPPED');
  ok(await controller.resume({targetId: current.id}));
  ok(await controller.close());
});
