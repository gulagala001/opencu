import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,get,ServerResponse} from 'node:http';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {mountComputerUseHttp} from '../src/computer-use/http.mjs';

const compression=createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'))('compression');

test('live HTTP stream bypasses host compression and sends the latest frame after a real slow reader drains', {timeout:15000},async t=>{
  let handler,emit,response,closed=false,aborted=false;
  const hub={config:()=>({}),computerUse:{watchNative:async(session,target,send,signal)=>{
    assert.equal(session,'fixture');assert.equal(target,'window');emit=send;signal.addEventListener('abort',()=>{aborted=true;});return async()=>{closed=true;};
  }}};
  mountComputerUseHttp({inject:(_,fn)=>fn({effect:fn=>fn(),webServer:{register:route=>{handler=route.handler;}},connection:{requestRejection:req=>req.headers['x-cu-test']==='fixture'?undefined:401}})},hub);
  const compress=compression();
  const server=createServer((req,res)=>{response=res;compress(req,res,()=>{void handler(req,res);});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let request,reader;const received=[],until=async fn=>{const end=Date.now()+5000;while(Date.now()<end){if(fn())return;await delay(10);}throw Error('Stream state did not arrive');};
  t.after(async()=>{reader?.destroy();request?.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  reader=await new Promise((resolve,reject)=>{request=get(`http://127.0.0.1:${server.address().port}/trisoul-x/computer-use/stream?session=fixture&app=window`,{headers:{'x-cu-test':'fixture','accept-encoding':'gzip'}},resolve);request.on('error',reject);});
  assert.equal(reader.statusCode,200);assert.equal(reader.headers['content-encoding'],undefined,'SSE must not be buffered in gzip');reader.pause();await until(()=>emit);
  const data='x'.repeat(600000);
  for(let i=0;i<30;i++)emit('frame',{sequence:i,data});
  assert.ok(response.writableLength>524288,'the real socket has backpressure');
  emit('frame',{sequence:999,data:'latest-frame'});
  let buffer='';reader.setEncoding('utf8');reader.on('data',chunk=>{buffer+=chunk;let at;while((at=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,at);buffer=buffer.slice(at+2);if(event.startsWith('event: frame\n'))received.push(JSON.parse(event.slice('event: frame\ndata: '.length)));}});reader.resume();
  // No subsequent frame is emitted. The pending latest frame must arrive on drain.
  await until(()=>received.some(frame=>frame.sequence===999));assert.equal(received.at(-1).data,'latest-frame');assert.ok(received.length<10,'old queued frames are coalesced');
  reader.destroy();await until(()=>closed&&aborted);
});

// An unbound real ServerResponse models end() before finish/close: the stream
// is ended but not destroyed while its output is still waiting to be flushed.
function streamFixture(t,watch,query='app=window'){
  const request=Object.assign(new EventEmitter(),{method:'GET',httpVersionMajor:1,httpVersionMinor:1,url:`/trisoul-x/computer-use/stream?session=fixture&${query}`,headers:{}});
  const response=new ServerResponse(request),timers=new Set();let handler;
  t.mock.method(globalThis,'setInterval',(run,ms)=>{assert.equal(ms,15000);const timer={run,unref(){}};timers.add(timer);return timer;});
  t.mock.method(globalThis,'clearInterval',timer=>timers.delete(timer));
  const write=t.mock.method(response,'write');
  mountComputerUseHttp({inject:(_,fn)=>fn({effect:fn=>fn(),webServer:{register:route=>{handler=route.handler;}},connection:{requestRejection:()=>undefined}})},{config:()=>({}),computerUse:{watchNative:watch,watchBrowser:watch}});
  const pending=handler(request,response);
  t.after(()=>response.destroy());
  return {request,response,write,timers,pending,tick(){for(const timer of [...timers])timer.run();}};
}

for(const query of ['app=window','tab=browser&view=1&stack=1']){
  test(`heartbeat stops after end before close (${query})`,async t=>{
    let signal,disposed=0;const errors=[];
    const f=streamFixture(t,async(_id,_target,_send,s)=>{signal=s;return ()=>{disposed++;};},query);
    f.response.on('error',error=>errors.push(error));await f.pending;
    f.tick();assert.match(f.write.mock.calls.at(-1).arguments[0],/keepalive/);
    f.response.end();assert.equal(f.response.writableEnded,true);assert.equal(f.response.destroyed,false);
    const writes=f.write.mock.callCount();f.tick();await delay(0);
    assert.equal(f.write.mock.callCount(),writes,'never call write after end');
    assert.deepEqual(errors,[]);assert.equal(f.timers.size,0);assert.equal(signal.aborted,true);assert.equal(disposed,1);
  });
}

test('terminal event closes immediately and disposes a late subscription only once',async t=>{
  let emit,signal,resolve,disposed=0;
  const f=streamFixture(t,(_id,_target,send,s)=>{emit=send;signal=s;send('closed',{reason:'target-changed'});return new Promise(done=>{resolve=done;});});
  assert.equal(signal.aborted,true);assert.equal(f.timers.size,0);assert.equal(f.response.writableEnded,true);
  resolve(()=>{disposed++;});await f.pending;await delay(0);
  const writes=f.write.mock.callCount();emit('frame',{data:'late'});f.tick();f.response.emit('finish');f.response.emit('close');f.request.emit('aborted');await delay(0);
  assert.equal(disposed,1);assert.equal(f.write.mock.callCount(),writes);assert.equal(f.response.listenerCount('drain'),0);
});

for(const kind of ['aborted','finish','close','error','write-throw']){
  test(`stream ${kind} cleans up safely while subscription setup is pending`,async t=>{
    let emit,signal,resolve,disposed=0;
    const f=streamFixture(t,(_id,_target,send,s)=>{emit=send;signal=s;return new Promise(done=>{resolve=done;});});
    if(kind==='aborted')f.request.emit('aborted');
    else if(kind==='write-throw'){
      t.mock.method(f.response,'write',()=>{throw new Error('socket gone');});
      assert.doesNotThrow(()=>f.tick());
    }else assert.doesNotThrow(()=>f.response.emit(kind,...(kind==='error'?[new Error('async write failure')]:[])));
    assert.equal(signal.aborted,true);assert.equal(f.timers.size,0);
    resolve(()=>{disposed++;throw new Error('already released');});await f.pending;await delay(0);
    const writes=f.write.mock.callCount();assert.doesNotThrow(()=>emit('frame',{data:'late'}));assert.doesNotThrow(()=>f.tick());
    f.response.emit('close');await delay(0);assert.equal(disposed,1);assert.equal(f.write.mock.callCount(),writes);
    assert.equal(f.response.listenerCount('drain'),0);
  });
}

test('subscription failure emits failure once and ends without leaking its heartbeat',async t=>{
  const f=streamFixture(t,async()=>{throw new Error('capture unavailable');});await f.pending;
  assert.equal(f.response.writableEnded,true);assert.equal(f.timers.size,0);
  assert.equal(f.write.mock.callCount(),1);assert.match(f.write.mock.calls[0].arguments[0],/event: failure\ndata: .*capture unavailable/);
  assert.doesNotThrow(()=>f.tick());
});
