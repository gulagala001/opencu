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

// Load the unchanged production module with an observed Map constructor so collection
// is asserted directly, without adding a diagnostic API to the manager.
async function deferredManager() {
 const {SourceTextModule,createContext}=await import('node:vm');const maps=[];
 class ObservedMap extends Map {constructor(...args){super(...args);maps.push(this);}}
 const module=new SourceTextModule(await readFile(new URL('../src/client/pending-app-approvals.mjs',import.meta.url),'utf8'),{context:createContext({Map:ObservedMap})});
 await module.link(()=>{throw Error('unexpected dependency');});await module.evaluate();
 let state={connected:false,revision:0},listener,publications=0,unsubscribed=false;
 const visible=new Map(),calls=[];
 const client={getSnapshot:()=>state,subscribe:fn=>(listener=fn,()=>{unsubscribed=true;}),request:(method,response)=>new Promise((resolve,reject)=>calls.push({method,response,resolve,reject}))};
 const manager=module.namespace.createPendingAppApprovals({client,publish:(value,delegate)=>{publications++;visible.set(value.key,{value,delegate});return()=>visible.delete(value.key);}});
 const req=(id,conversationId='A')=>({id,conversationId,request:{appDisplayName:'Synthetic'}});
 const emit=(revision,appApprovals,connected=true)=>{state={revision,appApprovals,connected};listener();};
 const event=()=>{let resolve;const pending=new Promise(done=>{resolve=done;}).then(args=>emit(...args));return{pending,resolve};};
 const respond=(id='a',conversationId='A')=>manager.respond({requestId:id,conversationId,action:'decline'});
 return {manager,visible,calls,req,emit,event,respond,tombstones:maps[1],publications:()=>publications,unsubscribed:()=>unsubscribed};
}
test('deferred: deletion snapshot before HTTP success preserves the new card and needs no tombstone',async()=>{
 const h=await deferredManager();try{
 h.emit(10,[h.req('a')]);const pending=h.respond();assert.equal(h.calls.length,1);
 h.emit(11,[h.req('next')]);h.calls[0].resolve({settled:true});await pending;
 assert.deepEqual([...h.visible.keys()],['next']);assert.equal(h.tombstones.size,0);
 }finally{h.manager.dispose();}
});
test('deferred: HTTP success suppresses an in-flight old snapshot until a newer complete absence confirms collection',async()=>{
 const h=await deferredManager();try{
 h.emit(10,[h.req('a'),h.req('b','B')]);const oldEvent=h.event(),pending=h.respond();h.calls[0].resolve({settled:true});await pending;
 assert.equal(h.tombstones.size,1);assert.deepEqual([...h.visible.keys()],['b']);
 oldEvent.resolve([11,[h.req('a'),h.req('b','B')]]);await oldEvent.pending;assert.equal(h.tombstones.size,1);assert(!h.visible.has('a'));
 // Same-connection older and equal snapshots are not collection evidence.
 h.emit(10,[h.req('b','B')]);h.emit(11,[h.req('b','B')]);assert.equal(h.tombstones.size,1);
 // A local successful response reprojects the cached snapshot; it cannot collect a.
 const b=h.respond('b','B');h.calls[1].resolve({settled:true});await b;assert.equal(h.tombstones.size,2);
 h.emit(12,[]);assert.equal(h.tombstones.size,0);assert.equal(h.visible.size,0);
 h.emit(11,[h.req('a'),h.req('b','B')]);assert.equal(h.visible.size,0);
 }finally{h.manager.dispose();}
});
test('deferred: success while disconnected and a lower-revision reconnect preserve other sessions',async()=>{
 const h=await deferredManager();try{
 h.emit(100,[h.req('a'),h.req('b','B')]);const pending=h.respond();
 h.emit(100,[h.req('a'),h.req('b','B')],false);h.calls[0].resolve({settled:true});await pending;
 assert.equal(h.tombstones.size,1);assert.deepEqual([...h.visible.keys()],['b']);
 h.emit(1,[h.req('a'),h.req('b','B')]);assert(!h.visible.has('a'));assert(h.visible.has('b'));assert.equal(h.tombstones.size,1);
 h.emit(2,[h.req('b','B')]);assert.equal(h.tombstones.size,0);assert(h.visible.has('b'));
 }finally{h.manager.dispose();}
});
test('deferred: reconnect absence before the old response uses generation ordering, not mixed revisions',async()=>{
 const h=await deferredManager();try{
 h.emit(100,[h.req('a'),h.req('b','B')]);const pending=h.respond();h.emit(100,[],false);
 h.emit(1,[h.req('b','B')]);h.calls[0].resolve({settled:true});await pending;
 assert.equal(h.tombstones.size,0);assert.deepEqual([...h.visible.keys()],['b']);
 }finally{h.manager.dispose();}
});
test('deferred: teardown prevents late responses and queued event callbacks from publishing or issuing actions',async()=>{
 const h=await deferredManager();h.emit(10,[h.req('a')]);const pending=h.respond(),event=h.event(),before=h.publications();
 h.manager.dispose();assert(h.unsubscribed());event.resolve([11,[h.req('next')]]);await event.pending;h.calls[0].resolve({settled:true});await pending;
 assert.equal(h.publications(),before);assert.equal(h.visible.size,0);assert.equal(h.tombstones.size,0);assert.equal(h.calls.length,1);
 await assert.rejects(h.respond(),/disposed/);assert.equal(h.calls.length,1);
});
test('deferred: response failures preserve exact error identity, session routing and explicit retry',async()=>{
 const h=await deferredManager();try{
 h.emit(10,[h.req('a')]);const pending=h.respond(),error=Object.assign(Error('synthetic failure'),{code:'APP_REQUEST_EXPIRED'});
 h.calls[0].reject(error);await assert.rejects(pending,e=>e===error);assert(h.visible.has('a'));assert.equal(h.tombstones.size,0);
 const retry=h.respond();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1].response,{requestId:'a',conversationId:'A',action:'decline'});
 h.calls[1].resolve({settled:true});await retry;assert(!h.visible.has('a'));
 }finally{h.manager.dispose();}
});
test('synthetic fallback contract: visible uncaught error, queued cleanup and late callbacks are inert after disposal',async()=>{
 const {createReaRenderFallback}=await import('../src/client/portal-host.mjs');
 const previous=globalThis.document,original=console.error,logs=[],writes=[];
 globalThis.document={createElement:tag=>({tag,style:{},setAttribute(name,value){this[name]=value;}})};console.error=(...args)=>logs.push(args);
 try{
 const container={replaceChildren:node=>writes.push(node)},error=Error('synthetic render failure');
 const first=createReaRenderFallback(container,'OpenCU REA app approval');first.onUncaughtError(error);await Promise.resolve();
 assert.equal(writes.length,1);assert.equal(writes[0].tag,'pre');assert.equal(writes[0].role,'alert');assert.equal(writes[0].textContent,error.stack);assert.equal(logs[0][1],error);
 const second=createReaRenderFallback(container,'OpenCU REA app approval');second.onUncaughtError(error);second.dispose();await Promise.resolve();assert.equal(writes.length,1);
 second.onUncaughtError(error);await Promise.resolve();assert.equal(writes.length,1);assert.equal(logs.length,2);first.dispose();
 }finally{globalThis.document=previous;console.error=original;}
});
