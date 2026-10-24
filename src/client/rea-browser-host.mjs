import * as Shared from './rea/app-shared-2f2228189a8d.js';
import * as Initial from './rea/app-initial-c468e3fd7f91.js';
import { jl } from './rea/tab-content-6a1dfa5c5ac1.js';
import { createAnnotationHost } from './annotation-host.mjs';
import { reaIntl } from './rea-locale.mjs';
import { createExtensionsHost } from './extensions-host.mjs';
import { createCaptureCompositor } from './capture-compositor.mjs';
import { siteToolsPolicyKey, siteToolsAllowed } from '../site-tools-policy.mjs';

// Only errors from an attempted page load can leave the guest ready on its real
// Chromium error document. Adapter, permission and registration failures remain fatal.
const pageNavigationCode = error => `${error?.code ?? ''} ${error?.message ?? ''}`
  .match(/\bERR_(?:CONNECTION_[A-Z_]+|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|ADDRESS_(?:UNREACHABLE|INVALID)|NETWORK_CHANGED|TIMED_OUT|EMPTY_RESPONSE|HTTP_RESPONSE_CODE_FAILURE|SSL_[A-Z_]+|CERT_[A-Z_]+|ABORTED)\b/u)?.[0];
const sameNavigationURL = (left, right) => {
  if (left === right) return true;
  try { return new URL(left).href === new URL(right).href; } catch { return false; }
};

/** Translates REA's browser service into DSH's approved Electron guest leases. */
export function createReaBrowserHost({ desktop, transport, client, sidebar, openSession, settings, history, downloads, deliverAnnotations, deliverScreenshot, createExtensionTab, focusSurface, openExternal, isPagePresented }) {
  const editorListeners = new Set(), pageListeners = new Set(), retainedPages = new Map(), cursorMoves = new Map(), viewportWaits = new Map();
  let pageSnapshot = [], cursorSequence = 0;
  function finishCursor(sequence, error) {
    const pending = cursorMoves.get(sequence);
    if (!pending) return;
    cursorMoves.delete(sequence); clearTimeout(pending.timer);
    error ? pending.reject(error) : pending.resolve();
  }
  function moveCursor(record, state) {
    if (!state.visible || !record.presented) {
      for (const [sequence, pending] of cursorMoves) if (pending.record === record) finishCursor(sequence);
      Initial.AW.setBrowserUseCursorState(record.ids.conversationId, record.ids.browserTabId, state);
      return;
    }
    const sequence = ++cursorSequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finishCursor(sequence, new Error('The browser cursor did not acknowledge arrival')), 2000);
      cursorMoves.set(sequence, { record, resolve, reject, timer });
      Initial.AW.setBrowserUseCursorState(record.ids.conversationId, record.ids.browserTabId, { ...state, moveSequence: sequence });
    });
  }
  const publishPages = () => {
    pageSnapshot = [...retainedPages.values()].map(({ key, conversationId, browserTabId }) => ({ key, conversationId, browserTabId }));
    for (const listener of pageListeners) listener();
  };
  const pages = { getSnapshot: () => pageSnapshot, subscribe(listener) { pageListeners.add(listener); return () => pageListeners.delete(listener); } };
  const registrations = new Map(), rendererSessions = new Set(), annotationState = new Map(), pendingGuests = new Map(), restoreTargets = new Map(), initialNavigations = new Map();
  const restorationDisposers = [];
  let disposed = false;
  let savedTabs = {};
  try { savedTabs = JSON.parse(localStorage.getItem('opencu:browser-tabs') || '{}') || {}; }
  catch (error) { console.error('OpenCU browser tab restore', error); }
  const savedTab = key => {
    try { return JSON.parse(localStorage.getItem('opencu:browser-tab:' + key) || 'null') ?? savedTabs[key]; }
    catch (error) { console.error('OpenCU browser tab restore', error); return savedTabs[key]; }
  };
  const persist = (key, patch) => {
    const next = { ...savedTab(key), ...patch };
    // Each child renderer owns its tab; a shared snapshot can erase another child's writes.
    localStorage.setItem('opencu:browser-tab:' + key, JSON.stringify(next));
    savedTabs[key] = next;
  };
  transport.setTabOwner(async ({ sessionId = sidebar.mounted.getSnapshot(), url = 'about:blank' }) => {
    if (!sessionId) throw new Error('No conversation is available for the browser tab');
    const previous = new Set(sidebar.tabsIn(sessionId).map(tab => tab.id));
    sidebar.openTabIn(sessionId, 'browser', { params: { url }, revealIfOpened: false, active: false });
    const tab = sidebar.tabsIn(sessionId).find(tab => tab.kind === 'browser' && !previous.has(tab.id));
    if (!tab) throw new Error('The conversation is not attached to this sidebar');
    retainPage(sessionId, tab.id, sidebar.tabDomain.occurrence(sessionId, tab).signal, url);
    await waitForGuest({ conversationId: sessionId, browserTabId: tab.id });
    return { sessionId, tabId: tab.id };
  }, async ({ sessionId, tabId }) => {
    await service.disposeTab(sessionId, tabId);
    await sidebar.closeIn(sessionId, tabId);
  });
  function waitForGuest(args) {
    if (disposed) return Promise.reject(new Error('OpenCU browser host closed'));
    const key = keyFor(args.conversationId, args.browserTabId), existing = registrations.get(key);
    if (existing) return existing.ready.then(() => existing);
    let pending = pendingGuests.get(key);
    if (!pending) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const timer = setTimeout(() => { pendingGuests.delete(key); reject(new Error('The browser guest did not become ready')); }, 15000);
      pending = { promise, resolve: record => { clearTimeout(timer); pendingGuests.delete(key); resolve(record); }, reject: error => { clearTimeout(timer); pendingGuests.delete(key); reject(error); } };
      pendingGuests.set(key, pending);
    }
    return pending.promise;
  }
  const keyFor = (conversationId, browserTabId) => `${conversationId}\0${browserTabId}`;
  const emit = (type, value) => Shared.Ff.dispatchHostMessage({ type, ...value });
  function retainPage(conversationId, browserTabId, signal, initialUrl, initialNavigation) {
    const key = keyFor(conversationId, browserTabId);
    if (retainedPages.has(key)) return;
    if (initialNavigation !== undefined) initialNavigations.set(key, initialNavigation);
    const url = initialNavigation?.entries[initialNavigation.index]?.url || savedTab(key)?.url || initialUrl || 'about:blank';
    if (!registrations.has(key)) {
      restoreTargets.set(key, url);
      emit('browser-sidebar-state', { conversationId, browserTabId,
        snapshot: { ...jl, tabType: 'web', url, title: savedTab(key)?.title ?? '', isLoading: true } });
    }
    const close = () => {
      retainedPages.delete(key); restoreTargets.delete(key); initialNavigations.delete(key); publishPages();
      void service.disposeTab(conversationId, browserTabId).catch(error => console.error('OpenCU tab close', error));
    };
    signal.addEventListener('abort', close, { once: true });
    retainedPages.set(key, { key, conversationId, browserTabId, cleanup: () => signal.removeEventListener('abort', close) });
    publishPages();
  }
  async function focusPage(conversationId, browserTabId) {
    if (focusSurface) return focusSurface(conversationId, browserTabId);
    if (sidebar.mounted.getSnapshot() !== conversationId) {
      await new Promise((resolve, reject) => {
        let unsubscribe;
        const finish = error => { clearTimeout(timer); unsubscribe?.(); error ? reject(error) : resolve(); };
        const check = () => { if (sidebar.mounted.getSnapshot() === conversationId) finish(); };
        const timer = setTimeout(() => finish(new Error('The target conversation did not open')), 15000);
        unsubscribe = sidebar.mounted.subscribe(check);
        try { Promise.resolve(openSession(conversationId)).then(check, finish); } catch (error) { finish(error); }
      });
    }
    if (!sidebar.isExpanded()) sidebar.toggleExpanded();
    sidebar.focus(browserTabId);
    const record = await waitForGuest({ conversationId, browserTabId });
    record.element.focus();
    return { placement: 'sidebar' };
  }
  const get = args => {
    const record = registrations.get(keyFor(args.conversationId, args.browserTabId));
    if (!record) throw new Error('REA browser guest is not registered');
    return record;
  };
  const update = record => {
    const element = record.element;
    let metadata;
    try {
      const url = record.state.navigationError?.url || element.getURL();
      metadata = { ...jl, ...record.state, tabType: url === 'about:blank' || url.startsWith('about:blank#') ? 'new-tab-page' : 'web', url, committedUrl: url,
        title: savedTab(keyFor(record.ids.conversationId, record.ids.browserTabId))?.customTitle || element.getTitle(),
        isLoading: record.state.navigationError ? false : element.isLoading(), canGoBack: element.canGoBack(), canGoForward: element.canGoForward(), zoomPercent: Math.round(element.getZoomFactor() * 100),
        isAudioMuted: element.isAudioMuted(), isAudible: element.isCurrentlyAudible() };
    } catch { return; /* Guest has not reached dom-ready. */ }
    record.state = metadata;
    if (metadata.tabType === 'web' && !metadata.isLoading && !metadata.navigationError) {
      const key = keyFor(record.ids.conversationId, record.ids.browserTabId);
      try { persist(key, { url: metadata.url, title: metadata.title }); }
      catch (error) { console.error('OpenCU browser tab restore', error); }
      const signature = `${metadata.url}\0${metadata.title}`;
      if (/^https?:/.test(metadata.url) && record.historySignature !== signature) {
        const visit = record.historyVisit?.url === metadata.url ? record.historyVisit : { url: metadata.url };
        record.historySignature = signature; record.historyVisit = visit;
        const isActorVisit = client.getSnapshot().sessions.some(session => session.sessionId === record.ids.conversationId && session.targets.some(target =>
          target.sidebarTabId === record.ids.browserTabId && session.running.some(activity => activity.targetId === target.id)));
        record.historyWrite = (record.historyWrite ?? Promise.resolve()).catch(() => undefined).then(async () => {
          const entry = await history.record({ id: visit.id, url: metadata.url, title: metadata.title, isActorVisit });
          visit.id = entry.id;
        }).catch(error => {
          if (record.historyVisit === visit && record.historySignature === signature) record.historySignature = null;
          console.error('OpenCU browser history', error);
        });
      }
    }
    emit('browser-sidebar-state', { ...record.ids, snapshot: metadata });
  };
  async function inspectSiteTools(record) {
    if (!desktop?.automation) throw new Error('This DSH host needs the OpenCU site tools adapter');
    const policy = (await settings.readAll()).values[siteToolsPolicyKey];
    if (!siteToolsAllowed(policy, record.element.getURL())) {
      record.state = { ...record.state, webMcpTools: [], siteToolsAvailability: { ...record.state.siteToolsAvailability, webMcp: 'unavailable' } };
      update(record);
      return { tools: [] };
    }
    if (record.siteToolsPending) return record.siteToolsPending;
    const generation = record.siteToolsGeneration ?? 0;
    record.siteToolsPending = desktop.automation(record.lease.lease, 'siteTools', {}).then(result => {
      if (registrations.get(keyFor(record.ids.conversationId, record.ids.browserTabId)) !== record || generation !== (record.siteToolsGeneration ?? 0)) throw new Error('The site tools page changed');
      if (!Array.isArray(result.tools)) throw new Error('The site tools host returned invalid descriptors');
      const tools = result.tools.filter(tool => siteToolsAllowed(policy, tool.origin));
      const signature = JSON.stringify(tools);
      record.state = { ...record.state, webMcpTools: tools,
        webMcpToolsRevision: (record.state.webMcpToolsRevision ?? 0) + (signature !== record.siteToolsSignature ? 1 : 0),
        siteToolsAvailability: { ...record.state.siteToolsAvailability, webMcp: tools.length ? 'available' : 'unavailable' } };
      record.siteToolsSignature = signature; update(record);
      return { ...result, tools };
    }).finally(() => { record.siteToolsPending = null; });
    return record.siteToolsPending;
  }
  async function command(args) {
    const action = args.command, key = keyFor(args.conversationId, args.browserTabId);
    if (action.type === 'set-design-modifier-pressed') {
      const state = { ...annotationState.get(key), isDesignModifierPressed: action.pressed };
      annotationState.set(key, state);
      const record = registrations.get(key);
      if (record) await record.annotations.sync(state);
      return;
    }
    if (action.type === 'navigate' && !registrations.has(key)) {
      const ready = waitForGuest(args);
      emit('browser-sidebar-state', { conversationId: args.conversationId, browserTabId: args.browserTabId,
        snapshot: { ...jl, ...annotationState.get(key), tabType: 'web', url: action.url, isLoading: true } });
      await ready;
    }
    const record = await waitForGuest(args), element = record.element;
    switch (action.type) {
      case 'set-interaction-mode': await record.annotations.sync({ interactionMode: action.interactionMode }); break;
      case 'set-original-view-enabled': await record.annotations.sync({ isOriginalViewEnabled: action.enabled }); break;
      case 'clear-comments': case 'discard-pending-annotations': await record.annotations.clear(); break;
      case 'add-annotations-to-composer':
        await record.annotations.send(); await record.annotations.sync({ interactionMode: 'browse' }); break;
      case 'refresh-cursor': element.sendInputEvent({ type: 'mouseMove', x: 0, y: 0 }); break;
      case 'navigate': await element.loadURL(action.url); break;
      case 'go-back': element.goBack(); break;
      case 'go-forward': element.goForward(); break;
      case 'reload': element.reload(); break;
      case 'stop-loading': element.stop(); break;
      case 'focus': element.focus(); break;
      case 'close-tab': await sidebar.closeIn(args.conversationId, args.browserTabId); break;
      case 'capture-screenshot': {
        try {
          const image = await record.capture(), response = await fetch(image.toDataURL());
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': await response.blob() })]);
          emit('browser-sidebar-screenshot-copied', record.ids);
        } catch (error) { emit('browser-sidebar-screenshot-copy-failed', record.ids); throw error; }
        break;
      }
      case 'set-zoom-percent':
        if (!Number.isFinite(action.zoomPercent) || action.zoomPercent < 25 || action.zoomPercent > 500) throw new Error('Page zoom must be between 25% and 500%');
        element.setZoomFactor(action.zoomPercent / 100); break;
      case 'reset-zoom': element.setZoomFactor(1); break;
      case 'step-zoom': element.setZoomFactor(Math.min(5, Math.max(.25, element.getZoomFactor() + (action.direction === 'out' || action.delta < 0 ? -.1 : .1)))); break;
      case 'print': await element.print(); break;
      case 'set-find-query':
        record.findQuery = action.query; record.findRequestId = null;
        if (action.query.trim()) record.findRequestId = element.findInPage(action.query, { findNext: false });
        else { element.stopFindInPage('clearSelection'); emit('browser-sidebar-find-state', { ...record.ids, state: { query: action.query, matches: 0, activeMatchOrdinal: 0 } }); }
        break;
      case 'find-next':
      case 'find-previous':
        if (record.findQuery?.trim()) {
          record.findRequestId = null;
          record.findRequestId = element.findInPage(record.findQuery, { forward: action.type === 'find-next', findNext: true });
        }
        break;
      case 'close-find':
        record.findQuery = ''; record.findRequestId = null; element.stopFindInPage('clearSelection');
        emit('browser-sidebar-find-state', { ...record.ids, state: { query: '', matches: 0, activeMatchOrdinal: 0 } });
        break;
      default: throw Object.assign(new Error(`Browser command is not connected: ${action.type}`), { code: 'UNSUPPORTED_BROWSER_COMMAND' });
    }
    update(record);
  }
  async function releaseRecord(key, record) {
    if (registrations.get(key) === record) registrations.delete(key);
    for (const [sequence, pending] of cursorMoves) if (pending.record === record) finishCursor(sequence, Object.assign(new Error('The browser guest is closing'), { code: 'CONTROL_STOPPED' }));
    const results = [];
    for (const cleanup of record.cleanup) {
      try { await cleanup(); } catch (reason) { results.push({ status: 'rejected', reason }); }
    }
    if (Initial.AW.pages.getHost(record.ids.conversationId, record.ids.browserTabId) === record.host) {
      Initial.AW.pages.disposeHost(record.ids.conversationId, record.ids.browserTabId, 'closed');
      Initial.AW.removeTab(record.ids.conversationId, record.ids.browserTabId);
    } else record.host.dispose();
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'OpenCU guest cleanup failed');
  }
  async function openLink(message) {
    const url = new URL(message.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported browser URL');
    const preferences = (await settings.readAll()).values;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
    const destination = message.openTarget ?? preferences[local ? 'open-local-url-in-target-preference' : 'open-link-in-target-preference'];
    if (message.useExternalBrowser || destination === 'external-browser') {
      if (openExternal) await openExternal(url.href); else window.open(url.href, '_blank', 'noopener,noreferrer');
    }
    else {
      const conversationId = message.conversationId ?? sidebar.mounted.getSnapshot();
      if (!conversationId) throw new Error('Open a conversation before opening its browser');
      sidebar.openTabIn(conversationId, 'browser', { params: { url: url.href }, revealIfOpened: false });
    }
  }
  const onMessage = event => {
    const message = event.detail;
    if (message?.type === 'browser-use-cursor-arrived') {
      const pending = cursorMoves.get(message.moveSequence);
      if (pending?.record.ids.conversationId === message.conversationId) finishCursor(message.moveSequence);
      return;
    }
    if (message?.type === 'open-in-browser') { void openLink(message).catch(error => { console.error('OpenCU open link', error); Shared.WFt().danger(error.message); }); return; }
    if (message?.type !== 'browser-sidebar-command') return;
    void command(message).catch(error => {
      console.error('OpenCU browser command', error);
      if (message.command.type !== 'capture-screenshot') emit('browser-sidebar-command-error', { conversationId: message.conversationId, browserTabId: message.browserTabId, error: { message: error.message, code: error.code } });
    });
  };
  window.addEventListener('codex-message-from-view', onMessage);
  const syncActivity = () => {
    const { sessions, connected } = client.getSnapshot();
    for (const record of registrations.values()) {
      const target = sessions.flatMap(session => session.targets).find(item => item.provider === 'dsh' &&
        item.identity?.rendererId === transport.rendererId && item.sidebarTabId === record.ids.browserTabId && item.sessionId === record.ids.conversationId);
      record.annotations?.setInputMonitoring(connected && !!target);
      const active = connected && !!target && sessions.some(session => session.running.some(item => item.targetId === target.id));
      Initial.AW.setBrowserUseActive(record.ids.conversationId, record.ids.browserTabId, active);
      const siteCall = connected && target ? sessions.flatMap(session => session.running).find(item => item.targetId === target.id && item.action === 'invokeSiteTool') ?? null : null;
      if (record.state.lastWebMcpToolCall?.id !== siteCall?.id) {
        record.state = { ...record.state, lastWebMcpToolCall: siteCall }; update(record);
      }
    }
  };
  const unsubscribeActivity = client.subscribe(syncActivity);
  const extensions = createExtensionsHost({ desktop, waitForGuest, records: registrations,
    async createTab(url) {
      if (createExtensionTab) return createExtensionTab(url);
      const sessionId = sidebar.mounted.getSnapshot();
      if (!sessionId) throw new Error('No conversation owns the extension tab');
      const previous = new Set(sidebar.tabsIn(sessionId).map(tab => tab.id));
      sidebar.openTabIn(sessionId, 'browser', { params: { url }, revealIfOpened: false });
      const tab = sidebar.tabsIn(sessionId).find(tab => tab.kind === 'browser' && !previous.has(tab.id));
      if (!tab) throw new Error('Extension tab could not be created');
      retainPage(sessionId, tab.id, sidebar.tabDomain.occurrence(sessionId, tab).signal, url);
      return waitForGuest({ conversationId: sessionId, browserTabId: tab.id });
    },
    focus: ids => focusPage(ids.conversationId, ids.browserTabId),
    close: async ids => { await service.disposeTab(ids.conversationId, ids.browserTabId); await sidebar.closeIn(ids.conversationId, ids.browserTabId); },
  });
  const service = {
    ...extensions.service,
    get siteToolsAvailable() { return typeof desktop?.automation === 'function'; },
    get siteSettingsAvailable() { return typeof desktop?.permissions === 'function'; },
    async siteSettings(operation = 'settings', args = {}) {
      const record = [...registrations.values()].find(record => record.element.isConnected);
      if (!record) {
        if (operation === 'settings') return [];
        throw new Error('The website is no longer open');
      }
      await record.ready;
      return desktop.permissions(record.lease.lease, operation, args);
    },
    get available() { return typeof desktop?.acquire === 'function'; },
    subscribeEditor(listener) { editorListeners.add(listener); return () => editorListeners.delete(listener); },
    async focusReference(reference) {
      const target = reference.target ?? reference;
      const conversationId = reference.conversationId ?? target.sessionId;
      const browserTabId = reference.browserTabId ?? target.sidebarTabId;
      if (target.provider !== 'dsh') return client.request('focus', { reference: target });
      const current = transport.targetFor(conversationId, browserTabId);
      if (current.id !== target.id) throw new Error('The referenced browser occurrence is no longer available');
      await focusPage(conversationId, browserTabId);
    },
    async getWebMcpInspectorData(args) { return inspectSiteTools(await waitForGuest(args)); },
    captureTabThumbnail(args) {
      let cancelled = false;
      const result = waitForGuest(args).then(async record => {
        if (cancelled) return null;
        const image = await record.capture();
        return cancelled ? null : image.toDataURL();
      });
      result[Symbol.dispose] = () => { cancelled = true; };
      return result;
    },
    async focusCommentOverlay(args) {
      const record = get(args);
      const editor = record.annotations.getSnapshot();
      if (!editor || editor.sessionId !== args.sessionId) throw new Error('The annotation editor changed');
      record.annotations.focus();
    },
    isPageFocused(args) { return document.activeElement === registrations.get(keyFor(args.conversationId, args.browserTabId))?.element; },
    async downloadUrl(value) {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported download URL');
      const sessionId = sidebar.mounted.getSnapshot();
      let record = [...registrations.values()].find(record => record.ids.conversationId === sessionId && record.element.isConnected);
      if (!record) {
        if (!sessionId) throw new Error('Open a conversation before starting a download');
        const previous = new Set(sidebar.tabsIn(sessionId).map(tab => tab.id));
        sidebar.openTabIn(sessionId, 'browser', { params: { url: 'about:blank' }, revealIfOpened: false });
        const tab = sidebar.tabsIn(sessionId).find(tab => tab.kind === 'browser' && !previous.has(tab.id));
        if (!tab) throw new Error('The download browser could not be created');
        retainPage(sessionId, tab.id, sidebar.tabDomain.occurrence(sessionId, tab).signal, 'about:blank');
        record = await waitForGuest({ conversationId: sessionId, browserTabId: tab.id });
      }
      await record.ready;
      record.element.downloadURL(url.href);
      return true;
    },
    async setAudioMuted(args) {
      const record = await waitForGuest(args);
      record.element.setAudioMuted(args.muted === true); update(record);
    },
    async renameTab(args, title) {
      const record = await waitForGuest(args), key = keyFor(args.conversationId, args.browserTabId);
      persist(key, { customTitle: title?.trim() || null }); update(record);
    },
    async newTab({ conversationId, browserTabId, url = 'about:blank' }) {
      const previous = new Set(sidebar.tabsIn(conversationId).map(tab => tab.id));
      const source = sidebar.tabDomain.occurrence(conversationId, { id: browserTabId });
      source.tabActions.openTab('browser', { params: { url }, revealIfOpened: false });
      const tab = sidebar.tabsIn(conversationId).find(tab => tab.kind === 'browser' && !previous.has(tab.id));
      if (!tab) throw new Error('The browser tab could not be created');
      retainPage(conversationId, tab.id, sidebar.tabDomain.occurrence(conversationId, tab).signal, url);
      await waitForGuest({ conversationId, browserTabId: tab.id });
      return { conversationId, browserTabId: tab.id };
    },
    async cloneTab(args) {
      const source = await waitForGuest(args);
      if (!desktop?.automation) throw new Error('This DSH host needs the OpenCU navigation adapter');
      const navigation = await desktop.automation(source.lease.lease, 'navigationSnapshot', {});
      const index = navigation.index + (args.navigation === 'back' ? -1 : args.navigation === 'forward' ? 1 : 0);
      if (index < 0 || index >= navigation.entries.length) throw new Error('No history entry exists in that direction');
      const sessionId = args.conversationId, previous = new Set(sidebar.tabsIn(sessionId).map(tab => tab.id)), active = sidebar.active();
      sidebar.openTabIn(sessionId, 'browser', { params: { url: navigation.entries[index].url }, revealIfOpened: false, active: args.active === true });
      const tab = sidebar.tabsIn(sessionId).find(tab => tab.kind === 'browser' && !previous.has(tab.id));
      if (!tab) throw new Error('The cloned browser tab could not be created');
      retainPage(sessionId, tab.id, sidebar.tabDomain.occurrence(sessionId, tab).signal, navigation.entries[index].url, { entries: navigation.entries, index });
      if (!args.active && active && sidebar.mounted.getSnapshot() === sessionId) sidebar.focus(active.id);
      let cloned;
      try { cloned = await waitForGuest({ conversationId: sessionId, browserTabId: tab.id }); }
      catch (error) { sidebar.closeIn(sessionId, tab.id); throw error; }
      update(cloned);
      if (args.active && sidebar.mounted.getSnapshot() === sessionId) { sidebar.focus(tab.id); cloned.element.focus(); }
      return { conversationId: sessionId, browserTabId: tab.id };
    },
    async sendAnnotations(conversationId, directly) {
      for (const record of registrations.values()) {
        if (record.ids.conversationId === conversationId) await record.annotations.send(undefined, directly);
      }
    },
    editorFor(conversationId, browserTabId) { return registrations.get(keyFor(conversationId, browserTabId))?.annotations.getSnapshot() ?? null; },
    annotationAction(conversationId, browserTabId, action, ...args) {
      const record = get({ conversationId, browserTabId });
      return record.annotations[action](...args);
    },
    guestBounds(conversationId, browserTabId) { return get({ conversationId, browserTabId }).element.getBoundingClientRect(); },
    async runPageCommand(args) {
      if (!registrations.has(keyFor(args.conversationId, args.browserTabId))) return 'page-unavailable';
      if (['open-find', 'focus-address'].includes(args.command.type)) {
        emit('browser-sidebar-command', args); return 'accepted';
      }
      await command(args);
      return 'accepted';
    },
    registerAnnotationButton(id, initialBounds, callback) {
      let bounds = initialBounds;
      const onPointer = event => {
        if (event.target?.tagName !== 'WEBVIEW' || event.button !== 0) return;
        if (event.clientX >= bounds.x && event.clientX <= bounds.x + bounds.width && event.clientY >= bounds.y && event.clientY <= bounds.y + bounds.height) {
          callback({ x: event.clientX, y: event.clientY });
        }
      };
      window.addEventListener('pointerup', onPointer, true);
      return { updateBounds(next) { bounds = next; }, [Symbol.dispose]() { window.removeEventListener('pointerup', onPointer, true); } };
    },
    subscribePermissionPrompts(args, listener) {
      let closed = false, timer, signature, failure;
      const poll = async () => {
        try {
          const record = await waitForGuest(args);
          if (closed) return;
          if (!desktop?.permissions) throw new Error('This DSH host needs the OpenCU website permission adapter');
          const prompts = await desktop.permissions(record.lease.lease, 'list', {});
          if (closed) return;
          failure = undefined;
          const next = JSON.stringify(prompts);
          if (signature !== next) { signature = next; listener(prompts); }
        } catch (error) {
          if (!closed && failure !== error.message) {
            failure = error.message;
            emit('browser-sidebar-command-error', { ...args, error: { message: error.message, code: error.code } });
          }
        } finally {
          if (!closed) timer = setTimeout(poll, failure || document.hidden ? 2000 : 250);
        }
      };
      const pending = poll();
      pending[Symbol.dispose] = () => { closed = true; clearTimeout(timer); };
      return pending;
    },
    async respondToPermissionPrompt(identity, response) {
      const record = get(identity);
      return desktop.permissions(record.lease.lease, 'respond', { ...identity, ...response });
    },
    async openSiteInfo(args) {
      const record = get(args);
      if (!desktop?.permissions) throw new Error('This DSH host needs the OpenCU website permission adapter');
      return desktop.permissions(record.lease.lease, 'siteInfo', { ...args, locale: reaIntl().locale });
    },
    async registerWebviewHostSession({ rendererInstanceId }) { rendererSessions.add(rendererInstanceId); return true; },
    async registerWebviewHost(args) {
      if (disposed) throw new Error('OpenCU browser host closed');
      if (!rendererSessions.has(args.rendererInstanceId)) throw new Error('Unknown REA renderer session');
      if (!desktop) throw new Error('This DSH surface does not provide an Electron browser guest');
      const key = keyFor(args.conversationId, args.browserTabId);
      const host = Initial.AW.pages.getHost(args.conversationId, args.browserTabId);
      if (!host?.webview) throw new Error('REA did not create the requested guest');
      const previous = registrations.get(key);
      if (previous?.host === host) return true;
      if (previous) await releaseRecord(key, previous);
      const lease = await desktop.acquireOpenCU();
      const initialNavigation = initialNavigations.get(key);
      if (initialNavigation !== undefined) {
        try { await desktop.automation(lease.lease, 'prepareNavigation', initialNavigation); }
        catch (error) { pendingGuests.get(key)?.reject(error); await desktop.release(lease.lease); throw error; }
      }
      if (disposed) { await desktop.release(lease.lease); throw new Error('OpenCU browser host closed'); }
      const element = host.webview;
      element.setAttribute('name', lease.lease);
      element.setAttribute('partition', lease.partition);
      element.setAttribute('allowpopups', '');
      const ids = { conversationId: args.conversationId, browserTabId: args.browserTabId };
      const record = { ids, lease, host, element, state: { ...jl, ...annotationState.get(key) }, cleanup: [], navigationGeneration: 0 };
      let detachDownloads;
      try { detachDownloads = await downloads.attach(lease.lease); }
      catch (error) { await desktop.release(lease.lease); throw error; }
      if (disposed) { await detachDownloads?.(); await desktop.release(lease.lease); throw new Error('OpenCU browser host closed'); }
      if (detachDownloads) record.cleanup.push(detachDownloads);
      const navigationFailed = (url, errorCode, message) => {
        const failure = { code: 'BROWSER_NAVIGATION_FAILED', errorCode, message, url };
        if (record.navigation) record.navigation.failed = true;
        record.state = { ...record.state, navigationError: failure, isLoading: false };
        emit('browser-sidebar-command-error', { ...ids, error: failure });
        update(record);
      };
      const navigationStarted = event => {
        if (event.isMainFrame === false || event.isInPlace) return;
        record.navigation = { generation: ++record.navigationGeneration, url: event.url, completed: false, failed: false };
        record.state = { ...record.state, navigationError: null };
        update(record);
      };
      const navigationRedirected = event => {
        if (event.isMainFrame !== false && record.navigation && !record.navigation.completed) record.navigation.url = event.url;
      };
      const navigationFinished = event => {
        const navigation = record.navigation;
        if (event.isMainFrame === false || !navigation || navigation.failed || !sameNavigationURL(navigation.url, event.url)) return;
        navigation.completed = true;
        record.state = { ...record.state, navigationError: null };
      };
      const pageLoadFailed = event => {
        const navigation = record.navigation;
        // A late failure from a replaced navigation or a subframe must not turn
        // the current successful page into an error state.
        if (event.isMainFrame === false || event.errorCode === -3 || !navigation || navigation.completed
          || !sameNavigationURL(navigation.url, event.validatedURL)) return;
        navigationFailed(event.validatedURL, event.errorCode, `${event.errorDescription} loading ${event.validatedURL}`);
      };
      for (const [event, listener] of [['did-start-navigation', navigationStarted], ['did-redirect-navigation', navigationRedirected],
        ['did-navigate', navigationFinished], ['did-fail-load', pageLoadFailed]]) {
        element.addEventListener(event, listener); record.cleanup.push(() => element.removeEventListener(event, listener));
      }
      const initialPageLoad = async (load, url) => {
        const before = record.navigationGeneration;
        try { await load(); }
        catch (error) {
          const code = pageNavigationCode(error), navigation = record.navigation;
          if (!code || disposed || registrations.get(key) !== record) throw error;
          const replaced = navigation && (navigation.generation > before + 1 || !sameNavigationURL(navigation.url, url));
          if (replaced || navigation?.completed) return;
          if (code === 'ERR_ABORTED') throw error;
          if (!record.state.navigationError) navigationFailed(navigation?.url || url, code, `${code} loading ${navigation?.url || url}`);
        }
      };
      record.ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Electron browser guest readiness timed out')), 15000);
        const ready = () => { clearTimeout(timeout); resolve(); };
        element.addEventListener('dom-ready', ready, { once: true });
        record.cleanup.push(() => { clearTimeout(timeout); element.removeEventListener('dom-ready', ready); reject(new Error('Browser guest was closed')); });
      });
      record.ready = record.ready.then(async () => {
        if (disposed || registrations.get(key) !== record) throw new Error('The browser guest was replaced before it became ready');
        if (desktop.permissions) await desktop.permissions(lease.lease, 'configure', { ...ids, mountGeneration: args.mountGeneration ?? 0 });
        const restore = restoreTargets.get(key);
        if (initialNavigation !== undefined) {
          await initialPageLoad(() => desktop.automation(lease.lease, 'finishNavigation', {}), initialNavigation.entries[initialNavigation.index].url);
          initialNavigations.delete(key); restoreTargets.delete(key);
        } else if (restore) {
          await initialPageLoad(() => element.loadURL(restore), restore);
          if (restoreTargets.get(key) === restore) restoreTargets.delete(key);
        }
        pendingGuests.get(key)?.resolve(record);
      });
      record.ready.catch(error => {
        pendingGuests.get(key)?.reject(error);
        console.error('OpenCU browser guest', error);
        emit('browser-sidebar-command-error', { ...ids, error: { message: error.message } });
      });
      let capturing, composedCapture, captureCancellation;
      const compositor = createCaptureCompositor();
      record.cleanup.unshift(() => { record.capture.cancel(); compositor.dispose(); composedCapture = undefined; });
      record.capture = ({ offThread = false } = {}) => {
        if (capturing) return capturing;
        const cancellation = new AbortController(); captureCancellation = cancellation;
        Initial.AW.setTabCaptureActive(ids.conversationId, ids.browserTabId, true);
        capturing = (async () => {
          // Hidden owner windows can suspend animation frames without suspending IPC.
          await new Promise((resolve, reject) => {
            let frame;
            const finish = () => {
              clearTimeout(timer); cancelAnimationFrame(frame); cancellation.signal.removeEventListener('abort', finish);
              cancellation.signal.aborted ? reject(cancellation.signal.reason) : resolve();
            };
            const timer = setTimeout(finish, 250);
            cancellation.signal.addEventListener('abort', finish, { once: true });
            frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
          });
          const page = await element.executeJavaScript('({ scheme: getComputedStyle(document.documentElement).colorScheme, prefersDark: matchMedia("(prefers-color-scheme: dark)").matches })');
          cancellation.signal.throwIfAborted();
          const image = await desktop.automation(lease.lease, 'capture', {});
          cancellation.signal.throwIfAborted();
          const { width, height } = image;
          const canvas = document.createElement('canvas');
          const schemes = page.scheme.split(/\s+/u);
          canvas.style.colorScheme = schemes.includes('dark') && (!schemes.includes('light') || page.prefersDark) ? 'dark' : 'light';
          canvas.style.display = 'none'; canvas.style.color = 'Canvas'; document.body.append(canvas);
          try {
            // Nested guest captures retain alpha; resolve its default canvas without changing the page.
            const background = getComputedStyle(canvas).color;
            if (composedCapture?.source === image.dataUrl && composedCapture.width === width
              && composedCapture.height === height && composedCapture.background === background) return composedCapture.result;
            let dataUrl;
            if (offThread) {
              dataUrl = await compositor.compose({ source: image.dataUrl, width, height, background });
            } else {
              const frame = new Image(); frame.src = image.dataUrl; await frame.decode();
              cancellation.signal.throwIfAborted();
              canvas.width = width; canvas.height = height;
              const context = canvas.getContext('2d', { alpha: false });
              context.fillStyle = background; context.fillRect(0, 0, width, height); context.drawImage(frame, 0, 0);
              dataUrl = canvas.toDataURL('image/png');
            }
            cancellation.signal.throwIfAborted();
            const result = { toDataURL: () => dataUrl, getSize: () => ({ width, height }) };
            // Retain one successful image per guest; all capture metadata stays on the current request.
            composedCapture = { source: image.dataUrl, width, height, background, result };
            return result;
          } finally { canvas.remove(); }
        })().finally(() => {
          capturing = undefined; captureCancellation = undefined;
          Initial.AW.setTabCaptureActive(ids.conversationId, ids.browserTabId, false);
        });
        return capturing;
      };
      record.capture.cancel = () => {
        captureCancellation?.abort(Object.assign(new Error('Browser frame capture was cancelled'), { code: 'CONTROL_STOPPED' }));
        compositor.cancel();
      };
      record.annotations = createAnnotationHost({ element, capture: record.capture, ids, target: () => transport.targetFor(ids.conversationId, ids.browserTabId), state: () => record.state,
        changed: patch => { record.state = { ...record.state, ...patch }; update(record); }, deliver: deliverAnnotations,
        settings, intl: reaIntl, inputMonitor: args => desktop.automation(lease.lease, 'inputMonitor', args), saveImage: async image => (await client.request('image/save', image)).image,
        userActivity: async kind => {
          const target = transport.targetFor(ids.conversationId, ids.browserTabId);
          try { await client.request('userActivity', { targetId: target.id, kind }); }
          catch (error) { if (error.code !== 'TARGET_NOT_SELECTED') throw error; }
        } });
      const contextMenu = event => {
        event.preventDefault();
        const pageUrl = element.getURL(), source = event.params;
        if (!source || !desktop.permissions) return;
        const params = Object.fromEntries(['x', 'y', 'formControlType', 'mediaType', 'linkURL', 'srcURL', 'selectionText', 'isEditable', 'hasImageContents'].map(key => [key, source[key]]));
        params.editFlags = { canCut: source.editFlags?.canCut === true, canCopy: source.editFlags?.canCopy === true, canPaste: source.editFlags?.canPaste === true };
        const intl = reaIntl(), defaults = { inspect: 'Inspect', back: 'Back', forward: 'Forward', reload: 'Reload', openLinkInNewTab: 'Open in new tab',
          openExternalBrowser: 'Open in external browser', copyLink: 'Copy link address', commentWithCodex: 'Annotate', quickAnnotate: 'Quick annotate', attachImage: 'Attach image to chat' };
        const labels = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
          const id = `browserSidebar.contextMenu.${key}`; return [id, intl.messages[id] ?? fallback];
        }));
        Object.assign(labels, intl.locale.startsWith('zh') ? { cut: '剪切', copy: '复制', paste: '粘贴' } : { cut: 'Cut', copy: 'Copy', paste: 'Paste' });
        void desktop.permissions(lease.lease, 'contextMenu', { pageUrl, params, labels }).then(async action => {
          if (!action || element.getURL() !== pageUrl || registrations.get(key) !== record) return;
          if (action.type === 'annotate') return record.annotations.annotateAt(action.point, action.flow, action.selectedText);
          if (action.type === 'new-tab') return service.newTab({ ...ids, url: action.url });
          if (action.type === 'open-external') return openLink({ url: action.url, useExternalBrowser: true });
          if (action.type === 'attach-image') {
            const { dataUrl } = await desktop.automation(lease.lease, 'readPageImage', { url: action.url, pageUrl });
            if (element.getURL() !== pageUrl || registrations.get(key) !== record) throw new Error('The image page changed');
            return deliverScreenshot(ids.conversationId, dataUrl, 'page-image');
          }
          return command({ ...ids, command: action });
        }).catch(error => { Shared.WFt().danger(error.message); });
      };
      element.addEventListener('context-menu', contextMenu);
      record.cleanup.push(() => element.removeEventListener('context-menu', contextMenu));
      const installAnnotations = () => void record.annotations.install().catch(error => {
        console.error('OpenCU page annotation install', error);
        emit('browser-sidebar-command-error', { ...ids, error: { message: error.message } });
      });
      const invalidateAnnotations = event => { if (event.isMainFrame !== false && !event.isInPlace) record.annotations.invalidate(); };
      element.addEventListener('dom-ready', installAnnotations);
      element.addEventListener('did-start-navigation', invalidateAnnotations);
      const notifyEditor = record.annotations.subscribe(() => { for (const listener of editorListeners) listener(); });
      record.cleanup.unshift(async () => {
        element.removeEventListener('dom-ready', installAnnotations); element.removeEventListener('did-start-navigation', invalidateAnnotations);
        notifyEditor(); await record.annotations.dispose();
      });
      registrations.set(key, record);
      const refresh = () => update(record);
      const rendererExited = () => {
        if (registrations.get(key) !== record) return;
        record.recoveryFrame = true;
        record.annotations.invalidate();
        record.findQuery = ''; record.findRequestId = null;
        record.siteToolsGeneration = (record.siteToolsGeneration ?? 0) + 1;
        record.state = { ...record.state, isLoading: false, webMcpTools: [], siteToolsAvailability: { ...record.state.siteToolsAvailability, webMcp: 'unavailable' } };
        for (const [sequence, pending] of cursorMoves) if (pending.record === record) finishCursor(sequence);
        const message = reaIntl().messages['opencu.browser.rendererExited'] ?? 'The browser page process exited. Reload the page to continue.';
        emit('browser-sidebar-command-error', { ...ids, error: { code: 'BROWSER_GUEST_CRASHED', message } });
        update(record);
      };
      element.addEventListener('render-process-gone', rendererExited);
      record.cleanup.push(() => element.removeEventListener('render-process-gone', rendererExited));
      const navigated = event => {
        if (event.isMainFrame === false) return;
        if (event.type === 'did-navigate-in-page') installAnnotations();
        record.historySignature = null; record.historyVisit = null;
        record.siteToolsGeneration = (record.siteToolsGeneration ?? 0) + 1;
        record.state = { ...record.state, webMcpTools: [], siteToolsAvailability: { ...record.state.siteToolsAvailability, webMcp: 'unavailable' } };
      };
      for (const event of ['did-navigate', 'did-navigate-in-page']) {
        element.addEventListener(event, navigated); record.cleanup.push(() => element.removeEventListener(event, navigated));
      }
      for (const event of ['dom-ready', 'did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated', 'media-started-playing', 'media-paused']) {
        element.addEventListener(event, refresh); record.cleanup.push(() => element.removeEventListener(event, refresh));
      }
      let toolsTimer, toolsClosed = false;
      const refreshTools = async () => {
        clearTimeout(toolsTimer);
        if (toolsClosed) return;
        try { await record.ready; await inspectSiteTools(record); }
        catch (error) { if (!toolsClosed && !element.isLoading()) console.error('OpenCU site tools', error); }
        if (!toolsClosed) toolsTimer = setTimeout(refreshTools, 2000);
      };
      if (desktop?.automation) void refreshTools();
      record.cleanup.unshift(() => { toolsClosed = true; clearTimeout(toolsTimer); });
      const favicon = event => { record.state = { ...record.state, faviconUrl: event.favicons?.[0] ?? null }; update(record); };
      element.addEventListener('page-favicon-updated', favicon);
      record.cleanup.push(() => element.removeEventListener('page-favicon-updated', favicon));
      const found = event => {
        if (record.findRequestId == null || event.result.requestId !== record.findRequestId || registrations.get(key) !== record) return;
        emit('browser-sidebar-find-state', { ...ids, state: {
          query: record.findQuery, matches: event.result.matches, activeMatchOrdinal: event.result.activeMatchOrdinal,
        } });
      };
      element.addEventListener('found-in-page', found);
      record.cleanup.push(() => element.removeEventListener('found-in-page', found));
      const detach = await transport.attach(element, { sessionId: args.conversationId, tabId: args.browserTabId,
        automate: desktop.automation ? async (operation, payload) => {
          if (record.recoveryFrame && ['input', 'insertText'].includes(operation)) {
            await record.capture(); record.recoveryFrame = false;
          }
          if (operation === 'siteTools') return inspectSiteTools(record);
          if (operation === 'invokeSiteTool') {
            const policy = (await settings.readAll()).values[siteToolsPolicyKey];
            const descriptors = await desktop.automation(lease.lease, 'siteTools', {});
            const tool = descriptors.tools.find(tool => tool.registrationId === payload.registrationId);
            if (!tool) throw Object.assign(new Error('The site tool changed; discover the current tools again'), { code: 'STALE_SITE_TOOL' });
            if (!siteToolsAllowed(policy, element.getURL()) || !siteToolsAllowed(policy, tool.origin)) throw Object.assign(new Error('Site tools are disabled for this website in browser settings'), { code: 'SITE_TOOLS_DISABLED' });
          }
          if (!['closedState', 'releaseInput', 'cancelUpload', 'cancelSiteTool'].includes(operation)) await record.annotations.ensureInputMonitoring();
          return desktop.automation(lease.lease, operation, payload);
        } : undefined,
        capture: record.capture,
        cursor: state => moveCursor(record, state),
        focus: () => focusPage(args.conversationId, args.browserTabId) });
      record.cleanup.push(detach, () => desktop.release(lease.lease));
      record.cleanup.push(desktop.onOpenRequested(lease.lease, url => {
        if (disposed || registrations.get(key) !== record) return;
        const presented = isPagePresented ? isPagePresented(ids) : record.presented === true;
        const active = presented && !Initial.AW.isBrowserUseActive(args.conversationId, args.browserTabId);
        try {
          void Promise.resolve(sidebar.openTabIn(args.conversationId, 'browser', { params: { url }, revealIfOpened: false, active })).catch(error => {
            emit('browser-sidebar-command-error', { ...ids, error: { message: error.message } });
          });
        } catch (error) { emit('browser-sidebar-command-error', { ...ids, error: { message: error.message } }); }
      }));
      // Electron needs the approved element attached before dom-ready; Owl can
      // complete native hidden-view registration before its DOM host is painted.
      // Start navigation only after readiness listeners and the transport exist;
      // downloads/settings IPC above can otherwise outlive the first dom-ready.
      element.setAttribute('src', `about:blank#${lease.lease}`);
      host.markRegistered();
      return true;
    },
    async syncView(args) {
      const record = get(args);
      await record.ready;
      record.presented = args.presented === true;
      if (!record.presented) for (const [sequence, pending] of cursorMoves) if (pending.record === record) finishCursor(sequence);
      if (desktop.permissions) await desktop.permissions(record.lease.lease, 'configure', { ...record.ids, mountGeneration: args.mountGeneration });
      if (args.presented) emit('browser-sidebar-webview-attached', { ...record.ids, mountGeneration: args.mountGeneration });
      return true;
    },
    async disposeTab(conversationId, browserTabId) {
      const key = keyFor(conversationId, browserTabId), record = registrations.get(key);
      if (!record) return;
      await releaseRecord(key, record);
    },
    async respondToSiteAnnotationPermission(args) {
      const record = get(args);
      if (record.state.siteAnnotationPermissionRequest?.id !== args.requestId) throw new Error('The site annotation request is no longer current');
      await record.annotations.dispatch({ type: 'browser-sidebar-runtime-annotation-permission-result', requestId: args.requestId, allowed: args.allow === true });
      await record.annotations.allowSite(args.allow === true);
      record.state = { ...record.state, siteAnnotationPermissionRequest: null }; update(record);
      return true;
    },
    async setSiteAnnotationFeaturesEnabled(args) {
      const record = get(args);
      if (new URL(record.element.getURL()).origin !== new URL(args.siteUrl).origin) return false;
      await record.annotations.allowSite(args.enabled === true);
      return true;
    },
    async setSiteAnnotationFeaturePreview(args) {
      const record = get(args);
      if (record.element.getURL() !== args.siteUrl) throw new Error('The annotation preview page has changed');
      await record.annotations.dispatch({ type: 'browser-site-annotation-feature-preview', preview: args.preview });
    },
    async setAnnotationPresentation(args) {
      const key = keyFor(args.conversationId, args.browserTabId);
      const patch = { ...annotationState.get(key), ...(args.markersVisible === undefined ? {} : { annotationMarkersVisible: args.markersVisible }), ...(args.suspended === undefined ? {} : { isAnnotationSuspended: args.suspended }) };
      annotationState.set(key, patch);
      const record = registrations.get(key);
      if (record) await record.annotations.sync(patch);
    },
    waitForViewportSize(args) {
      const record = get(args), expected = args.viewportSize;
      viewportWaits.get(args.requestId)?.();
      const result = new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true; clearTimeout(timer); resize.disconnect();
          record.element.removeEventListener('destroyed', lost);
          viewportWaits.delete(args.requestId); resolve(value);
        };
        const check = () => {
          if (registrations.get(keyFor(args.conversationId, args.browserTabId)) !== record || !record.element.isConnected) { finish(false); return; }
          const zoom = record.element.currentCSSZoom || 1;
          if (Math.round(record.element.clientWidth * zoom) === Math.round(expected.width) && Math.round(record.element.clientHeight * zoom) === Math.round(expected.height)) finish(true);
        };
        const lost = () => finish(false), resize = new ResizeObserver(check), timer = setTimeout(lost, 2000);
        viewportWaits.set(args.requestId, lost);
        record.element.addEventListener('destroyed', lost, { once: true }); resize.observe(record.element); check();
      });
      result[Symbol.dispose] = () => viewportWaits.get(args.requestId)?.();
      return result;
    },
    cancelViewportWait(requestId) { viewportWaits.get(requestId)?.(); return Promise.resolve(); },
  };
  return {
    service, pages,
    readyFor: (conversationId, browserTabId) => waitForGuest({ conversationId, browserTabId }),
    leaseFor: (conversationId, browserTabId) => get({ conversationId, browserTabId }).lease.lease,
    webContentsIdFor: (conversationId, browserTabId) => get({ conversationId, browserTabId }).element.getWebContentsId(),
    start() {
      const restore = () => queueMicrotask(() => {
        if (disposed) return;
        const sessionId = sidebar.mounted.getSnapshot();
        if (!sessionId) return;
        for (const tab of sidebar.tabsIn(sessionId)) if (tab.kind === 'browser') {
          const occurrence = sidebar.tabDomain.occurrence(sessionId, tab);
          retainPage(sessionId, tab.id, occurrence.signal, occurrence.navigation.getSnapshot().params?.url);
        }
      });
      restorationDisposers.push(sidebar.mounted.subscribe(restore), sidebar.openTabs.subscribe(restore));
      restore();
    },
    mountTab({ sessionId, tabId, initialUrl, initialNavigation, signal }) {
      retainPage(sessionId, tabId, signal, initialUrl, initialNavigation);
      for (const tab of sidebar.tabsIn(sessionId)) {
        if (tab.kind !== 'browser' || tab.id === tabId) continue;
        const occurrence = sidebar.tabDomain.occurrence(sessionId, tab);
        retainPage(sessionId, tab.id, occurrence.signal, occurrence.navigation.getSnapshot().params?.url);
      }
    },
    async dispose() {
      disposed = true;
      for (const unsubscribe of restorationDisposers) unsubscribe();
      window.removeEventListener('codex-message-from-view', onMessage);
      unsubscribeActivity(); extensions.dispose();
      for (const cancel of [...viewportWaits.values()]) cancel();
      for (const pending of [...pendingGuests.values()]) pending.reject(new Error('OpenCU browser host closed'));
      const releases = await Promise.allSettled([...registrations.values()].map(record => service.disposeTab(record.ids.conversationId, record.ids.browserTabId)));
      for (const page of retainedPages.values()) page.cleanup();
      retainedPages.clear(); publishPages();
      rendererSessions.clear(); annotationState.clear();
      const failures = releases.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'OpenCU browser host cleanup failed');
    },
  };
}
