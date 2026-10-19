import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExtensionBackend } from '../src/extension/backend.mjs';
import { createCompositeBrowserBackend } from '../src/integration/browser.mjs';
import { createController } from '../src/core/controller.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-retirement-'));
  const backend = createExtensionBackend({ dataDir, token: 'isolated-retirement-token-0123456789', requestTimeoutMs: 1000, ...options });
  const server = createServer((req, res) => backend.handleRequest(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = async (route, body, {origin = 'chrome-extension://' + 'a'.repeat(32), token = 'isolated-retirement-token-0123456789'} = {}) => {
    const response = await fetch('http://127.0.0.1:' + server.address().port + backend.path + '/' + route, { method: 'POST', headers: {
      Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
    }, body: JSON.stringify(body) });
    return response.json();
  };
  let session, stopped = false, commands = [];
  const pump = (async () => {
    while (!stopped) {
      const current = session;
      if (current) for (const command of (await post('poll', { ...current, events: [] })).commands ?? []) {
        commands.push(command.method);
        const result = command.method === 'listTargets' ? [{ tabId: 7, documentId: 'fixture-document', title: 'Fixture', url: 'https://fixture.invalid/', supported: true }]
          : command.method === 'verify' ? { verified: true } : command.method === 'select' ? { selected: true } : { released: true };
        await post('result', { ...current, id: command.id, ok: true, result });
      }
      await new Promise(resolve => setTimeout(resolve, 2));
    }
  })();
  t.after(async () => { await backend.close(); stopped = true; await pump; await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });
  return { backend, dataDir, commands, post, get session() { return session; }, async connect(epoch, releaseReceipts = []) {
    const hello = { protocol: 1, authorized: true, debuggerConsent: true, instanceId: 'fixture-profile', browserInstanceId: 'fixture-browser', epoch, releaseReceipts };
    const response = await post('connect', hello);
    session = { sessionId: response.sessionId, epoch };
    return response;
  } };
}

for (const initiatedBy of ['host', 'extension']) test('confirmed ' + initiatedBy + ' disconnect retires only its epoch through controller persistence', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  await f.connect('fixture-old-epoch');
  const controller = await createController({ dataDir: f.dataDir, browser: createCompositeBrowserBackend({ extension: f.backend }) });
  const old = (await controller.listTargets()).targets[0];
  assert.equal((await controller.selectTarget(old)).ok, true);
  if (initiatedBy === 'host') await f.backend.disconnect('fixture-profile');
  else await f.post('disconnect', { ...f.session, events: [], released: true });
  await f.connect('fixture-new-epoch');
  const next = (await controller.listTargets()).targets[0];
  assert.equal((await controller.selectTarget(next)).ok, true);
  const savedBeforeStop = await readFile(join(f.dataDir, 'controller.json'), 'utf8');
  assert.equal((await controller.stop()).ok, true);
  assert.deepEqual((await controller.getState()).state.targets.map(target => target.id), [next.id]);
  assert.equal((await controller.resume({ targetId: next.id })).ok, true);
  assert.equal((await controller.close()).ok, true);
  assert.ok(f.commands.every(method => ['listTargets', 'verify', 'select', 'release', 'disconnect'].includes(method)), 'fixture never sends input');
  // Restore a pre-Stop snapshot to exercise receipt recovery after an interrupted controller commit.
  await writeFile(join(f.dataDir, 'controller.json'), savedBeforeStop);
  const restored = createExtensionBackend({ dataDir: f.dataDir, token: 'isolated-retirement-token-0123456789' });
  assert.deepEqual(await restored.release(old), { released: true, retired: true });
  assert.deepEqual(await restored.release(next), { released: true, retired: true }, 'graceful backend close also retires its confirmed connection');
  await assert.rejects(restored.release({ id: next.id.replace('fixture-new-epoch', 'fixture-unknown-epoch') }), { code: 'STALE_TARGET' });
  await restored.close();
});

test('unconfirmed disconnect keeps the old release obligation blocking control', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  await f.connect('fixture-old-epoch');
  const controller = await createController({ dataDir: f.dataDir, browser: createCompositeBrowserBackend({ extension: f.backend }) });
  const old = (await controller.listTargets()).targets[0];
  await controller.selectTarget(old);
  await f.post('disconnect', { ...f.session, events: [] });
  await f.connect('fixture-new-epoch');
  await controller.selectTarget((await controller.listTargets()).targets[0]);
  assert.equal((await controller.stop()).error.code, 'RELEASE_FAILED');
  assert.equal((await controller.getState()).state.releasePending, true);
  assert.equal((await controller.close()).error.code, 'RELEASE_FAILED');
});

test('ticketed release receipts bind the original origin, credential, installation and epoch', {timeout: 5000}, async t => {
  const alternate = 'another-isolated-credential-0123456789';
  const f = await fixture(t, {pairing: {ready: Promise.resolve(), connected() {},
    authenticate(origin, instanceId, token) { return instanceId && ['isolated-retirement-token-0123456789', alternate].includes(token) ? {instanceId, origin} : null; }}});
  const first = await f.connect('fixture-receipt-old');
  assert.equal(typeof first.releaseTicket, 'string');
  const old = (await f.backend.listTargets())[0];
  await f.post('disconnect', {...f.session, events: []});
  const receipt = {instanceId: 'fixture-profile', browserInstanceId: 'fixture-browser', epoch: 'fixture-receipt-old', ticket: first.releaseTicket};
  const hello = {protocol: 1, authorized: true, debuggerConsent: true, instanceId: receipt.instanceId, browserInstanceId: receipt.browserInstanceId, epoch: 'fixture-receipt-new', releaseReceipts: [receipt]};
  for (const [body, options] of [
    [{...hello, releaseReceipts: [{...receipt, ticket: 'incorrect-ticket'}]}, {}],
    [hello, {origin: 'chrome-extension://' + 'b'.repeat(32)}],
    [hello, {token: alternate}],
    [{...hello, instanceId: 'different-profile'}, {}],
    [{...hello, releaseReceipts: [receipt, {...receipt, epoch: 'fixture-unknown-epoch'}]}, {}],
  ]) {
    assert.equal((await f.post('connect', body, options)).error.code, 'INVALID_RELEASE_RECEIPT');
    await assert.rejects(f.backend.release(old), {code: 'STALE_TARGET'});
  }
  const next = await f.connect('fixture-receipt-new', [receipt]);
  assert.deepEqual(next.acknowledgedReleases, [JSON.stringify([receipt.instanceId, receipt.browserInstanceId, receipt.epoch])]);
  assert.deepEqual(await f.backend.release(old), {released: true, retired: true});
  await f.post('disconnect', {...f.session, events: []});
  assert.deepEqual((await f.connect('fixture-receipt-retry', [receipt])).acknowledgedReleases, next.acknowledgedReleases, 'lost ACK is idempotently retryable');
  const leases = JSON.parse(await readFile(join(f.dataDir, 'extension-release-leases.json'), 'utf8'));
  assert.ok(leases.some(lease => lease.key === next.acknowledgedReleases[0]));
  assert.ok(!JSON.stringify(leases).includes(first.releaseTicket), 'only ticket hashes are stored on the host');
});

test('private human closure confirmation is targeted and refuses connected browser instances', {timeout: 5000}, async t => {
  const f = await fixture(t);
  await f.connect('fixture-human-old');
  const old = (await f.backend.listTargets())[0];
  await assert.rejects(f.backend.confirmClosedTargets([old]), {code: 'BROWSER_STILL_CONNECTED'});
  await f.post('disconnect', {...f.session, events: []});
  await assert.rejects(f.backend.release(old), {code: 'STALE_TARGET'});
  assert.deepEqual((await f.backend.confirmClosedTargets([old])).retiredTargetIds, [old.id]);
  assert.deepEqual(await f.backend.release(old), {released: true, retired: true});
  await assert.rejects(f.backend.release({id: old.id.replace('fixture-human-old', 'fixture-human-unknown')}), {code: 'STALE_TARGET'});
});
