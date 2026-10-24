import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserWaits} from '../src/dsh/browser-waits.mjs';

function fixture() {
  const aborter = new AbortController(), emitted = [], requests = [];
  const f = {state:{url:'https://example.test/start',documentId:'1',readyState:'complete',webContentsId:9},records:[]};
  f.api = createBrowserWaits({supported:() => true,track:work => work(aborter.signal),
    state:async () => {requests.push('state');return {...f.state};},
    downloads:async (emit,id) => {requests.push({emit,id});return structuredClone(f.records.filter(item => id === undefined || item.id === id).map(item => ({...item,...emit && item.fileExists ? {file:{attachmentId:item.id}} : {}})));},
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

test('navigation timeout never replays its action and the same target remains usable',async () => {
  const f = fixture();let actions = 0;
  await assert.rejects(f.api.expectNavigation(async () => {actions++;},{timeoutMs:20}),{code:'NAVIGATION_TIMEOUT'});
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
