import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const {code}=await transform(await readFile(new URL('../host/guest-adapter.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs',target:'node22'});

function fixture(){
  const session={},owner={isDestroyed:()=>false},calls=[];let gate=Promise.resolve();
  const modules={electron:{app:new EventEmitter(),session:{fromPartition:()=>session}},
    './opencu-permissions.ts':{OpenCUPermissions:class{release(){}}},
    './opencu-automation.ts':{resolveOpenCUNavigation:()=>{},cancelOpenCUUpload:()=>{},releaseOpenCUInput:async()=>{},openCUAutomation:async()=>{},settleDestroyedOpenCUInput:async guest=>{assert.equal(guest.isDestroyed(),true);calls.push(guest.id);await gate;return {released:true,retired:true};}},
    './opencu-site-tools.ts':{cancelSiteTool:async()=>{}},'./opencu-extensions.ts':{prepareOpenCUExtensions(){},attachOpenCUExtensionGuest(){}},'./opencu-profile.ts':{},'./opencu-downloads.ts':{},'./opencu-dialogs.ts':{openCUDialogs(){}}};
  const module={exports:{}};new Function('require','module','exports',code)(name=>{assert(modules[name],name);return modules[name];},module,module.exports);
  const adapter=new module.exports.OpenCUGuests();
  const attach=id=>{let closed=false;const guest=Object.assign(new EventEmitter(),{id,session,isDestroyed:()=>closed,setBackgroundThrottling(){}}),lease=adapter.reserve(owner,()=>{});lease.attached=true;lease.guest=guest;adapter.attach(lease,guest,'lease-'+id);return {guest,lease,close:()=>{closed=true;guest.emit('destroyed');}};};
  return {owner,adapter,calls,attach,setGate:value=>{gate=value;}};
}

test('host close receipts wait for original native cleanup and cannot be borrowed by another owner or lease',async()=>{
  const f=fixture(),g=f.attach(9),gate=Promise.withResolvers();f.setGate(gate.promise);
  assert.equal(f.adapter.closedRelease(f.owner,'lease-9','automation','closedState',{}),undefined);
  assert.deepEqual(await f.adapter.operate(f.owner,g.lease,'automation','closedState',{},()=>false),{closed:false});
  g.close();let settled=false;const release=f.adapter.closedRelease(f.owner,'lease-9','automation','releaseInput',{}).then(value=>{settled=true;return value;});
  await Promise.resolve();assert.equal(settled,false);assert.equal(f.adapter.closedRelease({isDestroyed:()=>false},'lease-9','automation','closedState',{}),undefined);
  assert.equal(f.adapter.closedRelease(f.owner,'unknown','automation','releaseInput',{}),undefined);
  gate.resolve();assert.deepEqual(await release,{released:true,retired:true,closed:true,leaseId:'lease-9',webContentsId:9});
  assert.deepEqual(f.calls,[9]);assert.equal(f.adapter.closedRelease(f.owner,'lease-9','automation','input',{}),undefined);
});

test('completed host close receipts are bounded without admitting an evicted or mismatched lease',async()=>{
  const f=fixture();for(let id=1;id<=130;id++){f.attach(id).close();await f.adapter.closedRelease(f.owner,'lease-'+id,'automation','closedState',{});}
  assert.equal(f.adapter.closedRelease(f.owner,'lease-1','automation','releaseInput',{}),undefined);
  assert.equal((await f.adapter.closedRelease(f.owner,'lease-130','automation','releaseInput',{})).webContentsId,130);
});

test('an unconfirmed native cleanup retains its exact lease for a later successful retry',async()=>{
  const f=fixture(),gate=Promise.withResolvers();f.setGate(gate.promise);f.attach(9).close();
  const release=f.adapter.closedRelease(f.owner,'lease-9','automation','releaseInput',{});
  gate.reject(Error('native input still pending'));await assert.rejects(release,/native input still pending/);
  f.setGate(Promise.resolve());const retried=await f.adapter.closedRelease(f.owner,'lease-9','automation','releaseInput',{});
  assert.equal(retried.retired,true);assert.equal(retried.webContentsId,9);assert.deepEqual(f.calls,[9,9]);
});
