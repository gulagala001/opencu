import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createComputerSession} from '../src/dsh/computer.mjs';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';
import {modelResult} from '../src/dsh/model-output.mjs';

test('worker progress transfers each displayed string once and resets between cells', async t => {
  const messages = [], emit = Worker.prototype.emit;
  Worker.prototype.emit = function(event, ...args) {
    if (event === 'message' && args[0].type === 'progress') messages.push(args[0]);
    return emit.call(this, event, ...args);
  };
  const computer = createComputerSession(() => { throw Error('Unexpected backend call'); });
  t.after(async () => { Worker.prototype.emit = emit; await computer.close(); });
  await computer.run({code:''});
  for (let cell = 0; cell < 2; cell++) {
    messages.length = 0;
    const expected = Array.from({length: 24}, (_, i) => `${cell}:${i}:${'正文🙂'.repeat(256)}`);
    const result = await computer.run({code: `${expected.map(value => `nodeRepl.write(${JSON.stringify(value)});`).join('\n')}
      await nodeRepl.emitImage({attachmentId:'image:retained', width:10, height:20});`});
    assert.deepEqual(result.outputs, expected);
    assert.deepEqual(messages.flatMap(message => message.partial.outputs), expected);
    assert.deepEqual(result.images, [{attachmentId:'image:retained', width:10, height:20}]);
    assert.deepEqual(messages.at(-1).partial.images, result.images);
  }
});

test('cancelled worker retains all earlier text and attachments once, then starts a fresh cell', async t => {
  const entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'targets') { entered.resolve(); return new Promise((resolve, reject) => { computer.signal.addEventListener('abort', () => reject(computer.signal.reason), {once:true}); gate.promise.then(resolve, reject); }); }
    if (endpoint === 'interrupt') { gate.resolve({ok:true, targets:[]}); return {ok:true, released:true}; }
    throw Error(endpoint);
  });
  t.after(() => computer.close());
  await computer.run({code:''});
  const aborter = new AbortController();
  const pending = computer.run({code: `nodeRepl.write('first'); nodeRepl.write('second');
    await nodeRepl.emitImage({attachmentId:'image:partial'}); await cua.listTabs();`}, aborter.signal).catch(error => error);
  await entered.promise;
  aborter.abort(new Error('Synthetic cancellation'));
  const error = await pending;
  assert.match(error.message, /Synthetic cancellation/);
  assert.deepEqual(error.details.partialResult.outputs, ['first', 'second']);
  assert.deepEqual(error.details.partialResult.images, [{attachmentId:'image:partial'}]);
  const next = await computer.run({code: `nodeRepl.write('fresh');`});
  assert.equal(next.outputs.at(-1), 'fresh');
  assert.equal(next.outputs.includes('first'), false);
  assert.deepEqual(next.images, []);
});

test('model transport preserves raw AX details and full UI history while omitting redundant text', async t => {
  const parent = resolve('.local'); await mkdir(parent, {recursive:true});
  const dataDir = await mkdtemp(join(parent, 'output-transfer-'));
  const target = {id:'tab:output', kind:'tab', backend:'browser', identity:{occurrence:'one'}, title:'Synthetic'};
  const ax = {nodes:[{elementId:1, nodeId:'1', role:'textbox', name:'姓名', value:'中文🙂', properties:{focused:true}, children:[]}],
    source:'chromium-accessibility-tree', stableIds:true, identityScope:'one'};
  const runtime = createPluginRuntime({dataDir, nativeEnabled:false, extensionEnabled:false, browser:{
    listTargets:async () => [target], select:async () => target,
    verify:async () => ({valid:true, target}),
    observe:async () => ({observationId:'ax:one', ax, text:'[1] textbox 姓名', coordinateSpace:'viewport-css-pixels'}),
    act:async () => ({}), release:async () => ({released:true}), close:async () => {},
  }});
  t.after(async () => { await runtime.close(); await rm(dataDir, {recursive:true, force:true}); });
  await runtime.request('select', {reference:target.id});
  const full = await runtime.request('observe', {targetId:target.id, format:'ax'});
  const projected = await runtime.request('observe', {targetId:target.id, format:'ax'}, {modelProjection:true});
  assert.deepEqual(projected.observation.ax, ax);
  assert.equal(projected.observation.text, undefined);
  assert.deepEqual(projected, modelResult(full, {format:'ax', details:true}));
  const history = await runtime.request('state');
  assert.deepEqual(history.state.lastObservation.observation.ax, ax);
  assert.equal(history.state.lastObservation.observation.text, '[1] textbox 姓名');
  const selected = await runtime.request('select', {reference:target.id}, {modelProjection:true});
  assert.equal(selected.state.lastObservation.observation, undefined);
  assert.deepEqual(selected.target.identity, target.identity);
  assert.equal((await runtime.request('state', {includeHistory:true}, {modelProjection:true})).state.lastObservation.observation.text, '[1] textbox 姓名');
});
