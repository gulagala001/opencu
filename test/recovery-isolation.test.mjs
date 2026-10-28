import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createController} from '../src/core/controller.mjs';
import {createBrowserHost} from '../src/dsh/browser-host.mjs';
import {createCompositeBrowserBackend} from '../src/browser/composite.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {createExtensionBackend} from '../src/extension/backend.mjs';
import {targetId} from '../src/extension/protocol.mjs';
import {createServer} from 'node:http';
import {createComputerSession} from '../src/dsh/computer.mjs';
import {createComputerRepl} from '../src/dsh/computer-repl.mjs';

const root = new URL('../.local/', import.meta.url); await mkdir(root, {recursive:true});
const ok = result => {assert.equal(result.ok,true,JSON.stringify(result));return result;};
const tab = id => ({id,backend:'browser',provider:'dsh',kind:'tab',browserId:'dsh:live',identity:{guestId:id},url:'about:blank'});
async function fixture(t,{nativeFailure=false}={}) {
  const dir=await mkdtemp(new URL('recovery-isolation-',root).pathname);
  const old=tab('old'),live=tab('live'),calls=[];
  await writeFile(join(dir,'controller.json'),JSON.stringify({version:1,closed:false,mode:'release_failed',activeTargetId:old.id,
    releasePending:true,releaseErrors:[{backend:'browser',failures:[{targetId:old.id,code:'STALE_TARGET'}]}],targets:[old]}));
  const browser={listTargets:async()=>[live],listBrowsers:async()=>[{id:live.browserId}],select:async t=>t,
    verify:async t=>({valid:t.id!==old.id,target:t}),observe:async()=>({ax:{nodes:[]}}),act:async(t,a)=>{calls.push(['act',t.id,a.action]);return {};},
    newTab:async()=>{calls.push(['new']);return live;},
    releaseTarget:async t=>{calls.push(['releaseTarget',t.id]);return {released:t.id!==old.id};},
    release:async()=>({released:false,failures:[{targetId:old.id,code:'STALE_TARGET'}]}),close:async()=>{}};
  let nativeFails=nativeFailure;
  const native={listTargets:async()=>[],select:async t=>t,verify:async t=>({valid:true,target:t}),observe:async()=>({}),act:async()=>({}),
    release:async()=>({released:!nativeFails}),close:async()=>{}};
  const c=await createController({dataDir:dir,browser,native});
  t.after(async()=>{nativeFails=false;browser.release=async()=>({released:true});await c.close();await rm(dir,{recursive:true,force:true});});
  return {c,dir,old,live,browser,native,calls};
}

async function nativeFixture(t, options) {
  const f = await fixture(t, options);
  const app = {id:'native:live',backend:'native',kind:'app',identity:{pid:123,windowId:7}};
  f.native.listTargets = async () => [app];
  f.native.act = async (_target, args) => { f.calls.push(['native',args.action]); return {}; };
  ok(await f.c.selectTarget(app));
  return {...f, app};
}

test('native recovery isolates unrelated orphaned browser targets after native input releases', async t => {
  const f = await nativeFixture(t);
  ok(await f.c.resume({targetId:f.app.id}));
  ok(await f.c.observe({targetId:f.app.id}));
  ok(await f.c.act({targetId:f.app.id,action:'click'}));
  assert.equal(ok(await f.c.selectTarget(f.app)).target.verified,true);
  const {state} = await f.c.getState();
  assert.equal(state.releasePending,true);
  assert.equal(state.targets.find(target => target.id === f.old.id).verified,false);
  assert.equal((await f.c.act({targetId:f.old.id,action:'click'})).ok,false);
  assert.deepEqual(f.calls,[['native','click']]);
});

test('native recovery never bypasses its own unresolved hardware input', async t => {
  const f = await nativeFixture(t,{nativeFailure:true});
  assert.equal((await f.c.resume({targetId:f.app.id})).error.code,'RELEASE_FAILED');
  assert.equal((await f.c.act({targetId:f.app.id,action:'click'})).ok,false);
  assert.deepEqual(f.calls,[]);
});

test('explicit stop still blocks a recovered native target until explicit resume', async t => {
  const f = await nativeFixture(t);
  ok(await f.c.resume({targetId:f.app.id}));
  await f.c.stop();
  assert.equal((await f.c.act({targetId:f.app.id,action:'click'})).error.code,'CONTROL_STOPPED');
  assert.equal((await f.c.getState()).state.explicitlyStopped,true);
  ok(await f.c.resume({targetId:f.app.id}));
  ok(await f.c.act({targetId:f.app.id,action:'click'}));
});

test('stop during native recovery cannot be overwritten by a late release receipt', async t => {
  const f = await nativeFixture(t);
  const gate = Promise.withResolvers(), entered = Promise.withResolvers();
  f.native.release = () => { entered.resolve(); return gate.promise; };
  const resuming = f.c.resume({targetId:f.app.id});
  await entered.promise;
  const stopping = f.c.stop(); gate.resolve({released:true});
  assert.equal((await resuming).error.code,'CONTROL_STOPPED');
  await stopping;
  assert.equal((await f.c.getState()).state.explicitlyStopped,true);
  assert.equal((await f.c.act({targetId:f.app.id,action:'click'})).error.code,'CONTROL_STOPPED');
});

test('cold native launch recovers without requiring a pre-existing app or old browser', async t => {
  const f = await fixture(t), app = {id:'native:new',backend:'native',identity:{pid:124,windowId:8}};
  f.native.openApplication = async () => { f.calls.push(['launch']); return app; };
  const request = {backend:'native',launch:true,path:'/Applications/Synthetic.app'};
  ok(await f.c.openTarget(request));
  await f.c.stop();
  assert.equal((await f.c.openTarget(request)).error.code,'CONTROL_STOPPED');
  assert.deepEqual(f.calls,[['launch']]);
});

test('cold native launch refuses unresolved hardware and invalid launch references', async t => {
  const f = await fixture(t,{nativeFailure:true});
  f.native.openApplication = async () => { f.calls.push(['launch']); };
  assert.equal((await f.c.openTarget({backend:'native',launch:true,path:'/Applications/Synthetic.app'})).error.code,'RELEASE_FAILED');
  assert.equal((await f.c.openTarget({backend:'native',launch:true,path:'guessed.app'})).error.code,'INVALID_TARGET');
  assert.deepEqual(f.calls,[]);
});

for (const [name, createSession] of [['worker',createComputerSession],['REPL',createComputerRepl]])
for (const native of [false,true]) test(`${name}: recovered ${native ? 'native' : 'browser'} input stays usable across reset and another session`,async t=>{
  const f = native ? await nativeFixture(t) : await fixture(t);
  const target = native ? f.app : f.live, backend = native ? f.native : f.browser;
  const methods = {state:'getState',targets:'listTargets',select:'selectTarget'};
  const request = (endpoint,args={}) => f.c[methods[endpoint]??endpoint](endpoint === 'select' ? args.reference : args);
  const computer = createSession(request);
  t.after(() => computer.close());
  const run = code => computer.run({code,timeoutMs:3000});
  const binding = `var target = await cua.${native ? 'getApp' : 'getTab'}(${JSON.stringify(target.id)});`;
  await run(binding);
  await run('await target.keyDown("Shift");');
  const act = backend.act, releaseTarget = backend.releaseTarget;
  backend.act = async () => { throw Error('Synthetic uncertain input'); };
  if (!native) backend.releaseTarget = async () => ({released:false});
  await assert.rejects(run('await target.click([10,10]);'),{code:'RELEASE_FAILED'});
  backend.act = act; backend.releaseTarget = releaseTarget;
  await run(`await cua.resume(${JSON.stringify(target.id)}); await target.getAXState();`);
  await assert.rejects(run('await cua.stop();'),{code:'RELEASE_FAILED'});
  await run(`await cua.resume(${JSON.stringify(target.id)}); await target.getAXState();`);
  await computer.reset();
  assert.equal((await f.c.getState()).state.mode,'active');
  assert.equal((await f.c.getState()).state.releasePending,true,'the unrelated old browser remains quarantined');
  await run(binding);
  await run('await target.click([10,10]);');
  await computer.close();
  const next = createSession(request);
  try { await next.run({code:binding,timeoutMs:3000}); await next.run({code:'await target.click([10,10]);',timeoutMs:3000}); }
  finally { await next.close(); }
  assert.equal((await f.c.getState()).state.mode,'active');
});

test('an unrelated orphan remains quarantined while a freshly bound tab resumes and acts',async t=>{
  const f=await fixture(t);ok(await f.c.selectTarget(f.live));ok(await f.c.resume({targetId:f.live.id}));
  ok(await f.c.act({targetId:f.live.id,action:'click'}));
  assert.equal(ok(await f.c.selectTarget(f.live)).target.verified,true,'reselecting a healthy isolated target does not force another release');
  assert.equal((await f.c.act({targetId:f.old.id,action:'click'})).ok,false);
  const state=(await f.c.getState()).state;
  assert.equal(state.releasePending,true);assert.equal(state.targets.find(t=>t.id===f.old.id).verified,false);
  assert.deepEqual(f.calls,[['releaseTarget','live'],['act','live','click']]);
});

test('cold orphan recovery permits exactly one new tab but explicit stop still prevents allocation',async t=>{
  const f=await fixture(t);ok(await f.c.openTarget({browserId:f.live.browserId,url:'about:blank'}));
  ok(await f.c.act({targetId:f.live.id,action:'click'}));await f.c.stop();
  assert.equal((await f.c.openTarget({browserId:f.live.browserId,url:'about:blank'})).error.code,'CONTROL_STOPPED');
  assert.equal(f.calls.filter(x=>x[0]==='new').length,1);
});

test('browser isolation never bypasses a failed native hardware release',async t=>{
  const f=await fixture(t,{nativeFailure:true});ok(await f.c.selectTarget(f.live));
  assert.equal((await f.c.resume({targetId:f.live.id})).error.code,'RELEASE_FAILED');
  assert.equal((await f.c.act({targetId:f.live.id,action:'click'})).ok,false);assert.deepEqual(f.calls,[]);
});

test('an automatic target fault permits a fresh tab while a failed explicit stop does not',async t=>{
  const f=await fixture(t);ok(await f.c.selectTarget(f.live));ok(await f.c.resume({targetId:f.live.id}));
  const act=f.browser.act;f.browser.act=async()=>{throw Error('uncertain action failure');};
  assert.equal((await f.c.act({targetId:f.live.id,action:'click'})).ok,false);
  f.browser.act=act;ok(await f.c.openTarget({browserId:f.live.browserId}));
  await f.c.stop();assert.equal((await f.c.getState()).state.explicitlyStopped,true);
  assert.equal((await f.c.openTarget({browserId:f.live.browserId})).error.code,'CONTROL_STOPPED');
});

test('a disabled native backend cannot silently erase its persisted hardware obligation',async t=>{
  const dir=await mkdtemp(new URL('missing-native-',root).pathname),live=tab('live');
  await writeFile(join(dir,'controller.json'),JSON.stringify({version:1,targets:[{id:'native:old',backend:'native',identity:{pid:123}}],releasePending:true}));
  const browser={listTargets:async()=>[live],listBrowsers:async()=>[{id:live.browserId}],select:async t=>t,verify:async t=>({valid:true,target:t}),
    observe:async()=>({}),act:async()=>({}),release:async()=>({released:true}),releaseTarget:async()=>({released:true}),close:async()=>{}};
  const c=await createController({dataDir:dir,browser});
  t.after(async()=>{await c.close();await rm(dir,{recursive:true,force:true});});
  ok(await c.selectTarget(live));assert.equal((await c.resume({targetId:live.id})).error.code,'RELEASE_FAILED');
  assert.equal((await c.stop()).error.code,'RELEASE_FAILED');
  assert.equal((await c.getState()).state.releaseErrors[0].backend,'native');
});

test('explicit stopped state survives an unclean restart and still requires explicit resume',async t=>{
  const f=await fixture(t);ok(await f.c.selectTarget(f.live));ok(await f.c.resume({targetId:f.live.id}));await f.c.stop();
  const saved=await readFile(join(f.dir,'controller.json'));
  const dir=await mkdtemp(new URL('stopped-restart-',root).pathname);await writeFile(join(dir,'controller.json'),saved);
  const restarted=await createController({dataDir:dir,browser:f.browser});
  t.after(async()=>{f.browser.release=async()=>({released:true});await restarted.close();await rm(dir,{recursive:true,force:true});});
  assert.equal((await restarted.openTarget({browserId:f.live.browserId})).error.code,'CONTROL_STOPPED');
  ok(await restarted.resume({targetId:f.live.id}));ok(await restarted.act({targetId:f.live.id,action:'click'}));
});

test('partial release receipts are durable even when a sibling cannot release',async t=>{
  const f=await fixture(t);ok(await f.c.selectTarget(f.live));
  f.browser.release=async()=>({released:false,releasedTargetIds:[f.live.id],failures:[{targetId:f.old.id,code:'STALE_TARGET'}]});
  await f.c.stop();const saved=JSON.parse(await readFile(join(f.dir,'controller.json'),'utf8'));
  assert.equal(saved.targets.find(t=>t.id===f.live.id).releaseAcknowledged,true);
  assert.notEqual(saved.targets.find(t=>t.id===f.old.id).releaseAcknowledged,true);
});

async function hostFixture(t) {
  const host=createBrowserHost(),rendererId=randomUUID();
  const {connectionId}=await host.handle('browser/connect',{rendererId});
  const targets=['a','b'].map(id=>({...tab(id),identity:{rendererId,guestId:id},browserId:`dsh:${rendererId}`}));
  const send=(method,args={})=>host.handle('browser/'+method,{rendererId,connectionId,...args});
  await send('publish',{targets});t.after(()=>host.close());
  async function reply(work,respond) {
    const controller=new AbortController();let finished=false;
    const done=Promise.resolve(work).finally(()=>{finished=true;controller.abort();});
    const pump=(async()=>{while(!finished){let poll;try{poll=await host.handle('browser/poll',{rendererId,connectionId},controller.signal);}catch(e){if(finished)return;throw e;}
      for(const command of poll.commands)await send('result',{id:command.id,...respond(command)});}})();
    try{return await done;}finally{await pump;}
  }
  return {host,targets,send,reply};
}

test('sidebar release targets input owners, not broken unrelated page loads',async t=>{
  const {host,targets:[a],reply}=await hostFixture(t);
  await reply(host.backend.act(a,{action:'keyDown',key:'Shift'}),()=>({result:{accepted:true}}));
  const commands=[];
  const result=await reply(host.backend.release({targets:[a]}),command=>{commands.push(command);return command.params.target?.id===a.id
    ?{result:{released:true}}:{error:{message:'ERR_FAILED loading unrelated old page'}};});
  assert.equal(result.released,true);assert.deepEqual(result.releasedTargetIds,[a.id]);assert.equal(commands.length,1);
});

test('confirmed closed sidebar targets cannot be resurrected by another cold release',async t=>{
  const {host,targets:[a],send,reply}=await hostFixture(t);
  await reply(host.backend.act(a,{action:'keyDown',key:'Shift'}),()=>({result:{accepted:true}}));
  await send('disconnect');await host.backend.confirmClosedTargets([a]);
  const result=await host.backend.release({targets:[{...a,cold:true}]});
  assert.equal(result.released,true);assert.deepEqual(result.retiredTargetIds,[a.id]);
});

test('sidebar partial release publishes successful target receipts',async t=>{
  const {host,targets,reply}=await hostFixture(t);
  for(const target of targets)await reply(host.backend.act(target,{action:'keyDown',key:'Shift'}),()=>({result:{accepted:true}}));
  const result=await reply(host.backend.release({targets}),command=>command.params.target?.id==='a'
    ?{result:{released:true}}:{result:{released:false,failures:[{message:'held'}]}});
  assert.equal(result.released,false);assert.deepEqual(result.releasedTargetIds,['a']);
});

test('a failed scoped release of a previously idle binding remains an obligation',async t=>{
  const {host,targets:[a],reply}=await hostFixture(t);
  await reply(host.backend.select(a),()=>({result:a}));
  assert.equal((await reply(host.backend.releaseTarget(a),()=>({result:{released:false}}))).released,false);
  let attempts=0;
  const result=await reply(host.backend.release({targets:[a]}),()=>{attempts++;return {result:{released:false}};});
  assert.equal(result.released,false);assert.equal(attempts,1);assert.deepEqual(result.releasedTargetIds,[]);
});

test('a page marker cleanup failure cannot undo the host input-release receipt',async()=>{
  const element={addEventListener(){},getURL:()=> 'file:///missing.html',getTitle:()=>'',isCrashed:()=>false};
  const driver=createGuestDriver(element,tab('guest'),()=>{},()=>{},()=>{},undefined,async operation=>{
    if(operation==='releaseInput')return {released:true};
    if(operation==='inputMarker')throw Error('ERR_FAILED loading old local page');
    return {};
  });
  const result=await driver.release();assert.equal(result.released,true);assert.equal(result.cleanupErrors.length,1);
});

test('a false host release receipt is rejected without claiming the keys were released',async()=>{
  const element={addEventListener(){},getURL:()=>'',getTitle:()=>'',isCrashed:()=>false};
  const driver=createGuestDriver(element,tab('guest'),()=>{},()=>{},()=>{},undefined,async()=>({released:false,failures:[{key:'Shift'}]}));
  await assert.rejects(driver.release(),{code:'RELEASE_FAILED'});
});

test('target recovery cancellation cannot re-enable control with a late successful receipt',async t=>{
  const f=await fixture(t);ok(await f.c.selectTarget(f.live));
  const gate=Promise.withResolvers(),entered=Promise.withResolvers();
  f.browser.releaseTarget=()=>{entered.resolve();return gate.promise;};
  const recovering=f.c.resume({targetId:f.live.id});await entered.promise;
  const stopping=f.c.stop();gate.resolve({released:true});
  assert.equal((await recovering).error.code,'CONTROL_STOPPED');await stopping;
  assert.equal((await f.c.act({targetId:f.live.id,action:'click'})).error.code,'CONTROL_STOPPED');
});

test('cold release acknowledgement survives read-only calls and pre-dispatch rejection',async t=>{
  const f=await fixture(t);ok(await f.c.selectTarget(f.live));ok(await f.c.resume({targetId:f.live.id}));
  ok(await f.c.act({targetId:f.live.id,action:'getDOM'}));
  assert.equal(JSON.parse(await readFile(join(f.dir,'controller.json'))).targets.find(t=>t.id===f.live.id).releaseAcknowledged,true);
  f.browser.act=async()=>{throw Object.assign(Error('preflight'),{code:'INVALID_ARGUMENT',details:{inputDispatched:false}});};
  await f.c.act({targetId:f.live.id,action:'click'});
  assert.equal(JSON.parse(await readFile(join(f.dir,'controller.json'))).targets.find(t=>t.id===f.live.id).releaseAcknowledged,true);
});

test('confirmation removes extension held targets from later composite release attempts',async()=>{
  const identity={instanceId:'test-instance',browserInstanceId:'test-browser',epoch:'test-epoch',tabId:1,documentId:'document'};
  const target={id:targetId(identity),identity,provider:'extension',backend:'extension',kind:'tab'},releases=[];
  const extension={listTargets:async()=>[target],select:async()=>target,verify:async()=>({valid:true,target}),observe:async()=>({}),
    act:async()=>({accepted:true}),confirmClosedTargets:async()=>({released:true}),
    release:async target=>{releases.push(target?.id);return {released:!target};},close:async()=>{}};
  const composite=createCompositeBrowserBackend({extension});
  await composite.act(target,{action:'keyDown',key:'Shift'});await composite.confirmClosedTargets([target]);
  assert.equal((await composite.release()).released,true);assert.deepEqual(releases,[undefined]);
});

async function extensionFixture(t) {
  const dir=await mkdtemp(new URL('extension-release-',root).pathname),server=createServer();
  const token='synthetic-release-isolation-token',origin='chrome-extension://'+'a'.repeat(32);
  const backend=createExtensionBackend({server,token,dataDir:dir,requestTimeoutMs:1000});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/opencu-extension/v1/`;
  const connection={instanceId:'instance-synthetic',browserInstanceId:'browser-synthetic',epoch:'epoch-synthetic'};
  let sessionId;
  const post=async(route,payload={},signal)=>{
    const response=await fetch(base+route,{method:'POST',signal,headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...connection,sessionId,...payload})});
    const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
  };
  sessionId=(await post('connect',{protocol:1,authorized:true,debuggerConsent:true})).sessionId;
  const tabs=[1,2].map(tabId=>{const identity={...connection,tabId,documentId:'document'};return {id:targetId(identity),identity};});
  async function reply(work,respond) {
    const abort=new AbortController();let done=false;
    const finished=Promise.resolve(work).finally(()=>{done=true;abort.abort();});
    const pump=(async()=>{while(!done){let packet;try{packet=await post('poll',{events:[]},abort.signal);}catch(error){if(done)return;throw error;}
      for(const command of packet.commands)await post('result',{id:command.id,ok:true,result:respond(command)});}})();
    try{return await finished;}finally{await pump;}
  }
  t.after(async()=>{await reply(backend.close(),()=>({released:true}));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  return {backend,tabs,reply};
}

test('authenticated extension bridge isolates failed tab release and retains full-connection protection',async t=>{
  const {backend,tabs:[a,b],reply}=await extensionFixture(t);
  await assert.rejects(reply(backend.release(a),()=>({released:true,tabs:[{released:false}]})),{code:'RELEASE_FAILED'});
  await reply(backend.act(b,{action:'keyDown',key:'Shift'}),()=>({accepted:true}));
  await assert.rejects(backend.act(a,{action:'keyDown',key:'Shift'}),{code:'RELEASE_FAILED'});
  await reply(backend.release(b),()=>({released:true}));
  await assert.rejects(backend.act(a,{action:'keyDown',key:'Shift'}),{code:'RELEASE_FAILED'});
  await reply(backend.release(a),()=>({released:true}));
  await reply(backend.act(a,{action:'keyUp',key:'Shift'}),()=>({accepted:true}));
  const failed=await reply(backend.release(),()=>({released:false}));assert.equal(failed.released,false);
  await reply(backend.release(a),()=>({released:true}));
  await assert.rejects(backend.act(b,{action:'click'}),{code:'RELEASE_FAILED'});
  assert.equal((await reply(backend.release(),()=>({released:true}))).released,true);
});

test('an empty connected browser resumes an explicit stop without touching old occurrences or allocating a tab', async t => {
  const f = await fixture(t);
  f.browser.listTargets = async () => [];
  await f.c.stop();
  assert.equal((await f.c.openTarget({browserId:f.live.browserId})).error.code, 'CONTROL_STOPPED');
  const resumed = ok(await f.c.resume({browserId:f.live.browserId}));
  assert.equal(resumed.state.explicitlyStopped, false);
  assert.equal(resumed.state.releasePending, true);
  assert.equal(resumed.state.recoveryIsolated, true);
  assert.deepEqual(f.calls, []);
  assert.equal(resumed.state.targets.find(target => target.id === f.old.id).verified, false);
  ok(await f.c.openTarget({browserId:f.live.browserId}));
  assert.deepEqual(f.calls, [['new']]);
});

test('browser recovery rejects mixed references, unavailable browsers and unresolved native input', async t => {
  const f = await fixture(t, {nativeFailure:true});
  assert.equal((await f.c.resume({browserId:f.live.browserId, targetId:f.live.id})).error.code, 'INVALID_ARGUMENT');
  assert.equal((await f.c.resume({browserId:'missing'})).error.code, 'AMBIGUOUS_TARGET');
  assert.equal((await f.c.resume({browserId:f.live.browserId})).error.code, 'RELEASE_FAILED');
  assert.deepEqual(f.calls, []);
});

test('automatic interruption remains recoverable, but cannot remove a preceding user stop', async t => {
  const f = await fixture(t);
  await f.c.interrupt();
  assert.equal((await f.c.getState()).state.explicitlyStopped, false);
  ok(await f.c.openTarget({browserId:f.live.browserId}));
  await f.c.stop(); await f.c.interrupt();
  assert.equal((await f.c.getState()).state.explicitlyStopped, true);
  assert.equal((await f.c.openTarget({browserId:f.live.browserId})).error.code, 'CONTROL_STOPPED');
});

test('a browser disappearing during recovery cannot grant control', async t => {
  const f = await fixture(t);
  let reads = 0;
  f.browser.listBrowsers = async () => ++reads === 1 ? [{id:f.live.browserId}] : [];
  assert.equal((await f.c.resume({browserId:f.live.browserId})).error.code, 'AMBIGUOUS_TARGET');
  assert.notEqual((await f.c.getState()).state.mode, 'active');
  assert.deepEqual(f.calls, []);
});

test('stop wins over an in-flight browser-only resume', async t => {
  const f = await fixture(t);
  const entered = Promise.withResolvers(), gate = Promise.withResolvers();
  let reads = 0;
  f.browser.listBrowsers = async () => { if (++reads === 2) { entered.resolve(); await gate.promise; } return [{id:f.live.browserId}]; };
  const recovering = f.c.resume({browserId:f.live.browserId});
  await entered.promise;
  const stopped = f.c.stop(); gate.resolve();
  assert.equal((await recovering).error.code, 'CONTROL_STOPPED');
  await stopped;
  assert.equal((await f.c.getState()).state.explicitlyStopped, true);
});

test('a failed browser occurrence cannot disable healthy peers or allocate/replay input during recovery', async t => {
  const f = await fixture(t);
  ok(await f.c.resume({browserId:f.live.browserId}));
  const peer = {...tab('peer')};
  f.browser.listTargets = async () => [f.live, peer];
  ok(await f.c.selectTarget(f.live)); ok(await f.c.resume({targetId:f.live.id}));
  ok(await f.c.selectTarget(peer)); ok(await f.c.resume({targetId:peer.id}));
  f.browser.act = async (target, action) => {
    f.calls.push(['dispatch',target.id,action.action]);
    if (target.id === f.live.id) throw Error('Synthetic uncertain target failure');
    return {};
  };
  f.browser.releaseTarget = async target => ({released:target.id !== f.live.id});
  assert.equal((await f.c.act({targetId:f.live.id,action:'click'})).error.code,'RELEASE_FAILED');
  ok(await f.c.act({targetId:peer.id,action:'click'}));
  assert.equal((await f.c.act({targetId:f.live.id,action:'click'})).error.code,'RECOVERY_REQUIRED');
  const before = f.calls.length;
  f.browser.newTab = async () => { throw Error('Synthetic creation failure'); };
  assert.equal((await f.c.openTarget({browserId:f.live.browserId})).ok,false);
  ok(await f.c.act({targetId:peer.id,action:'click'}));
  assert.equal(f.calls.length,before+1);
  assert.equal(f.calls.filter(call=>call[0]==='dispatch'&&call[1]===f.live.id).length,1,'uncertain input is never replayed');
  assert.equal((await f.c.getState()).state.targets.find(target=>target.id===peer.id).verified,true);
});

test('a new explicit stop wins over delayed closed-connection confirmation', async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), gate = Promise.withResolvers();
  f.browser.confirmClosedTargets = async () => { entered.resolve(); await gate.promise; return {released:true}; };
  const state = (await f.c.getState()).state;
  const recovery = f.c.recoverClosedTargets({targetIds:[f.old.id], expectedReleaseErrors:JSON.stringify(state.releaseErrors)});
  await entered.promise;
  const stopped = f.c.stop(); gate.resolve();
  assert.equal((await recovery).error.code,'CONTROL_STOPPED');
  await stopped;
  assert.equal((await f.c.getState()).state.explicitlyStopped,true);
  assert.equal((await f.c.openTarget({browserId:f.live.browserId})).error.code,'CONTROL_STOPPED');
});
