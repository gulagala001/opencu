import { restorePresentationImages } from '../presentation-images.mjs';

const sameFields = (left, right, omitted = []) => left === right || !!left && !!right
  && Object.keys(left).filter(key => !omitted.includes(key)).length === Object.keys(right).filter(key => !omitted.includes(key)).length
  && Object.keys(left).every(key => omitted.includes(key) || Object.hasOwn(right,key) && Object.is(left[key],right[key]));

/** Global window movement alone does not change the renderer's local card layout. */
export function samePresentationMotion(left, right) {
  return left === right || !!left && !!right && sameFields(left,right,['items','bounds'])
    && sameFields(left.bounds,right.bounds,['x','y']) && left.items.length === right.items.length
    && left.items.every((item,index) => sameFields(item,right.items[index]));
}

/** IPC recreates objects even when only a different target's image changed. */
export function reusePresentationFrames(previous, incoming) {
  const frames = incoming.map(frame => {
    const old = previous.find(item => item.presentationID === frame.presentationID && item.threadID === frame.threadID
      && item.visibilityKey === frame.visibilityKey && item.mediaGeneration === frame.mediaGeneration);
    return sameFields(old, frame, ['completion']) && sameFields(old?.completion, frame.completion) ? old : frame;
  });
  return frames.length === previous.length && frames.every((frame, index) => frame === previous[index]) ? previous : frames;
}

/** Coalesce only continuous motion; frame/transfer/reset lifecycle messages stay immediate. */
export function createPresentationUpdateQueue(render, {requestFrame = requestAnimationFrame,cancelFrame = cancelAnimationFrame} = {}) {
  let state = {frames:[],motion:null}, rendered, animation, disposed = false;
  const cancel = () => { if (animation !== undefined) cancelFrame(animation); animation = undefined; };
  const flush = () => { animation = undefined; rendered = state; render(state); };
  return {
    getState: () => state,
    update(payload) {
      if (disposed) return;
      state = {...state,...payload, ...(Array.isArray(payload.frames) ? {frames:reusePresentationFrames(state.frames,restorePresentationImages(state.frames,payload.frames))} : {})};
      if (Object.keys(payload).every(key => key === 'motion')) {
        if (rendered && samePresentationMotion(rendered.motion,state.motion)) { cancel(); return; }
        animation ??= requestFrame(flush);
      } else { cancel(); flush(); }
    },
    dispose() { disposed = true; cancel(); },
  };
}

/** A frame is itself a REA button; only descendant controls own a separate action. */
export function isNestedPresentationControl(target, frame) {
  const control = target instanceof Element && target.closest('button,a[href],input,select,textarea,[role="button"],[contenteditable="true"]');
  return !!control && control !== frame;
}

/** The REA frame is shared with the dock; only its desktop host can move a window. */
export function connectPresentationInteraction(root, report) {
  let drag = null, ignoreClickUntil = 0, animation, geometry, contrastGeometry, disposed = false, elementsDirty = true, elements = [];
  const observed = new Set(), animations = new Map();
  const selector = '[data-pip-presentation-frame],[data-pip-close]';
  const movesRegions = element => element instanceof Element && (element === root || element.matches('[data-pip-position],[data-pip-presentation-frame],[data-pip-close],[data-pip-surface]'));
  const hit = target => target instanceof Element && target.closest('[data-pip-presentation-frame],[data-pip-close]');
  const resizeEdge = (element, event) => {
    const rect = element.getBoundingClientRect(), x = event.clientX - rect.x, y = event.clientY - rect.y;
    return (y < 6 ? 'n' : y > rect.height - 6 ? 's' : '') + (x < 6 ? 'w' : x > rect.width - 6 ? 'e' : '');
  };
  const schedule = () => { if (!disposed) animation ??= requestAnimationFrame(updateRegions); };
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const updateRegions = () => {
    animation = undefined;
    if (disposed) return;
    if (elementsDirty) {
      elementsDirty = false; elements = [...root.querySelectorAll(selector)];
      const next = new Set([root,...elements]);
      for (const element of observed) if (!next.has(element)) { resize?.unobserve(element); observed.delete(element); }
      for (const element of next) if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
    }
    const regions = [], control = elements.find(element => element.matches('[data-pip-close]'));
    let contrast = null;
    for (const element of elements) {
      if (element.closest('[inert]')) continue;
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      const rect = {x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
      if (element === control && style.opacity !== '0') contrast = rect;
      if (element.checkVisibility() && style.pointerEvents !== 'none' && rect.width > 0 && rect.height > 0) regions.push(rect);
    }
    if (!geometry || geometry.length !== regions.length || regions.some((rect,index) => !sameFields(rect,geometry[index]))) {
      geometry = regions; report({type:'hit-regions',regions});
    }
    if (contrastGeometry === undefined || !sameFields(contrast,contrastGeometry)) {
      contrastGeometry = contrast; report({type:'contrast-region',rect:contrast});
    }
    for (const element of animations.keys()) if (!root.contains(element)) animations.delete(element);
    const nativeAnimation = root.getAnimations?.({subtree:true}).some(animation => movesRegions(animation.effect?.target)
      && (animation.playState === 'running' || animation.pending));
    if (animations.size || nativeAnimation) schedule();
  };
  const mutation = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || ['data-pip-presentation-frame','data-pip-close'].includes(record.attributeName))) elementsDirty = true;
    schedule();
  });
  mutation.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','hidden','inert','data-native-motion','data-theme','data-pip-presentation-frame','data-pip-close']});
  const animated = event => {
    if (!movesRegions(event.target)) return;
    const key = `${event.type.startsWith('transition') ? 'transition' : 'animation'}:${event.propertyName ?? event.animationName}`;
    let running = animations.get(event.target);
    if (event.type === 'transitionrun' || event.type === 'animationstart') {
      if (!running) { running = new Set(); animations.set(event.target,running); }
      running.add(key);
    } else if (running) { running.delete(key); if (!running.size) animations.delete(event.target); }
    schedule();
  };
  updateRegions();
  const finish = () => {
    if (!drag) return;
    const current = drag; drag = null;
    report({ type: current.edge ? 'resize-end' : 'drag-end' });
    if (current.moved) ignoreClickUntil = performance.now() + 400;
    delete root.dataset.dragging; delete root.dataset.resizing;
    if (current.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
    schedule();
  };
  const down = event => {
    if (drag || event.button !== 0 || !event.isPrimary || !hit(event.target) || event.target.closest('[data-pip-close]')) return;
    const element = event.target.closest('[data-pip-presentation-frame]');
    // The frame itself is a REA button. Nested controls keep their own click
    // recipient; capturing them on the frame would turn Retry into frame focus.
    if (isNestedPresentationControl(event.target, element)) return;
    const edge = resizeEdge(element, event);
    drag = { id: event.pointerId, element, edge, x: event.screenX, y: event.screenY, moved: false };
    element.setPointerCapture(event.pointerId);
    if (edge) root.dataset.resizing = edge;
    report({ type: edge ? 'resize-start' : 'drag-start', targetId: element.dataset.pipPresentationFrame, ...(edge ? { edge } : {}) });
  };
  const move = event => {
    if (!drag) {
      const element = event.target instanceof Element && event.target.closest('[data-pip-presentation-frame]');
      if (element) { const edge = resizeEdge(element, event); if (edge && element.dataset.resizeEdge !== edge) element.dataset.resizeEdge = edge; else if (!edge) delete element.dataset.resizeEdge; }
      return;
    }
    if (Math.hypot(event.screenX - drag.x, event.screenY - drag.y) >= 4) {
      drag.moved = true; if (!drag.edge && root.dataset.dragging !== 'true') root.dataset.dragging = 'true';
    }
  };
  const click = event => {
    if (event.detail !== 0 && performance.now() < ignoreClickUntil) { event.preventDefault(); event.stopPropagation(); }
  };
  const activity = ['pointerover','pointerout','focusin','focusout','load'];
  const animationEvents = ['transitionrun','transitionend','transitioncancel','animationstart','animationend','animationcancel'];
  root.addEventListener('pointerdown',down); window.addEventListener('pointermove',move,true);
  window.addEventListener('pointerup', finish, true);
  window.addEventListener('pointercancel', finish, true);
  window.addEventListener('lostpointercapture', finish, true);
  window.addEventListener('blur', finish);
  root.addEventListener('click',click,true); window.addEventListener('resize',schedule);
  for (const event of activity) root.addEventListener(event,schedule,true);
  for (const event of animationEvents) root.addEventListener(event,animated,true);
  const dispose = () => {
    finish(); disposed = true; if (animation !== undefined) cancelAnimationFrame(animation);
    mutation.disconnect(); resize?.disconnect(); observed.clear(); animations.clear();
    root.removeEventListener('pointerdown',down); window.removeEventListener('pointermove',move,true);
    for (const event of ['pointerup','pointercancel','lostpointercapture']) window.removeEventListener(event,finish,true);
    window.removeEventListener('blur',finish); root.removeEventListener('click',click,true); window.removeEventListener('resize',schedule);
    for (const event of activity) root.removeEventListener(event,schedule,true);
    for (const event of animationEvents) root.removeEventListener(event,animated,true);
    window.removeEventListener('pagehide',dispose);
  };
  window.addEventListener('pagehide',dispose);
  return dispose;
}
