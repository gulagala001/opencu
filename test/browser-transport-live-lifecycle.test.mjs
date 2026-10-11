import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

async function until(check, message) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (await check()) return; await delay(10); }
  assert.fail(message);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'opencu-live-transport-'));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><title>Transport lifecycle</title><style>button{position:absolute;left:100px;top:80px;width:160px;height:60px}</style>'
      + '<button>Live button</button><output>untouched</output><script>window.pointerEvents=[];'
      + 'for(const type of ["pointerdown","pointerup","pointermove"])addEventListener(type,e=>pointerEvents.push({type,x:e.clientX,y:e.clientY}));'
      + 'document.querySelector("button").onclick=()=>document.querySelector("output").textContent="clicked";</script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const host = new BrowserHost(join(root, 'profile'), { executablePath: await testBrowserExecutable(root) });
  let browser, transport, browserPid, guardianPid;
  t.after(async () => {
    try {
      transport?.close();
      await browser?.close();
      await host.close();
      for (const pid of [browserPid, guardianPid].filter(Boolean)) {
        await until(() => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }, `Isolated process ${pid} survived cleanup`);
      }
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    }
    t.diagnostic('Isolated browser, guardian, HTTP server and disposable profile cleaned');
  });
  const run = await host.start(); browserPid = host.browserPid; guardianPid = host.child.pid;
  const pointers = [];
  transport = new BrowserTransport(run.endpoint, event => { if (!event.hidden) pointers.push(event); });
  browser = await chromium.connectOverCDP(transport, { isLocal: true });
  t.diagnostic(`Node ${process.version}; ${process.platform}/${process.arch}; Chromium ${browser.version()}`);
  const page = await browser.contexts()[0].newPage();
  await page.goto(url + '/first');
  return { browser, transport, page, pointers, url };
}

// Hold Chromium's actual reply, rather than inventing a protocol result. All
// other traffic, including real navigation and detach, reaches the transport.
function holdNextMetrics(transport) {
  const socket = transport.socket, listeners = socket.listeners('message');
  let held, requestId;
  socket.removeAllListeners('message');
  const receive = data => {
    const message = JSON.parse(data.toString());
    if (!held && transport.observations.has(message.id) && message.result?.cssVisualViewport) {
      held = data; requestId = message.id; return;
    }
    for (const listener of listeners) listener.call(socket, data);
  };
  socket.on('message', receive);
  let restored = false;
  const restore = () => { if (restored) return; restored = true; socket.off('message', receive); for (const listener of listeners) socket.on('message', listener); };
  return {
    ready: () => !!held,
    id: () => requestId,
    release: () => { assert.ok(held, 'a real metrics reply must have arrived'); restore(); for (const listener of listeners) listener.call(socket, held); },
    restore,
  };
}

test('real detach and navigation reject old pointer replies while live locator feedback survives', { timeout: 20000 }, async t => {
  const { transport, page, pointers } = await fixture(t);
  const cdp = await page.context().newCDPSession(page);
  const sibling = await page.context().newCDPSession(page);
  await cdp.send('Page.getFrameTree');
  await sibling.send('Page.getFrameTree');
  const detachedReply = holdNextMetrics(transport);
  t.after(detachedReply.restore);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 30 });
  await until(detachedReply.ready, 'Chromium did not return held detach metrics');
  const detachedId = detachedReply.id();
  const sessionId = transport.observations.get(detachedId).sessionId;
  await cdp.detach();
  await until(() => !transport.sessions.has(sessionId), 'Real CDP detach was not observed');
  assert.equal(transport.observations.has(detachedId), false);
  const beforeDetachReply = pointers.length;
  detachedReply.release();
  await sibling.send('Runtime.evaluate', { expression: '21 * 2', returnByValue: true });
  await delay(20);
  assert.equal(pointers.length, beforeDetachReply, 'a retired session cannot publish pointer feedback');
  assert.equal((await sibling.send('Runtime.evaluate', { expression: '6 * 7', returnByValue: true })).result.value, 42, 'the active same-target sibling CDP session survives');

  const navigationReply = holdNextMetrics(transport);
  t.after(navigationReply.restore);
  await page.mouse.move(35, 45);
  await until(navigationReply.ready, 'Chromium did not return held navigation metrics');
  const navigationId = navigationReply.id(), old = transport.observations.get(navigationId);
  await page.goto(page.url().replace('/first', '/second'));
  assert.notEqual(transport.sessions.get(old.sessionId).loaderId, old.loaderId, 'the document really navigated');
  const beforeNavigationReply = pointers.length;
  navigationReply.release();
  await sibling.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
  await delay(20);
  assert.equal(pointers.length, beforeNavigationReply, 'old-document geometry cannot publish pointer feedback');
  assert.equal(transport.observations.has(navigationId), false);

  await page.getByRole('button', { name: 'Live button' }).click();
  await until(() => pointers.some(event => event.type === 'mouseReleased'), 'normal locator click lost its current pointer feedback');
  const feedback = pointers.findLast(event => event.type === 'mouseReleased');
  const truth = await page.evaluate(() => pointerEvents.findLast(event => event.type === 'pointerup'));
  assert.deepEqual({ x: feedback.x, y: feedback.y }, { x: truth.x, y: truth.y });
  assert.equal(feedback.loaderId, transport.sessions.get(old.sessionId).loaderId);
  assert.equal(await page.locator('output').textContent(), 'clicked');
  await sibling.detach();
});

test('real OOPIF detach preserves the active sibling iframe and its locator input', { timeout: 20000 }, async t => {
  const { browser, transport, page, pointers, url } = await fixture(t);
  const childUrl = url.replace('127.0.0.1', 'localhost');
  await page.evaluate(childUrl => {
    for (const side of [1, 2]) { const iframe = document.createElement('iframe'); iframe.id = 'child' + side; iframe.src = childUrl + '/child?side=' + side; document.body.append(iframe); }
  }, childUrl);
  const first = page.frameLocator('#child1'), second = page.frameLocator('#child2');
  await first.getByRole('button', { name: 'Live button' }).waitFor();
  await second.getByRole('button', { name: 'Live button' }).waitFor();
  const cdp = await browser.newBrowserCDPSession();
  const { targetInfos } = await cdp.send('Target.getTargets');
  const frameId = side => targetInfos.find(info => info.type === 'iframe' && info.url === childUrl + '/child?side=' + side)?.targetId;
  assert.ok(frameId(1)); assert.ok(frameId(2));
  const sessions = side => [...transport.sessions].filter(([, info]) => info.type === 'iframe' && info.targetId === frameId(side)).map(([id]) => id);
  await until(() => sessions(1).length && sessions(2).length, 'both real cross-origin iframe CDP sessions must exist');
  const detached = sessions(1), surviving = sessions(2);
  await page.locator('#child1').evaluate(frame => frame.remove());
  await until(() => detached.every(id => !transport.sessions.has(id)), 'removed real OOPIF was not detached');
  for (const id of surviving) assert.ok(transport.sessions.has(id), 'detach cannot retire an active sibling iframe');
  await second.getByRole('button', { name: 'Live button' }).click();
  assert.equal(await second.locator('output').textContent(), 'clicked');
  await until(() => pointers.some(event => event.type === 'mouseReleased'), 'surviving sibling click lost its pointer feedback');
  assert.equal(page.frames().filter(frame => frame.url().includes('/child?side=')).length, 1);
  await cdp.detach();
});
