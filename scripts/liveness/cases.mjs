import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture} from './fixture.mjs';
import {bounded,flush,ok} from './scheduler.mjs';

const readPorts=['listTargets','verify','observe','deliveries'];
const mutations=['select','act','focus','release','close'];
export function cases() {
  const out=[];
  const add=(family,backend,values={})=>out.push({version:1,id:[family,backend,...Object.values(values)].join('/'),family,backend,...values});
  for(const backend of ['browser','native']) {
    for(const port of [...readPorts,...backend==='browser'?['listBrowsers']:['permissions']])
      for(const action of ['stop','interrupt'])add('cancel-read',backend,{port,action});
    for(const port of [...mutations,...backend==='browser'?['newTab','releaseTarget']:['openApplication']])
      for(const mode of ['reject-before','hold-after'])add('boundary-fault',backend,{port,mode});
    for(const human of ['click','type','scroll','focus','resize','navigate','dialog','held-key'])
      for(const phase of ['before','observing','acting','recovering'])add('human',backend,{human,phase});
    for(const surface of ['worker','repl'])for(const stop of ['fault','explicit-stop'])add('continuation',backend,{surface,stop});
    add('restart',backend);add('persistence',backend);
  }
  return out;
}
function invoke(f,port) {
  const c=f.controller,targetId=f.targets[0].id;
  const calls={listTargets:()=>c.listTargets(),listBrowsers:()=>c.listTargets(),verify:()=>c.observe({targetId}),observe:()=>c.observe({targetId}),
    select:()=>c.selectTarget(f.targets[0]),act:()=>c.act({targetId,action:'click'}),focus:()=>c.focus({targetId}),
    release:()=>c.stop(),close:()=>c.close(),releaseTarget:()=>c.resume({targetId}),
    newTab:()=>c.openTarget({browserId:'browser:synthetic',url:'about:blank'}),
    openApplication:()=>c.openTarget({backend:'native',path:'/Applications/Synthetic.app',launch:true}),
    permissions:()=>c.permissions(),deliveries:()=>c.deliveries()};
  return calls[port]();
}
async function progress(f) {
  const c=f.controller;
  for(const target of f.targets.slice(0,2)) {
    await f.bind(target);
    ok(await bounded(c.act({targetId:target.id,action:'click'}),'continued input'));
  }
  assert.equal((await c.getState()).state.mode,'active');
}
async function human(f,kind) {
  f.hooks.humanSequence=(f.hooks.humanSequence??0)+1;
  f.schedule.event('human',{kind,targetId:f.targets[0].id});
  if(kind==='held-key')f.humanKeys.add('Shift');
  ok(await f.controller.notifyUserActivity({targetId:f.targets[0].id,kind}));
}
export async function runCase(spec,{root,parent,mutation}) {
  const f=await fixture(root,parent,{backend:spec.backend,orphan:spec.family==='continuation'});
  const c=f.controller,targetId=f.targets[0].id;let error,cleanupError;
  if(mutation==='human-stop'){const notify=c.notifyUserActivity;c.notifyUserActivity=async args=>{const result=await notify(args);await c.stop();return result;};}
  else if(mutation==='duplicate-input'){const act=f.bodies.act;f.bodies.act=async(...args)=>{const result=await act(...args);await act(...args);return result;};}
  else if(mutation==='release-human'){const release=f.bodies.release;f.bodies.release=async()=>{const result=await release();f.humanKeys.clear();return result;};}
  else if(mutation!==undefined)throw Error('Unknown verifier mutation');
  try {
    if(spec.family==='cancel-read') {
      const fault=f.schedule.arm(`${spec.backend}.${spec.port}`,'hold-before');
      const work=invoke(f,spec.port);
      await bounded(fault.entered.promise,'reach read boundary');
      if(['permissions','deliveries'].includes(spec.port))ok(await bounded(c.act({targetId:f.targets[1].id,action:'click'}),'unrelated input while passive read is stalled'));
      const cancel=c[spec.action]();
      const result=await bounded(work,'cancelled '+spec.port);
      assert.equal(result.ok,false);ok(await bounded(cancel,'release after '+spec.port));
      fault.gate.resolve();await flush();f.schedule.assertInjected(fault);await progress(f);
    } else if(spec.family==='boundary-fault') {
      if(spec.port==='releaseTarget')ok(await c.interrupt());
      const fault=f.schedule.arm(`${spec.backend}.${spec.port}`,spec.mode);
      const work=invoke(f,spec.port);await bounded(fault.entered.promise,'reach mutation boundary');
      let stopped;
      if(spec.mode==='hold-after'&&!['release','close'].includes(spec.port))stopped=c.stop();
      fault.gate.resolve();const result=await bounded(work,'mutation outcome');
      if(spec.mode==='reject-before'||stopped)assert.equal(result.ok,false);
      if(stopped){ok(await bounded(stopped,'stop after mutation'));assert.equal((await c.getState()).state.explicitlyStopped,true,'late completion must not regain authority');}
      f.schedule.assertInjected(fault);
      if(spec.port==='close') {if(!result.ok)ok(await c.close());}
      else await progress(f);
    } else if(spec.family==='human') {
      if(spec.phase==='recovering')ok(await c.interrupt());
      let work,fault;
      if(spec.phase!=='before') {
        const port=spec.phase==='observing'?'observe':spec.phase==='acting'?'act':'verify';
        fault=f.schedule.arm(`${spec.backend}.${port}`,'hold-after');
        work=spec.phase==='recovering'?c.resume({targetId}):invoke(f,port);
        await bounded(fault.entered.promise,'human intervention phase');
      }
      await human(f,spec.human);
      if(fault){fault.gate.resolve();ok(await bounded(work,'operation after human intervention'));f.schedule.assertInjected(fault);}
      assert.equal((await c.getState()).state.explicitlyStopped,false,'human activity must not become stop');
      if(spec.human==='held-key') {
        const result=await c.act({targetId,action:'keyDown',key:'Shift'});
        assert.equal(result.error?.code,'INPUT_ALREADY_HELD');assert.equal(f.humanKeys.has('Shift'),true);
      } else if(['focus','resize','navigate','dialog'].includes(spec.human)) {
        const code=({focus:'TARGET_WINDOW_NOT_ACTIVE',resize:'STALE_SCREENSHOT',navigate:'STALE_ELEMENT',dialog:'MODAL_BLOCKED'})[spec.human];
        f.hooks.error=Object.assign(Error('Human changed the current view'),{code,details:{inputDispatched:false}});
        const result=await c.act({targetId,action:'click'});assert.equal(result.ok,false);
        assert.equal(result.state.mode,'active','a human-caused pre-dispatch refusal must preserve control');f.hooks.error=undefined;
      }
      await progress(f);assert.equal(f.humanKeys.size,spec.human==='held-key'?1:0);
    } else if(spec.family==='continuation') {
      const module=await import(pathToFileURL(join(root,spec.surface==='worker'?'src/dsh/computer.mjs':'src/dsh/computer-repl.mjs')));
      const create=module[spec.surface==='worker'?'createComputerSession':'createComputerRepl'];
      const names={state:'getState',targets:'listTargets',select:'selectTarget'};
      const request=(method,args={})=>c[names[method]??method](method==='select'?args.reference:args);
      let computer=create(request);const bind=`var target=await cua.${spec.backend==='native'?'getApp':'getTab'}(${JSON.stringify(targetId)});`;
      try {
        await bounded(computer.run({code:bind}),'binding');
        await computer.run({code:'await target.keyDown("Control");'});
        if(spec.stop==='explicit-stop')await assert.rejects(computer.run({code:'await cua.stop();'}));
        else {f.hooks.error=Error('uncertain backend reply');await assert.rejects(computer.run({code:'await target.click([10,10]);'}));f.hooks.error=undefined;}
        await bounded(computer.run({code:`await cua.resume(${JSON.stringify(targetId)}); await target.getAXState();`}), 'recovery');
        await bounded(computer.reset(),'idle reset');
        assert.equal((await c.getState()).state.mode,'active');
        await computer.run({code:bind});await computer.run({code:'await target.click([10,10]);'});await computer.close();
        computer=create(request);await computer.run({code:bind});await computer.run({code:'await target.click([10,10]);'});
      } finally {f.hooks.error=undefined;await bounded(computer.close(),'session cleanup');}
      await progress(f);
    } else if(spec.family==='restart') {
      ok(await c.act({targetId,action:'keyDown',key:'Control'}));await f.restart();
      assert.equal((await f.controller.act({targetId,action:'click'})).ok,false,'cold state cannot restore input authority');
      await progress(f);
    } else if(spec.family==='persistence') {
      const file=join(f.dataDir,'controller.json'),backup=file+'.before';
      f.hooks.afterEffect=async()=>{f.hooks.afterEffect=undefined;await fs.rename(file,backup);await fs.mkdir(file);};
      try {assert.equal((await c.act({targetId,action:'keyDown',key:'Control'})).ok,false);assert.equal(f.aiKeys.size,0);}
      finally {await fs.rm(file,{recursive:true,force:true});await fs.rename(backup,file);}
      await progress(f);
    } else throw Error('Unknown case family');
    assert.equal(f.schedule.armed,null,'Fault was not consumed');
  } catch(failure){error=failure;}
  finally {try{await f.cleanup();}catch(cleanup){cleanupError={code:cleanup.code??cleanup.name,message:cleanup.message};error??=cleanup;}}
  try {
    const seen=new Set();for(const dispatch of f.dispatches){assert.ok(dispatch.operationId,'dispatch must have a registered owner');assert.equal(seen.has(dispatch.operationId),false,'one requested operation dispatched input twice');seen.add(dispatch.operationId);}
    if(spec.family==='human'&&spec.human==='held-key')assert.equal(f.humanKeys.has('Shift'),true,'cleanup released human-owned input');
  } catch(failure){error??=failure;}
  const trace=f.schedule.snapshot();
  if(trace.pending.length)error??=Object.assign(Error('Backend waiters leaked'),{code:'WAITER_LEAK'});
  return {id:spec.id,ok:!error,error:error?{code:error.code??error.name,message:error.message,stack:error.stack}:undefined,cleanupError,trace};
}
