import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOpenCU } from '../src/dsh/shared.mjs';

const require = createRequire(import.meta.url);
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);

test('native session disposal retires only its REPL and failed cleanup remains retryable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-computer-disposed-')), ctx = new Context();
  let lease, fiber;
  const log = console.error, failures = [];
  try {
    fiber = ctx.plugin({ name: 'computer-disposal-fixture', apply(scope) {
      lease = acquireOpenCU(scope, { config: { dataDir: directory, browserEnabled: false, nativeEnabled: false, extensionEnabled: false } });
    } });
    await fiber;
    const entry = globalThis[Symbol.for('opencu.shared-root.v1')].get(ctx.root);
    const run = (sessionKey, code) => lease.request('computer_use', { code }, { sessionKey });
    const forgotten = [], forgetSession = entry.runtime.forgetSession;
    entry.runtime.forgetSession = id => { forgotten.push(id); return forgetSession(id); };
    await ctx.parallel('session/disposed', { id: 'without-repl' });
    assert.deepEqual(forgotten, ['without-repl']);
    assert.equal(entry.computers.size, 0);
    await run('retired', 'var buffer = new Uint8Array(1024); buffer.byteLength');
    await run('retained', 'var value = 42; value');
    let stops = 0; const request = entry.runtime.request;
    entry.runtime.request = (...args) => { if (args[0] === 'stop') stops++; return request(...args); };
    await ctx.parallel('session/disposed', { id: 'retired' });
    assert.equal(stops, 0); assert.equal(entry.computers.has('retired'), false);
    assert.deepEqual(forgotten, ['without-repl', 'retired']);
    assert.deepEqual((await run('retained', 'value')).outputs, ['42']);
    const computer = entry.computers.get('retained'), close = computer.close.bind(computer);
    computer.close = async () => { throw Error('isolated lifecycle failure'); };
    console.error = (...args) => failures.push(args);
    await ctx.parallel('session/disposed', { id: 'retained' });
    assert.equal(failures.length, 1); assert.equal(entry.computers.get('retained'), computer);
    computer.close = close;
    await ctx.parallel('session/disposed', { id: 'retained' });
    assert.equal(entry.computers.size, 0);
    await lease.release(); lease = undefined; await fiber.dispose();
  } finally { console.error = log; await lease?.release(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test('session disposal removes runtime application grants without requiring a REPL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-approval-disposed-')), ctx = new Context();
  const target = { id: 'native:isolated', backend: 'native', kind: 'window', name: 'Fixture',
    identity: { bundleId: 'test.isolated', executable: '/isolated/Fixture.app', pid: 42, processStart: 'fixture', windowId: 1 } };
  let lease, metadataReads = 0;
  const native = {
    async listTargets() { return [target]; }, async select() { return target; },
    async verify() { return { valid: true, target }; },
    async applicationMetadata() { metadataReads++; return { displayName: 'Fixture', iconDataURL: null }; },
    async observe() { return { observationId: 'fixture', ax: { nodes: [] } }; },
    async act() { throw Error('No input expected in this lifecycle fixture'); },
    async release() { return { released: true }; }, async close() {},
  };
  try {
    await ctx.plugin({ name: 'approval-disposal-fixture', apply(scope) {
      lease = acquireOpenCU(scope, { config: { dataDir: directory, browserEnabled: false, extensionEnabled: false, native } });
    } });
    const pending = async session => (await lease.request('appApprovals/pending', { conversationId: session })).requests;
    const authorize = async (session, action = 'accept') => {
      const work = lease.request('select', { reference: { id: target.id } }, { sessionKey: session })
        .then(value => ({ value }), error => ({ error }));
      let timer, done = false;
      try {
        const request = await Promise.race([new Promise((resolve, reject) => {
          const check = async () => { if (done) return; try { const rows = await pending(session); rows.length ? resolve(rows[0]) : setImmediate(check); } catch (error) { reject(error); } };
          void check();
        }), work.then(({ value, error }) => { throw error ?? Error('Selection ended without approval: ' + JSON.stringify(value)); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Approval did not become pending')), 1000); })]);
        await lease.request('appApprovals/respond', { conversationId: session, requestId: request.id, action, ...(action === 'accept' ? { persist: 'session' } : {}) });
        return await work;
      } finally { done = true; clearTimeout(timer); }
    };
    for (const session of ['without-repl', 'with-repl']) {
      assert.equal((await authorize(session)).value.ok, true);
      if (session === 'with-repl') await lease.request('computer_use', { code: 'var retained = 42; retained' }, { sessionKey: session });
    }
    assert.equal(metadataReads, 2);
    await ctx.parallel('session/disposed', { id: 'without-repl' });
    assert.equal((await lease.request('observe', { format: 'ax' }, { sessionKey: 'with-repl' })).ok, true);
    assert.equal(metadataReads, 2);
    assert.equal((await authorize('without-repl', 'decline')).error.code, 'APP_ACCESS_DENIED');
    await ctx.parallel('session/disposed', { id: 'with-repl' });
    assert.equal((await authorize('with-repl', 'decline')).error.code, 'APP_ACCESS_DENIED');
    assert.equal(metadataReads, 4);
  } finally { await lease?.release(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }); }
});
