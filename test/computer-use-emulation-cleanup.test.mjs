import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserActions } from '../src/computer-use/browser-actions.mjs';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { ExtensionBrowser } from '../src/computer-use/extension-browser.mjs';
import { extensionFixture } from './fixtures/computer-use/extension.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function controlledRecord(onSend) {
  const calls = [], native = { userAgent: '' };
  const viewport = { clientWidth: 800, clientHeight: 600, pageX: 0, pageY: 0, offsetX: 0, offsetY: 0, zoom: 1, scale: 1 };
  const record = { id: randomUUID(), coordinateId: 'fixture', generation: 0, page: { isClosed: () => false, frames: () => [] }, cdp: {
    async send(method, params) {
      calls.push({ method, params });
      if (method === 'Page.getLayoutMetrics') return { cssVisualViewport: viewport, cssLayoutViewport: viewport, visualViewport: viewport };
      if (method === 'Runtime.evaluate') return { result: { value: 1 } };
      if (method === 'Emulation.setUserAgentOverride') {
        await onSend?.(params, native);
        native.userAgent = params.userAgent;
      }
      return {};
    },
  } };
  return { record, calls, native };
}

test('failed browser-wide simulation restores prior tabs and does not install a future-tab preset', async () => {
  const host = new BrowserActions(), first = controlledRecord();
  const second = controlledRecord(params => { if (params.userAgent === 'Rejected preset') throw new Error('second tab rejected settings'); });
  const records = new Map([first, second].map(fixture => [fixture.record.id, fixture.record]));
  for (const id of records.keys()) host.owners.set(id, { sessionId: 'test' });
  host.target = async (_sessionId, id) => records.get(id);
  await host.browserEmulation('test', { userAgent: 'Prior preset' });
  const prior = host.emulationPresets.get('test');
  await assert.rejects(host.browserEmulation('test', { userAgent: 'Rejected preset' }), /second tab rejected settings/);
  assert.equal(host.emulationPresets.get('test'), prior);
  assert.equal(first.native.userAgent, 'Prior preset');
  assert.equal(second.native.userAgent, 'Prior preset');
  assert.equal(host.emulationSettings(first.record.id).userAgent, 'Prior preset');
  assert.equal(first.record.emulationPreset, prior.id);
});

test('aborted pending emulation waits for rollback and an owned reset cannot overtake it', { timeout: 5000 }, async t => {
  const write = deferred(), entered = deferred(), host = new BrowserActions();
  const fixture = controlledRecord(async params => {
    if (params.userAgent) { entered.resolve(); await write.promise; }
  });
  t.after(() => write.resolve());
  const controller = new AbortController();
  let setSettled = false, resetSettled = false;
  const changing = host.setEmulation(fixture.record, { userAgent: 'Pending fixture UA' }, controller.signal)
    .then(() => ({ error: null }), error => ({ error })).finally(() => { setSettled = true; });
  await entered.promise;
  controller.abort(new Error('cancel pending UA'));
  const reset = host.resetEmulation(fixture.record, { ownedOnly: true }).finally(() => { resetSettled = true; });
  await delay(30);
  assert.equal(setSettled, false, 'the abort acknowledgement must wait for the in-flight write and rollback');
  assert.equal(resetSettled, false, 'owned-only cleanup must queue behind a pending set');
  write.resolve();
  assert.match((await changing).error.message, /cancel pending UA/);
  await reset;
  assert.equal(fixture.native.userAgent, '');
  assert.equal(host.emulations.size, 0);
  assert.equal(fixture.record.pendingEmulationSets, 0);
  assert.deepEqual(fixture.calls.filter(call => call.method === 'Emulation.setUserAgentOverride').map(call => call.params.userAgent), ['Pending fixture UA', '']);
});

test('a failed rollback keeps modified fields reachable for a later cleanup retry', { timeout: 5000 }, async t => {
  const write = deferred(), entered = deferred(), host = new BrowserActions();
  let failClear = true;
  const fixture = controlledRecord(async params => {
    if (params.userAgent) { entered.resolve(); await write.promise; }
    else if (failClear) { failClear = false; throw new Error('injected UA restoration failure'); }
  });
  t.after(() => write.resolve());
  const controller = new AbortController();
  const changing = host.setEmulation(fixture.record, { userAgent: 'Rollback fixture UA' }, controller.signal).catch(error => error);
  await entered.promise;
  controller.abort(new Error('cancel rollback fixture'));
  write.resolve();
  const error = await changing;
  assert.ok(error instanceof AggregateError);
  assert.match(error.message, /restoration failed/);
  assert.equal(fixture.native.userAgent, 'Rollback fixture UA');
  assert.equal(host.emulations.get(fixture.record.id)?.record, fixture.record);
  await host.restoreOverrides(fixture.record);
  assert.equal(fixture.native.userAgent, '');
  assert.equal(host.emulations.size, 0);
});

async function externalManager(t) {
  const root = await mkdtemp(join(tmpdir(), 'opencu-emulation-cleanup-')), cleanups = [], beforeClose = [];
  let manager;
  t.after(async () => {
    for (const cleanup of beforeClose) cleanup();
    try { await manager?.close(); }
    finally { for (const cleanup of cleanups) await cleanup(); await rm(root, { recursive: true, force: true }); }
  });
  const external = await extensionFixture({ after: cleanup => cleanups.push(cleanup) }, { viewport: null });
  manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'absent') }, extensionHub: external.hub });
  const browserId = external.browser.id;
  const run = async (code, options) => {
    const result = await manager.execute('model', code, options);
    assert.equal(result.error, undefined, JSON.stringify(result.error));
    return result;
  };
  await run(`var tab = await cua.createBrowserTab(${JSON.stringify(browserId)}, ${JSON.stringify(external.fixture.url)}); await tab.markDeliverable();`);
  const browser = manager.browserFor(browserId), id = manager.status('model').target.id;
  const model = await browser.target('model', id), observer = await browser.target('observer', id, { claim: false });
  const inspect = () => observer.page.evaluate(() => ({ userAgent: navigator.userAgent, deviceScaleFactor: devicePixelRatio, hasTouch: navigator.maxTouchPoints }));
  return { manager, browser, id, model, observer, inspect, run, beforeClose };
}

test('real extension stop waits for a pending UA write and restores native state before returning', { timeout: 60000 }, async t => {
  const s = await externalManager(t), original = await s.inspect(), entered = deferred(), write = deferred();
  const send = s.model.cdp.send.bind(s.model.cdp);
  s.model.cdp.send = async (method, params) => {
    const result = await send(method, params);
    if (method === 'Emulation.setUserAgentOverride' && params.userAgent === 'Pending real extension UA') { entered.resolve(); await write.promise; }
    return result;
  };
  s.beforeClose.push(() => { write.resolve(); s.model.cdp.send = send; });
  const execution = s.manager.execute('model', "await tab.emulation.set({userAgent:'Pending real extension UA'});", { timeoutMs: 10000 });
  await entered.promise;
  assert.equal((await s.inspect()).userAgent, 'Pending real extension UA', 'the native browser really changed before cancellation');
  let stopped = false, settled = false;
  const stopping = s.manager.stop('model').finally(() => { stopped = true; });
  const result = execution.finally(() => { settled = true; });
  await delay(30);
  assert.equal(stopped, false);
  assert.equal(settled, false);
  write.resolve();
  await stopping;
  assert.match((await result).error.message, /Stopped by user/);
  assert.deepEqual(await s.inspect(), original);
  assert.equal(s.browser.emulations.size, 0);
  await assert.rejects(s.manager.execute('model', 'await cua.getState();'), /stopped by the user/);
});

test('real extension stop reports a failed UA clear and retry restores the retained connection', { timeout: 60000 }, async t => {
  const s = await externalManager(t), original = await s.inspect();
  await s.run("await tab.emulation.set({userAgent:'Retry real extension UA'});");
  const send = s.model.cdp.send.bind(s.model.cdp);
  let fail = true;
  s.model.cdp.send = async (method, params) => {
    if (fail && method === 'Emulation.setUserAgentOverride' && params.userAgent === '') { fail = false; throw new Error('injected one-time UA clear failure'); }
    return send(method, params);
  };
  s.beforeClose.push(() => { s.model.cdp.send = send; });
  await assert.rejects(s.manager.stop('model'), /cleanup failed/i);
  assert.equal((await s.inspect()).userAgent, 'Retry real extension UA');
  assert.ok(s.browser.connections.has('model'), 'failed cleanup must retain the actor for retry');
  assert.ok(s.browser.emulations.has(s.id));
  assert.equal(s.manager.status('model').status, 'error');
  await assert.rejects(s.manager.resume('model'), /Stopping has not been confirmed/);
  await assert.rejects(s.manager.execute('model', 'await cua.getState();'), /stopped by the user/);
  await s.manager.stop('model');
  assert.deepEqual(await s.inspect(), original);
  assert.equal(s.browser.connections.has('model'), false);
  assert.equal(s.browser.emulations.size, 0);
  assert.equal(s.manager.status('model').status, 'stopped');
});

test('stopping one real extension record preserves emulation owned by another record', { timeout: 60000 }, async t => {
  const s = await externalManager(t), original = await s.inspect();
  assert.notEqual(s.model, s.observer);
  await s.run("await tab.emulation.set({userAgent:'Model-owned UA',deviceScaleFactor:2});");
  await s.browser.setEmulation(s.observer, { userAgent: 'Observer-owned UA', deviceScaleFactor: 3, hasTouch: true });
  const observerState = await s.inspect();
  assert.deepEqual(observerState, { userAgent: 'Observer-owned UA', deviceScaleFactor: 3, hasTouch: 1 });
  assert.equal(s.browser.emulations.get(s.id)?.record, s.observer);
  await s.manager.stop('model');
  assert.deepEqual(await s.inspect(), observerState, 'cleanup must not clear a different record’s current override');
  assert.equal(s.browser.emulations.get(s.id)?.record, s.observer);
  await s.browser.resetEmulation(s.observer, { ownedOnly: true });
  assert.deepEqual(await s.inspect(), original);
  assert.equal(s.browser.emulations.size, 0);
});

test('real extension timeout restores emulation and disabling continues to fence later executions', { timeout: 60000 }, async t => {
  const s = await externalManager(t), original = await s.inspect();
  await s.run("await tab.emulation.set({userAgent:'Timeout real extension UA',deviceScaleFactor:2,hasTouch:true});");
  const result = await s.manager.execute('model', "nodeRepl.write('before timeout'); await new Promise(() => {});", { timeoutMs: 100 });
  assert.match(result.error.message, /^Computer Use exceeded 100 ms/);
  assert.equal(result.blocks[0].text, 'before timeout');
  assert.deepEqual(await s.inspect(), original);
  assert.equal(s.browser.emulations.size, 0);
  assert.equal(s.browser.connections.has('model'), false);
  await s.manager.setEnabled(false);
  await assert.rejects(s.manager.execute('model', 'await cua.getState();'), /disabled in settings/);
  assert.equal(s.browser.connections.has('model'), false, 'a disabled execution must not reacquire browser control');
});

test('native extension actor loss restores device overrides and cancels held touch without host restoration', { timeout: 60000 }, async t => {
  const cleanups = [];
  let browser;
  t.after(async () => {
    try { await browser?.close(); }
    finally { for (const cleanup of cleanups) await cleanup(); }
  });
  const external = await extensionFixture({ after: cleanup => cleanups.push(cleanup) }, { viewport: null });
  browser = new ExtensionBrowser(external.hub, external.browser);
  const info = await browser.create('model', external.fixture.url);
  const model = await browser.target('model', info.id), observer = await browser.target('observer', info.id, { claim: false });
  const inspect = () => observer.page.evaluate(() => ({ userAgent: navigator.userAgent, deviceScaleFactor: devicePixelRatio, hasTouch: navigator.maxTouchPoints }));
  const original = await inspect();
  await browser.setEmulation(model, { userAgent: 'Abrupt actor fixture UA', deviceScaleFactor: 2, hasTouch: true });
  assert.deepEqual(await inspect(), { userAgent: 'Abrupt actor fixture UA', deviceScaleFactor: 2, hasTouch: 1 });
  await observer.page.evaluate(() => {
    window.actorCleanupTouch = [];
    for (const type of ['touchstart', 'touchend', 'touchcancel']) window.addEventListener(type, event => {
      actorCleanupTouch.push({ type, touches: event.touches.length });
    }, { passive: false });
  });
  // Send directly through the native actor, with no host held-input state that
  // could release it later and make extension cleanup appear to have worked.
  await model.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 60, y: 60 }] });
  await observer.page.waitForFunction(() => actorCleanupTouch.some(event => event.type === 'touchstart'));
  let hostRestorations = 0;
  const restore = browser.restoreOverrides.bind(browser);
  browser.restoreOverrides = async (...args) => { hostRestorations++; return restore(...args); };
  const connection = await browser.connections.get('model'), link = connection.links.get(info.id);
  await link.entry.gateway.closeClientById(link.clientId);
  assert.equal(hostRestorations, 0, 'the gateway must clean the actor independently of host restoration');
  assert.deepEqual(await inspect(), original);
  assert.equal(observer.page.isClosed(), false);
  await observer.page.waitForFunction(() => actorCleanupTouch.some(event => event.type === 'touchcancel'));
  assert.deepEqual(await observer.page.evaluate(() => actorCleanupTouch), [
    { type: 'touchstart', touches: 1 }, { type: 'touchcancel', touches: 0 },
  ]);
  await observer.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await observer.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, x: 60, y: 60 }] });
  await observer.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await observer.page.waitForFunction(() => actorCleanupTouch.some(event => event.type === 'touchend'));
  assert.deepEqual(await observer.page.evaluate(() => actorCleanupTouch.slice(2)), [
    { type: 'touchstart', touches: 1 }, { type: 'touchend', touches: 0 },
  ], 'a new actor gesture starts with one fresh touch, with no held contact left over');
});
