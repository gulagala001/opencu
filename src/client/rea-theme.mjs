// A history commit can mount many independent REA roots. Read the host theme
// once for the shared lifetime, before portals write to the document, instead
// of forcing a full style recalculation for every card.
const listeners = new Set();
let snapshot, observer, media, pendingFrame;

function readTheme() {
  return getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light';
}

function refresh() {
  pendingFrame = undefined;
  if (!listeners.size) return;
  const next = readTheme();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener(snapshot);
}

function schedule() {
  if (pendingFrame === undefined) pendingFrame = requestAnimationFrame(refresh);
}

export function subscribeReaTheme(listener) {
  if (!observer) {
    snapshot = readTheme();
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true });
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', schedule);
  }
  listeners.add(listener);
  listener(snapshot);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    listeners.delete(listener);
    // React may replace the last root in the same commit. Preserve the shared
    // snapshot until that commit finishes, but release all observers when idle.
    queueMicrotask(() => {
      if (listeners.size || !observer) return;
      observer.disconnect(); observer = undefined;
      media.removeEventListener('change', schedule); media = undefined;
      if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame);
      pendingFrame = undefined; snapshot = undefined;
    });
  };
}
