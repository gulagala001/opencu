import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputerSession} from '../src/dsh/computer.mjs';
import {modelResult} from '../src/dsh/model-output.mjs';
import {createObservationProjector, semanticAX} from '../src/dsh/observation-output.mjs';
import {installToolDefinitions, renderResult, TOOLS} from '../src/dsh/tools.mjs';

function fixture() {
  const target = {id:'tab-1', backend:'browser', browserId:'browser-1', verified:true};
  const ax = {nodes:[{elementId:1, role:'button', name:'Save', properties:{disabled:false}}]};
  const image = {attachmentId:'image-1', mediaType:'image/png', bytes:100, width:100, height:50};
  const observation = {observationId:'obs-1', ax, screenshot:{id:'shot-1', width:100, height:50, image}};
  const state = {mode:'active', releasePending:false, releaseErrors:[], targets:[target], activeTargetId:target.id,
    selectedTarget:target, annotations:[{note:'saved annotation'}], lastObservation:{targetId:target.id, observation, image}};
  const payload = {ok:true, state, presentation:{sessions:[{frame:'UI-only frame'}]}};
  const calls = [];
  const request = async (endpoint, args) => {
    calls.push({endpoint, args});
    if (endpoint === 'state') return payload;
    if (endpoint === 'targets') return {ok:true, targets:[target], browsers:[{id:'browser-1'}], errors:[{message:'another backend unavailable'}]};
    if (endpoint === 'select') return {ok:true, target};
    if (endpoint === 'observe') return {ok:true, observation, ...(args.format !== 'ax' ? {image} : {})};
    if (endpoint === 'act') return {ok:true, result:{acknowledged:true}};
    if (endpoint === 'stop') return payload;
    if (endpoint === 'deliveries') return {ok:true, deliveries:[{file:{attachmentId:'file-1'}}]};
    throw new Error(endpoint);
  };
  return {target, ax, image, observation, payload, calls, request};
}

test('real REPL emits observations once, suppresses requested output, and keeps computed results', async t => {
  const f = fixture(), computer = createComputerSession(f.request);
  t.after(() => computer.reset());
  const run = code => computer.run({code});
  const initial = await run("var tab = await cua.getTab('tab-1'); tab");
  assert.equal(initial.outputs.filter(text => text.includes('OpenCU core API')).length, 1);
  assert.equal(initial.outputs.filter(text => text.includes('OpenCU browser API')).length, 1);
  assert.equal(initial.outputs.filter(text => text === '[1] button \"Save\" disabled=false').length, 1);
  assert.deepEqual((await run('await tab.getAXState()')).outputs, ['[1] button \"Save\" disabled=false']);
  assert.deepEqual((await run('await tab.getAXState({emit:false})')).outputs, []);
  assert.deepEqual((await run('nodeRepl.write(await tab.getAXState({emit:false}))')).outputs, ['[1] button \"Save\" disabled=false']);
  assert.deepEqual((await run('JSON.parse(await tab.getAXState({emit:false,details:true})).nodes[0].name')).outputs, ['Save']);
  const both = await run('await tab.getAXStateAndScreenshot()');
  assert.deepEqual(both.outputs, ['[1] button \"Save\" disabled=false']);
  assert.deepEqual(both.images, [f.image]);
  const screenshot = await run('await tab.getScreenshot()');
  assert.deepEqual(screenshot.outputs, []);
  assert.deepEqual(screenshot.images, [f.image]);
  assert.deepEqual((await run('await tab.getScreenshot({emit:false})')).images, []);
  assert.equal((await run('await nodeRepl.emitImage(await tab.getScreenshot())')).images.length, 1);
  assert.deepEqual((await run('await tab.click(1)')).outputs, [JSON.stringify({ok:true, result:{acknowledged:true}})]);
  assert.equal((await run('await cua.downloads.list()')).outputs.length, 1);
  assert.deepEqual((await run('await cua.downloads.list({emit:false})')).outputs, []);
  assert.deepEqual((await run('6 * 7')).outputs, ['42']);
  assert.deepEqual((await run(JSON.stringify(JSON.stringify(f.ax)))).outputs, [JSON.stringify(f.ax)]);
});

test('discovery projects history without losing control, live inventory, or explicit access', async t => {
  const f = fixture(), original = JSON.stringify(f.payload), computer = createComputerSession(f.request);
  t.after(() => computer.reset());
  const value = await computer.run({code:'await cua.getState()'});
  assert.equal(value.outputs.length, 2);
  const state = JSON.parse(value.outputs.at(-1));
  assert.equal(state.lastObservation.observationId, 'obs-1');
  assert.equal(state.lastObservation.observation, undefined);
  assert.equal(state.annotationCount, 1);
  assert.equal(state.releasePending, false);
  assert.deepEqual(state.releaseErrors, []);
  assert.equal(state.targets[0].id, 'tab-1');
  assert.equal(state.errors[0].message, 'another backend unavailable');
  const full = JSON.parse((await computer.run({code:'await cua.getState({includeHistory:true})'})).outputs[0]);
  assert.deepEqual(full.lastObservation, f.payload.state.lastObservation);
  assert.deepEqual(full.annotations, f.payload.state.annotations);
  assert.deepEqual((await computer.run({code:'await cua.getState({emit:false})'})).outputs, []);
  assert.equal(JSON.stringify(f.payload), original);
  const stopped = JSON.parse((await computer.run({code:'await cua.stop()'})).outputs[0]);
  assert.equal(stopped.state.lastObservation.observation, undefined);
});

test('registered SDK and native render paths share an idempotent, non-mutating projection', async () => {
  const f = fixture(), original = JSON.stringify(f.payload);
  const projected = modelResult(f.payload);
  assert.deepEqual(modelResult(projected), projected);
  assert.equal(projected.presentation, undefined);
  assert.deepEqual(modelResult(f.payload, {includeHistory:true}).state, f.payload.state);
  const definitions = new Map();
  installToolDefinitions({effect:work => work(), tools:{register:tool => definitions.set(tool.name, tool)}}, {request:f.request}, 'isolated-test');
  const stateTool = definitions.get('opencu_state');
  const sdk = await stateTool.execute({}, {signal:new AbortController().signal});
  assert.deepEqual(sdk, projected);
  assert.deepEqual(JSON.parse(stateTool.output.render({}, sdk)[0].text), projected);
  assert.deepEqual(JSON.parse(renderResult({}, f.payload)[0].text), projected);
  const full = await stateTool.execute({includeHistory:true}, {signal:new AbortController().signal});
  assert.deepEqual(JSON.parse(stateTool.output.render({includeHistory:true}, full)[0].text).state, f.payload.state);
  const shot = renderResult({format:'screenshot'}, {ok:true, observation:f.observation, image:f.image, images:[f.image]});
  assert.equal(JSON.parse(shot[0].text).observation.ax, undefined);
  assert.equal(shot.filter(block => block.type === 'image').length, 1);
  assert.equal(JSON.stringify(f.payload), original);
});

test('observation projection removes only duplicate text aliases and preserves actionable nodes', () => {
  const nodes = [{elementId:5, role:'AXTextField', name:'Search', bounds:{x:4, y:8}, actions:['AXPress']}];
  const observation = {observationId:'fresh-1', ax:{nodes, text:'[5] Search'}, text:'[5] Search', state:'[5] Search',
    screenshot:{id:'shot-1', mappingId:'map-1'}, permissions:{accessibility:true}, userActivityMonitoring:{available:false}};
  const raw = {ok:true, observation}, original = JSON.stringify(raw);
  const projected = modelResult(raw);
  assert.equal(projected.observation.ax, '[5] AXTextField \"Search\" actions=[\"AXPress\"]');
  assert.deepEqual(modelResult(raw,{details:true}).observation.ax, observation.ax);
  assert.equal(projected.observation.text, undefined);
  assert.equal(projected.observation.state, undefined);
  assert.deepEqual(modelResult(projected), projected);
  assert.equal(projected.observation.observationId, 'fresh-1');
  assert.deepEqual(projected.observation.screenshot, observation.screenshot);
  assert.deepEqual(projected.observation.permissions, observation.permissions);
  assert.deepEqual(modelResult({observation:{ax:{nodes}, text:'distinct backend text', state:{mode:'ready'}}}).observation,
    {ax:'[5] AXTextField \"Search\" actions=[\"AXPress\"]', text:'distinct backend text', state:{mode:'ready'}});
  assert.equal(modelResult({observation:{ax:{source:'chromium-accessibility-tree', nodes}, text:'generated node listing'}}).observation.text, undefined);
  const shot = modelResult(raw, {format:'screenshot'}).observation;
  assert.equal(shot.ax, undefined); assert.equal(shot.text, undefined); assert.equal(shot.state, undefined);
  assert.deepEqual(shot.userActivityMonitoring, {available:false});
  assert.equal(JSON.stringify(raw), original);
  const target = {id:'tab-1', backend:'browser', verified:false, cold:true, identity:{documentId:'private'}, control:{input:'background'}};
  const state = modelResult({target, state:{mode:'release_failed', releasePending:true, releaseErrors:[{code:'RELEASE_FAILED'}], targets:[target]}});
  assert.equal(state.target, target);
  assert.equal(state.state.targets[0].identity, undefined);
  assert.equal(state.state.targets[0].verified, false);
  assert.equal(state.state.releasePending, true);
  assert.equal(state.state.releaseErrors[0].code, 'RELEASE_FAILED');
  assert.deepEqual(modelResult({state:{targets:[target]}}, {includeHistory:true}).state.targets, [target]);
});

test('runtime documentation describes actual callable methods and separates backend topics', async t => {
  const f = fixture(), computer = createComputerSession(f.request);
  t.after(() => computer.reset());
  const docs = async topic => (await computer.run({code:`await cua.documentation(${JSON.stringify(topic)})`})).outputs.at(-1);
  assert.match(await docs('core'), /getAXState/);
  assert.match(await docs('browser'), /browser\.tabs\.list/);
  assert.match(await docs('native'), /FOREGROUND_REQUIRED/);
  await assert.rejects(computer.run({code:"await cua.documentation('missing')"}), /Unknown documentation topic/);
  const description = TOOLS.find(tool => tool.name === 'computer_use').description;
  assert.match(description, /rewriteDocumentation/);
  assert.match(description, /initial AX state/);
  assert.match(description, /FOREGROUND_REQUIRED/);
  assert.match(description, /emit:false/);
});


test('browser AX maps colliding backend and element IDs once in full output and diffs', () => {
  const nodes = [
    {nodeId:'9',elementId:1,role:'window',name:'Document',children:['1','2','10','11']},
    {nodeId:'1',elementId:2,role:'button',name:'Save'},
    {nodeId:'2',elementId:3,role:'button',name:'Cancel'},
    {nodeId:'10',role:'group',childIds:['3']},
    {nodeId:'3',elementId:4,role:'button',name:'Help'},
    {nodeId:'11',elementId:5,role:'group',name:'Toolbar'},
  ];
  const make = (id, tree) => ({targetId:'tab-1',observation:{observationId:id,
    ax:{stableIds:true,identityScope:'browser:document',nodes:tree}}});
  const first = make('one',nodes), original = JSON.stringify(first);
  const rows = semanticAX(first.observation.ax).rows;
  assert.equal(rows.get('2'),'[2] button "Save" parent=[1]');
  assert.equal(rows.get('3'),'[3] button "Cancel" parent=[1]');
  assert.equal(rows.get('node:10'),'[node:10] group parent=[1]');
  assert.equal(rows.get('4'),'[4] button "Help" parent=[node:10]');
  const projector = createObservationProjector();
  assert.equal(projector.project(first).observation.axView.mode,'full');
  const moved = structuredClone(nodes);
  moved[0].children = ['2','10','11'];
  moved[5].children = ['1'];
  const diff = projector.project(make('two',moved)).observation;
  assert.equal(diff.axView.mode,'diff');
  assert.match(diff.ax,/~ \[2\] button "Save" parent=\[5\]/);
  assert.doesNotMatch(diff.ax,/parent=\[2\]/);
  assert.equal(JSON.stringify(first),original);
});

test('AX diffs preserve semantic changes and reset on lost context or unstable identity', () => {
  const projector = createObservationProjector();
  const make = (id, value='a', scope='helper:window') => ({targetId:'window', observation:{observationId:id,
    ax:{stableIds:true,identityScope:scope,nodes:[{id:1,role:'AXWindow',name:'Document'},
      {id:2,parentId:1,role:'AXTextField',name:'Editor',value,AXEnabled:true,actions:['AXConfirm']} ]}}});
  const first=make('one');
  assert.equal(projector.project(first).observation.axView.mode,'full');
  const changed=projector.project(make('two','b')).observation;
  assert.equal(changed.axView.baseObservationId,'one');
  assert.match(changed.ax,/value="b"/);
  assert.match(changed.ax,/parent=\[1\]/);
  assert.match(projector.project(make('three','b')).observation.ax,/no change/);
  assert.equal(projector.project(make('four','b'),{emit:false}).observation.axView.mode,'full');
  assert.equal(projector.project(make('five','b')).observation.axView.mode,'full');
  assert.equal(projector.project(make('six','b','restarted')).observation.axView.mode,'full');
  projector.reset();
  assert.equal(projector.project(make('seven')).observation.axView.mode,'full');
  assert.equal(first.observation.ax.nodes.length,2);
});

test('REPL restores docs without losing bindings and routes locators with current target identity', async t => {
  const f=fixture(), requests=[];
  const computer=createComputerSession(async (endpoint,args) => {
    if(endpoint==='act') { requests.push(args); return {ok:true,result:{value:args.method==='count'?1:null}}; }
    return f.request(endpoint,args);
  });
  t.after(()=>computer.reset());
  await computer.run({code:"var tab = await cua.getTab('tab-1')"});
  const count=await computer.run({code:"await tab.playwright.getByRole('button',{name:'Save'}).count()"});
  assert.deepEqual(count.outputs,['1']);
  assert.equal(requests[0].targetId,'tab-1');
  assert.deepEqual(requests[0].locator,[{kind:'role',value:'button',name:'Save'}]);
  await computer.run({code:'await cua.rewriteDocumentation()'});
  assert.match((await computer.run({code:'await tab.getAXState()'})).outputs[0], /Save/);
  await assert.rejects(computer.run({code:"await tab.getAXState(); throw new Error('after-observation')"}), /after-observation/);
  const recovered=await computer.run({code:'await tab.getAXState()'});
  assert.match(recovered.outputs[0], /OpenCU core API/);
  assert.match(recovered.outputs.at(-1), /Save/);
});


test('frame and RegExp locators wait only before dispatch and preserve a single eventual input', async t => {
  const f=fixture(), requests=[]; let attempts=0;
  const computer=createComputerSession(async (endpoint,args) => {
    if(endpoint==='act') {
      requests.push(args); attempts++;
      if(attempts<3) return {ok:false,error:{code:'LOCATOR_NOT_ACTIONABLE',message:'temporarily covered',details:{inputDispatched:false}}};
      return {ok:true,result:{value:null}};
    }
    return f.request(endpoint,args);
  });
  t.after(()=>computer.reset());
  await computer.run({code:"var tab = await cua.getTab('tab-1')"});
  await computer.run({code:"await tab.playwright.frameLocator('#outer').frameLocator('#inner').getByRole('button',{name:/save\\s+now/ig}).click({timeoutMs:1000})"});
  assert.equal(attempts,3);
  assert.deepEqual(requests[2].locator,[{kind:'frame',value:'#outer'},{kind:'frame',value:'#inner'},
    {kind:'role',value:'button',name:{type:'regex',source:'save\\s+now',flags:'gi'}}]);
  assert.equal(requests[2].args.timeoutMs,undefined);
  assert.equal(requests[2].targetId,'tab-1');
});

test('locator waitFor times out, cancellation stops polling, and uncertain writes are never replayed', async t => {
  const f=fixture(); let mode='wait',count=0;
  const computer=createComputerSession(async (endpoint,args) => {
    if(endpoint==='act') {
      count++;
      if(mode==='write') return {ok:false,error:{code:'STALE_ELEMENT',message:'after input',details:{inputDispatched:true}}};
      return {ok:true,result:{value:false}};
    }
    return f.request(endpoint,args);
  });
  t.after(()=>computer.reset());
  await computer.run({code:"var tab = await cua.getTab('tab-1')"});
  await assert.rejects(computer.run({code:"await tab.playwright.getByText(/ready/i).waitFor({state:'visible',timeoutMs:20})"}),error=>error.code==='LOCATOR_TIMEOUT');
  mode='write';count=0;
  await assert.rejects(computer.run({code:"await tab.playwright.getByRole('button').click({timeoutMs:1000})"}),error=>error.details?.inputDispatched===true);
  assert.equal(count,1);
  mode='wait';const abort=new AbortController();const timer=setTimeout(()=>abort.abort(new Error('cancel waiting')),20);
  try { await assert.rejects(computer.run({code:"await tab.playwright.getByText('ready').waitFor({timeoutMs:0})"},abort.signal),/cancel waiting/); }
  finally {clearTimeout(timer);}
});
