import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const source=await readFile(new URL('../host/site-tools.ts',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'ts',format:'esm',target:'node22'});
const moduleCode=code.replace('./opencu-frame-router.js',new URL('../extension/frame-router.js',import.meta.url).href);
const {inspectSiteTools,invokeSiteTool,beginSiteTool,cancelSiteTool}=await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString('base64')}`);

async function fixture() {
  const guest=new EventEmitter();guest.debugger=new EventEmitter();guest.getURL=()=> 'https://fixture.test/';guest.isDestroyed=()=>false;
  const state={loader:'document-1',tools:[{name:'save',origin:'https://fixture.test',description:'Save',inputSchema:{type:'object'}}],calls:[],invoke:null};
  const send=async(method,args)=>{
    state.calls.push({method,args});
    if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main',loaderId:state.loader,url:guest.getURL()}}};
    if(method==='Page.createIsolatedWorld')return {executionContextId:1};
    if(method==='Runtime.evaluate')return {result:{value:{available:true,tools:state.tools,registrationVersion:state.registrationVersion}}};
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
  for(const change of [state=>{state.loader='document-2';},state=>{state.registrationVersion='replacement';},state=>{state.tools[0]={...state.tools[0],description:'Updated'};}]){
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


test('native exceptions retain the description when errorText is empty',async()=>{
  const f=await fixture();f.state.invoke=()=>{f.guest.debugger.emit('message',{},'WebMCP.toolResponded',{invocationId:'own',status:'Error',errorText:'',exception:{description:'Error: native fixture rejection',objectId:'native-error'}});return {invocationId:'own'};};
  await assert.rejects(invokeSiteTool(f.guest,f.send,{registrationId:f.descriptor.registrationId,input:{}},new AbortController().signal),
    error=>error.code==='SITE_TOOL_ERROR' && /native fixture rejection/.test(error.message) && error.details.inputDispatched===true);
  assert.deepEqual(f.state.calls.find(row=>row.method==='Runtime.releaseObject')?.args,{objectId:'native-error'});
});

test('completed responses before acknowledgement win over a concurrent abort',async()=>{
  const f=await fixture(),controller=new AbortController();
  f.state.invoke=()=>{controller.abort(Error('user cancelled'));response(f.guest,'own','already completed');return {invocationId:'own'};};
  await assert.rejects(invokeSiteTool(f.guest,f.send,{registrationId:f.descriptor.registrationId,input:{}},controller.signal),error=>/user cancelled/.test(error.message)&&error.code!=='SITE_TOOL_CANCEL_FAILED');
  assert.equal(f.state.calls.filter(row=>row.method==='WebMCP.cancelInvocation').length,0);
  assert.equal(f.guest.debugger.listenerCount('message'),0);
});

test('navigation and lost targets promptly end in-flight native calls with dispatch evidence',async()=>{
  for(const event of ['navigation','frame-detach','process-exit','debugger-detach']){
    const f=await fixture();f.state.invoke=()=>{queueMicrotask(()=>{
      if(event==='navigation')f.guest.debugger.emit('message',{},'Page.frameNavigated',{frame:{id:'main'}});
      if(event==='frame-detach')f.guest.debugger.emit('message',{},'Page.frameDetached',{frameId:'main'});
      if(event==='process-exit')f.guest.emit('render-process-gone');
      if(event==='debugger-detach')f.guest.debugger.emit('detach');
    });return {invocationId:'own'};};
    await assert.rejects(invokeSiteTool(f.guest,f.send,{registrationId:f.descriptor.registrationId,input:{}},new AbortController().signal),
      error=>error.code===(event==='debugger-detach'?'SITE_TOOL_CANCEL_FAILED':'SITE_TOOL_CONTEXT_CHANGED') && error.details.inputDispatched===true);
    for(const name of ['message','detach'])assert.equal(f.guest.debugger.listenerCount(name),0);
    for(const name of ['destroyed','render-process-gone'])assert.equal(f.guest.listenerCount(name),0);
  }
});
