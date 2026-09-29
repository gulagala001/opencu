import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { mountComputerUseHttp } from '../src/computer-use/http.mjs';

test('window sharing routes preserve auth, disablement and cancellation without touching control state',async t=>{
  let handler,enabled=true,calls=0,entered,cleaned=false;
  const ready=new Promise(resolve=>{entered=resolve;});
  const native={shareWindows:async()=>{calls++;return[{window_id:4}];},shareWindow:async(window,signal)=>{
    calls++;assert.equal(window.window_id,4);entered();
    try{await delay(10000,undefined,{signal});}finally{cleaned=true;}
  }};
  const hub={config:()=>({computerUseEnabled:enabled}),computerUse:{readWindowShare:(window,signal)=>window?native.shareWindow(window,signal):native.shareWindows(signal)}};
  mountComputerUseHttp({inject:(_names,run)=>run({effect:run=>run(),webServer:{register:route=>{handler=route.handler;}},connection:{requestRejection:req=>req.headers.authorization==='fixture'?undefined:401}})},hub);
  const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}/trisoul-x/computer-use/`;
  const request={method:'POST',headers:{authorization:'fixture','content-type':'application/json'},body:'{}'};
  assert.equal((await fetch(url+'share-windows?session=test',{method:'POST'})).status,401);assert.equal(calls,0);
  enabled=false;assert.equal((await fetch(url+'share-windows?session=test',request)).status,409);assert.equal(calls,0);
  enabled=true;assert.deepEqual(await(await fetch(url+'share-windows?session=test',request)).json(),{windows:[{window_id:4}]});
  const controller=new AbortController();
  const pending=fetch(url+'share-window?session=test',{...request,body:'{"window_id":4}',signal:controller.signal});
  await ready;controller.abort();await assert.rejects(pending);
  for(let i=0;i<100&&!cleaned;i++)await delay(10);
  assert.equal(cleaned,true,'closing the composer request cancels and cleans up the read');
});

test('page annotation route authenticates, respects disablement and aborts a disconnected capture',async t=>{
  let handler,enabled=true,calls=0,entered,aborted=false;const ready=new Promise(resolve=>{entered=resolve;});
  const hub={config:()=>({computerUseEnabled:enabled}),computerUse:{annotationSnapshot:async(id,input,signal)=>{calls++;assert.equal(id,'test');assert.equal(input.tabId,'tab');entered();try{await delay(10000,undefined,{signal});}finally{aborted=signal.aborted;}}}};
  mountComputerUseHttp({inject:(_names,run)=>run({effect:run=>run(),webServer:{register:route=>{handler=route.handler;}},connection:{requestRejection:req=>req.headers.authorization==='fixture'?undefined:401}})},hub);
  const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const url=`http://127.0.0.1:${server.address().port}/trisoul-x/computer-use/annotation?session=test`,request={method:'POST',headers:{authorization:'fixture','content-type':'application/json'},body:'{"tabId":"tab"}'};
  assert.equal((await fetch(url,{method:'POST'})).status,401);enabled=false;assert.equal((await fetch(url,request)).status,409);assert.equal(calls,0);enabled=true;
  const controller=new AbortController(),pending=fetch(url,{...request,signal:controller.signal});await ready;controller.abort();await assert.rejects(pending);
  for(let i=0;i<100&&!aborted;i++)await delay(10);assert.equal(aborted,true);
});

test('computer input uses bounded UTF-8 JSON transport', async () => {
  const { Readable } = await import('node:stream');
  let handler, calls = 0;
  const hub = { config: () => ({}), computerUse: { manualInput: async (_id, input) => { calls++; return input; } } };
  mountComputerUseHttp({ inject: (_, run) => run({ effect: run => run(),
    webServer: { register: route => { handler = route.handler; } }, connection: { requestRejection: () => undefined } }) }, hub);
  const value = { type: 'text', text: '中文路径/😀' }, bytes = Buffer.from(JSON.stringify(value));
  for (const [chunks, status, expected] of [
    [Array.from(bytes, byte => Buffer.from([byte])), 200, value],
    [[Buffer.from('  \n ')], 200, {}], [[Buffer.alloc(65537, 32)], 413],
    [[Buffer.from([0xff])], 400], [[Buffer.from('{bad')], 400],
  ]) {
    const req = Object.assign(Readable.from(chunks), { method: 'POST', url: '/trisoul-x/computer-use/input?session=fixture' });
    const res = { writeHead(code, headers) { this.status = code; this.headers = headers; }, end(body) { this.body = JSON.parse(body); } };
    await handler(req, res); assert.equal(res.status, status);
    if (expected) assert.deepEqual(res.body, expected);
    if (status === 413) assert.equal(res.headers.Connection, 'close');
  }
  assert.equal(calls, 2, 'invalid payloads never reach the computer controller');
});
