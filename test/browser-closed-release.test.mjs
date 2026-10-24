import test from 'node:test';
import assert from 'node:assert/strict';
import {releasePage} from '../src/browser/actions.mjs';

test('closed-page release waits for late input work before clearing and persisting its final journal',async()=>{
  const gate=Promise.withResolvers(),keys=new Set(['Shift']),buttons=new Set(['left']),journals=[];
  const pending=gate.promise.then(()=>{keys.add('Enter');buttons.add('right');});
  const record={id:'closed-child',page:{isClosed:()=>true},pending:new Set([pending]),keys,buttons};
  const releasing=releasePage(record,1000,{persistInputs:async()=>journals.push({keys:[...keys],buttons:[...buttons]})});
  gate.resolve();assert.deepEqual(await releasing,[]);
  assert.deepEqual([...keys],[]);assert.deepEqual([...buttons],[]);
  assert.deepEqual(journals.at(-1),{keys:[],buttons:[]});
});

for(const input of ['mouse','keyboard']) test(`page closure during ${input} release retires page input without sending into a sibling`,async()=>{
  let closed=false;
  const events=[],keys=new Set(['Shift']),buttons=new Set(input==='mouse'?['left']:[]),journals=[];
  const close=async()=>{events.push(input);closed=true;throw Error('Target closed during release');};
  const record={id:'closing-child',page:{isClosed:()=>closed,mouse:{up:close},keyboard:{up:close}},pending:new Set(),keys,buttons};
  assert.deepEqual(await releasePage(record,1000,{persistInputs:async()=>journals.push({keys:[...keys],buttons:[...buttons]})}),[]);
  assert.deepEqual(events,[input]);assert.deepEqual([...keys],[]);assert.deepEqual([...buttons],[]);
  assert.deepEqual(journals.at(-1),{keys:[],buttons:[]});
});

test('closed-page input cannot retire while its browser-context permission restoration is unconfirmed',async()=>{
  let fail=true;
  const debt={params:{permission:{name:'clipboard-read'},origin:'https://fixture.invalid',setting:'prompt'}};
  const record={id:'closed-child',page:{isClosed:()=>true},keys:new Set(['Shift']),buttons:new Set(),pending:new Set(),
    clipboardPermissionRestores:new Map([['permission',debt]]),clipboardPermissionSend:async()=>{if(fail)throw Error('transport lost');}};
  const failure=await releasePage(record,1000);
  assert.equal(failure[0].code,'CLIPBOARD_PERMISSION_RESTORE_FAILED');assert.equal(record.clipboardPermissionRestores.size,1);
  fail=false;assert.deepEqual(await releasePage(record,1000),[]);
  assert.equal(record.clipboardPermissionRestores.size,0);assert.equal(record.keys.size,0);
});
