/** The REA frame is shared with the dock; only its desktop host can move a window. */
export function connectPresentationInteraction(root, report) {
  let drag = null, ignoreClickUntil = 0, animation, geometry, contrastGeometry;
  const hit = target => target instanceof Element && target.closest('[data-pip-presentation-frame],[data-pip-close]');
  const resizeEdge = (element, event) => {
    const rect = element.getBoundingClientRect(), x = event.clientX - rect.x, y = event.clientY - rect.y;
    return (y < 6 ? 'n' : y > rect.height - 6 ? 's' : '') + (x < 6 ? 'w' : x > rect.width - 6 ? 'e' : '');
  };
  const updateRegions = () => {
    const regions = [...root.querySelectorAll('[data-pip-presentation-frame],[data-pip-close]')].flatMap(element => {
      const rect = element.getBoundingClientRect();
      if (element.closest('[inert]') || !element.checkVisibility() || getComputedStyle(element).pointerEvents === 'none' || rect.width <= 0 || rect.height <= 0) return [];
      return [{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }];
    });
    const signature = JSON.stringify(regions);
    if (geometry !== signature) { geometry = signature; report({ type: 'hit-regions', regions }); }
    const control = root.querySelector('[data-pip-close]'), bounds = control?.getBoundingClientRect();
    const rect = bounds && !control.closest('[inert]') && getComputedStyle(control).opacity !== '0'
      ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
    const contrast = JSON.stringify(rect);
    if (contrast !== contrastGeometry) { contrastGeometry = contrast; report({ type: 'contrast-region', rect }); }
    animation = requestAnimationFrame(updateRegions);
  };
  updateRegions();
  const finish = () => {
    if (!drag) return;
    const current = drag; drag = null;
    report({ type: current.edge ? 'resize-end' : 'drag-end' });
    if (current.moved) ignoreClickUntil = performance.now() + 400;
    delete root.dataset.dragging; delete root.dataset.resizing;
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
  };
  root.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0 || !event.isPrimary || !hit(event.target) || event.target.closest('[data-pip-close]')) return;
    const element = event.target.closest('[data-pip-presentation-frame]');
    const edge = resizeEdge(element, event);
    drag = { id: event.pointerId, element, edge, x: event.screenX, y: event.screenY, moved: false };
    element.setPointerCapture(event.pointerId);
    if (edge) root.dataset.resizing = edge;
    report({ type: edge ? 'resize-start' : 'drag-start', targetId: element.dataset.pipPresentationFrame, ...(edge ? { edge } : {}) });
  });
  window.addEventListener('pointermove', event => {
    if (!drag) {
      const element = event.target instanceof Element && event.target.closest('[data-pip-presentation-frame]');
      if (element) { const edge = resizeEdge(element, event); if (edge) element.dataset.resizeEdge = edge; else delete element.dataset.resizeEdge; }
      return;
    }
    if (Math.hypot(event.screenX - drag.x, event.screenY - drag.y) >= 4) {
      drag.moved = true; if (!drag.edge) root.dataset.dragging = 'true';
    }
  }, true);
  window.addEventListener('pointerup', finish, true);
  window.addEventListener('pointercancel', finish, true);
  window.addEventListener('lostpointercapture', finish, true);
  window.addEventListener('blur', finish);
  root.addEventListener('click', event => {
    if (event.detail !== 0 && performance.now() < ignoreClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  window.addEventListener('pagehide', () => { finish(); cancelAnimationFrame(animation); });
}
