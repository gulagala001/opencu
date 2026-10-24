import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createBrowserTransport} from '../src/client/browser-transport.mjs';
import {inputReleased} from '../src/protocol.mjs';

async function fixture() {
  const calls = [], notices = [], tabs = [], lifetimes = new Map();
  let listener, sequence = 0, failCreate, failClose = false;
  const live = new Set();
  const context = vm.createContext({console, AbortController, setTimeout, clearTimeout, queueMicrotask,
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
  const client = {request: async (method,args) => {calls.push({method,args});return {ok:true};}, subscribe: () => () => {}};
  const transport = createBrowserTransport(client);
  const desktop = {
    onSurfaceEvent: callback => {listener = callback; return () => {};},
    async surface(operation, args) {
      calls.push({operation,method:args.method,tabId:args.tabId});
      if(operation === 'create') {if(failCreate)throw failCreate;live.add(args.tabId);return true;}
      if(operation === 'close') {if(failClose)throw Error('native close failed');live.delete(args.tabId);return true;}
      if(operation !== 'requestPage') return true;
      if(!live.has(args.tabId))throw Error('request sent to destroyed page');
      if(args.method === 'ready')return {url:'about:blank',title:'test'};
      if(args.method === 'release'||args.method==='dispose')return {released:true};
      return true;
    },
  };
  const sidebar = {
    mounted:{getSnapshot:()=> 's'}, active:()=>tabs[0], tabsIn:()=>tabs,
    openTabIn(){const tab={id:`t${++sequence}`,kind:'browser'};tabs.push(tab);lifetimes.set(tab.id,new AbortController());},
    closeIn(_session,id){const index=tabs.findIndex(tab=>tab.id===id);if(index>=0)tabs.splice(index,1);lifetimes.get(id)?.abort();},
    tabDomain:{occurrence:(_session,tab)=>({signal:lifetimes.get(tab.id).signal})},
  };
  const surfaces=source.namespace.createBrowserSurfaces({desktop,transport,client,sidebar});
  return {surfaces,transport,calls,notices,tabs,live,
    set failCreate(value){failCreate=value;},set failClose(value){failClose=value;},
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
