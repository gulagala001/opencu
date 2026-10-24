import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {actOnPage} from '../src/browser/actions.mjs';
import {guestKeySpec,keyEventParameters} from '../extension/keyboard.js';

function guest(hook=()=>{}) {
  const events=[];
  const driver=createGuestDriver({addEventListener(){},getURL:()=> 'https://fixture.invalid/',getTitle:()=> 'Fixture'}, {},()=>{},()=>{},()=>{},undefined,async(operation,args)=>{
    events.push({operation,args});await hook(operation,args);
    if(operation==='locator')return {elementId:'editor',keyboardEditable:true};
    if(operation==='releaseInput')return {released:true};
    return {};
  });
  return {driver,events};
}

test('guest locator append preserves current selection and emits sequential ASCII/Unicode input',async()=>{
  const f=guest();
  await f.driver.act({action:'locator',method:'type',args:{value:'甲🙂'}});
  await f.driver.act({action:'locator',method:'pressSequentially',args:{value:'aB!🙂é'}});
  assert.equal(f.events.some(event=>event.operation==='selectAll'),false);
  assert.deepEqual(f.events.filter(event=>event.operation==='insertText').map(event=>event.args.text),['甲🙂','🙂','é']);
  const keys=f.events.filter(event=>event.operation==='input');
  assert.deepEqual(keys.map(event=>[event.args.type,event.args.keyCode]),[['keyDown','a'],['keyUp','a'],['keyDown','B'],['keyUp','B'],['keyDown','!'],['keyUp','!']]);
  assert(keys.every(event=>event.args.elementId==='editor'));
});

test('guest cancellation during the first key cannot dispatch trailing text',async()=>{
  let stopping;
  const f=guest((operation,args)=>{if(operation==='input'&&args.type==='keyDown')stopping=f.driver.release();});
  await assert.rejects(f.driver.act({action:'locator',method:'pressSequentially',args:{value:'a🙂b'}}),error=>error.code==='CONTROL_STOPPED'&&error.details.inputDispatched===true);
  await stopping;
  assert.equal(f.events.filter(event=>event.operation==='input'&&event.args.type==='keyDown').length,1);
  assert.equal(f.events.some(event=>event.operation==='insertText'),false);
});

test('standalone sequential text checks cancellation between Unicode code points',async()=>{
  const events=[],aborter=new AbortController();
  const record={page:{keyboard:{insertText:async text=>{events.push(text);aborter.abort();}}},session:{send:async()=>({})},
    keys:new Set(),buttons:new Set(),pending:new Set(),elements:new Map(),documentGeneration:0};
  await assert.rejects(actOnPage(record,{action:'type',text:'🙂乙',sequential:true,signal:aborter.signal},{persistInputs:async()=>{}}),{code:'CONTROL_STOPPED'});
  assert.deepEqual(events,['🙂']);
});

test('macOS Home/End editor commands retain native body scrolling and Shift selection',()=>{
  for(const [key,command] of [['Home','moveToBeginningOfLine'],['End','moveToEndOfLine']]) {
    const spec=guestKeySpec(key);
    assert.deepEqual(keyEventParameters(spec,true,0,true,true).commands,[command]);
    assert.deepEqual(keyEventParameters(spec,true,8,true,true).commands,[command+'AndModifySelection']);
    assert.match(keyEventParameters(spec,true,0,true,false).commands[0],/^scroll/u);
    assert.equal(keyEventParameters(spec,true,0,false,true).commands,undefined);
  }
});
