import fs from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Schedule,bounded,ok} from './scheduler.mjs';

export async function fixture(root,parent,{backend='browser',orphan=false}={}) {
  const {createController}=await import(pathToFileURL(join(root,'src/core/controller.mjs')));
  const dataDir=await fs.mkdtemp(join(parent,'case-')),schedule=new Schedule();
  const targets=['a','b'].map(id=>({id:`${backend}:${id}`,backend,provider:backend==='browser'?'dsh':undefined,kind:backend==='browser'?'tab':'app',
    browserId:backend==='browser'?'browser:synthetic':undefined,platform:backend==='native'?'darwin':undefined,
    identity:{occurrence:id,generation:1},url:backend==='browser'?'about:blank':undefined}));
  const humanKeys=new Set(),aiKeys=new Map(),dispatches=[],hooks={};let controller,created=0,operation=0;
  const targetById=id=>targets.find(target=>target.id===id);
  const owned=target=>{if(!aiKeys.has(target.id))aiKeys.set(target.id,new Set());return aiKeys.get(target.id);};
  const bodies={
    listTargets:async()=>targets,listBrowsers:async()=>backend==='browser'?[{id:'browser:synthetic',connected:true}]:[],
    select:async target=>target,verify:async target=>({valid:targetById(target.id)?.identity.generation===target.identity.generation,target}),
    observe:async target=>({ax:{nodes:[{elementId:'button',role:'button',name:'Continue'}]},userActivity:{documentId:'document',sequence:hooks.humanSequence??0}}),
    act:async(target,action)=>{
      if(action.signal?.aborted)throw Object.assign(Error('cancelled before input'),{code:'CONTROL_STOPPED',details:{inputDispatched:false}});
      if(hooks.error)throw hooks.error;
      if(action.action==='keyDown'&&humanKeys.has(action.key))throw Object.assign(Error('Human holds this key'),{code:'INPUT_ALREADY_HELD',details:{inputDispatched:false}});
      dispatches.push({targetId:target.id,action:action.action,operationId:action.verificationOperationId});
      if(action.action==='keyDown')owned(target).add(action.key);
      if(action.action==='keyUp')owned(target).delete(action.key);
      await hooks.afterEffect?.(target,action);
      return {accepted:true,inputDispatched:true};
    },
    release:async()=>{aiKeys.clear();return {released:!hooks.orphan,failures:hooks.orphan?[{targetId:'browser:orphan',code:'STALE_TARGET'}]:[]};},
    releaseTarget:async target=>{aiKeys.delete(target.id);return {released:true};},
    focus:async()=>({focused:true}),away:async()=>({away:true}),permissions:async()=>({accessibility:true}),deliveries:async()=>[],close:async()=>{},
    newTab:async()=>{const target={...targets[0],id:`browser:new-${++created}`,identity:{occurrence:`new-${created}`,generation:1}};targets.push(target);return target;},
    openApplication:async()=>{const target={...targets[0],id:`native:new-${++created}`,identity:{occurrence:`new-${created}`,generation:1}};targets.push(target);return target;},
  };
  const engine=Object.fromEntries(Object.entries(bodies).map(([method,work])=>[method,(...args)=>schedule.call(`${backend}.${method}`,args,()=>work(...args))]));
  hooks.orphan=orphan;
  if(orphan)await fs.writeFile(join(dataDir,'controller.json'),JSON.stringify({version:1,mode:'release_failed',releasePending:true,releaseErrors:[{backend:'browser',failures:[{targetId:'browser:orphan',code:'STALE_TARGET'}]}],targets:[{id:'browser:orphan',backend:'browser',provider:'dsh',identity:{occurrence:'orphan'},releaseAcknowledged:false}]}));
  const oldBrowser=backend==='native'&&orphan?{...engine,release:async()=>({released:false,failures:[{targetId:'browser:orphan',code:'STALE_TARGET'}]}),listTargets:async()=>[],listBrowsers:async()=>[]}:false;
  const open=async directory=>{
    const value=await createController({dataDir:directory,browser:backend==='browser'?engine:oldBrowser,native:backend==='native'?engine:undefined});
    const act=value.act;
    value.act=request=>{const id=++operation;schedule.event('operation',{id,targetId:request?.targetId,action:request?.action,actor:'ai'});return act({...request,verificationOperationId:id});};
    return value;
  };
  controller=await open(dataDir);
  async function bind(target=targets[0]){const selected=ok(await controller.selectTarget(target));if(!selected.target.verified)ok(await controller.resume({targetId:target.id}));ok(await controller.observe({targetId:target.id}));}
  // Native fixture represents only the native hardware stream. Its release is
  // independent of the deliberately orphaned browser provider.
  if(backend==='native')bodies.release=async()=>{aiKeys.clear();return {released:true};};
  // Wrappers resolve the mutable bodies table, including fault recovery changes.
  for(const method of Object.keys(bodies))engine[method]=(...args)=>schedule.call(`${backend}.${method}`,args,()=>bodies[method](...args));
  await bind(targets[0]);await bind(targets[1]);
  return {root,dataDir,schedule,targets,engine,bodies,hooks,humanKeys,aiKeys,dispatches,bind,open,get controller(){return controller;},
    async restart(){const snapshot=await fs.readFile(join(dataDir,'controller.json'));hooks.orphan=false;if(oldBrowser)oldBrowser.release=async()=>({released:true});ok(await bounded(controller.close(),'close before simulated restart'));await fs.writeFile(join(dataDir,'controller.json'),snapshot);controller=await open(dataDir);},
    async cleanup(){schedule.release();hooks.error=undefined;hooks.afterEffect=undefined;hooks.orphan=false;if(oldBrowser)oldBrowser.release=async()=>({released:true});ok(await bounded(controller.close(),'fixture cleanup',2000));await fs.rm(dataDir,{recursive:true,force:true});},
  };
}
