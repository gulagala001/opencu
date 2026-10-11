import test from 'node:test';
import assert from 'node:assert/strict';
import { registerComputerPresentation, readComputerPresentation, ComputerPresentationStore } from '../src/computer-use/presentation.mjs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computerPresentationCalls, summarizeToolOutcomes } from '../src/client/computer-groups.mjs';

test('only completed CU PTC calls record an auxiliary UI projection', () => {
  let observer;
  const entries = [];
  const markOwner = registerComputerPresentation({ on(name, listener) { assert.equal(name, 'tools/result'); observer = listener; } }, { record(id, data) { entries.push({ id, data }); } });
  const session = { id: 'owned-session', append() { throw Error('Must not change the native journal'); } };
  const exec = { name: 'computer_use', parent: {}, callId: 'outer:ptc:1', rootCallId: 'outer',
    token: Symbol('actual-dispatch'), signal: new AbortController().signal, agent: { session } };
  const value = { files: [{ name: '真实交付.txt', path: '/native/attachments/file.txt', bytes: 65 }], error: null };
  const result = Object.freeze({ isError: false, value: JSON.stringify(value), content: [] });
  markOwner(exec.token); observer(exec, result);
  assert.deepEqual(entries, [{ id: 'owned-session', data: {
    callId: 'outer:ptc:1', rootCallId: 'outer', meta: { computerUseFiles: value.files, computerUseError: null },
  } }]);
  for (const [call, outcome] of [
    [{ ...exec, parent: undefined }, result], [{ ...exec, name: 'other_plugin_tool' }, result],
    [{ ...exec, signal: AbortSignal.abort() }, result], [exec, { isError: true }],
    [exec, { isError: false, value: JSON.stringify({ files: [], error: null }) }],
  ]) { markOwner(call.token); observer(call, outcome); }
  assert.equal(entries.length, 1, 'native, foreign, aborted, failed and empty outcomes add no record');
  observer({ ...exec, token: Symbol('foreign-shadow') }, result);
  assert.equal(entries.length, 1, 'a same-name foreign body cannot manufacture CU presentation metadata');
  markOwner(exec.token); observer(exec, { isError: false, value: JSON.stringify({ files: [], error: 'REAL_CU_FAILURE' }) });
  assert.equal(entries.at(-1).data.meta.computerUseError, 'REAL_CU_FAILURE');
  assert.deepEqual(result, { isError: false, value: JSON.stringify(value), content: [] }, 'observer never mutates the native result');
});

test('the auxiliary cache survives a new instance, confines identities and loses no native authority', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-presentation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const errors = [], store = new ComputerPresentationStore(directory, error => errors.push(error));
  const record = { callId: '../call/😀', rootCallId: 'outer',
    meta: { computerUseFiles: [{ name: '中文.txt', path: '/durable/中文.txt', bytes: 65 }], computerUseError: null } };
  store.record('../session', record);
  assert.deepEqual(await store.read('../session', record.callId), record, 'read waits for the in-flight atomic write');
  await store.close();
  const file = store.path('../session', record.callId);
  assert.equal(file.startsWith(directory + '/'), true);
  assert.match(file.slice(directory.length + 1), /^[a-f0-9]{64}\/[a-f0-9]{64}\.json$/);
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), record);
  const cold = new ComputerPresentationStore(directory, error => errors.push(error));
  assert.deepEqual(await cold.read('../session', record.callId), record);
  assert.equal(await cold.read('foreign-session', record.callId), null, 'identical call IDs do not cross sessions');
  await rm(file);
  assert.equal(await cold.read('../session', record.callId), null, 'a missing cache is an optional projection');
  assert.deepEqual(errors, []);
});

test('nested CU errors and stops restore the native group badges without altering other tools', () => {
  const cu = { kind: 'tool-result', callId: 'cu', call: { name: 'computer_use' }, isError: false,
    content: [{ type: 'text', text: 'Execution failed: Computer Use was stopped by the user.' }] };
  const foreign = { kind: 'tool-result', callId: 'foreign', call: { name: 'other_plugin' }, isError: false, content: [] };
  const data = [{ root: { kind: 'tool-result', callId: 'parent', call: { name: 'run_code' }, isError: false, subCalls: [cu, foreign] } }];
  assert.deepEqual(computerPresentationCalls(data), ['cu']);
  assert.deepEqual(summarizeToolOutcomes(data), { failures: 0, stopped: 0 });
  assert.deepEqual(summarizeToolOutcomes(data, { cu: { computerUseError: 'Computer Use was stopped by the user.' } }), { failures: 0, stopped: 1 });
  assert.deepEqual(summarizeToolOutcomes([{ root: { ...cu, content: [{ type: 'text', text: 'A policy supplied this display text' }] } }],
    { cu: { computerUseError: 'Computer Use was stopped by the user.' } }), { failures: 0, stopped: 1 });
  assert.deepEqual(summarizeToolOutcomes([{ root: { ...cu, content: [{ type: 'text', text: 'Execution failed: actual network failure' }] } }],
    { cu: { computerUseError: 'actual network failure' } }), { failures: 1, stopped: 0 });
});

test('canceling a cache read releases the native observation while its optional write is still pending', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-presentation-cancel-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ComputerPresentationStore(directory);
  let release, disposed = false;
  const slow = new Promise(resolve => { release = resolve; });
  store.pending.set(store.path('s', 'call'), slow);
  const query = { async observeSession() { return {
    events: [{ type: 'tool/ptc-dispatch', data: { subCallId: 'call', name: 'computer_use', rootCallId: 'root', isError: false } }],
    [Symbol.dispose]() { disposed = true; },
  }; } };
  const controller = new AbortController();
  const read = readComputerPresentation(query, store, 's', 'call', controller.signal);
  await Promise.resolve();
  controller.abort(new Error('REQUEST_CANCELED'));
  try { await assert.rejects(read, /REQUEST_CANCELED/); assert.equal(disposed, true); }
  finally { release(); store.pending.clear(); }
});

test('metadata requires a settled call in the requested native observation and always releases it', async () => {
  let closed = 0;
  const meta = { computerUseFiles: [{ name: 'deliver.txt', path: '/actual/file.txt', bytes: 7 }], computerUseError: null };
  const record = { callId: 'parent:ptc:1', rootCallId: 'parent', meta };
  let cached = record;
  const store = { async read(id, call) { assert.equal(id, 'owned-session'); assert.equal(call, record.callId); return cached; } };
  const settled = { type: 'tool/ptc-dispatch', data: { subCallId: 'parent:ptc:1', rootCallId: 'parent', name: 'computer_use', isError: false } };
  let events = [settled];
  const query = { async observeSession(id, options) {
    assert.equal(id, 'owned-session'); assert.equal(options.projectionMode, 'none');
    return { events, [Symbol.dispose]() { closed++; } };
  } };
  assert.deepEqual(await readComputerPresentation(query, store, 'owned-session', 'parent:ptc:1'), meta);
  for (const invalid of [[], [{ ...settled, data: { ...settled.data, name: 'other_plugin' } }],
    [{ ...settled, data: { ...settled.data, rootCallId: 'foreign-root' } }],
    [{ ...settled, data: { ...settled.data, isError: true } }]]) {
    events = invalid;
    assert.equal(await readComputerPresentation(query, store, 'owned-session', 'parent:ptc:1'), null);
  }
  cached = null; events = [settled];
  assert.equal(await readComputerPresentation(query, store, 'owned-session', 'parent:ptc:1'), null);
  assert.equal(closed, 6);
  assert.equal(await readComputerPresentation(query, store, 'owned-session', 'bad\ncall'), null);
  assert.equal(closed, 6, 'invalid call IDs never acquire a session');
});

test('target presentation is a bounded historical snapshot, never a live handle or credential-bearing URL', async () => {
  const {computerPresentationTarget,validComputerPresentationTarget}=await import('../src/computer-use/presentation-target.mjs');
  const target=computerPresentationTarget({kind:'tab',id:'private-handle',title:'  交付\n页面  ',url:'https://name:password@example.com/report?token=secret#private'});
  assert.deepEqual(target,{kind:'tab',label:'交付 页面',origin:'https://example.com'});
  assert.equal(validComputerPresentationTarget({...target,id:'control-handle'}),false);
  assert.equal(validComputerPresentationTarget({...target,origin:'https://example.com/?token=secret'}),false);
  let observer;const entries=[];
  const own=registerComputerPresentation({on(_name,fn){observer=fn;}},{record(session,record){entries.push({session,record});}});
  const exec={name:'computer_use',parent:{},token:Symbol('owned'),callId:'call',rootCallId:'root',signal:new AbortController().signal,agent:{session:{id:'history'}}};
  own(exec.token);observer(exec,{isError:false,value:JSON.stringify({files:[],error:null,target})});
  assert.deepEqual(entries[0].record.meta,{computerUseFiles:[],computerUseError:null,computerUseTarget:target});
  own(exec.token);observer(exec,{isError:false,value:JSON.stringify({files:[],error:null,target:{...target,origin:'javascript:alert(1)'}})});
  assert.equal(entries.length,1,'invalid optional display data never becomes an authoritative stored target');
});
