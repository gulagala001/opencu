import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {filePaths,fileInputState,fileInputResult,validateFileInput,clearFileInputFunction} from '../extension/file-input.js';
import {uploadFiles} from '../src/browser/upload-files.mjs';
import {createFileChoosers} from '../src/browser/file-chooser.mjs';
import {createBrowserWaits} from '../src/dsh/browser-waits.mjs';
import {actOnPage} from '../src/browser/actions.mjs';

const state = changes => ({isConnected:true,tagName:'INPUT',type:'file',multiple:false,matches:() => false,...changes});
const checked = (element,count) => fileInputResult(fileInputState.call(element,count));

test('upload normalization accepts explicit clearing and chooser strings without mutating callers',async t => {
  const dir=await mkdtemp(join(tmpdir(),'opencu-upload-'));t.after(() => rm(dir,{recursive:true,force:true}));
  const path=join(dir,'space 中文.txt');await writeFile(path,'file data');
  assert.deepEqual(await uploadFiles([]),[]);
  assert.deepEqual(await uploadFiles(path,{allowString:true}),[path]);
  await mkdir(join(dir,'child'));const spelled=dir+'/child/../space 中文.txt';assert.deepEqual(await uploadFiles([spelled]),[spelled]);
  const files=Object.freeze([path]);assert.deepEqual(await uploadFiles(files),files);
  for (const value of [path,null,{},['relative.txt'],['/bad\0file'],['']]) await assert.rejects(uploadFiles(value),{code:'INVALID_ARGUMENT'});
  await assert.rejects(uploadFiles([dir]),{code:'INVALID_ARGUMENT'});
  await assert.rejects(uploadFiles([join(dir,'private-secret.txt')]),error => error.code==='ENOENT' && !JSON.stringify({message:error.message,details:error.details}).includes(dir));
  assert.deepEqual(filePaths('C:\\private\\alpha.txt',{allowString:true}),['C:\\private\\alpha.txt']);
});

test('file inputs reject disabled controls, directories and extra single files before writing',() => {
  assert.deepEqual(checked(state(),0),{multiple:false});
  assert.deepEqual(checked(state({multiple:true}),2),{multiple:true});
  for (const [element,count,code] of [[state({matches:() => true}),1,'ELEMENT_DISABLED'],[state({tagName:'BUTTON'}),1,'INVALID_ARGUMENT'],
    [state({type:'text'}),1,'INVALID_ARGUMENT'],[state(),2,'INVALID_ARGUMENT'],[state({webkitdirectory:true}),1,'UNSUPPORTED_UPLOAD_DIRECTORY'],[state({isConnected:false}),1,'STALE_ELEMENT']])
    assert.throws(() => checked(element,count),{code,details:{inputDispatched:false}});
});

test('CDP file input validation releases the exact resolved object and preserves rejection',async () => {
  const calls=[];
  const send=async(method,args) => {calls.push([method,args]);if(method==='DOM.resolveNode')return {object:{objectId:'frame-object'}};
    if(method==='Runtime.callFunctionOn')return {result:{value:fileInputState.call(state({matches:() => true}),args.arguments[0].value)}};return {};};
  await assert.rejects(validateFileInput(send,{backendNodeId:9,contextId:7,files:['/a']}),{code:'ELEMENT_DISABLED'});
  assert.deepEqual(calls[0],['DOM.resolveNode',{backendNodeId:9,executionContextId:7}]);
  assert.deepEqual(calls.at(-1),['Runtime.releaseObject',{objectId:'frame-object'}]);
  assert(!calls.some(([method]) => method==='DOM.setFileInputFiles'));
});

function chooserFixture() {
  const events=[],session=Object.assign(new EventEmitter(),{send:async(method,args={})=>{
    events.push([method,args]);if(method==='Runtime.evaluate')return {result:{objectId:'document'}};
    if(method==='DOM.describeNode')return {node:{nodeType:9,children:[]}};return {};
  }}),route={frameId:'main',sessionId:'',contextId:1,send:session.send}, record={session,documentGeneration:0};
  record.frameRouter={main:async()=>route,validate:async item=>{if(item!==route||record.invalid)throw Object.assign(new Error('Frame changed'),{code:'FRAME_DETACHED',details:{inputDispatched:false}});}};
  return {events,session,record,manager:createFileChoosers(record),open:() => session.emit('Page.fileChooserOpened',{frameId:'main',mode:'selectMultiple',backendNodeId:42})};
}

test('chooser subscription owns one real event, rejects parallel arms and consumes its handle once',async () => {
  const f=chooserFixture(),id=randomUUID();await f.manager.arm(id,1000);
  assert.equal((await f.manager.poll(id)).status,'waiting');
  await assert.rejects(f.manager.arm(randomUUID(),1000),{code:'FILE_CHOOSER_BUSY'});
  f.open();assert.deepEqual(await f.manager.poll(id),{id,status:'ready',multiple:true});
  const entry=await f.manager.entry(id);assert.equal(entry.backendNodeId,42);f.manager.consume(entry);await f.manager.finish(entry);
  await assert.rejects(f.manager.entry(id),{code:'STALE_FILE_CHOOSER'});
  assert.equal(f.session.listenerCount('Page.fileChooserOpened'),0);
  assert.equal(f.events.at(-1)[1].enabled,false);await f.manager.dispose();
});

test('chooser cancellation, navigation, replacement event and frame detachment cannot reuse old identity',async () => {
  for (const cause of ['abort','navigate','replace','frame']) {
    const f=chooserFixture(),id=randomUUID(),aborter=new AbortController();
    await f.manager.arm(id,1000,()=>aborter.signal.throwIfAborted(),aborter.signal);f.open();
    if(cause==='abort')aborter.abort(new Error('cancelled'));
    if(cause==='navigate'){f.record.documentGeneration++;f.manager.navigated();}
    if(cause==='replace')f.open();
    if(cause==='frame')f.record.invalid=true;
    await assert.rejects(f.manager.entry(id),{code:cause==='frame'?'FRAME_DETACHED':'STALE_FILE_CHOOSER'});
    await f.manager.cancel(id);assert.equal(f.session.listenerCount('Page.fileChooserOpened'),0);await f.manager.dispose();
  }
});

test('production upload preflight refuses invalid target and allows empty clearing with no path response',async () => {
  let element=state(),writes=0;
  const send=async(method,args={})=>{if(method==='DOM.resolveNode')return {object:{objectId:'input'}};
    if(method==='Runtime.callFunctionOn'){if(args.functionDeclaration.includes('__opencuClearFileInput')){writes++;return {result:{value:{multiple:false,cleared:true,eventDelivery:'none'}}};}return {result:{value:fileInputState.call(element,args.arguments[0].value)}};}
    if(method==='DOM.setFileInputFiles')assert.fail('empty CDP upload would leave old files unchanged');return {};};
  const entry={backendNodeId:42},record={page:{},session:{send},elements:new Map([[1,entry]]),pending:new Set(),keys:new Set(),buttons:new Set()};
  const run=()=>actOnPage(record,{action:'upload',elementId:1,files:[]},{persistInputs:async()=>{}});
  element=state({matches:()=>true});await assert.rejects(run(),{code:'ELEMENT_DISABLED'});assert.equal(writes,0);
  element=state();const result=await run();assert.equal(writes,1);assert(!Object.hasOwn(result,'files'));assert.equal(result.cleared,true);assert.equal(result.eventDelivery,'none');
});

test('file chooser wait queues subscription before trigger and setFiles preserves one-shot identity',async () => {
  const calls=[],aborter=new AbortController();let opened=false;
  const waits=createBrowserWaits({track:work=>work(aborter.signal),fileChooser:{supported:()=>true,act:async(action,args)=>{
    calls.push([action,args]);return {value:{id:args.fileChooserId,status:opened?'ready':'waiting',multiple:true}};
  }}});
  const waiting=waits.waitForEvent('filechooser',{timeoutMs:500});assert.equal(calls[0][0],'fileChooserArm');opened=true;
  const handle=await waiting;assert.equal(handle.isMultiple(),true);await handle.setFiles('/tmp/alpha.txt',{timeoutMs:100});
  const write=calls.find(([action])=>action==='fileChooserSetFiles')[1];assert.deepEqual(write.files,['/tmp/alpha.txt']);assert.equal(write.fileChooserId,calls[0][1].fileChooserId);
  assert(!calls.some(([action])=>action==='fileChooserCancel'));
  assert.throws(()=>handle.setFiles('relative.txt'),{code:'INVALID_ARGUMENT'});
});

test('file chooser timeout cleans interception and unsupported adapters never queue a trigger',async () => {
  const calls=[],aborter=new AbortController(),waits=createBrowserWaits({track:work=>work(aborter.signal),fileChooser:{supported:()=>true,act:async(action,args)=>{calls.push(action);return {value:{id:args.fileChooserId,status:'waiting'}};}}});
  await assert.rejects(waits.waitForEvent('filechooser',{timeoutMs:10}),{code:'FILE_CHOOSER_TIMEOUT'});
  assert.equal(calls.at(-1),'fileChooserCancel');
  const unavailable=createBrowserWaits({track:work=>work(aborter.signal),fileChooser:{supported:()=>false,act:()=>assert.fail('unsupported adapter called')}});
  await assert.rejects(unavailable.waitForEvent('filechooser'),{code:'UNSUPPORTED'});
});


test('native empty-value clearing rechecks disabled state atomically and never fabricates input events',() => {
  let setters=0;
  class Input {
    get value(){return this.files.length ? 'fakepath' : '';}
    set value(value){assert.equal(value,'');setters++;this.files=[];}
  }
  const input=Object.assign(new Input(),state(),{files:[{name:'already-selected.txt'}],ownerDocument:{defaultView:{HTMLInputElement:Input}},dispatchEvent:()=>assert.fail('synthetic upload event')});
  const clear=Function('return ('+clearFileInputFunction+')')();
  input.matches=()=>true;assert.equal(clear.call(input).__opencuFileError.code,'ELEMENT_DISABLED');assert.equal(setters,0);assert.equal(input.files.length,1);
  input.matches=()=>false;assert.deepEqual(clear.call(input),{multiple:false,cleared:true,eventDelivery:'none'});assert.equal(setters,1);assert.equal(input.files.length,0);assert.equal(input.value,'');
});

test('failed interception cleanup retries only unacknowledged sessions before allowing another arm',async () => {
  const f=chooserFixture(),id=randomUUID(),send=f.record.session.send;let disabled=0;
  f.record.session.send=async(method,args)=>{if(method==='Page.setInterceptFileChooserDialog'&&args.enabled===false&&++disabled===1)throw new Error('temporary transport failure');return send(method,args);};
  // The route captures this wrapped transport at creation time.
  const main=f.record.frameRouter.main;f.record.frameRouter.main=async()=>({...await main(),send:f.record.session.send});
  await f.manager.arm(id,1000);f.open();f.record.frameRouter.validate=async()=>{};const task=await f.manager.entry(id);let sibling=0;
  task.sessions.set('sibling',{send:async()=>{sibling++;}});
  await assert.rejects(f.manager.cancel(id),/interception cleanup failed/);assert.equal(sibling,1);assert.equal(disabled,1);
  await f.manager.cancel(id);assert.equal(disabled,2);assert.equal(sibling,1);
  await f.manager.arm(randomUUID(),1000);await f.manager.dispose();assert.equal(disabled,3);
});


test('explicit upload to the chooser input revokes that chooser without affecting another input',async () => {
  const f=chooserFixture(),id=randomUUID();await f.manager.arm(id,1000);f.open();const entry=await f.manager.entry(id);
  await f.manager.explicitUpload({backendNodeId:99,route:entry.route});assert.equal((await f.manager.poll(id)).status,'ready');
  await f.manager.explicitUpload({backendNodeId:42,route:entry.route});await assert.rejects(f.manager.entry(id),{code:'STALE_FILE_CHOOSER'});await f.manager.dispose();
});
