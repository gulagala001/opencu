import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createBrowserPairing} from '../src/extension/pairing.mjs';
import {createExtensionBackend} from '../src/extension/backend.mjs';

const origin = 'chrome-extension://' + 'a'.repeat(32), instanceId = 'paired-browser-profile';
const credential = 'browser-generated-random-credential-0123456789';

test('manual pairing chooses only an eligible profile and cancellation clears the request', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-manual-pairing-'));
  const pairing = createBrowserPairing(root), first = 'already-connected-profile', next = 'new-browser-profile';
  t.after(async () => { pairing.close(); await rm(root, {recursive: true, force: true}); });
  await pairing.discover(origin, {instanceId: first, label: 'Google Chrome'});
  await pairing.discover(origin, {instanceId: next, label: 'Microsoft Edge'});
  await assert.rejects(pairing.request('external'), error => {
    assert.equal(error.code, 'BROWSER_CHOICE_REQUIRED');
    assert.equal(error.details.browsers.length, 2); return true;
  });
  const aborter = new AbortController();
  const requested = pairing.request('external', aborter.signal, {excludeInstanceIds: [first]});
  const rejected = assert.rejects(requested, {name: 'AbortError'});
  const old = await pairing.discover(origin, {instanceId: first, label: 'Google Chrome'});
  const approval = await pairing.discover(origin, {instanceId: next, label: 'Microsoft Edge'});
  assert.equal(old.requestId, undefined); assert.ok(approval.requestId);
  pairing.connected(first);
  aborter.abort(); await rejected;
  assert.equal((await pairing.discover(origin, {instanceId: next})).requestId, undefined);
  const retry = pairing.request('extension:' + next);
  const again = await pairing.discover(origin, {instanceId: next, label: 'Microsoft Edge'});
  assert.notEqual(again.requestId, approval.requestId);
  pairing.connected(next); assert.deepEqual(await retry, {connected: true});
});
test('one-click discovery, persistent pairing, new transport epoch, revocation and webpage rejection', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-pairing-'));
  let pairing, server, backend;
  const start = async () => {
    pairing = createBrowserPairing(root); await pairing.ready;
    server = createServer(); backend = createExtensionBackend({server, token: 'private-transport-token-' + Math.random(), dataDir: root, pairing, requestTimeoutMs: 1000});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  };
  const stop = async () => {
    pairing.close();
    // Test connections have no debugger; expire through the authenticated route before close.
    await backend.close(); await new Promise(resolve => server.close(resolve));
  };
  const post = async (route, value, token, requestOrigin = origin) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${backend.path}/${route}`, {method: 'POST',
      headers: {Origin: requestOrigin, 'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})}, body: JSON.stringify({instanceId, ...value})});
    return {status: response.status, body: await response.json()};
  };
  t.after(async () => {pairing?.close(); await backend?.close().catch(() => {}); if (server?.listening) await new Promise(resolve => server.close(resolve)); await rm(root, {recursive: true, force: true});});
  await start();
  assert.equal((await post('discover', {}, undefined, 'https://evil.example')).status, 403);
  const host = (await post('discover', {label: 'Google Chrome'})).body;
  assert.equal(host.token, undefined);
  const requested = pairing.request('Chrome');
  const demand = (await post('discover', {label: 'Google Chrome'})).body;
  assert.ok(demand.requestId);
  assert.equal((await post('connect', {protocol: 1, authorized: true, debuggerConsent: true, browserInstanceId: 'browser-instance-1', epoch: 'connection-epoch-1'}, credential)).status, 401);
  assert.equal((await post('pair', {challenge: host.challenge, token: credential, authorized: true, debuggerConsent: true, durableDownloadConsent: true})).status, 200);
  const hello = {protocol: 1, authorized: true, debuggerConsent: true, browserInstanceId: 'browser-instance-1', epoch: 'connection-epoch-1'};
  const first = (await post('connect', hello, credential)).body;
  assert.deepEqual(await requested, {connected: true});
  const persisted = await readFile(join(root, 'browser-pairings.json'), 'utf8');
  assert.ok(!persisted.includes(credential), 'host stores a digest, not the browser credential');
  await post('disconnect', {sessionId: first.sessionId, epoch: hello.epoch}, credential);
  await stop(); await start();
  assert.equal((await post('discover', {})).body.hostId, host.hostId);
  assert.equal((await pairing.list()).length, 1);
  const second = (await post('connect', {...hello, browserInstanceId: 'browser-instance-2', epoch: 'connection-epoch-2'}, credential)).body;
  assert.notEqual(second.sessionId, first.sessionId);
  assert.equal((await post('poll', {sessionId: first.sessionId, epoch: hello.epoch}, credential)).status, 409);
  assert.deepEqual((await post('poll', {sessionId: second.sessionId, epoch: 'connection-epoch-2'}, credential)).body.commands, []);
  await post('disconnect', {sessionId: second.sessionId, epoch: 'connection-epoch-2'}, credential);
  await pairing.forget(instanceId);
  assert.equal((await post('connect', hello, credential)).status, 401);
  const rejected = assert.rejects(pairing.request('Chrome'), {code: 'PAIRING_DECLINED'});
  const retry = (await post('discover', {label: 'Google Chrome'})).body;
  await post('decline', {requestId: retry.requestId});
  await rejected;
});
