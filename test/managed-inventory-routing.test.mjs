import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AttachmentStore from '@deepseek-ai/dsh-attachment';
import plugin from '../src/dsh/index.mjs';

// Only physical Playwright browser/CDP objects and extension peer are synthetic.
// Production plugin/shared/runtime/tools/computer/pairing/controller remain intact.
const reports = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, label) {
  const end = Date.now() + 2500;
  do { const value = await read(); if (predicate(value)) return value; await pause(5); } while (Date.now() < end);
  throw new Error('Synthetic harness bound exceeded: ' + label);
}
function physicalBrowser(empty = false) {
  const stats = { launches: 0, inventoryReads: 0, pageEvaluations: 0, sessionDetaches: 0, contextCloses: 0, boundaryCalls: [] };
  const page = Object.assign(new EventEmitter(), { id: 'fixed-physical-page', setDefaultTimeout() {}, isClosed: () => false, title: async () => { stats.inventoryReads++; return 'Synthetic existing managed target'; }, url: () => 'https://managed.synthetic.invalid/', evaluate: async () => { stats.pageEvaluations++; return null; } });
  const context = Object.assign(new EventEmitter(), { pages: () => empty ? [] : [page], browser: () => browser,
    close: async () => { stats.contextCloses++; },
    newCDPSession: async () => Object.assign(new EventEmitter(), { detach: async () => { stats.sessionDetaches++; }, send: async method => {
      stats.boundaryCalls.push(method);
      if (method === 'Target.getTargetInfo') return { targetInfo: { targetId: page.id, browserContextId: 'synthetic-context' } };
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'synthetic-frame' } } };
      if (method === 'Runtime.evaluate') return { result: { value: null } };
      return {};
    } }) });
  const browser = { contexts: () => [context], close: async () => { stats.contextCloses++; } };
  return { stats, context, playwright: { chromium: { launchPersistentContext: async (_profile, options) => { stats.launches++; assert.equal(options.headless, true); return context; } } } };
}
async function capture(action) { try { return { returned: true, value: await action() }; } catch (error) { return { returned: false, error, code: error.code ?? error.name }; } }
async function fixture(kind = 'managed') {
  const dir = await mkdtemp(join(tmpdir(), 'opencu-inventory-pairing-repro-')), ctx = new Context(), physical = physicalBrowser(kind === 'connected-empty');
  let failRelease = false;
  const nativeStats = { releases: 0 };
  const native = { listTargets: async () => { if (kind === 'inventory-error') throw Object.assign(new Error('Synthetic physical native inventory failure'), {code:'SYNTHETIC_NATIVE_UNAVAILABLE'}); return kind === 'native' ? [{id:'native:synthetic',backend:'native',kind:'window',title:'Synthetic native window',identity:{instance:'synthetic-native'}}] : []; },
    release: async () => { nativeStats.releases++; return failRelease ? {released:false,failures:[{code:'SYNTHETIC_RELEASE_FAILED',message:'Synthetic release refused'}]} : {released:true}; }, close: async () => {}, verify: async () => ({valid:true}), select: async value => value, observe: async () => ({}), act: async () => ({}) };
  const events = [], cleanup = {};
  await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  await ctx.plugin(ToolRuntime, { mode: 'native' });
  await ctx.plugin(AttachmentStore);
  const config = { dataDir: dir, nativeEnabled: false, ...(kind === 'managed' ? { managedHeadless: true, browserOptions: { playwright: physical.playwright } } : kind === 'connected-empty' ? {browserOptions:{context:physical.context}} : {browserEnabled:false}), ...(['native','inventory-error','release-error'].includes(kind) ? {native, nativeEnabled:true}: {}) };
  // Deliberately omit extensionEnabled: production default stays true.
  const fiber = ctx.plugin(plugin, config); await fiber;
  const service = ctx.get('opencu'), tools = ctx.get('tools'); assert(service && tools.get('opencu_targets'));
  const initial = await service.request('targets');
  assert.equal(initial.ok, true); const managed = initial.targets.find(target => target.browserId === 'browser:local');
  if (kind === 'managed') assert(managed);
  assert.equal(physical.stats.launches, kind === 'managed' ? 1 : 0);
  events.push('anonymous-targets:initial-inventory');
  const { origin: base, token } = JSON.parse(await readFile(join(dir, 'extension-connection.json'), 'utf8'));
  const extensionOrigin = 'chrome-extension://' + 'a'.repeat(32), instanceId = 'synthetic-extension-profile', epoch = 'synthetic-transport-epoch';
  const peerCommands = []; let sessionId, stopPolling = false, poller, demandSeen = 0;
  const post = async (route, payload) => {
    const response = await fetch(base + '/opencu-extension/v1/' + route, { method: 'POST', signal: AbortSignal.timeout(2000), headers: { Origin: extensionOrigin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ instanceId, ...payload }) });
    const value = await response.json(); assert.equal(response.status, 200, route + ':' + JSON.stringify(value)); return value;
  };
  const discover = async (extra = {}) => { const value = await post('discover', { label: 'Google Chrome', ...extra }); if (value.requestId) demandSeen++; return value; };
  const demand = async () => { const value = await until(discover, x => !!x.requestId, 'real production demand'); events.push('discover:demand-present'); return value; };
  const invoke = async (entry, signal, code) => {
    const exec = { signal, agent: { session: { id: 'session-A' } } };
    events.push('entry:' + entry + ':session-A');
    if (entry === 'tool') return tools.get('opencu_targets').execute({}, exec);
    if (entry === 'computer') return tools.get('computer_use').execute({title:'Synthetic inventory routing',code:code ?? "await cua.getBrowser({ id: 'browser:local' })"}, exec);
    if (entry === 'external') return tools.get('opencu_connectBrowser').execute({browser:'external'}, exec);
    throw new Error('unsupported fixture entry');
  };
  return { dir, ctx, config, events, cleanup, initial, managed, physical, nativeStats, service, invoke, post, discover, demand, peerCommands,
    get demandSeen() { return demandSeen; }, failRelease(value) { failRelease = value; },
    async connectPeer() {
      const connected = await post('connect', { protocol: 1, authorized: true, debuggerConsent: true, browserInstanceId: 'synthetic-browser-instance', epoch }); sessionId = connected.sessionId;
      events.push('peer:live-connect');
      poller = (async () => { while (!stopPolling) {
        const packet = await post('poll', { sessionId, epoch, events: [] });
        for (const command of packet.commands) {
          peerCommands.push(command.method);
          const result = command.method === 'listTargets' ? [] : { released: true };
          await post('result', { sessionId, epoch, id: command.id, ok: true, result });
        }
        await pause(5);
      } })();
      const caps = await service.request('capabilities'); assert.equal(caps.connections.length, 1); events.push('capabilities:live-connection-confirmed');
    },
    async finish() {
      // Keep the physical peer available until production release/close finishes.
      failRelease = false;
      const released = await capture(() => fiber.dispose()); cleanup.pluginDisposed = released.returned;
      if (!released.returned) cleanup.releaseError = released.code;
      stopPolling = true; if (poller) { const result = await capture(() => poller); cleanup.pollerStopped = result.returned; } else cleanup.pollerStopped = true;
      const stored = JSON.parse(await readFile(join(dir, 'controller.json'), 'utf8')); cleanup.controllerClosed = stored.closed; cleanup.releasePending = stored.releasePending;
      await ctx.fiber.dispose(); cleanup.rootDisposed = true;
      cleanup.managedContextCloses = physical.stats.contextCloses; cleanup.managedSessionDetaches = physical.stats.sessionDetaches; cleanup.managedReleaseEvaluations = physical.stats.pageEvaluations;
      await rm(dir, { recursive: true, force: true }); cleanup.directoryRemoved = await access(dir).then(() => false, () => true);
      assert.equal(cleanup.pluginDisposed, true); assert.equal(cleanup.controllerClosed, true); assert.equal(cleanup.releasePending, false); assert.equal(cleanup.directoryRemoved, true);
      assert.equal(physical.stats.contextCloses, kind === 'managed' ? 1 : 0, 'provided context remains caller owned');
    }
  };
}
const cases = [
  {name:'managed-generic-tool',kind:'managed',entry:'tool'},
  {name:'managed-local-binding-and-tabs',kind:'managed',entry:'computer',code:"var local = await cua.getBrowser({id:'browser:local'}); await local.tabs.list()"},
  {name:'missing-local-id-never-switches',kind:'managed',entry:'computer',code:"await cua.getBrowser({id:'browser:missing'})",expectError:true},
  {name:'explicit-external-decline-with-managed',kind:'managed',entry:'external',end:'decline'},
  {name:'empty-generic-zero-discovery-window',kind:'empty',entry:'tool'},
  {name:'empty-generic-multiple-profiles',kind:'empty',entry:'tool',multiple:true},
  {name:'explicit-external-multiple-profiles',kind:'empty',entry:'external',multiple:true,expectCode:'BROWSER_CHOICE_REQUIRED'},
  {name:'empty-generic-caller-abort',kind:'empty',entry:'tool',end:'abort'},
  {name:'empty-computer-caller-abort',kind:'empty',entry:'computer',code:'await cua.getBrowser()',end:'abort'},
  {name:'empty-computer-release-failure-visible',kind:'release-error',entry:'computer',code:'await cua.getBrowser()',end:'abort',releaseError:true},
  {name:'native-generic-list-no-pairing',kind:'native',entry:'tool'},
  {name:'native-is-not-a-browser',kind:'native',entry:'computer',code:'await cua.getBrowser()',expectError:true},
  {name:'native-explicit-external-still-reachable',kind:'native',entry:'external',end:'decline'},
  {name:'inventory-errors-preserved-no-pairing',kind:'inventory-error',entry:'tool'},
  {name:'connected-empty-browser-no-pairing',kind:'connected-empty',entry:'tool'},
];
for (const spec of cases) test(spec.name,{timeout:10000},async()=>{
 const f = await fixture(spec.kind), record = {case:spec.name,kind:spec.kind,entry:spec.entry,code:spec.code,events:f.events,cleanup:f.cleanup};
 try {
  const caller = new AbortController(), reason = Object.assign(new Error('Synthetic caller cancellation'),{code:'SYNTHETIC_CANCEL'});
  if (spec.end || ['managed','native','inventory-error','connected-empty'].includes(spec.kind)) await f.discover();
  if (spec.multiple) { await f.discover(); await f.discover({instanceId:'synthetic-second-profile'}); }
  const observed = capture(()=>f.invoke(spec.entry,caller.signal,spec.code));
  if (spec.end) {
   const demand = await f.demand(); f.events.push('demand:observed');
   if (spec.end === 'decline') { await f.post('decline',{requestId:demand.requestId}); f.events.push('peer:decline'); }
   else { if(spec.releaseError) f.failRelease(true); caller.abort(reason); f.events.push('caller:abort'); }
  }
  const result = await observed; record.inventoryReadsForEntry=f.physical.stats.inventoryReads-(f.managed?1:0);
  if(spec.name==='managed-generic-tool') assert.equal(record.inventoryReadsForEntry,1,'one inventory read per generic request');
  if(spec.name==='managed-local-binding-and-tabs') assert.equal(record.inventoryReadsForEntry,2,'binding and tabs.list each reuse one inventory read');
  record.returned=result.returned; record.errorCode=result.code??null;
  if (spec.end === 'decline') assert.equal(result.code,'PAIRING_DECLINED');
  else if (spec.end === 'abort') {
   if(spec.releaseError) { assert.equal(result.code,'RELEASE_FAILED'); assert.notEqual(result.error,reason); }
   else { assert.equal(result.error,reason,'original caller abort reason must retain object identity'); record.abortReasonSameObject=true; }
  } else if(spec.expectCode) assert.equal(result.code,spec.expectCode);
  else if(spec.expectError) assert.equal(result.returned,false,'explicit absent browser must not bind another browser');
  else assert.equal(result.returned,true);
  f.failRelease(false);
  if (spec.end) { const cleared=await f.discover(); assert(!cleared.requestId); record.demandCleared=true; }
  else { if(spec.kind!=='empty'||spec.multiple) { assert(!(await f.discover()).requestId); assert.equal(f.demandSeen,0); } record.noDemandObserved=true; }
  const inventory=await f.service.request('targets');
  record.targetIds=inventory.targets.map(x=>x.id); record.browserIds=inventory.browsers.map(x=>x.id); record.errors=inventory.errors; record.browserProviders=inventory.browserProviders;
  if(f.managed) { assert(inventory.targets.some(x=>x.id===f.managed.id)); record.sameManagedTarget=true; if(spec.entry==='tool'&&result.returned) assert(result.value.targets.some(x=>x.id===f.managed.id)); }
  if(spec.name==='managed-local-binding-and-tabs') { const tabs=JSON.parse(result.value.outputs.at(-1)); assert(tabs.some(x=>x.id===f.managed.id)); record.boundTabsReturnedOriginal=true; }
  if(spec.kind==='native') { assert(inventory.targets.some(x=>x.backend==='native')); if(result.returned&&spec.entry==='tool') assert(result.value.targets.some(x=>x.backend==='native')); }
  if(spec.multiple&&!spec.expectCode) { assert.equal(result.value.browsers.filter(x=>x.pairingRequired).length,2); record.pairingChoices=2; }
  if(spec.kind==='inventory-error') { assert(result.value.errors.some(x=>x.code==='SYNTHETIC_NATIVE_UNAVAILABLE')); assert(inventory.errors.some(x=>x.code==='SYNTHETIC_NATIVE_UNAVAILABLE')); }
  if(spec.kind==='connected-empty') assert(inventory.browsers.some(x=>x.id==='browser:local'&&x.connected));
  if(spec.kind==='empty'&&!spec.end&&!spec.multiple) { assert.deepEqual(result.value.targets,[]); assert.deepEqual(result.value.errors,[]); }
 } catch(error) {record.primaryFailure={code:error.code??error.name,message:error.message};throw error;}
 finally {const cleanup=await capture(()=>f.finish());if(!cleanup.returned)record.cleanupErrorCode=cleanup.code;reports.push(record);console.log('ROUTING '+JSON.stringify(record));if(!record.primaryFailure)assert(cleanup.returned);}
});
test.after(async()=>{if(process.env.ROUTING_REPORT)await writeFile(process.env.ROUTING_REPORT,JSON.stringify(reports,null,2)+'\n');});
