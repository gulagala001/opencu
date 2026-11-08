import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputerRepl} from '../src/dsh/computer-repl.mjs';

function fixture(t, backend = 'native') {
  const identity={pid:42,processStart:'stable',bundleId:'test.app',executable:'/test.app/Contents/MacOS/Test'};
  const app={id:'native:42:app',backend,platform:'darwin',targetType:'application',identity};
  const targets=[app,...[10,20].map(windowId=>({...app,id:`native:42:window:${windowId}`,targetType:'window',windowId,identity:{...identity,windowId}}))];
  const requests=[];
  const repl=createComputerRepl(async(endpoint,args)=>{
    if(endpoint==='targets')return {ok:true,targets};
    if(endpoint==='select')return {ok:true,target:{...targets.find(t=>t.id===args.reference.id),verified:true}};
    if(endpoint==='observe')return {ok:true,observation:{id:'observation',ax:{text:'[1] Button'},coordinateSpace:'screen-points',
      ...(args.format==='screenshot'?{screenshot:{id:'shot',mappingId:'mapping',width:2560,height:1640,image:{width:1280,height:820}}}:{})},image:{attachmentId:'test-image'}};
    if(endpoint==='act'){requests.push(args);return {ok:true,result:{performed:true,inputDispatched:true,effectVerified:false,delivery:backend==='native'?'process-posted':'target-cdp'}};}
    return {ok:true,released:true};
  });
  t.after(()=>repl.close());
  return {repl,requests,targets,run:code=>repl.run({code})};
}

for(const backend of ['native','browser']) test(`${backend}: point shapes share mapping across click, move, scroll and drag`,async t=>{
  const f=fixture(t,backend);
  await f.run(`var target = await cua.${backend==='native'?'getApp':'getTab'}('native:42:window:10');`);
  await f.run('await target.getScreenshot();');
  await f.run('await target.click({x:317,y:40}); await target.click([317,40]); await target.move({x:317,y:40}); await target.scroll({x:317,y:40},"down",{pixels:8}); await target.drag({x:10,y:20},{x:30,y:40});');
  const scale=backend==='native'?2:1;
  for(const request of f.requests.slice(0,4)){
    assert.equal(request.x,317*scale);assert.equal(request.y,40*scale);
    assert.equal(request.elementId,undefined);assert.equal(request.coordinateSpace,'screenshot-pixels');
    assert.equal(request.mappingId,'mapping');
  }
  assert.deepEqual(f.requests.at(-1).path,[{x:10*scale,y:20*scale},{x:30*scale,y:40*scale}]);
  await f.run('await target.act("click",{x:8,y:9});await target.act({action:"click",x:8,y:9});');
  assert.deepEqual(f.requests.at(-1),f.requests.at(-2));
});

test('invalid point/action containers fail before dispatch and do not invalidate the binding',async t=>{
  const f=fixture(t);await f.run('var target=await cua.getApp("native:42:window:10");');
  for(const code of [
    'target.click({point:{x:3,y:4}})','target.click({x:3})','target.click([3,4,5])','target.click([3,NaN])',
    'target.click(null)','target.click(317,40)','target.move({x:"3",y:4})','target.drag({x:3,y:4})','target.drag([[3,4],null])',
    'target.act({x:3,y:4})','target.act("",{x:3,y:4})','target.act("click",[])','target.act("click",{action:"type"})',
  ]) await assert.rejects(f.run(`await ${code};`),e=>e.code==='INVALID_ARGUMENT'&&e.details.inputDispatched===false);
  assert.equal(f.requests.length,0);
  await f.run('await target.click(1);');assert.equal(f.requests[0].elementId,1);
});

test('compound application/window references bind exactly, and multi-window apps never choose arbitrarily',async t=>{
  const f=fixture(t);
  await f.run('var target=await cua.getApp({id:"native:42:app",windowId:20});');
  await f.run('await target.click(1);');assert.equal(f.requests[0].targetId,'native:42:window:20');
  for(const reference of ['native:42:app',{id:'native:42:app'},{id:'native:42:app',windowId:99},{id:'native:42:window:10',windowId:20}])
    await assert.rejects(f.run(`await cua.getApp(${JSON.stringify(reference)});`),e=>['AMBIGUOUS_TARGET','TARGET_NOT_FOUND'].includes(e.code));
  await assert.rejects(f.run(`await cua.getApp(${JSON.stringify({id:f.targets[0].id,windowId:20,identity:{...f.targets[0].identity,processStart:'stale'}})});`),{code:'TARGET_IDENTITY_CHANGED'});
  await assert.rejects(f.run('await cua.getApp({id:"native:42:window:10",targetId:"native:42:app",windowId:20});'),{code:'INVALID_TARGET'});
});

test('unacknowledged native event delivery stays visible even when the cell ignores the return value',async t=>{
  const f=fixture(t);await f.run('var target=await cua.getApp("native:42:window:10");');
  const result=await f.run('await target.click([3,4]); await target.getScreenshot();');
  assert.match(JSON.stringify(result.outputs),/process-posted/);
  assert.match(JSON.stringify(result.outputs),/effectVerified[^a-z]+false/);
  assert.match(JSON.stringify(result.outputs),/not acknowledged/);
  assert.equal(f.requests.length,1);
});

test('a lexical redeclaration explains persistent bindings without resetting existing handles',async t=>{
  const f=fixture(t);await f.run('const target=await cua.getApp("native:42:window:10");');
  await assert.rejects(f.run('const target=await cua.getApp("native:42:window:20");'),e=>e.code==='REPL_BINDING_EXISTS'&&/Existing handles are retained/.test(e.message));
  await f.run('await target.click(1);');assert.equal(f.requests[0].targetId,'native:42:window:10');
  await f.run('var mutable=1;');await f.run('var mutable=2;');
  assert.match(JSON.stringify((await f.run('mutable')).outputs),/2/);
});
