import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserViews } from '../src/computer-use/browser-view.mjs';
import { viewportGeometry } from '../src/computer-use/browser-screenshot.mjs';

const metrics = { cssLayoutViewport: { clientWidth: 800, clientHeight: 600 },
  cssVisualViewport: { clientWidth: 400, clientHeight: 300, pageX: 0, pageY: 0, offsetX: 0, offsetY: 0, scale: 2, zoom: 1.5 }, visualViewport: { clientWidth: 400 } };
function fixture(captureOnly, advanceFence = false) {
  const published = [], views = new BrowserViews({});
  const latest = { id: 'fresh', loaderId: 'doc', geometry: viewportGeometry(metrics), mediaType: 'image/png', data: 'fresh' };
  const event = { data: 'old', metadata: { timestamp: 10, pageScaleFactor: 2, scrollOffsetX: 0, scrollOffsetY: 0, deviceWidth: 1200, deviceHeight: 900 } };
  const view = { latest, loaderId: 'doc', frames: [], record: { page: { url: () => 'about:blank' } },
    screencastAfter: advanceFence ? 0 : 20, pending: { event, loaderId: 'doc', captureOnly },
    publish: (type, frame) => published.push({ type, frame }), cdp: { send: async () => {
      if (advanceFence) view.screencastAfter = 20;
      return metrics;
    } }, lifetime: new AbortController() };
  return { views, view, latest, event, published };
}
for (const advance of [false, true]) test('stale JPEG cannot bypass the fence through a merged refresh; delayed metrics=' + advance, async () => {
  const f = fixture(true, advance); await f.views.flush(f.view);
  assert.equal(f.view.latest, f.latest, 'keep the verified fresh screenshot');
  assert.deepEqual(f.published, [], 'never relabel stale pixels with the new geometry');
});
test('a fence advancing during the metrics query invalidates an in-flight JPEG', async () => {
  const f = fixture(false, true); await f.views.flush(f.view); assert.equal(f.view.latest, f.latest);
});

test('fresh JPEGs still pass without an unnecessary screenshot capture', async () => {
  const f = fixture(true); f.event.metadata.timestamp = 25;
  await f.views.flush(f.view); assert.equal(f.published.length, 1);
  assert.equal(f.view.latest.data, 'old'); assert.equal(f.view.latest.mediaType, 'image/jpeg');
});
