import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExtensionBackend } from '../src/extension/backend.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-extension-close-'));
  const server = createServer(), token = 'isolated-extension-close-token-012345';
  const backend = createExtensionBackend({ server, token, dataDir, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + backend.path;
  const post = async (route, value) => {
    const response = await fetch(base + '/' + route, { method: 'POST', headers: {
      Origin: 'chrome-extension://' + 'a'.repeat(32), Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    }, body: JSON.stringify(value) });
    return { status: response.status, body: await response.json() };
  };
  const hello = { protocol: 1, authorized: true, debuggerConsent: true,
    instanceId: 'isolated-close-profile', browserInstanceId: 'isolated-close-browser', epoch: 'isolated-close-epoch' };
  const connected = await post('connect', hello);
  assert.equal(connected.status, 200);
  const session = { sessionId: connected.body.sessionId, epoch: hello.epoch };
  t.after(async () => {
    for (const connection of backend.connections()) {
      await post('disconnect', { sessionId: connection.sessionId || session.sessionId, epoch: connection.epoch, events: [] });
    }
    await backend.close();
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });
  return { backend, hello, session, post, server, base, token };
}

test('close rejects new connections and controls while allowing the original release acknowledgment', async t => {
  const f = await fixture(t);
  const closing = f.backend.close();
  const polled = await f.post('poll', { ...f.session, events: [] });
  const command = polled.body.commands.find(item => item.method === 'release');
  assert.ok(command);
  try {
    const connected = await f.post('connect', { ...f.hello, instanceId: 'isolated-late-profile', epoch: 'isolated-late-epoch' });
    if (connected.status === 200) await f.post('disconnect', { sessionId: connected.body.sessionId, epoch: 'isolated-late-epoch', events: [] });
    assert.equal(connected.body.error?.code, 'CLOSING', 'An in-progress close must reject new sessions');
    await assert.rejects(f.backend.openSettings(f.hello.instanceId, 'connection'), { code: 'CLOSING' });
    const repeated = f.backend.close();
    assert.equal(repeated, closing, 'Concurrent close calls share a single release');
    const again = await f.post('poll', { ...f.session, events: [] });
    assert.deepEqual(again.body.commands, []);
  } finally {
    await f.post('result', { ...f.session, id: command.id, ok: true, result: { released: true } });
    await closing;
  }
  assert.equal(f.backend.connections().length, 0);
  assert.equal(f.backend.getDiagnostics().pendingCommands, 0);
});

test('a negative release acknowledgment keeps shutdown retryable and blocks new control', async t => {
  const f = await fixture(t);
  const closing = f.backend.close();
  const rejected = assert.rejects(closing, { code: 'RELEASE_FAILED' });
  const first = await f.post('poll', { ...f.session, events: [] });
  await f.post('result', { ...f.session, id: first.body.commands[0].id, ok: true,
    result: { released: false, failures: [{ message: 'Isolated key release failure' }] } });
  await rejected;
  assert.equal(f.backend.connections().length, 1);
  await assert.rejects(f.backend.openSettings(f.hello.instanceId, 'connection'), { code: 'CLOSING' });
  const retry = f.backend.close();
  const next = await f.post('poll', { ...f.session, events: [] });
  assert.equal(next.body.commands.length, 1);
  await f.post('result', { ...f.session, id: next.body.commands[0].id, ok: true, result: { released: true } });
  await retry;
  assert.equal(f.backend.connections().length, 0);
});

test('close cancels queued control and rejects a connection whose body completes during shutdown', async t => {
  const f = await fixture(t), received = Promise.withResolvers();
  f.server.once('request', () => received.resolve());
  const content = JSON.stringify({ ...f.hello, instanceId: 'isolated-late-profile', epoch: 'isolated-late-epoch' });
  let incoming;
  const response = new Promise((resolve, reject) => {
    incoming = request(f.base + '/connect', { method: 'POST', headers: {
      Origin: 'chrome-extension://' + 'a'.repeat(32), Authorization: 'Bearer ' + f.token,
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(content),
    } }, result => {
      const chunks = [];
      result.on('data', chunk => chunks.push(chunk));
      result.on('end', () => resolve(JSON.parse(Buffer.concat(chunks))));
      result.on('error', reject);
    });
    incoming.on('error', reject);
    incoming.write(content.slice(0, 10));
  });
  await received.promise;
  const control = f.backend.openSettings(f.hello.instanceId, 'connection');
  const cancelled = assert.rejects(control, { code: 'CLOSING' });
  const closing = f.backend.close();
  incoming.end(content.slice(10));
  const late = await response;
  const polled = await f.post('poll', { ...f.session, events: [] });
  try {
    assert.equal(late.error?.code, 'CLOSING');
    await cancelled;
    assert.deepEqual(polled.body.commands.map(command => command.method), ['release']);
  } finally {
    await f.post('result', { ...f.session, id: polled.body.commands[0].id, ok: true, result: { released: true } });
    await closing;
  }
  assert.equal(f.backend.connections().length, 0);
  assert.equal(f.backend.getDiagnostics().pendingCommands, 0);
});

test('a real release timeout preserves the original shutdown retry channel', async t => {
  const f = await fixture(t);
  const closing = f.backend.close();
  const rejected = assert.rejects(closing, { code: 'RELEASE_FAILED' });
  const first = await f.post('poll', { ...f.session, events: [] });
  assert.equal(first.body.commands[0].method, 'release');
  await rejected;
  assert.equal(f.backend.connections().length, 1, 'A timeout is not evidence that the original browser released input');
  assert.equal(f.backend.getDiagnostics().pendingCommands, 0);
  const late = await f.post('result', { ...f.session, id: first.body.commands[0].id, ok: true, result: { released: true } });
  assert.equal(late.body.ignored, true, 'An expired request cannot acknowledge a later retry');
  const retry = f.backend.close();
  const next = await f.post('poll', { ...f.session, events: [] });
  assert.equal(next.body.commands.length, 1);
  assert.notEqual(next.body.commands[0].id, first.body.commands[0].id);
  await f.post('result', { ...f.session, id: next.body.commands[0].id, ok: true, result: { released: true } });
  await retry;
  assert.equal(f.backend.connections().length, 0);
});

test('release timeout blocks queued and new control until a full release succeeds', async t => {
  const f = await fixture(t, { requestTimeoutMs: 250 });
  const release = f.backend.release();
  const control = f.backend.openSettings(f.hello.instanceId, 'connection');
  const rejected = assert.rejects(control, { code: 'RELEASE_FAILED' });
  const result = await release;
  await rejected;
  assert.equal(result.released, false);
  assert.equal(result.failures[0].details.method, 'release');
  assert.equal(f.backend.connections().length, 1);
  await assert.rejects(f.backend.openSettings(f.hello.instanceId, 'connection'), { code: 'RELEASE_FAILED' });
  assert.deepEqual((await f.post('poll', { ...f.session, events: [] })).body.commands, []);
  const retry = f.backend.release();
  const polled = await f.post('poll', { ...f.session, events: [] });
  assert.deepEqual(polled.body.commands.map(command => command.method), ['release']);
  await f.post('result', { ...f.session, id: polled.body.commands[0].id, ok: true, result: { released: true } });
  assert.equal((await retry).released, true);
  const resumed = f.backend.openSettings(f.hello.instanceId, 'connection');
  const next = await f.post('poll', { ...f.session, events: [] });
  assert.equal(next.body.commands[0].method, 'openSettings');
  await f.post('result', { ...f.session, id: next.body.commands[0].id, ok: true, result: { opened: true } });
  assert.deepEqual(await resumed, { opened: true });
});

test('ordinary command timeout still expires the connection without replaying control', async t => {
  const f = await fixture(t, { requestTimeoutMs: 100 });
  await assert.rejects(f.backend.openSettings(f.hello.instanceId, 'connection'), { code: 'COMMAND_TIMEOUT' });
  assert.equal(f.backend.connections().length, 0);
  assert.equal(f.backend.getDiagnostics().pendingCommands, 0);
  assert.equal((await f.post('poll', { ...f.session, events: [] })).body.error.code, 'STALE_CONNECTION');
});

test('an unconfirmed aggregate release remains failed and blocks control until retried', async t => {
  const f = await fixture(t);
  const releasing = f.backend.release();
  const first = await f.post('poll', { ...f.session, events: [] });
  await f.post('result', { ...f.session, id: first.body.commands[0].id, ok: true,
    result: { released: false, failures: [{ message: 'Isolated keyUp failure' }] } });
  const failed = await releasing;
  assert.equal(failed.released, false, 'A negative release result must reach the public aggregate');
  assert.equal(failed.failures[0].details.failures[0].message, 'Isolated keyUp failure');
  await assert.rejects(f.backend.openSettings(f.hello.instanceId, 'connection'), { code: 'RELEASE_FAILED' });
  const retry = f.backend.release();
  const next = await f.post('poll', { ...f.session, events: [] });
  await f.post('result', { ...f.session, id: next.body.commands[0].id, ok: true, result: { released: true } });
  assert.equal((await retry).released, true);
  assert.equal(f.backend.connections().length, 1);
});
