import test from 'node:test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';
test('managed browser reconfiguration preserves failed release for retry',async()=>{
const dir=await mkdtemp(join(tmpdir(),'opencu-reconfigure-review-'));
let rejectRelease=true,oldCloses=0,newInventories=0,oldReleases=0;
const old={listTargets:async()=>[],release:async()=>{oldReleases++;return {released:!rejectRelease,failures:rejectRelease?[{message:'synthetic held input'}]:[]};},close:async()=>{oldCloses++;}};
const fresh={listTargets:async()=>{newInventories++;return[];},release:async()=>({released:true}),close:async()=>{}};
for(const backend of [old,fresh]) for(const method of ['observe','select','verify','act']) backend[method]=async()=>{throw Error('Unexpected '+method);};
let config={dataDir:dir,browser:old,nativeEnabled:false,extensionEnabled:false,managedHeadless:false};
const runtime=createPluginRuntime({getConfig:()=>config});
try {
 assert.equal((await runtime.request('targets')).ok,true);
 config={...config,browser:fresh,managedHeadless:true};
 await assert.rejects(runtime.request('reconfigure'),e=>e.code==='RELEASE_FAILED');
 assert.equal(oldCloses,0);assert.equal(newInventories,0);
 await assert.rejects(runtime.request('targets'),e=>e.code==='RELEASE_FAILED');
 assert.equal(newInventories,0);
 rejectRelease=false;
 assert.equal((await runtime.request('reconfigure')).ok,true);assert.equal(oldCloses,1);
 assert.equal((await runtime.request('targets')).ok,true);assert.equal(newInventories,1);
 console.log(JSON.stringify({pass:true,oldReleases,oldCloses,newInventories,case:'failed release blocks replacement; successful retry reconfigures'}));
}finally{rejectRelease=false;await runtime.close();await rm(dir,{recursive:true,force:true});}

});

test('a cancelled caller leaves shared reconfiguration available to another session',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'opencu-reconfigure-cancel-'));
 const entered=Promise.withResolvers(),gate=Promise.withResolvers();let delayed=false;
 const backend={listTargets:async()=>[],release:async()=>{if(delayed){entered.resolve();await gate.promise;}return {released:true};},close:async()=>{}};
 for(const method of ['observe','select','verify','act'])backend[method]=async()=>{throw Error('unused');};
 let config={dataDir:dir,browser:backend,nativeEnabled:false,extensionEnabled:false,managedHeadless:false};
 const runtime=createPluginRuntime({getConfig:()=>config});
 try {
  assert.equal((await runtime.request('state')).ok,true);delayed=true;config={...config,managedHeadless:true};
  const aborter=new AbortController(),request=runtime.request('state',{}, {signal:aborter.signal});
  const rejected=assert.rejects(request,e=>e.code==='CONTROL_STOPPED');await entered.promise;aborter.abort();
  let timer;try{await Promise.race([rejected,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cancelled caller waited for shared startup')),500);})]);}finally{clearTimeout(timer);}
  delayed=false;gate.resolve();assert.equal((await runtime.request('state')).ok,true);
 }finally{delayed=false;gate.resolve();await runtime.close();await rm(dir,{recursive:true,force:true});}
});
