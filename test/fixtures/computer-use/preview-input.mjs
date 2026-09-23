import { viewportGeometry, sameScreenshotGeometry } from '../../../src/computer-use/browser-screenshot.mjs';
import { until } from '../frontend.mjs';

export function trackBrowserFrames(context) {
  return context.addInitScript(() => {
    const original = EventSource.prototype.addEventListener;
    EventSource.prototype.addEventListener = function(type, listener, options) {
      if (type === 'frame') return original.call(this, type, event => {
        const { data, ...frame } = JSON.parse(event.data);
        const frames = window.__cuDisplayedFrames ??= new Map();
        frames.set(data, frame);
        while (frames.size > 32) frames.delete(frames.keys().next().value);
        listener.call(this, event);
      }, options);
      if (type !== 'navigation') return original.call(this, type, listener, options);
      return original.call(this, type, event => {
        const deliver = () => listener.call(this, event);
        if (JSON.parse(event.data).url === window.__cuDelayedNavigationUrl) (window.__cuDelayedNavigations ??= []).push(deliver);
        else deliver();
      }, options);
    };
  });
}

export function previewPointer(page, image, getCdp, backend) {
  const point = async locator => {
    const cdp = getCdp();
    let rect, box, viewport, frame;
    const readDisplayed = async () => {
      const displayed = await image.evaluate(element => {
        if (!element.complete || !element.naturalWidth) return null;
        const frame = window.__cuDisplayedFrames?.get(element.src.split(',')[1]);
        return frame ? { frame, box: element.getBoundingClientRect().toJSON() } : null;
      });
      if (!displayed) return false;
      const live = page.getByLabel('浏览器实时画面');
      if (await live.getAttribute('data-connection') !== 'live' || await live.getAttribute('data-layout-busy') === 'true') return false;
      if (backend === 'managed') {
        const size = await live.locator('.tx-cu-preview-stage').evaluate(element => ({ width: element.clientWidth, height: element.clientHeight }));
        if (Math.abs(size.width - displayed.frame.width) > 2 || Math.abs(size.height - displayed.frame.height) > 2) return false;
      }
      const { frameTree } = await cdp.send('Page.getFrameTree');
      if (displayed.frame.loaderId !== frameTree.frame.loaderId) return false;
      const before = viewportGeometry(await cdp.send('Page.getLayoutMetrics'));
      const nextRect = await locator.boundingBox(), metrics = await cdp.send('Page.getLayoutMetrics');
      const after = viewportGeometry(metrics);
      // DOM-derived click coordinates must describe the decoded image on
      // screen, not merely any intermediate frame produced by smooth scroll.
      if (!nextRect || !sameScreenshotGeometry(before, after) || !sameScreenshotGeometry(displayed.frame.geometry, after)) return false;
      rect = nextRect; box = displayed.box; frame = displayed.frame; viewport = metrics.cssVisualViewport;
      return true;
    };
    await until(readDisplayed);
    // A revealed window can show only the top of an emulated viewport. Keep
    // coordinates in the actual frame's CSS dimensions and uniform scale.
    const visibleHeight = () => Math.min(viewport.clientHeight, frame.height);
    if (rect.y < 0 || rect.y + rect.height > visibleHeight()) {
      await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
      await page.mouse.wheel(0, rect.y + rect.height / 2 - visibleHeight() / 2);
      await until(async () => await readDisplayed() && rect.y >= 0 && rect.y + rect.height <= visibleHeight());
    }
    const position = { x: (rect.x + rect.width / 2) * box.width / frame.width, y: (rect.y + rect.height / 2) * box.height / frame.height };
    return { x: box.x + position.x, y: box.y + position.y, position };
  };
  const click = async locator => {
    const p = await point(locator);
    // Use the actual image hit target: raw screen coordinates can point
    // outside it if the host finishes a sidebar layout between measurement
    // and pointer dispatch. Actionability waits before sending one click.
    await image.click({ position: p.position });
  };
  return { point, click };
}
