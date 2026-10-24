import test from 'node:test';
import assert from 'node:assert/strict';
import {createTargetCapabilities,createBrowserCapabilities} from '../src/dsh/browser-capabilities.mjs';

function fixture() {
  const state={scope:{},navigation:0,target:{backend:'browser',provider:'dsh',kind:'tab',capabilities:['ax','keyboard'],control:{input:'target-cdp'}},
    available:true,tools:[],calls:[],failure:null};
  const api=createTargetCapabilities({target:()=>state.target,active:()=>state.scope,navigationVersion:()=>state.navigation,show:value=>value,
    act:async(action,args)=>{state.calls.push({action,args});if(state.failure)throw state.failure;
      return {result:action==='siteTools'?{available:state.available,tools:structuredClone(state.tools)}:{output:args.input,untrusted:true}};}});
  return {state,...api};
}
const tool=(name='save',registrationId='native-registration')=>({name,registrationId,inputSchema:{type:'object'},frameId:'main',origin:'https://fixture.test'});

test('optional descriptors use current native inspection availability, including empty tools',async()=>{
  const f=fixture();assert.deepEqual(await f.capabilities.list(),[{id:'webmcp',description:'Discover and call the current document’s native WebMCP site tools.'}]);
  assert.deepEqual(f.capabilities.actions(),['ax','keyboard']);assert.deepEqual(f.capabilities.control(),{input:'target-cdp'});
  const c=await f.capabilities.get('webmcp');assert.match(await c.documentation(),/every user turn/);
  const empty=await c.fetchTools();assert.deepEqual(JSON.parse(empty.description()),{tools:[],untrusted:true});
  f.state.available=false;assert.deepEqual(await f.capabilities.list(),[]);
  await assert.rejects(f.capabilities.get('webmcp'),{code:'UNSUPPORTED_CAPABILITY'});
  await assert.rejects(c.fetchTools(),{code:'UNSUPPORTED_CAPABILITY'});
});

test('standalone, extension and native targets do not probe or advertise WebMCP',async()=>{
  for(const target of [{backend:'browser',provider:'standalone',kind:'tab'},{backend:'browser',provider:'extension',kind:'tab'},{backend:'native',kind:'window'}]) {
    const f=fixture();f.state.target=target;assert.deepEqual(await f.capabilities.list(),[]);
    await assert.rejects(f.capabilities.get('webmcp'),{code:'UNSUPPORTED_CAPABILITY'});
    await assert.rejects(f.legacy.invokeTool('x',{}),{code:'UNSUPPORTED_CAPABILITY'});assert.deepEqual(f.state.calls,[]);
  }
  const browser=createBrowserCapabilities(()=>({}));assert.deepEqual(await browser.list(),[]);assert.deepEqual(browser.actions(),['tabs']);
  await assert.rejects(browser.get('tabs'),{code:'UNSUPPORTED_CAPABILITY'});
});

test('tool collections survive later cells and reject newer fetches and navigation before dispatch',async()=>{
  const f=fixture();f.state.tools=[tool()];const c=await f.capabilities.get('webmcp');
  const prior=await c.fetchTools();f.state.scope={};assert.match(prior.description(),/save/);
  for(const change of [()=>{f.state.navigation++;},async()=>{await c.fetchTools();}]) {
    const collection=await c.fetchTools();await change();const before=f.state.calls.length;
    await assert.rejects(collection.call('save',{}),{code:'STALE_SITE_TOOL'});assert.equal(f.state.calls.length,before);
  }
  const current=await c.fetchTools();assert.deepEqual(await current.call('save',{value:'中文🙂'}),{output:{value:'中文🙂'},untrusted:true});
  assert.deepEqual(f.state.calls.at(-1),{action:'invokeSiteTool',args:{registrationId:'native-registration',input:{value:'中文🙂'}}});
});

test('tool names and JSON inputs validate before dispatch and failed calls invalidate collections',async()=>{
  const f=fixture();f.state.tools=[tool(),tool('save','second')];const c=await f.capabilities.get('webmcp'),dup=await c.fetchTools();
  await assert.rejects(dup.call('save',{}),{code:'AMBIGUOUS_SITE_TOOL'});
  f.state.tools=[tool()];const tools=await c.fetchTools(),before=f.state.calls.length;
  for(const input of [null,[],undefined,{x:Infinity},{x:undefined},{x:1n}])await assert.rejects(tools.call('save',input),TypeError);
  await assert.rejects(tools.call('other',{}),{code:'SITE_TOOL_NOT_FOUND'});assert.equal(f.state.calls.length,before);
  f.state.failure=Object.assign(Error('native registration changed'),{code:'STALE_SITE_TOOL'});
  await assert.rejects(tools.call('save',{}),{code:'STALE_SITE_TOOL'});f.state.failure=null;
  await assert.rejects(tools.call('save',{}),{code:'STALE_SITE_TOOL'});
  assert.deepEqual(await f.legacy.listTools(),[tool()]);
  assert.deepEqual(await f.legacy.invokeTool('native-registration',{x:1}),{output:{x:1},untrusted:true});
});

test('capability arguments and malformed discovery fail explicitly',async()=>{
  const f=fixture();for(const input of ['',null,1])await assert.rejects(f.capabilities.get(input),TypeError);
  await assert.rejects(f.capabilities.get('keyboard'),{code:'UNSUPPORTED_CAPABILITY'});
  await assert.rejects(f.capabilities.list({}),TypeError);f.state.tools=[{name:'save'}];
  await assert.rejects(f.capabilities.list(),{code:'INVALID_SITE_TOOLS'});
});


test('same-named frame tools advertise exact callable aliases and keep registration identity',async()=>{
  const f=fixture();f.state.tools=[tool('echo','main-registration'),{...tool('echo','child-registration'),origin:'https://child.test',frameId:'child'},tool('echo__main-registration','collision-registration')];
  const capability=await f.capabilities.get('webmcp'),collection=await capability.fetchTools(),description=JSON.parse(collection.description());
  assert.equal(new Set(description.tools.map(tool=>tool.name)).size,3);
  const main=description.tools.find(tool=>tool.registrationId==='main-registration'),child=description.tools.find(tool=>tool.registrationId==='child-registration');
  assert.equal(main.nativeName,'echo');assert.equal(child.nativeName,'echo');assert.equal(child.origin,'https://child.test');assert.equal(child.frameId,'child');
  for(const tool of [main,child]){
    await collection.call(tool.name,{value:tool.frameId});
    assert.equal(f.state.calls.at(-1).args.registrationId,tool.registrationId);
  }
  await assert.rejects(collection.call('echo',{}),{code:'AMBIGUOUS_SITE_TOOL'});
  const newer=await capability.fetchTools();await assert.rejects(collection.call(main.name,{}),{code:'STALE_SITE_TOOL'});
  assert.match(newer.description(),/nativeName/);
  f.state.tools=[tool('echo','duplicate'),tool('other','duplicate')];await assert.rejects(capability.fetchTools(),{code:'INVALID_SITE_TOOLS'});
});
