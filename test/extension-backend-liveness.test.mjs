import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExtensionBackend} from '../src/extension/backend.mjs';
import {targetId} from '../src/extension/protocol.mjs';

async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'opencu-extension-liveness-')),server=createServer();
  const token='synthetic-extension-liveness-token',origin='chrome-extension://'+'a'.repeat(32);
  const otherToken='synthetic-alternate-pairing-token';
  const pairing={ready:Promise.resolve(),connected(){},authenticate:(_origin,_instanceId,credential)=>credential===otherToken?{durableDownloadConsent:true}:undefined};
  const backend=createExtensionBackend({server,token,pairing,dataDir:dir,requestTimeoutMs:60});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/opencu-extension/v1/`;
  const connection={instanceId:'instance-synthetic',browserInstanceId:'browser-synthetic',epoch:'epoch-synthetic'};
  let sessionId;
  const post=async(route,payload={},credential=token)=>{
    const response=await fetch(base+route,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({...connection,sessionId,...payload})});
    return {status:response.status,value:await response.json()};
  };
  const connect=async(epoch,receipts=[],credential=token)=>{
    const result=await post('connect',{epoch,protocol:1,authorized:true,debuggerConsent:true,releaseReceipts:receipts},credential);
    if(result.status===200){connection.epoch=epoch;sessionId=result.value.sessionId;}
    return result;
  };
  const first=await connect(connection.epoch);assert.equal(first.status,200);
  const next=async()=>{
    for(let n=0;n<100;n++) {const result=await post('poll',{events:[]});assert.equal(result.status,200,JSON.stringify(result.value));if(result.value.commands.length)return result.value.commands;}
    throw Error('No extension command was queued');
  };
  const reply=async(work,result={released:true})=>{
    const settled=Promise.resolve(work);settled.catch(()=>{});
    for(const command of await next())await post('result',{id:command.id,ok:true,result:typeof result==='function'?result(command):result});
    return settled;
  };
  t.after(async()=>{
    try {const closing=backend.close();closing.catch(()=>{});if(backend.connections().length)await reply(closing);else await closing;}
    finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
  });
  const tabs=[1,2].map(tabId=>{const identity={...connection,tabId,documentId:'document'};return {id:targetId(identity),identity};});
  return {backend,tabs,post,connect,next,reply,connection,ticket:first.value.releaseTicket,token,otherToken};
}

test('a timed-out tab command preserves the connection and isolates its unknown outcome until release',async t=>{
  const f=await fixture(t),[a,b]=f.tabs;
  const failed=assert.rejects(f.backend.act(a,{action:'keyDown',key:'Shift'}),{code:'COMMAND_TIMEOUT'});
  const [command]=await f.next();assert.equal(command.method,'act');await failed;
  assert.equal(f.backend.connections().length,1,'one tab timeout cannot expire every target');
  const [release]=await f.next();assert.equal(release.method,'release');assert.equal(release.params.identity.tabId,1);
  await f.post('result',{id:release.id,ok:false,error:{code:'RELEASE_FAILED',message:'Original target is unavailable'}});
  await assert.rejects(f.backend.act(a,{action:'keyDown',key:'Shift'}),{code:'RELEASE_FAILED'});
  assert.equal((await f.reply(f.backend.act(b,{action:'keyDown',key:'b'}),{accepted:true})).accepted,true);
  await f.reply(f.backend.release(a));
  await f.reply(f.backend.act(a,{action:'keyUp',key:'Shift'}),{accepted:true});
});

test('an inventory read timeout leaves the authenticated connection usable for existing targets',async t=>{
  const f=await fixture(t);
  const expired=assert.rejects(f.backend.listTargets(),{code:'COMMAND_TIMEOUT'});
  assert.equal((await f.next())[0].method,'listTargets');await expired;
  assert.equal(f.backend.connections().length,1);
  await f.reply(f.backend.act(f.tabs[1],{action:'keyDown',key:'b'}),{accepted:true});
});

test('fresh epochs do not retire older input debt and release receipts retain original credential ownership',async t=>{
  const f=await fixture(t),oldEpoch=f.connection.epoch;
  const next=await f.connect('epoch-second');assert.equal(next.status,200);
  await assert.rejects(f.backend.release(f.tabs[0]),{code:'STALE_TARGET'});
  const receipt={...f.connection,epoch:oldEpoch,ticket:f.ticket};
  const wrongCredential=await f.connect('epoch-third',[receipt],f.otherToken);assert.equal(wrongCredential.value.error.code,'INVALID_RELEASE_RECEIPT');
  const invalid=await f.connect('epoch-third',[{...receipt,ticket:'wrong-ticket'}]);assert.equal(invalid.value.error.code,'INVALID_RELEASE_RECEIPT');
  assert.equal((await f.connect('epoch-third',[receipt])).status,200);
  assert.equal((await f.backend.release(f.tabs[0])).retired,true);
  assert.equal((await f.connect('epoch-fourth',[{...receipt,instanceId:'another-instance'}])).value.error.code,'INVALID_RELEASE_RECEIPT');
});
