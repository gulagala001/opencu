import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createContext, SourceTextModule, SyntheticModule} from 'node:vm';
import {createController} from '../src/core/controller.mjs';
import {createComputerSession} from '../src/dsh/computer.mjs';
import {createComputerRepl} from '../src/dsh/computer-repl.mjs';
import {createInputReleaseState} from '../src/dsh/input-release.mjs';
import {inputReleased} from '../src/protocol.mjs';

const app = {id:'native:handback', backend:'native', kind:'app', name:'Synthetic', identity:{pid:123,windowId:4}};
const old = {id:'tab:orphan', backend:'browser', kind:'tab', identity:{occurrence:'old'}};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t) {
  const parent = new URL('../.local/', import.meta.url); await mkdir(parent,{recursive:true});
  const directory = await mkdtemp(new URL('handback-liveness-',parent).pathname), calls = [], hooks = {}, cleanup = [];
  await writeFile(join(directory,'controller.json'), JSON.stringify({version:1,mode:'release_failed',closed:false,releasePending:true,
    targets:[old],activeTargetId:old.id,releaseErrors:[{backend:'browser',targetId:old.id,released:false}]}));
  const native = {listTargets:async()=>[app],select:async()=>app,verify:async target=>({valid:true,target}),observe:async()=>({ax:{nodes:[]}}),
    focus:async()=>({focused:true}),act:async()=>({inputDispatched:true}),release:async()=>({released:true}),close:async()=>{},
    away:async()=>{calls.push('away'); if(hooks.away) return hooks.away(); return {away:true,release:{released:true}};}};
  const browser = {...native,listTargets:async()=>[],releaseTarget:async()=>({released:false}),
    release:async()=>{calls.push('browser-release');return {released:!!hooks.cleanup};}};
  const controller = await createController({dataDir:directory,native,browser});
  await controller.selectTarget(app); await controller.resume({targetId:app.id});
  const methods = {state:'getState',targets:'listTargets',select:'selectTarget'};
  const request = (endpoint,args={}) => {calls.push(endpoint);return controller[methods[endpoint]??endpoint](endpoint==='select'?args.reference:args);};
  t.after(async()=>{hooks.cleanup=true;for(const close of cleanup)await close();await controller.close();await rm(directory,{recursive:true,force:true});});
  return {directory,controller,native,hooks,calls,request,cleanup};
}

async function sharedFixture(t) {
  const f = await fixture(t), handlers = new Map(), computers = [];
  let provided = true, brokerClosed = false;
  const noop = () => {}, close = async () => {};
  const runtime = {dataDir:f.directory,started:()=>true,forgetSession:noop,
    request:(method,args,context)=>{if(method==='focus')context.onControlStart?.(app);return method==='away'?f.controller.away(args,{isCurrent:context.handBackGuard}):f.request(method,args);},
    close:async()=>{f.calls.push('runtime-close');if(f.hooks.runtimeClose)await f.hooks.runtimeClose();const result=await f.controller.close();if(result.ok===false)throw Object.assign(Error(result.error.message),result.error);return result;}};
  const boundaries = {
    '@deepseek-ai/cordis':{Context:{is:()=>false,isolate:Symbol('scope')}},'@deepseek-ai/dsh-scope':{createScope:noop,scopeOf:noop},
    './runtime.mjs':{createPluginRuntime:()=>runtime},'./tools.mjs':{installToolDefinitions:noop},'./config.mjs':{publicConfig:value=>value},
    './computer.mjs':{createComputerSession:request=>{const computer=createComputerSession(request);computers.push(computer);return computer;}},
    './activity.mjs':{createActivityFeed:()=>({begin:noop,finish:noop,sessionEvent:noop,forget:noop,close:noop})},
    './browser-host.mjs':{createBrowserHost:()=>({backend:{},listBrowsers:()=>[],close:()=>{brokerClosed=true;}})},
    './presentation.mjs':{createPresentationHost:()=>({snapshot:()=>({}),close:async()=>{f.calls.push('presentation-close');await f.hooks.presentationClose?.();}})},
    './preferences.mjs':{createPreferences:()=>({close:async()=>{f.calls.push('preferences-close');await f.hooks.preferencesClose?.();}})},
    './browser-history.mjs':{createBrowserHistory:()=>({close})},'../extension/distribution.mjs':{registerExtensionDownload:noop},
  };
  const url = new URL('../src/dsh/shared.mjs',import.meta.url), context = createContext({console,Buffer,URL,setTimeout,clearTimeout});
  const source = new SourceTextModule(await readFile(url,'utf8'),{context,initializeImportMeta:meta=>{meta.url=url.href;}});
  await source.link(async name=>{const values=boundaries[name]??await import(name);return new SyntheticModule(Object.keys(values),function(){for(const[key,value]of Object.entries(values))this.setExport(key,value);},{context});});
  await source.evaluate();
  const root={on:(name,handler)=>{handlers.set(name,handler);return()=>handlers.delete(name);},get:noop,provide:()=>()=>{provided=false;},inject:()=>({dispose:close})};root.root=root;
  const lease=source.namespace.acquireOpenCU({root,effect:callback=>callback()});
  const session={id:'synthetic-session'};
  f.cleanup.push(async()=>{f.hooks.runtimeClose=f.hooks.presentationClose=f.hooks.preferencesClose=undefined;await lease.release();});
  return {...f,computers,lease,session,get provided(){return provided;},get brokerClosed(){return brokerClosed;},
    run:code=>lease.request('computer_use',{code,timeoutMs:3000},{sessionKey:session.id}),
    dispose:()=>handlers.get('session/disposed')(session)};
}

test('confirmed hand-back presentation failure keeps healthy targets active with precise native receipts',async t=>{
  const f=await fixture(t);f.hooks.away=()=>{throw Object.assign(Error('compositor unavailable'),{code:'COMPOSITOR_UNAVAILABLE',details:{release:{released:true}}});};
  const result=await f.controller.away({targetId:app.id});
  assert.equal(result.error.code,'COMPOSITOR_UNAVAILABLE');assert.equal(result.state.mode,'active');
  assert.deepEqual(result.error.details.releasedTargetIds,[app.id]);assert.equal(result.state.releasePending,true);
  assert(!f.calls.includes('browser-release'));
});

test('successful hand-back carries precise release receipts without acknowledging browser orphans',async t=>{
  const f=await fixture(t),result=await f.controller.away({targetId:app.id});
  assert.equal(result.ok,true);assert.equal(result.away,true);assert.deepEqual(result.releasedTargetIds,[app.id]);
  assert.equal(result.release.released,true);assert.equal(result.state.releasePending,true);assert.equal(result.state.recoveryIsolated,true);
});

test('session disposal after real Worker hand-back does not retry unrelated orphan releases',async t=>{
  const f=await sharedFixture(t);t.mock.method(console,'error',()=>{});
  await f.run(`var app=await cua.getApp(${JSON.stringify(app.id)}); await app.focus(); await app.keyDown('Shift');`);
  await f.dispose();
  assert.equal(f.calls.filter(value=>value==='away').length,1);
  assert(!f.calls.includes('interrupt'),'the hand-back already released this session input');
  assert.equal((await f.controller.getState()).state.mode,'active');
});

test('last lease starts hardware close while presentation close is pending and retains the broker on failures',async t=>{
  const f=await sharedFixture(t),gate=Promise.withResolvers();f.hooks.cleanup=true;
  f.hooks.presentationClose=()=>gate.promise;f.hooks.runtimeClose=async()=>{throw Error('hardware release failed');};
  f.hooks.preferencesClose=async()=>{throw Error('preference flush failed');};
  const closing=f.lease.release();await pause(30);
  const started=f.calls.includes('runtime-close');
  assert.equal(f.provided,true);assert.equal(f.brokerClosed,false);gate.reject(Error('presentation failed'));
  await assert.rejects(closing,error=>error.errors?.length===3);
  assert.equal(started,true,'presentation must not delay the hardware close');
  assert.equal(f.provided,true);assert.equal(f.brokerClosed,false);
});

for (const release of [undefined,{released:false},{released:true,heldKeys:['Shift']}])
test(`unconfirmed hand-back hardware remains blocked (${JSON.stringify(release)})`,async t=>{
  const f=await fixture(t);f.hooks.away=()=>{throw Object.assign(Error('handoff failed'),{code:'RELEASE_FAILED',details:{release}});};
  const result=await f.controller.away({targetId:app.id});
  assert.equal(result.ok,false);assert.equal(result.error.code,'RELEASE_FAILED');assert.notEqual(result.state.mode,'active');
  assert(f.calls.includes('browser-release'));
});

test('a stop wins over a late successful hand-back receipt',async t=>{
  const f=await fixture(t),entered=Promise.withResolvers(),gate=Promise.withResolvers();
  f.hooks.away=()=>{entered.resolve();return gate.promise;};
  const handback=f.controller.away({targetId:app.id});await entered.promise;
  const stop=f.controller.stop();gate.resolve({away:true,release:{released:true}});
  assert.equal((await handback).error.code,'CONTROL_STOPPED');await stop;
  assert.equal((await f.controller.getState()).state.explicitlyStopped,true);
});

const receipt = (...ids) => ({release:{released:true},releasedTargetIds:ids});
const accepted = async () => ({ok:true,result:{inputDispatched:true}});
test('external receipts retain later input and other targets, and suppress only earlier late completions',async()=>{
  const ledger=createInputReleaseState(),down=id=>({targetId:id,action:'keyDown',key:'Shift'}),gate=Promise.withResolvers();
  await ledger.request('act',down('b'),accepted);
  const late=ledger.request('act',down('a'),()=>gate.promise),checkpoint=ledger.checkpoint();
  assert.equal(ledger.acceptRelease(receipt('a'),checkpoint),true);
  gate.resolve(await accepted());await late;
  await ledger.request('act',{targetId:'b',action:'keyUp',key:'Shift'},accepted);
  assert.equal(ledger.pending,false);
  await ledger.request('act',down('a'),accepted);
  assert.equal(ledger.acceptRelease(receipt('a'),checkpoint),false);
  assert.equal(ledger.pending,true,'an old receipt cannot erase a later same-key acquisition');
  const fresh=ledger.checkpoint();assert.equal(ledger.acceptRelease(receipt('a'),fresh),true);
  assert.equal(ledger.pending,false);
});

test('external receipts cannot acknowledge a global uncertainty, a failed release or a superseded epoch',async()=>{
  const ledger=createInputReleaseState();
  await ledger.request('act',{targetId:'a',action:'keyDown',key:'Shift'},accepted);
  const checkpoint=ledger.checkpoint();
  assert.equal(ledger.acceptRelease({releasedTargetIds:['a'],release:{released:false}},checkpoint),false);
  assert.equal(ledger.pending,true);
  await ledger.request('interrupt',{},accepted);
  await ledger.request('act',{targetId:'a',action:'keyDown',key:'Shift'},accepted);
  assert.equal(ledger.acceptRelease(receipt('a'),checkpoint),false);
  assert.equal(ledger.pending,true);
  await ledger.request('interrupt',{},async()=>({ok:false,error:{code:'RELEASE_FAILED'}}));
  ledger.acceptRelease(receipt('a'),ledger.checkpoint());
  assert.equal(ledger.pending,true,'a scoped hand-back is not proof of global cleanup');
});

for(const [name,createSession]of [['Worker',createComputerSession],['REPL',createComputerRepl]]){
  test(`${name} accepts external native release without interrupting an unrelated orphan on reset`,async t=>{
    const f=await fixture(t),computer=createSession(f.request);f.cleanup.push(()=>computer.close());
    await computer.run({code:`var app=await cua.getApp(${JSON.stringify(app.id)});await app.keyDown('Shift');`,timeoutMs:3000});
    const checkpoint=computer.captureRelease(),result=await f.controller.away({targetId:app.id});
    assert.equal(computer.acceptRelease(result,checkpoint),true);
    await computer.reset();assert(!f.calls.includes('interrupt'));assert.equal((await f.controller.getState()).state.mode,'active');
  });
  test(`${name} ignores external receipts after new input or a binding-generation reset`,async t=>{
    const f=await fixture(t),computer=createSession(f.request);f.cleanup.push(()=>computer.close());
    const binding=`var app=await cua.getApp(${JSON.stringify(app.id)});`;
    await computer.run({code:binding+`await app.keyDown('Shift');`,timeoutMs:3000});
    const checkpoint=computer.captureRelease(),result=await f.controller.away({targetId:app.id});
    await computer.run({code:`await app.keyDown('Control');`,timeoutMs:3000});
    assert.equal(computer.acceptRelease(result,checkpoint),false);
    f.hooks.cleanup=true;await computer.reset();assert(f.calls.includes('interrupt'));
    await f.controller.resume({targetId:app.id});
    await computer.run({code:binding+`await app.keyDown('Shift');`,timeoutMs:3000});
    assert.equal(computer.acceptRelease(result,checkpoint),false,'old worker/repl generation must not clear fresh bindings');
  });
}

test('the production Worker message handler updates the inner REPL release ledger',async t=>{
  const f=await fixture(t),resultGate=Promise.withResolvers();let handler,computer,lastCheckpoint;
  const parentPort={on:(_name,listener)=>{handler=listener;},postMessage:message=>{
    if(message.type==='request'){
      lastCheckpoint=message.releaseCheckpoint;
      void f.request(message.endpoint,message.args).then(result=>handler({type:'response',id:message.id,result}));
    }else if(message.type==='result')resultGate.resolve(message);
  }};
  const url=new URL('../src/dsh/computer-worker.mjs',import.meta.url),context=createContext({});
  const source=new SourceTextModule(await readFile(url,'utf8'),{context});
  await source.link(async name=>{
    const values=name==='node:worker_threads'?{parentPort}:name==='./computer-repl.mjs'
      ?{createComputerRepl:(...args)=>(computer=createComputerRepl(...args))}:await import(new URL(name,url));
    return new SyntheticModule(Object.keys(values),function(){for(const[key,value]of Object.entries(values))this.setExport(key,value);},{context});
  });
  await source.evaluate();f.cleanup.push(()=>computer.close());
  void handler({type:'run',cell:1,args:{code:`var app=await cua.getApp(${JSON.stringify(app.id)});await app.keyDown('Shift');`}});
  assert.equal((await resultGate.promise).error,undefined);
  const result=await f.controller.away({targetId:app.id});
  await handler({type:'external-release',receipt:result,checkpoint:structuredClone(lastCheckpoint)});
  await computer.reset();assert(!f.calls.includes('interrupt'));
});

test('input release confirmation rejects contradictory and malformed nested receipts',()=>{
  for(const value of [
    {released:true,heldKeys:['Shift']},{released:true,heldButtons:['left']},
    {released:[{released:true}],heldKeys:['Shift']},{released:true,tabs:[{released:true,heldButtons:['left']}]},
    {released:true,tabs:[{released:true,tabs:[{released:false}]}]},
    {released:true,failures:[{released:false}]},{released:true,errors:[{heldKeys:['Shift']}]},
    {released:true,heldKeys:{}},{released:true,failures:{}},{released:true,tabs:{}},{released:[]},
  ])assert.equal(inputReleased(value),false,JSON.stringify(value));
  for(const value of [{released:true},{released:true,heldKeys:[],heldButtons:[],failures:[]},
    {released:true,tabs:[{released:true,tabs:[]}]},{released:[{released:true,tabs:[{released:true}]}]}])
    assert.equal(inputReleased(value),true,JSON.stringify(value));
});

test('full runtime shutdown resolves an earlier computer release failure before retiring the lease',async t=>{
  const f=await sharedFixture(t);f.hooks.cleanup=true;
  await f.run(`var app=await cua.getApp(${JSON.stringify(app.id)});await app.focus();await app.keyDown('Shift');`);
  let releases=0;f.native.release=async()=>({released:++releases>1});
  await f.lease.release();
  assert.equal(releases,2);assert.equal(f.provided,false);assert.equal(f.brokerClosed,true);
});

test('failed full shutdown keeps native responsibility and the broker until a real retry succeeds',async t=>{
  const f=await sharedFixture(t);f.hooks.cleanup=true;
  await f.run(`var app=await cua.getApp(${JSON.stringify(app.id)});await app.focus();await app.keyDown('Shift');`);
  f.native.release=async()=>({released:false,heldKeys:['Shift']});
  await assert.rejects(f.lease.release(),error=>error.errors?.some(error=>error.code==='RELEASE_FAILED'));
  assert.equal(f.provided,true);assert.equal(f.brokerClosed,false);
  f.native.release=async()=>({released:true});await f.lease.release();
  assert.equal(f.provided,false);assert.equal(f.brokerClosed,true);
});
