import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalFeedbackFixture, deferred, flush } from './fixtures/app-approval-feedback.mjs';

const response = (conversationId = 'A') => ({ conversationId, requestId: 'approval-1', action: 'accept', persist: 'session' });
const notice = message => ({ conversationId: 'A', level: 'error', message });
const genericFailure = 'The app approval response could not be confirmed.';

for (const [name, click, action, persist, modes] of [
  ['session allow', actions => actions.onApprove(), 'accept', 'session', ['session', 'always']],
  ['always allow', actions => actions.leadingAction.onClick(), 'accept', 'always', ['session', 'always']],
  ['decline', actions => actions.onDeny(), 'decline', null, ['session', 'always']],
  ['one-time allow', actions => actions.onApprove(), 'accept', null, []],
]) test(`real REA ${name} reports a failed response, unlocks and keeps explicit retry`, async () => {
  const first = deferred(), second = deferred();
  let attempts = 0;
  const fixture = await approvalFeedbackFixture({ request: () => (++attempts === 1 ? first.promise : second.promise) });
  const actions = fixture.render({ request: { appDisplayName: 'Fixture App', persistModes: modes } });
  assert.equal(actions.isLoading, false);
  click(actions);
  click(actions);
  assert.equal(fixture.calls.length, 1, 'the card must suppress in-flight repeated clicks');
  assert.equal(fixture.render().isLoading, true);
  assert.deepEqual(fixture.notices, []);
  assert.equal(fixture.calls[0].method, 'appApprovals/respond');
  assert.deepEqual(structuredClone(fixture.calls[0].response), { conversationId: 'A', requestId: 'approval-1', action, persist });

  first.reject(new Error('approval response rejected'));
  await flush();
  assert.equal(fixture.render().isLoading, false);
  assert.deepEqual(fixture.settled, [], 'failure must not retire the card');
  assert.equal(fixture.calls.length, 1, 'failure must not automatically retry');
  assert.deepEqual(fixture.notices, [notice('approval response rejected')]);

  click(fixture.render());
  assert.equal(fixture.calls.length, 2, 'retry needs another explicit user action');
  second.resolve({ ok: true });
  await flush();
  assert.deepEqual(fixture.settled, [action]);
  assert.equal(fixture.notices.length, 1, 'success must not add another notice');
});

test('successful response passes its exact result through without notices or session lookup', async () => {
  const result = { ok: true, settled: true }, value = response();
  const fixture = await approvalFeedbackFixture({ request: () => Promise.resolve(result) });
  assert.equal(await fixture.service.respondAppApproval(value), result);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].response, value);
  assert.deepEqual(fixture.notices, []);
  assert.deepEqual(fixture.scopeLookups, []);
  assert.equal(fixture.activeReads, 0);
});

test('real REA successful response settles once without a notice', async () => {
  const operation = deferred();
  const fixture = await approvalFeedbackFixture({ request: () => operation.promise });
  fixture.render().onApprove();
  fixture.render().onDeny();
  assert.equal(fixture.calls.length, 1);
  operation.resolve({ ok: true });
  await flush();
  assert.deepEqual(fixture.settled, ['accept']);
  assert.deepEqual(fixture.notices, []);
  assert.deepEqual(fixture.scopeLookups, []);
});

test('late failure after switching conversations reaches only the original card session', async () => {
  const operation = deferred();
  const fixture = await approvalFeedbackFixture({ request: () => operation.promise });
  fixture.render().onApprove();
  fixture.setActiveSession('B');
  operation.reject(new Error('response not confirmed'));
  await flush();
  assert.deepEqual(fixture.notices, [notice('response not confirmed')]);
  assert.deepEqual(fixture.scopeLookups, ['A']);
  assert.deepEqual(fixture.inputScopes, ['A']);
  assert.equal(fixture.activeReads, 0, 'notification routing must never inspect the active session');
});

test('a response retains its original conversation identity while pending', async () => {
  const operation = deferred(), error = new Error('late failure'), value = response();
  const fixture = await approvalFeedbackFixture({ request: () => operation.promise });
  const pending = fixture.service.respondAppApproval(value);
  value.conversationId = 'B';
  operation.reject(error);
  await assert.rejects(pending, thrown => thrown === error);
  assert.deepEqual(fixture.notices, [notice(error.message)]);
  assert.deepEqual(fixture.scopeLookups, ['A']);
});

test('a disposed original session never falls back to the active session', async () => {
  const operation = deferred(), error = new Error('late failure');
  const fixture = await approvalFeedbackFixture({ request: () => operation.promise });
  const pending = fixture.service.respondAppApproval(response());
  fixture.scopes.delete('A');
  fixture.setActiveSession('B');
  operation.reject(error);
  await assert.rejects(pending, thrown => thrown === error);
  assert.deepEqual(fixture.notices, []);
  assert.deepEqual(fixture.scopeLookups, ['A']);
  assert.deepEqual(fixture.inputScopes, []);
  assert.equal(fixture.activeReads, 0);
});

for (const id of [undefined, null, '', 0]) test(`missing or invalid conversation identity (${String(id)}) never chooses a notification recipient`, async () => {
  const error = new Error('request rejected');
  const fixture = await approvalFeedbackFixture({ request: () => Promise.reject(error) });
  await assert.rejects(fixture.service.respondAppApproval({ ...response(), conversationId: id }), thrown => thrown === error);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.notices, []);
  assert.deepEqual(fixture.scopeLookups, []);
  assert.equal(fixture.activeReads, 0);
});

test('original rejection identity, code, details and stack survive; notice uses only its message', async () => {
  const error = Object.assign(new Error('APP_APPROVAL_NOT_FOUND'), { code: 'NOT_FOUND', details: { private: 'not-for-notice' } });
  error.stack = 'not-for-notice-stack';
  const fixture = await approvalFeedbackFixture({ request: () => Promise.reject(error) });
  await assert.rejects(fixture.service.respondAppApproval(response()), thrown => thrown === error);
  assert.equal(error.code, 'NOT_FOUND');
  assert.deepEqual(error.details, { private: 'not-for-notice' });
  assert.equal(error.stack, 'not-for-notice-stack');
  assert.deepEqual(fixture.notices, [notice(error.message)]);
  assert.doesNotMatch(JSON.stringify(fixture.notices), /not-for-notice/);
});

for (const error of ['unstructured rejection', { details: 'do not stringify' }, null]) test(`non-message rejection (${error === null ? 'null' : typeof error}) uses bounded generic feedback`, async () => {
  const fixture = await approvalFeedbackFixture({ request: () => Promise.reject(error) });
  await fixture.service.respondAppApproval(response()).then(
    () => assert.fail('must reject'), thrown => assert.equal(thrown, error),
  );
  assert.deepEqual(fixture.notices, [notice(genericFailure)]);
});

test('a synchronous request failure becomes a rejected response and unlocks the real card', async () => {
  const error = new Error('request failed before transport');
  const fixture = await approvalFeedbackFixture({ request: () => { throw error; } });
  assert.doesNotThrow(() => fixture.render().onApprove());
  await flush();
  assert.equal(fixture.render().isLoading, false);
  assert.deepEqual(fixture.settled, []);
  assert.deepEqual(fixture.notices, [notice(error.message)]);
});

for (const asynchronous of [false, true]) test(`${asynchronous ? 'rejected' : 'throwing'} notice cannot replace the request failure`, async () => {
  const original = new Error('original transport failure'), secondary = new Error('notice unavailable');
  let notifications = 0;
  const fixture = await approvalFeedbackFixture({
    request: () => Promise.reject(original),
    notify: () => { notifications++; if (asynchronous) return Promise.reject(secondary); throw secondary; },
  });
  await assert.rejects(fixture.service.respondAppApproval(response()), thrown => thrown === original);
  assert.equal(notifications, 1);
  assert.equal(fixture.calls.length, 1);
});

test('notice failure still unlocks the real card without marking it settled', async () => {
  const fixture = await approvalFeedbackFixture({
    request: () => Promise.reject(new Error('request rejected')),
    notify: () => { throw new Error('input disposed'); },
  });
  fixture.render().onApprove();
  await flush();
  assert.equal(fixture.render().isLoading, false);
  assert.deepEqual(fixture.settled, []);
  assert.equal(fixture.calls.length, 1);
  fixture.render().onApprove();
  await flush();
  assert.equal(fixture.calls.length, 2);
});

test('a throwing message getter cannot mask the original rejection', async () => {
  const error = { get message() { throw new Error('message getter failed'); } };
  const fixture = await approvalFeedbackFixture({ request: () => Promise.reject(error) });
  await assert.rejects(fixture.service.respondAppApproval(response()), thrown => thrown === error);
  assert.deepEqual(fixture.notices, []);
});

test('neighboring approval read, remove and pending routes retain their response mapping', async () => {
  const approvals = [{ bundleIdentifier: 'fixture.app' }], requests = [{ id: 'approval-1' }];
  const fixture = await approvalFeedbackFixture({ request: () => Promise.resolve({ approvals, requests }) });
  assert.equal(await fixture.service.getAppApprovals(), approvals);
  assert.equal(await fixture.service.removeAppApproval('fixture.app'), approvals);
  assert.equal(await fixture.service.getPendingAppApprovals('A'), requests);
  assert.deepEqual(fixture.calls.map(call => call.method), ['appApprovals/read', 'appApprovals/remove', 'appApprovals/pending']);
  assert.deepEqual(structuredClone(fixture.calls[1].response), { bundleIdentifier: 'fixture.app' });
  assert.deepEqual(structuredClone(fixture.calls[2].response), { conversationId: 'A' });
  assert.deepEqual(fixture.notices, []);
});
