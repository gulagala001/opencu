import { mountBrowserCommentRuntime, createAnnotationControls, createAnnotationRequests, observeAnnotationFeatures, installSiteAnnotationApi } from './rea-page-runtime.js';

// This module runs in the browser guest; it exposes annotation data, never host APIs.
export function install(initialState) {
  globalThis.__opencuAnnotations?.dispose();
  const messages = [], listeners = new Set(), expected = [], waiters = new Set();
  const wake = () => { for (const resolve of [...waiters]) resolve(); };
  const enqueue = message => { messages.push(message); wake(); };
  let lastActivity = 0;
  const activity = event => {
    if (!event.isTrusted) return;
    const now = performance.now();
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].until < now) expected.splice(i, 1);
    const index = expected.findIndex(input => input.type === event.type &&
      (input.key == null || input.key === event.key) &&
      (input.x == null || Math.abs(input.x - event.clientX) < 2 && Math.abs(input.y - event.clientY) < 2) &&
      (input.deltaY == null || Math.abs(input.deltaX - event.deltaX) < 1 && Math.abs(input.deltaY - event.deltaY) < 1));
    if (index !== -1) { expected.splice(index, 1); return; }
    if (now - lastActivity < 250) return;
    lastActivity = now;
    enqueue({ type: 'opencu-user-activity', kind: event.type });
  };
  const inputEvents = ['pointerdown', 'keydown', 'wheel', 'input'];
  for (const type of inputEvents) window.addEventListener(type, activity, true);
  let state = initialState, permission = null, granted = state.siteAnnotationPermissionGranted === true, editorOpen = false, disposed = false;
  const permitted = () => !disposed && state.canUseSiteAnnotationApi === true && state.siteAnnotationFeaturesEnabled !== false && !state.isAgentControllingBrowser;
  const requestPermission = interactionMode => {
    if (granted) return true;
    if (permission) return permission.promise;
    permission = { ...Promise.withResolvers(), requestId: crypto.randomUUID() };
    enqueue({ type: 'browser-sidebar-runtime-request-annotation-permission', requestId: permission.requestId, interactionMode });
    return permission.promise;
  };
  const controls = createAnnotationControls();
  const requests = createAnnotationRequests({ requestPermission, getState: () => ({
    canUseSiteAnnotationApi: permitted(), isAgentControllingBrowser: state.isAgentControllingBrowser, hasActiveEditor: editorOpen,
  }) });
  const features = observeAnnotationFeatures((features, detections, used) => enqueue({ type: 'opencu-site-annotation-features', features, detections, used }));
  const removeSiteApi = globalThis.isSecureContext && window === window.top ? installSiteAnnotationApi(force => {
    if (!permitted() || navigator.userActivation?.isActive !== true) return false;
    const interactionMode = force === true ? 'comment' : force === false ? 'browse' : state.interactionMode === 'comment' ? 'browse' : 'comment';
    const apply = allowed => { if (allowed && permitted()) enqueue({ type: 'browser-sidebar-runtime-toggle-annotation-mode', force, interactionMode }); };
    const decision = requestPermission(interactionMode);
    if (typeof decision === 'boolean') apply(decision); else void decision.then(apply);
    return true;
  }, () => permitted() && state.interactionMode === 'comment', features.recordUse, permitted) : null;
  const runtime = mountBrowserCommentRuntime({
    initialState: state,
    getAnnotationControlTargets: controls.getTargets, getAnnotationControls: controls.getControls,
    subscribeToSiteAnnotationRequests: requests.subscribe,
    recordAnnotationFeatureUse: (feature, prompt) => { if (permitted()) features.recordAnnotationOpened(feature, prompt); },
    sendMessageToHost(message) {
      if (/open-(editor|design-editor)$/.test(message.type)) editorOpen = true;
      if (/cancel-editor|exit-comment-mode/.test(message.type)) { editorOpen = false; requests.clear(); }
      enqueue(message);
    },
    subscribeToHostMessages(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
  const bridge = {
    dispatch(message) {
      if (message.type === 'browser-sidebar-runtime-annotation-permission-result') {
        if (permission?.requestId === message.requestId) { granted = message.allowed === true; permission.resolve(granted); permission = null; }
        return;
      }
      if (message.type === 'browser-site-annotation-feature-preview') { runtime.setSiteAnnotationPreview(permitted() ? message.preview : null); return; }
      if (message.type === 'browser-sidebar-runtime-close-editor') { editorOpen = false; requests.clear(); }
      if (message.type === 'browser-sidebar-runtime-sync') {
        const wasActive = permitted() && state.interactionMode === 'comment';
        state = message; granted = state.siteAnnotationPermissionGranted === true;
        if (!permitted()) { permission?.resolve(false); permission = null; requests.clear(); runtime.setSiteAnnotationPreview(null); }
        const active = permitted() && state.interactionMode === 'comment';
        if (active !== wasActive) document.dispatchEvent(new CustomEvent('oaiannotationmodechange', { detail: { active } }));
      }
      for (const listener of listeners) listener(message);
    },
    drain(wait = false) {
      if (!wait || messages.length || disposed) return messages.splice(0);
      return new Promise(resolve => {
        const finish = () => { clearTimeout(timer); waiters.delete(finish); resolve(messages.splice(0)); };
        const timer = setTimeout(finish, 25000);
        waiters.add(finish);
      });
    },
    cancelWait: wake,
    expectInput(events, pending = false) {
      const id = crypto.randomUUID(), until = pending ? Infinity : performance.now() + 1500;
      expected.push(...events.map(event => ({ ...event, id, until })));
      return id;
    },
    clearInput() { expected.length = 0; },
    finishInput(id, dispatched) {
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].id === id) {
        if (dispatched) expected[i].until = performance.now() + 1500;
        else expected.splice(i, 1);
      }
    },
    dispose() {
      disposed = true; wake();
      for (const type of inputEvents) window.removeEventListener(type, activity, true);
      permission?.resolve(false); permission = null;
      removeSiteApi?.(); features.dispose(); requests.dispose(); controls.dispose();
      runtime.dispose(); listeners.clear(); messages.length = 0; expected.length = 0;
      delete globalThis.__opencuAnnotations;
    },
  };
  globalThis.__opencuAnnotations = bridge;
  return true;
}
