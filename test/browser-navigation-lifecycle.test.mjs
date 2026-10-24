import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {recoverableActionError} from '../src/protocol.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture() {
  const element=new EventEmitter(),calls=[];
  element.addEventListener=element.on.bind(element);element.removeEventListener=element.off.bind(element);
  Object.assign(element,{getURL:()=> 'https://fixture.test/',getTitle:()=> 'Fixture',isCrashed:()=>false,
    canGoBack:()=>true,canGoForward:()=>true,loadURL:()=>{},goBack:()=>{},goForward:()=>{},reload:()=>{},stop:()=>{}});
  const driver=createGuestDriver(element,{},()=>{},()=>{},()=>{},undefined,async(operation,args)=>{
    calls.push({operation,args});
    if(operation==='getDialog')return {};
    if(operation==='releaseInput')return {released:true};
    if(operation==='closedState')return {closed:false};
    if(operation==='navigationState')return {url:element.getURL(),documentId:'document',navigationId:'1',readyState:'complete'};
    return {};
  });
  return {element,driver,calls};
}

for(const action of ['navigate','back','forward','reload'])test(`${action} waits for the main document and ignores unrelated stop/subframe events`,async()=>{
  const f=fixture();let settled=false;
  const pending=f.driver.act({action,url:'https://fixture.test/next'}).then(value=>{settled=true;return value;});
  await tick();
  f.element.emit('did-stop-loading',{});
  f.element.emit('did-navigate-in-page',{isMainFrame:false});
  f.element.emit('did-start-navigation',{isMainFrame:false});
  f.element.emit('dom-ready',{});await tick();assert.equal(settled,false);
  f.element.emit('did-start-navigation',{isMainFrame:true});
  f.element.emit('did-navigate-in-page',{isMainFrame:false});await tick();assert.equal(settled,false);
  f.element.emit('dom-ready',{});assert.equal((await pending).action,action);
  for(const event of ['did-start-navigation','did-stop-loading','did-fail-load'])assert.equal(f.element.listenerCount(event),0);
});

test('a main-frame same-document history traversal completes without a new-document event',async()=>{
  const f=fixture(),pending=f.driver.act({action:'back'});await tick();
  f.element.emit('did-navigate-in-page',{isMainFrame:true});await pending;
  assert.equal(f.element.listenerCount('did-start-navigation'),0);
});

test('navigation timeout settles and releases before the original target can be observed or navigate again',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(),pending=f.driver.act({action:'navigate',url:'https://fixture.test/slow'});
  const rejected=assert.rejects(pending,error=>{
    assert.equal(error.code,'NAVIGATION_TIMEOUT');assert.equal(error.details.inputDispatched,true);
    assert.equal(error.details.navigationSettled,true);assert.deepEqual(error.details.release,{released:true});
    assert.equal(recoverableActionError(error,'navigate'),true);return true;
  });
  await tick();t.mock.timers.tick(25000);await rejected;
  assert(f.calls.some(call=>call.operation==='releaseInput'));
  f.element.emit('did-navigate',{isMainFrame:true});f.element.emit('dom-ready',{});
  assert.equal((await f.driver.act({action:'navigationState'})).value.readyState,'complete');
  const next=f.driver.act({action:'reload'});await tick();f.element.emit('did-navigate-in-page',{isMainFrame:true});await next;
});

test('navigation cancellation and unknown failures never acquire a recoverable timeout receipt',async()=>{
  const f=fixture(),pending=f.driver.act({action:'reload'});
  const rejected=assert.rejects(pending,error=>error.code==='CONTROL_STOPPED' && error.details.inputDispatched===true && !recoverableActionError(error,'reload'));
  await tick();await f.driver.release();await rejected;
  f.element.loadURL=()=>{throw Error('transport lost after dispatch');};
  await assert.rejects(f.driver.act({action:'navigate',url:'https://fixture.test/next'}),error=>error.details.inputDispatched===true && !error.details.navigationSettled && !recoverableActionError(error,'navigate'));
  for(const details of [{inputDispatched:true},{inputDispatched:false,navigationSettled:true,release:{released:true}},
    {inputDispatched:true,navigationSettled:true,release:{released:false}}, {inputDispatched:true,navigationSettled:true}])
    assert.equal(recoverableActionError({code:'NAVIGATION_TIMEOUT',details},'navigate'),false);
  assert.equal(recoverableActionError({code:'NAVIGATION_TIMEOUT',details:{inputDispatched:true,navigationSettled:true,release:{released:true}}},'click'),false);
});

test('guest final click navigation reports a fresh-observation requirement, while the first double-click stops',async()=>{
  for(const [action,at,success] of [['click',1,true],['doubleClick',2,true],['doubleClick',1,false]]){
    const f=fixture();let ups=0;const automate=f.calls;
    const driver=createGuestDriver(f.element,{},()=>{},()=>{},()=>{},undefined,async(operation,args)=>{
      automate.push({operation,args});
      if(operation==='input'&&args.type==='mouseUp'&&++ups===at)f.element.emit('did-navigate',{});
      if(operation==='navigationState')return {documentId:'1'};
      return {};
    });
    const work=driver.act({action,coordinateSpace:'css',x:10,y:10});
    if(success)assert.equal((await work).observationRequired,true);
    else await assert.rejects(work,{code:'STALE_ELEMENT'});
    assert.equal(ups,at);
  }
});

test('successful navigation observation fences belong to one target and survive state reads and other-target observation',async t=>{
  const {createController}=await import('../src/core/controller.mjs');
  const {mkdir,mkdtemp,rm}=await import('node:fs/promises');
  const parent=new URL('../.local/',import.meta.url);await mkdir(parent,{recursive:true});
  const dataDir=await mkdtemp(new URL('navigation-controller-',parent).pathname);
  const targets=['first','second'].map(id=>({id,backend:'browser',kind:'tab',identity:{id}}));
  let navigated=false;
  const backend={listTargets:async()=>targets,select:async target=>target,verify:async target=>({valid:true,target}),
    observe:async()=>({ax:{nodes:[]}}),act:async(target,args)=>({target:targets.find(item=>item.id===target.id),
      ...(args.action==='navigationState'?{value:{url:'https://fixture.test/',documentId:'2',readyState:'complete'}}:
        !navigated?(navigated=true,{observationRequired:true}):{})}),release:async()=>({released:true}),close:async()=>{}};
  const controller=await createController({dataDir,browser:backend});t.after(async()=>{await controller.close();await rm(dataDir,{recursive:true,force:true});});
  for(const target of targets)assert.equal((await controller.selectTarget({id:target.id})).ok,true);
  assert.equal((await controller.act({targetId:'first',action:'click'})).result.observationRequired,true);
  await controller.getState();assert.equal((await controller.act({targetId:'first',action:'navigationState'})).ok,true);
  assert.equal((await controller.observe({targetId:'second',format:'ax'})).ok,true);
  assert.equal((await controller.act({targetId:'first',action:'click'})).error.code,'OBSERVATION_REQUIRED');
  assert.equal((await controller.act({targetId:'second',action:'click'})).ok,true);
  assert.equal((await controller.observe({targetId:'first',format:'ax'})).ok,true);
  assert.equal((await controller.act({targetId:'first',action:'click'})).ok,true);
});
