import {runInNewContext} from 'node:vm';
import {installDocumentRuntime} from '../../extension/content.js';

// Execute the production serialized DOM locator; only its CDP/page boundary is
// synthetic. Pointer/key dispatch remains the responsibility of each backend.
export function locatorInputFixture() {
  const calls = [], objects = new Map();
  let scrolls = 0, next = 0;
  const box = {x:10,y:20,left:10,top:20,right:50,bottom:40,width:40,height:20};
  const button = {nodeType:1,tagName:'BUTTON',isConnected:true,parentElement:null,
    matches:() => false, getAttribute:() => null, getRootNode:() => ({}),
    getClientRects:() => [box], getBoundingClientRect:() => box,
    scrollIntoView:() => {scrolls++;}};
  const context = {document:{querySelectorAll:() => [button],elementFromPoint:() => button},
    getComputedStyle:() => ({display:'block',visibility:'visible'}), innerWidth:100, innerHeight:100,
    crypto, performance, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
    MutationObserver: class { observe() {} }, visualViewport: null};
  runInNewContext(`(${installDocumentRuntime})()`, context);
  const remote = (value, byValue = false) => {
    if (byValue || value == null || typeof value !== 'object') return {result:{value}};
    const objectId = String(++next); objects.set(objectId,value);
    return {result:{objectId,...(value === button ? {subtype:'node'} : {})}};
  };
  const send = async (method, args = {}) => {
    calls.push({method,args});
    if (method === 'Runtime.evaluate') return remote(runInNewContext(args.expression,context),args.returnByValue);
    if (method === 'Runtime.callFunctionOn') return remote(await runInNewContext(`(${args.functionDeclaration})`,context)
      .call(objects.get(args.objectId),...(args.arguments ?? []).map(item => item.value)),args.returnByValue);
    if (method === 'Runtime.releaseObject') {objects.delete(args.objectId);return {};}
    if (method === 'DOM.describeNode') return {node:{backendNodeId:1}};
    if (method === 'DOM.getBoxModel') return {model:{content:[10,20,50,20,50,40,10,40]}};
    return {};
  };
  const route = {send,frameId:'main',sessionFrameId:'main',documentId:'document',owners:[]};
  const router = {main:async() => route,validate:async() => {},original:value => value,
    remoteElement:async() => { const id = String(++next); objects.set(id,button); return id; },
    point:async() => ({x:30,y:30}),checkPoint:async() => {},focused:async() => route,atPoint:async() => ({route,backendNodeId:1})};
  return {send,router,calls,get scrolls(){return scrolls;}};
}
