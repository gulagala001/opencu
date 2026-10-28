import test from 'node:test';
import assert from 'node:assert/strict';
import {actOnPage,releasePage} from '../src/browser/actions.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';

test('standalone releases only automation-owned inputs and resolves physical-key aliases',async()=>{
  const events=[];
  const record={documentGeneration:0,pending:new Set(),keys:new Set(),buttons:new Set(),pointer:{x:10,y:10},
    session:{send:async()=>({})},page:{isClosed:()=>false,
      keyboard:{down:async key=>events.push(['down',key]),up:async key=>events.push(['up',key])},
      mouse:{down:async value=>events.push(['mouseDown',value.button]),up:async value=>events.push(['mouseUp',value.button])}}};
  const run=request=>actOnPage(record,request,{persistInputs:async()=>{}});
  await run({action:'keyUp',key:'Shift'});await run({action:'mouseUp',button:'left'});
  assert.deepEqual(events,[]);
  await run({action:'keyDown',key:'KeyA'});await run({action:'keyUp',key:'A'});await run({action:'keyUp',key:'a'});
  await run({action:'mouseDown',button:'left'});await run({action:'mouseUp',button:'right'});await run({action:'mouseUp',button:'left'});
  assert.deepEqual(events,[['down','KeyA'],['up','KeyA'],['mouseDown','left'],['mouseUp','left']]);
  assert.equal(record.keys.size,0);assert.equal(record.buttons.size,0);
  assert.deepEqual(await releasePage(record,100),[]);
  assert.equal(events.length,4,'cleanup must not replay already released or unowned input');
  await run({action:'keyDown',key:'ShiftLeft'});await run({action:'keyDown',key:'ShiftRight'});
  await run({action:'keyUp',key:'Shift'});
  assert.deepEqual([...record.keys],['ShiftRight'],'a logical modifier alias must not erase the other physical side');
  await releasePage(record,100);
  assert.deepEqual(events.slice(4),[['down','ShiftLeft'],['down','ShiftRight'],['up','ShiftLeft'],['up','ShiftRight']]);
});

test('guest releases only automation-owned inputs and leaves human activity advisory',async()=>{
  const events=[],activity={documentId:'doc',sequence:8,kind:'keydown',at:new Date().toISOString()};
  const element={addEventListener(){},getURL:()=> 'https://fixture.invalid/',getTitle:()=> 'Fixture'};
  const driver=createGuestDriver(element,{},()=>{},()=>{},()=>{},undefined,async(operation,args)=>{
    if(operation==='getDialog')return {};
    if(operation==='navigationState')return {documentId:'doc'};
    if(operation==='observe')return {documentId:'doc',userActivity:activity};
    if(operation==='input')events.push([args.type,args.keyCode??args.button]);
    return {};
  });
  assert.deepEqual((await driver.observe({format:'ax'})).userActivity,activity);
  await driver.act({action:'keyUp',key:'a'});await driver.act({action:'mouseUp',button:'left'});
  assert.deepEqual(events,[]);
  await driver.act({action:'keyDown',key:'a'});await driver.act({action:'keyUp',key:'A'});await driver.act({action:'keyUp',key:'a'});
  await driver.act({action:'mouseDown',button:'left'});await driver.act({action:'mouseUp',button:'right'});await driver.act({action:'mouseUp',button:'left'});
  assert.deepEqual(events,[['keyDown','a'],['keyUp','a'],['mouseDown','left'],['mouseUp','left']]);
});
