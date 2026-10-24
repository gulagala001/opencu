import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameInputMonitoring } from '../src/client/frame-input-monitor.mjs';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const ready = events => ({ available: true, scope: 'all-frames', frameCount: 4, events });

test('selected monitoring is single flight and disposal waits for old work without another poll', async () => {
  const calls = [], gate = deferred(), activity = [], status = [];
  let running = 0, maximum = 0;
  const monitor = createFrameInputMonitoring({ interval: 10, userActivity: kind => activity.push(kind), changed: patch => status.push(patch),
    invoke: async args => { calls.push(args); maximum = Math.max(maximum, ++running); try { return args.method === 'install' ? await gate.promise : ready([]); } finally { running--; } } });
  await pause(15); assert.equal(calls.length, 0, 'unselected guests must not poll');
  monitor.setEnabled(true); const first = monitor.ensure(), second = monitor.ensure();
  await pause(5); assert.equal(calls.length, 1);
  const disposing = monitor.dispose(); gate.resolve(ready([{ kind: 'input' }]));
  await assert.rejects(first, /disposed/); await assert.rejects(second, /disposed/); await disposing; await pause(25);
  assert.equal(maximum, 1); assert.deepEqual(calls.map(call => call.method), ['install', 'dispose']);
  assert.deepEqual(activity, [], 'a late old document event cannot be delivered after disposal');
});

test('navigation retires the old epoch, installs again and cannot deliver its old events', async () => {
  const gate = deferred(), calls = [], activity = [];
  const monitor = createFrameInputMonitoring({ interval: 1000, userActivity: kind => activity.push(kind), changed() {},
    invoke: async args => { calls.push(args); return args.method === 'install' && args.epoch === 1 ? gate.promise : ready([{kind:'wheel'}]); } });
  monitor.setEnabled(true); await pause(0); monitor.invalidate();
  gate.resolve(ready([{kind:'input'}])); await monitor.ensure();
  assert.deepEqual(calls.map(call => [call.method, call.epoch]), [['install',1],['dispose',1],['install',2]]);
  assert.deepEqual(activity, ['wheel']);
  monitor.setEnabled(false); await pause(0); const count = calls.length; await pause(15); assert.equal(calls.length, count);
  await monitor.dispose();
});

test('installation and read failures remain visible, reject input readiness and allow a fresh retry', async () => {
  const status = []; let failInstall = true, failRead = false;
  const monitor = createFrameInputMonitoring({ interval: 1000, changed: value => status.push(value.userActivityMonitoring), userActivity() {},
    invoke: async args => {
      if (args.method === 'dispose') return { disposed: true };
      if (args.method === 'install' && failInstall || args.method === 'read' && failRead) throw Error('native frame unavailable');
      return ready([]);
    } });
  await assert.rejects(monitor.ensure(), /native frame unavailable/); assert.equal(status.at(-1).available, false); assert.match(status.at(-1).error, /unavailable/);
  failInstall = false; await monitor.ensure(); assert.equal(status.at(-1).available, true);
  failRead = true; await assert.rejects(monitor.ensure(), /native frame unavailable/); assert.equal(status.at(-1).available, false);
  failRead = false; await monitor.ensure(); assert.equal(status.at(-1).available, true); await monitor.dispose();
});

test('failed OOPIF preparation still resumes the native target and surfaces its failure', async () => {
  const { createCDPFrameRouter } = await import('../extension/frame-router.js');
  let listener; const calls = [];
  const send = async (method, args = {}) => {
    calls.push(['root', method, args]);
    if (method === 'Target.setAutoAttach' && args.autoAttach) listener('Target.attachedToTarget', {sessionId:'child-session',targetInfo:{targetId:'child',type:'iframe'}});
    if (method === 'Page.getFrameTree') return {frameTree:{frame:{id:'root'}}};
    if (method === 'Page.createIsolatedWorld') {
      if (args.frameId === 'child') throw Error('No frame with given id');
      return {executionContextId:1};
    }
    if (method === 'Runtime.evaluate') return {result:{value:'root-document'}};
    if (method === 'DOM.describeNode') return {node:{frameId:'child'}};
    return {};
  };
  const router = createCDPFrameRouter(send, next => { listener = next; return () => {}; }, {
    sendSession: async (id, method, args) => { calls.push([id, method, args]); return {}; },
    prepareSession: async () => { throw Error('monitor-install-failed'); },
  });
  const root = await router.main();
  await assert.rejects(router.child(root, 9, 'child'), /monitor-install-failed/);
  assert.equal(calls.find(([,method]) => method === 'Target.setAutoAttach')[2].waitForDebuggerOnStart, true);
  assert(calls.some(([id,method]) => id === 'child-session' && method === 'Runtime.runIfWaitingForDebugger'));
  await router.close();
});

test('fresh documents report the first trusted edit and dispose removes every listener', async () => {
  const { createPageInputMonitor } = await import('../extension/input-monitor.js');
  const { runInNewContext } = await import('node:vm');
  const listeners = new Map(), events = [], target = {nodeType:1,tagName:'INPUT'};
  const context = { document:{activeElement:target}, performance:{now:()=>10}, crypto, setTimeout, clearTimeout,
    window:{addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)}, enqueue:event=>events.push(event) };
  const monitor = runInNewContext(`(${createPageInputMonitor.toString()})(enqueue)`, context);
  listeners.get('input')({type:'input',isTrusted:true,target}); assert.equal(events.length, 1);
  monitor.dispose(); assert.equal(listeners.size, 0);
});
