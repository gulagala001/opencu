import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationHost} from '../src/dsh/presentation.mjs';
import {createPresentationClient} from '../src/client/presentation-host.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async check => { for (let i=0;i<100;i++) { if (check()) return; await tick(); } assert.fail('monitoring did not settle'); };
const image = 'data:image/png;base64,c3ludGhldGlj';
const target = {id:'synthetic-tab', backend:'browser', identity:{occurrence:1}, title:'Synthetic'};
function hostFixture({ preferences, revealTab, request, present } = {}) {
  let changed, result = {ok:true, preview:{dataUrl:image,width:800,height:600,kind:'screenshot',timestamp:1}};
  const sessions = [{sessionId:'A',targets:[target]}];
  const host = createPresentationHost({
    activity:{snapshot:()=>({sessions}),subscribe:fn=>(changed=fn,()=>{})},
    preferences, runtime:{request:request ?? (async()=>result)},
    browserHost:{presentationOwner:()=> 'owner',isPresentationSession:(owner,id)=>owner==='owner' && id==='A',
      revealTab, present:present ?? (async()=>({visible:true})),hidePresentation:async()=>({visible:false}),closePresentations:async()=>{}},
  });
  const state = async options => (await host.handle('state',{rendererId:'owner',...options})).state;
  return {host,state,sessions,changed:()=>changed(),result:value=>{result=value;}};
}

test('a closed application drops only its window, releases video and never publishes a retry frame', async t => {
  const ended = new Map(), released = [], previews = [];
  const f = hostFixture({
    request: async (method, { targetId, targetIdentity }) => {
      if (method === 'stopPreview') { released.push(targetId); return {ok:true}; }
      assert.ok(targetIdentity);
      if (ended.has(targetId)) return {ok:false, error:{code:ended.get(targetId), message:'Window closed'}};
      return {ok:true, preview:{dataUrl:image, width:20, height:20}};
    },
    present: async ({ frames }) => { previews.push(...frames); return {visible:true}; },
  });
  t.after(() => f.host.close());
  const windows = ['one','two'].map(id => ({id, backend:'native', identity:{window:id, process:1}}));
  f.sessions[0].targets = windows;
  f.changed(); await until(() => f.host.snapshot().visible);
  for (const [id, code] of [['one','TARGET_IDENTITY_CHANGED'], ['two','TARGET_NOT_FOUND']]) {
    ended.set(id, code);
    await f.host.event({rendererId:'owner', type:'retry', sessionId:'A', targetId:id});
    await until(() => released.includes(id));
    assert.deepEqual((await f.state()).frames.map(frame => frame.presentationID), id === 'one' ? ['two'] : []);
  }
  assert.equal(f.host.snapshot().visible, false);
  assert.deepEqual((await f.state()).activeTaskIds, []);
  assert.ok(previews.every(frame => !frame.error));
  ended.clear();
  f.sessions[0].targets = [windows[0], {...windows[1], identity:{window:'two', process:2}}];
  f.changed(); await until(() => f.host.snapshot().visible);
  assert.deepEqual((await f.state()).frames.map(frame => frame.presentationID), ['two']);
});

test('a closed browser tab disappears from the existing stack without a retry card and other previews remain', async t => {
  const previews = [], ended = new Set();
  const f = hostFixture({
    request: async (_method, {targetId}) => ended.has(targetId)
      ? {ok:false, error:{code:'TARGET_CLOSED', message:'No tab with id: 73.'}}
      : {ok:true, preview:{dataUrl:image,width:800,height:600}},
    present: async ({frames}) => { previews.push(...frames); return {visible:true}; },
  });
  t.after(() => f.host.close());
  f.sessions[0].targets = [target, {...target,id:'other-tab'}];
  f.changed(); await until(() => f.host.snapshot().visible);
  ended.add(target.id);
  await f.host.event({rendererId:'owner', type:'retry', sessionId:'A', targetId:target.id});
  await until(() => f.host.snapshot().windows[0].targetIds.length === 1);
  assert.deepEqual((await f.state()).frames.map(frame=>frame.presentationID), ['other-tab']);
  assert.ok(previews.every(frame => !frame.error));
  assert.equal(f.host.snapshot().visible, true);
});

test('the initial built-in browser location is applied once per chat and manual preview choices win', async t => {
  const revealed = [], tab = {...target, provider:'dsh', sessionId:'A'}, gate = Promise.withResolvers();
  let preferred, reads = 0;
  const f = hostFixture({
    preferences:{read:async () => { reads++; return {values:{'browser-cu-initial-view':preferred}}; }},
    revealTab:async (target, id) => { revealed.push([target.id, id]); await gate.promise; return {revealed:true}; },
  });
  t.after(() => f.host.close());
  f.sessions[0].targets = [tab];
  f.changed(); await until(() => revealed.length === 1);
  f.changed(); assert.equal(f.host.snapshot().visible, false);
  gate.resolve(); await tick();
  preferred = 'floating';
  f.sessions[0].lastStarted = {id:'next-action'};
  f.sessions[0].targets.push({...tab, id:'another-tab'});
  f.changed(); await tick();
  assert.equal((await f.state()).hiddenTargetCounts.A, 2);
  assert.equal((await f.state()).placements.A, 'home');
  assert.deepEqual((await f.state()).frames, []);
  assert.deepEqual(revealed, [[tab.id, 'A']]); assert.equal(reads, 1);
  await f.host.handle('placement', {rendererId:'owner', sessionId:'A', placement:'pinned'});
  await until(() => f.host.snapshot().visible);
  assert.equal((await f.state()).frames.length, 2);
  f.sessions.length = 0; f.host.forgetSession('A'); f.changed(); await tick();
  f.sessions.push({sessionId:'A', targets:[tab]}); f.changed();
  await until(() => f.host.snapshot().visible);
  assert.equal((await f.state()).frames[0].placement, 'pinned');
  assert.equal(reads, 2); assert.equal(revealed.length, 1);
});
function documentFixture(t) {
  const document = new EventTarget(); document.hidden=false; document.documentElement={dataset:{platform:'darwin'}};
  const previous=globalThis.document;globalThis.document=document;
  t.after(()=>{globalThis.document=previous;});
  return document;
}

test('monitor projection defers only floating pixels and preserves full/default, home, errors and session identity', async()=>{
  const {host,state,sessions,changed,result}=hostFixture();
  try {
    await host.handle('showTask',{rendererId:'owner',sessionId:'A'});await until(()=>host.snapshot().visible);
    const full=(await state()).frames[0];assert.equal(full.imageDataURL,image);
    const deferred=(await state({imagePlacement:'home'})).frames[0];assert.equal(deferred.imageDataURL,undefined);assert.equal(deferred.imageDeferred,true);
    assert.equal(deferred.imageRevision,full.imageRevision);assert.equal(deferred.visibilityKey,full.visibilityKey);assert.equal(deferred.width,800);
    assert.equal((await state({imagePlacement:'home',imageSessions:['A']})).frames[0].imageDataURL,image);
    assert.equal((await state({imagePlacement:'home',imageSessions:['B']})).frames[0].imageDataURL,undefined);
    assert.deepEqual((await host.handle('state',{rendererId:'other',imageSessions:['A']})).state.frames,[]);
    await host.handle('placement',{rendererId:'owner',sessionId:'A',placement:'home'});
    assert.equal((await state({imagePlacement:'home'})).frames[0].imageDataURL,image);
    const home=(await state()).frames[0];const compact=(await state({imagePlacement:'home',compactImages:true,knownImages:{[target.id]:home.imageRevision}})).frames[0];
    assert.equal(compact.imageUnchanged,true);assert.equal(compact.imageDataURL,undefined);
    sessions[0].targets=[{...target,identity:{occurrence:2}}];changed();await until(()=>host.snapshot().windows[0].targetIds.length===1);await tick();await tick();
    const replaced=(await state({imagePlacement:'home',compactImages:true,knownImages:{[target.id]:home.imageRevision}})).frames[0];
    assert.notEqual(replaced.visibilityKey,home.visibilityKey);assert.notEqual(replaced.imageRevision,home.imageRevision);assert.equal(replaced.imageDataURL,image);
    result({ok:false,error:{code:'TARGET_IDENTITY_CHANGED',message:'Synthetic target replaced'}});
    await host.event({rendererId:'owner',type:'retry',sessionId:'A',targetId:target.id});await tick();await tick();
    const failed=(await state({imagePlacement:'home'})).frames[0];assert.equal(failed.imageDataURL,undefined);assert.equal(failed.errorCode,'TARGET_IDENTITY_CHANGED');
    assert.equal(failed.imageDeferred,undefined);
  } finally { await host.close(); }
});

test('hidden monitoring stops state polls and core events / explicit restoration wake it', async t=>{
  documentFixture(t);t.mock.timers.enable({apis:['setTimeout']});
  let hidden=true,revision=0,listener,calls=0;
  const state=()=>({activeTaskIds:['A'],taskVisibilities:{A:hidden?'hidden':'shown'},placements:{A:'pinned'},frames:hidden?[]:[{presentationID:'tab',threadID:'A',placement:'pinned',imageDeferred:true,imageRevision:'1'}],revision});
  const client={subscribe:fn=>(listener=fn,()=>{}),getSnapshot:()=>({revision}),request:async(method,args)=>{
    calls++;assert.equal(args.imagePlacement,'home');if(method==='presentation/showTask')hidden=false;if(method==='presentation/hideAll')hidden=true;return {state:state()};
  }};
  const monitor=createPresentationClient({client,transport:{rendererId:'owner'},desktop:{presentation:async()=>{}},notify:()=>{}});
  try {
    monitor.start();await tick();assert.equal(calls,1);t.mock.timers.tick(5000);await tick();assert.equal(calls,1);
    await monitor.service.showTask('A');const restored=calls;t.mock.timers.tick(750);await tick();assert.equal(calls,restored+1);
    await monitor.service.hideForAllActiveTasks();const stopped=calls;t.mock.timers.tick(5000);await tick();assert.equal(calls,stopped);
    revision++;listener();await tick();assert.equal(calls,stopped+1);
  } finally {await monitor.dispose();}
});

test('handoff fetches current floating images after an in-flight metadata request; failure never starts transfer', async t=>{
  documentFixture(t);
  const previousRAF=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
  t.after(()=>{globalThis.requestAnimationFrame=previousRAF;globalThis.cancelAnimationFrame=previousCancel;});
  let complete,blocked=false,fail=false,notifications=[],calls=[],operations=[];
  const frame={presentationID:'tab',threadID:'A',placement:'pinned',imageRevision:'fresh',width:800,height:600};
  const state=full=>({activeTaskIds:['A'],taskVisibilities:{A:'shown'},placements:{A:'pinned'},frames:[{...frame,...(full?{imageDataURL:image}:{imageDeferred:true})}],revision:1});
  const client={request:async(method,args)=>{
    calls.push({method,args});if(blocked){blocked=false;await new Promise(resolve=>complete=resolve);}
    if(args.imageSessions){if(fail)throw Error('Synthetic hydration failure');return {state:state(true)};}
    return {state:state(false)};
  }};
  const monitor=createPresentationClient({client,transport:{rendererId:'owner'},desktop:{presentation:async(op,args)=>{operations.push(op);if(op==='transfer-prepare')assert.equal(args.frames[0].imageDataURL,image);}},dock:async()=>{},notify:(_id,message)=>notifications.push(message)});
  monitor.service.registerHome('A',()=>[{id:'tab',x:0,y:0,width:300,height:240}]);
  try {
    await monitor.refresh();blocked=true;const metadata=monitor.refresh();await tick();const handoff=monitor.service.setPlacement('A','home');await tick();
    assert.deepEqual(operations,[]);complete();await metadata;await handoff;
    assert(calls.some(x=>x.args.imageSessions?.[0]==='A'));assert(operations.includes('transfer-prepare'));assert(operations.includes('transfer-finish'));assert.deepEqual(notifications,[]);
    operations=[];fail=true;await monitor.service.setPlacement('A','home');assert.deepEqual(operations,[]);assert.match(notifications.at(-1),/hydration failure/);
  } finally {await monitor.dispose();}
});

test('web and older servers retain full image behavior and deferred image churn does not notify the owner', async t=>{
  documentFixture(t);let revision=0,requests=[],notifications=0;
  const client={request:async(_method,args)=>{requests.push(args);return {state:{activeTaskIds:['A'],taskVisibilities:{A:'shown'},placements:{A:'pinned'},frames:[{presentationID:'tab',threadID:'A',placement:'pinned',imageDataURL:image,imageRevision:String(++revision)}],revision}};}};
  const web=createPresentationClient({client,transport:{rendererId:'owner'},notify:()=>{}});
  try {await web.refresh();assert.equal(requests[0].imagePlacement,undefined);assert.equal(web.state.getSnapshot().frames[0].imageDataURL,image);}finally{await web.dispose();}
  const desktop=createPresentationClient({client,transport:{rendererId:'owner'},desktop:{presentation:async()=>{}},notify:()=>{}});
  try {
    await desktop.refresh();assert.equal(desktop.state.getSnapshot().frames[0].imageDataURL,image);
    client.request=async()=>({state:{activeTaskIds:['A'],taskVisibilities:{A:'shown'},placements:{A:'pinned'},frames:[{presentationID:'tab',threadID:'A',placement:'pinned',imageDeferred:true,imageRevision:String(++revision),timestamp:revision}],revision}});
    await desktop.refresh();desktop.state.subscribe(()=>notifications++);await desktop.refresh();assert.equal(notifications,0);
  }finally{await desktop.dispose();}
});

test('a later hide supersedes an in-flight hydration without transferring its late pixels', async t=>{
  documentFixture(t);let complete,hydrating=false,operations=[];
  const state={activeTaskIds:['A'],taskVisibilities:{A:'shown'},placements:{A:'pinned'},frames:[{presentationID:'tab',threadID:'A',placement:'pinned',imageDeferred:true,imageRevision:'1'}]};
  const client={request:async(method,args)=>{
    if(args.imageSessions){hydrating=true;await new Promise(resolve=>complete=resolve);return {state:{...state,frames:[{...state.frames[0],imageDeferred:undefined,imageDataURL:image}]}};}
    return {state:method==='presentation/hideAll'?{...state,frames:[],taskVisibilities:{A:'hidden'}}:state};
  }};
  const monitor=createPresentationClient({client,transport:{rendererId:'owner'},desktop:{presentation:async op=>operations.push(op)},dock:async()=>{},notify:()=>{}});
  try{
    await monitor.refresh();const handoff=monitor.service.setPlacement('A','home');await until(()=>hydrating);
    const hidden=monitor.service.hideForAllActiveTasks();complete();await handoff;await hidden;
    assert.deepEqual(operations,[]);assert.deepEqual(monitor.state.getSnapshot().frames,[]);
  }finally{await monitor.dispose();}
});

test('a core wake during the last hidden poll is replayed once after that response', async t=>{
  documentFixture(t);t.mock.timers.enable({apis:['setTimeout']});let complete,listener,revision=0,calls=0;
  const hidden={activeTaskIds:['A'],taskVisibilities:{A:'hidden'},placements:{A:'pinned'},frames:[]};
  const client={subscribe:fn=>(listener=fn,()=>{}),getSnapshot:()=>({revision}),request:async()=>{
    if(++calls===1){await new Promise(resolve=>complete=resolve);return {state:hidden};}
    return {state:{...hidden,taskVisibilities:{A:'shown'},frames:[{presentationID:'tab',threadID:'A',placement:'pinned',imageDeferred:true}]}};
  }};
  const monitor=createPresentationClient({client,transport:{rendererId:'owner'},desktop:{presentation:async()=>{}},notify:()=>{}});
  try{
    monitor.start();await until(()=>complete);revision++;listener();revision++;listener();complete();await tick();await tick();
    assert.equal(calls,2);assert.equal(monitor.state.getSnapshot().frames.length,1);
    t.mock.timers.tick(750);await tick();assert.equal(calls,3);
  }finally{await monitor.dispose();}
});
