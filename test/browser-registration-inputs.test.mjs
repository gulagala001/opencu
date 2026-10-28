import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createBrowserBackend} from '../src/browser/backend.mjs';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';
const endpoint = 'ws://registration.synthetic.invalid/devtools/browser/registration-safety';
const digest = value => createHash('sha256').update(value).digest('hex');
const browserId = `browser:cdp:${digest(endpoint).slice(0, 16)}`;
const connectionId = `cdp:${digest(endpoint)}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
const ioTick = () => new Promise(resolve => setTimeout(resolve,10));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject}; };
const syntheticError = message => Object.assign(new Error(message), {code: 'SYNTHETIC_TRANSIENT'});
const targetRecord = targetId => ({
  id: `tab:${digest(`${browserId}\0${connectionId}\0${targetId}`).slice(0, 32)}`,
  identity: {browserId, connectionId, targetId, contextId: 'synthetic-context'},
  keys: ['Shift'], buttons: [],
});
async function until(predicate, label, wait = tick) {
  for (let index = 0; index < 100; index++) { if (predicate()) return; await wait(); }
  throw new Error('Synthetic fixture did not reach ' + label);
}
async function fixture(t, saved = [], {provided = false} = {}) {
  const dataDir = await mkdtemp(join(tmpdir(),'opencu-registration-regression-data-'));
  t.after(() => rm(dataDir, {recursive: true, force: true}));
  const journalPath = join(dataDir, 'browser-inputs.json');
  if (saved.length) await writeFile(journalPath, JSON.stringify(saved));
  const journal = async () => { try {return JSON.parse(await readFile(journalPath, 'utf8'));} catch (error) {if (error.code === 'ENOENT') return []; throw error;} };
  const state = {connections: 0, rootCloses: 0, rootFailures: 0, rootError: syntheticError("root close failure"), contextCloses: 0, sessions: [], events: [], rootCloseJournals: [], sessionCleanupJournals: []};
  const pages = [];
  const browser = {
    contexts: () => [context],
    async close() {state.rootCloses++; state.events.push('root-close'); state.rootCloseJournals.push(await journal()); if (state.rootFailures-- > 0) throw state.rootError;},
  };
  const context = Object.assign(new EventEmitter(), {
    browser: () => browser, pages: () => pages.filter(page => !page.closed),
    async close() {state.contextCloses++; throw new Error('CDP context is externally owned');},
    async newCDPSession(page) {
      const session = Object.assign(new EventEmitter(), {
        page, detached: false, scripts: new Set(),
        async detach() {session.detachCalls = (session.detachCalls ?? 0) + 1; if (page.closed) throw page.closedError; if (page.detachFailures-- > 0) throw page.detachError; state.sessionCleanupJournals.push({targetId: page.targetId, stage: 'detach', journal: await journal()}); assert.equal(session.detached, false, 'session detach is acknowledged once'); session.detached = true; state.events.push(`${page.targetId}:detach`);},
        async send(method, args = {}) {
          if (page.closed) throw page.closedError;
          if (method === 'Target.getTargetInfo') {
            page.lookups++;
            if (page.lookupGate && !page.lookupGateUsed) {page.lookupGateUsed = true; await page.lookupGate.promise;}
            if (page.rejectLookup) throw page.lookupError;
            return {targetInfo: {targetId: page.targetId, browserContextId: 'synthetic-context', title: page.targetId, url: page.url()}};
          }
          if (method === 'Page.addScriptToEvaluateOnNewDocument') {const identifier = `${page.targetId}-script-${state.sessions.indexOf(session)}`; session.scripts.add(identifier); return {identifier};}
          if (method === 'Page.removeScriptToEvaluateOnNewDocument') {page.removeCalls = (page.removeCalls ?? 0) + 1; if (page.removeGate) await page.removeGate.promise; if (page.removeFailures-- > 0) throw page.removeError; state.sessionCleanupJournals.push({targetId: page.targetId, stage: 'remove-script', journal: await journal()}); assert(session.scripts.delete(args.identifier), 'persistent script removed only once'); state.events.push(`${page.targetId}:remove-script`); return {};}
          if (method === 'Page.getFrameTree' && page.frameFailures-- > 0) throw page.frameError;
          if (method === 'Page.getFrameTree') return {frameTree: {frame: {id: `${page.targetId}-frame`}}};
          if (method === 'Page.createIsolatedWorld') return {executionContextId: 1};
          if (method === 'Runtime.evaluate') {
            if ((/opencuActivity\??\.dispose\(/u.test(args.expression))) state.events.push(`${page.targetId}:dispose`);
            else {
              page.runtimeStarts++;
              if (page.runtimeGate && !page.runtimeGateUsed) {page.runtimeGateUsed = true; await page.runtimeGate.promise;}
            }
            return {result: {value: null}};
          }
          if (method === 'Page.enable') return {};
          if (method === 'Emulation.setFocusEmulationEnabled') return {};
          throw new Error('Unexpected synthetic CDP method: ' + method);
        },
      });
      state.sessions.push(session); return session;
    },
  });
  function addPage(targetId, options = {}) {
    const page = Object.assign(new EventEmitter(), {
      targetId, closed: false, lookups: 0, runtimeStarts: 0, ups: [], upJournals: [],
      removeFailures: 0, removeError: syntheticError("script removal failure"), frameFailures: 0, frameError: syntheticError("frame init failure"), detachFailures: 0, detachError: syntheticError("detach failure"), upFailures: 0, upError: syntheticError("keyup failure"), closedError: syntheticError("Target page is closed"),
      closeFromOwner() {page.closed = true; for (const session of state.sessions.filter(session => session.page === page)) {session.detached = true; session.scripts.clear();} page.emit("close");},
      lookupError: syntheticError(`synthetic target lookup failure: ${targetId}`),
      isClosed: () => page.closed, setDefaultTimeout() {}, title: async () => targetId, url: () => 'about:blank', evaluate: async () => null,
      keyboard: {async up(key) {page.upJournals.push(await journal()); page.ups.push(key); state.events.push(`${targetId}:keyup:${key}`); if (page.upFailures-- > 0) throw page.upError;}},
      mouse: {async up({button}) {state.events.push(`${targetId}:mouseup:${button}`);}},
      ...options,
    });
    pages.push(page); return page;
  }
  const backend = await createBrowserBackend({dataDir, ...(provided ? {context, instanceId: 'stable'} : {cdpEndpoint: endpoint}), playwright: {chromium: {
    async connectOverCDP() {state.connections++; return browser;},
  }}});
  return {backend, state, context, addPage, journal, dataDir, browser};
}



test('targeted release leaves another page held and journals each acknowledgement separately',async t=>{
  const f=await fixture(t,[targetRecord('a'),targetRecord('b')]);
  const a=f.addPage('a'),b=f.addPage('b');
  const targets=await f.backend.listTargets();
  assert.equal((await f.backend.releaseTarget(targets.find(target=>target.identity.targetId==='a'))).released,true);
  assert.deepEqual(a.ups,['Shift']);assert.deepEqual(b.ups,[]);
  assert.deepEqual((await f.journal()).find(item=>item.id===targetRecord('b').id)?.keys,['Shift']);
  await f.backend.close();assert.deepEqual(b.ups,['Shift']);
});

test('a closed occurrence retains exact release ownership and retires without touching its sibling',async t=>{
  const f=await fixture(t,[targetRecord('child'),targetRecord('parent')]);
  const child=f.addPage('child'),parent=f.addPage('parent');
  const targets=await f.backend.listTargets(),target=targets.find(item=>item.identity.targetId==='child');
  child.closeFromOwner();
  await assert.rejects(f.backend.releaseTarget({...target,identity:{...target.identity,targetId:'another'}}),{code:'TARGET_IDENTITY_CHANGED'});
  const release=await f.backend.releaseTarget(target);
  assert.equal(release.released,true);assert.equal(release.retired,true);
  await assert.rejects(f.backend.releaseTarget({id:'unknown'}),{code:'TARGET_IDENTITY_CHANGED'});
  assert.equal((await f.backend.releaseTarget(target)).retired,true,'repeat release uses the original occurrence receipt');
  await assert.rejects(f.backend.releaseTarget({...target,identity:{...target.identity,connectionId:'another'}}),{code:'TARGET_IDENTITY_CHANGED'});
  assert.deepEqual(parent.ups,[]);
  assert(!((await f.journal()).some(item=>item.id===target.id)));
  assert.deepEqual((await f.journal()).find(item=>item.id===targetRecord('parent').id)?.keys,['Shift']);
  const all=await f.backend.release({targets:[target]});assert(all.retiredTargetIds.includes(target.id));
  assert.deepEqual((await f.backend.release({targets:[]})).retiredTargetIds,[]);
  await assert.rejects(f.backend.releaseTarget(target),{code:'TARGET_IDENTITY_CHANGED'},'a consumed historical receipt cannot invent a fresh verification');
  await f.backend.close();
});

test('an externally closed idle page converges without any later action or explicit release',async t=>{
  const f=await fixture(t,[targetRecord('child'),targetRecord('parent')]);
  const child=f.addPage('child'),parent=f.addPage('parent');
  await f.backend.listTargets();child.closeFromOwner();
  await until(()=>f.backend.getDiagnostics().trackedTargets===1 && !f.backend.getDiagnostics().pendingClosedReleases,'automatic closed-page retirement',ioTick);
  assert(!((await f.journal()).some(item=>item.id===targetRecord('child').id)));
  assert.deepEqual((await f.journal()).find(item=>item.id===targetRecord('parent').id)?.keys,['Shift']);assert.deepEqual(parent.ups,[]);
  await f.backend.close();
});

test('failed automatic closed-page cleanup keeps its original record and debt for a verified retry',async t=>{
  const f=await fixture(t,[targetRecord('child')]);const child=f.addPage('child');const [target]=await f.backend.listTargets();
  const path=join(f.dataDir,'browser-inputs.json'),previous=path+'.previous';
  await rename(path,previous);await mkdir(path);child.closeFromOwner();
  await until(()=>!f.backend.getDiagnostics().pendingClosedReleases,'failed automatic cleanup settlement',ioTick);
  assert.equal(f.backend.getDiagnostics().trackedTargets,1);assert.equal(f.backend.getDiagnostics().retainedRetirements,0);
  assert(f.backend.getDiagnostics().backgroundErrors.some(error=>error.includes('release remains pending')));
  await rm(path,{recursive:true});await rename(previous,path);
  const released=await f.backend.releaseTarget(target);assert.equal(released.released,true);assert.equal(released.retired,true);
  assert.equal(f.backend.getDiagnostics().trackedTargets,0);assert.deepEqual(await f.journal(),[]);
  await f.backend.close();
});

test('frequent closed tabs bound duplicate-release history and evicted identities fail closed',async t=>{
  const f=await fixture(t);let first,last;
  for(let index=0;index<130;index++){
    const page=f.addPage('child-'+index);[last]=await f.backend.listTargets();first??=last;
    page.closeFromOwner();await until(()=>!f.backend.getDiagnostics().trackedTargets && !f.backend.getDiagnostics().pendingClosedReleases,'automatic popup retirement',ioTick);
    assert.equal((await f.backend.releaseTarget(last)).retired,true);
  }
  assert.equal(f.backend.getDiagnostics().retainedRetirements,128);
  await assert.rejects(f.backend.releaseTarget(first),{code:'TARGET_IDENTITY_CHANGED'});
  assert.equal((await f.backend.releaseTarget(last)).retired,true);
  assert.deepEqual((await f.backend.release()).retiredTargetIds,[],'global cleanup does not repeat unrelated cached history');
  assert.deepEqual((await f.backend.release({targets:[first,last]})).retiredTargetIds,[last.id]);
  await assert.rejects(f.backend.releaseTarget({...last,identity:first.identity}),{code:'TARGET_IDENTITY_CHANGED'});
  await f.backend.close();
});

for(const action of ['keyDown','keyUp','mouseUp']) test(`${action} which closes its exact page returns a released closure receipt`,async t=>{
  const owned={...targetRecord('child'),keys:action==='keyUp'?['Enter']:['Shift'],buttons:action==='mouseUp'?['left']:[]};
  const f=await fixture(t,[owned]);
  const child=f.addPage('child'),parent=f.addPage('parent');
  const targets=await f.backend.listTargets(),target=targets.find(item=>item.identity.targetId==='child');
  const close=async()=>{child.closeFromOwner();throw child.closedError;};
  child.keyboard.down=close;child.keyboard.up=close;child.mouse.up=close;
  const result=await f.backend.act(target,{action,key:'Enter'});
  assert.equal(result.closedTargetId,target.id);assert.equal(result.inputDispatched,true);
  assert.equal(result.release.released,true);assert.equal(result.release.retired,true);
  assert.equal(result.target,undefined);assert.deepEqual(parent.ups,[]);
  assert(!((await f.journal()).some(item=>item.id===target.id)));
  await f.backend.close();
});

test('a crash during key-down remains an error and cannot produce a closed-page receipt',async t=>{
  const f=await fixture(t);
  const child=f.addPage('child');
  const [target]=await f.backend.listTargets();
  child.keyboard.down=async()=>{child.emit('crash');throw Object.assign(Error('renderer crashed'),{code:'TARGET_CRASHED'});};
  await assert.rejects(f.backend.act(target,{action:'keyDown',key:'Enter'}),error=>{
    assert.equal(error.code,'TARGET_CRASHED');assert.equal(error.details.release.released,true);
    assert.notEqual(error.details.release.retired,true);return true;
  });
  await f.backend.close();
});

test('cancellation during a self-closing key action still rejects and retains the release receipt',async t=>{
  const f=await fixture(t),aborter=new AbortController();
  const child=f.addPage('child');const [target]=await f.backend.listTargets();
  child.keyboard.down=async()=>{child.closeFromOwner();aborter.abort();};
  await assert.rejects(f.backend.act(target,{action:'keyDown',key:'Enter',signal:aborter.signal}),error=>{
    assert.equal(error.code,'CONTROL_STOPPED');assert.equal(error.details.release.released,true);assert.equal(error.details.release.retired,true);return true;
  });
  await f.backend.close();
});

test('initial CDP batch releases and persists an adopted healthy sibling before root teardown', async t => {
  const saved = targetRecord('healthy-held');
  const f = await fixture(t, [saved]);
  const failureGate = deferred();
  f.addPage('failed', {lookupGate: failureGate});
  const healthy = f.addPage('healthy-held');
  const original = syntheticError('initial batch lookup failed');
  const result = f.backend.listTargets().then(value => ({value}), error => ({error}));
  await until(() => healthy.runtimeStarts > 0, 'healthy activity initialization');
  await tick(); // The healthy attempt can finish adopt and publication.
  failureGate.reject(original);
  assert.equal((await result).error, original, 'preserve the registration error');
  assert.deepEqual(healthy.ups, ['Shift'], 'the already-adopted Shift must be released');
  assert(healthy.upJournals[0].some(item => item.id === saved.id && item.keys.includes('Shift')), 'journal still owns Shift until keyup is acknowledged');
  assert.equal(f.state.rootCloses, 1);
  assert(f.state.events.indexOf('healthy-held:keyup:Shift') < f.state.events.indexOf('root-close'));
  assert(!f.state.rootCloseJournals[0].some(item => item.id === saved.id && item.keys.length), 'keyup must be persisted before root teardown');
  assert(!((await f.journal()).some(item => item.id === saved.id && item.keys.length)));
  const healthyCleanup = f.state.sessionCleanupJournals.filter(item => item.targetId === healthy.targetId);
  assert(healthyCleanup.length > 0, 'successful sibling resources must be explicitly cleaned');
  for (const step of healthyCleanup) assert(!step.journal.some(item => item.id === saved.id && item.keys.length), `persist released input before healthy ${step.stage}`);
  assert.equal(f.state.contextCloses, 0);
  await f.backend.close();
});

test('incomplete registration inventory preserves unresolved held input until actual recovery and release', async t => {
  const saved = targetRecord('unregistered-held');
  const f = await fixture(t, [saved]);
  f.addPage('healthy');
  assert.equal((await f.backend.listTargets()).length, 1);
  const missing = f.addPage('unregistered-held', {rejectLookup: true});
  f.context.emit('page', missing);
  await until(() => missing.lookups > 0, 'event registration failure');
  await tick();
  await assert.rejects(f.backend.listTargets(), error => error.code === 'SYNTHETIC_TRANSIENT');
  const incompleteRelease = await f.backend.release().catch(error => ({released: false, error}));
  assert.equal(incompleteRelease.released, false, 'a currently open unregistered target is not evidence that held input is gone');
  assert.deepEqual((await f.journal()).find(item => item.id === saved.id)?.keys, ['Shift'], 'missing() must not erase an unregistered live target');
  assert.deepEqual(missing.ups, []);
  assert.equal(f.state.rootCloses, 0);
  missing.rejectLookup = false;
  assert.equal((await f.backend.listTargets()).length, 2, 'page registration recovers on the unchanged connection');
  assert.equal((await f.backend.release()).released, true);
  assert.deepEqual(missing.ups, ['Shift']);
  assert(!((await f.journal()).some(item => item.id === saved.id && item.keys.length)));
  assert.equal(f.state.connections, 1, 'late-page recovery must not reconnect');
  await f.backend.close();
  assert.equal(f.state.contextCloses, 0);
});

test('initial failure drains registrations started by page events before teardown and evicts their old cache entries', async t => {
  const f = await fixture(t);
  const failureGate = deferred(), eventGate = deferred();
  f.addPage('failed', {lookupGate: failureGate});
  const healthy = f.addPage('healthy');
  const original = syntheticError('initial failure while event registration is in flight');
  let settled = false;
  const result = f.backend.listTargets().then(value => {settled = true; return {value};}, error => {settled = true; return {error};});
  await until(() => healthy.runtimeStarts > 0, 'healthy initial sibling');
  const eventPage = f.addPage('event-page', {runtimeGate: eventGate});
  f.context.emit('page', eventPage);
  await until(() => eventPage.runtimeStarts > 0, 'in-flight event activity evaluation');
  failureGate.reject(original);
  await tick(); await tick();
  let observed;
  try {
    assert.equal(f.state.rootCloses, 0, 'root teardown must wait for in-flight event registration');
    assert.equal(settled, false, 'initial failure must not escape before acquired resources are coordinated');
  } finally {
    eventGate.resolve();
    observed = await result;
    await tick();
  }
  assert.equal(observed.error, original);
  assert.equal(f.state.rootCloses, 1);
  const oldEventSession = f.state.sessions.find(session => session.page === eventPage);
  assert.equal(oldEventSession.detached, true, 'old-generation event session is not orphaned');
  assert.equal(oldEventSession.scripts.size, 0);
  assert.equal(oldEventSession.listenerCount('Target.receivedMessageFromTarget'), 0);
  assert.equal(oldEventSession.listenerCount('Target.detachedFromTarget'), 0);
  const recovered = await f.backend.listTargets();
  assert.deepEqual(recovered.map(item => item.title).sort(), ['event-page', 'failed', 'healthy']);
  assert.equal(f.state.sessions.filter(session => session.page === eventPage).length, 2, 'do not reuse a fulfilled registration from the torn-down generation');
  assert.equal(f.state.connections, 2);
  await f.backend.close();
  assert.equal(f.state.contextCloses, 0);
});

test('partial adopted-key release failure preserves only unfinished input and retire retries it before disconnect', async t => {
  const one = targetRecord('held-one'), two = targetRecord('held-two');
  const f = await fixture(t, [one, two]);
  const gate = deferred();
  f.addPage('failed-registration', {lookupGate: gate});
  const first = f.addPage('held-one'), second = f.addPage('held-two', {upFailures: 1});
  const original = syntheticError('initial registration failure');
  const outcome = f.backend.listTargets().catch(error => error);
  await until(() => first.runtimeStarts && second.runtimeStarts, 'both adopted sibling registrations'); await tick();
  gate.reject(original);
  assert.equal(await outcome, original);
  assert.equal(original.details.cleanup.code, 'RELEASE_FAILED');
  assert.equal(f.state.rootCloses, 0);
  assert.deepEqual(first.ups, ['Shift']); assert.deepEqual(second.ups, ['Shift']);
  assert(!((await f.journal()).some(item => item.id === one.id)));
  assert.deepEqual((await f.journal()).find(item => item.id === two.id).keys, ['Shift']);
  assert.equal((await f.backend.release()).released, true);
  assert.deepEqual(first.ups, ['Shift'], 'an acknowledged release is not sent again');
  assert.deepEqual(second.ups, ['Shift', 'Shift']);
  assert.equal(f.state.rootCloses, 1); assert.deepEqual(await f.journal(), []);
  await f.backend.close();
});

test('failed retiring root close retries only unfinished root work after held input and sessions were cleaned', async t => {
  const saved = targetRecord('held');
  const f = await fixture(t, [saved]); f.state.rootFailures = 1;
  const gate = deferred(); f.addPage('failed-registration', {lookupGate: gate});
  const held = f.addPage('held');
  const original = syntheticError('initial registration failure');
  const outcome = f.backend.listTargets().catch(error => error);
  await until(() => held.runtimeStarts, 'adopted healthy sibling'); await tick(); gate.reject(original);
  assert.equal(await outcome, original);
  assert.equal(original.details.cleanup.message, f.state.rootError.message);
  assert.equal(f.state.rootCloses, 1); assert.deepEqual(held.ups, ['Shift']);
  const detachCalls = f.state.sessions.map(session => session.detachCalls);
  assert.equal((await f.backend.release()).released, true);
  assert.equal(f.state.rootCloses, 2); assert.deepEqual(held.ups, ['Shift']);
  assert.deepEqual(f.state.sessions.map(session => session.detachCalls), detachCalls);
  assert.equal(f.state.connections, 1); await f.backend.close();
});

test('a second failed rollback retains the original registration error and updates its cleanup diagnostic', async t => {
  const f = await fixture(t, [], {provided: true});
  const page = f.addPage('lookup-and-detach-fail', {rejectLookup: true, detachFailures: 2});
  const first = await f.backend.listTargets().catch(error => error);
  assert.equal(first, page.lookupError); assert.equal(first.details.cleanup.message, page.detachError.message);
  const second = await f.backend.listTargets().catch(error => error);
  assert.equal(second, first, 'retryable cleanup must not replace the primary registration failure');
  assert.equal(second.details.cleanup.message, page.detachError.message);
  page.rejectLookup = false;
  assert.equal((await f.backend.listTargets()).length, 1);
  await f.backend.close();
});

test('runtime reconfiguration can retry a backend whose close flag is sticky after root-close failure', async t => {
  const f = await fixture(t); f.addPage('healthy'); f.state.rootFailures = 1;
  let config = {dataDir: f.dataDir, nativeEnabled: false, extensionEnabled: false, browserEnabled: true,
    cdpEndpoint: endpoint, browserOptions: {playwright: {chromium: {async connectOverCDP() {f.state.connections++; return f.browser;}}}}};
  const runtime = createPluginRuntime({getConfig: () => config});
  assert.equal((await runtime.request('targets')).targets.length, 1);
  config = {...config, browserEnabled: false};
  await assert.rejects(runtime.request('reconfigure'), error => error.code === 'CLOSE_FAILED');
  assert.equal(f.state.rootCloses, 1);
  assert.equal((await runtime.request('reconfigure')).ok, true);
  assert.equal(f.state.rootCloses, 2);
  assert.equal((await runtime.close()).ok, true);
});


test('direct close releases a healthy adopted key before reporting unrelated failed-registration cleanup', async t => {
  const identity = {browserId: 'browser:local', connectionId: 'context:stable', targetId: 'healthy-held', contextId: 'synthetic-context'};
  const saved = {id: `tab:${digest(`${identity.browserId}\0${identity.connectionId}\0${identity.targetId}`).slice(0, 32)}`, identity, keys: ['Shift'], buttons: []};
  const f = await fixture(t, [saved], {provided: true});
  const failed = f.addPage('failed-cleanup', {frameFailures: 1, removeFailures: 100});
  const healthy = f.addPage('healthy-held');
  await assert.rejects(f.backend.listTargets(), error => error === failed.frameError);
  await assert.rejects(f.backend.close(), error => error === failed.removeError);
  assert.deepEqual(healthy.ups, ['Shift'], 'an unrelated cleanup failure must not prevent the original close release stage');
  assert(!((await f.journal()).some(item => item.id === saved.id && item.keys.length)));
});


test('close joins in-flight rollback recovery and forbids concurrent retries from acquiring another session', async t => {
  const f = await fixture(t, [], {provided: true});
  const page = f.addPage('recovering', {frameFailures: 1, removeFailures: 1});
  await assert.rejects(f.backend.listTargets(), error => error === page.frameError);
  const gate = deferred(); page.removeGate = gate;
  const retries = Array.from({length: 6}, () => f.backend.listTargets().then(value => ({value}), error => ({error})));
  await until(() => page.removeCalls === 2, 'shared cleanup recovery');
  let closeDone = false;
  const close = f.backend.close().then(() => {closeDone = true;});
  await tick();
  assert.equal(closeDone, false); assert.equal(f.state.sessions.length, 1); assert.equal(page.removeCalls, 2);
  gate.resolve();
  const outcomes = await Promise.all(retries); await close;
  assert(outcomes.every(item => item.error?.code === 'BACKEND_CLOSING'));
  assert.equal(f.state.sessions.length, 1); assert.equal(page.removeCalls, 2);
  assert.equal(f.state.sessions[0].detachCalls, 1);
  assert.equal(f.state.sessions[0].scripts.size, 0);
  assert.equal(f.state.sessions[0].listenerCount('Target.receivedMessageFromTarget'), 0);
  assert.equal(f.state.contextCloses, 0); assert.equal(f.state.rootCloses, 0);
});

test('release racing initialization retirement sends each held-key release once', async t => {
  const saved = targetRecord('held');
  const f = await fixture(t, [saved]);
  const failedGate = deferred(), firstUp = deferred();
  f.addPage('failed', {lookupGate: failedGate});
  const held = f.addPage('held');
  const original = syntheticError('initial failure during explicit release');
  let ups = 0;
  held.keyboard.up = async key => { ups++; if (ups === 1) await firstUp.promise; };
  const inventory = f.backend.listTargets().then(value => ({value}), error => ({error}));
  await until(() => held.runtimeStarts > 0, 'healthy registration'); await tick();
  const release = f.backend.release();
  await until(() => ups > 0, 'first keyup');
  failedGate.reject(original);
  await new Promise(resolve => setTimeout(resolve, 150));
  const before = {ups, rootCloses: f.state.rootCloses};
  firstUp.resolve();
  await Promise.all([inventory, release]);
  await f.backend.close();
  assert.equal(before.rootCloses, 0, 'root teardown must wait for the original keyup acknowledgement');
  assert.equal(before.ups, 1, 'retirement must join an in-flight release rather than dispatching a second keyup');
});
