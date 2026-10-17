import test from 'node:test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRuntime} from '../src/runtime.mjs';
import {createBrowserHost} from '../src/dsh/browser-host.mjs';
function protocol() {
 let launches=0,connections=0,opts,closed=0,newPages=0;
 const pages=[];
 const context=Object.assign(new EventEmitter(),{browser:()=>browser,pages:()=>pages,close:async()=>{closed++;},newCDPSession:async p=>Object.assign(new EventEmitter(),{detach:async()=>{},send:async(method)=>{
 if(method==='Target.getTargetInfo')return {targetInfo:{targetId:p.id,browserContextId:'synthetic'}};
 if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'frame'}}};
 if(method==='Runtime.evaluate')return {result:{value:null}};
 return {};
 }}),newPage:async()=>{
 const p=Object.assign(new EventEmitter(),{id:'p'+(++newPages),setDefaultTimeout(){},isClosed:()=>false,title:async()=> 'Synthetic page',url:()=> 'about:blank',evaluate:async()=>({width:800,height:600,active:false}),screenshot:async()=>Buffer.from('synthetic-jpeg')});pages.push(p);return p;
 }});
 const browser={contexts:()=>[context],close:async()=>{closed++;}};
 const playwright={chromium:{launchPersistentContext:async(_,o)=>{launches++;opts=o;return context;},connectOverCDP:async()=>{connections++;return browser;}}};
 return {context,playwright,get state(){return {launches,connections,opts,closed,newPages}}};
}
for(const spec of [
 {name:'default',options:{},launch:0}, {name:'headless alone',options:{headless:true},launch:0},
 {name:'opt-in',options:{managedHeadless:true},launch:1},
 {name:'disabled',options:{managedHeadless:true,browserEnabled:false},launch:0},
 {name:'CDP priority',options:{managedHeadless:true,cdpEndpoint:'ws://synthetic.invalid'},launch:0,cdp:1},
 {name:'provided context',options:{managedHeadless:true},provided:true,launch:0},
]) await test(`managed browser: ${spec.name}`, async () => {
 const dir=await mkdtemp(join(tmpdir(),'opencu-managed-review-')),host=createBrowserHost(),fake=protocol();
 const launchOptions={headless:false};
 const runtime=await createRuntime({dataDir:dir,nativeEnabled:false,extensionEnabled:false,dshBrowser:host.backend,browserOptions:{playwright:fake.playwright,launchOptions,...spec.provided?{context:fake.context}:{}},...spec.options});
 try {
 assert.equal(fake.state.launches,0,'creation must remain lazy');
 const inv=await runtime.listTargets();assert.equal(inv.ok,true);assert.deepEqual(inv.errors,[]);
 assert.equal(fake.state.launches,spec.launch);assert.equal(fake.state.connections,spec.cdp??0);assert.equal(launchOptions.headless,false,'caller options immutable');
 if(spec.launch){assert.equal(fake.state.opts.headless,true);assert.equal(inv.targets.length,1);assert.equal(inv.browsers[0].id,'browser:local');const chosen=await runtime.selectTarget(inv.targets[0]);assert.equal(chosen.ok,true,JSON.stringify(chosen));const preview=await runtime.preview({targetId:chosen.target.id});assert.equal(preview.ok,true,JSON.stringify(preview));assert.match(preview.preview.dataUrl,/^data:image\/jpeg;base64,/);}
 console.log(spec.name,JSON.stringify({state:fake.state,providers:runtime.runtimeInfo.browserProviders,targets:inv.targets.length}));
 }finally{const result=await runtime.close();assert.equal(result.ok,true,JSON.stringify(result));host.close();await rm(dir,{recursive:true,force:true});}
 if(spec.provided)assert.equal(fake.state.closed,0,'externally owned context stays open');
});

test('managed headless launch failure stays visible and does not install resources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'opencu-managed-missing-'));const host=createBrowserHost();let launches=0;
 const runtime=await createRuntime({dataDir:dir,dshBrowser:host.backend,nativeEnabled:false,extensionEnabled:false,managedHeadless:true,
  browserOptions:{playwright:{chromium:{launchPersistentContext:async()=>{launches++;throw Object.assign(new Error('Synthetic Chromium executable is missing'),{code:'ENOENT'});}}}}});
 try {const result=await runtime.listTargets();assert.equal(result.ok,true);assert.equal(result.targets.length,0);assert.match(JSON.stringify(result.errors),/Chromium executable is missing/);assert.equal(launches,1);}
 finally{await runtime.close();host.close();await rm(dir,{recursive:true,force:true});}
});
