// Mechanism tests use real OpenCU modules with mocked page/CDP/image adapters.
// They do not validate Chromium rendering, physical input, macOS, or DPI behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observePage} from '../src/browser/observation.mjs';
import {actOnPage, releasePage} from '../src/browser/actions.mjs';

function fixture() {
  const geometry = {width:800,height:600,deviceScaleFactor:1,scrollX:0,scrollY:0};
  const events=[];
  const page={url:()=> 'https://fixture.invalid/',title:async()=> 'Fixture',evaluate:async()=>({...geometry}),
    screenshot:async()=>Buffer.from('mock-image'),isClosed:()=>false,
    mouse:{move:async(x,y)=>events.push({type:'move',x,y,scrollY:geometry.scrollY}),down:async()=>events.push({type:'down',scrollY:geometry.scrollY}),up:async()=>events.push({type:'up'})},
    keyboard:{up:async key=>events.push({type:'keyUp',key})}};
  const record={page,documentGeneration:0,elements:new Map(),pending:new Set(),keys:new Set(),buttons:new Set(),session:{send:async()=>{}},pointer:{x:0,y:0}};
  const options={persistInputs:async()=>{}};
  record.screenshot={observationId:'shot-1',url:page.url(),width:800,height:600,viewport:{...geometry},fullPage:false};
  const request={action:'click',x:100,y:100,coordinateSpace:'screenshot-pixels',observationId:'shot-1'};
  return {geometry,events,page,record,options,request};
}

test('capture must reject scroll changed after pixels were captured',async t=>{
  const f=fixture();
  f.page.screenshot=async()=>{f.geometry.scrollY=200;return Buffer.from('pixels-at-scroll-0');};
  const dataDir=await mkdtemp(join(tmpdir(),'opencu-observe-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  const sharp=()=>({metadata:async()=>({width:800,height:600})});
  await assert.rejects(observePage(f.record,{format:'screenshot'},{dataDir,sharp,timeoutMs:100}),{code:'STALE_OBSERVATION'});
  assert.deepEqual(await readdir(dataDir), [], 'rejected geometry must not leave an orphan screenshot');
});

for (const format of ['ax', 'screenshot']) test(`cancelled ${format} read cannot replace a newer observation`, async t => {
  const f = fixture(), aborter = new AbortController();
  const entered = Promise.withResolvers(), gate = Promise.withResolvers();
  if (format === 'ax') f.record.session.send = async () => { entered.resolve(); await gate.promise; return {nodes: []}; };
  else f.page.screenshot = async () => { entered.resolve(); await gate.promise; return Buffer.from('late-pixels'); };
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-late-observe-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  const pending = observePage(f.record, {format, signal: aborter.signal}, {dataDir, timeoutMs: 100});
  await entered.promise;
  aborter.abort();
  f.record.observationId = 'newer';
  f.record.elements.set(42, {observationId: 'newer'});
  const screenshot = f.record.screenshot;
  gate.resolve();
  await assert.rejects(pending, {code: 'CONTROL_STOPPED'});
  assert.equal(f.record.observationId, 'newer');
  assert.equal(f.record.elements.get(42).observationId, 'newer');
  assert.equal(f.record.screenshot, screenshot);
  assert.deepEqual(await readdir(dataDir), []);
});

test('scroll during cursor arrival must prevent mouse down',async()=>{
  const f=fixture();
  f.options.cursor=async()=>{f.geometry.scrollY=200;};
  await assert.rejects(actOnPage(f.record,f.request,f.options),{code:'STALE_SCREENSHOT'});
  assert.equal(f.events.some(event=>event.type==='down'),false);
});

test('stable screenshot clicks normally',async()=>{
  const f=fixture();await actOnPage(f.record,f.request,f.options);
  assert.deepEqual(f.events.map(event=>event.type),['move','down','up']);
});

test('abort during cursor arrival prevents input and permits release',async()=>{
  const f=fixture(),controller=new AbortController();f.request.signal=controller.signal;
  f.options.cursor=async()=>controller.abort();
  await assert.rejects(actOnPage(f.record,f.request,f.options),{code:'CONTROL_STOPPED'});
  assert.equal(f.events.length,0);
  assert.deepEqual(await releasePage(f.record,100),[]);
});

test('geometry changed before action is already rejected',async()=>{
  const f=fixture();f.geometry.scrollY=200;
  await assert.rejects(actOnPage(f.record,f.request,f.options),{code:'STALE_SCREENSHOT'});
  assert.equal(f.events.length,0);
});

test('scroll during journal persistence prevents down and release still clears held intent',async()=>{
  const f=fixture();f.options.persistInputs=async()=>{f.geometry.scrollY=200;};
  await assert.rejects(actOnPage(f.record,f.request,f.options),{code:'STALE_SCREENSHOT'});
  assert.deepEqual(f.events.map(event=>event.type),['move']);
  assert.equal(f.record.buttons.has('left'),true);
  assert.deepEqual(await releasePage(f.record,100),[]);
  assert.equal(f.record.buttons.size,0);
  assert.equal(f.events.at(-1).type,'up');
});

test('drag preserves coordinates and releases on stable geometry',async()=>{
  const f=fixture();f.request={...f.request,action:'drag',path:[{x:100,y:100},{x:200,y:200}]};
  await actOnPage(f.record,f.request,f.options);
  assert.equal(f.events[0].type,'move');assert.equal(f.events[1].type,'down');assert.equal(f.events.at(-1).type,'up');
  assert(f.events.filter(event=>event.type==='move').length>2);
});

test('stale geometry cannot block key and button release',async()=>{
  const f=fixture();f.geometry.scrollY=200;f.record.buttons.add('left');f.record.keys.add('Shift');
  assert.deepEqual(await releasePage(f.record,100),[]);
  assert.equal(f.record.buttons.size,0);assert.equal(f.record.keys.size,0);
});

test('release failure remains visible with held state retained',async()=>{
  const f=fixture();f.record.buttons.add('left');f.page.mouse.up=async()=>{throw Error('release transport failed');};
  const failures=await releasePage(f.record,100);
  assert.equal(failures.length,1);assert.equal(f.record.buttons.has('left'),true);
});

test('mapping replaced during cursor arrival must not authorize old coordinates',async()=>{
  const f=fixture();f.options.cursor=async()=>{f.record.screenshot={...f.record.screenshot,observationId:'shot-2'};};
  await assert.rejects(actOnPage(f.record,f.request,f.options),{code:'STALE_SCREENSHOT'});
  assert.equal(f.events.length,0);
});
