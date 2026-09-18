import test from 'node:test';
import assert from 'node:assert/strict';
import { captureAfterFixtureAutomation } from './fixtures/computer-use/fixture-automation-ready.mjs';
const shot = elements => ({ structuredContent: { elements, truncated: false, unreadable: false } });
test('DPI fixture waits for accessibility children without performing input', async () => {
  const ready = shot([{ label: '颜色标记', bounds: { x: 7 } }]);
  let reads = 0; const incomplete = [];
  const result = await captureAfterFixtureAutomation(async () => ++reads === 1 ? shot([{ label: '测试内容' }]) : ready,
    { intervalMs: 0, onIncomplete: value => incomplete.push(value) });
  assert.equal(result, ready); assert.equal(reads, 2); assert.equal(incomplete.length, 1);
});
test('the readiness barrier does not hide wrong or missing marker geometry', async () => {
  for (const marker of [{ label: '颜色标记' }, { label: '颜色标记', bounds: { x: -999 } }]) {
    const original = shot([marker]); let reads = 0;
    assert.equal(await captureAfterFixtureAutomation(async () => { reads++; return original; }), original);
    assert.equal(reads, 1, 'coordinate assertions must see the invalid geometry, not retry it');
  }
});
test('permanently missing children and actual observation errors remain failures', async () => {
  await assert.rejects(captureAfterFixtureAutomation(async () => shot([]), { timeoutMs: 0 }), /did not become ready/);
  const error = new Error('native failure');
  await assert.rejects(captureAfterFixtureAutomation(async () => { throw error; }), value => value === error);
});
