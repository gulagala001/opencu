import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import {createController} from '../src/core/controller.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {createComputerRepl} from '../src/dsh/computer-repl.mjs';
import {createInputReleaseState} from '../src/dsh/input-release.mjs';
import {createCompositeBrowserBackend} from '../src/browser/composite.mjs';
import {inputFrameFailure} from '../extension/input-monitor.js';

// Real controller, REPL and guest driver; DOM/CDP is the synthetic boundary.
async function fixture(t) {
  const root = new URL('../.local/', import.meta.url); await mkdir(root, {recursive:true});
  const dataDir = await mkdtemp(new URL('interaction-recovery-',root).pathname);
  const viewport = {width:1100,height:800,scrollX:0,scrollY:0}, events = [], hooks = {};
  const target = {id:'tab:original',kind:'tab',backend:'browser',provider:'dsh',browserId:'browser:original',
    title:'Fixture',url:'https://fixture.invalid/',identity:{occurrence:'original'}};
  let observation = 0, releases = 0, targetReleases = 0;
  const element = {addEventListener(){},getURL:()=>target.url,getTitle:()=>target.title,isCrashed:()=>false};
  const driver = createGuestDriver(element,target,()=>{},()=>{},()=>{},async()=>({
    toDataURL:()=> 'data:image/png;base64,eA==',getSize:()=>({width:viewport.width,height:viewport.height}),
  }),async (operation,args) => {
    if (operation==='observe') return {observationId:String(++observation),documentId:'original',url:target.url,
      viewport:{...viewport},ax:{nodes:[]}};
    if (operation==='pageState') return {documentId:'original',url:target.url,...viewport};
    if (operation==='getDialog') return {dialog:null};
    if (operation==='navigationState') return {documentId:'0',url:target.url};
    if (operation==='inputMarker') return {};
    if (operation==='input') { events.push(args.type); return {dispatched:true}; }
    if (operation==='releaseInput') return {released:true};
    if (['cancelUpload','cancelSiteTool'].includes(operation)) return {};
    throw Error('Unexpected adapter operation: '+operation);
  });
  const backend = {listTargets:async()=>[target],select:async()=>target,verify:async()=>({valid:true,target}),
    observe:(_target,args)=>driver.observe(args),focus:async()=>({focused:true}),
    act:(_target,args)=>{if(hooks.error)throw hooks.error;return driver.act(args);},
    releaseTarget:async()=>{targetReleases++;return hooks.releaseFailure ? {released:false,failures:[{message:'unconfirmed input'}]} : driver.release();},
    release:async()=>{releases++;return hooks.releaseFailure ? {released:false,failures:[{message:'unconfirmed input'}]} : driver.release();},
    close:async()=>{}};
  const controller = await createController({dataDir,browser:backend});
  const names = {state:'getState',targets:'listTargets',select:'selectTarget'};
  const repl = createComputerRepl(async (endpoint,args={})=>{
    const result = await controller[names[endpoint]??endpoint](endpoint==='select' ? args.reference : args);
    if(result.observation?.screenshot){
      const shot=result.observation.screenshot;
      result.image=shot.image={attachmentId:'synthetic-'+observation,width:shot.width,height:shot.height};
    }
    return result;
  });
  t.after(async()=>{hooks.error=undefined;hooks.releaseFailure=false;await repl.close();await controller.close();await rm(dataDir,{recursive:true,force:true});});
  const run=code=>repl.run({code});
  await run('var tab = await cua.getTab("tab:original"); await tab.getScreenshot();');
  return {controller,repl,run,viewport,events,hooks,get releases(){return releases;},get targetReleases(){return targetReleases;}};
}

for (const [change,update] of [['expand preview',view=>{view.width=640;}],['scroll page',view=>{view.scrollY=300;}]]) {
  test(`${change}: stale screenshot preserves the same binding and resumes after observing`,async t=>{
    const f=await fixture(t);update(f.viewport);
    await assert.rejects(f.run('await tab.click([60,40]);'),error=>{
      assert.equal(error.code,'STALE_SCREENSHOT');assert.equal(error.details.control.mode,'active');
      assert.match(error.details.control.recovery,/binding.*retained|existing binding/);return true;
    });
    const state=(await f.controller.getState()).state;
    assert.equal(state.mode,'active');assert.equal(state.targets[0].verified,true);
    assert.deepEqual(f.events,[]);assert.equal(f.releases,0);
    await f.run('await tab.getScreenshot(); await tab.click([60,40]);');
    assert.deepEqual(f.events,['mouseMove','mouseDown','mouseUp']);
  });
}

test('pre-dispatch recovery covers changed geometry, focus, stale elements and action aliases',async t=>{
  const f=await fixture(t);
  for(const [action,code] of [
    ['mouse_down','STALE_SCREENSHOT'],['scroll','SCROLL_POINT_REQUIRED'],['press_key','TARGET_WINDOW_NOT_ACTIVE'],
    ['type_text','BACKGROUND_KEYBOARD_UNAVAILABLE'],['selectOption','STALE_ELEMENT'],['upload','FRAME_DETACHED'],
    ['getDOM','STALE_ELEMENT'],['drag','INVALID_COORDINATES'],['click','ELEMENT_NOT_VISIBLE'],
    ['hitTest','BACKGROUND_HIT_TEST_UNAVAILABLE'],['press','INPUT_ALREADY_HELD'],
    ['set_value','AX_VALUE_NOT_SETTABLE'],['click','RECOVERY_REQUIRED'],['upload','ENOENT'],
  ]){
    f.hooks.error=Object.assign(Error(code),{code,details:{inputDispatched:false}});
    const result=await f.controller.act({targetId:'tab:original',action});
    assert.equal(result.error.code,code);assert.equal(result.state.mode,'active',action+' '+code);
    await f.controller.observe({targetId:'tab:original',format:'screenshot'});
  }
  assert.equal(f.releases,0);
});

for(const [reason,code,details] of [
  ['unknown dispatch','STALE_SCREENSHOT',{}],
  ['changed identity','TARGET_IDENTITY_CHANGED',{inputDispatched:false}],
  ['unconfirmed release','STALE_ELEMENT',{inputDispatched:false,release:{released:false}}],
])test(`${reason} still blocks further input`,async t=>{
  const f=await fixture(t);f.hooks.error=Object.assign(Error(code),{code,details});
  const result=await f.controller.act({targetId:'tab:original',action:'click'});
  assert.equal(result.state.mode,'active');assert.equal(f.releases,0);assert.equal(result.state.targets[0].verified,false);
  assert.equal((await f.controller.act({targetId:'tab:original',action:'click'})).error.code,'RECOVERY_REQUIRED');
});

test('a human view change during input releases only that target and requires a fresh observation',async t=>{
  const f=await fixture(t);
  f.hooks.error=Object.assign(Error('viewport changed during pointer movement'),{code:'STALE_SCREENSHOT',details:{inputDispatched:true}});
  await assert.rejects(f.run('await tab.click([60,40]);'),error=>{
    assert.equal(error.details.control.mode,'active');assert.equal(error.details.observationRequired,true);
    assert.equal(error.details.release.released,true);return true;
  });
  assert.equal(f.targetReleases,1);assert.equal(f.releases,0);
  f.hooks.error=undefined;
  await assert.rejects(f.run('await tab.click([60,40]);'),{code:'OBSERVATION_REQUIRED'});
  await f.run('await tab.getScreenshot(); await tab.click([60,40]);');
  assert.deepEqual(f.events,['mouseMove','mouseDown','mouseUp']);
});

test('view-change recovery never continues while target input release is unconfirmed',async t=>{
  const f=await fixture(t);f.hooks.releaseFailure=true;
  f.hooks.error=Object.assign(Error('focus moved'),{code:'TARGET_WINDOW_NOT_ACTIVE',details:{inputDispatched:true}});
  const result=await f.controller.act({targetId:'tab:original',action:'press'});
  assert.equal(result.error.code,'RELEASE_FAILED');assert.equal(result.state.releasePending,true);
  assert.equal(result.state.mode,'active');assert.equal(result.state.targets[0].verified,false);
});

test('explicit stop remains stopped after a fresh observation',async t=>{
  const f=await fixture(t);await f.controller.stop();
  await f.controller.observe({targetId:'tab:original',format:'screenshot'});
  assert.equal((await f.controller.act({targetId:'tab:original',action:'click'})).error.code,'CONTROL_STOPPED');
});

test('target recovery leaves other tabs usable and survives reselection and restart',async t=>{
  const dataDir=await mkdtemp(new URL('../.local/interaction-isolation-',import.meta.url).pathname);
  const targets=['a','b'].map(id=>({id,kind:'tab',backend:'browser',provider:'dsh',identity:{tab:id}}));
  const released=[],actions=[];let failA=true,failObservation=false;
  const backend={listTargets:async()=>targets,select:async target=>targets.find(item=>item.id===target.id),
    verify:async target=>({valid:true,target:targets.find(item=>item.id===target.id)}),
    observe:async()=>{if(failObservation)throw Error('read unavailable');return {ax:{nodes:[]}};},
    act:async target=>{if(target.id==='a'&&failA)throw Object.assign(Error('view moved'),{code:'STALE_SCREENSHOT',details:{inputDispatched:true}});actions.push(target.id);return {};},
    releaseTarget:async target=>{released.push(target.id);return {released:true};},
    release:async()=>({released:true}),close:async()=>{}};
  const open=()=>createController({dataDir,browser:createCompositeBrowserBackend({dsh:backend})});
  let controller=await open();
  t.after(async()=>{await controller.close();await rm(dataDir,{recursive:true,force:true});});
  for(const target of targets)assert.equal((await controller.selectTarget(target)).ok,true);
  const failure=await controller.act({targetId:'a',action:'click'});failA=false;
  assert.equal(failure.state.mode,'active');assert.deepEqual(failure.error.details.releasedTargetIds,['a']);
  assert.deepEqual(released,['a']);
  assert.equal((await controller.act({targetId:'b',action:'click'})).ok,true);
  await controller.selectTarget(targets[0]);
  assert.equal((await controller.act({targetId:'a',action:'click'})).error.code,'OBSERVATION_REQUIRED');
  await controller.close();controller=await open();
  assert.equal((await controller.resume({targetId:'a'})).ok,true);
  assert.equal((await controller.act({targetId:'a',action:'click'})).error.code,'OBSERVATION_REQUIRED');
  failObservation=true;assert.equal((await controller.observe({targetId:'a'})).ok,false);
  assert.equal((await controller.act({targetId:'a',action:'click'})).error.code,'OBSERVATION_REQUIRED');
  failObservation=false;assert.equal((await controller.observe({targetId:'a'})).ok,true);
  assert.equal((await controller.act({targetId:'a',action:'click'})).ok,true);
  assert.deepEqual(actions,['b','a']);
});

test('native release receipts cover the helper hardware stream, including pre-dispatch rejection',async t=>{
  const dataDir=await mkdtemp(new URL('../.local/interaction-native-',import.meta.url).pathname);
  const targets=['a','b'].map(id=>({id,backend:'native',identity:{window:id}}));
  const backend={listTargets:async()=>targets,select:async target=>target,verify:async target=>({valid:true,target}),observe:async()=>({}),
    act:async()=>{throw Object.assign(Error('unavailable'),{code:'BACKGROUND_KEYBOARD_UNAVAILABLE',details:{inputDispatched:false,release:{released:true}}});},
    release:async()=>({released:true}),close:async()=>{}};
  const controller=await createController({dataDir,browser:false,native:backend});
  t.after(async()=>{await controller.close();await rm(dataDir,{recursive:true,force:true});});
  for(const target of targets)assert.equal((await controller.selectTarget(target)).ok,true);
  const result=await controller.act({targetId:'b',action:'keyDown',key:'Shift'});
  assert.equal(result.state.mode,'active');assert.deepEqual(result.error.details.releasedTargetIds,['a','b']);
});

test('native modal rejection preserves the binding for sheet dismissal and document input',async t=>{
  const dataDir=await mkdtemp(new URL('../.local/interaction-modal-',import.meta.url).pathname);
  const target={id:'native:fixture:window:1',backend:'native',platform:'darwin',windowId:1,identity:{window:1}};
  const events=[];let sheetOpen=true,rejection='MODAL_BLOCKED';
  const backend={listTargets:async()=>[target],select:async()=>target,verify:async()=>({valid:true,target}),
    observe:async()=>({ax:{nodes:[{id:sheetOpen?2:1,role:'AXButton',name:sheetOpen?'Cancel':'Save'}]}}),
    act:async(_target,action)=>{
      if(sheetOpen&&action.elementId===1)throw Object.assign(Error(rejection),{code:rejection,details:{inputDispatched:false,release:{released:true}}});
      if(action.elementId===2){sheetOpen=false;events.push('cancel');}
      else events.push('save');
      return {inputDispatched:true};
    },release:async()=>({released:true}),close:async()=>{}};
  const controller=await createController({dataDir,browser:false,native:backend});
  t.after(async()=>{await controller.close();await rm(dataDir,{recursive:true,force:true});});
  assert.equal((await controller.selectTarget(target)).ok,true);
  for(const code of ['MODAL_BLOCKED','MODAL_STATE_UNAVAILABLE','MODAL_POINTER_UNAVAILABLE','MODAL_CAPTURE_UNAVAILABLE']){
    sheetOpen=true;rejection=code;
    const rejected=await controller.act({targetId:target.id,action:'click',elementId:1});
    assert.equal(rejected.error.code,code);assert.equal(rejected.state.mode,'active');
    assert.deepEqual(rejected.error.details.releasedTargetIds,[target.id]);
    assert.equal((await controller.observe({targetId:target.id,format:'ax'})).ok,true);
    assert.equal((await controller.act({targetId:target.id,action:'click',elementId:2})).ok,true);
    assert.equal((await controller.observe({targetId:target.id,format:'ax'})).ok,true);
    assert.equal((await controller.act({targetId:target.id,action:'click',elementId:1})).ok,true);
  }
  assert.deepEqual(events,['cancel','save','cancel','save','cancel','save','cancel','save']);
});

for(const code of ['MODAL_BLOCKED','MODAL_STATE_UNAVAILABLE','MODAL_POINTER_UNAVAILABLE']){
  for(const [reason,details] of [['dispatched',{inputDispatched:true,release:{released:true}}],['unreleased',{inputDispatched:false,release:{released:false}}]]){
    test(`native ${code} ${reason} still blocks input`,async t=>{
      const f=await fixture(t);f.hooks.error=Object.assign(Error(code),{code,details});
      const result=await f.controller.act({targetId:'tab:original',action:'click'});
      assert.equal(result.state.mode,'active');assert.equal(result.state.targets[0].verified,false);
      assert.equal((await f.controller.act({targetId:'tab:original',action:'click'})).error.code,'RECOVERY_REQUIRED');
    });
  }
}

test('target release clears its held-input debt without forgetting other tabs or accepting late receipts',async()=>{
  const state=createInputReleaseState(),down=targetId=>({targetId,action:'keyDown',key:'Shift'});
  const ack=async()=>({ok:true,result:{inputDispatched:true}});
  await state.request('act',down('a'),ack);await state.request('act',down('b'),ack);
  const gate=Promise.withResolvers(),late=state.request('act',down('a'),()=>gate.promise);
  await state.request('act',{targetId:'a',action:'click'},async()=>({ok:false,error:{code:'STALE_SCREENSHOT',details:{
    inputDispatched:true,release:{released:true},releasedTargetIds:['a']}},state:{mode:'active'}}));
  gate.resolve(await ack());await late;
  assert.equal(state.pending,true,'tab b still holds its key');
  await state.request('act',{targetId:'b',action:'keyUp',key:'Shift'},ack);
  assert.equal(state.pending,false,'the old tab a receipt cannot recreate released input');
});

test('scoped recovery acknowledges only its own held and uncertain inputs',async()=>{
  const state=createInputReleaseState(),ack=async()=>({ok:true,result:{inputDispatched:true}});
  await state.request('act',{targetId:'a',action:'keyDown',key:'Shift'},ack);
  await state.request('act',{targetId:'b',action:'click'},async()=>({ok:false,error:{code:'RELEASE_FAILED'}}));
  const recovered=id=>async()=>({ok:true,release:{released:true},releasedTargetIds:[id],state:{mode:'active',releasePending:true,recoveryIsolated:true}});
  await state.request('resume',{targetId:'a'},recovered('a'));
  assert.equal(state.pending,true,'the uncertain input on b is still owed');
  await state.request('resume',{targetId:'b'},recovered('b'));
  assert.equal(state.pending,false,'unrelated historical targets are not input owned by this session');
  const gate=Promise.withResolvers(),late=state.request('act',{targetId:'c',action:'click'},()=>gate.promise);
  await state.request('resume',{targetId:'c'},recovered('c'));
  gate.resolve({ok:false,error:{code:'RELEASE_FAILED'}});await late;
  assert.equal(state.pending,false,'a late error cannot restore an acknowledged target obligation');
});

test('failed recovery without input does not create a new cleanup obligation',async()=>{
  const state=createInputReleaseState();
  await state.request('resume',{targetId:'a'},async()=>({ok:false,error:{code:'RELEASE_FAILED'},state:{mode:'release_failed',releasePending:true}}));
  assert.equal(state.pending,false);
});

test('full recovery clears a failed global release but scoped recovery cannot erase it',async()=>{
  const state=createInputReleaseState();
  await state.request('stop',{},async()=>({ok:false,error:{code:'RELEASE_FAILED'}}));
  await state.request('resume',{targetId:'a'},async()=>({ok:true,release:{released:true},releasedTargetIds:['a'],state:{releasePending:true}}));
  assert.equal(state.pending,true);
  await state.request('resume',{targetId:'a'},async()=>({ok:true,release:{released:true},releasedTargetIds:['a'],state:{releasePending:false,releaseErrors:[]}}));
  assert.equal(state.pending,false);
});

test('isolated continuation retires a failed stop retry while keeping other owned input',async()=>{
  const state=createInputReleaseState();
  await state.request('act',{targetId:'b',action:'keyDown',key:'Shift'},async()=>({ok:true}));
  await state.request('stop',{},async()=>({ok:false,error:{code:'RELEASE_FAILED'}}));
  const receipt=id=>async()=>({ok:true,release:{released:true},releasedTargetIds:[id],state:{mode:'active',releasePending:true,recoveryIsolated:true}});
  await state.request('resume',{targetId:'a'},receipt('a'));
  assert.equal(state.pending,true,'unreleased key on b still belongs to this session');
  await state.request('resume',{targetId:'b'},receipt('b'));
  assert.equal(state.pending,false,'old quarantined browser debts stay in the controller');
});


test('native site tool terminal errors retain the binding without inferring business success',async t=>{
  const f=await fixture(t);
  f.hooks.error=Object.assign(Error('website threw after changing state'),{code:'SITE_TOOL_ERROR',details:{inputDispatched:true,effectVerified:false,siteToolResponded:true}});
  const result=await f.controller.act({targetId:'tab:original',action:'invokeSiteTool'});
  assert.equal(result.error.code,'SITE_TOOL_ERROR');assert.equal(result.error.details.inputDispatched,true);assert.equal(result.error.details.effectVerified,false);
  assert.equal(result.state.mode,'active');assert.equal(result.state.targets[0].verified,true);assert.equal(f.releases,0);
  f.hooks.error=undefined;await f.run('await tab.getScreenshot(); await tab.click([60,40]);');
  assert.deepEqual(f.events,['mouseMove','mouseDown','mouseUp']);
});

test('site tool document changes release that target and require observation before continuing',async t=>{
  const f=await fixture(t);
  f.hooks.error=Object.assign(Error('site tool document navigated'),{code:'SITE_TOOL_CONTEXT_CHANGED',details:{inputDispatched:true,effectVerified:false}});
  const result=await f.controller.act({targetId:'tab:original',action:'invokeSiteTool'});
  assert.equal(result.error.code,'SITE_TOOL_CONTEXT_CHANGED');assert.equal(result.state.mode,'active');assert.equal(result.error.details.observationRequired,true);
  assert.equal(result.error.details.inputDispatched,true);assert.equal(result.error.details.effectVerified,false);
  assert.equal(f.targetReleases,1);assert.equal(f.releases,0);
  f.hooks.error=undefined;assert.equal((await f.controller.act({targetId:'tab:original',action:'siteTools'})).error.code,'OBSERVATION_REQUIRED');
  await f.run('await tab.getScreenshot(); await tab.click([60,40]);');
  assert.deepEqual(f.events,['mouseMove','mouseDown','mouseUp']);
});

for(const [reason,action,code,details] of [
  ['missing terminal receipt','invokeSiteTool','SITE_TOOL_ERROR',{inputDispatched:true}],
  ['cancelled without terminal receipt','invokeSiteTool','SITE_TOOL_CANCELLED',{inputDispatched:true}],
  ['unrelated operation','click','SITE_TOOL_ERROR',{inputDispatched:true,siteToolResponded:true}],
  ['unknown cancellation','invokeSiteTool','SITE_TOOL_CANCEL_FAILED',{inputDispatched:true,siteToolResponded:true}],
  ['unconfirmed release','invokeSiteTool','SITE_TOOL_ERROR',{inputDispatched:true,siteToolResponded:true,release:{released:false}}],
])test(`site tool ${reason} still blocks unknown or unreleased input`,async t=>{
  const f=await fixture(t);f.hooks.error=Object.assign(Error(reason),{code,details});
  const result=await f.controller.act({targetId:'tab:original',action});
  assert.equal(result.state.mode,'active');assert.equal(f.releases,0);assert.equal(result.state.targets[0].verified,false);
  assert.equal((await f.controller.act({targetId:'tab:original',action:'click'})).error.code,'RECOVERY_REQUIRED');
});


test('proven queued and acknowledged native site tool cancellation preserve active control',async t=>{
  const f=await fixture(t);
  for(const details of [{inputDispatched:false},{inputDispatched:true,effectVerified:false,siteToolResponded:true}]){
    f.hooks.error=Object.assign(Error('site tool invocation timed out'),{code:'SITE_TOOL_CANCELLED',details});
    const result=await f.controller.act({targetId:'tab:original',action:'invokeSiteTool'});
    assert.equal(result.error.code,'SITE_TOOL_CANCELLED');assert.equal(result.state.mode,'active');
    assert.equal(result.error.details.inputDispatched,details.inputDispatched);assert.equal(f.releases,0);
  }
  f.hooks.error=undefined;await f.run('await tab.getScreenshot(); await tab.click([60,40]);');
  assert.deepEqual(f.events,['mouseMove','mouseDown','mouseUp']);
});


test('a confirmed lost input context preserves active bindings after acknowledged release',async t=>{
  const f=await fixture(t);
  f.hooks.error=await inputFrameFailure(Object.assign(Error('Cannot find context with specified id'),{details:{inputDispatched:true}}),{documentChanged:()=>true});
  const result=await f.controller.act({targetId:'tab:original',action:'click'});
  assert.equal(result.error.code,'STALE_ELEMENT');assert.equal(result.state.mode,'active');assert.equal(result.error.details.observationRequired,true);assert.equal(f.targetReleases,1);assert.equal(f.releases,0);
  f.hooks.error=undefined;assert.equal((await f.controller.act({targetId:'tab:original',action:'click'})).error.code,'OBSERVATION_REQUIRED');
  await f.run('await tab.getScreenshot();await tab.click([60,40]);');assert.deepEqual(f.events,['mouseMove','mouseDown','mouseUp']);
});

test('an unknown transport failure quarantines its browser target',async t=>{
  const f=await fixture(t),failure=Object.assign(Error('Transport disconnected'),{details:{inputDispatched:true}});
  f.hooks.error=await inputFrameFailure(failure,{documentChanged:()=>true});assert.equal(f.hooks.error,failure);
  const result=await f.controller.act({targetId:'tab:original',action:'click'});assert.equal(result.state.mode,'active');assert.equal(f.releases,0);assert.equal(result.state.targets[0].verified,false);
});
