import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/core/controller.mjs';
import {createBrowserBackend} from '../src/browser/backend.mjs';

const playwright = await import(process.env.OPENCU_PLAYWRIGHT_MODULE ?? 'playwright');
function ok(value) { assert.equal(value.ok, true, JSON.stringify(value)); return value; }

test('real CDP reconnect releases journalled input after owner-process death and verifies occurrence', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-cold-'));
  const chrome = spawn(playwright.chromium.executablePath(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(directory, 'profile')}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-extensions-with-background-pages', '--disable-features=Translate,BackForwardCache', '--no-service-autorun', '--no-sandbox', '--enable-automation', '--disable-popup-blocking', '--password-store=basic', '--use-mock-keychain', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', 'about:blank'], {stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP launch timeout: ${stderr}`)), 10_000);
    chrome.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/u);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    chrome.once('error', reject);
    chrome.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}`)); });
  });
  const fixture = createServer((_request, response) => { response.writeHead(200, {'content-type': 'text/html'}); response.end('<title>Cold recovery</title><button>Target</button><script>window.events=[];document.addEventListener("keyup",e=>events.push({kind:"keyup",key:e.key}));document.addEventListener("mouseup",e=>events.push({kind:"mouseup",button:e.button}));</script>'); });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const browser = await playwright.chromium.connectOverCDP(endpoint, {timeout: 5_000});
  const page = await browser.contexts()[0].newPage();
  let controller;
  t.after(async () => {
    await controller?.close();
    if (chrome.exitCode === null) { const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited; }
    await browser.close();
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
  });
  await page.goto(`http://127.0.0.1:${fixture.address().port}`, {waitUntil: 'commit', timeout: 10_000});
  const session = await browser.contexts()[0].newCDPSession(page);
  await session.send('Page.setWebLifecycleState', {state: 'active'});
  await page.waitForLoadState('domcontentloaded', {timeout: 5_000});
  const dataDir = join(directory, 'controller');
  const marker = join(directory, 'ready.json');
  const source = `import {writeFile} from 'node:fs/promises';
    import {createController} from ${JSON.stringify(new URL('../src/core/controller.mjs', import.meta.url).href)};
    const c=await createController({dataDir:${JSON.stringify(dataDir)}, browser:{cdpEndpoint:${JSON.stringify(endpoint)},playwright:await import(${JSON.stringify(import.meta.resolve(process.env.OPENCU_PLAYWRIGHT_MODULE ?? 'playwright'))})}});
    const t=(await c.listTargets()).targets.find(target=>target.title==='Cold recovery');await c.selectTarget(t.id);await c.act({action:'keyDown',key:'Shift'});await c.act({action:'mouseDown',x:20,y:20});await writeFile(${JSON.stringify(marker)},JSON.stringify(t));process.stdout.write('READY\\n');setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {stdio: ['ignore', 'pipe', 'pipe']});
  t.after(() => { if (child.exitCode === null && !child.killed) child.kill('SIGKILL'); });
  await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error(`Owner timeout ${errors}`)), 10_000);
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('READY')) { clearTimeout(timer); resolve(); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Owner exited ${code}: ${errors}`)); });
  });
  const original = JSON.parse(await readFile(marker, 'utf8'));
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  const held = JSON.parse(await readFile(join(dataDir, 'browser-inputs.json'), 'utf8'));
  assert.deepEqual(held[0].keys, ['Shift']);
  assert.deepEqual(held[0].buttons, ['left']);
  controller = await createController({dataDir, browser: await createBrowserBackend({dataDir, cdpEndpoint: endpoint, playwright})});
  const current = ok(await controller.listTargets()).targets.find(target => target.id === original.id);
  assert.equal(current.id, original.id);
  assert.deepEqual(current.identity, original.identity);
  ok(await controller.resume({targetId: original.id}));
  const events = await page.evaluate(() => events);
  assert.ok(events.some(event => event.kind === 'keyup' && event.key === 'Shift'));
  assert.ok(events.some(event => event.kind === 'mouseup' && event.button === 0));
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'browser-inputs.json'), 'utf8')), []);
  ok(await controller.close());
  assert.equal(page.isClosed(), false, 'CDP disconnect must not close the external browser');
});
