import { createFrameInputMonitoring } from './frame-input-monitor.mjs';
let pageSource;
/** The page runtime is large and only needed once a page is annotated; fetch it on first install. */
const loadPageSource = () => pageSource ??= fetch(new URL('/api/opencu/page-annotations.js', document.baseURI))
  .then(response => { if (!response.ok) throw new Error(`OpenCU annotations unavailable: HTTP ${response.status}`); return response.text(); })
  .catch(error => { pageSource = undefined; throw error; });

/** Owns the REA page runtime and editor data for one real guest occurrence. */
export function createAnnotationHost({ element, capture, ids, target, state, changed, deliver, settings, saveImage, intl, userActivity, inputMonitor }) {
  const key = `opencu:annotations:${ids.conversationId}:${ids.browserTabId}`;
  const siteKey = () => `opencu:site-annotations:${new URL(element.getURL()).origin}`;
  const readComments = () => JSON.parse(localStorage.getItem(key) || '[]').map(comment =>
    comment.designChange && (!comment.status || comment.status === 'pending')
      ? { ...comment, designChange: { ...comment.designChange, status: 'queued' } } : comment);
  let editor = null, timer, disposed = false, generation = 0, enabled = false, sending, saving;
  const monitoring = inputMonitor ? createFrameInputMonitoring({ invoke: inputMonitor, userActivity, changed }) : undefined;
  const drafts = JSON.parse(localStorage.getItem(key + ':drafts') || '{}');
  const draftKey = anchor => JSON.stringify([anchor?.pageUrl, anchor?.kind, anchor?.framePath, anchor?.selector,
    anchor?.selector ? null : anchor?.elementPath, anchor?.textLocator, anchor?.kind === 'region' ? anchor.rect : null]);
  const pending = () => readComments().filter(comment => (!comment.status || comment.status === 'pending') && comment.anchor?.pageUrl === element.getURL());
  const listeners = new Set();
  const publish = () => { for (const listener of listeners) listener(); };
  const persist = comments => localStorage.setItem(key, JSON.stringify(comments));
  const dispatch = message => element.executeJavaScript(`globalThis.__opencuAnnotations?.dispatch(${JSON.stringify(message)})`);
  const snapshot = () => ({ ...state(), comments: pending(), canUseTweaks: true, canUseAnnotationMultiSelect: true,
    canUseSiteAnnotationApi: true, siteAnnotationFeaturesEnabled: state().siteAnnotationFeaturesEnabled !== false,
    areAnnotationMarkersVisible: state().annotationMarkersVisible !== false,
    intlConfig: intl(), nativeInputMonitoring: !!monitoring });
  async function sync(patch = {}) {
    changed({ ...patch, comments: pending() });
    if (enabled) await dispatch({ type: 'browser-sidebar-runtime-sync', ...snapshot() });
  }
  async function close() {
    editor = null; publish();
    await dispatch({ type: 'browser-sidebar-runtime-close-editor' });
    await sync({ isTweaksEditorOpen: false, activeDesignChange: null });
  }
  async function receive(message) {
    switch (message.type) {
      case 'opencu-user-activity': await userActivity(message.kind); break;
      case 'opencu-site-annotation-features':
        changed({ siteAnnotationFeatures: message.features, siteToolsAvailability: { ...state().siteToolsAvailability,
          annotations: message.features.length ? 'available' : 'unavailable' } }); break;
      case 'browser-sidebar-runtime-request-annotation-permission':
        changed({ siteAnnotationPermissionRequest: { id: message.requestId, hostname: new URL(element.getURL()).hostname, requestedInteractionMode: message.interactionMode } }); break;
      case 'browser-sidebar-runtime-toggle-annotation-mode':
        await sync({ interactionMode: message.interactionMode }); break;
      case 'browser-sidebar-runtime-open-editor':
      case 'browser-sidebar-runtime-open-design-editor':
      case 'browser-sidebar-runtime-open-comment-preview': {
        const target = message.target ?? (message.commentId ? { mode: 'edit', commentId: message.commentId } : { mode: 'design', groupId: message.designEditorState?.id });
        const saved = readComments().find(comment => comment.id === target.commentId);
        editor = { ...ids, sessionId: crypto.randomUUID(), surfaceMode: message.type.endsWith('open-comment-preview') ? 'preview' : 'editor',
          body: saved?.body ?? (typeof message.initialComment === 'string' ? message.initialComment : ''), attachedImages: saved?.attachedImages ?? [], designChange: saved?.designChange ?? null,
          target, anchorState: message.anchorState, designEditorState: message.designEditorState ?? null,
          draftBody: drafts[draftKey(message.anchorState?.anchor)], pageUrl: element.getURL(), pageGeneration: generation,
          defaultCreateSubmitMode: state().annotationCreateSubmitMode ?? 'saved',
          pageInitialComment: typeof message.initialComment === 'string' ? { text: message.initialComment, shouldReveal: true } : message.initialComment,
          pageRequestedDesignEditor: message.openTweaks === true || message.pageRequestedDesignEditor === true,
          siteAnnotationFeaturesEnabled: state().siteAnnotationFeaturesEnabled !== false, annotationEditorDefault: message.annotationEditorDefault };
        if (message.enterAnnotationMode) await sync({ interactionMode: 'comment' });
        publish(); break;
      }
      case 'browser-sidebar-runtime-update-anchor':
        if (editor) { editor = { ...editor, anchorState: message.anchorState }; publish(); } break;
      case 'browser-sidebar-runtime-cancel-editor':
      case 'browser-sidebar-runtime-close-comment-preview': await close(); break;
      case 'browser-sidebar-runtime-exit-comment-mode': await close(); await sync({ interactionMode: 'browse' }); break;
      case 'browser-sidebar-runtime-annotation-suspension': await sync({ isAnnotationSuspended: message.suspended }); break;
      case 'browser-sidebar-runtime-design-modifier-state': await sync({ isDesignModifierPressed: message.pressed }); break;
      case 'browser-sidebar-runtime-annotation-selection-modifier-state': await sync({ isAnnotationAddModifierPressed: message.pressed }); break;
      case 'browser-sidebar-runtime-annotation-selection-hover-state':
        await dispatch(message); break;
      case 'browser-sidebar-runtime-focus-editor':
        if (editor) { editor = { ...editor, focusRevision: (editor.focusRevision ?? 0) + 1 }; publish(); } break;
      default: console.debug('OpenCU page annotation event', message.type);
    }
  }
  async function drain(epoch) {
    if (disposed || epoch !== generation) return;
    try {
      const messages = await element.executeJavaScript('globalThis.__opencuAnnotations?.drain(true) ?? []');
      if (disposed || epoch !== generation) return;
      for (const message of messages) {
        if (disposed || epoch !== generation) return;
        await receive(message);
      }
    } catch (error) {
      if (epoch === generation && !disposed) console.error('OpenCU annotation runtime', error);
    }
    if (!disposed && epoch === generation) timer = setTimeout(() => void drain(epoch), 80);
  }
  function invalidate() {
    generation++; clearTimeout(timer); monitoring?.invalidate();
    if (enabled && !element.isCrashed?.()) void element.executeJavaScript('globalThis.__opencuAnnotations?.cancelWait()').catch(() => {});
    enabled = false;
    editor = null; publish();
    changed({ siteAnnotationPermissionRequest: null, siteAnnotationFeatures: [], comments: [], activeDesignChange: null, isTweaksEditorOpen: false });
  }
  async function install() {
    invalidate();
    const epoch = generation;
    const choice = JSON.parse(localStorage.getItem(siteKey()) || 'null');
    changed({ siteAnnotationPermissionGranted: choice === true, siteAnnotationFeaturesEnabled: choice !== false, comments: pending(),
      siteAnnotationPermissionRequest: null, siteAnnotationFeatures: [], siteToolsAvailability: { ...state().siteToolsAvailability, annotations: 'unavailable' } });
    const source = await loadPageSource();
    if (disposed || epoch !== generation) return;
    await element.executeJavaScript(`${source}\nOpenCUPageAnnotations.install(${JSON.stringify(snapshot())});`);
    if (disposed || epoch !== generation) return;
    enabled = true; void drain(epoch);
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => editor,
    focus() { if (editor) { editor = { ...editor, focusRevision: (editor.focusRevision ?? 0) + 1 }; publish(); } },
    install, invalidate, sync, dispatch, close,
    setInputMonitoring: enabled => monitoring?.setEnabled(enabled),
    ensureInputMonitoring: () => monitoring?.ensure(),
    async annotateAt(point, flow, selectedText) {
      await sync({ interactionMode: 'comment', annotationCreateSubmitMode: flow === 'quick' ? 'direct' : 'saved' });
      await dispatch(selectedText
        ? { type: 'browser-sidebar-runtime-create-comment-from-selection', fallbackViewportPoint: point }
        : { type: 'browser-sidebar-runtime-create-comment-at-point', viewportPoint: point });
    },
    async allowSite(allowed) {
      localStorage.setItem(siteKey(), JSON.stringify(allowed));
      await sync({ siteAnnotationPermissionGranted: allowed, siteAnnotationFeaturesEnabled: allowed });
    },
    async save(value, directly = false) {
      if (saving) return saving;
      if (!editor) throw new Error('The annotation editor is no longer open');
      const current = editor, id = current.target.commentId ?? crypto.randomUUID();
      const expectCurrent = () => {
        if (disposed || generation !== current.pageGeneration || element.getURL() !== current.pageUrl || editor?.sessionId !== current.sessionId) throw new Error('The annotation page changed; reopen the original selection before saving');
      };
      saving = (async () => {
        expectCurrent();
        const anchors = [current.anchorState.anchor, ...current.anchorState.additionalAnchors ?? []];
        const mode = (await settings.readAll()).values['browser-annotation-screenshots-mode'];
        expectCurrent();
        let screenshot;
        if (mode !== 'necessary' || anchors.some(anchor => anchor?.kind === 'region')) {
          const captured = await capture(); expectCurrent();
          const dataURL = captured.toDataURL();
          screenshot = await saveImage({ mediaType: 'image/png', data: dataURL.slice(dataURL.indexOf(',') + 1), name: `annotation-${id}.png` });
          expectCurrent();
        }
        const designChange = value.designChange === undefined ? current.designChange : value.designChange;
        const comment = { id, ...ids, ...current.anchorState, screenshot,
          markerViewportPoint: current.anchorState.viewportPoint, markerViewportSize: current.anchorState.viewportSize,
          body: value.body, attachedImages: value.attachedImages ?? current.attachedImages,
          designChange: designChange ? { ...designChange, status: 'queued' } : null, status: 'pending', createdAt: new Date().toISOString() };
        persist([...readComments().filter(item => item.id !== id), comment]);
        delete drafts[draftKey(current.anchorState.anchor)];
        localStorage.setItem(key + ':drafts', JSON.stringify(drafts));
        await close(); await sync();
        if (directly) await this.send([comment], true);
      })();
      try { return await saving; } finally { saving = undefined; }
    },
    async remove() {
      persist(readComments().filter(comment => comment.id !== editor?.target.commentId));
      await close(); await sync();
    },
    async design(change) { await sync({ activeDesignChange: change }); },
    body(value) {
      if (!editor) return;
      editor.draftBody = value;
      drafts[draftKey(editor.anchorState.anchor)] = value;
      localStorage.setItem(key + ':drafts', JSON.stringify(drafts));
    },
    async clear() {
      const selected = new Set(pending().map(comment => comment.id));
      persist(readComments().filter(comment => !selected.has(comment.id))); await close(); await sync();
    },
    async send(items = pending(), directly = false) {
      if (sending) return sending;
      if (!items.length) return;
      const pageUrl = element.getURL(), epoch = generation, activeEditor = editor?.sessionId;
      if (items.some(comment => comment.anchor?.pageUrl !== pageUrl)) throw new Error('Return to the annotated page before sending its comments');
      sending = (async () => {
        await deliver({ ...ids, target: target(), comments: items, directly, url: pageUrl, title: element.getTitle() });
        const sent = new Map(items.map(item => [item.id, JSON.stringify(item)]));
        persist(readComments().map(item => sent.get(item.id) === JSON.stringify(item)
          ? { ...item, status: directly ? 'sent' : 'draft' } : item));
        if (!disposed && epoch === generation) {
          if (editor?.sessionId === activeEditor) await close();
          await sync();
        }
      })();
      try { await sending; } finally { sending = undefined; }
    },
    async dispose() {
      disposed = true; generation++; clearTimeout(timer); listeners.clear();
      await monitoring?.dispose();
      if (enabled && !element.isCrashed?.()) await element.executeJavaScript('globalThis.__opencuAnnotations?.dispose()');
    },
  };
}
