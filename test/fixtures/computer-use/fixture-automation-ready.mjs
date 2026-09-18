import { setTimeout as delay } from 'node:timers/promises';

// Windows can report the new DPI before WPF's accessibility children return.
// Wait only for the known test fixture to exist; coordinate correctness is
// still asserted separately and no clicks, drags or text input are retried.
export async function captureAfterFixtureAutomation(capture, {
  timeoutMs = 6000, intervalMs = 40, onIncomplete = () => {},
} = {}) {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const shot = await capture();
    const state = shot.structuredContent;
    if (state.elements.some(element => element.label === '颜色标记')) return shot;
    onIncomplete({ count: state.elements.length, truncated: state.truncated, unreadable: state.unreadable });
    if (performance.now() >= deadline) throw new Error('The scaled fixture accessibility tree did not become ready: ' + JSON.stringify({
      labels: state.elements.map(element => element.label),
      truncated: state.truncated, unreadable: state.unreadable,
    }));
    await delay(intervalMs);
  }
}
