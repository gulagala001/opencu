import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pressParameters,checkPressHeld} from '../extension/key-options.js';
import {createComputerSession} from '../src/dsh/computer.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {actOnPage,releasePage} from '../src/browser/actions.mjs';
import {createController} from '../src/core/controller.mjs';
import {normalizeAction as nativeAction} from '../src/native/protocol.mjs';
import {normalizeAction as extensionAction} from '../src/extension/protocol.mjs';
import {guestKeySpec,extensionKeySpec} from '../extension/keyboard.js';
import {playwrightKeyIdentity} from '../src/browser/playwright-keyboard.mjs';

const invalid = error => error.code === 'INVALID_ARGUMENT' && error.details.inputDispatched === false;
test('press holds validate integers, complete chords and aliases before dispatch', () => {
  assert.deepEqual(pressParameters({key:'ctrl+Shift+a',durationMs:10000}),{keys:['Control','Shift','a'],durationMs:10000});
  assert.deepEqual(pressParameters({key:'ControlOrMeta',durationMs:0},{mac:true}),{keys:['Meta'],durationMs:0});
  for (const durationMs of [-1,0.5,10001,NaN,Infinity,null,'180',true]) {
    for (const normalize of [pressParameters,nativeAction,extensionAction]) assert.throws(()=>normalize({action:'press',key:'Shift',durationMs}),invalid);
  }
  for (const key of ['',null,'Shift+','Ctrl+Control','Super+Meta']) assert.throws(()=>pressParameters({key}),invalid);
  assert.throws(()=>checkPressHeld({keys:new Set(['shift'])},['Shift']),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
  checkPressHeld({keys:new Set(['Control'])},['Shift']);
});

test('backend key identities reject alias/case ownership and duplicate chords while keeping keypad codes distinct', () => {
  for(const spec of [guestKeySpec,extensionKeySpec]) {
    const keyboard={identity:key=>spec(key).code};
    for(const [held,key] of [['Enter','Return'],['a','A'],['Escape','Esc'],[' ','Space']]) {
      assert.throws(()=>checkPressHeld({keys:new Set([held])},[key],keyboard),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
      assert.throws(()=>pressParameters({key:`${held}+${key}`},keyboard),invalid);
    }
    assert.notEqual(spec('1').code,spec('2').code);
    assert.throws(()=>pressParameters({key:'Shift+NotARealKey'},keyboard),error=>error.code==='UNSUPPORTED_KEY'&&error.details.inputDispatched===false);
    assert.throws(()=>spec('Numpad1'),error=>error.code==='UNSUPPORTED_KEY');
  }
  const keyboard={identity:playwrightKeyIdentity};
  for(const [held,key] of [['a','A'],['Enter','\r'],['1','Digit1'],['1','!'],['ShiftRight','Shift']]) {
    assert.throws(()=>checkPressHeld({keys:new Set([held])},[key],keyboard),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
    assert.throws(()=>pressParameters({key:`${held}+${key}`},keyboard),invalid);
  }
  assert.notEqual(playwrightKeyIdentity('1'),playwrightKeyIdentity('Numpad1'));
  assert.notEqual(playwrightKeyIdentity('+'),playwrightKeyIdentity('NumpadAdd'));
  checkPressHeld({keys:new Set(['Numpad1'])},['1'],keyboard);
  assert.throws(()=>pressParameters({key:'Shift+NotARealKey'},keyboard),error=>error.code==='UNSUPPORTED_KEY'&&error.details.inputDispatched===false);
});

test('DSH and Playwright reject owned aliases and unknown chord tails before focusing or posting input', async () => {
  const operations=[],events=[];
  const element={addEventListener(){},isCrashed:()=>false,getURL:()=> 'https://fixture.invalid/',getTitle:()=> 'Fixture'};
  const driver=createGuestDriver(element,{sessionId:'fixture'},()=>{},()=>{},undefined,undefined,async(operation,args)=>{
    operations.push(operation);
    if(operation==='input')events.push(args);
    return {};
  });
  for(const [held,key] of [['Enter','Return'],['a','A']]) {
    await driver.act({action:'keyDown',key:held});const before=events.length;
    operations.length=0;
    await assert.rejects(driver.act({action:'press',elementId:6,key}),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
    assert.equal(events.length,before);assert.equal(operations.includes('focus'),false);
    await driver.act({action:'keyUp',key:held});
  }
  operations.length=0;const before=events.length;
  await assert.rejects(driver.act({action:'press',elementId:6,key:'Shift+NotARealKey'}),error=>error.code==='UNSUPPORTED_KEY'&&error.details.inputDispatched===false);
  assert.equal(events.length,before);assert.equal(operations.includes('focus'),false);
  const calls=[],record={keys:new Set(['a']),buttons:new Set(),pending:new Set(),documentGeneration:1,elements:new Map([[6,{backendNodeId:6}]])};
  record.session={async send(method){calls.push(method);return {};}};
  record.page={keyboard:{async down(key){calls.push(['down',key]);},async up(key){calls.push(['up',key]);}}};
  const options={async persistInputs(){}};
  await assert.rejects(actOnPage(record,{action:'press',elementId:6,key:'A'},options),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
  await assert.rejects(actOnPage(record,{action:'press',elementId:6,key:'Shift+NotARealKey'},options),error=>error.code==='UNSUPPORTED_KEY'&&error.details.inputDispatched===false);
  assert.deepEqual(calls,[]);assert.deepEqual([...record.keys],['a']);
  record.keys=new Set(['Numpad1']);
  await actOnPage(record,{action:'press',key:'1'},options);
  assert.deepEqual([...record.keys],['Numpad1']);
});

test('REPL keeps native and browser key/options signatures distinct and rejects extra arguments', async t => {
  const actions=[];
  const target={id:'fixture',kind:'tab',backend:'browser',verified:true,platform:'darwin'};
  const request=async(endpoint,args)=>{
    if(endpoint==='targets')return {ok:true,targets:[target],browsers:[]};
    if(endpoint==='select')return {ok:true,target};
    if(endpoint==='observe')return {ok:true,observation:{id:'fixture-observation',ax:{nodes:[]}}};
    if(endpoint==='act')actions.push(args);
    return {ok:true};
  };
  const computer=createComputerSession(request);t.after(()=>computer.close());
  await computer.run({code:"var tab=await cua.getTab('fixture'); await tab.pressKey(6,'Shift',{durationMs:180}); await tab.pressKey(null,'a',{durationMs:0}); await tab.pressKey('Shift',{durationMs:25}); await tab.pressKey('Enter')"});
  assert.deepEqual(actions.map(({elementId,key,durationMs})=>({elementId,key,durationMs})),[
    {elementId:6,key:'Shift',durationMs:180},{elementId:undefined,key:'a',durationMs:0},
    {elementId:undefined,key:'Shift',durationMs:25},{elementId:undefined,key:'Enter',durationMs:undefined},
  ]);
  for(const call of ["tab.pressKey(6,'Shift',{durationMs:180},'extra')","tab.pressKey(6,'Shift',{durationMs:null})","tab.pressKey(6,'Shift',[])"
    ,"tab.pressKey(6,'Shift',{unknown:true})","tab.pressKey('Shift',{},'extra')"]) await assert.rejects(computer.run({code:`await ${call}`}),invalid);
  assert.equal(actions.length,4);
  target.kind='app';target.backend='native';
  const native=createComputerSession(request);t.after(()=>native.close());
  await native.run({code:"var app=await cua.getApp('fixture'); await app.pressKey('Shift',{durationMs:180}); await app.pressKey('Enter')"});
  assert.deepEqual(actions.slice(4).map(({key,durationMs})=>({key,durationMs})),[{key:'Shift',durationMs:180},{key:'Enter',durationMs:undefined}]);
  await assert.rejects(native.run({code:"await app.pressKey(6,'Shift',{durationMs:180})"}),invalid);
  target.platform='linux';
  const linux=createComputerSession(request);t.after(()=>linux.close());
  await linux.run({code:"var app=await cua.getApp('fixture')"});
  await assert.rejects(linux.run({code:"await app.pressKey('Shift',{durationMs:180})"}),error=>error.code==='UNSUPPORTED_ACTION'&&error.details.inputDispatched===false);
  assert.equal(actions.length,6);
});

test('DSH holds complete chord, preserves unrelated held keys and cancels without trailing key events', async () => {
  const events=[],held=new Set();let onDown;
  const element={addEventListener(){},isCrashed:()=>false,getURL:()=> 'https://fixture.invalid/',getTitle:()=> 'Fixture'};
  const driver=createGuestDriver(element,{sessionId:'fixture'},()=>{},()=>{},undefined,undefined,async(operation,args)=>{
    if(operation==='getDialog')return {};
    if(operation==='releaseInput'){held.clear();events.push({type:'release'});return {released:true};}
    if(operation==='input'){
      events.push({...args,time:performance.now()});
      if(args.type==='keyDown'){held.add(args.keyCode);onDown?.();}
      if(args.type==='keyUp')held.delete(args.keyCode);
    }
    return {};
  });
  await driver.act({action:'keyDown',key:'Control'});
  await driver.act({action:'press',key:'Shift+a',durationMs:35});
  assert.deepEqual(events.map(event=>event.type),['keyDown','keyDown','keyDown','keyUp','keyUp']);
  assert.ok(events[3].time-events[2].time>=34);
  assert.deepEqual([...held],['Control']);
  const count=events.length;
  await assert.rejects(driver.act({action:'press',key:'Control',durationMs:0}),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
  await assert.rejects(driver.act({action:'press',elementId:6,key:'Shift',durationMs:0.5}),invalid);
  assert.equal(events.length,count);assert.deepEqual([...held],['Control']);
  await driver.act({action:'keyUp',key:'Control'});
  let release;
  onDown=()=>setTimeout(()=>{release=driver.release();},5);
  const start=events.length;
  await assert.rejects(driver.act({action:'press',key:'Shift',durationMs:1000}),error=>error.code==='CONTROL_STOPPED'&&error.details.inputDispatched===true);
  await release;
  assert.deepEqual(events.slice(start).map(event=>event.type),['keyDown','release']);assert.equal(held.size,0);
});

test('Playwright holds one chord, leaves prior ownership intact and journal releases cancelled holds', async () => {
  const events=[],record={keys:new Set(['Control']),buttons:new Set(),pending:new Set(),session:{async send(){return {};}}};
  const aborter=new AbortController();let cancel=false;
  record.page={isClosed:()=>false,keyboard:{async down(key){events.push(['down',key,performance.now()]);if(cancel)setTimeout(()=>aborter.abort(),5);},async up(key){events.push(['up',key,performance.now()]);}}};
  const options={async persistInputs(){}};
  await actOnPage(record,{action:'press',key:'Shift+a',durationMs:35},options);
  assert.deepEqual(events.map(event=>event.slice(0,2)),[['down','Shift'],['down','a'],['up','a'],['up','Shift']]);
  assert.ok(events[2][2]-events[1][2]>=34);assert.deepEqual([...record.keys],['Control']);
  const count=events.length;
  await assert.rejects(actOnPage(record,{action:'press',key:'Ctrl',durationMs:0},options),error=>error.code==='INPUT_ALREADY_HELD'&&error.details.inputDispatched===false);
  await assert.rejects(actOnPage(record,{action:'press',elementId:6,key:'Shift',durationMs:-1},options),invalid);
  assert.equal(events.length,count);assert.deepEqual([...record.keys],['Control']);
  record.keys.clear();cancel=true;
  await assert.rejects(actOnPage(record,{action:'press',key:'Shift',durationMs:1000,signal:aborter.signal},options),error=>error.code==='CONTROL_STOPPED');
  assert.deepEqual([...record.keys],['Shift']);
  assert.deepEqual(await releasePage(record,100,{persistInputs:options.persistInputs}),[]);
  assert.equal(record.keys.size,0);assert.deepEqual(events.slice(-2).map(event=>event.slice(0,2)),[['down','Shift'],['up','Shift']]);
});

test('Playwright fill keeps its internal shortcuts and only missing IDs precede the focus dispatch fence', async () => {
  const events=[],record={keys:new Set(),buttons:new Set(),pending:new Set(),documentGeneration:1,elements:new Map([[6,{backendNodeId:6}]])};
  let rejectFocus=false;
  record.session={async send(method){if(method==='DOM.focus'){events.push(['focus']);if(rejectFocus)throw Error('unknown focus outcome');}return {};}};
  record.page={keyboard:{async down(key){events.push(['down',key]);},async up(key){events.push(['up',key]);},async insertText(text){events.push(['text',text]);}}};
  const options={async persistInputs(){}};
  await actOnPage(record,{action:'fill',elementId:6,value:'new text'},options);
  assert.deepEqual(events.map(event=>event[0]),['focus','down','down','up','up','text']);
  assert.equal(events[2][1],'A');assert.deepEqual(events.at(-1),['text','new text']);
  events.length=0;
  await actOnPage(record,{action:'fill',elementId:6,value:''},options);
  assert.deepEqual(events.slice(-2),[['down','Backspace'],['up','Backspace']]);
  const before=record.inputDispatchSequence,count=events.length;
  await assert.rejects(actOnPage(record,{action:'fill',elementId:7,value:'stale'},options),error=>error.code==='STALE_ELEMENT');
  assert.equal(record.inputDispatchSequence,before);assert.equal(events.length,count);
  rejectFocus=true;
  await assert.rejects(actOnPage(record,{action:'press',elementId:6,key:'Shift',durationMs:10},options),error=>error.code==='STALE_ELEMENT');
  assert.equal(record.inputDispatchSequence,before+1);
});

test('only known undispatched press and stale direct text rejections allow fresh locator recovery', async t => {
  for(const [action,code,dispatched] of [
    ['press','INPUT_ALREADY_HELD',false],['press','STALE_ELEMENT',false],['fill','STALE_ELEMENT',false],['type','STALE_OBSERVATION',false],
    ['fill','STALE_ELEMENT',true],['fill','STALE_ELEMENT',undefined],['press','INPUT_UNCONFIRMED',false],
  ]) {
    const dataDir=await mkdtemp(join(tmpdir(),'opencu-press-recovery-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
    const target={id:'fixture',kind:'app',platform:'darwin',identity:{pid:1,windowId:1}};
    let releases=0,attempts=0;
    const backend={async listTargets(){return [target];},async select(){return target;},async observe(){return {};},async verify(){return {valid:true,target};},async close(){},
      async release(){releases++;return {released:true};},async act(_target,request){if(request.action==='locator')return {};attempts++;throw Object.assign(Error('fixture rejection'),{code,...(dispatched===undefined?{}:{details:{inputDispatched:dispatched}})});}};
    const controller=await createController({dataDir,native:backend,browser:false});
    try {
      assert.equal((await controller.selectTarget(target.id)).ok,true);const before=releases;
      assert.equal((await controller.act({targetId:target.id,action})).error.code,code);
      const recover=dispatched===false&&code!=='INPUT_UNCONFIRMED';
      assert.equal((await controller.getState()).state.mode,recover?'active':'faulted');
      assert.equal(releases===before,recover);assert.equal(attempts,1);
      assert.equal((await controller.act({targetId:target.id,action:'locator',method:'fill'})).ok,recover);
    } finally {await controller.close();}
  }
});
