import test from 'node:test';
import assert from 'node:assert/strict';
import {createContext, runInContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createUserActivityMonitor} from '../src/browser/user-activity.mjs';

function protocol() {
  let current = 0;
  const worlds = new Map(), calls = [];
  const createWorld = () => {
    const listeners = new Map();
    const context = createContext({crypto: webcrypto, performance, setTimeout,
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: name => listeners.delete(name),
      document: {activeElement: null},
    });
    const id = ++current;
    worlds.set(id, {context, listeners});
    return id;
  };
  createWorld();
  const session = {
    async send(method, args = {}) {
      calls.push({method, ...args});
      if (method === 'Page.addScriptToEvaluateOnNewDocument') return {identifier: 'activity-script'};
      if (method === 'Page.removeScriptToEvaluateOnNewDocument') return {};
      if (method === 'Page.getFrameTree') return {frameTree: {frame: {id: `frame-${current}`}}};
      if (method === 'Page.createIsolatedWorld') return {executionContextId: current};
      if (method === 'Runtime.evaluate') {
        const value = runInContext(args.expression, worlds.get(args.contextId).context);
        if (session.afterEvaluate) await session.afterEvaluate(args, value);
        return {result: {value}};
      }
      throw new Error(`Unexpected method ${method}`);
    },
  };
  return {session, calls, createWorld,
    evaluate: expression => runInContext(expression, worlds.get(current).context),
    event(type, props = {}) {
      worlds.get(current).listeners.get(type)?.({type, isTrusted: true, ...props});
    },
    evaluations: () => calls.filter(call => call.method === 'Runtime.evaluate'),
  };
}

test('live activity calls reuse installation while preserving expected and human input', async () => {
  const f = protocol(), monitor = await createUserActivityMonitor(f.session);
  assert.equal(await monitor.read(), null);
  assert((await monitor.expect([{type: 'pointerdown', x: 4, y: 8}]))?.markers.length);
  f.event('pointerdown', {clientX: 4, clientY: 8});
  assert.equal(await monitor.read(), null);
  f.event('pointerdown', {clientX: 20, clientY: 30});
  const activity = await monitor.read();
  assert.equal(activity.kind, 'pointerdown'); assert.equal(activity.sequence, 1);
  await monitor.finish(undefined);
  assert.equal(f.evaluations().filter(call => call.expression.includes('function installMonitor')).length, 1);
  assert.equal(f.calls.filter(call => call.method === 'Page.getFrameTree').length, f.evaluations().length,
    'each operation resolves the live frame and world again');
  await monitor.dispose();
});

test('confirmed absence reinstalls before running the requested expression exactly once', async () => {
  const f = protocol(), monitor = await createUserActivityMonitor(f.session);
  f.evaluate('globalThis.opencuActivity.dispose()');
  const start = f.evaluations().length;
  await monitor.expect([{type: 'keydown', key: 'A'}]);
  assert.equal(f.evaluations().length - start, 2);
  f.event('keydown', {key: 'A'}); assert.equal(await monitor.read(), null);
  f.event('keydown', {key: 'A'});
  assert.equal((await monitor.read()).sequence, 1, 'a repeated marker must not hide a second human event');
  assert.equal(f.evaluations().filter(call => call.expression.includes('function installMonitor')).length, 2);
  await monitor.dispose();
});

test('a new live world gets its own monitor and never inherits the previous document sequence', async () => {
  const f = protocol(), monitor = await createUserActivityMonitor(f.session);
  f.event('keydown', {key: 'X'}); const previous = await monitor.read();
  f.createWorld();
  assert.equal(await monitor.read(), null);
  f.event('keydown', {key: 'Y'}); const current = await monitor.read();
  assert.equal(current.sequence, 1); assert.notEqual(current.documentId, previous.documentId);
  await monitor.dispose();
});

test('protocol errors after evaluation propagate without replaying a marker or reinstalling', async () => {
  const f = protocol(), monitor = await createUserActivityMonitor(f.session);
  const failure = new Error('Synthetic lost reply after evaluation');
  f.session.afterEvaluate = async () => { throw failure; };
  const start = f.evaluations().length;
  await assert.rejects(monitor.expect([{type: 'keydown', key: 'A'}]), error => error === failure);
  assert.equal(f.evaluations().length - start, 1);
  delete f.session.afterEvaluate;
  f.event('keydown', {key: 'A'}); assert.equal(await monitor.read(), null);
  f.event('keydown', {key: 'A'}); assert.equal((await monitor.read()).sequence, 1);
  await monitor.dispose();
});

test('JavaScript exceptions propagate without retry and cleanup never installs a missing monitor', async () => {
  const f = protocol(), monitor = await createUserActivityMonitor(f.session);
  f.evaluate('globalThis.opencuActivity.read = () => { throw new Error("Synthetic monitor exception"); }');
  const send = f.session.send.bind(f.session);
  f.session.send = async (...args) => {
    try { return await send(...args); }
    catch (error) { return {exceptionDetails: {text: error.message}, result: {}}; }
  };
  const start = f.evaluations().length;
  await assert.rejects(monitor.read(), /Synthetic monitor exception/);
  assert.equal(f.evaluations().length - start, 1);
  f.evaluate('globalThis.opencuActivity.dispose()');
  await monitor.dispose();
  assert.equal(f.evaluations().filter(call => call.expression.includes('function installMonitor')).length, 1);
});

test('standalone wheel uses the pointed frame and exact native deltas across focused and shadow targets',async()=>{
  const {actOnPage}=await import('../src/browser/actions.mjs');
  const f=protocol(),send=f.session.send.bind(f.session),listeners=new Map();let focusReads=0,retired=false;
  const control={nodeType:1,tagName:'INPUT',type:'range',closest:()=>null},shadowHost={nodeType:1,tagName:'DIV'};
  const context=createContext({crypto:webcrypto,performance,setTimeout,Date,target:control,document:{activeElement:null},
    addEventListener:(name,listener)=>listeners.set(name,listener),removeEventListener:name=>listeners.delete(name)});
  const root={frameId:'root',documentId:'root-doc',owners:[]};
  const child={frameId:'child',documentId:'child-doc',contextId:2,owners:[{parent:root}],send:async(method,args={})=>{
    if(method==='Runtime.releaseObject')return {};
    if(method==='Runtime.evaluate')return {result:{value:runInContext(args.expression,context)}};
    if(method==='Runtime.callFunctionOn'){context.args=args.arguments.map(arg=>arg.value);return {result:{value:runInContext(`(${args.functionDeclaration}).apply(target,args)`,context)}};}
    throw Error(method);
  }};
  const router={validate:async()=>{if(retired)throw Object.assign(Error('frame detached'),{code:'FRAME_DETACHED'});},
    atPoint:async()=>({route:child,backendNodeId:42}),focused:async()=>{focusReads++;return root;},remoteElement:async()=> 'input'};
  f.session.send=(method,args)=>method==='Emulation.setFocusEmulationEnabled'?Promise.resolve({}):send(method,args);
  const monitor=await createUserActivityMonitor(f.session,{frameRouter:router});
  const wheel=()=>listeners.get('wheel')({type:'wheel',isTrusted:true,target:shadowHost,composedPath:()=>[control],clientX:4,clientY:5,deltaX:0,deltaY:75});
  const record={session:f.session,page:{mouse:{wheel:async()=>{}}},pending:new Set(),keys:new Set(),buttons:new Set(),pointer:{x:30,y:40},frameRouter:router,documentGeneration:0};
  await actOnPage(record,{action:'scroll',deltaY:75},{expectInput:events=>monitor.expect(events),finishInput:(marker,dispatched)=>monitor.finish(marker,dispatched)});
  wheel();assert.equal(await monitor.read(),null);assert.equal(focusReads,0,'an acknowledged delayed wheel must use the pointed frame');
  wheel();const manual=await monitor.read();assert.equal(manual.kind,'wheel');assert.equal(manual.sequence,1);assert(manual.frameDocumentId);
  retired=true;assert.equal((await monitor.read()).sequence,1,'retired frame activity cannot be replayed');
  assert.equal((await monitor.read()).sequence,1);await monitor.dispose();
});


test('acknowledged asynchronous wheels retain only their exact queued events and failed dispatch clears them',async()=>{
  const f=protocol(),monitor=await createUserActivityMonitor(f.session);
  for(const events of [[{type:'wheel',x:4,y:8,deltaX:0,deltaY:25}],[{type:'wheel',x:4,y:8,deltaX:35,deltaY:0}]]) {
    const marker=await monitor.expect(events);await monitor.finish(marker,true);
  }
  f.event('wheel',{clientX:4,clientY:8,deltaX:0,deltaY:25});f.event('wheel',{clientX:4,clientY:8,deltaX:35,deltaY:0});assert.equal(await monitor.read(),null);
  f.event('wheel',{clientX:4,clientY:8,deltaX:0,deltaY:25});assert.equal((await monitor.read()).sequence,1,'the next identical unmarked wheel is human input');
  const failed=await monitor.expect([{type:'wheel',x:4,y:8,deltaX:0,deltaY:25}]);await monitor.finish(failed,false);
  f.event('wheel',{clientX:4,clientY:8,deltaX:0,deltaY:25});assert.equal((await monitor.read()).sequence,2,'refused dispatch must remove its queued marker immediately');
  const exact=await monitor.expect([{type:'wheel',x:4,y:8,deltaX:0,deltaY:25}]);await monitor.finish(exact,true);
  f.event('wheel',{clientX:4,clientY:8,deltaX:0,deltaY:26});assert.equal((await monitor.read()).sequence,3,'a different delta is never exempted');
  await monitor.dispose();
});
