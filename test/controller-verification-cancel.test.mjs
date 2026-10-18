import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createController} from '../src/core/controller.mjs';
import {createBrowserBackend} from '../src/browser/backend.mjs';
// Production controller/backend/actions; only Playwright page/CDP endpoints simulated.
// Endpoint logs prove cancellation/release ordering, not actual browser delivery.
// Pending verification RPCs are always settled by fixture cleanup; no browser starts.
async function setup(t){
 const dir=await mkdtemp(join(tmpdir(),'opencu-verify-cancel-'));
 const events=[]; let foreground='A'; const hooks={};
 const pages=['A','B'].map(name=>{
  const page=new EventEmitter(); page.name=name;page.closed=false;
  page.url=()=>`https://${name.toLowerCase()}.invalid/`;page.title=async()=>name;
  page.isClosed=()=>page.closed;page.setDefaultTimeout=()=>{};page.evaluate=async()=>true;
  page.bringToFront=async()=>{foreground=name;events.push([name,'focus']);};
  page.keyboard={down:async key=>{events.push([name,'down',key]);await hooks.down?.(name,key);},up:async key=>{await hooks.up?.(name,key);events.push([name,'up',key]);},insertText:async text=>events.push([name,'text',text])};
  page.mouse={up:async args=>events.push([name,'mouseUp',args.button])};
  return page;
 });
 const context=new EventEmitter();context.browser=()=>({});context.pages=()=>pages;
 context.newCDPSession=async page=>{const s=new EventEmitter();s.detach=async()=>{};s.send=async(method,args)=>{await hooks.send?.(page.name,method,args);
  if(method==='Target.getTargetInfo')return {targetInfo:{targetId:page.name,browserContextId:'ctx',title:page.name,url:page.url()}};
  if(method==='Page.getFrameTree')return {frameTree:{frame:{id:page.name}}};
  if(method==='Page.createIsolatedWorld')return {executionContextId:1};
  if(method==='Runtime.evaluate')return {result:{value:null}};
  if(method==='Emulation.setFocusEmulationEnabled')events.push([page.name,'emulate',args.enabled]);
  return {};
 };return s;};
 const backend=await createBrowserBackend({dataDir:dir,context,instanceId:'fixture',releaseTimeoutMs:20,timeoutMs:20});
 const controller=await createController({dataDir:dir,browser:backend});
 const [A,B]=await backend.listTargets();
 const ok=async promise=>{const r=await promise;assert.equal(r.ok,true,JSON.stringify(r));return r;};
 t.after(async()=>{await controller.close();await rm(dir,{recursive:true,force:true});});
 return {context,dir,controller,backend,A,B,events,hooks,ok,getForeground:()=>foreground};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function settledWithin(promise,ms){return Promise.race([promise.then(()=>true,()=>true),sleep(ms).then(()=>false)]);}
test('stop releases held key while read-only verification stays pending',async t=>{
 const {dir,controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));await ok(c.act({action:'keyDown',key:'Shift'}));
 const entered=deferred(),gate=deferred();
 hooks.send=async(_,method)=>{if(method==='Target.getTargetInfo'){entered.resolve();await gate.promise;}};
 const pending=c.act({action:'type',text:'never'});await entered.promise;
 const stop=c.stop();const queued=c.act({action:'type',text:'also-never'});
 try{
  assert.equal(await settledWithin(stop,100),true,'stop abandons read-only verification');
  assert.deepEqual(events.filter(e=>e[1]==='up'),[['A','up','Shift']]);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'browser-inputs.json'),'utf8')),[]);
  const state=await c.getState();assert.equal(state.state.mode,'stopped');assert.equal(state.state.releasePending,false);
  assert.equal(events.filter(e=>e[1]==='text').length,0);
 }finally{hooks.send=undefined;gate.resolve();await pending;await stop;await queued;}
 assert.deepEqual(events.filter(e=>e[1]==='up'),[['A','up','Shift']]);
 assert.equal(events.filter(e=>e[1]==='text').length,0);
});
test('close and retry-close finish without late input while verification stays pending',async t=>{
 const {controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));await ok(c.act({action:'keyDown',key:'Control'}));
 const entered=deferred(),gate=deferred();hooks.send=async(_,method)=>{if(method==='Target.getTargetInfo'){entered.resolve();await gate.promise;}};
 const pending=c.act({action:'type',text:'never'});await entered.promise;
 const close=c.close(),retry=c.close();
 try{
  assert.equal(close,retry,'close retry shares the same queued promise');
  assert.equal(await settledWithin(close,100),true);
  assert.deepEqual(events.filter(e=>e[1]==='up'),[['A','up','Control']]);
  assert.equal((await c.getState()).state.mode,'closed');
 }finally{hooks.send=undefined;gate.resolve();await pending;await close;}
 assert.equal((await c.act({action:'type',text:'after-close'})).error.code,'CONTROLLER_CLOSED');
 assert.deepEqual(events.filter(e=>e[1]==='up'),[['A','up','Control']]);
 assert.equal(events.filter(e=>e[1]==='text').length,0);
});
test('computer overall timeout completes despite stalled read-only verification',async t=>{
 const {controller:c,A,events,hooks}=await setup(t);
 const {createComputerSession}=await import('../src/dsh/computer.mjs');
 const methods={select:'selectTarget',resume:'resume',observe:'observe',act:'act',stop:'stop'};
 const session=createComputerSession((endpoint,args)=>c[methods[endpoint]](endpoint==='select'?args.reference:args));
 try{
  await session.run({code:`var tab = await cua.getTab(${JSON.stringify(A.id)}); await tab.keyDown('Shift');`,timeoutMs:1000});
  const entered=deferred(),gate=deferred();hooks.send=async(_,method)=>{if(method==='Target.getTargetInfo'){entered.resolve();await gate.promise;}};
  const run=session.run({code:"await tab.type('never');",timeoutMs:20});run.catch(()=>{});
  await entered.promise;
  try{
   assert.equal(await settledWithin(run,100),true,'COMPUTER_TIMEOUT handler can release and finish');
   assert.deepEqual(events.filter(e=>e[1]==='up'),[['A','up','Shift']]);
   assert.equal((await c.getState()).state.mode,'stopped');
  }finally{hooks.send=undefined;gate.resolve();await assert.rejects(run,e=>e.code==='COMPUTER_TIMEOUT');}
  assert.deepEqual(events.filter(e=>e[1]==='up'),[['A','up','Shift']]);
  assert.equal(events.filter(e=>e[1]==='text').length,0);
 }finally{await session.close();}
});
test('late rejecting verification is handled and stop then resume remains usable',async t=>{
 const {controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));
 let reject;const pendingRPC=new Promise((_,r)=>reject=r),entered=deferred();
 hooks.send=async(_,method)=>{if(method==='Target.getTargetInfo'){entered.resolve();await pendingRPC;}};
 const action=c.act({action:'type',text:'never'});await entered.promise;
 const stopped=c.stop();
 try {
  assert.equal(await settledWithin(stopped,100),true);await ok(stopped);assert.equal((await action).ok,false);
  hooks.send=undefined;await ok(c.resume({targetId:A.id}));
  reject(new Error('late synthetic CDP rejection'));await new Promise(r=>setImmediate(r));
  await ok(c.act({action:'type',text:'after-resume'}));
 } finally {hooks.send=undefined;reject(new Error('fixture cleanup'));await action;await stopped;}
 assert.deepEqual(events.filter(e=>e[1]==='text'),[['A','text','after-resume']]);
});
test('normal and cold-recovery verification remain functional',async t=>{
 const {dir,context,controller:c,A,events,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));await ok(c.act({action:'type',text:'normal'}));
 await ok(c.close());
 const backend=await createBrowserBackend({dataDir:dir,context,instanceId:'fixture',timeoutMs:20,releaseTimeoutMs:20});
 const recovered=await createController({dataDir:dir,browser:backend});
 try{
  assert.equal((await recovered.getState()).state.mode,'recovery_required');
  await ok(recovered.resume({targetId:A.id}));await ok(recovered.act({action:'type',text:'cold-resumed'}));
 }finally{await recovered.close();}
 assert.deepEqual(events.filter(e=>e[1]==='text'),[['A','text','normal'],['A','text','cold-resumed']]);
});

test('stop during pending focus-emulation: no late keyboard dispatch after promise settles',async t=>{
 const {controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));const entered=deferred(),gate=deferred();
 hooks.send=async(_,method,args)=>{if(method==='Emulation.setFocusEmulationEnabled'&&args.enabled){entered.resolve();await gate.promise;}};
 const action=c.act({action:'type',text:'never'});await entered.promise;
 const stopped=c.stop();gate.resolve();
 assert.equal((await action).ok,false);await ok(stopped);
 assert.equal(events.filter(e=>e[1]==='text').length,0);
});
test('close cancels pending input and blocks queued and later input',async t=>{
 const {controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));const entered=deferred(),gate=deferred();
 hooks.send=async(_,method,args)=>{if(method==='Emulation.setFocusEmulationEnabled'&&args.enabled){entered.resolve();await gate.promise;}};
 const first=c.act({action:'type',text:'first'});await entered.promise;
 const queued=c.act({action:'type',text:'queued'});const closed=c.close();gate.resolve();
 assert.equal((await first).ok,false);assert.equal((await queued).ok,false);await ok(closed);
 assert.equal((await c.act({action:'type',text:'late'})).error.code,'CONTROLLER_CLOSED');
 assert.equal(events.filter(e=>e[1]==='text').length,0);
});
test('release failure preserves held key on disk and blocks control until successful resume',async t=>{
 const {dir,controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));await ok(c.act({action:'keyDown',key:'Shift'}));
 hooks.up=async()=>{throw new Error('synthetic transport failure');};
 const stopped=await c.stop();assert.equal(stopped.error.code,'RELEASE_FAILED');assert.equal(stopped.state.releasePending,true);
 let saved=JSON.parse(await readFile(join(dir,'browser-inputs.json'),'utf8'));
 assert.deepEqual(saved[0].keys,['Shift']);
 assert.equal((await c.act({action:'type',text:'blocked'})).ok,false);
 hooks.up=undefined;await ok(c.resume({targetId:A.id}));
 saved=JSON.parse(await readFile(join(dir,'browser-inputs.json'),'utf8'));assert.deepEqual(saved,[]);
 await ok(c.act({action:'type',text:'resumed'}));
 assert.deepEqual(events.filter(e=>e[1]==='text'),[['A','text','resumed']]);
});
test('in-flight down timeout keeps uncertain held state; retry releases original key after settlement',async t=>{
 const {dir,controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));const entered=deferred(),gate=deferred();
 hooks.down=async()=>{entered.resolve();await gate.promise;};
 const action=c.act({action:'keyDown',key:'Shift'});await entered.promise;
 const stopped=await c.stop();assert.equal(stopped.error.code,'RELEASE_FAILED');assert.equal((await action).ok,false);
 assert.deepEqual(JSON.parse(await readFile(join(dir,'browser-inputs.json'),'utf8'))[0].keys,['Shift']);
 assert.equal(events.filter(e=>e[1]==='up').length,0);
 gate.resolve();await new Promise(r=>setImmediate(r));await ok(c.resume({targetId:A.id}));
 assert.deepEqual(events.filter(e=>e[1]==='up'),[['A','up','Shift']]);
 assert.deepEqual(JSON.parse(await readFile(join(dir,'browser-inputs.json'),'utf8')),[]);
});
test('close release failure is retryable and does not accept intervening input',async t=>{
 const {dir,controller:c,A,events,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));await ok(c.act({action:'keyDown',key:'Control'}));
 hooks.up=async()=>{throw new Error('synthetic release failure');};
 const closed=await c.close();assert.equal(closed.ok,false);assert.equal(closed.state.closed,false);
 assert.deepEqual(JSON.parse(await readFile(join(dir,'browser-inputs.json'),'utf8'))[0].keys,['Control']);
 assert.equal((await c.act({action:'type',text:'blocked'})).ok,false);
 hooks.up=undefined;await ok(c.close());
 assert.deepEqual(JSON.parse(await readFile(join(dir,'browser-inputs.json'),'utf8')),[]);
 assert.equal(events.filter(e=>e[1]==='text').length,0);
});

test('fresh input-state instance restores matching occurrence and refuses reused identity',async t=>{
 const {dir,controller:c,A,hooks,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));await ok(c.act({action:'keyDown',key:'Shift'}));
 hooks.up=async()=>{throw new Error('synthetic transport failure');};await c.stop();
 const {createInputState}=await import('../src/browser/input-state.mjs');
 const matching=await createInputState(dir,A.identity.browserId);
 const record={id:A.id,identity:A.identity,keys:new Set(),buttons:new Set()};matching.adopt(record);
 assert.deepEqual([...record.keys],['Shift']);assert.equal(matching.hasPending(),false);
 const changed=await createInputState(dir,A.identity.browserId);
 const impostor={id:A.id,identity:{...A.identity,connectionId:'other'},keys:new Set(),buttons:new Set()};changed.adopt(impostor);
 assert.equal(impostor.keys.size,0);assert.equal(changed.hasPending(),true);
 hooks.up=undefined;
});

test('direct backend.verify late rejection is consumed after cancellation',async t=>{
 const {controller:c,backend,A,events,ok}=await setup(t);
 await ok(c.selectTarget({id:A.id}));
 const original=backend.verify;let reject;
 const pending=new Promise((_,r)=>reject=r),entered=deferred();
 backend.verify=()=>{entered.resolve();return pending;};
 const action=c.act({action:'type',text:'never'});await entered.promise;
 const stopped=c.stop();
 try {
  assert.equal(await settledWithin(stopped,100),true);await ok(stopped);
  assert.equal((await action).error.code,'CONTROL_STOPPED');
  backend.verify=original;
  await ok(c.resume({targetId:A.id}));
  reject(new Error('direct late backend.verify rejection'));
  await new Promise(r=>setImmediate(r));
  await ok(c.act({action:'type',text:'after-direct-rejection'}));
  assert.deepEqual(events.filter(e=>e[1]==='text'),[['A','text','after-direct-rejection']]);
 } finally {backend.verify=original;reject(new Error('fixture cleanup'));await action;await stopped;}
});

for (const action of ['getDialog', 'handleDialog']) for (const alreadyStopped of [false, true]) {
 test(`${action} verification remains cancellable${alreadyStopped ? ' during stopped-mode recovery' : ''}`, async t => {
  const {controller:c,A,hooks,ok}=await setup(t);
  await ok(c.selectTarget({id:A.id}));
  if (alreadyStopped) await ok(c.stop());
  const entered=deferred(),gate=deferred();
  hooks.send=async(_,method)=>{if(method==='Target.getTargetInfo'){entered.resolve();await gate.promise;}};
  const pending=c.act({action}); await entered.promise;
  const stopped=c.stop();
  try {
   assert.equal(await settledWithin(stopped,100),true,'stop releases without waiting for dialog verification');
   await ok(stopped); assert.equal((await pending).error.code,'CONTROL_STOPPED');
  } finally { hooks.send=undefined;gate.resolve();await pending;await stopped; }
 });
}
