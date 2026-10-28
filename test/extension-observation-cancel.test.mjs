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
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExtensionBackend} from '../src/extension/backend.mjs';
import {targetId} from '../src/extension/protocol.mjs';

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
  const events = [], replies = new Map(), replyWaiters = new Map(), polls = [], commands = [], hooks = {}, sessionData = {}, localData = {};
  const event = () => {
    const listeners = new Set();
    return {addListener:listener=>listeners.add(listener),removeListener:listener=>listeners.delete(listener),
      emit:(...args)=>{for(const listener of listeners)listener(...args);}};
  };
  const storage = { get: async () => structuredClone(localData), set: async value => Object.assign(localData,structuredClone(value)),
    remove: async keys => {for(const key of Array.isArray(keys)?keys:[keys])delete localData[key];} };
  const identity = { tabId: 73, documentId: 'doc', epoch: 'epoch', instanceId: 'instance', browserInstanceId: 'browser' };
  const owner = { ...identity, endpoint: 'http://127.0.0.1:12345', token: 'synthetic-local-token', sessionId: 'session' };
  const geometry = { width: 100, height: 80, visual: { x: 0, y: 0, width: 100, height: 80, scale: 1 } };
  const bytes = Buffer.alloc(24); bytes.writeUInt32BE(0x89504e47, 0); bytes.writeUInt32BE(100, 16); bytes.writeUInt32BE(80, 20);
  const chrome = {
    storage: { local: storage, session: {
      get:async()=>structuredClone(sessionData),set:async value=>{await hooks.persist?.(value);Object.assign(sessionData,structuredClone(value));},
      remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete sessionData[key];},
    } },
    tabs: {
      get: async id => { await hooks.get?.(id); return { id, url: 'https://fixture.invalid/', status: 'complete', windowId: 1, active: false }; },
      query: async () => await hooks.query?.() ?? [{ id: 73, url: 'https://fixture.invalid/', status: 'complete' }],
      update: async (id, value) => { events.push(['tabs.update', value]); await hooks.update?.(); return { id, windowId: 1 }; },
      create: async value => { events.push(['tabs.create', value]); await hooks.create?.(); return { id: 74, windowId: 1 }; },
      onRemoved: event(),
    },
    windows: { get: async () => ({ focused: false }), update: async () => { events.push(['windows.update']); } },
    scripting: { executeScript: async request => {
      if (!request.args) return [{ frameId: 0, documentId: 'chrome-doc', result: true }];
      const [method,args] = request.args; events.push(['content',method,args,request.target.tabId]); await hooks.content?.(method,args,request.target.tabId);
      return [{ frameId: 0, documentId: 'chrome-doc', result: { ok: true, result: { documentId: (typeof hooks.documentId === 'function' ? hooks.documentId(request.target.tabId) : hooks.documentId) ?? 'doc', geometry } } }];
    } },
    debugger: {
      sendCommand: async (_, method, params) => {
        events.push([method, params]); await hooks.send?.(method, params);
        if (method === 'Accessibility.getFullAXTree') return { nodes: [{ nodeId: '1', backendDOMNodeId: 1, role: { value: 'button' }, name: { value: 'Fixture' } }] };
        if (method === 'Page.captureScreenshot') return { data: bytes.toString('base64') };
        return {};
      },
      attach: async () => { events.push(['attach']); await hooks.attach?.(); }, detach: async () => { events.push(['detach']); },
      getTargets: async () => await hooks.targets?.() ?? [], onEvent: event(), onDetach: event(),
    },
    downloads: { onCreated: event(), onChanged: event(), onErased: event() },
    webNavigation: { onCommitted: event(), onDOMContentLoaded: event() },
    alarms: { onAlarm: event() }, runtime: { onStartup: event(), onInstalled: event(), onMessage: event(), getURL: path => 'chrome-extension://fixture/' + path },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  };
  const fetch = async (url, request) => {
    if(hooks.fetch)return hooks.fetch(url,request);
    const input = JSON.parse(request.body);
    if (url.endsWith('/connect')) {events.push(['connect',input]);return {ok:true,json:async()=>({sessionId:'session-'+input.epoch,releaseTicket:'ticket-'+input.epoch,acknowledgedReleases:input.releaseReceipts.map(item=>JSON.stringify([item.instanceId,item.browserInstanceId,item.epoch]))})};}
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
    createPairingClient: () => ({ start: async () => {events.push(['pairing.start']);}, pause: async () => {} }) };
  const worker = new Function(...Object.keys(imports), 'chrome', 'navigator', 'fetch', 'setTimeout', `${source}\nreturn {
    ready: initialize(), restore, connect, watchPairing, attach, observe, act, releaseTab, releaseAll, controlToken, attached, observations, loop,
    getStatus() { return status; }, getRunning() { return running; },
    setConnection(value) { connection = value; }, getConnection() { return connection; },
  };`)(...Object.values(imports), chrome, { platform: 'MacIntel' }, fetch, (callback, ms) => setTimeout(callback, ms === 500 ? 0 : hooks.deadlineMs ? Math.min(ms,hooks.deadlineMs) : ms));
  await worker.ready; worker.setConnection(owner);
  const seed = (keys = ['Shift'], buttons = ['left']) => worker.attached.set(73, { keys: new Map(keys.map(key => [key, keySpec(key)])), buttons: new Set(buttons), x: 10, y: 20, identity:{...identity} });
  seed();
  const queue = (...items) => { if (polls.length) polls.shift()(items); else commands.push(items); };
  const message = (id, method, params = {}) => ({ id, method, epoch: owner.epoch, deadline: Date.now() + 10000,
    params: method === 'listTargets' ? params : { identity, ...params } });
  const result = id => { if (replies.has(id)) return Promise.resolve(replies.get(id)); const pending = deferred(); replyWaiters.set(id, pending); return pending.promise; };
  const loop = worker.loop(owner);
  const stop = async () => {worker.setConnection(null);queue();await loop;for(let n=0;worker.getRunning()&&n<200;n++){queue();await new Promise(resolve=>setTimeout(resolve,1));}assert.equal(worker.getRunning(),false);};
  t.after(async () => { for (const key of Object.keys(hooks)) delete hooks[key]; await stop(); invalidateElements(73); });
  return { worker, identity, hooks, events, seed, queue, message, result, chrome, owner, sessionData, localData, stop };
}

test('MV3 human debugger detach invalidates only that tab and preserves another in-flight observation',async t=>{
  const f=await fixture(t),other={...f.identity,tabId:74},entered=deferred(),gate=deferred();
  f.worker.attached.set(74,{keys:new Map(),buttons:new Set(),x:0,y:0});
  f.hooks.get=async id=>{if(id===74){entered.resolve();await gate.promise;}};
  const pending=f.worker.observe(other,{format:'ax',screenshot:false});await entered.promise;
  const old=f.worker.controlToken(73);
  f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');
  await tick();
  assert.equal(f.worker.getConnection(),f.owner,'a detached target must not disconnect the bridge');
  assert.equal(f.worker.attached.get(73).detached,true);assert.equal(f.worker.attached.has(74),true);
  assert.equal(f.events.some(([method])=>method.startsWith('Input.')),false,'human cancellation must not release another target');
  await assert.rejects(f.worker.act(f.identity,{type:'key_down',key:'a'},old),{code:'CONTROL_STOPPED'});
  gate.resolve();assert.equal((await pending).identity.tabId,74);
  delete f.hooks.get;
  await f.worker.act(other,{type:'key_down',key:'b'});
  assert.equal(f.events.filter(([method])=>method==='Input.dispatchKeyEvent').at(-1)[1].key,'b');
});

test('MV3 detached held input remains journalled until explicit same-document release',async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();
  assert.deepEqual(f.sessionData.heldInputs[0].keys.map(key=>key.key),['Shift']);
  assert.equal(f.sessionData.heldInputs[0].detached,true);
  await assert.rejects(f.worker.act(f.identity,{type:'key_down',key:'a'}),{code:'RELEASE_REQUIRED'});
  assert.equal(f.events.some(([name])=>name.startsWith('Input.')),false);
  assert.equal((await f.worker.releaseTab(73)).released,true);
  assert.deepEqual(f.events.filter(([name])=>name.startsWith('Input.')).map(([name,args])=>[name,args.type,args.key??args.button]),
    [['Input.dispatchMouseEvent','mouseReleased','left'],['Input.dispatchKeyEvent','keyUp','Shift']]);
  assert.equal(f.worker.attached.has(73),false);assert.deepEqual(f.sessionData.heldInputs,[]);
});

for(const boundary of ['changed document','another debugger'])test(`MV3 detached recovery refuses ${boundary} and retains original ownership`,async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();
  if(boundary==='changed document')f.hooks.documentId='replacement';else f.hooks.targets=async()=>[{tabId:73,attached:true}];
  await assert.rejects(f.worker.releaseTab(73),{code:'RELEASE_FAILED'});
  assert.equal(f.worker.attached.get(73).keys.has('Shift'),true);
  assert.equal(f.events.some(([name])=>name.startsWith('Input.')||name==='attach'),false);
  assert.equal(f.sessionData.heldInputs[0].detached,true);
  f.chrome.tabs.onRemoved.emit(73);await tick();
  assert.equal((await f.worker.releaseTab(73)).released,true,'actual tab removal can retire the original input destination');
});

test('MV3 cold restoration preserves and releases a detached journal without replaying key-down',async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();
  f.worker.attached.clear();f.worker.setConnection(null);await f.worker.restore();
  assert.deepEqual(f.sessionData.heldInputs,[]);
  assert.deepEqual(f.events.filter(([name])=>name.startsWith('Input.')).map(([,args])=>args.type),['mouseReleased','keyUp']);
});

for(const boundary of ['changed document','another debugger'])test(`MV3 cold ${boundary} isolates its journal while a fresh epoch controls healthy tabs`,async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();await f.stop();
  const original={...f.owner,releaseTicket:'original-ticket',receiptScope:'original-scope'};
  f.localData.releaseOwner=original;
  f.sessionData.authorization={port:12345,token:'synthetic-reconnect-token-12345',consent:true};
  if(boundary==='changed document')f.hooks.documentId=id=>id===73?'replacement':'doc';
  else f.hooks.targets=async()=>[{tabId:73,attached:true}];
  f.worker.attached.clear();await f.worker.restore();
  assert.equal(f.worker.getStatus().connected,true,'one unsafe release must not revoke authorization for every tab');
  assert.ok(f.sessionData.authorization);assert.equal(f.sessionData.heldInputs[0].keys[0].key,'Shift');
  assert.equal(f.localData.releaseReceipts?.some(item=>item.epoch===original.epoch)??false,false,'the old connection is still unreleased');
  assert.ok(f.localData.releaseOwners.some(item=>item.epoch===original.epoch),'fresh ownership must not overwrite the original ticket');
  const connection=f.worker.getConnection(),healthy={...f.identity,...connection,tabId:74};
  await f.worker.attach(healthy);f.worker.attached.get(74).frameRouter=undefined;
  await f.worker.act(healthy,{type:'key_down',key:'b'});
  await assert.rejects(f.worker.act({...healthy,tabId:73,documentId:boundary==='changed document'?'replacement':'doc'},{type:'key_down',key:'a'}),{code:'RELEASE_REQUIRED'});
  assert.deepEqual(f.events.filter(([name])=>name==='Input.dispatchKeyEvent').map(([,params])=>[params.type,params.key]),[['keyDown','b']]);
  await assert.rejects(f.worker.releaseAll(),{code:'RELEASE_FAILED'});
  assert.equal(f.localData.releaseReceipts?.some(item=>item.epoch===original.epoch)??false,false);
  f.chrome.tabs.onRemoved.emit(73);await tick();await f.stop();
  await f.worker.connect({port:12345,token:'synthetic-reconnect-token-12345',consent:true});
  assert.equal(f.localData.releaseReceipts.find(item=>item.epoch===original.epoch).scope,'original-scope','an old owner retains the original credential scope');
});

test('MV3 an expired inventory read abandons only its reply and frees the control lane',async t=>{
  const f=await fixture(t),entered=deferred(),gate=deferred();f.seed([],[]);
  f.hooks.query=async()=>{entered.resolve();return gate.promise;};
  f.queue({...f.message('expired-inventory','listTargets'),deadline:Date.now()+30});await entered.promise;
  const expired=await within(f.result('expired-inventory'));
  assert.equal(expired.error.code,'COMMAND_TIMEOUT');assert.equal(f.worker.getConnection(),f.owner);
  delete f.hooks.query;f.queue(f.message('healthy-after-inventory','act',{action:{type:'key_down',key:'b'}}));
  assert.equal((await within(f.result('healthy-after-inventory'))).ok,true);
  gate.resolve([{id:73,url:'https://fixture.invalid/',status:'complete'}]);await tick();
  assert.equal((await f.result('expired-inventory')).error.code,'COMMAND_TIMEOUT','a late reply cannot resume the abandoned read');
  assert.deepEqual(f.events.filter(([name])=>name==='Input.dispatchKeyEvent').map(([,params])=>[params.type,params.key]),[['keyDown','b']]);
});

test('MV3 multiple cold owners retain independent debt and original receipt scopes across reconnects',async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();await f.stop();
  const owners=[{...f.identity,releaseTicket:'ticket-first',receiptScope:'scope-first'},
    {...f.identity,epoch:'second-old-epoch',releaseTicket:'ticket-second',receiptScope:'scope-second'}];
  f.localData.instanceId=f.identity.instanceId;f.localData.releaseOwners=owners;
  f.sessionData.attachedTabs.push(74);f.sessionData.heldInputs.push({tabId:74,keys:[keySpec('Control')],buttons:[],x:0,y:0,identity:{...owners[1],tabId:74},detached:true});
  f.worker.attached.clear();f.hooks.documentId='replacement';await f.worker.restore();
  const starts=f.events.filter(([name])=>name==='pairing.start').length;await f.worker.watchPairing();
  assert.equal(f.events.filter(([name])=>name==='pairing.start').length,starts+1);
  const input={port:12345,token:'synthetic-reconnect-token-12345',consent:true};
  await f.worker.connect(input);await f.stop();f.worker.attached.clear();await f.worker.restore();
  assert.deepEqual(f.localData.releaseOwners.filter(owner=>owners.some(original=>original.epoch===owner.epoch)).map(owner=>owner.epoch).sort(),['epoch','second-old-epoch']);
  assert.equal(f.localData.releaseReceipts.length,0,'neither unresolved owner may be acknowledged or discarded');
  f.chrome.tabs.onRemoved.emit(73);await tick();await f.stop();await f.worker.connect(input);
  assert.equal(f.localData.releaseReceipts.find(receipt=>receipt.epoch===owners[0].epoch).scope,'scope-first');
  assert.ok(f.localData.releaseOwners.some(owner=>owner.epoch===owners[1].epoch));
  assert.equal(f.localData.releaseReceipts.some(receipt=>receipt.epoch===owners[1].epoch),false);
  assert.equal(f.localData.releaseOwners.some(owner=>'token' in owner||'endpoint' in owner),false);
  assert.equal(f.events.some(([name])=>name.startsWith('Input.')),false,'no unknown input is replayed or lifted');
});

test('MV3 recovery cannot bypass an unpersisted quarantine journal',async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();await f.stop();
  f.hooks.documentId='replacement';f.hooks.persist=()=>{throw Error('journal storage unavailable');};
  await assert.rejects(f.worker.connect({port:12345,token:'synthetic-reconnect-token-12345',consent:true}),/journal storage unavailable/);
  assert.equal(f.worker.getConnection(),null);assert.equal(f.events.some(([name])=>name==='connect'),false);
  assert.equal(f.sessionData.heldInputs[0].keys[0].key,'Shift');
});

test('MV3 persisted recovery attachment never proves ownership of a replacement debugger',async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();await f.stop();
  f.sessionData.heldInputs[0].recoveryAttached=true;f.worker.attached.clear();
  f.hooks.targets=async()=>[{tabId:73,attached:true}];
  f.hooks.send=(method,params)=>{if(method==='Runtime.evaluate'&&params.expression==='void 0')throw Error('Debugger is not attached to the tab');};
  await f.worker.restore();await f.worker.connect({port:12345,token:'synthetic-reconnect-token-12345',consent:true});
  assert.equal(f.worker.getStatus().connected,true);assert.equal(f.worker.attached.get(73).quarantined,true);
  assert.equal(f.events.some(([name])=>name.startsWith('Input.')||name==='attach'||name==='detach'),false);
});

test('MV3 a stalled cold identity read quarantines only its original tab and still reconnects',async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();await f.stop();
  f.sessionData.authorization={port:12345,token:'synthetic-reconnect-token-12345',consent:true};f.worker.attached.clear();
  f.hooks.deadlineMs=20;f.hooks.content=async(method,_args,id)=>{if(id===73&&method==='identity')await new Promise(()=>{});};
  await within(f.worker.restore());
  assert.equal(f.worker.getStatus().connected,true);assert.equal(f.worker.attached.get(73).quarantined,true);
  assert.equal(f.sessionData.heldInputs[0].keys[0].key,'Shift');
  assert.equal(f.events.some(([name])=>name.startsWith('Input.')),false);
});

test('MV3 journal serialization retains original debt when an older detach write fails behind a new input',async t=>{
  const f=await fixture(t),entered=deferred(),gate=deferred();let first=true;
  f.hooks.persist=async()=>{if(first){first=false;entered.resolve();await gate.promise;throw Error('older detach journal failed');}};
  f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await entered.promise;
  const healthy={...f.identity,tabId:74};f.worker.attached.set(74,{keys:new Map(),buttons:new Set(),x:0,y:0,identity:healthy});
  let complete=false;const write=f.worker.act(healthy,{type:'key_down',key:'b'}).then(()=>{complete=true;});await tick();
  assert.equal(complete,false,'the new input must await its ordered journal acknowledgement');
  gate.resolve();await write;
  assert.deepEqual(f.sessionData.heldInputs.map(state=>[state.tabId,state.keys.map(key=>key.key)]),[[73,['Shift']],[74,['b']]]);
});

test('production MV3 recovery and authenticated backend preserve old debt until the original ticket is receipted',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'opencu-mv3-wire-')),server=createServer(),token='synthetic-mv3-http-connection-token';
  const backend=createExtensionBackend({server,token,dataDir:dir,requestTimeoutMs:250});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const f=await fixture(t),wire=[];let failure;
  try {
    await f.stop();f.worker.attached.clear();
    f.hooks.fetch=async(url,request)=>{wire.push([url.split('/').at(-1),JSON.parse(request.body)]);return fetch(url,{...request,headers:{...request.headers,Origin:'chrome-extension://'+'a'.repeat(32)}});};
    const input={port:server.address().port,token,consent:true};await f.worker.connect(input);
    const original=f.worker.getConnection(),oldIdentity={instanceId:original.instanceId,browserInstanceId:original.browserInstanceId,epoch:original.epoch,tabId:73,documentId:'doc'};
    const old={id:targetId(oldIdentity),identity:oldIdentity};
    f.worker.attached.set(73,{keys:new Map(),buttons:new Set(),x:0,y:0,identity:oldIdentity});
    await backend.act(old,{action:'keyDown',key:'Shift'});
    f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();await f.stop();
    f.hooks.documentId=id=>id===73?'replacement':'doc';f.worker.attached.clear();await f.worker.restore();
    assert.equal(f.worker.getStatus().connected,true);
    const fresh=f.worker.getConnection(),identity={...oldIdentity,epoch:fresh.epoch,tabId:74},healthy={id:targetId(identity),identity};
    await f.worker.attach(identity);f.worker.attached.get(74).frameRouter=undefined;
    await backend.act(healthy,{action:'keyDown',key:'b'});
    await assert.rejects(backend.release(old),{code:'STALE_TARGET'});
    assert.equal(wire.filter(([path])=>path==='connect')[1][1].releaseReceipts.some(receipt=>receipt.epoch===original.epoch),false);
    await backend.release(healthy);f.chrome.tabs.onRemoved.emit(73);await tick();await f.stop();await f.worker.connect(input);
    const receipts=wire.filter(([path])=>path==='connect').at(-1)[1].releaseReceipts;
    assert.equal(receipts.find(receipt=>receipt.epoch===original.epoch).ticket,original.releaseTicket);
    assert.equal((await backend.release(old)).retired,true,'only the authenticated original ticket can clear the old controller reference');
    assert.deepEqual(f.events.filter(([name])=>name==='Input.dispatchKeyEvent').map(([,params])=>[params.type,params.key]),[['rawKeyDown','Shift'],['keyDown','b'],['keyUp','b']]);
  } catch(error) {failure=error;} finally {
    f.chrome.tabs.onRemoved.emit(73);f.chrome.tabs.onRemoved.emit(74);await tick();
    try {await backend.close();}catch(error){failure??=error;}
    const stopping=f.stop();server.closeAllConnections();
    try {await stopping;}catch(error){failure??=error;}
    await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});
  }
  if(failure)throw failure;
});

test('MV3 detached release journal retry does not reopen an already released debugger',async t=>{
  const f=await fixture(t);f.chrome.debugger.onDetach.emit({tabId:73},'canceled_by_user');await tick();
  f.hooks.persist=value=>{if(value.heldInputs?.length===0){delete f.hooks.persist;throw Error('synthetic journal commit failed');}};
  await assert.rejects(f.worker.releaseTab(73),/journal commit failed/);
  assert.equal((await f.worker.releaseTab(73)).released,true);
  assert.equal(f.events.filter(([name])=>name==='attach').length,1);
  assert.equal(f.events.filter(([name])=>name==='detach').length,1);
  assert.deepEqual(f.sessionData.heldInputs,[]);
});

test('MV3 unmatched releases never lift human input and aliases clear the original automation key',async t=>{
  const f=await fixture(t);f.seed([],[]);
  await f.worker.act(f.identity,{type:'key_up',key:'a'});
  await f.worker.act(f.identity,{type:'mouse_up',button:'left'});
  assert.equal(f.events.some(([method])=>method.startsWith('Input.')),false);
  await f.worker.act(f.identity,{type:'key_down',key:'a'});
  await f.worker.act(f.identity,{type:'key_up',key:'A'});
  await f.worker.act(f.identity,{type:'key_up',key:'a'});
  assert.deepEqual(f.events.filter(([method])=>method==='Input.dispatchKeyEvent').map(([,params])=>[params.type,params.key]),[['keyDown','a'],['keyUp','a']]);
  assert.equal(f.worker.attached.get(73).keys.size,0);
});

for(const [type,args] of [['key_down',{key:'a'}],['mouse_down',{button:'left',x:20,y:20,coordinateSpace:'css'}]]) {
  test(`MV3 ${type} pre-dispatch failure rolls back only its new ownership before cleanup`,async t=>{
    const f=await fixture(t);f.seed(['Shift'],['right']);
    f.hooks.content=method=>{if(method==='expectInput')throw Object.assign(Error('marker unavailable before dispatch'),{code:'FRAME_DETACHED'});};
    await assert.rejects(f.worker.act(f.identity,{type,...args}),error=>error.code==='FRAME_DETACHED'&&error.details.inputDispatched===false);
    assert.deepEqual([...f.worker.attached.get(73).keys.keys()],['Shift']);
    assert.deepEqual([...f.worker.attached.get(73).buttons],['right']);
    delete f.hooks.content;await f.worker.releaseTab(73);
    assert.deepEqual(f.events.filter(([method])=>method.startsWith('Input.')).map(([method,params])=>[method,params.key??params.button]),
      [['Input.dispatchMouseEvent','right'],['Input.dispatchKeyEvent','Shift']]);
  });
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
