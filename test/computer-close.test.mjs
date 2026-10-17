import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputerSession } from '../src/dsh/computer.mjs';

test('closing an idle REPL frees its service references without stopping other sessions', async () => {
  let stops = 0;
  const computer = createComputerSession(async endpoint => { if (endpoint === 'stop') stops++; return { ok: true }; });
  await computer.run({ code: 'var value = new Uint8Array(1024); value.byteLength' });
  computer.attachments = { isolated: true };
  await computer.close(); await computer.close();
  assert.equal(stops, 0); assert.equal(computer.attachments, undefined);
  await assert.rejects(computer.run({ code: 'value.byteLength' }), /disposed/);
});

for (const code of ['RELEASE_FAILED', 'STOP_UNAVAILABLE']) test('closing cancels active and queued cells and retries ' + code, async () => {
  const entered = Promise.withResolvers(), stopped = Promise.withResolvers();
  let failRelease = true, stops = 0;
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'targets') { entered.resolve(); await stopped.promise; return { ok: true, targets: [] }; }
    if (endpoint === 'stop') { stops++; stopped.resolve(); if (failRelease) return { ok: false, error: { code, message: 'isolated release failure' } }; return { ok: true }; }
    throw Error(endpoint);
  });
  const active = computer.run({ code: 'await cua.getApp("isolated")' });
  const activeRejected = assert.rejects(active, /disposed/); await entered.promise;
  const queued = computer.run({ code: 'throw Error("queued cell executed")' });
  const queuedRejected = assert.rejects(queued, /disposed/);
  await assert.rejects(computer.close(), { code });
  await Promise.all([activeRejected, queuedRejected]);
  failRelease = false; await computer.close(); assert.equal(stops, 2);
});

test('idle explicit held input is released before a REPL is retired', async () => {
  const target = { id: 'tab', backend: 'browser', verified: true }; let stops = 0;
  const computer = createComputerSession(async endpoint => {
    if (endpoint === 'select') return { ok: true, target };
    if (endpoint === 'observe') return { ok: true, observation: { ax: 'isolated' } };
    if (endpoint === 'stop') { stops++; return { ok: true }; }
    if (endpoint === 'act') return { ok: true };
    throw Error(endpoint);
  });
  await computer.run({ code: 'var tab = await cua.getTab("tab"); await tab.keyDown("Shift")' });
  await computer.close(); assert.equal(stops, 1);
});
