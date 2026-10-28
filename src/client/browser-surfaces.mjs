import * as Shared from './rea/app-shared-2f2228189a8d.js';
import * as Initial from './rea/app-initial-c468e3fd7f91.js';
import { reaIntl } from './rea-locale.mjs';
import { services } from './rea-services.mjs';
import { inputReleased } from '../protocol.mjs';

/** The owning conversation keeps one tool identity while its native view changes windows. */
export function createBrowserSurfaces({ desktop, transport, client, sidebar, openSession, settings, deliverAnnotations, deliverScreenshot }) {
  const records = new Map(), disposers = [], lifetime = new AbortController();
  let disposed = false;
  const keyFor = (sessionId, tabId) => sessionId + '\0' + tabId;
  const wait = (work, signal) => new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(signal.reason); };
    Promise.resolve(work).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  const live = record => { record.lifetime.signal.throwIfAborted(); if (record.error) throw record.error; };
  const identity = args => ({ sessionId: args.sessionId ?? args.conversationId, tabId: args.tabId ?? args.browserTabId });
  const get = args => {
    const ids = identity(args), record = records.get(keyFor(ids.sessionId, ids.tabId));
    if (!record) throw new Error('The original browser surface is no longer available');
    live(record);
    return record;
  };
  const invoke = async (record, method, args) => {
    live(record);
    return wait(desktop.surface('requestPage', { ...record.ids, method, args }), record.lifetime.signal);
  };
  const page = async (args, method, payload = args) => { const record = get(args); await record.ready; return invoke(record, method, payload); };
  const report = (record, error) => Shared.Ff.dispatchHostMessage({ type: 'browser-sidebar-command-error',
    conversationId: record.ids.sessionId, browserTabId: record.ids.tabId, error: { message: error.message, code: error.code, details: error.details } });
  async function focusPage(sessionId, tabId) {
    const record = get({ sessionId, tabId }); await record.ready; live(record);
    if (!record.detached) {
      if (sidebar.mounted.getSnapshot() !== sessionId) await wait(openSession(sessionId), record.lifetime.signal);
      live(record);
      if (!sidebar.isExpanded()) sidebar.toggleExpanded();
      sidebar.focus(tabId);
      await new Promise((resolve, reject) => {
        let frame, settled = false;
        const finish = error => {
          if (settled) return; settled = true; clearTimeout(timer); cancelAnimationFrame(frame);
          record.lifetime.signal.removeEventListener('abort', abort); error ? reject(error) : resolve();
        };
        const abort = () => finish(record.lifetime.signal.reason);
        const timer = setTimeout(() => finish(Object.assign(new Error('The browser surface did not finish its visible layout'), { code: 'BROWSER_LAYOUT_TIMEOUT' })), 2000);
        record.lifetime.signal.addEventListener('abort', abort, { once: true });
        frame = requestAnimationFrame(() => { if (!settled) frame = requestAnimationFrame(() => finish()); });
        if (record.lifetime.signal.aborted) abort();
      });
      live(record); await wait(record.layout, record.lifetime.signal); live(record);
    }
    live(record); await wait(desktop.surface('focus', record.ids), record.lifetime.signal); live(record);
    return { placement: record.detached ? 'window' : 'sidebar' };
  }
  async function close(record) {
    if (record.closing) return record.closing;
    record.remote.suspend();
    record.lifetime.abort(Object.assign(new Error('The browser surface is closing'), { code: 'CONTROL_STOPPED' }));
    record.closing = (async () => {
      if (!record.nativeClosed) {
        // Native close cancels pending creation/RPCs and releases the exact guest
        // leases. Page readiness or disposal is never a prerequisite for it.
        await desktop.surface('close', record.ids);
        record.nativeClosed = true;
      }
      await record.remote.dispose({ closed: true });
      record.unbind(); records.delete(record.key);
      Initial.AW.removeTab(record.ids.sessionId, record.ids.tabId);
    })().catch(error => { record.closing = undefined; throw error; });
    return record.closing;
  }
  function retain({ sessionId, tabId, initialUrl, initialNavigation, signal }) {
    const key = keyFor(sessionId, tabId);
    if (records.has(key)) return records.get(key);
    if (disposed) throw new Error('OpenCU browser surfaces are closing');
    const record = { key, ids: { sessionId, tabId }, detached: false, unbind: () => {}, lifetime: new AbortController() };
    records.set(key, record);
    record.remote = transport.attachRemote({ sessionId, tabId, request: async (method, args) => {
      if (method === 'release' && record.lifetime.signal.aborted) {
        await close(record);
        return { released: true, retired: true };
      }
      if (method === 'focus') {
        const placement = await focusPage(sessionId, tabId);
        await invoke(record, method, args);
        return placement;
      }
      return invoke(record, method, args);
    } });
    const abort = () => { void close(record).catch(error => report(record, error)); };
    signal.addEventListener('abort', abort, { once: true }); record.unbind = () => signal.removeEventListener('abort', abort);
    record.created = desktop.surface('create', { ...record.ids, initialUrl: initialUrl || 'about:blank', initialNavigation, locale: reaIntl().locale,
      theme: getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light' });
    record.ready = wait(record.created, record.lifetime.signal).then(() => invoke(record, 'ready')).then(async value => {
      live(record);
      record.initialized = true; record.navigationError = value.navigationError ?? null;
      record.remote.update(value); await invoke(record, 'visibility', { visible: record.detached || record.visible === true }); live(record); return record;
    });
    record.ready.catch(error => {
      if (record.lifetime.signal.aborted) return;
      record.error ??= error;
      record.remote.suspend();
      report(record, record.error);
    });
    if (signal.aborted) abort();
    return record;
  }
  async function newTab(args) {
    const signal = args.signal ? AbortSignal.any([args.signal, lifetime.signal]) : lifetime.signal; signal.throwIfAborted();
    const sessionId = args.conversationId ?? args.sessionId ?? sidebar.mounted.getSnapshot();
    if (!sessionId) throw new Error('Open a conversation before opening its browser');
    if (args.active !== false && sidebar.mounted.getSnapshot() !== sessionId) await (signal ? wait(openSession(sessionId), signal) : openSession(sessionId));
    signal?.throwIfAborted();
    const active = sidebar.active(), before = new Set(sidebar.tabsIn(sessionId).map(tab => tab.id));
    sidebar.openTabIn(sessionId, 'browser', { params: { url: args.url || 'about:blank' }, revealIfOpened: false, active: args.active !== false });
    const tab = sidebar.tabsIn(sessionId).find(tab => tab.kind === 'browser' && !before.has(tab.id));
    if (!tab) throw new Error('The browser tab could not be created');
    const record = retain({ sessionId, tabId: tab.id, initialUrl: args.url, initialNavigation: args.initialNavigation, signal: sidebar.tabDomain.occurrence(sessionId, tab).signal });
    const cancel = async () => {
      await close(record); sidebar.closeIn(sessionId, tab.id);
      return { released: true, retired: true, closedTargetId: record.remote.target.id, target: record.remote.target };
    };
    args.onCreated?.({ target: record.remote.target, cancel });
    const abort = () => { void cancel().catch(error => report(record, error)); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try { await record.ready; signal?.throwIfAborted(); }
    catch (error) {
      let cleanupFailed = false;
      try { await close(record); }
      catch (cleanupError) {
        cleanupFailed = true;
        throw Object.assign(new Error(`${error.message}; browser cleanup also failed: ${cleanupError.message}`, { cause: error }),
          { code: error.code, details: { ...error.details, created: true, target: record.remote.target, cleanup: { code: cleanupError.code, message: cleanupError.message } } });
      }
      finally {
        if (!cleanupFailed) {
          const selected = sidebar.active()?.id === tab.id;
          sidebar.closeIn(sessionId, tab.id);
          if (selected && active && sidebar.mounted.getSnapshot() === sessionId) sidebar.focus(active.id);
        }
      }
      throw error;
    } finally { signal?.removeEventListener('abort', abort); }
    if (record.navigationError) {
      // Creation succeeded; retain the same tab/target for REA's Reload action.
      // The caller must still learn that its requested URL did not load.
      const failure = record.navigationError;
      throw Object.assign(new Error(`Tab ${record.remote.target.id} was created, but ${failure.message}. Reload this target after recovery; do not create another tab.`),
        { code: failure.code, details: { created: true, target: record.remote.target, stage: 'navigate', navigationError: failure } });
    }
    return { conversationId: sessionId, browserTabId: tab.id, sessionId, tabId: tab.id, target: record.remote.target };
  }
  async function cloneTab(args) {
    const source = get(args), navigation = await page(args, 'navigationSnapshot');
    live(source);
    const index = navigation.index + (args.navigation === 'back' ? -1 : args.navigation === 'forward' ? 1 : 0);
    if (index < 0 || index >= navigation.entries.length) throw new Error('No history entry exists in that direction');
    return newTab({ conversationId: source.ids.sessionId, url: navigation.entries[index].url,
      initialNavigation: { entries: navigation.entries, index }, active: args.active !== false });
  }
  const service = {
    available: true, extensionsAvailable: true, siteToolsAvailable: true, siteSettingsAvailable: true,
    newTab, cloneTab,
    async focusReference(reference) {
      const target = reference.target ?? reference;
      if (target.provider !== 'dsh') return client.request('focus', { reference: target });
      const record = get({ sessionId: reference.conversationId ?? target.sessionId, tabId: reference.browserTabId ?? target.sidebarTabId });
      if (record.remote.target.id !== target.id) throw new Error('The referenced browser occurrence changed');
      return focusPage(record.ids.sessionId, record.ids.tabId);
    },
    renameTab: (args, title) => page(args, 'renameTab', { ...args, title }),
    setAudioMuted: args => page(args, 'setAudioMuted'),
    runPageCommand: args => page(args, 'runPageCommand'),
    async detachTab(args) { const record = get(args); await record.ready; live(record); return wait(desktop.surface(record.detached ? 'dock' : 'detach', record.ids), record.lifetime.signal); },
    async downloadUrl(url) {
      const record = [...records.values()].find(value => value.ids.sessionId === sidebar.mounted.getSnapshot()) ?? get(await newTab({}));
      await record.ready; return invoke(record, 'downloadUrl', url);
    },
    async manageExtensions() { const record = [...records.values()][0] ?? get(await newTab({})); await record.ready; return invoke(record, 'manageExtensions'); },
    async siteSettings(operation = 'settings', args = {}) {
      const values = await Promise.all([...records.values()].map(async record => { await record.ready; return invoke(record, 'siteSettings', { operation, args }); }));
      return operation === 'settings' ? values.flat() : values;
    },
    async sendAnnotations(sessionId, directly) {
      for (const record of records.values()) if (record.ids.sessionId === sessionId) await invoke(record, 'sendAnnotations', { directly });
    },
    captureTabThumbnail(args) { const result = page(args, 'preview').then(value => value.dataUrl); result[Symbol.dispose] = () => {}; return result; },
  };
  async function ownerRequest(record, method, args) {
    live(record);
    switch (method) {
      case 'target': return record.remote.target;
      case 'settings.readAll': return settings.readAll();
      case 'settings.write': return settings.write(args.key, args.value);
      case 'newTab': return newTab({ ...args, conversationId: record.ids.sessionId });
      case 'extensionTab': {
        const next = await newTab({ url: args.url, conversationId: record.ids.sessionId });
        return page(next, 'webContentsId');
      }
      case 'cloneTab': return cloneTab({ ...args, conversationId: record.ids.sessionId, browserTabId: record.ids.tabId });
      case 'closeTab': return sidebar.closeIn(record.ids.sessionId, record.ids.tabId);
      case 'focusPage': return focusPage(record.ids.sessionId, record.ids.tabId);
      case 'detachTab': return service.detachTab(record.ids);
      case 'deliverAnnotations': return deliverAnnotations({ ...args, conversationId: record.ids.sessionId, browserTabId: record.ids.tabId, target: record.remote.target });
      case 'deliverScreenshot': return deliverScreenshot(record.ids.sessionId, args.dataURL, args.title);
      case 'openExternal': {
        const url = new URL(args.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported external browser URL');
        window.open(url.href, '_blank', 'noopener,noreferrer'); return true;
      }
      case 'openSettings': return services.openSettings(args.path);
      case 'openSources': return services.sources.open({ sessionId: record.ids.sessionId });
      default: throw new Error('Unknown browser surface owner request: ' + method);
    }
  }
  const activity = client.subscribe(() => {
    const state = client.getSnapshot();
    for (const record of records.values()) {
      const active = state.connected && state.sessions.some(session => session.running.some(item => item.targetId === record.remote.target.id));
      Initial.AW.setBrowserUseActive(record.ids.sessionId, record.ids.tabId, active);
    }
  });
  const unsubscribe = desktop.onSurfaceEvent(event => {
    const record = records.get(keyFor(event.sessionId, event.tabId));
    if (!record) return;
    if (event.type === 'request') {
      void Promise.resolve().then(() => ownerRequest(record, event.method, event.args)).then(
        result => desktop.surface('reply', { id: event.id, result }),
        error => desktop.surface('reply', { id: event.id, error: { message: error.message, code: error.code, details: error.details } }),
      ).catch(error => report(record, error));
    } else if (event.type === 'fault') {
      record.error ??= new Error(event.error);
      record.remote.suspend(); report(record, record.error);
    } else if (event.type === 'placement') {
      if (record.closing || record.error || record.nativeClosed) return;
      record.detached = event.detached;
      record.remote.update({ ...record.remote.target, isDetached: event.detached });
      if (record.initialized) void invoke(record, 'visibility', { visible: event.detached || record.visible === true }).catch(error => report(record, error));
      const previous = Initial.AW.getSnapshot(record.ids.sessionId, record.ids.tabId);
      if (previous) Initial.AW.setSnapshot(record.ids.sessionId, record.ids.tabId, { ...previous, isDetached: event.detached });
    } else if (event.type === 'page') {
      if (record.closing || record.error || record.nativeClosed) return;
      const value = event.event;
      if (value.type === 'snapshot') {
        record.navigationError = value.snapshot.navigationError ?? null;
        record.remote.update({ ...value.snapshot, isDetached: record.detached });
        Shared.Ff.dispatchHostMessage({ type: 'browser-sidebar-state', conversationId: record.ids.sessionId, browserTabId: record.ids.tabId, snapshot: { ...value.snapshot, isDetached: record.detached } });
      } else if (value.type === 'error') report(record, new Error(value.message));
      else if (value.type === 'closed') {
        if (value.release?.closed !== true || !inputReleased(value.release) || value.release.retired !== true) {
          report(record, new Error('The original guest destruction and input release must be acknowledged')); return;
        }
        record.retiring ??= (async () => {
          await record.remote.retire(value.release);
          await close(record); sidebar.closeIn(record.ids.sessionId, record.ids.tabId);
        })().catch(error => { record.retiring = undefined; report(record, error); });
      }
    }
  });
  transport.setTabOwner(args => newTab({ ...args, active: false }), async args => { const record = get(args); await close(record); sidebar.closeIn(record.ids.sessionId, record.ids.tabId); });
  return { service, mountTab: retain,
    async updateBounds(args) {
      const record = get(args);
      record.visible = args.visible;
      record.layout = (record.layout ?? Promise.resolve()).catch(() => undefined).then(async () => {
        await wait(record.created, record.lifetime.signal);
        live(record);
        await wait(desktop.surface('bounds', { ...record.ids, bounds: args.bounds, visible: args.visible }), record.lifetime.signal);
        live(record);
        if (record.initialized) await invoke(record, 'visibility', { visible: record.detached || args.visible });
      });
      return record.layout;
    },
    start() {
      const restore = () => queueMicrotask(() => {
        if (disposed) return;
        const sessionId = sidebar.mounted.getSnapshot();
        if (!sessionId) return;
        for (const tab of sidebar.tabsIn(sessionId)) if (tab.kind === 'browser') {
          const occurrence = sidebar.tabDomain.occurrence(sessionId, tab);
          retain({ sessionId, tabId: tab.id, signal: occurrence.signal, initialUrl: occurrence.navigation.getSnapshot().params?.url });
        }
      });
      disposers.push(sidebar.mounted.subscribe(restore), sidebar.openTabs.subscribe(restore)); restore();
    },
    async dispose() {
      disposed = true; lifetime.abort(Object.assign(new Error('The browser surfaces are closing'), { code: 'CONTROL_STOPPED' })); activity(); for (const dispose of disposers) dispose();
      const results = await Promise.allSettled([...records.values()].map(close)); unsubscribe();
      const errors = results.filter(value => value.status === 'rejected').map(value => value.reason);
      if (errors.length) throw new AggregateError(errors, 'Browser surface cleanup failed');
    },
  };
}
