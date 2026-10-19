import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputerSession } from '../src/dsh/computer.mjs';

const busy = 'var end=Date.now()+500; while(Date.now()<end){}; "finished"';

test('synchronous evaluation obeys the Host deadline, releases held inputs and resets bindings', async t => {
  let stops = 0, heartbeat;
  const target = { id: 'tab', backend: 'browser', verified: true };
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'stop') stops++;
    return { ok: true, target, observation: { ax: 'isolated' } };
  });
  t.after(() => computer.close());
  await computer.run({ code: 'const preserved = 42; var tab=await cua.getTab("tab"); await tab.keyDown("Control")' });
  assert.deepEqual((await computer.run({ code: 'preserved' })).outputs, ['42']);
  const started = performance.now();
  const timer = setTimeout(() => { heartbeat = performance.now() - started; }, 5);
  t.after(() => clearTimeout(timer));
  await assert.rejects(computer.run({ code: 'nodeRepl.write("before-loop"); ' + busy, timeoutMs: 40 }), error => {
    assert.equal(error.code, 'COMPUTER_TIMEOUT');
    assert.deepEqual(error.details.partialResult.outputs, ['before-loop']);
    return true;
  });
  assert.ok(heartbeat < 300, `Host heartbeat was blocked for ${heartbeat}ms`);
  assert.ok(performance.now() - started < 400, 'evaluation ran through the busy loop');
  assert.equal(stops, 1);
  assert.equal((await computer.run({ code: 'typeof preserved + ":" + typeof tab' })).outputs.at(-1), 'undefined:undefined');
});

for (const action of ['cancel', 'reset', 'close']) test(`${action} interrupts synchronous JavaScript from the Host`, async t => {
  let stops = 0;
  const computer = createComputerSession(async () => { stops++; return { ok: true }; });
  t.after(() => computer.close());
  await computer.run({ code: 'const binding = 1' });
  const controller = new AbortController();
  let cleanup;
  const started = performance.now();
  const timer = setTimeout(() => {
    if (action === 'cancel') controller.abort(new Error('cancel busy cell'));
    else cleanup = computer[action]();
  }, 20);
  t.after(() => clearTimeout(timer));
  await assert.rejects(computer.run({ code: busy, timeoutMs: 2000 }, controller.signal), action === 'cancel' ? /cancel busy cell/ : action === 'reset' ? /session reset/ : /disposed/);
  await cleanup;
  assert.ok(performance.now() - started < 400, 'interruption waited for synchronous JavaScript');
  assert.equal(stops, 1);
  if (action !== 'close') assert.equal((await computer.run({ code: 'typeof binding' })).outputs.at(-1), 'undefined');
});

test('reset rejects cells queued before the reset and leaves fresh bindings', async t => {
  const entered = Promise.withResolvers(), stopped = Promise.withResolvers();
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'targets') { entered.resolve(); await stopped.promise; }
    if (endpoint === 'stop') stopped.resolve();
    return { ok: true, targets: [] };
  });
  t.after(() => computer.close());
  const active = assert.rejects(computer.run({ code: 'await cua.listApps()' }), /session reset/);
  await entered.promise;
  const queued = assert.rejects(computer.run({ code: 'var staleBinding = 42' }), /session reset/);
  await computer.reset(); await Promise.all([active, queued]);
  assert.equal((await computer.run({ code: 'typeof staleBinding' })).outputs.at(-1), 'undefined');
});

test('an admitted request still drains after its cell fails and a new cell starts', async t => {
  const entered = Promise.withResolvers(), returned = Promise.withResolvers();
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'targets') { entered.resolve(); await returned.promise; }
    return { ok: true, targets: [] };
  });
  t.after(() => computer.close());
  const failed = assert.rejects(computer.run({ code: 'var pending = cua.listApps().catch(()=>{}); throw Error("cell failed")' }), /cell failed/);
  await entered.promise; await failed;
  const next = computer.run({ code: '42', timeoutMs: 2000 });
  const timer = setTimeout(() => returned.resolve(), 20);
  t.after(() => clearTimeout(timer));
  assert.equal((await next).outputs.at(-1), '42');
});

test('late observations from a failed cell cannot replace the next cell observation', async t => {
  const entered = Promise.withResolvers(), returned = Promise.withResolvers();
  const target = { id: 'tab', backend: 'browser', verified: true };
  let observations = 0, click;
  const computer = createComputerSession(async (endpoint, args) => {
    if (endpoint === 'select') return { ok: true, target };
    if (endpoint === 'observe') {
      const id = 'o' + ++observations;
      if (id === 'o2') { entered.resolve(); await returned.promise; }
      return { ok: true, observation: { id, ax: id } };
    }
    if (endpoint === 'act') click = args;
    return { ok: true };
  });
  t.after(() => computer.close());
  await computer.run({ code: 'var tab = await cua.getTab("tab")' });
  const failed = assert.rejects(computer.run({ code: 'var oldRequest=tab.getAXState().catch(e=>e.message); throw Error("failed cell")' }), /failed cell/);
  await entered.promise; await failed;
  const next = computer.run({ code: 'await oldRequest; await tab.click(1)' });
  returned.resolve(); await next;
  assert.equal(click.observationId, 'o1');
});

test('failed timeout release remains retryable when closing the session', async () => {
  let stops = 0;
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'stop' && ++stops === 1) return { ok: false, error: { code: 'STOP_UNAVAILABLE', message: 'release unavailable' } };
    return { ok: true };
  });
  await computer.run({ code: '0' });
  await assert.rejects(computer.run({ code: busy, timeoutMs: 20 }), { code: 'STOP_UNAVAILABLE' });
  await computer.close(); assert.equal(stops, 2);
});

for (const lateFailure of [false, true]) test(`old cell ${lateFailure ? 'request failures' : 'unhandled continuations'} cannot fail the next evaluation`, async t => {
  const entered = Promise.withResolvers(), returned = Promise.withResolvers();
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'targets') { entered.resolve(); await returned.promise; }
    return { ok: true, targets: [] };
  });
  t.after(() => computer.close());
  await computer.run({ code: '0' });
  const code = lateFailure ? 'var oldRequest=cua.listApps().catch(e=>e.message); throw Error("failed cell")'
    : 'cua.listApps(); throw Error("failed cell")';
  const failed = assert.rejects(computer.run({ code }), /failed cell/);
  await entered.promise; await failed;
  const next = computer.run({ code: 'await new Promise(r=>setTimeout(r,60)); 2', timeoutMs: 2000 });
  const timer = setTimeout(() => lateFailure ? returned.reject(Object.assign(Error('old failure'), { code: 'OLD_FAILURE' })) : returned.resolve(), 20);
  t.after(() => clearTimeout(timer));
  assert.deepEqual((await next).outputs, ['2']);
});
