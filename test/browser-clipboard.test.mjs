import test from 'node:test';
import assert from 'node:assert/strict';
import {actOnClipboard,createClipboardAPI,normalizeClipboardItems} from '../src/browser/clipboard.mjs';
import * as clipboard from '../src/browser/clipboard.mjs';

const item=text=>({entries:[{mimeType:'text/plain',text}]});

test('clipboard items reject invalid shapes, aliases, duplicates and malformed base64 before browser access',()=>{
  for(const value of [null,{},[],Array(1),[{entries:Array(1)}],[{}],[{entries:[]}],[{entries:[{mimeType:'TEXT/PLAIN',text:'x'}]}],
    [{entries:[{mimeType:'text/plain',text:'x',base64:'eA=='}]}],[{entries:[{mimeType:'text/plain',base64:'eA'}]}],
    [{entries:[{mimeType:'text/plain',base64:'eB=='}]}],[{entries:[{mimeType:'text/plain',text:'a'},{mimeType:'text/plain',text:'b'}]}],
    [{...item('x'),presentationStyle:'image'}],[{...item('x'),other:true}]])
    assert.throws(()=>normalizeClipboardItems(value),{code:'INVALID_ARGUMENT'});
  assert.deepEqual(normalizeClipboardItems([{entries:[{mimeType:'image/png',base64:'eA=='}],presentationStyle:'inline'}]),
    [{entries:[{mimeType:'image/png',base64:'eA=='}],presentationStyle:'inline'}]);
  assert.throws(()=>normalizeClipboardItems([item('x'.repeat(16*1024*1024+1))]),{code:'INVALID_ARGUMENT'});
});

test('API validates arguments and unsupported browser routes never call a backend',async()=>{
  const calls=[],api=createClipboardAPI({active:()=>{},act:async(...args)=>{calls.push(args);return {result:{value:'native'}};}});
  await assert.rejects(api.read(1),{code:'INVALID_ARGUMENT'});await assert.rejects(api.writeText(1),{code:'INVALID_ARGUMENT'});
  await assert.rejects(api.write([]),{code:'INVALID_ARGUMENT'});await assert.rejects(api.readText(),{code:'UNSUPPORTED_CLIPBOARD'});
  await assert.rejects(api.writeText('x'),{code:'UNSUPPORTED_CLIPBOARD'});assert.deepEqual(calls,[]);
  const supported=createClipboardAPI({active:()=>{},supported:()=>true,act:async(...args)=>{calls.push(args);return {result:{value:'native'}};}});
  assert.equal(await supported.readText(),'native');assert.equal(await supported.writeText('中文🙂'),undefined);
  assert.deepEqual(calls,[['clipboardReadText',undefined],['clipboardWriteText',{text:'中文🙂'}]]);
});

function fixture({interrupt,restoreFailure=false,restoreFailures=restoreFailure?1:0,initial='prompt',writeInitial='granted'}={}) {
  const calls=[],aborter=new AbortController();let evals=0,permissionCalls=0,writes=0;
  const record={sessionClipboard:true,documentGeneration:0,identity:{contextId:'owned-context'},pending:new Set(),session:{send:async(method,params)=>{
    calls.push({method,params});
    if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main',url:'https://fixture.test/'}}};
    if(method==='Page.createIsolatedWorld')return {executionContextId:7};
    if(method==='Runtime.evaluate' && !evals++)return {result:{value:{available:true,url:'https://fixture.test/',supported:true,
      permissions:[{name:'clipboard-read',state:initial},{name:'clipboard-write',state:writeInitial}]}}};
    if(method==='Browser.setPermission' && ++permissionCalls===1 && interrupt==='permission')aborter.abort(Error('cancelled during permission'));
    if(method==='Browser.setPermission' && permissionCalls>1 && restoreFailures>0){restoreFailures--;throw Error('restore transport lost');}
    if(method==='Emulation.setFocusEmulationEnabled' && interrupt==='navigation')record.documentGeneration++;
    if(method==='Runtime.evaluate'){if(interrupt==='operation')aborter.abort(Error('cancelled after native operation'));return {result:{value:'native'}};}
    return {};
  }}};
  const run=action=>actOnClipboard(record,{action,text:'text'},{step:async work=>{aborter.signal.throwIfAborted();const result=await work();aborter.signal.throwIfAborted();return result;},
    check:()=>aborter.signal.throwIfAborted(),onWrite:()=>{writes++;}});
  return {record,calls,run,get writes(){return writes;}};
}

test('native clipboard restores the original context/origin permission and records target focus emulation',async()=>{
  const f=fixture();assert.equal((await f.run('clipboardReadText')).value,'native');assert.equal(f.record.focusEmulated,true);
  const permissions=f.calls.filter(row=>row.method==='Browser.setPermission');assert.equal(permissions.length,2);
  assert.deepEqual(permissions.map(row=>row.params.setting),['granted','prompt']);
  assert(permissions.every(row=>row.params.origin==='https://fixture.test' && row.params.browserContextId==='owned-context'));
  assert.equal(f.record.pending.size,0);assert.equal(f.writes,0);
});

for(const interrupt of ['permission','navigation','operation'])test(`clipboard ${interrupt} interruption restores permissions without replay`,async()=>{
  const f=fixture({interrupt});await assert.rejects(f.run('clipboardWriteText'),interrupt==='navigation'?{code:'STALE_CLIPBOARD_DOCUMENT'}:/cancelled/);
  const permissions=f.calls.filter(row=>row.method==='Browser.setPermission');assert.equal(permissions.length,2);
  assert.equal(permissions.at(-1).params.setting,'granted');assert.equal(f.record.pending.size,0);
  assert.equal(f.writes,interrupt==='operation'?1:0);
  assert.equal(f.calls.filter(row=>row.method==='Runtime.evaluate').length,interrupt==='operation'?2:1);
});

test('permission cleanup failures remain explicit and cannot report clipboard success',async()=>{
  const f=fixture({restoreFailure:true});await assert.rejects(f.run('clipboardWriteText'),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED',details:{inputDispatched:true,effectVerified:false,permissionRestorePending:true}});
  assert.equal(f.writes,1);assert.equal(f.record.pending.size,0);
});


for(const action of ['clipboardReadText','clipboardWriteText'])test(`${action} retains exact permission cleanup debt until a later acknowledged retry`,async()=>{
  const f=fixture({restoreFailure:true,initial:'prompt',writeInitial:'denied'});
  await assert.rejects(f.run(action),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  assert.equal(f.record.clipboardPermissionRestores?.size,1,'a failed restore must remain owed after the request settles');
  const debt=[...f.record.clipboardPermissionRestores.values()][0];
  assert.deepEqual(debt.params,{permission:action==='clipboardReadText'?{name:'clipboard-read',allowWithoutSanitization:true}:{name:'clipboard-write',allowWithoutGesture:true},
    origin:'https://fixture.test',browserContextId:'owned-context',setting:action==='clipboardReadText'?'prompt':'denied'});
  f.record.identity.contextId='replacement-context';
  await clipboard.restoreClipboardPermissions(f.record);
  assert.equal(f.record.clipboardPermissionRestores.size,0);
  assert.deepEqual(f.calls.filter(row=>row.method==='Browser.setPermission').at(-1).params,debt.params);
});

test('repeated permission cleanup failures remain owed and block a new clipboard grant',async()=>{
  const f=fixture({restoreFailures:3});await assert.rejects(f.run('clipboardReadText'),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  assert.equal(f.record.clipboardPermissionRestores?.size,1);
  await assert.rejects(clipboard.restoreClipboardPermissions(f.record),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  const before=f.calls.length;
  await assert.rejects(f.run('clipboardWriteText'),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  assert.equal(f.record.clipboardPermissionRestores.size,1);
  assert.deepEqual(f.calls.slice(before).map(row=>row.method),['Browser.setPermission'],'no new document query or grant may replace the old permission baseline');
  await clipboard.restoreClipboardPermissions(f.record);assert.equal(f.record.clipboardPermissionRestores.size,0);
});

test('only confirmed owned-process destruction can discard unreachable permission cleanup debt',async()=>{
  const f=fixture({restoreFailures:2});await assert.rejects(f.run('clipboardReadText'),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  assert.equal(f.record.clipboardPermissionRestores?.size,1);
  f.record.page={isClosed:()=>true};
  await assert.rejects(clipboard.restoreClipboardPermissions(f.record),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  assert.equal(f.record.clipboardPermissionRestores.size,1,'closing a page does not revoke browser-context permissions');
  const before=f.calls.length;
  await clipboard.restoreClipboardPermissions(f.record,{ownedProcessClosed:true});
  assert.equal(f.record.clipboardPermissionRestores.size,0);assert.equal(f.calls.length,before);
});

test('permission retries use the captured browser sender after the original page session closes',async()=>{
  const f=fixture({restoreFailure:true});await assert.rejects(f.run('clipboardReadText'),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  const debt=[...f.record.clipboardPermissionRestores.values()][0],calls=[];
  f.record.session={send:async()=>{throw Error('original page session is closed');}};
  f.record.clipboardPermissionSend=async(method,params)=>{calls.push({method,params});};
  await clipboard.restoreClipboardPermissions(f.record);assert.equal(f.record.clipboardPermissionRestores.size,0);
  assert.deepEqual(calls,[{method:'Browser.setPermission',params:debt.params}]);
});

test('concurrent cleanup callers share one acknowledgement and retain the debt while it is pending',async()=>{
  const f=fixture({restoreFailure:true});await assert.rejects(f.run('clipboardReadText'),{code:'CLIPBOARD_PERMISSION_RESTORE_FAILED'});
  let complete,started=0;f.record.clipboardPermissionSend=()=>{started++;return new Promise(resolve=>{complete=resolve;});};
  const first=clipboard.restoreClipboardPermissions(f.record),second=clipboard.restoreClipboardPermissions(f.record);
  assert.equal(first,second);await Promise.resolve();assert.equal(started,1);
  assert.equal(f.record.clipboardPermissionRestores.size,1);assert.equal(f.record.pending.size,1);
  complete();await first;await second;assert.equal(f.record.clipboardPermissionRestores.size,0);assert.equal(f.record.pending.size,0);
});
