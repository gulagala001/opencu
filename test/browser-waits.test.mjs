import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserWaits} from '../src/dsh/browser-waits.mjs';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

function fixture() {
  const aborter = new AbortController(), emitted = [], requests = [];
  const f = {state:{url:'https://example.test/start',documentId:'1',readyState:'complete',webContentsId:9},records:[]};
  f.api = createBrowserWaits({supported:() => true,track:work => work(aborter.signal),
    state:async () => {requests.push('state');return {...f.state,downloadIds:f.state.downloadIds ?? f.records.map(item => item.id)};},
    downloads:async (emit,id) => {requests.push({emit,id});if (f.historyGate && requests.filter(item => item.emit === false).length === 1) await f.historyGate;return structuredClone(f.records.filter(item => id === undefined || item.id === id).map(item => ({...item,...emit && item.fileExists ? {file:{attachmentId:item.id}} : {}})));},
    ownsDownload:(item,state) => item.sourceWebContentsId === state.webContentsId,
    deliver:item => emitted.push(item),
  });
  return Object.assign(f,{aborter,emitted,requests});
}
const record = (id,overrides = {}) => ({id,sourceWebContentsId:9,startedAtMs:Date.now(),status:'complete',fileExists:true,name:'report.txt',...overrides});

test('navigation state waits recognize existing state, same-document URL changes and same-URL reloads',async () => {
  const f = fixture(); let actions = 0;
  await f.api.waitForURL(f.state.url,{timeoutMs:100});
  await f.api.waitForLoadState('load',{timeoutMs:100});
  await f.api.waitForLoadState({state:'load',timeoutMs:100});
  assert.equal(await f.api.expectNavigation(async () => {actions++;f.state.url += '#next';return 42;},{waitUntil:'commit'}),42);
  await f.api.expectNavigation(async () => {actions++;f.state.documentId = '2';},{url:/#next$/g,waitUntil:'domcontentloaded'});
  assert.equal(actions,2);
});

test('navigation timeout never replays its action and the same target remains usable',async t => {
  t.mock.timers.enable({apis:['Date'],now:1000});
  const f = fixture();let actions = 0;
  await assert.rejects(f.api.expectNavigation(async () => {actions++;t.mock.timers.tick(20);},{timeoutMs:20}),{code:'NAVIGATION_TIMEOUT'});
  assert.equal(actions,1);
  await f.api.waitForURL(f.state.url,{timeoutMs:100});
});

test('unsupported states/options and extension waits reject before a callback or backend read',async () => {
  const f = fixture();
  for (const operation of [() => f.api.waitForURL('x',{timeout:1}),() => f.api.waitForURL('x',{timeoutMs:null}),
    () => f.api.waitForLoadState('networkidle'),() => f.api.waitForEvent('popup'),() => f.api.expectNavigation(null)]) {
    assert.throws(operation,{code:'INVALID_ARGUMENT'});
  }
  const unavailable = createBrowserWaits({supported:() => false,track:work => work(f.aborter.signal)});
  let actions = 0;
  await assert.rejects(unavailable.expectNavigation(() => {actions++;}),{code:'UNSUPPORTED'});
  assert.equal(actions,0);assert.equal(f.requests.length,0);
});

test('pre-subscribed download sees a fast completion, excluding old and other-target records',async () => {
  const f = fixture();f.records = [record('old',{startedAtMs:1})];f.state.downloadIds = ['unsynced'];
  const wait = f.api.waitForEvent('download',{timeoutMs:300});
  assert.deepEqual(f.requests,[{emit:false,id:undefined},'state'],'history and host cursors are requested before the next action');
  f.records.push(record('unsynced'),record('old-delayed-history',{startedAtMs:1}),record('other',{sourceWebContentsId:10}),record('new'));
  const download = await wait;
  assert.equal(download.id,'new');assert.equal(download.suggestedFilename(),'report.txt');
  assert.equal(await download.path({timeoutMs:100}),null);assert.equal(download.file.attachmentId,'new');
  assert.deepEqual(f.emitted.map(item => item.id),['new']);
  assert.deepEqual(f.requests.filter(item => item.emit === true),[{emit:true,id:'new'}]);
});

test('a new download waits for completed bytes and rejects unavailable files',async () => {
  for (const unavailable of [false,true]) {
    const f = fixture(), wait = f.api.waitForEvent('download',{timeoutMs:400});
    f.records.push(record('pending',{status:'pending',fileExists:false}));
    await new Promise(resolve => setTimeout(resolve,10));
    assert.equal(f.emitted.length,0);
    f.records[0] = record('pending',{fileExists:!unavailable});
    if (unavailable) await assert.rejects(wait,{code:'DOWNLOAD_UNAVAILABLE'});
    else assert.equal((await wait).id,'pending');
    assert.equal(f.emitted.length,unavailable ? 0 : 1);
  }
});

test('delayed history cannot hide a fast new completion or admit an older pending download',async t => {
  t.mock.timers.enable({apis:['Date'],now:1000});
  const f = fixture(), releaseHistory = Promise.withResolvers();
  f.records = [record('a-old-complete'),record('a-old-pending',{status:'pending',fileExists:false})];
  f.historyGate = releaseHistory.promise;
  const wait = f.api.waitForEvent('download',{timeoutMs:300});
  // All three records intentionally share one clock tick. The owner cursor
  // excludes old pending/complete IDs, while late history includes the new ID.
  f.records[1] = record('a-old-pending');f.records.push(record('z-new-fast'));
  releaseHistory.resolve();
  assert.equal((await wait).id,'z-new-fast');
  assert.deepEqual(f.emitted.map(item => item.id),['z-new-fast']);
});

test('runtime attachment projection retains a fast download when baseline history finishes after its trigger',async t => {
  const parent = resolve('.local');await mkdir(parent,{recursive:true});
  const dataDir = await mkdtemp(join(parent,'download-cursor-'));
  const target = {id:'tab:cursor',backend:'browser',provider:'dsh',kind:'tab',browserId:'dsh:synthetic',identity:{occurrence:'original'}};
  const oldId = randomUUID(),newId = randomUUID(),hostIds = [oldId],scope = {url:'https://example.test/',documentId:'1',readyState:'complete',webContentsId:9};
  const gate = Promise.withResolvers(),saved = [],emitted = [];let baseline = true,triggered = 0,directory;
  const aborter = new AbortController();
  const attachments = {saveFileStream:async ({data,name}) => {
    const chunks = [];for await (const chunk of data) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);saved.push(bytes.toString());
    return {attachmentId:`sha256:${createHash('sha256').update(bytes).digest('hex')}`,name,bytes:bytes.length};
  }};
  const request = async (endpoint,args = {}) => {
    const result = await runtime.request(endpoint,args,{sessionKey:'download-cursor',attachments,signal:aborter.signal});
    if (result.ok === false) throw Object.assign(new Error(result.error.message),result.error);
    return result;
  };
  const update = async (id,complete) => {
    const bytes = Buffer.from(id === oldId ? 'old download' : 'new download');
    await mkdir(join(directory,id),{recursive:true});
    if (complete) await writeFile(join(directory,id,'report.txt'),bytes);
    await request('downloads/update',{download:{id,filename:'report.txt',url:scope.url,sourceWebContentsId:9,
      startedAtMs:Date.now(),updatedAtMs:Date.now()+1,status:complete ? 'complete' : 'in_progress',receivedBytes:complete ? bytes.length : 0,totalBytes:bytes.length}});
  };
  const runtime = createPluginRuntime({dataDir,nativeEnabled:false,extensionEnabled:false,browser:{
    listTargets:async () => [target],select:async () => target,verify:async () => ({valid:true,target}),
    observe:async () => ({ax:{nodes:[]}}),deliveries:async () => [],
    act:async (_target,args) => {
      if (args.action === 'navigationState') return {value:{...scope,downloadIds:[...hostIds]}};
      triggered++;await update(oldId,true);hostIds.push(newId);await update(newId,true);return {};
    },release:async () => ({released:true}),close:async () => {},
  }});
  t.after(async () => {gate.resolve();await runtime.close();await rm(dataDir,{recursive:true,force:true});});
  directory = (await request('downloads/configure')).directory;
  await update(oldId,false);await request('select',{reference:{id:target.id}});
  const waits = createBrowserWaits({supported:() => true,track:work => work(aborter.signal),
    state:async options => (await request('act',{targetId:target.id,targetIdentity:target.identity,action:'navigationState',...options})).result.value,
    downloads:async (emit,id) => {
      if (baseline) {baseline = false;await request('deliveries',{emit:false});await gate.promise;}
      return (await request('deliveries',{emit,...(id ? {id} : {})})).deliveries;
    },ownsDownload:(item,state) => item.sourceWebContentsId === state.webContentsId,deliver:item => emitted.push(item),
  });
  const wait = waits.waitForEvent('download',{timeoutMs:1000});
  await request('act',{targetId:target.id,targetIdentity:target.identity,action:'click'});gate.resolve();
  assert.equal((await wait).id,newId);assert.equal(triggered,1);
  assert.deepEqual(saved,['new download']);assert.deepEqual(emitted.map(item => item.id),[newId]);
});

test('download timeout and cancellation stop polling and cannot attach a late completion',async () => {
  for (const cancel of [false,true]) {
    const f = fixture(), wait = f.api.waitForEvent('download',{timeoutMs:cancel ? 0 : 20});
    const rejected = assert.rejects(wait,cancel ? /cancelled/ : {code:'DOWNLOAD_TIMEOUT'});
    await new Promise(resolve => setTimeout(resolve,5));
    if (cancel) f.aborter.abort(new Error('cancelled'));
    await rejected;
    const count = f.requests.length;f.records.push(record('late'));
    await new Promise(resolve => setTimeout(resolve,25));
    assert.equal(f.requests.length,count);assert.equal(f.emitted.length,0);
  }
});
