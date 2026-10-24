import test from 'node:test';
import assert from 'node:assert/strict';
import {captureAXTree} from '../extension/ax-tree.js';
import {createCDPFrameRouter} from '../extension/frame-router.js';
import {observeAccessibility,elementOperation,invalidateElements} from '../extension/accessibility.js';
import {observePage} from '../src/browser/observation.mjs';
import {actOnPage} from '../src/browser/actions.mjs';
import {hitTest} from '../src/browser/dom.mjs';
import {runCDPLocator} from '../extension/cdp-locator.js';

function fixture() {
  const frames = new Map(['top','outer','inner'].map((id,index)=>[id,{id,documentId:`document-${index}`,child:['outer','inner'][index]}]));
  const events = [], hooks = {};
  const stale = () => Object.assign(Error('Frame document changed'),{code:'FRAME_DETACHED',details:{inputDispatched:false}});
  const send = id => async (method,args={}) => {
    const hooked = await hooks.send?.(id,method,args);
    if (hooked !== undefined) return hooked;
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

function snapshotFixture() {
  const f=fixture();
  f.hooks.send=(id,method,args)=>{
    const child=f.frames.get(id).child;
    if(method==='Runtime.evaluate'&&args.expression.includes('"snapshotDetails":true'))return {result:{objectId:`snapshot:${id}`}};
    if(method==='Runtime.callFunctionOn'&&args.objectId===`snapshot:${id}`) {
      if(args.arguments)return {result:{objectId:`owner:${id}`}};
      return {result:{value:{lines:[`Document ${id}`,child?'iframe "nested"':`textbox "${id}"`],frames:child?[{line:1,depth:0}]:[],truncated:false}}};
    }
    if(method==='DOM.describeNode'&&args.objectId===`owner:${id}`)return {node:{backendNodeId:9,frameId:child}};
  };
  return f;
}

test('DOM snapshots expand nested routed frames under one output budget',async()=>{
  const f=snapshotFixture();
  const result=await runCDPLocator(f.send,{operation:'domSnapshot',args:{},locator:[]},()=>assert.fail('read-only snapshot registered input'),f.router);
  assert.equal(result.value,'Document top\niframe "nested"\n  Document outer\n  iframe "nested"\n    Document inner\n    textbox "inner"');
  const bounded=await runCDPLocator(f.send,{operation:'domSnapshot',args:{maxNodes:2},locator:[]},()=>{},f.router);
  assert(!bounded.value.includes('Document inner'));assert.match(bounded.value,/\[truncated: maxNodes=2/);
});

test('DOM snapshots reject changed owner topology before publishing any partial text',async()=>{
  const f=snapshotFixture(),original=f.hooks.send;let documents=0;
  f.hooks.send=(id,method,args)=>{
    if(id==='top'&&method==='DOM.describeNode'&&args.objectId==='document:top'&&++documents===2)f.frames.get('top').child=undefined;
    return original(id,method,args);
  };
  await assert.rejects(runCDPLocator(f.send,{operation:'domSnapshot',args:{},locator:[]},()=>{},f.router),{code:'STALE_OBSERVATION',details:{inputDispatched:false}});
});

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

test('managed route cannot focus after an action was cancelled during its second validation',async()=>{
  const entered=Promise.withResolvers(),gate=Promise.withResolvers(),events=[],aborter=new AbortController();let validations=0;
  const send=async(method,args={})=>{
    if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'top'}}};
    if(method==='Page.createIsolatedWorld')return {executionContextId:1};
    if(method==='Runtime.evaluate'){
      if(args.expression==='globalThis.__opencuFrameDocument'&&++validations===2){entered.resolve();await gate.promise;}
      return {result:{value:'document'}};
    }
    events.push(method);return {};
  };
  const router=createCDPFrameRouter(send,()=>()=>{}),route=await router.main();
  const record={page:{keyboard:{insertText:async()=>events.push('insertText')}},session:{send},frameRouter:router,documentGeneration:0,
    elements:new Map([[1,{backendNodeId:42,route}]]),pending:new Set(),keys:new Set(),buttons:new Set()};
  const action=actOnPage(record,{action:'type',text:'must not dispatch',elementId:1,signal:aborter.signal},{});
  await entered.promise;aborter.abort();await assert.rejects(action,{code:'CONTROL_STOPPED'});gate.resolve();
  await Promise.allSettled([...record.pending]);assert.deepEqual(events,[]);assert.equal(record.inputDispatchSequence,undefined);
  await router.close();
});

test('root hit testing never reuses an OOPIF backend number for another element',async()=>{
  let childReads=0;
  const route={frameId:'child',sessionId:'oopif',contextId:2,send:async()=>{childReads++;throw Error('unrelated child must not be read');}};
  const send=async method=>{
    if(method==='Page.getLayoutMetrics')return {layoutViewport:{pageX:0,pageY:0}};
    if(method==='DOM.getNodeForLocation')return {backendNodeId:42};
    if(method==='DOM.resolveNode')return {object:{objectId:'root-node'}};
    if(method==='Runtime.callFunctionOn')return {result:{value:{tagName:'button',url:'https://root.invalid/'}}};
    return {};
  };
  const record={page:{evaluate:async()=>({width:100,height:100})},session:{send},frameRouter:{validate:async()=>{}},
    elements:new Map([[8,{backendNodeId:42,route}]]),nextElementId:8,observationId:'obs'};
  const result=await hitTest(record,{x:10,y:10,coordinateSpace:'css'});
  assert.equal(result.url,'https://root.invalid/');assert.equal(result.elementId,9);assert.equal(childReads,0);
  assert.equal(record.elements.get(8).route,route);
});
