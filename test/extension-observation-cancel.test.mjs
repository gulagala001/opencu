import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { observeAccessibility, elementOperation, locatorOperation, invalidateElements } from '../extension/accessibility.js';
import { createCDPFrameRouter } from '../extension/frame-router.js';
import { extensionKeySpec as keySpec, keyEventParameters, sequentialTextKey, checkSequentialDeadline, keyboardInputTypes } from '../extension/keyboard.js';
import { clickParameters, locatorClickParameters, checkClickHeld, holdClick } from '../extension/click-options.js';
import { pressParameters, checkPressHeld } from '../extension/key-options.js';
import {scrollDeltas,checkScrollGeometry} from '../extension/scroll.js';
import {installDocumentRuntime} from '../extension/content.js';
import {locatorInputFixture} from './fixtures/locator-input.mjs';
import {dragPath} from '../extension/pointer-path.js';

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
    tabs: {
      get: async id => { await hooks.get?.(id); return { id, url: 'https://fixture.invalid/', status: 'complete', windowId: 1, active: false }; },
      query: async () => { await hooks.query?.(); return [{ id: 73, url: 'https://fixture.invalid/', status: 'complete' }]; },
      update: async (id, value) => { events.push(['tabs.update', value]); await hooks.update?.(); return { id, windowId: 1 }; },
      create: async value => { events.push(['tabs.create', value]); await hooks.create?.(); return { id: 74, windowId: 1 }; },
      onRemoved: event(),
    },
    windows: { get: async () => ({ focused: false }), update: async () => { events.push(['windows.update']); } },
    scripting: { executeScript: async request => {
      if (!request.args) return [{ frameId: 0, documentId: 'chrome-doc', result: true }];
      const [method,args] = request.args; events.push(['content',method,args]); await hooks.content?.(method,args);
      return [{ frameId: 0, documentId: 'chrome-doc', result: { ok: true, result: { documentId: 'doc', geometry } } }];
    } },
    debugger: {
      sendCommand: async (_, method, params) => {
        events.push([method, params]); await hooks.send?.(method, params);
        if (method === 'Accessibility.getFullAXTree') return { nodes: [{ nodeId: '1', backendDOMNodeId: 1, role: { value: 'button' }, name: { value: 'Fixture' } }] };
        if (method === 'Page.captureScreenshot') return { data: bytes.toString('base64') };
        return {};
      },
      attach: async () => { events.push(['attach']); await hooks.attach?.(); }, detach: async () => { events.push(['detach']); },
      getTargets: async () => { await hooks.targets?.(); return []; }, onEvent: event(), onDetach: event(),
    },
    downloads: { onCreated: event(), onChanged: event(), onErased: event() },
    webNavigation: { onCommitted: event(), onDOMContentLoaded: event() },
    alarms: { onAlarm: event() }, runtime: { onStartup: event(), onInstalled: event(), onMessage: event(), getURL: path => 'chrome-extension://fixture/' + path },
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
  const imports = { observeAccessibility, elementOperation, locatorOperation, invalidateElements, createCDPFrameRouter, installDocumentRuntime, dragPath, keySpec, keyEventParameters,
    clickParameters, locatorClickParameters, checkClickHeld, holdClick, pressParameters, checkPressHeld, sequentialTextKey, checkSequentialDeadline, keyboardInputTypes, scrollDeltas, checkScrollGeometry,
    createPairingClient: () => ({ start: async () => {}, pause: async () => {} }) };
  const worker = new Function(...Object.keys(imports), 'chrome', 'navigator', 'fetch', 'setTimeout', `${source}\nreturn {
    ready: initialize(), observe, act, releaseTab, controlToken, attached, observations, loop,
    setConnection(value) { connection = value; },
  };`)(...Object.values(imports), chrome, { platform: 'MacIntel' }, fetch, (callback, ms) => setTimeout(callback, ms === 500 ? 0 : ms));
  await worker.ready; worker.setConnection(owner);
  const seed = (keys = ['Shift'], buttons = ['left']) => worker.attached.set(73, { keys: new Map(keys.map(key => [key, keySpec(key)])), buttons: new Set(buttons), x: 10, y: 20 });
  seed();
  const queue = (...items) => { if (polls.length) polls.shift()(items); else commands.push(items); };
  const message = (id, method, params = {}) => ({ id, method, epoch: owner.epoch, deadline: Date.now() + 10000,
    params: method === 'listTargets' ? params : { identity, ...params } });
  const result = id => { if (replies.has(id)) return Promise.resolve(replies.get(id)); const pending = deferred(); replyWaiters.set(id, pending); return pending.promise; };
  const loop = worker.loop(owner);
  t.after(async () => { for (const key of Object.keys(hooks)) delete hooks[key]; worker.setConnection(null); queue(); await loop; invalidateElements(73); });
  return { worker, identity, hooks, events, seed, queue, message, result };
}

test('MV3 locator modifiers reach actual CDP mouse events and release once across double-click',async t => {
  for (const [method,count] of [['click',1],['dblclick',2]]) {
    const f = await fixture(t), dom = locatorInputFixture();f.seed([],[]);
    f.worker.attached.get(73).frameRouter = dom.router;
    await f.worker.act(f.identity,{type:'locator',locator:[{kind:'css',value:'#target'}],method,args:{modifiers:['Shift','Option']}});
    const mouse = f.events.filter(([name,params]) => name === 'Input.dispatchMouseEvent' && ['mousePressed','mouseReleased'].includes(params.type));
    assert.equal(mouse.length,count*2);
    assert(mouse.every(([,params]) => params.modifiers === 9));
    assert.deepEqual(mouse.filter(([,params]) => params.type === 'mousePressed').map(([,params]) => params.clickCount),Array.from({length:count},(_,index) => index+1));
    assert.deepEqual(f.events.filter(([name]) => name === 'Input.dispatchKeyEvent').map(([,params]) => [params.type,params.key]),
      [['rawKeyDown','Shift'],['rawKeyDown','Alt'],['keyUp','Alt'],['keyUp','Shift']]);
    assert.equal(f.worker.attached.get(73).keys.size,0);assert.equal(f.worker.attached.get(73).buttons.size,0);
  }
});

test('MV3 locator modifiers reject held inputs before DOM resolution or mouse dispatch',async t => {
  const f = await fixture(t), dom = locatorInputFixture();f.seed(['Alt'],[]);
  f.worker.attached.get(73).frameRouter = dom.router;
  for (const modifiers of [[],['Shift']]) await assert.rejects(f.worker.act(f.identity,
    {type:'locator',locator:[{kind:'css',value:'#target'}],method:'click',args:{modifiers}}),error => error.code === 'INPUT_ALREADY_HELD' && error.details.inputDispatched === false);
  assert.deepEqual(dom.calls,[]);assert.equal(f.events.some(([name]) => name.startsWith('Input.')),false);
  assert.deepEqual([...f.worker.attached.get(73).keys.keys()],['Alt']);
});

test('MV3 sequential text dispatches real printable keys and inserts Unicode by code point',async t=>{
  const f=await fixture(t);f.seed([],[]);
  await f.worker.act(f.identity,{type:'type_text',text:'aB!🙂é',sequential:true});
  assert.deepEqual(f.events.filter(([method,params])=>method==='Input.dispatchKeyEvent'&&params.type==='keyDown').map(([,params])=>params.key),['a','B','!']);
  assert.deepEqual(f.events.filter(([method])=>method==='Input.insertText').map(([,params])=>params.text),['🙂','é']);
  assert.equal(f.worker.attached.get(73).keys.size,0);
});

test('MV3 sequential deadline stops trailing characters and preserves dispatched receipt',async t=>{
  t.mock.timers.enable({apis:['Date'],now:1000});
  const f=await fixture(t);f.seed([],[]);
  f.hooks.send=(method,params)=>{if(method==='Input.dispatchKeyEvent'&&params.type==='keyDown')t.mock.timers.tick(2);};
  await assert.rejects(f.worker.act(f.identity,{type:'type_text',text:'ab',sequential:true,deadline:1001}),{code:'LOCATOR_TIMEOUT',details:{inputDispatched:true}});
  assert.deepEqual(f.events.filter(([method,params])=>method==='Input.dispatchKeyEvent'&&params.type==='keyDown').map(([,params])=>params.key),['a']);
  assert.equal(f.worker.attached.get(73).keys.size,0);
});

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

test('MV3 element pages use live geometry without a screenshot and fence resize before wheel',async t=>{
  const f=await fixture(t);f.seed([],[]);const geometry={width:434,height:114};
  const send=async(method,args={})=>{
    if(method==='Runtime.evaluate')return {result:{objectId:'document'}};
    if(method==='DOM.describeNode')return {node:{nodeType:9,children:[]}};
    if(method==='Accessibility.getFullAXTree')return {nodes:[{nodeId:'0',role:{value:'RootWebArea'},frameId:'top',childIds:['1']},{nodeId:'1',backendDOMNodeId:13,role:{value:'region'}}]};
    if(method==='DOM.resolveNode')return {object:{objectId:'scroll'}};
    if(method==='Runtime.callFunctionOn')return {result:{value:{...geometry}}};
    return {};
  };
  const route={frameId:'top',contextId:7,send,owners:[]};
  const router={main:async()=>route,validate:async()=>{},point:async()=>({x:50,y:40}),checkPoint:async()=>{},atPoint:async()=>undefined,focused:async()=>undefined};
  f.worker.attached.get(73).frameRouter=router;
  const observed=await observeAccessibility(73,send,'doc',()=>{},{},router);
  const action={type:'scroll',elementId:observed.ax.nodes.find(node=>node.role==='region').elementId,observationId:observed.observationId,scrollDirection:'down',scrollPages:.25};
  await f.worker.act(f.identity,action);
  const wheel=()=>f.events.filter(([method,args])=>method==='Input.dispatchMouseEvent'&&args.type==='mouseWheel');
  assert.equal(wheel().length,1);assert.equal(wheel()[0][1].deltaY,28.5);
  f.hooks.content=method=>{if(method==='expectInput')geometry.height=214;};
  await assert.rejects(f.worker.act(f.identity,action),{code:'LOCATOR_NOT_STABLE'});
  assert.equal(wheel().length,1);
});

async function routedFixture(t) {
  const f=await fixture(t),events=[],hooks={};
  const send=async(method,params={})=>{
    events.push([method,params]);await hooks.send?.(method,params);
    if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'top'}}};
    if(method==='Page.createIsolatedWorld')return {executionContextId:7};
    if(method==='Runtime.evaluate')return {result:params.expression==='document'?{objectId:'document'}:{value:'document-token'}};
    if(method==='DOM.describeNode')return {node:{nodeType:9,children:[]}};
    if(method==='Accessibility.getFullAXTree')return {nodes:[{nodeId:'1',frameId:'top',backendDOMNodeId:1,role:{value:'RootWebArea'}},{nodeId:'2',backendDOMNodeId:42,role:{value:'textbox'}}]};
    if(method==='DOM.resolveNode')return {object:{objectId:'input'}};
    if(method==='Runtime.callFunctionOn')return {result:{value:{changed:true}}};
    return {};
  };
  const router=createCDPFrameRouter(send,()=>()=>{});f.worker.attached.get(73).frameRouter=router;
  const observation=await observeAccessibility(73,send,'doc',()=>{},{},router);
  const elementId=observation.ax.nodes.find(node=>node.role==='textbox').elementId;
  return {...f,routeEvents:events,routeHooks:hooks,elementId,observationId:observation.observationId};
}

for(const type of ['set_value','type_text','click'])test(`MV3 routed ${type} never writes after cancellation during document validation`,async t=>{
  const f=await routedFixture(t),entered=deferred(),gate=deferred();let blocked=false;
  if(type==='click'){f.worker.attached.get(73).keys.clear();f.worker.attached.get(73).buttons.clear();}
  f.routeHooks.send=async(method,params)=>{if(!blocked&&method==='Runtime.evaluate'&&params.expression==='globalThis.__opencuFrameDocument'){blocked=true;entered.resolve();await gate.promise;}};
  f.queue(f.message('routed','act',{action:{type,elementId:f.elementId,observationId:f.observationId,value:'must not change',text:'must not type'}}));
  await within(entered.promise);const before=f.worker.controlToken(73);f.queue(f.message('release','release'));
  try{
    await within((async()=>{while(f.worker.controlToken(73).tabEpoch===before.tabEpoch)await tick();})());
    gate.resolve();const result=await f.result('routed');
    assert.equal(result.error.code,'CONTROL_STOPPED');assert.equal(result.error.details.inputDispatched,false);
    assert.equal((await within(f.result('release'))).ok,true);
    assert.equal(f.routeEvents.filter(([method])=>['DOM.focus','DOM.scrollIntoViewIfNeeded','Runtime.callFunctionOn'].includes(method)).length,0);
  }finally{gate.resolve();}
});

for(const [type,dispatch] of [['set_value','Runtime.callFunctionOn'],['type_text','DOM.focus'],['click','DOM.scrollIntoViewIfNeeded']])test(`MV3 routed ${type} retains a true dispatch receipt when cancelled after ${dispatch}`,async t=>{
  const f=await routedFixture(t),entered=deferred(),gate=deferred();let blocked=false;
  if(type==='click'){f.worker.attached.get(73).keys.clear();f.worker.attached.get(73).buttons.clear();}
  f.routeHooks.send=async method=>{if(!blocked&&method===dispatch){blocked=true;entered.resolve();await gate.promise;}};
  f.queue(f.message('routed','act',{action:{type,elementId:f.elementId,observationId:f.observationId,value:'changed',text:'typed'}}));
  await within(entered.promise);const before=f.worker.controlToken(73);f.queue(f.message('release','release'));
  try{
    await within((async()=>{while(f.worker.controlToken(73).tabEpoch===before.tabEpoch)await tick();})());
    gate.resolve();const result=await f.result('routed');
    assert.equal(result.error.code,'CONTROL_STOPPED');assert.equal(result.error.details.inputDispatched,true);
    assert.equal((await within(f.result('release'))).ok,true);
    assert.equal(f.routeEvents.filter(([method])=>method===dispatch).length,1);
    if(type==='set_value')assert(f.routeEvents.some(([method,params])=>method==='Runtime.releaseObject'&&params.objectId==='input'),'cancelled DOM calls still release their remote object');
  }finally{gate.resolve();}
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

for (const stage of ['inventory-query', 'inventory-identity', 'selection', 'selection-targets', 'focus', 'focus-after-activation', 'action-attach', 'action-verify', 'action-focus-verify', 'new-tab-wait', 'new-tab-identity']) {
  test(`MV3 cancellation releases input during ${stage} and rejects queued inventory`, async t => {
    const f = await fixture(t), entered = deferred(), gate = deferred(); let calls = 0;
    const stall = async () => { entered.resolve(); await gate.promise; };
    let method, params = {};
    if (stage.startsWith('inventory')) {
      method = 'listTargets';
      if (stage === 'inventory-query') f.hooks.query = stall;
      else f.hooks.content = name => name === 'identity' && ++calls === 1 ? stall() : undefined;
    } else if (stage === 'selection-targets') {
      method = 'select'; params = { identity: { ...f.identity, tabId: 74 } }; f.hooks.targets = stall;
    } else if (stage === 'focus-after-activation') {
      method = 'focus'; f.hooks.get = () => ++calls === 3 ? stall() : undefined;
    } else if (stage === 'new-tab-wait') {
      method = 'newTab'; f.hooks.get = id => id === 74 && ++calls === 1 ? stall() : undefined;
    } else {
      method = stage === 'selection' ? 'select' : stage === 'focus' ? 'focus' : stage === 'new-tab-identity' ? 'newTab' : 'act';
      params = method === 'act' ? { action: { type: 'key_down', key: 'Control' } } : {};
      const at = stage === 'action-verify' ? 2 : stage === 'action-focus-verify' ? 3 : 1;
      f.hooks.content = name => name === 'identity' && ++calls === at ? stall() : undefined;
    }
    f.queue(f.message('blocked', method, params), f.message('queued-inventory', 'listTargets'));
    await entered.promise;
    // A target-scoped release must also cancel an inventory of all tabs. It
    // must invalidate inventory already queued before this cancellation.
    f.queue(f.message('release', 'release'));
    try {
      assert.equal((await within(f.result('release'))).ok, true);
      const blocked = await f.result('blocked');
      assert.equal(blocked.error.code, 'CONTROL_STOPPED');
      if (method === 'newTab') assert.equal(blocked.error.details.created, true);
      assert.equal((await f.result('queued-inventory')).error.code, 'CONTROL_STOPPED');
      assert.deepEqual(f.events.filter(([name]) => name.startsWith('Input.')).map(([name, value]) => [name, value.type]),
        [['Input.dispatchMouseEvent', 'mouseReleased'], ['Input.dispatchKeyEvent', 'keyUp']]);
      assert.equal(f.worker.attached.size, 0);
      assert.equal(f.events.filter(([name]) => name === 'tabs.update' || name === 'windows.update' || name === 'attach').length,
        stage === 'focus-after-activation' ? 1 : 0);
      if (method === 'newTab') assert.equal(f.events.filter(([name]) => name === 'tabs.create').length, 1);
      // A late read cannot enter the next preflight or publish a fresh binding.
      const count = f.events.length; gate.resolve(); await tick();
      assert.equal(f.events.length, count);
      f.queue(f.message('fresh-inventory', 'listTargets'));
      assert.equal((await within(f.result('fresh-inventory'))).ok, true);
    } finally { gate.resolve(); await tick(); }
  });
}

test('MV3 cancellation waits for debugger attachment acknowledgement before releasing', async t => {
  const f = await fixture(t), entered = deferred(), gate = deferred();
  // An existing held tab remains owned while attaching another tab.
  f.hooks.attach = async () => { entered.resolve(); await gate.promise; };
  f.queue(f.message('select', 'select', { identity: { ...f.identity, tabId: 74 } }));
  await entered.promise; const before = f.worker.controlToken(74);
  f.queue(f.message('release', 'release', { identity: undefined }));
  try {
    await within((async () => { while (f.worker.controlToken(74).epoch === before.epoch) await tick(); })());
    assert.equal(f.events.filter(([name]) => name === 'detach').length, 0);
    gate.resolve();
    assert.equal((await within(f.result('release'))).ok, true);
    assert.equal((await f.result('select')).error.code, 'CONTROL_STOPPED');
    assert.equal(f.events.filter(([name]) => name === 'attach').length, 1);
    assert.equal(f.worker.attached.size, 0);
  } finally { gate.resolve(); await tick(); }
});

test('MV3 target cancellation preserves a different tab monitoring read', async t => {
  const f = await fixture(t), entered = deferred(), gate = deferred(); let first = true;
  f.worker.attached.set(74, { keys: new Map(), buttons: new Set(), x: 0, y: 0 });
  f.hooks.send = async name => { if (name === 'Page.captureScreenshot' && first) { first = false; entered.resolve(); await gate.promise; } };
  f.queue({ ...f.message('preview', 'preview', { identity: { ...f.identity, tabId: 74 } }), monitoring: true });
  await entered.promise; f.queue(f.message('release', 'release'));
  try {
    assert.equal((await within(f.result('release'))).ok, true);
    assert.equal(f.worker.attached.has(74), true);
    gate.resolve(); assert.equal((await within(f.result('preview'))).ok, true);
    await f.worker.releaseTab(74);
  } finally { gate.resolve(); await tick(); }
});

test('MV3 settings cancellation awaits tab creation and does not continue focusing', async t => {
  const f = await fixture(t), entered = deferred(), gate = deferred();
  f.hooks.create = async () => { entered.resolve(); await gate.promise; };
  f.queue(f.message('settings', 'openSettings', { identity: undefined, section: 'extensions' }));
  await entered.promise; const before = f.worker.controlToken(73);
  f.queue(f.message('release', 'release'));
  try {
    await within((async () => { while (f.worker.controlToken(73).tabEpoch === before.tabEpoch) await tick(); })());
    assert.equal(f.events.filter(([name]) => name === 'detach').length, 0);
    gate.resolve(); assert.equal((await within(f.result('release'))).ok, true);
    assert.equal((await f.result('settings')).error.code, 'CONTROL_STOPPED');
    assert.equal(f.events.filter(([name]) => name === 'tabs.create').length, 1);
    assert.equal(f.events.filter(([name]) => name === 'windows.update').length, 0);
  } finally { gate.resolve(); await tick(); }
});


test('MV3 keyboard edit markers are narrow and finished after success or refused dispatch',async t=>{
  const f=await fixture(t);f.seed([],[]);
  await f.worker.act(f.identity,{type:'press_key',key:'Meta+v'});
  const expected=f.events.filter(([name,method])=>name==='content'&&method==='expectInput').map(([, ,args])=>args.events);
  assert.equal(expected.length,2);assert(expected.every(events=>events.length===1&&events[0].type==='keydown'));
  assert.deepEqual(expected[1][0].inputTypes,['insertFromPaste','insertFromPasteAsQuotation']);
  assert.equal(f.events.filter(([name,method])=>name==='content'&&method==='finishInput').length,2);
  f.events.length=0;f.hooks.send=(method,params)=>{if(method==='Input.dispatchKeyEvent'&&params.type==='keyDown')throw Object.assign(Error('refused keyboard'),{details:{inputDispatched:false}});};
  await assert.rejects(f.worker.act(f.identity,{type:'press_key',key:'v'}),/refused keyboard/);
  assert.equal(f.events.filter(([name,method])=>name==='content'&&method==='finishInput').length,1);
});

test('MV3 drag preflights whole paths, keeps turns and preserves unrelated held input',async t=>{
  const f=await fixture(t);f.seed(['Shift'],['right']);
  await f.worker.act(f.identity,{type:'drag',coordinateSpace:'css',path:[{x:10,y:10},{x:60,y:10},{x:60,y:60}],durationMs:0});
  const input=f.events.filter(([method])=>method==='Input.dispatchMouseEvent').map(([,params])=>params);
  const moves=input.filter(row=>row.type==='mouseMoved');assert(moves.length>3);assert(moves.some(row=>row.x===60&&row.y===10));assert.deepEqual([moves.at(-1).x,moves.at(-1).y],[60,60]);
  assert.deepEqual([...f.worker.attached.get(73).buttons],['right']);assert.deepEqual([...f.worker.attached.get(73).keys.keys()],['Shift']);
  f.events.length=0;await assert.rejects(f.worker.act(f.identity,{type:'drag',coordinateSpace:'css',path:[{x:10,y:10},{x:100,y:10}]}),{code:'INVALID_COORDINATES'});assert(!f.events.some(([method])=>method.startsWith('Input.')));
  await assert.rejects(f.worker.act(f.identity,{type:'drag',coordinateSpace:'css',button:'right',path:[{x:10,y:10},{x:20,y:20}]}),{code:'INPUT_ALREADY_HELD'});
});

test('MV3 drag checks screenshot geometry between samples and journals the interrupted button',async t=>{
  const f=await fixture(t);f.seed([],[]);const shot=await f.worker.observe(f.identity,{format:'screenshot'});let moved=false;
  f.hooks.send=(method,params)=>{if(method==='Input.dispatchMouseEvent'&&params.type==='mousePressed')moved=true;};
  f.hooks.content=(method,args)=>{if(method==='identity'&&moved)throw Object.assign(Error('document changed'),{code:'STALE_DOCUMENT'});};
  await assert.rejects(f.worker.act(f.identity,{type:'drag',screenshotId:shot.screenshot.id,path:[{x:10,y:10},{x:60,y:60}],durationMs:0}),{code:'STALE_DOCUMENT'});
  assert.equal(f.worker.attached.get(73).buttons.has('left'),true);delete f.hooks.content;await f.worker.releaseTab(73);
  assert(f.events.some(([method,params])=>method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'));
});
