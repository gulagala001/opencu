import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {Context} from '@deepseek-ai/cordis';
import plugin from '../src/dsh/index.mjs';
import {createBrowserPairing} from '../src/extension/pairing.mjs';
import {createComputerSession} from '../src/dsh/computer.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(read) {
  const deadline = performance.now() + 2000;
  while (performance.now() < deadline) { const value = await read(); if (value) return value; await tick(); }
  assert.fail('Expected binding stage was not reached');
}
async function fixture(t) {
  const parent = resolve('.local'); await mkdir(parent, {recursive: true});
  const dataDir = await mkdtemp(join(parent, 'binding-timeout-'));
  const target = {id: 'native:synthetic:window:42', backend: 'native', kind: 'app', platform: 'win32',
    name: 'Synthetic WebView host', pid: 21, windowId: 42, identity: {pid: 21, windowId: 42, executable: '/synthetic/webview.exe'}};
  const calls = {select: 0, observe: 0, release: 0}, hooks = {};
  const native = {
    listTargets: async () => [target], verify: async () => ({valid: true, target}),
    select: async () => { calls.select++; return target; },
    observe: async (_target, args) => {
      calls.observe++;
      if (hooks.observe) return hooks.observe(args);
      if (args.format === 'screenshot') return {screenshot: {base64: Buffer.from('synthetic pixels').toString('base64')}};
      return {ax: {nodes: [{elementId: 'synthetic-button', role: 'button', name: 'Synthetic button'}]}};
    },
    act: async () => ({}), release: async () => { calls.release++; return {released: true}; }, close: async () => {},
  };
  const ctx = new Context();
  const owner = ctx.plugin(plugin, {dataDir, native, nativeEnabled: true, browserEnabled: false, extensionEnabled: false, registerTools: false});
  await owner;
  const service = ctx.get('opencu'), sessionKey = 'synthetic-binding';
  const attachments = {saveImage: async ({name, mediaType}) => ({attachmentId: 'sha256:synthetic-pixels', name, mediaType})};
  const run = (code, timeoutMs = 1500, signal) => service.request('computer_use', {code, timeoutMs}, {sessionKey, signal, attachments});
  const pending = async () => (await service.request('appApprovals/pending', {conversationId: sessionKey})).requests;
  const accept = async () => {
    const [request] = await until(async () => { const requests = await pending(); return requests.length ? requests : null; });
    await service.request('appApprovals/respond', {conversationId: sessionKey, requestId: request.id, action: 'accept', persist: 'session'});
    return request;
  };
  const bind = async () => { const result = run(`var app = await cua.getApp(${JSON.stringify(target.id)});`); await accept(); return result; };
  t.after(async () => { hooks.observe = undefined; await owner.dispose(); await rm(dataDir, {recursive: true, force: true}); });
  await run('await cua.getState();');
  return {run, pending, accept, bind, target, calls, hooks, service, sessionKey};
}

test('human approval does not consume the execution deadline or reset existing bindings', {timeout: 10000}, async t => {
  const f = await fixture(t);
  await f.run('var retained = 42;');
  let settled = false;
  const binding = f.run(`var app = await cua.getApp(${JSON.stringify(f.target.id)})`, 400).finally(()=>{settled=true;});
  await until(async()=> (await f.pending()).length);
  await new Promise(resolve=>setTimeout(resolve,650));
  assert.equal(settled,false);assert.equal(f.calls.select,0);assert.equal(f.calls.release,0);
  await f.accept();assert.equal((await binding).ok,true);
  assert.ok((await f.run('retained')).outputs.includes('42'));
  assert.ok((await f.run('app.id')).outputs.includes(f.target.id));
});

test('human approval remains immediately cancellable and clears the pending prompt',async t=>{
  const f=await fixture(t),aborter=new AbortController();
  const binding=f.run(`await cua.getApp(${JSON.stringify(f.target.id)})`,400,aborter.signal);
  const rejected=assert.rejects(binding,/cancelled by test/);
  await until(async()=> (await f.pending()).length);
  aborter.abort(Error('cancelled by test'));await rejected;
  assert.deepEqual(await f.pending(),[]);assert.equal(f.calls.select,0);
});

test('an initial native AX timeout retains its binding and allows a screenshot without selecting again', async t => {
  const f = await fixture(t);
  f.hooks.observe = async () => { throw Object.assign(new Error('Synthetic bounded accessibility provider timeout'), {code: 'AX_TIMEOUT'}); };
  const result = await f.bind();
  assert.equal(result.ok, true);
  assert.ok(result.outputs.some(value => value.includes('initialObservationError') && value.includes('AX_TIMEOUT')));
  const selects = f.calls.select;
  f.hooks.observe = undefined;
  const screenshot = await f.run('await app.getScreenshot();');
  assert.equal(screenshot.images.length, 1); assert.equal(f.calls.select, selects);
});

test('a stalled native observation reports its backend stage and does not become an approval timeout', async t => {
  const f = await fixture(t); await f.bind();
  const gate = Promise.withResolvers();
  f.hooks.observe = async () => gate.promise;
  try {
    await assert.rejects(f.run('await app.getAXState();', 75), error => {
      assert.equal(error.code, 'COMPUTER_TIMEOUT');
      assert.equal(error.details.stage, 'backend-request');
      assert.equal(error.details.pendingRequests[0].endpoint, 'observe');
      assert.equal(error.details.pendingRequests[0].targetId, f.target.id);
      return true;
    });
  } finally { gate.resolve({ax: {nodes: []}}); }
  assert.ok(f.calls.release > 0);
  await assert.rejects(f.run('app.id'), /app is not defined/);
});

test('JavaScript runaway still times out independently of application approval', async t => {
  const f = await fixture(t);
  await assert.rejects(f.run('while (true) {}', 75), error => {
    assert.equal(error.code, 'COMPUTER_TIMEOUT'); assert.equal(error.details.stage, 'javascript'); return true;
  });
  assert.deepEqual(await f.pending(), []);
  assert.equal((await f.run('await cua.getState();')).ok, true);
});

test('cancelling a read does not stop an otherwise active computer session',async t=>{
  const f=await fixture(t);await f.bind();
  const entered=Promise.withResolvers(),gate=Promise.withResolvers(),aborter=new AbortController();
  f.hooks.observe=async()=>{entered.resolve();return gate.promise;};
  const read=f.service.request('observe',{targetId:f.target.id},{sessionKey:f.sessionKey,signal:aborter.signal});
  const rejected=assert.rejects(read,/cancelled read/);
  await entered.promise;aborter.abort(Error('cancelled read'));await rejected;
  gate.resolve({ax:{nodes:[]}});f.hooks.observe=undefined;
  const state=await f.service.request('state');
  assert.equal(state.state.mode,'active');assert.equal(f.calls.release,0);
  assert.equal((await f.run('await app.getAXState();')).ok,true);
});

test('browser pairing waits beyond the execution budget and retains the same worker',async t=>{
  const dataDir=await mkdtemp(join(resolve('.local'),'browser-wait-'));
  const pairing=createBrowserPairing(dataDir),instanceId='synthetic-browser';
  await pairing.discover('chrome-extension://'+ 'a'.repeat(32),{instanceId,label:'Google Chrome'});
  const waiting=Promise.withResolvers();
  const computer=createComputerSession(async(endpoint,args,options)=>{
    if(endpoint==='stop')return {ok:true};
    assert.equal(endpoint,'connectBrowser');
    const result=await pairing.request(args.browser,computer.signal,{waitMs:5000,onWaiting:approval=>{
      const finish=options.onApprovalWait(approval);waiting.resolve();return finish;
    }});
    return {ok:true,...result};
  });
  t.after(async()=>{pairing.close();await computer.close();await rm(dataDir,{recursive:true,force:true});});
  await computer.run({code:'var retained = 42;'});
  let settled=false;
  const connected=computer.run({code:'await cua.connectBrowser("external");',timeoutMs:400}).finally(()=>{settled=true;});
  await waiting.promise;await new Promise(resolve=>setTimeout(resolve,650));
  assert.equal(settled,false);pairing.connected(instanceId);
  assert.equal((await connected).ok,true);
  assert.ok((await computer.run({code:'retained'})).outputs.includes('42'));
});

test('a concurrent approval cannot hide or mislabel a stalled backend deadline',async t=>{
  let stops=0;
  const computer=createComputerSession(async(endpoint,args,options)=>{
    if(endpoint==='stop'){stops++;return {ok:true};}
    const signal=computer.signal;
    const finish=endpoint==='connectBrowser' ? options.onApprovalWait({kind:'browser'}) : undefined;
    try { await new Promise((_,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      signal.throwIfAborted();
    }); } finally {finish?.();}
  });
  t.after(()=>computer.close());
  await computer.run({code:'var ready = true;'});
  await assert.rejects(computer.run({code:'await Promise.all([cua.connectBrowser("external"),cua.getState()]);',timeoutMs:250}),error=>{
    assert.equal(error.code,'COMPUTER_TIMEOUT');assert.equal(error.details.stage,'backend-request');
    assert.ok(error.details.pendingRequests.some(value=>value.stage==='browser-approval'));
    assert.ok(error.details.pendingRequests.some(value=>value.endpoint==='state'));return true;
  });
  assert.equal(stops,1);
});
