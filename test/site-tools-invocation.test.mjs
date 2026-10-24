import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const source=await readFile(new URL('../host/site-tools.ts',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'ts',format:'esm',target:'node22'});
const {inspectSiteTools,invokeSiteTool,beginSiteTool,cancelSiteTool}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

async function fixture() {
  const guest=new EventEmitter();guest.debugger=new EventEmitter();guest.getURL=()=> 'https://fixture.test/';guest.isDestroyed=()=>false;
  const state={loader:'document-1',tools:[{name:'save',origin:'https://fixture.test',description:'Save',inputSchema:{type:'object'}}],calls:[],invoke:null};
  const send=async(method,args)=>{
    state.calls.push({method,args});
    if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main',loaderId:state.loader,url:guest.getURL()}}};
    if(method==='Page.createIsolatedWorld')return {executionContextId:1};
    if(method==='Runtime.evaluate')return {result:{value:{available:true,tools:state.tools}}};
    if(method==='WebMCP.invokeTool')return state.invoke();
    return {};
  };
  const descriptor=(await inspectSiteTools(guest,send)).tools[0];
  return {guest,state,send,descriptor};
}
const response=(guest,id,output)=>guest.debugger.emit('message',{},'WebMCP.toolResponded',{invocationId:id,status:'Completed',output});

test('immediate native responses before command acknowledgement are retained',async()=>{
  const f=await fixture();f.state.invoke=()=>{response(f.guest,'unrelated','ignore');response(f.guest,'own','saved');return {invocationId:'own'};};
  const aborter=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{aborter.abort(Error('test cleanup'));reject(Error('response lost before acknowledgement'));},100);});
  try {assert.equal((await Promise.race([invokeSiteTool(f.guest,f.send,{registrationId:f.descriptor.registrationId,input:{}},aborter.signal),timeout])).output,'saved');}
  finally {clearTimeout(timer);}
  assert.equal(f.guest.debugger.listenerCount('message'),0);assert.equal(f.guest.listenerCount('destroyed'),0);
});

test('navigation and changed descriptors reject stale registration IDs before invocation',async()=>{
  for(const change of [state=>{state.loader='document-2';},state=>{state.tools[0]={...state.tools[0],description:'Updated'};}]){
    const f=await fixture();change(f.state);
    await assert.rejects(invokeSiteTool(f.guest,f.send,{registrationId:f.descriptor.registrationId,input:{}},new AbortController().signal),{code:'STALE_SITE_TOOL'});
    assert.equal(f.state.calls.filter(row=>row.method==='WebMCP.invokeTool').length,0);
  }
});

test('cancellation before acknowledgement cancels only the acquired native invocation',async()=>{
  const f=await fixture(),invocation=beginSiteTool(f.guest,'request-1');let acknowledge,started;
  const ready=new Promise(resolve=>{started=resolve;});f.state.invoke=()=>{started();return new Promise(resolve=>{acknowledge=resolve;});};
  const work=invokeSiteTool(f.guest,f.send,{registrationId:f.descriptor.registrationId,input:{}},invocation.controller.signal);
  const result=work.then(value=>({value}),error=>({error}));await ready;
  const cancelled=cancelSiteTool(f.guest,'request-1');acknowledge({invocationId:'own'});
  const outcome=await result;assert.match(outcome.error.message,/cancelled/);assert.equal(outcome.error.details.inputDispatched,true);invocation.finish();
  assert.deepEqual(await cancelled,{cancelled:true});assert.deepEqual(await cancelSiteTool(f.guest),{cancelled:false});
  assert.deepEqual(f.state.calls.filter(row=>row.method==='WebMCP.cancelInvocation').map(row=>row.args),[{invocationId:'own'}]);
  assert.equal(f.guest.debugger.listenerCount('message'),0);
});

test('unknown invocation transport failures retain dispatched semantics and clean listeners',async()=>{
  const f=await fixture();f.state.invoke=()=>{throw Error('lost acknowledgement after send');};
  await assert.rejects(invokeSiteTool(f.guest,f.send,{registrationId:f.descriptor.registrationId,input:{}},new AbortController().signal),
    error=>error.code==='SITE_TOOL_CANCEL_FAILED' && error.details?.inputDispatched===true && error.details?.effectVerified===false && /lost acknowledgement/.test(error.message));
  assert.equal(f.guest.debugger.listenerCount('message'),0);assert.equal(f.guest.listenerCount('destroyed'),0);
});
