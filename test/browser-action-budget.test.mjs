import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { BROWSER_STARTUP_TIMEOUT_MS } from '../src/computer-use/browser.mjs';

test('cold browser creation includes its launch budget; warm and external actions keep their limit', async () => {
  const cases = [
    [undefined, { action: 'new' }, 15000 + BROWSER_STARTUP_TIMEOUT_MS],
    [{ ready: false }, { action: 'new' }, 15000 + BROWSER_STARTUP_TIMEOUT_MS],
    [{ ready: true, lost: true }, { action: 'new' }, 15000 + BROWSER_STARTUP_TIMEOUT_MS],
    [{ ready: true }, { action: 'new' }, 15000],
    [undefined, { action: 'new', browserId: 'external' }, 15000],
    [undefined, { action: 'select', tabId: 'existing' }, 15000],
    [undefined, { action: 'close', tabId: 'existing' }, 15000],
  ];
  for (const [run, input, expected] of cases) {
    const calls = [], manager = { browser: { run }, sessions: new Map(),
      userBrowserAction: (...args) => { calls.push(args); return Promise.resolve(); } };
    await ComputerUseManager.prototype.changeUserTab.call(manager, 'session', input);
    assert.equal(calls.length, 1, 'the action is submitted once');
    assert.equal(calls[0][4], expected, JSON.stringify(input));
    assert.equal(calls[0][1], input, 'input identity and control epoch stay unchanged');
  }
});

test('explicit Stop still cancels an extended cold-start action', async t => {
  const calls = [], state = { controlEpoch: 1, viewers: new Map() };
  const manager = { enabled: true, session: () => state, publishControl() {}, viewerTarget: () => null, stop: async () => {} };
  const pending = ComputerUseManager.prototype.userBrowserAction.call(manager, 'session', { controlEpoch: 1 }, signal => new Promise((_, reject) => {
    calls.push('started'); signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), undefined, 15000 + BROWSER_STARTUP_TIMEOUT_MS);
  await new Promise(resolve => setImmediate(resolve));
  const stopped = new Error('explicit Stop'); state.uiAction.abort(stopped);
  await assert.rejects(pending, error => error === stopped);
  assert.deepEqual(calls, ['started']); assert.equal(state.uiAction, null);
});
