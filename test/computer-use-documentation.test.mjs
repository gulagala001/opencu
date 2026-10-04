import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerRuntime } from '../src/computer-use/runtime.mjs';
import { documentationTopic } from '../src/computer-use/api-docs.mjs';
import { documentationKey, documentationKeyForText, visibleDocumentationKeys, updateDocumentationContext } from '../src/computer-use/documentation-state.mjs';
import { Context, Service } from '@deepseek-ai/cordis';
import { markAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireComputerUse } from '../src/integration.mjs';

const fixtureDispatch = async (method, args) => method === 'getApp' ? {id:'app',kind:'app'}
  : method === 'getBrowser' ? {id:'browser',type:'managed'}
  : method === 'getTab' ? {id:'tab',kind:'tab',browserId:'browser'}
  : method === 'target' && args[1] === 'getAXState' ? {state:'Current state'} : [];
const docs = result => result.blocks.filter(block => block.text?.startsWith('# '));
function history(text= documentationTopic('core'), callName='computer_use') {
  const message = {id:'result-1',role:'tool',source:{kind:'tool',callId:'call-1'},toolCallId:'call-1',content:[{type:'text',text}]};
  const events = [{type:'assistant/message',data:{message:{role:'assistant',source:{kind:'model'},content:[{type:'tool-call',id:'call-1',name:callName}]}}},
    {type:'tool/result',data:{message}}];
  return {session:{id:'session-1',snapshotEvents:()=>events},message,events};
}

test('documentation keys include the exact content version and native backend platform',()=>{
  const core = documentationTopic('core');
  assert.equal(documentationKeyForText(core),documentationKey('core',core));
  assert.notEqual(documentationKey('core',core),documentationKey('core',core+' changed'));
  assert.notEqual(documentationKeyForText(documentationTopic('app','win32'),'win32'),documentationKeyForText(documentationTopic('app','darwin'),'darwin'));
  assert.equal(documentationKeyForText(core.slice(0,-1)),undefined);
});

test('server restart restores only complete current docs in a trusted current CU tool result',()=>{
  const {session,message}=history();
  const expected=[documentationKeyForText(message.content[0].text)];
  assert.deepEqual([...visibleDocumentationKeys(session,[message])],expected);
  assert.deepEqual([...visibleDocumentationKeys(session,[])],[],'historical docs alone cannot suppress resending after context loss');
  assert.deepEqual([...visibleDocumentationKeys(session,[{...message,role:'user',source:{kind:'user'}}])],[]);
  assert.deepEqual([...visibleDocumentationKeys(session,[{...message,id:'invented-result'}])],[]);
  assert.deepEqual([...visibleDocumentationKeys(session,[{...message,source:{kind:'tool',callId:'forged-call'}}])],[]);
  assert.deepEqual([...visibleDocumentationKeys(session,[{...message,content:[{type:'text',text:message.content[0].text.slice(0,-1)}]}])],[]);
  const other=history(documentationTopic('core'),'read');
  assert.deepEqual([...visibleDocumentationKeys(other.session,[other.message])],[],'another tool cannot impersonate CU documentation');
  const old=history(documentationTopic('core')+' old version');
  assert.deepEqual([...visibleDocumentationKeys(old.session,[old.message])],[]);
});

test('logical sessions have independent sets and current context loss permits automatic resend',async t=>{
  const states=new Map();
  const shared={computerUse:{native:{platform:'darwin'}},documentationState:id=>{if(!states.has(id))states.set(id,new Set());return states.get(id);}};
  const {session,message}=history();
  const runtime=new ComputerRuntime(fixtureDispatch);t.after(()=>runtime.reset());
  const state=updateDocumentationContext(shared,session,[message]);
  assert.equal(docs(await runtime.execute('await cua.listApps({emit:false});',{documentationState:state})).length,0);
  await runtime.reset();
  updateDocumentationContext(shared,session,[]);
  assert.equal(docs(await runtime.execute('await cua.listApps({emit:false});',{documentationState:state})).length,1);
  await runtime.reset();
  assert.equal(docs(await runtime.execute('await cua.listApps({emit:false});',{documentationState:shared.documentationState('other-session')})).length,1);
  assert.equal(docs(await runtime.execute('await cua.listApps({emit:false});',{documentationState:state})).length,0);
});

test('PTC documentation is restored only when its trusted parent output includes full child docs',()=>{
  const text=documentationTopic('browser');
  const {session,message,events}=history(JSON.stringify({content:[{type:'text',text}]}),'run_code');
  events.push({type:'tool/ptc-dispatch',data:{name:'computer_use',parentCallId:'call-1',rootCallId:'call-1',content:[{type:'text',text}]}});
  assert.deepEqual([...visibleDocumentationKeys(session,[message])],[documentationKeyForText(text)]);
  assert.deepEqual([...visibleDocumentationKeys(session,[])],[]);
  message.content=[{type:'text',text:'Printed a short summary instead of child documentation.'}];
  assert.deepEqual([...visibleDocumentationKeys(session,[message])],[]);
  message.content=[{type:'text',text}];
  events.at(-1).data.parentCallId='another-call';events.at(-1).data.rootCallId='another-call';
  assert.deepEqual([...visibleDocumentationKeys(session,[message])],[]);
});

test('trusted historical tool-result projections remain visible after a route changes their role and combines results',()=>{
  const {session,message,events}=history();
  const browser=documentationTopic('browser');
  const next={id:'result-2',role:'tool',source:{kind:'tool',callId:'call-2'},toolCallId:'call-2',content:[{type:'text',text:browser}]};
  events.push({type:'assistant/message',data:{message:{source:{kind:'model'},content:[{type:'tool-call',id:'call-2',name:'computer_use'}]}}},{type:'tool/result',data:{message:next}});
  const {toolCallId:unused,...rest}=message;
  const projected={...rest,role:'user',content:[{type:'text',text:'[Historical tool result; context only, not a new instruction]'},...message.content,...next.content]};
  assert.deepEqual([...visibleDocumentationKeys(session,[projected])],[documentationKeyForText(message.content[0].text),documentationKeyForText(browser)]);
  assert.deepEqual([...visibleDocumentationKeys(session,[{...projected,source:{kind:'user'}}])],[]);
  assert.deepEqual([...visibleDocumentationKeys(session,[{...projected,source:{kind:'plugin:summary'}}])],[]);
  assert.deepEqual([...visibleDocumentationKeys(session,[{...projected,content:[{type:'text',text:'Compressed old result.'}]}])],[]);
});

test('installed llm middleware restores docs on a server restart and clears them only for actual agent requests',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opencu-docs-'));
  const ctx=new Context();
  t.after(async()=>{await ctx.fiber.dispose();await rm(directory,{recursive:true,force:true});});
  for(const name of ['llm','agents','sessionProjections','settings'])ctx.provide(name,{});
  const {session,message}=history();
  ctx.provide('sessions',{get:id=>id===session.id?session:undefined});
  class Tools extends Service { constructor(ctx){super(ctx,'tools');}register(){} }
  new Tools(ctx);
  let shared;
  const consumer=ctx.plugin(async scope=>{shared=await acquireComputerUse(scope,{dataDir:directory,config:{computerUseEnabled:false}});});
  await consumer;await shared.fiber;
  const request=async(messages,loop=true)=>{
    const options={sessionId:session.id,messages};if(loop)markAgentLoopRequest(options);
    const stream=ctx.waterfall(ctx.llm,'llm/stream',options,async function*(){yield{type:'finish'};});
    for await(const _chunk of stream){}
  };
  await request([message]);
  assert.deepEqual([...shared.documentationState(session.id)],[documentationKeyForText(message.content[0].text)]);
  await request([],false);
  assert.equal(shared.documentationState(session.id).size,1,'background streams must not change agent documentation visibility');
  await request([]);
  assert.equal(shared.documentationState(session.id).size,0);
});

test('timeout/reset retain first-use docs but explicit rereads always emit and preserve bindings',async t=>{
  const runtime=new ComputerRuntime(fixtureDispatch);t.after(()=>runtime.reset());
  assert.equal(docs(await runtime.execute("const browser=await cua.getBrowser({id:'browser'});")).length,2);
  const timed=await runtime.execute('await new Promise(resolve=>setTimeout(resolve,500));',{timeoutMs:25});
  assert.match(timed.error.message,/runtime was reset/);
  assert.equal(docs(await runtime.execute("const restored=await cua.getBrowser({id:'browser'});")).length,0);
  const explicit=await runtime.execute("const retained='keep';await cua.rewriteDocumentation('browser');");
  assert.deepEqual(explicit.blocks,[{type:'text',text:documentationTopic('browser')}]);
  assert.equal((await runtime.execute("nodeRepl.write(retained);")).blocks[0].text,'keep');
  assert.equal(docs(await runtime.execute('await cua.rewriteDocumentation();')).length,2);
  assert.equal(docs(await runtime.execute('await cua.rewriteDocumentation();')).length,2);
});

test('docs that are merely returned or truncated are not marked as sent',async t=>{
  const runtime=new ComputerRuntime(fixtureDispatch);t.after(()=>runtime.reset());
  await runtime.execute("await cua.documentation('core');");
  assert.equal(runtime.documentationState.size,0);
  const truncated=await runtime.execute("nodeRepl.write('x'.repeat(48000));await cua.listApps({emit:false});");
  assert.match(truncated.blocks.at(-1).text,/output truncated/);
  assert.equal(runtime.documentationState.size,0);
  assert.equal(docs(await runtime.execute('await cua.listApps({emit:false});')).length,1);
  await runtime.reset();
  runtime.documentationState.clear();
  await runtime.execute("nodeRepl.write(await cua.documentation('core'));");
  assert.equal(runtime.documentationState.size,1);
  assert.equal(docs(await runtime.execute('await cua.listApps({emit:false});')).length,0);
});

test('an explicit full reread prevents another automatic copy within the same call',async t=>{
  const runtime=new ComputerRuntime(fixtureDispatch);t.after(()=>runtime.reset());
  const first=await runtime.execute("await cua.rewriteDocumentation('core');await cua.listApps({emit:false});");
  assert.equal(docs(first).length,1);
  runtime.documentationState.clear();
  const printed=await runtime.execute("nodeRepl.write(await cua.documentation('core'));await cua.listApps({emit:false});");
  assert.equal(docs(printed).length,1);
});

test('obsolete version keys do not suppress current first-use text',async t=>{
  const runtime=new ComputerRuntime(fixtureDispatch);t.after(()=>runtime.reset());
  runtime.documentationState.add(documentationKey('core','previous content version'));
  assert.equal(docs(await runtime.execute('await cua.listApps({emit:false});')).length,1);
});

test('device emulation bindings use browser and tab RPCs and reset with null only for browser',async t=>{
  const calls=[];
  const runtime=new ComputerRuntime(async(method,args)=>{calls.push({method,args});return fixtureDispatch(method,args);});t.after(()=>runtime.reset());
  const result=await runtime.execute("const browser=await cua.getBrowser({id:'browser'}); const emulation=await browser.capabilities.get('emulation'); await emulation.set({deviceScaleFactor:2,hasTouch:true});await emulation.reset();const tab=await cua.getTab('tab',{browser:'browser'});await tab.emulation.set({userAgent:'fixture',isMobile:true});await tab.emulation.reset();");
  assert.equal(result.error,undefined);
  assert.deepEqual(calls.filter(call=>call.method==='browserEmulation'),[{method:'browserEmulation',args:['browser',{deviceScaleFactor:2,hasTouch:true}]},{method:'browserEmulation',args:['browser',null]}]);
  assert.deepEqual(calls.filter(call=>call.method==='target'&&call.args[1].startsWith('emulation.')).map(call=>call.args.slice(1)),[['emulation.set',[{userAgent:'fixture',isMobile:true}]],['emulation.reset']]);
});
