import test from 'node:test';
import assert from 'node:assert/strict';
import { actOnPage, releasePage } from '../src/browser/actions.mjs';

// Production actions and coordinate mapping with a synthetic page/CDP boundary.
// Dispatch ordering is tested here; no real browser click effect is claimed.
function fixture() {
  const events = [], viewport = { width: 800, height: 600, scrollX: 0, scrollY: 0 };
  let persisted = 0;
  const record = { documentGeneration: 0, pending: new Set(), buttons: new Set(), keys: new Set(), elements: new Map(),
    page: { url: () => 'https://example.test/', isClosed: () => false,
      evaluate: async () => ({ ...viewport }),
      mouse: { move: async (x, y) => events.push({ type: 'move', x, y }),
        down: async () => events.push({ type: 'down' }), up: async () => events.push({ type: 'up' }) } },
    session: { send: async () => {} },
    screenshot: { observationId: 'shot', url: 'https://example.test/', width: 400, height: 300, viewport: { ...viewport }, fullPage: false } };
  const request = { action: 'drag', coordinateSpace: 'screenshot', screenshotId: 'shot' };
  const options = { persistInputs: async () => { persisted++; } };
  return { record, request, options, events, viewport, get persisted() { return persisted; } };
}

for (const [name, path, code] of [
  ['right-edge endpoint', [{ x: 10, y: 10 }, { x: 400, y: 10 }], 'INVALID_COORDINATES'],
  ['negative middle point', [{ x: 10, y: 10 }, { x: -1, y: 10 }, { x: 20, y: 20 }], 'INVALID_COORDINATES'],
  ['bottom-edge final point', [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 20, y: 300 }], 'INVALID_COORDINATES'],
  ['nonfinite final point', [{ x: 10, y: 10 }, { x: NaN, y: 10 }], 'INVALID_ARGUMENT'],
  ['empty path', [], 'INVALID_ARGUMENT'],
  ['one point', [{ x: 10, y: 10 }], 'INVALID_ARGUMENT'],
]) {
  test(`drag rejects ${name} before pointer dispatch or input persistence`, async () => {
    const f = fixture();
    await assert.rejects(actOnPage(f.record, { ...f.request, path }, f.options), { code });
    assert.deepEqual(f.events, []);
    assert.equal(f.persisted, 0);
    assert.equal(f.record.buttons.size, 0);
    assert.equal(f.record.keys.size, 0);
    assert.equal(f.record.pending.size, 0);
  });
}

test('invalid path preserves already held input state', async () => {
  const f = fixture(); f.record.buttons.add('right'); f.record.keys.add('Shift');
  await assert.rejects(actOnPage(f.record, { ...f.request, path: [{ x: 10, y: 10 }, { x: 400, y: 10 }] }, f.options), { code: 'INVALID_COORDINATES' });
  assert.deepEqual([...f.record.buttons], ['right']); assert.deepEqual([...f.record.keys], ['Shift']);
  assert.deepEqual(f.events, []); assert.equal(f.persisted, 0);
});

test('abort during path preflight prevents pointer input and preserves held state', async () => {
  const f = fixture(), controller = new AbortController(); let reads = 0;
  f.record.keys.add('Shift');
  f.record.page.evaluate = async () => { if (++reads === 2) controller.abort(); return { ...f.viewport }; };
  await assert.rejects(actOnPage(f.record, { ...f.request, signal: controller.signal,
    path: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }, f.options), { code: 'CONTROL_STOPPED' });
  assert.deepEqual(f.events, []); assert.equal(f.persisted, 0);
  assert.deepEqual([...f.record.keys], ['Shift']); assert.equal(f.record.buttons.size, 0);
  assert.equal(f.record.pending.size, 0);
});

test('valid preview-scaled drag preserves every dispatched endpoint', async () => {
  const f = fixture();
  await actOnPage(f.record, { ...f.request, previewWidth: 200, previewHeight: 150,
    path: [{ x: 10, y: 10 }, { x: 100, y: 75 }, { x: 199, y: 149 }] }, f.options);
  assert.deepEqual(f.events, [{ type: 'move', x: 40, y: 40 }, { type: 'down' },
    { type: 'move', x: 400, y: 300 }, { type: 'move', x: 796, y: 596 }, { type: 'up' }]);
  assert.equal(f.persisted, 1); assert.equal(f.record.buttons.size, 0);
});

test('preflight does not cache coordinates across subsequent drag movement', async () => {
  const f = fixture();
  f.record.page.mouse.down = async () => { f.events.push({ type: 'down' }); f.viewport.scrollY = 10; };
  await assert.rejects(actOnPage(f.record, { ...f.request,
    path: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }, f.options), { code: 'STALE_SCREENSHOT' });
  assert.deepEqual(f.events.map(event => event.type), ['move', 'down']);
  assert.deepEqual(await releasePage(f.record, 100), []);
  assert.deepEqual(f.events.map(event => event.type), ['move', 'down', 'up']);
  assert.equal(f.record.buttons.size, 0);
});

test('from/to aliases preserve screenshot-scaled drag behavior', async () => {
  const f = fixture();
  await actOnPage(f.record, { ...f.request, from: [10, 20], to: [30, 40] }, f.options);
  assert.deepEqual(f.events, [{ type: 'move', x: 20, y: 40 }, { type: 'down' }, { type: 'move', x: 60, y: 80 }, { type: 'up' }]);
});

test('CSS drag coordinates retain the existing direct-coordinate path', async () => {
  const f = fixture(); f.record.screenshot = undefined;
  f.record.page.evaluate = async () => { throw Error('CSS coordinates do not need screenshot geometry'); };
  await actOnPage(f.record, { action: 'drag', coordinateSpace: 'css', path: [{ x: -10, y: 20 }, { x: 900, y: 700 }] }, f.options);
  assert.deepEqual(f.events, [{ type: 'move', x: -10, y: 20 }, { type: 'down' }, { type: 'move', x: 900, y: 700 }, { type: 'up' }]);
});

test('already-aborted drag never starts preflight or input', async () => {
  const f = fixture(); f.record.page.evaluate = async () => { throw Error('aborted request must not evaluate'); };
  await assert.rejects(actOnPage(f.record, { ...f.request, signal: AbortSignal.abort(),
    path: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }, f.options), { code: 'CONTROL_STOPPED' });
  assert.deepEqual(f.events, []); assert.equal(f.persisted, 0);
});

for (const coordinateSpace of ['screenshot-pixels', 'physical-screenshot-pixels']) {
  test(`${coordinateSpace} alias preserves DPR-2-sized screenshot mapping`, async () => {
    const f = fixture();
    Object.assign(f.record.screenshot, { width: 1600, height: 1200 });
    f.record.screenshot.viewport.deviceScaleFactor = 2; f.viewport.deviceScaleFactor = 2;
    await actOnPage(f.record, { ...f.request, coordinateSpace,
      path: [{ x: 200, y: 200 }, { x: 800, y: 600 }] }, f.options);
    assert.deepEqual(f.events, [{ type: 'move', x: 100, y: 100 }, { type: 'down' },
      { type: 'move', x: 400, y: 300 }, { type: 'up' }]);
  });
}

test('invalid path does not alter an explicitly held left button', async () => {
  const f = fixture(); f.record.buttons.add('left');
  await assert.rejects(actOnPage(f.record, { ...f.request,
    path: [{ x: 10, y: 10 }, { x: 400, y: 10 }] }, f.options), { code: 'INVALID_COORDINATES' });
  assert.deepEqual([...f.record.buttons], ['left']);
  assert.deepEqual(f.events, []); assert.equal(f.persisted, 0);
});
