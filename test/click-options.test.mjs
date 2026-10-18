import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clickParameters} from '../extension/click-options.js';
import {actOnPage, releasePage} from '../src/browser/actions.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {createController} from '../src/core/controller.mjs';

test('click modifiers and durations reject invalid/duplicate values before input', () => {
  assert.deepEqual(clickParameters({key:'ctrl+SHIFT+option+cmd',durationMs:10000},{mac:true}).keys,['Control','Shift','Alt','Meta']);
  assert.deepEqual(clickParameters({key:'ControlOrMeta'},{mac:true}).keys,['Meta']);
  assert.deepEqual(clickParameters({key:'ControlOrMeta'},{mac:false}).keys,['Control']);
  for (const options of [{key:'a'},{key:''},{key:'Shift+'},{key:'Ctrl+Control'},{key:'Cmd+Meta'},
    ...[-1,0.5,10001,NaN,Infinity,null,'20',true].map(durationMs=>({durationMs})),{clickCount:3},{mouseButton:'other'}]) {
    assert.throws(()=>clickParameters(options),error=>error.code==='INVALID_ARGUMENT'&&error.details.inputDispatched===false);
  }
});

function pageFixture() {
  const events=[], now=()=>performance.now();
  const record={keys:new Set(),buttons:new Set(),pending:new Set(),session:{async send(){return {};}}};
  record.page={isClosed:()=>false,keyboard:{async down(key){events.push(['keyDown',key,now()]);},async up(key){events.push(['keyUp',key,now()]);}},
    mouse:{async move(){events.push(['move',null,now()]);},async down({button,clickCount}){events.push(['mouseDown',clickCount,now()]);},async up({button,clickCount}){events.push(['mouseUp',clickCount,now(),[...record.keys]]);}}};
  return {record,events,options:{async persistInputs(){}}};
}

test('Playwright click holds each press and modifiers span the entire double click', async () => {
  const {record,events,options}=pageFixture();
  await actOnPage(record,{action:'doubleClick',x:10,y:20,key:'shift',durationMs:25},options);
  assert.deepEqual(events.map(event=>event[0]),['move','keyDown','mouseDown','mouseUp','mouseDown','mouseUp','keyUp']);
  for (const [down,up] of [[events[2],events[3]],[events[4],events[5]]]) assert.ok(up[2]-down[2]>=24);
  assert.equal(record.keys.size+record.buttons.size,0);
  record.keys.add('Control');const count=events.length;
  await assert.rejects(actOnPage(record,{action:'click',x:10,y:20,key:'shift'},options),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
  assert.equal(events.length,count);assert.deepEqual([...record.keys],['Control']);
});

test('Playwright cancellation does not dispatch the next click and journal release clears acquired inputs', async () => {
  const {record,events,options}=pageFixture(), aborter=new AbortController();
  const down=record.page.mouse.down;
  record.page.mouse.down=async args=>{await down(args);setTimeout(()=>aborter.abort(),5);};
  await assert.rejects(actOnPage(record,{action:'doubleClick',x:10,y:20,key:'Shift',durationMs:1000,signal:aborter.signal},options),error=>error.code==='CONTROL_STOPPED');
  assert.equal(events.filter(event=>event[0]==='mouseDown').length,1);
  assert.deepEqual(await releasePage(record,100,{persistInputs:options.persistInputs}),[]);
  assert.deepEqual(events.slice(-2).map(event=>event[0]),['mouseUp','keyUp']);
  assert.deepEqual(events.at(-2)[3],['Shift']);
  assert.equal(record.keys.size+record.buttons.size,0);
});

test('failed mouse release retains modifiers until a later acknowledged mouse-up', async () => {
  const {record,events,options}=pageFixture();
  record.keys.add('Shift');record.buttons.add('left');
  const up=record.page.mouse.up;let fail=true;
  record.page.mouse.up=async args=>{if(fail)throw Error('fixture mouse-up failure');return up(args);};
  const failures=await releasePage(record,100,{persistInputs:options.persistInputs});
  assert.equal(failures.length,1);assert.equal(failures[0].button,'left');
  assert.deepEqual([...record.keys],['Shift']);assert.deepEqual([...record.buttons],['left']);
  assert.deepEqual(events,[]);
  fail=false;
  assert.deepEqual(await releasePage(record,100,{persistInputs:options.persistInputs}),[]);
  assert.deepEqual(events.map(event=>event[0]),['mouseUp','keyUp']);assert.deepEqual(events[0][3],['Shift']);
  assert.equal(record.keys.size+record.buttons.size,0);
});

function guestFixture() {
  const events=[], heldKeys=new Set(),heldButtons=new Set();let onDown;
  const element={addEventListener(){},isCrashed:()=>false,getURL:()=> 'https://fixture.invalid/',getTitle:()=> 'Fixture'};
  const driver=createGuestDriver(element,{sessionId:'fixture'},()=>{},()=>{},undefined,undefined,async(operation,args)=>{
    if(operation==='getDialog')return {};
    if(operation==='releaseInput'){events.push({type:'release'});heldKeys.clear();heldButtons.clear();return {released:true};}
    if(operation==='input'){
      events.push({...args,time:performance.now()});
      if(args.type==='keyDown')heldKeys.add(args.keyCode);if(args.type==='keyUp')heldKeys.delete(args.keyCode);
      if(args.type==='mouseDown'){heldButtons.add(args.button);onDown?.();}if(args.type==='mouseUp')heldButtons.delete(args.button);
    }
    return {};
  });
  return {driver,events,heldKeys,heldButtons,setOnDown(value){onDown=value;}};
}

test('DSH click preserves modifier flags, per-press hold, preflight ownership and cancellation', async () => {
  const f=guestFixture();
  await f.driver.act({action:'doubleClick',x:1,y:1,key:'shift',durationMs:25});
  const inputs=f.events.filter(event=>event.type!=='mouseMove');
  assert.deepEqual(inputs.map(event=>event.type),['keyDown','mouseDown','mouseUp','mouseDown','mouseUp','keyUp']);
  for(const [down,up] of [[inputs[1],inputs[2]],[inputs[3],inputs[4]]]){assert.deepEqual(down.modifiers,['shift']);assert.ok(up.time-down.time>=24);}
  await f.driver.act({action:'keyDown',key:'Control'});const count=f.events.length;
  await assert.rejects(f.driver.act({action:'click',x:1,y:1,key:'Shift'}),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
  assert.equal(f.events.length,count);assert.deepEqual([...f.heldKeys],['Control']);
  await f.driver.act({action:'keyUp',key:'Control'});
  let release;
  f.setOnDown(()=>setTimeout(()=>{release=f.driver.release();},5));
  const start=f.events.length;
  await assert.rejects(f.driver.act({action:'doubleClick',x:1,y:1,key:'Shift',durationMs:1000}),error=>error.code==='CONTROL_STOPPED'&&error.details.inputDispatched===true);
  await release;
  assert.equal(f.events.slice(start).filter(event=>event.type==='mouseDown').length,1);
  assert.equal(f.heldKeys.size+f.heldButtons.size,0);
});

test('controller preserves previous held inputs only for explicit known pre-dispatch click rejections', async t => {
  const dataDir=await mkdtemp(join(tmpdir(),'opencu-click-rejection-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
  const target={id:'app:fixture',kind:'app',platform:'darwin',identity:{pid:1,windowId:1}},state={held:false,releases:0};
  let failure={code:'INPUT_ALREADY_HELD',details:{inputDispatched:false}};
  const backend={async listTargets(){return [target];},async select(){return target;},async observe(){return {};},async verify(){return {valid:true,target};},async close(){},
    async release(){state.held=false;state.releases++;return {released:true};},async act(_target,args){if(args.action==='click')throw Object.assign(new Error('fixture rejection'),failure);state.held=args.action==='keyDown';return {};}};
  const controller=await createController({dataDir,browser:false,native:backend});t.after(()=>controller.close());
  assert.equal((await controller.selectTarget(target.id)).ok,true);
  await controller.act({targetId:target.id,action:'keyDown',key:'Control'});const before=state.releases;
  assert.equal((await controller.act({targetId:target.id,action:'click',key:'Shift'})).error.code,'INPUT_ALREADY_HELD');
  assert.equal(state.releases,before);assert.equal(state.held,true);assert.equal((await controller.getState()).state.mode,'active');
  await controller.act({targetId:target.id,action:'keyUp',key:'Control'});
  failure={code:'BACKEND_ERROR',details:{inputDispatched:false}};
  await controller.act({targetId:target.id,action:'click'});
  assert.ok(state.releases>before);assert.equal((await controller.getState()).state.mode,'faulted');
});

test('DSH stale direct click stays active for observation and fresh locator recovery without replay', async t => {
  const dataDir=await mkdtemp(join(tmpdir(),'opencu-stale-click-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
  const target={id:'dsh:fixture',kind:'tab',backend:'browser',provider:'dsh',sessionId:'fixture',identity:{documentId:'fixture'}};
  const events=[];let observed=false,oldResolutions=0,releases=0;
  const element={addEventListener(){},isCrashed:()=>false,getURL:()=> 'https://fixture.invalid/',getTitle:()=> 'Fixture'};
  const driver=createGuestDriver(element,target,()=>{},()=>{},undefined,undefined,async(operation,args)=>{
    if(operation==='getDialog')return {};
    if(operation==='observe'){observed=true;return {observationId:'fresh',ax:{nodes:[]}};}
    if(operation==='locator'){assert.equal(observed,true);return {elementId:'fresh'};}
    if(operation==='point'){
      if(args.elementId==='old'){oldResolutions++;throw Object.assign(Error('STALE_ELEMENT: observe the current document again'),{code:'STALE_ELEMENT',details:{inputDispatched:false}});}
      assert.equal(args.elementId,'fresh');return {x:10,y:20};
    }
    if(operation==='input')events.push(args.type);
    return {};
  });
  const backend={async listTargets(){return [target];},async select(){return target;},observe:(_target,args)=>driver.observe(args),act:(_target,args)=>driver.act(args),
    async verify(){return {valid:true,target};},async release(){releases++;return driver.release();},async close(){}};
  const controller=await createController({dataDir,browser:backend,native:false});t.after(()=>controller.close());
  assert.equal((await controller.selectTarget(target.id)).ok,true);
  const before=releases,rejected=await controller.act({targetId:target.id,action:'click',elementId:'old'});
  assert.equal(rejected.error.code,'STALE_ELEMENT');assert.equal(rejected.error.details.inputDispatched,false);
  assert.equal((await controller.getState()).state.mode,'active');assert.equal(releases,before);assert.deepEqual(events,[]);
  assert.equal((await controller.observe({targetId:target.id,format:'ax'})).ok,true);
  assert.equal((await controller.act({targetId:target.id,action:'locator',method:'click',locator:[],args:{}})).ok,true);
  assert.equal(oldResolutions,1);assert.deepEqual(events,['mouseMove','mouseDown','mouseUp']);
});

test('only explicitly undispatched stale click rejections preserve the active controller', async t => {
  for(const [code,action,dispatched] of [
    ['STALE_ELEMENT','doubleClick',false],['STALE_OBSERVATION','click',false],['STALE_OBSERVATION','doubleClick',false],
    ['STALE_ELEMENT','click',true],['STALE_ELEMENT','click',undefined],['STALE_OBSERVATION','doubleClick',true],['STALE_OBSERVATION','doubleClick',undefined],
  ]){
    const dataDir=await mkdtemp(join(tmpdir(),'opencu-stale-click-boundary-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
    const target={id:'app:fixture',kind:'app',platform:'darwin',identity:{pid:1,windowId:1}};let releases=0;
    const backend={async listTargets(){return [target];},async select(){return target;},async observe(){return {};},async verify(){return {valid:true,target};},async close(){},
      async release(){releases++;return {released:true};},async act(){throw Object.assign(Error('fixture stale rejection'),{code,...(dispatched===undefined?{}:{details:{inputDispatched:dispatched}})});}};
    const controller=await createController({dataDir,browser:false,native:backend});
    try{
      assert.equal((await controller.selectTarget(target.id)).ok,true);const before=releases;
      assert.equal((await controller.act({targetId:target.id,action})).error.code,code);
      assert.equal((await controller.getState()).state.mode,dispatched===false?'active':'faulted');
      assert.equal(releases===before,dispatched===false);
    }finally{await controller.close();}
  }
});
