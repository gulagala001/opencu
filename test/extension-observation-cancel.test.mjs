import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { observeAccessibility, elementOperation, locatorOperation, invalidateElements } from '../extension/accessibility.js';
import { createCDPFrameRouter } from '../extension/frame-router.js';
import { extensionKeySpec as keySpec, keyEventParameters } from '../extension/keyboard.js';
import { clickParameters, checkClickHeld, holdClick } from '../extension/click-options.js';
import { pressParameters, checkPressHeld } from '../extension/key-options.js';

// Execute the production MV3 worker and its real AX/input helpers. Only Chrome
// APIs and local bridge transport are simulated; no browser is started.
const source = (await readFile(new URL('../extension/background.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function within(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('release waited for the stalled read')), 200); })]); }
  finally { clearTimeout(timer); }
}
async function fixture(t) {
  const events = [], replies = new Map(), replyWaiters = new Map(), polls = [], commands = [], hooks = {};
  const event = () => ({ addListener() {}, removeListener() {} });
  const storage = { get: async () => ({}), set: async () => {}, remove: async () => {} };
  const identity = { tabId: 73, documentId: 'doc', epoch: 'epoch', instanceId: 'instance', browserInstanceId: 'browser' };
  const owner = { ...identity, endpoint: 'http://127.0.0.1:12345', token: 'synthetic-local-token', sessionId: 'session' };
  const geometry = { width: 100, height: 80, visual: { x: 0, y: 0, width: 100, height: 80, scale: 1 } };
  const bytes = Buffer.alloc(24); bytes.writeUInt32BE(0x89504e47, 0); bytes.writeUInt32BE(100, 16); bytes.writeUInt32BE(80, 20);
  const chrome = {
    storage: { local: storage, session: storage },
    tabs: { get: async () => ({ id: 73, url: 'https://fixture.invalid/', status: 'complete', windowId: 1, active: false }), onRemoved: event() },
    windows: { get: async () => ({ focused: false }) },
    scripting: { executeScript: async request => {
      if (!request.args) return [{ frameId: 0, documentId: 'chrome-doc', result: true }];
      const [method] = request.args; events.push(['content', method]); await hooks.content?.(method);
      return [{ frameId: 0, documentId: 'chrome-doc', result: { ok: true, result: { documentId: 'doc', geometry } } }];
    } },
    debugger: {
      sendCommand: async (_, method, params) => {
        events.push([method, params]); await hooks.send?.(method, params);
        if (method === 'Accessibility.getFullAXTree') return { nodes: [{ nodeId: '1', backendDOMNodeId: 1, role: { value: 'button' }, name: { value: 'Fixture' } }] };
        if (method === 'Page.captureScreenshot') return { data: bytes.toString('base64') };
        return {};
      },
      attach: async () => { events.push(['attach']); }, detach: async () => { events.push(['detach']); },
      getTargets: async () => [], onEvent: event(), onDetach: event(),
    },
    downloads: { onCreated: event(), onChanged: event(), onErased: event() },
    webNavigation: { onCommitted: event(), onDOMContentLoaded: event() },
    alarms: { onAlarm: event() }, runtime: { onStartup: event(), onInstalled: event(), onMessage: event() },
    action: { setBadgeText: async () => {} },
  };
  const fetch = async (url, request) => {
    const input = JSON.parse(request.body);
    if (url.endsWith('/result')) {
      replies.set(input.id, input); replyWaiters.get(input.id)?.resolve(input);
      return { ok: true, json: async () => ({}) };
    }
    assert.ok(url.endsWith('/poll'));
    const next = commands.length ? commands.shift() : await new Promise(resolve => polls.push(resolve));
    return { ok: true, json: async () => ({ commands: next }) };
  };
  const imports = { observeAccessibility, elementOperation, locatorOperation, invalidateElements, createCDPFrameRouter, keySpec, keyEventParameters,
    clickParameters, checkClickHeld, holdClick, pressParameters, checkPressHeld,
    createPairingClient: () => ({ start: async () => {}, pause: async () => {} }) };
  const worker = new Function(...Object.keys(imports), 'chrome', 'navigator', 'fetch', 'setTimeout', `${source}\nreturn {
    ready: initialize(), observe, act, releaseTab, controlToken, attached, observations, loop,
    setConnection(value) { connection = value; },
  };`)(...Object.values(imports), chrome, { platform: 'MacIntel' }, fetch, (callback, ms) => setTimeout(callback, ms === 500 ? 0 : ms));
  await worker.ready; worker.setConnection(owner);
  const seed = (keys = ['Shift'], buttons = ['left']) => worker.attached.set(73, { keys: new Map(keys.map(key => [key, keySpec(key)])), buttons: new Set(buttons), x: 10, y: 20 });
  seed();
  const queue = (...items) => { if (polls.length) polls.shift()(items); else commands.push(items); };
  const message = (id, method, params = {}) => ({ id, method, epoch: owner.epoch, deadline: Date.now() + 10000, params: { identity, ...params } });
  const result = id => { if (replies.has(id)) return Promise.resolve(replies.get(id)); const pending = deferred(); replyWaiters.set(id, pending); return pending.promise; };
  const loop = worker.loop(owner);
  t.after(async () => { hooks.send = undefined; hooks.content = undefined; worker.setConnection(null); queue(); await loop; invalidateElements(73); });
  return { worker, identity, hooks, events, seed, queue, message, result };
}

test('MV3 screenshot format captures pixels without reading AX and keeps fresh observation identity', async t => {
  const f = await fixture(t);
  const ax = await f.worker.observe(f.identity, {format: 'ax', screenshot: false});
  f.events.length = 0;
  const shot = await f.worker.observe(f.identity, {format: 'screenshot'});
  assert.notEqual(shot.observationId, ax.observationId);
  assert.equal(shot.ax, undefined);
  assert.equal(shot.screenshot.width, 100);
  assert.equal(f.events.some(([method]) => method === 'Accessibility.getFullAXTree'), false);
  assert.equal(f.events.filter(([method]) => method === 'Page.captureScreenshot').length, 1);
});

for (const stage of ['verify', 'identity', 'ax', 'screenshot']) {
  test(`MV3 releases held key and mouse while ${stage} read is pending`, async t => {
    const f = await fixture(t), entered = deferred(), gate = deferred(), cursorGate = deferred(); let stalled = false, cursorStalled = false;
    const stall = async () => { if (!stalled) { stalled = true; entered.resolve(); await gate.promise; } };
    if (stage === 'verify' || stage === 'identity') f.hooks.content = method => method === 'identity' ? stall() : undefined;
    else f.hooks.send = method => method === (stage === 'ax' ? 'Accessibility.getFullAXTree' : 'Page.captureScreenshot') ? stall() : undefined;
    if (stage === 'ax') f.hooks.content = async method => {
      if (method === 'release' && !cursorStalled) { cursorStalled = true; await cursorGate.promise; }
    };
    f.queue(f.message('read', stage === 'verify' ? 'verify' : 'observe'), f.message('queued', 'observe'));
    await entered.promise;
    f.queue(f.message('release', 'release'));
    try {
      assert.equal((await within(f.result('release'))).ok, true);
      assert.equal((await f.result('read')).error.code, 'CONTROL_STOPPED');
      assert.equal((await f.result('queued')).error.code, 'CONTROL_STOPPED');
      assert.deepEqual(f.events.filter(([method]) => method.startsWith('Input.')).map(([method, params]) => [method, params.type]),
        [['Input.dispatchMouseEvent', 'mouseReleased'], ['Input.dispatchKeyEvent', 'keyUp']]);
      assert.equal(f.worker.attached.size, 0); assert.equal(f.worker.observations.size, 0);
      // Resume before the old RPC replies. Its late AX/screenshot/identity result
      // must neither replace fresh references nor reattach the released debugger.
      f.seed([], []); const fresh = await f.worker.observe(f.identity);
      gate.resolve(); await tick();
      assert.equal(f.worker.observations.get(73).id, fresh.screenshot.id);
      await elementOperation(73, () => { throw Error('verifyElement must not dispatch'); }, 'verifyElement', { elementId: fresh.ax.nodes[0].elementId, observationId: fresh.observationId });
      assert.equal(f.events.filter(([method]) => method === 'attach').length, 0);
      await f.worker.releaseTab(73);
    } finally { gate.resolve(); cursorGate.resolve(); await tick(); }
  });
}

test('MV3 keeps failed input release retryable and waits for unknown input acknowledgement', async t => {
  const f = await fixture(t), entered = deferred(), gate = deferred(); let first = true;
  f.hooks.send = async (method, params) => {
    if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased' && first) { first = false; throw Error('synthetic unacknowledged mouse-up'); }
  };
  await assert.rejects(f.worker.releaseTab(73), error => error.code === 'RELEASE_FAILED');
  assert.equal(f.worker.attached.get(73).buttons.has('left'), true);
  assert.equal(f.worker.attached.get(73).keys.has('Shift'), true);
  f.hooks.send = undefined; await f.worker.releaseTab(73);
  assert.equal(f.worker.attached.size, 0);
  f.seed([], []);
  f.hooks.send = async (method, params) => { if (method === 'Input.dispatchKeyEvent' && params.type === 'rawKeyDown') { entered.resolve(); await gate.promise; } };
  f.queue(f.message('input', 'act', { action: { type: 'key_down', key: 'Shift' } })); await entered.promise;
  const before = f.worker.controlToken(73), detached = f.events.filter(([method]) => method === 'detach').length;
  f.queue(f.message('release', 'release'));
  await within((async () => { while (f.worker.controlToken(73).tabEpoch === before.tabEpoch) await tick(); })());
  assert.equal(f.events.filter(([method]) => method === 'detach').length, detached);
  assert.equal(f.events.filter(([method]) => method === 'Input.dispatchKeyEvent').filter(([, p]) => p.type === 'keyUp').length, 1);
  try {
    gate.resolve(); assert.equal((await within(f.result('release'))).ok, true);
    assert.equal((await f.result('input')).error.details.inputDispatched, true);
    assert.equal(f.events.filter(([method]) => method === 'Input.dispatchKeyEvent').filter(([, p]) => p.type === 'rawKeyDown').length, 1);
    assert.equal(f.events.filter(([method]) => method === 'Input.dispatchKeyEvent').filter(([, p]) => p.type === 'keyUp').length, 2);
  } finally { gate.resolve(); }
});
