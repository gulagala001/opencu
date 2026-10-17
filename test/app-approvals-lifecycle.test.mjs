import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rmdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppApprovals } from '../src/dsh/app-approvals.mjs';

const target = { id: 'native:isolated', backend: 'native', name: 'Isolated app',
  identity: { bundleId: 'test.isolated', executable: '/isolated/Test.app' } };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-approvals-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = createAppApprovals(() => directory);
  t.after(() => service.close());
  return { directory, service };
}

for (const approved of [false, true]) test('closing during authorization read prevents late ' + (approved ? 'permanent access' : 'pending requests'), async t => {
  const f = await fixture(t);
  const app = { bundleIdentifier: target.identity.bundleId, executable: target.identity.executable, displayName: target.name };
  await writeFile(join(f.directory, 'app-approvals.json'), JSON.stringify({ approvedApps: approved ? [app] : [] }));
  const result = f.service.authorize(target, 'session').then(() => ({ accepted: true }), error => ({ error }));
  await f.service.close();
  let timer;
  const outcome = await Promise.race([result, new Promise(resolve => { timer = setTimeout(() => resolve({ pending: true }), 1000); })]);
  clearTimeout(timer);
  assert.equal(outcome.pending, undefined, 'An in-flight authorization must not outlive close waiting for a new approval');
  assert.equal(outcome.accepted, undefined);
  assert.match(outcome.error?.message || '', /closed/);
  assert.deepEqual(f.service.pending('session'), []);
});

test('a failed permanent approval write leaves access pending and can be retried', async t => {
  const f = await fixture(t);
  const waiter = f.service.authorize(target, 'session');
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error('Approval was not published')), 1000);
      const check = () => f.service.pending('session').length ? resolve() : setImmediate(check);
      check();
    });
  } finally { clearTimeout(timer); }
  const requestId = f.service.pending('session')[0].id, file = join(f.directory, 'app-approvals.json');
  let allowed = false; waiter.then(() => { allowed = true; });
  await mkdir(file);
  await assert.rejects(f.service.respond({ conversationId: 'session', requestId, action: 'accept', persist: 'always' }));
  assert.equal(allowed, false);
  assert.equal(f.service.pending('session').length, 1);
  await rmdir(file);
  await f.service.respond({ conversationId: 'session', requestId, action: 'accept', persist: 'always' });
  await waiter;
  assert.equal(allowed, true);
  assert.equal((await f.service.read()).approvedApps.length, 1);
});

for (const action of ['cancel', 'forgetSession', 'abort', 'close']) test('metadata completing after ' + action + ' cannot publish a late approval', async t => {
  const f = await fixture(t), entered = Promise.withResolvers(), gate = Promise.withResolvers(), controller = new AbortController();
  const outcome = f.service.authorize(target, 'session', controller.signal, async () => { entered.resolve(); return gate.promise; })
    .then(() => ({ accepted: true }), error => ({ error }));
  try {
    await entered.promise;
    if (action === 'cancel') f.service.cancel('session');
    else if (action === 'forgetSession') f.service.forgetSession('session');
    else if (action === 'abort') controller.abort();
    else await f.service.close();
    gate.resolve({ displayName: 'Localized app', iconDataURL: 'data:image/png;base64,aW1hZ2U=' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.service.pending('session'), []);
    const result = await outcome;
    assert.equal(result.accepted, undefined); assert.ok(result.error);
  } finally { gate.resolve(); f.service.cancel(); await outcome; }
});

test('metadata is loaded only for a new prompt and never grants a changed executable', async t => {
  const f = await fixture(t); let reads = 0;
  const metadata = async () => { reads++; return { displayName: 'Localized app', iconDataURL: 'data:image/png;base64,aW1hZ2U=' }; };
  const authorize = (value = target, session = 'session') => f.service.authorize(value, session, undefined, metadata);
  const settle = async (promise, session, action = 'accept', persist = 'session') => {
    const request = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Approval was not published')), 1000);
      const check = () => { const request = f.service.pending(session)[0]; if (request) { clearTimeout(timer); resolve(request); } else setImmediate(check); }; check();
    });
    assert.equal(request.request.appDisplayName, 'Localized app');
    await f.service.respond({ conversationId: session, requestId: request.id, action, persist });
    return promise;
  };
  await settle(authorize(), 'session', 'accept', 'always'); assert.equal(reads, 1);
  await authorize(); await authorize(target, 'other'); assert.equal(reads, 1);
  const persisted = await f.service.read(); assert.equal(persisted.approvedApps[0].displayName, 'Localized app');
  assert.equal(persisted.approvedApps[0].iconDataURL, 'data:image/png;base64,aW1hZ2U=');
  f.service.forgetSession('session');
  assert.deepEqual(await f.service.read(), persisted);
  await authorize(); assert.equal(reads, 1);
  await f.service.remove(target.identity.bundleId); await authorize(); assert.equal(reads, 1);
  const changed = { ...target, identity: { ...target.identity, executable: '/isolated/Replacement.app' } };
  const denied = authorize(changed).then(() => null, error => error);
  const error = await settle(denied, 'session', 'decline'); assert.equal(error.code, 'APP_ACCESS_DENIED'); assert.equal(reads, 2);
  await assert.rejects(f.service.authorize(changed, 'new', undefined, async () => { throw Error('Metadata unavailable'); }), /Metadata unavailable/);
  assert.deepEqual(f.service.pending('new'), []);
  await settle(authorize(changed, 'new'), 'new'); assert.equal(reads, 3);
  f.service.cancel('new'); await authorize(changed, 'new'); assert.equal(reads, 3);
  f.service.forgetSession('new');
  await settle(authorize(changed, 'new'), 'new'); assert.equal(reads, 4);
  await authorize(target, 'other'); assert.equal(reads, 4);
  assert.deepEqual(await f.service.read(), { approvedApps: [] });
});
