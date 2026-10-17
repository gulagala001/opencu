import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createExtensionBackend } from '../src/extension/backend.mjs';
import { createCompositeBrowserBackend } from '../src/integration/browser.mjs';
import { createController } from '../src/core/controller.mjs';

// Opt-in only: one real isolated Chromium journey, never the user's Chrome profile.
test('real MV3 bridge, trusted input, navigation, download, release and browser reopen', { skip: process.env.OPENCU_EXTENSION_REAL !== '1', timeout: 90000 }, async () => {
  const require = createRequire(import.meta.url), { chromium } = require('playwright');
  const extension = resolve('extension'), root = await mkdtemp(join(extension, '.verification-'));
  const profile = join(root, 'profile'), downloadDir = join(root, 'downloads');
  await mkdir(join(profile, 'Default'), { recursive: true }); await mkdir(downloadDir);
  await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: downloadDir, prompt_for_download: false } }));
  const token = 'real-verification-token-01234567890123456789';
  const server = createServer(), bridge = createExtensionBackend({ server, token, dataDir: join(root, 'bridge'), requestTimeoutMs: 12000 });
  const composite = createCompositeBrowserBackend({ extension: bridge });
  const backend = { ...bridge, ...composite, getDiagnostics: bridge.getDiagnostics };
  const fixture = createServer((req, res) => {
    if (req.url === '/file') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="proof.txt"' }); res.end('OpenCU real download verified'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>MV3 real proof</title><style>body{padding:30px;font:18px system-ui}button,input,a{margin:12px;padding:12px;font:inherit}body{height:2000px}</style><h1>Real extension proof</h1><button>Count 0</button><input aria-label="Message"><a href="/file" download>Download</a><script>let n=0;document.querySelector("button").onclick=()=>document.querySelector("button").textContent="Count "+ ++n;window.events=[];for(const type of ["mousedown","mouseup","keydown","keyup"])document.addEventListener(type,e=>events.push({type,key:e.key,x:e.clientX,y:e.clientY,trusted:e.isTrusted}));</script>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); await new Promise(r => fixture.listen(0, '127.0.0.1', r));
  const fixtureURL = `http://127.0.0.1:${fixture.address().port}`;
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  const expectedId = createHash('sha256').update(manifest.key ? Buffer.from(manifest.key, 'base64') : extension).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, x => String.fromCharCode(97 + parseInt(x, 16)));
  const browser = spawn(chromium.executablePath(), [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-sync', '--metrics-recording-only',
    '--password-store=basic', '--use-mock-keychain', '--disable-features=HttpsUpgrades,LocalNetworkAccessChecks,MediaRouter,OptimizationHints',
    '--window-size=1000,720', '--force-device-scale-factor=2', `chrome-extension://${expectedId}/options.html`], { stdio: 'ignore' });
  const pause = ms => new Promise(r => setTimeout(r, ms));
  let socket, controller;
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await pause(100); } }
    assert.ok(port, 'isolated Chromium must start');
    const local = `http://127.0.0.1:${port}`;
    let extensionId;
    for (let attempt = 0; attempt < 50; attempt++) {
      const targets = await (await fetch(local + '/json/list')).json();
      extensionId = targets.find(t => t.url === `chrome-extension://${expectedId}/background.js`)?.url.split('/')[2];
      if (extensionId) break; await pause(100);
    }
    assert.ok(extensionId, 'MV3 service worker loaded');
    const ui = (await (await fetch(local + '/json/list')).json()).find(t => t.url === `chrome-extension://${extensionId}/options.html`);
    socket = new WebSocket(ui.webSocketDebuggerUrl); await new Promise((r, reject) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0; const pending = new Map();
    socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const entry = pending.get(message.id); pending.delete(message.id); message.error ? entry.reject(Error(message.error.message)) : entry.resolve(message.result); } });
    const cdp = (method, params) => new Promise((r, reject) => { const id = ++sequence; pending.set(id, { resolve: r, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value;
    };
    for (let attempt = 0; attempt < 50; attempt++) { try { if (await evaluate('!!document.querySelector("#connect") && document.querySelector("#status").textContent !== "读取连接状态…"')) break; } catch {} await pause(100); }
    assert.notEqual(await evaluate('document.querySelector("#status").textContent'), '读取连接状态…', 'connection UI must finish loading before input');
    assert.deepEqual(await backend.listTargets(), []);
    const connected = await evaluate(`chrome.runtime.sendMessage(${JSON.stringify({ type: 'connect', port: server.address().port, token, consent: true })})`);
    assert.equal(connected.ok, true, JSON.stringify(connected));
    for (let attempt = 0; attempt < 50; attempt++) { if (backend.getDiagnostics().connectedBrowsers) break; await pause(100); }
    assert.ok(backend.getDiagnostics().connectedBrowsers, await evaluate('JSON.stringify({status:document.querySelector("#status").textContent,ready:document.readyState,valid:document.querySelector("form").checkValidity(),scripts:[...document.scripts].map(s=>s.src)})'));
    const firstInventory = await backend.listTargets();
    const restricted = firstInventory.find(t => !t.supported);
    assert.ok(restricted, JSON.stringify(firstInventory));
    await assert.rejects(backend.select(restricted), { code: 'UNSUPPORTED_PAGE' });
    controller = await createController({ dataDir: join(root, 'controller'), browser: composite });
    const opened = await controller.openTarget({ browserId: restricted.browserId, url: fixtureURL + '/' });
    assert.equal(opened.ok, true, JSON.stringify(opened));
    const created = opened.target;
    assert.equal(created.browserId, restricted.browserId);
    let target = await backend.select(created);
    let observation = await backend.observe(target, { includeBase64: true, ax: 'native' });
    assert.equal(observation.screenshot.width, observation.screenshot.bounds.width * 2);
    const button = observation.ax.nodes.find(e => e.role === 'button'), input = observation.ax.nodes.find(e => e.name === 'Message');
    const { element: { rect } } = await backend.act(target, { action: 'getDOM', elementId: button.elementId });
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    await backend.act(target, { action: 'click', ...center, screenshotId: observation.screenshot.id,
      previewWidth: observation.screenshot.bounds.width, previewHeight: observation.screenshot.bounds.height });
    const pageRead = expression => evaluate(`chrome.scripting.executeScript({target:{tabId:${target.identity.tabId}},world:'MAIN',func:()=>(${expression})}).then(r=>r[0].result)`);
    assert.equal(await pageRead('document.querySelector("button").textContent'), 'Count 1');
    assert.equal((await pageRead('window.events[0]')).trusted, true);
    await backend.act(target, { action: 'type', elementId: input.elementId, text: '旧值' });
    await backend.act(target, { action: 'fill', elementId: input.elementId, text: '真实输入' });
    assert.equal(await pageRead('document.querySelector("input").value'), '真实输入');
    await backend.act(target, { action: 'press', key: 'Enter' });
    assert.equal((await pageRead('window.events.find(e=>e.key==="Enter")')).trusted, true);
    await backend.act(target, { type: 'set_value', elementId: input.elementId, value: 'synthetic value' });
    assert.equal(await pageRead('document.querySelector("input").value'), 'synthetic value');
    await backend.act(target, { action: 'drag', from: [100, 250], to: [200, 300], coordinateSpace: 'css' });
    await backend.act(target, { action: 'scroll', x: 700, y: 400, deltaY: 400, coordinateSpace: 'css' });
    await assert.rejects(backend.act(target, { action: 'click', x: 10, y: 10, screenshotId: observation.screenshot.id }), { code: 'STALE_SCREENSHOT' });
    observation = await backend.observe(target, { includeBase64: true }); assert.ok(observation.geometry.scrollY > 0);
    await backend.act(target, { action: 'scroll', x: 700, y: 200, deltaY: -400, coordinateSpace: 'css' });
    const downloadPage = await backend.observe(target, { format: 'ax' });
    await backend.act(target, { action: 'click', elementId: downloadPage.ax.nodes.find(node => node.role === 'link' && node.name === 'Download').elementId });
    let files;
    for (let attempt = 0; attempt < 50; attempt++) { files = await backend.listDownloads(); if (files.some(d => d.state === 'complete')) break; await pause(100); }
    const file = files.find(d => d.state === 'complete'); assert.ok(file); assert.ok(file.filename.startsWith(downloadDir));
    assert.equal(await readFile(file.filename, 'utf8'), 'OpenCU real download verified');
    const navigate = async action => {
      const result = await controller.act({ targetId: target.id, ...action });
      assert.equal(result.ok, true, JSON.stringify(result));
      target = result.result.target;
    };
    const oldTarget = target; await navigate({ action: 'navigate', url: fixtureURL + '/next' });
    assert.equal((await backend.verify(oldTarget)).valid, false);
    await navigate({ action: 'back' });
    await navigate({ action: 'forward' });
    await navigate({ action: 'reload' });
    await backend.act(target, { action: 'keyDown', key: 'Shift' });
    await backend.act(target, { action: 'mouseDown', x: 100, y: 250, coordinateSpace: 'css' });
    assert.equal((await backend.release({ targets: [target] })).released, true);
    const held = await evaluate('chrome.storage.session.get("heldInputs")'); assert.deepEqual(held.heldInputs, []);
    await backend.observe(target, { format: 'ax' });
    const closed = await controller.act({ targetId: target.id, action: 'closeTab' });
    assert.equal(closed.ok, true, JSON.stringify(closed));
    assert.ok((await backend.listTargets()).every(tab => !tab.supported));
    const reopened = await controller.openTarget({ browserId: restricted.browserId, url: fixtureURL + '/' });
    assert.equal(reopened.ok, true, JSON.stringify(reopened));
    const observed = await controller.observe({ targetId: reopened.target.id, format: 'ax' });
    assert.equal(observed.ok, true, JSON.stringify(observed));
    assert.ok(observed.observation.ax.nodes.some(node => node.name === 'Real extension proof'));
    assert.equal((await controller.act({ targetId: reopened.target.id, action: 'closeTab' })).ok, true);
    const invalid = await controller.openTarget({ browserId: 'extension:not-connected', url: fixtureURL });
    assert.equal(invalid.error.code, 'AMBIGUOUS_TARGET');
    assert.ok((await backend.listTargets()).every(tab => !tab.supported));
    await evaluate('document.querySelector("#disconnect").click()');
    for (let attempt = 0; attempt < 30; attempt++) { if (!backend.getDiagnostics().connectedBrowsers) break; await pause(100); }
    assert.equal(backend.getDiagnostics().connectedBrowsers, 0);
    console.log('Real MV3 journey: connect, input, geometry, navigation, download, release, close and reopen passed');
  } finally {
    try {
      if (controller) { const result = await controller.close(); assert.equal(result.ok, true, JSON.stringify(result)); }
      else await backend.close();
    } finally {
      socket?.close(); browser.kill('SIGTERM');
      await new Promise(r => {
        if (browser.exitCode !== null) return r();
        const timer = setTimeout(() => browser.kill('SIGKILL'), 3000);
        browser.once('exit', () => { clearTimeout(timer); r(); });
      });
      await new Promise(r => server.close(r)); await new Promise(r => fixture.close(r));
      await rm(root, { recursive: true, force: true });
    }
  }
});
