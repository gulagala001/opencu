import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

async function fixture({automation,ensureInputMonitoring=async()=>{}}={}) {
  const events=[], snapshots=new Map(), releases=[];
  let url='about:blank', configured=false, attached=false, registered=false, automate;
  const element=Object.assign(new EventTarget(), {
    isConnected:true,
    setAttribute(name,value){if(name==='src'){url=value;queueMicrotask(()=>{events.push('dom-ready');element.dispatchEvent(new Event('dom-ready'));});}},
    getURL:()=>url,getTitle:()=>'',isLoading:()=>false,canGoBack:()=>false,canGoForward:()=>false,
    getZoomFactor:()=>1,isAudioMuted:()=>false,isCurrentlyAudible:()=>false,
    downloadURL:value=>events.push(['download',value]),
    async loadURL(value){events.push('navigate');url=value;},
  });
  const pageHost={webview:element,markRegistered(){registered=true;},dispose(){}};
  const state={pages:{getHost:()=>pageHost,disposeHost(){}},removeTab(){},
    getSnapshot:(s,t)=>snapshots.get(s+t),isBrowserUseActive:()=>false};
  const noop=()=>{};
  const stubs={
    './rea/app-shared-2f2228189a8d.js':{Ff:{dispatchHostMessage(value){if(value.snapshot)snapshots.set(value.conversationId+value.browserTabId,value.snapshot);}},WFt:()=>({danger:noop})},
    './rea/app-initial-c468e3fd7f91.js':{AW:state},
    './rea/tab-content-6a1dfa5c5ac1.js':{jl:{}},
    './annotation-host.mjs':{createAnnotationHost:()=>({install:async()=>{},ensureInputMonitoring,invalidate:noop,subscribe:()=>noop,dispose:async()=>{}})},
    './rea-locale.mjs':{reaIntl:()=>({locale:'en',messages:{}})},
    './extensions-host.mjs':{createExtensionsHost:()=>({service:{},dispose:async()=>{}})},
    './capture-compositor.mjs':{createCaptureCompositor:()=>({cancel:noop,dispose:noop})},
    '../site-tools-policy.mjs':{siteToolsPolicyKey:'policy',siteToolsAllowed:()=>false},
  };
  const context=vm.createContext({console,URL,AbortController,setTimeout,clearTimeout,queueMicrotask,
    localStorage:{getItem:()=>null,setItem:noop},window:{addEventListener:noop,removeEventListener:noop}});
  const module=new vm.SourceTextModule(await readFile(new URL('../src/client/rea-browser-host.mjs',import.meta.url),'utf8'),{context});
  await module.link(name=>{const values=stubs[name];assert(values,name);return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});});
  await module.evaluate();
  const lifetime=new AbortController();
  const host=module.namespace.createReaBrowserHost({
    desktop:{automation,acquireOpenCU:async()=>({lease:'original',partition:'isolated'}),release:async lease=>releases.push(lease),onOpenRequested:()=>noop},
    transport:{setTabOwner:noop,attach:async(_element,options)=>{automate=options.automate;attached=true;events.push('transport');return async()=>{};}},
    client:{getSnapshot:()=>({sessions:[]}),subscribe:()=>noop},sidebar:{tabsIn:()=>[],mounted:{getSnapshot:()=> 'other'}},settings:{readAll:async()=>({values:{}})},history:{},
    downloads:{async attach(){await new Promise(resolve=>setTimeout(resolve,5));configured=true;events.push('downloads');return noop;}},
  });
  host.mountTab({sessionId:'s',tabId:'t',initialUrl:'file:///synthetic.html',signal:lifetime.signal});
  return {host,events,releases,get automate(){return automate;},get state(){return {configured,attached,registered};}};
}

test('fast first navigation cannot outrun downloads setup, guest readiness or transport registration', async () => {
  const f=await fixture();let timer;
  try {
    await f.host.service.registerWebviewHostSession({rendererInstanceId:'renderer'});
    await f.host.service.registerWebviewHost({conversationId:'s',browserTabId:'t',rendererInstanceId:'renderer'});
    await Promise.race([f.host.readyFor('s','t'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('missed first dom-ready')),100);})]);
    assert.deepEqual(f.state,{configured:true,attached:true,registered:true});
    assert.deepEqual(f.events,['downloads','transport','dom-ready','navigate']);
  } finally {clearTimeout(timer);await f.host.dispose();}
  assert.deepEqual(f.releases,['original']);
});

test('REA download arguments keep their source conversation after switching chats', async () => {
  const f = await fixture();
  try {
    await f.host.service.registerWebviewHostSession({ rendererInstanceId: 'renderer' });
    await f.host.service.registerWebviewHost({ conversationId: 's', browserTabId: 't', rendererInstanceId: 'renderer' });
    await f.host.readyFor('s', 't');
    assert.equal(await f.host.service.downloadUrl({ conversationId: 's', url: 'https://example.test/file.zip' }), true);
    assert.deepEqual(f.events.at(-1), ['download', 'https://example.test/file.zip']);
  } finally { await f.host.dispose(); }
});

test('closed-state proof and cleanup reach the original lease when page monitoring is unavailable', async () => {
  const calls=[],receipt={closed:true,released:true,retired:true,leaseId:'original',webContentsId:9};
  const f=await fixture({ensureInputMonitoring:async()=>{throw Error('destroyed webview cannot install a monitor');},
    automation:async(lease,operation)=>{calls.push([lease,operation]);return receipt;}});
  try {
    await f.host.service.registerWebviewHostSession({rendererInstanceId:'renderer'});
    await f.host.service.registerWebviewHost({conversationId:'s',browserTabId:'t',rendererInstanceId:'renderer'});
    await f.host.readyFor('s','t');
    for(const operation of ['closedState','releaseInput','cancelUpload','cancelSiteTool'])assert.equal(await f.automate(operation,{}),receipt);
    await assert.rejects(f.automate('input',{}),/cannot install a monitor/);
    assert.deepEqual(calls.map(([lease,operation])=>[lease,operation]),['closedState','releaseInput','cancelUpload','cancelSiteTool'].map(operation=>['original',operation]));
  } finally {await f.host.dispose();}
});
