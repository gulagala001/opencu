import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createController} from '../src/core/controller.mjs';
import {createBrowserHost} from '../src/dsh/browser-host.mjs';
import {createBrowserTransport} from '../src/client/browser-transport.mjs';
import {createCompositeBrowserBackend} from '../src/browser/composite.mjs';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';

const scratch = new URL('../.local/', import.meta.url);
await mkdir(scratch, {recursive: true});
const checked = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result; };
const settled = work => work.then(value => ({value}), error => ({error}));

async function controllerFixture(t) {
  const dataDir = await mkdtemp(new URL('recovery-', scratch).pathname);
  const target = {id: 'app:original', kind: 'app', identity: {pid: 123, windowId: 1}};
  const state = {held: false, releaseFails: false};
  const backend = {
    listTargets: async () => [target], select: async () => target,
    verify: async () => ({valid: true, target}), observe: async () => ({}),
    act: async () => { state.held = true; return {}; },
    release: async () => { if (state.releaseFails) return {released: false, failures: [{key: 'Shift'}]}; state.held = false; return {released: true}; },
    close: async () => {},
  };
  const controller = await createController({dataDir, browser: false, native: backend});
  t.after(async () => { state.releaseFails = false; await rm(join(dataDir, 'controller.json'), {recursive: true, force: true}); await controller.close(); await rm(dataDir, {recursive: true, force: true}); });
  checked(await controller.selectTarget(target.id));
  return {dataDir, target, state, backend, controller};
}

for (const invalid of ['identity', 'closed-target']) test(`post-dispatch ${invalid} failure blocks control and releases input`, async t => {
  const {target, state, backend, controller} = await controllerFixture(t);
  backend.act = async () => { state.held = true; return invalid === 'identity'
    ? {target: {...target, identity: {pid: 123, windowId: 2}}} : {closedTargetId: 'app:unrelated'}; };
  const result = await controller.act({action: 'keyDown', key: 'Shift'});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TARGET_IDENTITY_CHANGED');
  assert.equal(state.held, false);
  assert.equal(result.state.mode, 'faulted');
  assert.equal((await controller.act({action: 'click'})).error.code, 'CONTROL_STOPPED');
});

test('a failed action commit still releases input before returning', async t => {
  const {dataDir, state, controller} = await controllerFixture(t);
  await rename(join(dataDir, 'controller.json'), join(dataDir, 'before.json'));
  await mkdir(join(dataDir, 'controller.json'));
  const result = await controller.act({action: 'keyDown', key: 'Shift'});
  assert.equal(result.ok, false);
  assert.equal(state.held, false);
  assert.equal(result.state.mode, 'faulted');
});

test('selection failure cannot leave the previous held input active', async t => {
  const {state, backend, controller} = await controllerFixture(t);
  checked(await controller.act({action: 'keyDown', key: 'Shift'}));
  backend.select = async () => { throw Object.assign(Error('selection interrupted'), {code: 'TARGET_IDENTITY_CHANGED'}); };
  const result = await controller.selectTarget('app:original');
  assert.equal(result.ok, false);
  assert.equal(state.held, false);
  assert.equal(result.state.mode, 'faulted');
});

for (const method of ['selectTarget','resume','focus']) for (const stopped of [false,true])
test(`stop cancels ${method} verification${stopped ? ' during recovery' : ''}`, async t => {
  const {target, state, backend, controller} = await controllerFixture(t);
  checked(await controller.act({action:'keyDown',key:'Shift'}));
  if (stopped) checked(await controller.stop());
  let entered, finish;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  const original = backend.verify;
  backend.verify = async () => { entered(); await gate; return {valid:true,target}; };
  const operation = controller[method](method === 'selectTarget' ? target.id : {targetId:target.id});
  await waiting;
  try {
    const ending = controller.stop();
    let timer;
    try {
      await Promise.race([ending,new Promise((_,reject) => { timer=setTimeout(()=>reject(Error('stop waited for a read-only verification')),1000); })]);
    } finally { clearTimeout(timer); }
    checked(await ending);
    assert.equal((await operation).error.code,'CONTROL_STOPPED');
    assert.equal(state.held,false);
  } finally { backend.verify=original;finish();await operation; }
});

test('release failure remains primary when its state cannot be saved', async t => {
  const {dataDir, state, controller} = await controllerFixture(t);
  checked(await controller.act({action: 'keyDown', key: 'Shift'}));
  state.releaseFails = true;
  await rename(join(dataDir, 'controller.json'), join(dataDir, 'before.json'));
  await mkdir(join(dataDir, 'controller.json'));
  const result = await controller.stop();
  assert.equal(result.error.code, 'RELEASE_FAILED');
  assert.equal(result.state.releasePending, true);
  assert.equal(state.held, true);
});

async function hostFixture(t) {
  const host = createBrowserHost(), rendererId = randomUUID();
  const handle = host.handle; let connectionId;
  host.handle = async (method, args, signal) => {
    const result = await handle(method, {connectionId, ...args}, signal);
    if (method === 'browser/connect') connectionId = result.connectionId;
    return result;
  };
  const target = {id: 'dsh:original', identity: {rendererId, guestId: 'original'}};
  t.after(() => host.close());
  const connect = async (targets = [target]) => {
    await host.handle('browser/connect', {rendererId});
    await host.handle('browser/publish', {rendererId, targets});
  };
  await connect();
  async function reply(work, result) {
    const resultPromise = settled(work);
    while (true) {
      const poll = new AbortController();
      const commandsPromise = host.handle('browser/poll', {rendererId}, poll.signal);
      const first = await Promise.race([resultPromise, commandsPromise]);
      if (!first.commands) { poll.abort(); await commandsPromise.catch(() => {}); return first; }
      for (const command of first.commands) await host.handle('browser/result', {rendererId, id: command.id,
        result: typeof result === 'function' ? result(command) : result});
    }
  }
  return {host, rendererId, target, connect, reply};
}

test('a disconnected sidebar with dispatched input cannot acknowledge release', async t => {
  const {host, rendererId, target, reply} = await hostFixture(t);
  await reply(host.backend.act(target, {action: 'keyDown', key: 'Shift'}), {accepted: true});
  await host.handle('browser/disconnect', {rendererId});
  const result = await host.backend.release({targets: [target]});
  assert.equal(result.released, false);
  assert.equal(result.failures[0].targetId, target.id);
});

test('reconnected sidebar input requires selection and releases through the actual guest', async t => {
  const {host, target, connect, reply} = await hostFixture(t);
  await reply(host.backend.select(target), target);
  await reply(host.backend.act(target, {action: 'keyDown', key: 'Shift'}), {accepted: true});
  await connect();
  const stale = await reply(host.backend.act(target, {action: 'type', text: 'must not dispatch'}), {accepted: true});
  assert.equal(stale.error?.code, 'RECOVERY_REQUIRED');
  assert.equal((await reply(host.backend.release(), {released: true})).value.released, true);
  await reply(host.backend.select(target), target);
  assert.deepEqual((await reply(host.backend.act(target, {action: 'type', text: 'after selection'}), {accepted: true})).value, {accepted: true});
});

test('nested release failures stay failures in the sidebar bridge', async t => {
  const {host, reply} = await hostFixture(t);
  const result = await reply(host.backend.release(), {released: true, tabs: [{released: false, failures: [{key: 'Shift'}]}]});
  assert.equal(result.value.released, false);
});

test('an acknowledged closed guest is retired through the composite and cannot become a cold release debt', async t => {
  const {host,rendererId,target,reply}=await hostFixture(t);
  await reply(host.backend.act(target,{action:'keyDown',key:'Shift'}),{accepted:true});
  await host.handle('browser/publish',{rendererId,targets:[],retiredTargets:[target]});
  const composite=createCompositeBrowserBackend({dsh:host.backend});
  const released=(await reply(composite.release({targets:[{...target,provider:'dsh',cold:true}]}),{released:true})).value;
  assert.equal(released.released,true);assert.deepEqual(released.retiredTargetIds,[target.id]);
  await host.handle('browser/publish',{rendererId,targets:[target]});
  assert.deepEqual(await host.backend.listTargets(),[],'a queued stale snapshot cannot revive the retired occurrence');
});

test('sidebar new tabs use controller recovery and stop before allocating another guest', async t => {
  const {host,rendererId,target,reply}=await hostFixture(t);
  target.browserId=`dsh:${rendererId}`;
  const dataDir=await mkdtemp(new URL('sidebar-open-',scratch).pathname);
  const runtime=createPluginRuntime({dataDir,browserEnabled:false,nativeEnabled:false,extensionEnabled:false,dshBrowser:host.backend});
  const commands=[];
  const respond=command=>{commands.push(command);return command.method==='openTab'?{target}:command.method==='release'?{released:true}:target;};
  try {
    checked((await reply(runtime.request('openTarget',{browserId:`dsh:${rendererId}`,sessionId:'owner',url:'about:blank'}),respond)).value);
    assert.equal(commands.filter(command=>command.method==='openTab').length,1);
    assert.equal(commands.find(command=>command.method==='openTab').params.sessionId,'owner');
    checked((await reply(runtime.request('stop'),respond)).value);
    assert.equal((await runtime.request('openTarget',{browserId:`dsh:${rendererId}`,url:'about:blank'})).error.code,'CONTROL_STOPPED');
    assert.equal(commands.filter(command=>command.method==='openTab').length,1);
  } finally {await reply(runtime.close(),respond);await rm(dataDir,{recursive:true,force:true});}
});

test('a replacement renderer cannot release a guest it no longer owns', async t => {
  const {host, target, connect, reply} = await hostFixture(t);
  await reply(host.backend.act(target, {action: 'mouseDown'}), {accepted: true});
  await connect([]);
  assert.equal((await reply(host.backend.release(), {released: true})).value.released, false);
  assert.equal((await host.backend.confirmClosedTargets([target])).released, true);
  assert.equal((await reply(host.backend.release(), {released: true})).value.released, true);
});

test('the existing settings recovery clears only human-confirmed closed sidebar targets', async t => {
  const {host, rendererId, target, reply} = await hostFixture(t);
  const dataDir = await mkdtemp(new URL('settings-recovery-', scratch).pathname);
  const runtime = createPluginRuntime({dataDir,browserEnabled:false,nativeEnabled:false,extensionEnabled:false,dshBrowser:host.backend});
  const respond = command => ['select','verify'].includes(command.method) ? target
    : command.method === 'release' ? {released:true} : {accepted:true};
  try {
    checked((await reply(runtime.request('select',{reference:target.id}),respond)).value);
    checked((await reply(runtime.request('act',{targetId:target.id,action:'keyDown',key:'Shift'}),respond)).value);
    await host.handle('browser/disconnect',{rendererId});
    assert.equal((await runtime.request('stop')).error.code,'RELEASE_FAILED');
    const offer = await runtime.uiRecovery('prepare');
    assert.deepEqual(offer.targets.map(value=>value.id),[target.id]);
    await assert.rejects(runtime.uiRecovery('confirm',{nonce:offer.nonce,confirmedClosed:false}),{code:'RECOVERY_CONFIRMATION_REQUIRED'});
    assert.equal((await runtime.request('state')).state.releasePending,true);
    const reviewed = await runtime.uiRecovery('prepare');
    checked(await runtime.uiRecovery('confirm',{nonce:reviewed.nonce,confirmedClosed:true}));
    const state = (await runtime.request('state')).state;
    assert.equal(state.releasePending,false);
    assert.equal(state.mode,'recovery_required');
    assert.deepEqual(state.targets,[]);
  } finally { await runtime.close(); await rm(dataDir,{recursive:true,force:true}); }
});

test('failed sidebar cleanup retains remote guests for a real release retry', async () => {
  const transport = createBrowserTransport({request: async () => ({ok: true})});
  let releases = 0;
  transport.attachRemote({sessionId: 's', tabId: 't', request: async () => {
    if (++releases === 1) throw Error('synthetic release failure');
    return {released: true};
  }});
  await assert.rejects(transport.dispose(), /cleanup failed/);
  await transport.dispose();
  assert.equal(releases, 2);
});

test('fault cleanup preserves dialogs while explicit stop may dismiss them', async () => {
  const seen = [];
  const backend = Object.fromEntries(['select', 'observe', 'act', 'verify', 'close'].map(key => [key, async () => {}]));
  backend.listTargets = async () => [];
  backend.release = async options => { seen.push(options.dismissDialogs); return {released: true}; };
  const composite = createCompositeBrowserBackend({dsh: backend});
  await composite.release({dismissDialogs: false});
  await composite.release({dismissDialogs: true});
  assert.deepEqual(seen, [false, true]);
});
