import { i as anchorLayout, j as initializeAnchors } from './rea/remote-hosted-pip-anchor-bridge-173ba37b33ec.js';

/** Supplies DSH geometry to the original REA anchor and obstacle solver. */
export function createPresentationLayout(desktop) {
  initializeAnchors();
  let frame, disposed = false, signature, presentationSize = { width: 340, height: 230 }, sending = Promise.resolve();
  const roots = new Set(), observed = new Set();
  const selector = '[data-composer-card],[data-sidebar-right-panel][data-sidebar-right-open],[role="menu"],[role="dialog"]';
  const rect = element => {
    if (!element || element.closest('[hidden],[aria-hidden="true"]') || getComputedStyle(element).visibility === 'hidden') return null;
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
  };
  const resize = new ResizeObserver(schedule);
  const mutation = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.target.matches?.(selector)
      || record.target.contains?.(document.querySelector('[data-composer-card]')))) schedule();
  });
  function schedule() { if (!disposed) frame ??= requestAnimationFrame(measure); }
  function measure() {
    frame = undefined;
    if (disposed) return;
    const elements = [], nextRoots = new Set();
    function collect(root) {
      nextRoots.add(root);
      elements.push(...root.querySelectorAll(selector));
      for (const element of root.querySelectorAll('*')) if (element.shadowRoot) collect(element.shadowRoot);
    }
    collect(document);
    if (roots.size !== nextRoots.size || [...roots].some(root => !nextRoots.has(root))) {
      mutation.disconnect(); roots.clear();
      for (const root of nextRoots) {
        roots.add(root);
        mutation.observe(root, { subtree: true, childList: true, attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-state', 'data-sidebar-right-open'] });
      }
    }
    const host = document.querySelector('[data-sidebar-collapsed]') ?? document.documentElement;
    const hostRect = rect(host) ?? { x: 0, y: 0, width: innerWidth, height: innerHeight };
    const obstacles = elements.map(rect).filter(Boolean);
    const nextObserved = new Set([host, ...elements]);
    for (const element of observed) if (!nextObserved.has(element)) { resize.unobserve(element); observed.delete(element); }
    for (const element of nextObserved) if (!observed.has(element)) { resize.observe(element); observed.add(element); }
    const modal = elements.some(element => element.getAttribute('aria-modal') === 'true' && rect(element));
    const layout = { ...anchorLayout({ hostId: 'dsh-window', hostRect, obstacleRects: obstacles,
      homeSurfaceRect: null, isCodexHomeAvailable: false, presentationSize }), suppressed: modal,
      alignment: localStorage.getItem('opencu:monitor-alignment') ?? 'bottom-right' };
    const value = JSON.stringify(layout);
    if (signature !== value) {
      signature = value;
      sending = sending.catch(() => undefined).then(() => disposed ? undefined : desktop.presentation('layout', layout));
      void sending.catch(error => { signature = undefined; console.error('OpenCU monitor layout', error); });
    }
  }
  const unsubscribe = desktop.onPresentationEvent(event => {
    if (event.type === 'geometry' && Number.isFinite(event.width) && Number.isFinite(event.height) && event.width > 0 && event.height > 0) {
      presentationSize = { width: event.width, height: event.height }; schedule();
    }
    if (event.type === 'alignment' && ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(event.alignment)) {
      localStorage.setItem('opencu:monitor-alignment', event.alignment); schedule();
    }
  });
  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('transitionend', schedule, true);
  schedule();
  return () => {
    disposed = true; if (frame !== undefined) cancelAnimationFrame(frame);
    resize.disconnect(); mutation.disconnect(); unsubscribe();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('scroll', schedule, true);
    document.removeEventListener('transitionend', schedule, true);
  };
}
