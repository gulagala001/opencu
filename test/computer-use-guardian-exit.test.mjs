import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForWindowsGuardian } from '../src/computer-use/browser.mjs';

for (const synchronous of [false, true]) test('Windows Stop waits for actual exit after ' + (synchronous ? 'a closed IPC channel' : 'an asynchronous EPIPE'), async () => {
  const error = Object.assign(new Error('pipe closed during exit'), { code: synchronous ? 'ERR_IPC_CHANNEL_CLOSED' : 'EPIPE' });
  let finish, stopped = false;
  const run = { child: { connected: true, send(message, callback) { assert.equal(message.type, 'stop'); if (synchronous) throw error; queueMicrotask(() => callback(error)); } }, exited: new Promise(resolve => { finish = resolve; }) };
  const pending = waitForWindowsGuardian(run, 1000).then(() => { stopped = true; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(stopped, false, 'a broken pipe alone never counts as successful shutdown');
  finish(); await pending; assert.equal(stopped, true);
});
test('Windows Stop still fails when the guardian does not exit', async () => {
  const error = Object.assign(new Error('pipe closed'), { code: 'EPIPE' });
  await assert.rejects(waitForWindowsGuardian({ child: { connected: true, send(_message, callback) { callback(error); } }, exited: new Promise(() => {}) }, 20), failure => {
    assert.match(failure.message, /shutdown is still pending/); assert.equal(failure.cause, error); return true;
  });
});
