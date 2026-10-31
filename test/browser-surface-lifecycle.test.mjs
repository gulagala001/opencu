import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createBrowserTransport} from '../src/client/browser-transport.mjs';
import {createBrowserHost} from '../src/dsh/browser-host.mjs';
import {inputReleased} from '../src/protocol.mjs';

async function fixture({ connected = false } = {}) {
  const broker = connected ? createBrowserHost() : null;
  const calls = [], notices = [], tabs = [], lifetimes = new Map();
  let listener, sequence = 0, failCreate, failClose = false, readyGate, disposeGate, createGate, replyGate, dropCompletion = false, mounted = 's', focusGate, frameGate;
  const live = new Set();
  const context = vm.createContext({console, AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask,
    requestAnimationFrame: callback => { if (frameGate) { frameGate.push(callback); return callback; } queueMicrotask(callback); return callback; },
    cancelAnimationFrame: frame => { if (frameGate) { const index = frameGate.indexOf(frame); if (index >= 0) frameGate.splice(index, 1); } },
    document: {documentElement: {}}, getComputedStyle: () => ({colorScheme:'light'})});
  const stubs = {
    './rea/app-shared-2f2228189a8d.js': {Ff: {dispatchHostMessage: value => notices.push(value)}},
    './rea/app-initial-c468e3fd7f91.js': {AW: {removeTab() {}, setBrowserUseActive() {}}},
    './rea-locale.mjs': {reaIntl: () => ({locale:'en'})},
    './rea-services.mjs': {services: {}},
    '../protocol.mjs': {inputReleased},
  };
  const source = new vm.SourceTextModule(await readFile(new URL('../src/client/browser-surfaces.mjs', import.meta.url), 'utf8'), {context});
  await source.link(name => {
    const values = stubs[name]; assert(values, name);
    return new vm.SyntheticModule(Object.keys(values), function() {for(const [key,value] of Object.entries(values))this.setExport(key,value);}, {context});
  });
  await source.evaluate();
  const client = {request: async (method,args,signal) => {
    calls.push({method,args});
    if (replyGate && method === 'browser/result' && (args.error || args.result?.target && !args.result.released)) await replyGate.promise;
    const result = broker ? await broker.handle(method,args,signal) : {ok:true};
    if (dropCompletion && method === 'browser/poll') result.commands = result.commands.filter(command => command.method !== 'completeCreation');
    return result;
  }, subscribe: () => () => {}};
  const transport = createBrowserTransport(client);
  transport.setSessionOwner(() => ['s']);
  const desktop = {
    onSurfaceEvent: callback => {listener = callback; return () => {};},
    async surface(operation, args) {
      calls.push({operation,method:args.method,tabId:args.tabId,args:args.args});
      if(operation === 'create') {if(failCreate)throw failCreate;live.add(args.tabId);if(createGate)await createGate.promise;return true;}
      if(operation === 'close') {if(failClose)throw Error('native close failed');live.delete(args.tabId);return true;}
      if(operation !== 'requestPage') return true;
      if(!live.has(args.tabId))throw Error('request sent to destroyed page');
      if(args.method === 'ready') {if(readyGate)await readyGate.promise;return {url:'about:blank',title:'test'};}
      if(args.method === 'dispose' && disposeGate)await disposeGate.promise;
      if(args.method === 'release'||args.method==='dispose')return {released:true};
      return true;
    },
  };
  const sidebar = {
    mounted:{getSnapshot:()=> mounted}, isExpanded:()=>false, toggleExpanded:()=>calls.push({ui:'expand'}), focus:()=>calls.push({ui:'focus'}), active:()=>tabs[0], tabsIn:()=>tabs,
    openTabIn(){const tab={id:`t${++sequence}`,kind:'browser'};tabs.push(tab);lifetimes.set(tab.id,new AbortController());},
    closeIn(_session,id){const index=tabs.findIndex(tab=>tab.id===id);if(index>=0)tabs.splice(index,1);lifetimes.get(id)?.abort();},
    tabDomain:{occurrence:(_session,tab)=>({signal:lifetimes.get(tab.id).signal})},
  };
  const surfaces=source.namespace.createBrowserSurfaces({desktop,transport,client,sidebar,openSession:async()=>{calls.push({ui:'openSession'});await focusGate?.promise;}});
  return {surfaces,transport,broker,calls,notices,tabs,live,
    set mounted(value){mounted=value;},set focusGate(value){focusGate=value;},set frameGate(value){frameGate=value;},
    set failCreate(value){failCreate=value;},set failClose(value){failClose=value;},
    set dropCompletion(value){dropCompletion=value;},set replyGate(value){replyGate=value;},set readyGate(value){readyGate=value;},set disposeGate(value){disposeGate=value;},set createGate(value){createGate=value;},
    event: value => listener(value),
  };
}

test('closing a created surface retires its remote target without releasing a destroyed page', async () => {
  const f=await fixture();
  await f.surfaces.service.newTab({url:'about:blank'});
  await f.surfaces.dispose();
  await f.transport.dispose();
  const closed=f.calls.findIndex(call=>call.operation==='close');
  assert.equal(f.calls.slice(closed+1).some(call=>call.operation==='requestPage'),false);
  assert.equal(f.live.size,0);
});

test('main-window downloads forward REA arguments to the owning browser surface', async () => {
  const f = await fixture();
  try {
    const tab = await f.surfaces.service.newTab({ conversationId: 's', url: 'about:blank' });
    f.mounted = 'other';
    assert.equal(await f.surfaces.service.downloadUrl({ conversationId: 's', url: 'https://example.test/file.zip' }), true);
    const call = f.calls.find(row => row.method === 'downloadUrl');
    assert.equal(call.tabId, tab.tabId);
    assert.equal(call.args.conversationId, 's'); assert.equal(call.args.url, 'https://example.test/file.zip');
    assert.equal(f.tabs.length, 1);
  } finally { await f.surfaces.dispose(); await f.transport.dispose(); }
});

test('creation errors survive cleanup and failed native cleanup can be retried', async () => {
  const f=await fixture();f.failCreate=Object.assign(Error('synthetic page initialization failure'),{code:'PAGE_INIT'});
  f.failClose=true;
  await assert.rejects(f.surfaces.service.newTab({url:'about:blank'}),error=>{
    assert.equal(error.code,'PAGE_INIT');assert.match(error.message,/synthetic page initialization failure/);
    assert.match(JSON.stringify(error.details),/native close failed/);return true;
  });
  f.failClose=false;
  await f.surfaces.dispose();await f.transport.dispose();
  assert(f.calls.filter(call=>call.operation==='close').length>=2);
});

test('a faulted surface can still be closed and a late snapshot cannot revive it', async () => {
  const f=await fixture();const tab=await f.surfaces.service.newTab({url:'about:blank'});
  f.event({type:'fault',...tab,error:'page renderer exited'});
  f.event({type:'page',...tab,event:{type:'snapshot',snapshot:{url:'about:blank',title:'late'}}});
  await f.surfaces.dispose();await f.transport.dispose();
  assert.equal(f.live.size,0);
});

test('an idle remote guest closes its shell only after exact destruction and release proof', async () => {
  const f=await fixture();const tab=await f.surfaces.service.newTab({url:'about:blank'});
  const event=release=>f.event({type:'page',...tab,event:{type:'closed',release}});
  event({closed:true,released:false,retired:true});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.live.size,1);
  event({closed:true,released:true,retired:true,leaseId:'original',webContentsId:9});
  for(let attempt=0;attempt<20&&f.live.size;attempt++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.live.size,0);assert.equal(f.tabs.length,0);
  await f.surfaces.dispose();await f.transport.dispose();
});


for (const phase of ['create', 'ready', 'dispose']) test('native close does not wait for a missing ' + phase + ' reply and late readiness cannot revive a target', async () => {
  const f = await fixture(), gate = Promise.withResolvers();
  f[phase + 'Gate'] = gate;
  const opening = f.surfaces.service.newTab({ url: 'about:blank' }).then(value => ({ value }), error => ({ error }));
  for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve));
  let disposed = false;
  const closing = f.surfaces.dispose().then(() => { disposed = true; });
  for (let i = 0; i < 30 && !disposed; i++) await new Promise(resolve => setImmediate(resolve));
  const closedWithoutReply = f.live.size === 0 && disposed;
  gate.resolve(); await closing; const result = await opening;
  await f.transport.dispose();
  assert.equal(closedWithoutReply, true, 'the authoritative native close must precede any missing page reply');
  if (phase !== 'dispose') assert.ok(result.error, 'late readiness cannot complete a cancelled tab creation');
  assert.equal(f.live.size, 0);
  assert.throws(() => f.transport.targetFor('s', 't1'), /not ready/);
  const closed = f.calls.findIndex(call => call.operation === 'close');
  assert.equal(f.calls.slice(closed + 1).some(call => call.operation === 'requestPage'), false);
});


for (const phase of ['create', 'ready', 'reply']) test('broker cancellation closes the actual new surface while its ' + phase + ' reply is missing', async () => {
  const f = await fixture({ connected: true }), gate = Promise.withResolvers(), aborter = new AbortController();
  f[phase + 'Gate'] = gate;
  await f.transport.start(); await new Promise(resolve => setImmediate(resolve));
  let settled = false;
  const opening = f.broker.backend.newTab('dsh:' + f.transport.rendererId, 'about:blank', { sessionId: 's', signal: aborter.signal })
    .then(value => ({ value }), error => ({ error })).then(value => { settled = true; return value; });
  for (let i = 0; i < 50 && !f.live.size; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.live.size, 1);
  if (phase === 'reply') for (let i = 0; i < 50 && !f.calls.some(call => call.method === 'browser/result' && call.args.result?.target); i++) await new Promise(resolve => setImmediate(resolve));
  aborter.abort(Error('stop creating tab'));
  for (let i = 0; i < 50 && !settled; i++) await new Promise(resolve => setImmediate(resolve));
  const cancelledWithoutReply = settled, closedWithoutReply = f.live.size === 0;
  gate.resolve(); const result = await opening;
  await f.surfaces.dispose(); await f.transport.dispose(); f.broker.close();
  assert.equal(cancelledWithoutReply, true); assert.equal(closedWithoutReply, true); assert.ok(result.error);
  assert.equal(f.calls.filter(call => call.operation === 'create').length, 1);
  assert.equal(f.tabs.length, 0);
});

test('failed creation cancellation retains the exact guest until authoritative release can be retried', async () => {
  const f = await fixture({ connected: true }), ready = Promise.withResolvers(), aborter = new AbortController();
  f.readyGate = ready; f.failClose = true;
  await f.transport.start(); await new Promise(resolve => setImmediate(resolve));
  const opening = f.broker.backend.newTab('dsh:' + f.transport.rendererId, 'about:blank', { sessionId: 's', signal: aborter.signal })
    .then(value => ({ value }), error => ({ error }));
  for (let i = 0; i < 50 && !f.live.size; i++) await new Promise(resolve => setImmediate(resolve));
  aborter.abort(Error('stop creating tab'));
  const failed = await opening;
  assert.equal(failed.error?.code, 'RELEASE_FAILED'); assert.equal(f.live.size, 1);
  f.failClose = false;
  const released = await f.broker.backend.release();
  assert.equal(released.released, true); assert.equal(f.live.size, 0);
  ready.resolve(); await f.surfaces.dispose(); await f.transport.dispose(); f.broker.close();
  assert.equal(f.calls.filter(call => call.operation === 'create').length, 1);
});

test('newTab through a selected target cancels its child and releases only the original input scope', async () => {
  const f = await fixture({ connected: true }), ready = Promise.withResolvers(), aborter = new AbortController();
  await f.transport.start(); await new Promise(resolve => setImmediate(resolve));
  const original = await f.surfaces.service.newTab({ url: 'about:blank' });
  await f.broker.backend.select(original.target);
  f.readyGate = ready;
  const opening = f.broker.backend.act(original.target, { action: 'newTab', url: 'about:blank', signal: aborter.signal })
    .then(value => ({ value }), error => ({ error }));
  for (let i = 0; i < 50 && f.live.size < 2; i++) await new Promise(resolve => setImmediate(resolve));
  aborter.abort(Error('cancel new child'));
  const result = await opening;
  assert.ok(result.error); assert.equal(f.live.size, 1); assert.ok(f.live.has(original.tabId));
  assert.equal((await f.broker.backend.release()).released, true);
  ready.resolve(); await f.surfaces.dispose(); await f.transport.dispose(); f.broker.close();
});

test('a failed new surface cleanup does not prevent releasing a separate live guest', async () => {
  const f = await fixture({ connected: true }), ready = Promise.withResolvers();
  await f.transport.start(); await new Promise(resolve => setImmediate(resolve));
  const original = await f.surfaces.service.newTab({ url: 'about:blank' });
  f.readyGate = ready; f.failClose = true;
  const opening = f.broker.backend.newTab('dsh:' + f.transport.rendererId, 'about:blank', { sessionId: 's' }).catch(error => error);
  for (let i = 0; i < 50 && f.live.size < 2; i++) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(f.transport.dispose(), /cleanup failed/);
  assert.ok(f.calls.some(call => call.operation === 'requestPage' && call.method === 'release' && call.tabId === original.tabId));
  f.failClose = false; ready.resolve();
  await f.surfaces.dispose(); await f.transport.dispose(); await opening; f.broker.close();
});


test('reconnecting after a lost creation-completion notification preserves an acknowledged new tab', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture({ connected: true }); f.dropCompletion = true;
  await f.transport.start(); await new Promise(resolve => setImmediate(resolve));
  const target = await f.broker.backend.newTab('dsh:' + f.transport.rendererId, 'about:blank', { sessionId: 's' });
  await new Promise(resolve => setImmediate(resolve));
  await f.broker.handle('browser/connect', { rendererId: f.transport.rendererId, sessionIds: ['s'] });
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(1000);
  for (let i = 0; i < 50 && f.calls.filter(call => call.method === 'browser/connect').length < 2; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.live.size, 1); assert.equal(f.transport.targetFor('s', target.sidebarTabId).id, target.id);
  assert.equal(f.calls.filter(call => call.operation === 'create').length, 1);
  await f.surfaces.dispose(); await f.transport.dispose(); f.broker.close();
});

test('retiring a newTab source does not discard its independently created child', async () => {
  const f = await fixture({ connected: true }), ready = Promise.withResolvers();
  await f.transport.start(); await new Promise(resolve => setImmediate(resolve));
  const source = await f.surfaces.service.newTab({ url: 'about:blank' });
  await f.broker.backend.select(source.target); f.readyGate = ready;
  let settled = false;
  const opening = f.broker.backend.act(source.target, { action: 'newTab', url: 'about:blank' })
    .then(value => { settled = true; return value; });
  for (let i = 0; i < 50 && f.live.size < 2; i++) await new Promise(resolve => setImmediate(resolve));
  f.event({ type: 'page', sessionId: source.sessionId, tabId: source.tabId,
    event: { type: 'closed', release: { closed: true, released: true, retired: true, leaseId: 'original', webContentsId: 9 } } });
  for (let i = 0; i < 50 && f.live.has(source.tabId); i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.live.has(source.tabId), false); assert.equal(settled, false); assert.equal(f.live.size, 1);
  ready.resolve(); const result = await opening;
  assert.notEqual(result.target.id, source.target.id); assert.ok(f.live.has(result.target.sidebarTabId));
  assert.equal(f.calls.filter(call => call.operation === 'create').length, 2);
  await f.surfaces.dispose(); await f.transport.dispose(); f.broker.close();
});


for (const phase of ['session', 'frame']) test('closing a surface cancels pending focus at ' + phase + ' and prevents late UI dispatch', async () => {
  const f = await fixture(), gate = Promise.withResolvers(), frames = [];
  const tab = await f.surfaces.service.newTab({ url: 'about:blank' });
  if (phase === 'session') { f.mounted = 'other'; f.focusGate = gate; } else f.frameGate = frames;
  const focusing = f.surfaces.service.focusReference(tab.target).catch(error => error); await new Promise(resolve => setImmediate(resolve));
  await f.surfaces.dispose(); const before = f.calls.length;
  const error = await focusing; assert.equal(error.code, 'CONTROL_STOPPED');
  gate.resolve(); for (const callback of [...frames]) callback(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.calls.slice(before).filter(value => value.ui || value.operation === 'focus'), []);
  assert.equal(frames.length, 0); await f.transport.dispose();
});

test('a hidden surface frame wait ends without dispatching native focus', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = await fixture(), frames = [], tab = await f.surfaces.service.newTab({ url: 'about:blank' }); f.frameGate = frames;
  const focusing = f.surfaces.service.focusReference(tab.target).catch(error => error); await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(2000);
  assert.equal((await focusing).code, 'BROWSER_LAYOUT_TIMEOUT'); assert.equal(frames.length, 0);
  assert.equal(f.calls.some(call => call.operation === 'focus'), false);
  await f.surfaces.dispose(); await f.transport.dispose();
});

test('a detach queued just before closure cannot dispatch to the retired surface', async () => {
  const f = await fixture(), tab = await f.surfaces.service.newTab({ url: 'about:blank' });
  const detaching = f.surfaces.service.detachTab(tab).catch(error => error);
  await f.surfaces.dispose(); assert.equal((await detaching).code, 'CONTROL_STOPPED');
  assert.equal(f.calls.some(call => ['dock', 'detach'].includes(call.operation)), false);
  await f.transport.dispose();
});

test('host disposal cancels a pending session switch before a new tab is allocated', async () => {
  const f = await fixture(), gate = Promise.withResolvers(); f.mounted = 'other'; f.focusGate = gate;
  const opening = f.surfaces.service.newTab({ sessionId: 's', url: 'about:blank' }).catch(error => error); await new Promise(resolve => setImmediate(resolve));
  await f.surfaces.dispose(); assert.equal((await opening).code, 'CONTROL_STOPPED');
  gate.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.tabs.length, 0); assert.equal(f.live.size, 0);
  assert.equal(f.calls.some(call => call.operation === 'create'), false);
  await f.transport.dispose();
});
