import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeRea, ReaRoot, ReaProviders } from './rea-root.jsx';
import { p as HiddenBrowserUseWebviewHost, b as initializeHiddenHost } from './rea/hidden-browser-use-webview-host-bdd4db5a6c73.js';
import { createReaPortal, guestPortalStyles } from './portal-host.mjs';
import { installReaServices } from './rea-services.mjs';
import { createCoreClient } from './core-client.mjs';
import { createReaBrowserHost } from './rea-browser-host.mjs';
import { createGuestDriver } from './guest-driver.mjs';
import { createBrowserHistoryHost } from './browser-history.mjs';
import { createBrowserSettings } from './browser-settings.mjs';
import { createDownloadsHost } from './downloads-host.mjs';
import * as Initial from './rea/app-initial-c468e3fd7f91.js';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import styles from './rea-styles.css';
import { desktopBrowserHost } from './host-compat.mjs';
import { unwrapOpenCU } from './ipc-result.mjs';

const surface = globalThis.opencuSurface, desktop = desktopBrowserHost();
const bridge = { ...surface, call: (...args) => surface.call(...args).then(unwrapOpenCU) };
const owner = (method, args) => bridge.call('requestOwner', { method, args });
const report = error => { console.error('OpenCU browser surface', error); void bridge.call('publish', { event: { type: 'error', message: error.message } }).catch(failure => console.error('OpenCU surface error delivery', failure)); };
let host, driver, cleanup, target, init, readyResolve, readyReject;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
ready.catch(report);
const placementListeners = new Set();
let detached = false, physicalSurfaceVisible = () => {};
const listen = bridge.subscribe(event => {
  if (event.type === 'placement') { detached = event.detached; for (const listener of placementListeners) listener(); return; }
  if (event.type !== 'request') return;
  void ready.then(async () => {
    switch (event.method) {
      case 'ready': return driver.metadata();
      case 'visibility': physicalSurfaceVisible(event.args.visible); return true;
      case 'webContentsId': return { webContentsId: host.webContentsIdFor(init.sessionId, init.tabId) };
      case 'release': return driver.release();
      case 'observe': return driver.observe(event.args);
      case 'preview': return driver.preview();
      case 'act': return driver.act(event.args);
      case 'focus': return host.service.runPageCommand({ conversationId: init.sessionId, browserTabId: init.tabId, command: { type: 'focus' } });
      case 'dispose': await driver.release(); await cleanup(); return { released: true };
      case 'navigationSnapshot': return desktop.automation(host.leaseFor(init.sessionId, init.tabId), 'navigationSnapshot', {});
      case 'restoreNavigation': return desktop.automation(host.leaseFor(init.sessionId, init.tabId), 'restoreNavigation', event.args);
      case 'runPageCommand': return host.service.runPageCommand(event.args);
      case 'renameTab': return host.service.renameTab(event.args, event.args.title);
      case 'setAudioMuted': return host.service.setAudioMuted(event.args);
      case 'downloadUrl': return host.service.downloadUrl(event.args);
      case 'manageExtensions': return host.service.manageExtensions();
      case 'siteSettings': return host.service.siteSettings(event.args.operation, event.args.args);
      case 'sendAnnotations': return host.service.sendAnnotations(init.sessionId, event.args.directly);
      default: throw new Error('Unknown browser surface operation: ' + event.method);
    }
  }).then(result => bridge.call('reply', { id: event.id, result }), error => bridge.call('reply', { id: event.id, error: { message: error.message, code: error.code, details: error.details } })).catch(report);
});

async function mount() {
  init = await bridge.call('init', {});
  document.documentElement.lang = init.locale;
  document.documentElement.style.colorScheme = init.theme;
  document.documentElement.style.height = '100%'; document.body.style.cssText = 'margin:0;height:100%;overflow:hidden';
  const container = document.getElementById('root');
  container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron'; container.dataset.theme = init.theme;
  container.style.cssText = 'height:100%;width:100%;min-height:0;position:relative';
  const sheet = document.createElement('style'); sheet.textContent = styles + '\n' + guestPortalStyles; document.head.append(sheet);
  const { portal, dispose: disposePortal } = createReaPortal(styles, container);
  const client = createCoreClient(); client.start();
  const settings = {
    readAll: () => owner('settings.readAll'),
    read: key => owner('settings.readAll').then(value => ({ effective: value.values[key], configured: value.configuredValues[key] })),
    write: (key, value) => owner('settings.write', { key, value }),
    async subscribe(key, callback) {
      let closed = false, timer, previous;
      const poll = async () => {
        try { const value = await settings.read(key), signature = JSON.stringify(value); if (!closed && signature !== previous) { previous = signature; callback(value); } }
        catch (error) { if (!closed) report(error); }
        if (!closed) timer = setTimeout(poll, 2000);
      };
      await poll(); return { [Symbol.dispose]() { closed = true; clearTimeout(timer); } };
    },
  };
  const lifetime = new AbortController();
  let physicalVisible = true;
  const visibleListeners = new Set();
  physicalSurfaceVisible = visible => { physicalVisible = visible; for (const listener of visibleListeners) listener(); };
  const releaseVisibility = bridge.subscribe(event => {
    if (event.type === 'visibility') { physicalVisible = event.visible; for (const listener of visibleListeners) listener(); }
  });
  const tab = { id: init.tabId, kind: 'browser', navigation: { params: { url: init.initialUrl } } };
  const staticSession = { getSnapshot: () => init.sessionId, subscribe: () => () => {} };
  const sidebar = {
    mounted: staticSession, openTabs: staticSession, tabsIn: () => [tab], active: () => tab,
    isExpanded: () => true, toggleExpanded() {}, focus() {},
    openTabIn: (_session, _kind, options) => owner('newTab', { url: options.params?.url, active: options.active }),
    closeIn: () => owner('closeTab'),
    tabDomain: { occurrence: () => ({ signal: lifetime.signal, navigation: { getSnapshot: () => tab.navigation }, tabActions: {} }) },
  };
  target = await owner('target');
  const transport = {
    rendererId: target.identity.rendererId, targetFor: () => driver?.metadata() ?? target, setTabOwner() {},
    async attach(element, options) {
      driver = createGuestDriver(element, target, () => {}, () => owner('focusPage'), options.cursor, options.capture, options.automate);
      return () => driver.release();
    },
  };
  const history = createBrowserHistoryHost(client, desktop);
  const downloads = createDownloadsHost({ desktop, client, settings, downloadUrl: url => host.service.downloadUrl(url) });
  host = createReaBrowserHost({ desktop, transport, client, sidebar, openSession: () => owner('focusPage'), settings, history, downloads,
    createExtensionTab: url => owner('extensionTab', { url }), focusSurface: () => owner('focusPage'), openExternal: url => owner('openExternal', { url }),
    isPagePresented: () => physicalVisible,
    deliverAnnotations: args => owner('deliverAnnotations', args),
    deliverScreenshot: (_session, dataURL, title) => owner('deliverScreenshot', { dataURL, title }),
  });
  host.service.newTab = args => owner('newTab', args);
  host.service.cloneTab = args => owner('cloneTab', args);
  host.service.detachTab = () => owner('detachTab');
  host.service.windowPlacement = { getSnapshot: () => detached, subscribe(listener) { placementListeners.add(listener); return () => placementListeners.delete(listener); } };
  let sourceSnapshot = {};
  const sourceListeners = new Set();
  const releaseSources = client.subscribe(() => {
    sourceSnapshot = Object.fromEntries(client.getSnapshot().sessions.map(session => [session.sessionId, { webMcpCalls: session.webMcpCalls ?? [] }]));
    for (const listener of sourceListeners) listener();
  });
  const sources = { getSnapshot: () => sourceSnapshot, subscribe(listener) { sourceListeners.add(listener); return () => sourceListeners.delete(listener); }, open: () => owner('openSources') };
  const browserSettings = createBrowserSettings(client);
  const uninstall = installReaServices({ browserHost: host.service, browserSettings, settings, downloads: downloads.service,
    browsingHistory: history.browsingHistory, browserAutocomplete: history.browserAutocomplete,
    clipboard: { writeText: text => navigator.clipboard.writeText(text) },
    sources, openSettings: path => owner('openSettings', { path }), notify: (_tone, message) => Shared.WFt().danger(message),
  });
  initializeRea(); initializeHiddenHost();
  let last;
  const publish = Initial.AW.subscribe(() => {
    const snapshot = Initial.AW.getSnapshot(init.sessionId, init.tabId);
    if (!snapshot || snapshot === last) return;
    last = snapshot; void bridge.call('publish', { event: { type: 'snapshot', snapshot } }).catch(report);
  });
  const submit = event => {
    event.detail.onSubmitAvailability?.(true);
    if (event.detail.onSubmitStarted) event.detail.onSubmitStarted(host.service.sendAnnotations(init.sessionId, true));
  };
  window.addEventListener('codex-browser-sidebar-tweaks-submit-request', submit);
  const root = createRoot(container, { onUncaughtError: error => { readyReject(error); void bridge.call('publish', { event: { type: 'fault', error: { message: error.message } } }).catch(report); } });
  function Surface() {
    const pages = React.useSyncExternalStore(host.pages.subscribe, host.pages.getSnapshot);
    const visible = React.useSyncExternalStore(listener => { visibleListeners.add(listener); return () => visibleListeners.delete(listener); }, () => physicalVisible);
    return <><ReaRoot sessionId={init.sessionId} tabId={init.tabId} visible={visible} container={container} portal={portal} />
      <ReaProviders path="/opencu-hidden-pages">{pages.map(page => <HiddenBrowserUseWebviewHost key={page.key}
        conversationId={page.conversationId} browserUseTabIdsKey={page.browserTabId} />)}</ReaProviders></>;
  }
  root.render(<Surface />);
  host.mountTab({ sessionId: init.sessionId, tabId: init.tabId, initialUrl: init.initialUrl, initialNavigation: init.initialNavigation, signal: lifetime.signal });
  await host.readyFor(init.sessionId, init.tabId);
  cleanup = async () => {
    window.removeEventListener('codex-browser-sidebar-tweaks-submit-request', submit); publish();
    await host.dispose(); await downloads.dispose(); await history.dispose(); browserSettings.dispose(); releaseSources(); sourceListeners.clear(); client.dispose();
    releaseVisibility(); visibleListeners.clear(); root.unmount(); disposePortal(); uninstall();
  };
  readyResolve();
}
void mount().catch(error => {
  readyReject(error);
  const alert = document.createElement('pre'); alert.setAttribute('role', 'alert'); alert.textContent = error.stack || error.message; document.body.append(alert);
  void bridge.call('publish', { event: { type: 'fault', error: { message: error.message } } }).catch(report);
});
