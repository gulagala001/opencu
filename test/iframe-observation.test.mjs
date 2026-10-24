import test from 'node:test';
import assert from 'node:assert/strict';
import {captureAXTree} from '../extension/ax-tree.js';
import {createCDPFrameRouter} from '../extension/frame-router.js';
import {observeAccessibility,elementOperation,invalidateElements} from '../extension/accessibility.js';
import {observePage} from '../src/browser/observation.mjs';
import {actOnPage} from '../src/browser/actions.mjs';

function fixture() {
  const frames = new Map(['top','outer','inner'].map((id,index)=>[id,{id,documentId:`document-${index}`,child:['outer','inner'][index]}]));
  const events = [], hooks = {};
  const stale = () => Object.assign(Error('Frame document changed'),{code:'FRAME_DETACHED',details:{inputDispatched:false}});
  const send = id => async (method,args={}) => {
    await hooks.send?.(id,method,args);
    const frame = frames.get(id);
    if (method === 'Runtime.evaluate' && args.expression === 'document') return {result:{objectId:`document:${id}`}};
    if (method === 'Runtime.releaseObject') return {};
    if (method === 'DOM.describeNode' && args.objectId) return {node:{nodeType:9,children:frame.child ? [{nodeType:1,nodeName:'DIV',shadowRoots:[{nodeType:11,children:[{nodeType:1,nodeName:'IFRAME',backendNodeId:9,frameId:frame.child,contentDocument:{nodeType:9,children:[]}}]}]}] : []}};
    if (method === 'DOM.describeNode' && args.backendNodeId === 9) return {node:{backendNodeId:9,frameId:frame.child}};
    if (method === 'Accessibility.getFullAXTree') {
      assert.equal(args.frameId,id);
      return {nodes:[
        {nodeId:'1',backendDOMNodeId:1,frameId:id,role:{value:'RootWebArea'},name:{value:id},childIds:['2',...(frame.child ? ['3'] : [])]},
        {nodeId:'2',backendDOMNodeId:42,role:{value:'textbox'},name:{value:id}},
        ...(frame.child ? [{nodeId:'3',backendDOMNodeId:9,role:{value:'button'},name:{value:'ARIA frame owner'}}] : []),
      ]};
    }
    throw Error(`Unexpected ${id} ${method}`);
  };
  const route = (id,owners=[]) => ({frameId:id,documentId:frames.get(id).documentId,sessionId:id,sessionFrameId:id,contextId:1,send:send(id),owners});
  const router = {
    main:async()=>route('top'),
    child:async(parent,backendNodeId,id)=>{assert.equal(backendNodeId,9);assert.equal(frames.get(parent.frameId).child,id);return route(id,[...parent.owners,{parent,backendNodeId,frameId:id}]);},
    validate:async current=>{for (const item of [...current.owners.map(owner=>owner.parent),current]) if (frames.get(item.frameId).documentId !== item.documentId) throw stale();},
    focus:async entry=>{await router.validate(entry.route);events.push(['focus',entry.route.frameId,entry.backendNodeId]);},
  };
  const record = {id:'tab:fixture',page:{url:()=> 'https://fixture.invalid/',title:async()=> 'Fixture'},session:{send:send('top')},frameRouter:router,
    documentGeneration:0,nextElementId:0,elements:new Map(),pending:new Set(),keys:new Set(),buttons:new Set()};
  return {record,router,frames,events,hooks,send:send('top')};
}

test('AX frame roots join real owners and colliding CDP node numbers get distinct stable handles',async()=>{
  const f=fixture();
  const first=await observePage(f.record,{format:'ax'},{});
  const controls=first.ax.nodes.filter(node=>node.role==='textbox');
  assert.deepEqual(controls.map(node=>node.name),['top','outer','inner']);
  assert.equal(new Set(controls.map(node=>node.elementId)).size,3);
  assert.equal(new Set(first.ax.nodes.map(node=>node.nodeId)).size,first.ax.nodes.length);
  for (const name of ['outer','inner']) {
    const root=first.ax.nodes.find(node=>node.role==='RootWebArea'&&node.name===name);
    assert(first.ax.nodes.some(node=>node.role==='button'&&node.children.includes(root.nodeId)));
  }
  const second=await observePage(f.record,{format:'ax'},{});
  assert.deepEqual(second.ax.nodes.filter(node=>node.role==='textbox').map(node=>node.elementId),controls.map(node=>node.elementId));
});

test('failed or cancelled descendant capture cannot publish partial elements or consume IDs',async()=>{
  const f=fixture();await observePage(f.record,{format:'ax'},{});
  const elements=f.record.elements,next=f.record.nextElementId,observation=f.record.observationId;
  f.hooks.send=(id,method)=>{if(id==='inner'&&method==='Accessibility.getFullAXTree')throw Error('descendant unavailable');};
  await assert.rejects(observePage(f.record,{format:'ax'},{}),/descendant unavailable/);
  assert.equal(f.record.elements,elements);assert.equal(f.record.nextElementId,next);assert.equal(f.record.observationId,observation);
  const aborter=new AbortController();
  f.hooks.send=(id,method)=>{if(id==='inner'&&method==='Accessibility.getFullAXTree')aborter.abort();};
  await assert.rejects(observePage(f.record,{format:'ax',signal:aborter.signal},{}),{code:'CONTROL_STOPPED'});
  assert.equal(f.record.elements,elements);
  delete f.hooks.send;
  f.record.page.evaluate=async()=>({width:100,height:100,deviceScaleFactor:1,scrollX:0,scrollY:0});
  f.record.page.screenshot=async()=>{throw Error('capture failed');};
  await assert.rejects(observePage(f.record,{format:'both'},{}),/capture failed/);
  assert.equal(f.record.elements,elements);
});

test('extension screenshot deferral retains frame identity and rejects navigation before focus dispatch',async t=>{
  const f=fixture(),tab=941;t.after(()=>invalidateElements(tab));
  const first=await observeAccessibility(tab,f.send,'document',()=>{},{},f.router);
  const input=first.ax.nodes.find(node=>node.role==='textbox'&&node.name==='inner');
  const shot=await observeAccessibility(tab,null,'document',()=>{},{format:'screenshot'},f.router);
  await elementOperation(tab,f.send,'focus',{elementId:input.elementId,observationId:shot.observationId},f.router);
  assert.deepEqual(f.events,[['focus','inner',42]]);
  f.frames.get('inner').documentId='replacement';
  await assert.rejects(elementOperation(tab,f.send,'focus',{elementId:input.elementId},f.router),{code:'FRAME_DETACHED'});
  const next=await observeAccessibility(tab,f.send,'document',()=>{},{},f.router);
  assert.notEqual(next.ax.nodes.find(node=>node.role==='textbox'&&node.name==='inner').elementId,input.elementId);
  assert.equal(f.events.length,1);
});

test('frame topology changes fail commit and stale focus never marks undispatched input as sent',async()=>{
  const f=fixture();await observePage(f.record,{format:'ax'},{});
  const input=[...f.record.elements].find(([,entry])=>entry.route.frameId==='inner'&&entry.backendNodeId===42)[0];
  f.frames.get('inner').documentId='replacement';
  await assert.rejects(actOnPage(f.record,{action:'fill',elementId:input,value:'must not dispatch'},{}),{code:'FRAME_DETACHED',details:{inputDispatched:false}});
  assert.equal(f.record.inputDispatchSequence,undefined);assert.deepEqual(f.events,[]);
  const capture=await captureAXTree(f.send,f.router);
  f.frames.get('outer').child=undefined;
  await assert.rejects(capture.validate(),{code:'STALE_OBSERVATION'});
});

test('router normalizes only explicit protocol context loss and preserves unrelated failures',async()=>{
  let error;
  const send=async(method,args)=>{
    if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'top'}}};
    if(method==='Page.createIsolatedWorld')return {executionContextId:7};
    if(method==='Runtime.evaluate'&&args.expression!=='globalThis.__opencuFrameDocument')return {result:{value:'document'}};
    if(error)throw error;
    return {result:{value:'document'}};
  };
  const router=createCDPFrameRouter(send,()=>()=>{}),route=await router.main();
  error=Error('Protocol error (Runtime.evaluate): Cannot find context with specified id');
  await assert.rejects(router.validate(route),{code:'FRAME_DETACHED',details:{inputDispatched:false}});
  error=Error('unknown transport failure');
  await assert.rejects(router.validate(route),candidate=>candidate===error);
  await router.close();
});
