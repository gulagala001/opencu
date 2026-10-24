import { mountBrowserCommentRuntime, createAnnotationControls, createAnnotationRequests, observeAnnotationFeatures, installSiteAnnotationApi } from './rea-page-runtime.js';

// This module runs in the browser guest; it exposes annotation data, never host APIs.
export function install(initialState) {
  globalThis.__opencuAnnotations?.dispose();
  const messages = [], listeners = new Set(), expected = [], waiters = new Set();
  const wake = () => { for (const resolve of [...waiters]) resolve(); };
  const enqueue = message => { messages.push(message); wake(); };
  const checkable = target => {
    const control = target?.closest?.('label')?.control ?? target;
    return control?.tagName === 'INPUT' && ['checkbox', 'radio'].includes(control.type) ? control : null;
  };
  let lastActivity = 0, textInput;
  const cancelTextInput = () => {
    textInput = undefined;
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].textInput || expected[i].keyboardInput) expected.splice(i, 1);
  };
  const editTarget = target => {
    if (target?.isContentEditable) while (target.parentElement?.isContentEditable) target = target.parentElement;
    return target;
  };
  const textInputTarget = () => {
    let target = document.activeElement;
    while (target?.shadowRoot?.activeElement) target = target.shadowRoot.activeElement;
    target = editTarget(target);
    // Closed shadow editors expose their focused host to this event listener.
    // Bind that observable target; the exact beforeinput still proves the edit.
    return target?.nodeType === 1 ? target : null;
  };
  // Native value controls emit plain input Events rather than text InputEvents.
  // Bind only controls selected by this confirmed physical key; radio navigation
  // may move to another enabled member of the same tree/form/name group.
  const keyboardControlInput = (control,event,inputTypes = []) => {
    if (!control || control.isConnected === false || control.matches?.(':disabled')) return {targets:[],inputTypes:[]};
    const code = event.code ?? '', navigation = /^(?:Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Space|Enter|NumpadEnter)$/u.test(code);
    const textKey = inputTypes.includes('insertText');
    if (control.tagName === 'SELECT') {
      const selectAll = control.multiple && code === 'KeyA' && (event.ctrlKey || event.metaKey);
      return {targets:navigation || textKey || selectAll ? [control] : [],inputTypes:[null]};
    }
    if (control.tagName !== 'INPUT') return;
    const type = control.type;
    if (type === 'radio' && /^Arrow(?:Up|Down|Left|Right)$/u.test(code)) {
      const root = control.getRootNode?.();
      const targets = !control.name || !root?.querySelectorAll ? [control] : [...root.querySelectorAll('input[type="radio"]')].filter(candidate =>
        candidate.type === 'radio' && candidate.name === control.name && candidate.form === control.form &&
        candidate.getRootNode() === root && candidate.isConnected !== false && !candidate.matches(':disabled'));
      return {targets,inputTypes:[null]};
    }
    const nativeTypes = ['range','number','date','datetime-local','month','time','week'];
    if (!nativeTypes.includes(type)) return;
    const changesValue = type === 'range' ? navigation : type === 'number' ? /^(?:ArrowUp|ArrowDown)$/u.test(code) || inputTypes.length > 0 : navigation || inputTypes.length > 0;
    // Native steppers may pair text beforeinput with a plain input Event.
    return {targets:changesValue ? [control] : [],inputTypes:[...inputTypes,...(type !== 'range' && navigation ? ['insertText'] : []),null]};
  };

  const activity = event => {
    if (!event.isTrusted) return;
    const now = performance.now(), target = event.composedPath?.()[0] ?? event.target;
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].until < now) expected.splice(i, 1);
    if (event.type === 'beforeinput') {
      const input = expected.find(input => input.target === editTarget(target) && (
        input.textInput && input.inputType === event.inputType && input.data === event.data ||
        input.keyboardInput && input.inputTypes.includes(event.inputType)));
      // Every new edit starts a new transaction. An unmatched user beforeinput
      // must never inherit the previous native insertText's remaining events.
      cancelTextInput();
      if (input) {
        textInput = {...input,inputType:event.inputType};
        const active = textInput;
        // Chromium emits several input events for one multiline contenteditable
        // edit. They share this native task, even with microtasks between them.
        setTimeout(() => { if (textInput === active) textInput = undefined; }, 0);
      }
      return;
    }
    if (event.type === 'pointerdown' || event.type === 'keydown' || event.type === 'wheel') cancelTextInput();
    if (event.type === 'input' && textInput) {
      if (textInput.target === editTarget(target) && (textInput.inputType === event.inputType || textInput.controlInput && textInput.inputTypes.includes(event.inputType ?? null))) {if (textInput.controlInput) textInput = undefined;return;}
      cancelTextInput();
    }
    const index = expected.findIndex(input => input.type === event.type &&
      (input.target == null || input.target === target) &&
      (input.key == null || input.key === event.key || input.key === event.code) &&
      (input.type !== 'input' || input.inputTypes === undefined || input.inputTypes.includes(event.inputType ?? null)) &&
      (input.x == null || Math.abs(input.x - event.clientX) < 2 && Math.abs(input.y - event.clientY) < 2) &&
      (input.deltaY == null || Math.abs(input.deltaX - event.deltaX) < 1 && Math.abs(input.deltaY - event.deltaY) < 1));
    if (index !== -1) {
      const [input] = expected.splice(index, 1);
      if (event.type === 'keydown') {
        const editor = textInputTarget();
        const native = keyboardControlInput(editor,event,input.inputTypes);
        if (native) {
          for (const target of native.targets) expected.push({type:'input',target,id:input.id,keyboardInput:true,controlInput:true,inputTypes:native.inputTypes,until:input.until});
        } else if (input.inputTypes?.length && checkable(editor)) {
          // Space activation completes on keyup; the existing click transaction
          // owns only that control's later default input, never arbitrary text.
          if ([' ','Enter'].includes(event.key)) expected.push({type:'click',target:editor,until:input.until});
        } else if (editor && input.inputTypes?.length) expected.push({type:'input',target:editor,id:input.id,keyboardInput:true,
          inputTypes:input.inputTypes,until:input.until});
      } else if (event.type === 'pointerdown' && event.button === 0) {
        const control = checkable(target);
        if (control) expected.push({type:'click', target:control, id:input.id, until:input.until});
      } else if (event.type === 'click') {
        // Checkbox/radio default activation emits trusted input after click, including labels.
        const marker = {type:'input', target, id:input.id, until:input.until};
        expected.push(marker);
        setTimeout(() => { const index = expected.indexOf(marker); if (index !== -1) expected.splice(index, 1); }, 0);
      }
      return;
    }
    if (event.type === 'click') return;
    if (event.type === 'pointerdown' || event.type === 'keydown') {
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].type === 'click') expected.splice(i, 1);
    }
    if (now - lastActivity < 250) return;
    lastActivity = now;
    enqueue({ type: 'opencu-user-activity', kind: event.type });
  };
  const inputEvents = ['pointerdown', 'keydown', 'wheel', 'beforeinput', 'input', 'click'];
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
    expectTextInput(text) {
      const target = textInputTarget();
      if (!target || typeof text !== 'string') return;
      const id = crypto.randomUUID();
      expected.push({type:'beforeinput',inputType:'insertText',data:text,target,textInput:true,id,until:performance.now()+1500});
      return id;
    },
    clearInput() { expected.length = 0; textInput = undefined; },
    finishInput(id, dispatched) {
      if (textInput?.id === id) textInput = undefined;
      for (let i = expected.length - 1; i >= 0; i--) if (expected[i].id === id) {
        if (dispatched && !expected[i].textInput && !expected[i].keyboardInput && expected[i].type !== 'keydown') expected[i].until = performance.now() + 1500;
        else expected.splice(i, 1);
      }
    },
    dispose() {
      disposed = true; wake();
      for (const type of inputEvents) window.removeEventListener(type, activity, true);
      permission?.resolve(false); permission = null;
      removeSiteApi?.(); features.dispose(); requests.dispose(); controls.dispose();
      runtime.dispose(); listeners.clear(); messages.length = 0; expected.length = 0; textInput = undefined;
      delete globalThis.__opencuAnnotations;
    },
  };
  globalThis.__opencuAnnotations = bridge;
  return true;
}
