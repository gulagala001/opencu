import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollDirection,scrollDistance,scrollDeltas,checkScrollGeometry} from '../extension/scroll.js';
import {createComputerRepl} from '../src/dsh/computer-repl.mjs';
import {actOnPage} from '../src/browser/actions.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {observeAccessibility,elementOperation,invalidateElements} from '../extension/accessibility.js';

test('page counts, pixels and raw deltas reject invalid inputs before dispatch',()=>{
  for (const value of [-1,NaN,Infinity,null,'1',[],{}, {pixels:-1},{pixels:1,pages:1},{pixels:1,extra:0}]) assert.throws(()=>scrollDistance(value),{code:'INVALID_ARGUMENT'});
  for (const value of [null,13,'13',[],false]) assert.throws(()=>scrollDeltas(value),{code:'INVALID_ARGUMENT'});
  for (const value of ['toString','constructor','DOWN',null]) assert.throws(()=>scrollDirection(value),{code:'INVALID_ARGUMENT'});
  assert.deepEqual(scrollDistance(),{pages:1});assert.deepEqual(scrollDistance(0),{pages:0});assert.deepEqual(scrollDistance({pixels:0}),{pixels:0});
  assert.deepEqual(scrollDeltas({elementId:13,scrollDirection:'down',scrollPages:0.25},{width:434,height:114}),{deltaX:0,deltaY:28.5});
  assert.deepEqual(scrollDeltas({elementId:13,scrollDirection:'right',scrollPages:0.25},{width:434,height:114}),{deltaX:108.5,deltaY:0});
  assert.throws(()=>checkScrollGeometry({width:434,height:114},{width:434,height:118}),{code:'LOCATOR_NOT_STABLE'});
});

test('REPL forwards browser element pages without a screenshot and validates malformed distance',async t=>{
  const events=[],target={id:'tab:scroll',backend:'browser',browserId:'browser:scroll',identity:{id:1}};
  const repl=createComputerRepl(async(endpoint,args)=>{
    if(endpoint==='select'||endpoint==='resume')return {target:{...target,verified:true},state:{mode:'active'}};
    if(endpoint==='observe')return {observation:{observationId:'ax',ax:{nodes:[]}}};
    if(endpoint==='act'){events.push(args);return {result:{action:args.action}};}
    if(endpoint==='stop')return {released:true};
    throw Error(endpoint);
  });t.after(()=>repl.close());
  await repl.run({code:'var tab=await cua.getTab("tab:scroll");await tab.scroll(13,"down",0.25);await tab.scroll(13,"right");await tab.scroll(13,"down",0);await tab.scroll(13,"down",{pixels:20});'});
  assert.deepEqual(events.map(({scrollPages,scrollDirection,deltaX,deltaY})=>({scrollPages,scrollDirection,deltaX,deltaY})),[
    {scrollPages:.25,scrollDirection:'down',deltaX:undefined,deltaY:undefined},
    {scrollPages:1,scrollDirection:'right',deltaX:undefined,deltaY:undefined},
    {scrollPages:0,scrollDirection:'down',deltaX:undefined,deltaY:undefined},
    {scrollPages:undefined,scrollDirection:undefined,deltaX:0,deltaY:20},
  ]);
  const before=events.length;
  for(const code of ['await tab.scroll(13)','await tab.scroll(null)','await tab.scroll([])','await tab.scroll(13,"down",NaN)','await tab.scroll(13,"down",{pixels:1,bad:true})'])await assert.rejects(repl.run({code}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(repl.run({code:'await tab.scroll([1,2],"down",0.25)'}),/current screenshot/);
  assert.equal(events.length,before);
});

function standalone() {
  const events=[],geometry={width:434,height:114},hooks={};
  const route={contextId:4,send:async(method,args)=>{
    if(method==='DOM.resolveNode')return {object:{objectId:'scroll'}};
    if(method==='Runtime.callFunctionOn'){assert.match(args.functionDeclaration,/__opencuScrollGeometry/);return {result:{value:{...geometry}}};}
    if(method==='Runtime.releaseObject')return {};
    throw Error(method);
  }};
  const record={page:{mouse:{move:async()=>events.push('move'),wheel:async(x,y)=>events.push([x,y])}},session:{send:async()=>({})},
    frameRouter:{validate:async()=>{},point:async()=>({x:210,y:60}),checkPoint:async()=>{}},
    elements:new Map([[13,{route,backendNodeId:13,observationId:'ax'}]]),pending:new Set(),keys:new Set(),buttons:new Set()};
  const options={persistInputs:async()=>{},expectInput:async events=>{if(events.some(event=>event.type==='wheel'))await hooks.beforeInput?.();},cursor:async()=>hooks.cursor?.()};
  return {events,geometry,hooks,record,options,act:args=>actOnPage(record,{action:'scroll',elementId:13,observationId:'ax',...args},options)};
}

test('standalone derives live routed geometry after positioning; stale and resized input never wheels',async()=>{
  const f=standalone();f.hooks.cursor=()=>{f.geometry.height=214;};
  await f.act({scrollDirection:'down',scrollPages:.25});assert.deepEqual(f.events,['move',[0,53.5]]);
  f.events.length=0;f.hooks.beforeInput=()=>{f.geometry.width=500;};
  await assert.rejects(f.act({scrollDirection:'right',scrollPages:.25}),{code:'LOCATOR_NOT_STABLE'});assert.deepEqual(f.events,['move']);
  f.events.length=0;await assert.rejects(f.act({scrollDirection:'down',scrollPages:-1}),{code:'INVALID_ARGUMENT'});assert.deepEqual(f.events,[]);
  await assert.rejects(f.act({scrollDirection:'down',scrollPages:.25,observationId:'screenshot'}),{code:'STALE_ELEMENT'});assert.deepEqual(f.events,[]);
});

test('DSH guest passes current geometry and semantic page distance to its final host input fence',async()=>{
  const events=[];
  const driver=createGuestDriver({addEventListener(){},getURL:()=> 'https://fixture.invalid/',getTitle:()=> 'Fixture'}, {},()=>{},()=>{},()=>{},undefined,async(operation,args)=>{
    if(operation==='point')return {x:210,y:60};
    if(operation==='scrollGeometry')return {width:434,height:114};
    if(operation==='input')events.push(args);
    return {};
  });
  await driver.act({action:'scroll',elementId:13,scrollDirection:'down',scrollPages:.25,observationId:'ax'});
  assert.equal(events[1].type,'mouseWheel');assert.equal(events[1].deltaY,28.5);assert.equal(events[1].scrollPages,.25);assert.deepEqual(events[1].scrollGeometry,{width:434,height:114});
  events.length=0;await assert.rejects(driver.act({action:'scroll',elementId:13,scrollDirection:'down',scrollPages:NaN}),{code:'INVALID_ARGUMENT'});assert.deepEqual(events,[]);
});

test('extension geometry uses the observed frame transport and refuses expired observation IDs',async t=>{
  const tabId=873;t.after(()=>invalidateElements(tabId));
  let reads=0;
  const send=async(method,args)=>{
    if(method==='Runtime.evaluate'&&args.expression==='document')return {result:{objectId:'document'}};
    if(method==='DOM.describeNode')return {node:{nodeType:9,children:[]}};
    if(method==='Accessibility.getFullAXTree')return {nodes:[{nodeId:'0',role:{value:'RootWebArea'},frameId:'routed',childIds:['1']},{nodeId:'1',backendDOMNodeId:13,role:{value:'region'},name:{value:'Scroll'}}]};
    if(method==='DOM.resolveNode'){assert.equal(args.executionContextId,42);reads++;return {object:{objectId:'scroll'}};}
    if(method==='Runtime.callFunctionOn')return {result:{value:{width:434,height:114}}};
    if(method==='Runtime.releaseObject')return {};
    throw Error(method);
  };
  const route={frameId:'routed',contextId:42,send,owners:[]};
  const router={main:async()=>route,validate:async()=>{}};
  const rootSend=async()=>assert.fail('Routed geometry must use the selected frame transport');
  const observed=await observeAccessibility(tabId,rootSend,'document',undefined,{},router);
  const args={elementId:observed.ax.nodes.find(node=>node.role==='region').elementId,observationId:observed.observationId};
  assert.deepEqual(await elementOperation(tabId,rootSend,'scrollGeometry',args,router),{width:434,height:114});assert.equal(reads,1);
  await assert.rejects(elementOperation(tabId,rootSend,'scrollGeometry',{...args,observationId:'expired'},router),{code:'STALE_ELEMENT'});
});
