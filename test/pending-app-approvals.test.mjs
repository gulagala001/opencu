import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{createAppApprovals}from'../src/dsh/app-approvals.mjs';
import{createPendingAppApprovals,selectAppApproval}from'../src/client/pending-app-approvals.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const until=async read=>{const end=Date.now()+2000;while(!read()){assert(Date.now()<end,'bounded real pending publication');await new Promise(r=>setTimeout(r,5));}};
const observe=p=>p.then(()=>({ok:true}),e=>({error:e}));
const target={id:'native:synthetic',backend:'native',title:'Synthetic app',identity:{bundleId:'synthetic.app',executable:'/synthetic/app'}};
test('real approvals notify create/final waiter/settlement without leaking identities; notification errors cannot change authorization',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'opencu-pending-'));let notifications=0;
 const approvals=createAppApprovals(()=>dir,()=>{notifications++;throw Error('synthetic notification failure');});
 const a=new AbortController(),b=new AbortController();
 try{
 const first=observe(approvals.authorize(target,'A',a.signal)),second=observe(approvals.authorize(target,'A',b.signal));
 await until(()=>approvals.snapshot().length>0);await tick();
 assert.equal(approvals.snapshot().length,1);assert.equal(notifications,1);
 const request=approvals.snapshot()[0];assert.deepEqual(Object.keys(request),['id','conversationId','request']);assert(!JSON.stringify(request).includes('/synthetic/'));assert(!JSON.stringify(request).includes('executable'));
 a.abort(new Error('one waiter abort'));assert((await first).error);assert.equal(approvals.snapshot().length,1);assert.equal(notifications,1);
 await assert.rejects(approvals.respond({conversationId:'B',requestId:request.id,action:'decline'}),e=>e.code==='APP_REQUEST_EXPIRED');
 await approvals.respond({conversationId:'A',requestId:request.id,action:'decline'});assert.equal((await second).error.code,'APP_ACCESS_DENIED');assert.equal(approvals.snapshot().length,0);assert.equal(notifications,2);
 }finally{await approvals.close();await rm(dir,{recursive:true,force:true});}
});
test('manager deduplicates sessions/UUID; FIFO, retry, stale success, reconnect reset, old snapshots and teardown',async()=>{
 let state={connected:false,revision:0},listener,fail=true,calls=0,off=false;const visible=new Map(),requests=[];
 const client={getSnapshot:()=>state,subscribe:fn=>(listener=fn,()=>{off=true;}),request:async(_m,response)=>{calls++;requests.push(response);if(fail)throw Error('synthetic response failure');return{settled:true};}};
 const publish=(v,delegate)=>{assert(!visible.has(v.key));visible.set(v.key,{v,delegate});return()=>visible.delete(v.key);};
 const manager=createPendingAppApprovals({client,publish});
 const req=(id,conversationId)=>({id,conversationId,request:{appDisplayName:'Synthetic',persistModes:['session','always']}});
 const emit=(revision,appApprovals,connected=true)=>{state={revision,appApprovals,connected};listener();};
 emit(10,[req('a1','A'),req('a1','A'),req('a2','A'),req('b1','B')]);assert.deepEqual([...visible.keys()],['a1','b1']);
 state={connected:true,revision:1000};listener();assert.deepEqual([...visible.keys()],['a1','b1']);emit(10,[req('a1','A'),req('a2','A'),req('b1','B')]);
 assert.equal(selectAppApproval({sessionId:'B',pendingInteraction:visible.get('a1').v}),null);assert(selectAppApproval({sessionId:'A',pendingInteraction:visible.get('a1').v}));
 await assert.rejects(manager.respond({conversationId:'A',requestId:'a1',action:'accept',persist:'session'}));assert(visible.has('a1'));
 fail=false;await manager.respond({conversationId:'A',requestId:'a1',action:'decline'});assert(!visible.has('a1'));assert(visible.has('a2'));
 emit(9,[req('a1','A')]);assert(visible.has('a2'));assert(visible.has('b1'));
 emit(11,[req('a1','A'),req('a2','A')]);assert(!visible.has('a1'));assert(visible.has('a2'));
 emit(11,[],false);assert(visible.has('a2'));emit(1,[req('new','A')]);assert.deepEqual([...visible.keys()],['new']);
 emit(2,[req('new','A'),req('other','B')]);await manager.respond({conversationId:'A',requestId:'a2',action:'decline'});assert(visible.has('new'));
 const before=calls;for(const{delegate}of[...visible.values()])await delegate();assert.equal(calls,before);assert.equal(visible.size,0);
 manager.dispose();assert(off);assert.equal(calls,before);assert.equal(requests.length,calls);
});
test('real pending notification covers independent session callers and failed always-save retains UUID',async()=>{
 const root=await mkdtemp(join(tmpdir(),'opencu-pending-save-'));const bad=join(root,'not-directory');await writeFile(bad,'fixture');let directory=root,changes=0;
 const service=createAppApprovals(()=>directory,()=>changes++);
 const a=new AbortController(),b=new AbortController();
 try{
 const pa=observe(service.authorize(target,'tool-session',a.signal)),pb=observe(service.authorize(target,'preview-session',b.signal));
 await until(()=>service.snapshot().length===2);
 const original=service.snapshot();assert.equal(original.length,2);assert.equal(changes,2);
 directory=bad;await assert.rejects(service.respond({conversationId:original[0].conversationId,requestId:original[0].id,action:'accept',persist:'always'}));assert.deepEqual(service.snapshot(),original);assert.equal(changes,2);
 directory=root;a.abort(Error('last tool waiter'));await pa;assert.equal(service.snapshot().length,1);assert.equal(changes,3);
 b.abort(Error('last preview waiter'));await pb;assert.equal(service.snapshot().length,0);assert.equal(changes,4);
 const pc=observe(service.authorize(target,'tool-session',new AbortController().signal));await until(()=>service.snapshot().length>0);const fresh=service.snapshot()[0];assert.notEqual(fresh.id,original[0].id);
 await assert.rejects(service.respond({conversationId:original[0].conversationId,requestId:original[0].id,action:'decline'}),e=>e.code==='APP_REQUEST_EXPIRED');assert.equal(service.snapshot()[0].id,fresh.id);
 service.cancel('tool-session');assert.equal((await pc).error.code,'APP_APPROVAL_CANCELLED');
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
test('real shared events include tool and direct runtime preview approvals without activity-running inference',async()=>{
 const {Context}=await import('@deepseek-ai/cordis');const{default:plugin}=await import('../src/dsh/index.mjs');
 const dir=await mkdtemp(join(tmpdir(),'opencu-pending-events-')),ctx=new Context();let releases=0;
 const native={listTargets:async()=>[target],select:async()=>target,verify:async()=>({valid:true,target}),observe:async()=>({}),act:async()=>({}),release:async()=>{releases++;return{released:true};},close:async()=>{}};
 let owner;
 try{
 owner=ctx.plugin(plugin,{dataDir:dir,native,browserEnabled:false,nativeEnabled:true,extensionEnabled:false,registerTools:false});await owner;
 const service=ctx.get('opencu'),entry=globalThis[Symbol.for('opencu.shared-root.v1')].get(ctx.root);
 const selecting=observe(service.request('select',{reference:{id:target.id}},{sessionKey:'A'}));
 await until(()=>entry.runtime.pendingAppApprovals().length>0);
 let snapshot=await service.request('events',{after:null});assert.equal(snapshot.appApprovals.length,1);assert.equal(snapshot.appApprovals[0].conversationId,'A');
 const request=snapshot.appApprovals[0];assert.deepEqual(Object.keys(request),['id','conversationId','request']);assert(!JSON.stringify(snapshot.appApprovals).includes('executable'));
 await service.request('appApprovals/respond',{conversationId:'A',requestId:request.id,action:'accept',persist:'session'});assert((await selecting).ok);
 const before=await service.request('events',{after:null});
 const preview=observe(entry.runtime.request('preview',{targetId:target.id},{sessionKey:'B'}));
 await until(()=>entry.runtime.pendingAppApprovals().length>0);
 snapshot=await service.request('events',{after:null});assert(snapshot.revision>before.revision);assert.equal(snapshot.appApprovals[0].conversationId,'B');assert(!snapshot.sessions.some(s=>s.sessionId==='B'&&s.running.length));
 const pending=snapshot.appApprovals[0];await service.request('appApprovals/respond',{conversationId:'B',requestId:pending.id,action:'decline'});assert.equal((await preview).error.code,'APP_ACCESS_DENIED');
 assert.deepEqual((await service.request('events',{after:null})).appApprovals,[]);
 }finally{await owner?.dispose();await ctx.fiber.dispose();assert(releases>0);await rm(dir,{recursive:true,force:true});}
});
