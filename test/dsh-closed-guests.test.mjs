import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestDriver,watchGuestClosure} from '../src/client/guest-driver.mjs';
import {createBrowserHost} from '../src/dsh/browser-host.mjs';
import {createBrowserTransport} from '../src/client/browser-transport.mjs';

function guest({trigger='mouseUp',confirmed=true}={}) {
  let closed=false;const listeners=new Map(),events=[];
  const element={isConnected:true,addEventListener:(name,fn)=>{let set=listeners.get(name);if(!set)listeners.set(name,set=new Set());set.add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),
    getURL:()=>{if(closed)throw Error('Invalid guestInstanceId: 9');return 'https://fixture.invalid/';},
    getTitle:()=>{if(closed)throw Error('Invalid guestInstanceId: 9');return 'Child';},isCrashed:()=>{if(closed)throw Error('Invalid guestInstanceId: 9');return false;}};
  const receipt={closed:true,released:true,retired:true,leaseId:'exact-original-lease',webContentsId:9};
  const close=()=>{closed=true;for(const fn of listeners.get('destroyed')??[])fn();};
  const automate=async(operation,args)=>{
    if(operation==='closedState')return closed&&confirmed?receipt:{closed:false};
    if(operation==='releaseInput'){if(closed){if(confirmed)return receipt;throw Error('Invalid guest lease');}return {released:true};}
    if(['cancelSiteTool','cancelUpload','inputMarker'].includes(operation))return {};
    if(operation==='getDialog')return {dialog:null};
    if(operation==='navigationState')return {url:element.getURL(),documentId:'0',readyState:'complete'};
    if(operation==='point')return {x:10,y:10};
    if(operation==='input'){events.push(args.type);if(args.type===trigger)close();return {dispatched:true};}
    throw Error('Unexpected operation '+operation);
  };
  return {element,automate,events,close,receipt};
}

for(const [action,trigger] of [['click','mouseUp'],['press','keyDown'],['keyUp','keyUp']])test(`DSH ${action} self-close requires the exact host destruction receipt`,async()=>{
  const f=guest({trigger}),target={id:'child',identity:{guestId:'original'}};
  const driver=createGuestDriver(f.element,target,()=>{},()=>{},()=>{},undefined,f.automate);
  if(action==='keyUp')await driver.act({action:'keyDown',key:'Enter'});
  const result=await driver.act({action,...(action==='click'?{}:{key:'Enter'}),x:10,y:10});
  assert.equal(result.closedTargetId,'child');assert.equal(result.inputDispatched,true);
  assert.equal(result.release.retired,true);assert.equal(result.release.webContentsId,9);
  assert.equal((await driver.release()).retired,true);
});

test('a missing webview or unavailable lease is never treated as confirmed destruction',async()=>{
  const f=guest({confirmed:false}),driver=createGuestDriver(f.element,{id:'child'},()=>{},()=>{},()=>{},undefined,f.automate);
  await assert.rejects(driver.act({action:'click',x:10,y:10}),/Invalid guestInstanceId/);
  await assert.rejects(driver.release(),/Invalid guest lease/);
});

test('a closed release waits for late client input acknowledgement before forgetting held input',async()=>{
  const f=guest({trigger:'never'}),gate=Promise.withResolvers(),entered=Promise.withResolvers();
  const automate=async(operation,args)=>{if(operation==='input'&&args.type==='keyDown'){entered.resolve();await gate.promise;}return f.automate(operation,args);};
  const driver=createGuestDriver(f.element,{id:'child'},()=>{},()=>{},()=>{},undefined,automate);
  const action=driver.act({action:'keyDown',key:'Shift'});await entered.promise;f.close();
  let released=false;const release=driver.release().then(value=>{released=true;return value;});
  await Promise.resolve();await Promise.resolve();assert.equal(released,false);
  gate.resolve();assert.equal((await release).retired,true);assert.equal((await action).closedTargetId,'child');
  assert.deepEqual(f.events,['keyDown']);
});

test('DSH transport retires a timer/external close without another action and preserves exact old release replies',async t=>{
  const oldDocument=globalThis.document;globalThis.document={documentElement:{lang:'en'}};
  const host=createBrowserHost(),client={request:(method,args,signal)=>host.handle(method,args,signal)};
  const transport=createBrowserTransport(client);await transport.start();await new Promise(resolve=>setImmediate(resolve));
  const f=guest({trigger:'never'}),detach=await transport.attach(f.element,{sessionId:'s',tabId:'t',focus:()=>{},cursor:()=>{},automate:f.automate});
  t.after(async()=>{await transport.dispose();host.close();globalThis.document=oldDocument;});
  const target=transport.targetFor('s','t');await host.backend.select(target);
  await host.backend.act(target,{action:'keyDown',key:'Shift'});
  f.close();
  const deadline=Date.now()+1000;while((await host.backend.listTargets()).length&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,1));
  assert.deepEqual(await host.backend.listTargets(),[]);
  assert.equal((await host.backend.releaseTarget(target)).retired,true);
  await assert.rejects(host.backend.releaseTarget({...target,identity:{...target.identity,guestId:'replacement'}}),{code:'TARGET_IDENTITY_CHANGED'});
  assert.deepEqual(f.events,['keyDown']);await detach();
});

test('remote closure settles a missing action reply as unknown and preserves its exact release receipt',async t=>{
  const oldDocument=globalThis.document;globalThis.document={documentElement:{lang:'en'}};
  const host=createBrowserHost(),input=Promise.withResolvers(),entered=Promise.withResolvers();
  const client={request:(method,args,signal)=>host.handle(method,args,signal)};
  const transport=createBrowserTransport(client);await transport.start();await new Promise(resolve=>setImmediate(resolve));
  const release={closed:true,released:true,retired:true,leaseId:'original',webContentsId:9};
  const remote=transport.attachRemote({sessionId:'s',tabId:'t',request:async(method)=>{
    if(method==='act'){entered.resolve();await input.promise;return {action:'click',closedTargetId:remote.target.id,inputDispatched:true,release};}
    if(method==='release')return release;
    throw Error(method);
  }});
  remote.update({url:'https://fixture.invalid/',title:'Child'});const target=remote.target;
  t.after(async()=>{input.resolve();await transport.dispose();host.close();globalThis.document=oldDocument;});
  await new Promise(resolve=>setImmediate(resolve));
  await host.backend.select(target);const action=host.backend.act(target,{action:'click'}).catch(error=>error);await entered.promise;
  await remote.retire(release);
  const error=await action;
  assert.equal(error.code,'TARGET_CLOSED');assert.equal(error.details.effectVerified,false);assert.equal(error.details.inputDispatched,true);
  assert.deepEqual(error.details.release,release);assert.deepEqual(await host.backend.listTargets(),[]);
  input.resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await host.backend.releaseTarget(target)).retired,true);
  await assert.rejects(host.backend.releaseTarget({...target,identity:{...target.identity,guestId:'replacement'}}),{code:'TARGET_IDENTITY_CHANGED'});
});

test('native close signals coalesce and a later destruction signal still requires host proof',async()=>{
  const element=new EventTarget(),first=Promise.withResolvers(),entered=Promise.withResolvers(),calls=[],errors=[];
  let probes=0;
  const release={closed:true,released:true,retired:true};
  const unwatch=watchGuestClosure(element,{closedRelease:async options=>{assert.deepEqual(options,{waitForClose:true});if(++probes===1){entered.resolve();return first.promise;}return release;}},value=>calls.push(value),error=>errors.push(error));
  element.dispatchEvent(new Event('close'));await entered.promise;
  element.dispatchEvent(new Event('destroyed'));first.resolve(null);
  for(let attempt=0;attempt<10&&!calls.length;attempt++)await new Promise(resolve=>setImmediate(resolve));
  element.dispatchEvent(new Event('close'));await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[release]);assert.equal(probes,2);assert.deepEqual(errors,[]);unwatch();
});
