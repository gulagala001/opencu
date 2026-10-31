import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as compiler from 'react-compiler-runtime';

export { React, jsxRuntime, ReactDOM, ReactDOMClient, compiler };
import { services } from './rea-services.mjs';
export { services };
export { openBrowserLink, copyFileContents, readFileBytes, runFileAction, reportActionError } from './rea-actions.mjs';
export { documentSourceBytes } from './document-source.mjs';
export { findReaElement, reaPortalContainer, protectReaCarrier, prepareReaGuestRoot } from './portal-host.mjs';
export function activeReaElement() {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}
export { BrowserControls, ComputerControls, useComputerSettingsInputs, useSettingsPluginActions,
  useBrowserConnectionInputs, ConnectionInstallButton, ConnectionStatus, BrowserConnectionControls } from './capability-settings.jsx';
export { BrowserSettingsSubpage } from './profile-settings.jsx';
export { ReaSettingsPage, ReaComputerSettingsPage } from './settings-page.jsx';
export { BrowserWindowAction } from './browser-window-action.jsx';
export { BrowserAddressOverlay } from './browser-address-slot.jsx';
export { prepareBrowserAddressReference } from './browser-address.mjs';
export { useSiteToolsPreference, SiteToolsRules } from './site-tools-settings.jsx';

export function useBrowserSettingsInputs() {
  const capabilities = useBrowserSettingsCapabilities();
  return { capabilities, available: services.browserHost?.available === true, siteTools: services.browserHost?.siteToolsAvailable === true };
}

export function browserCapability({ name }) {
  if (name !== 'browser.in-app') return null;
  return { isLoading: false, isError: false, isCapable: services.browserHost?.available === true };
}

export function useBrowserSettingsCapabilities() {
  const connected = services.browserSettings;
  const state = React.useSyncExternalStore(connected.subscribe, connected.getSnapshot, connected.getSnapshot);
  const capability = enabled => ({ enabled, isLoading: false });
  return React.useMemo(() => ({
    history: capability(!!services.browsingHistory), downloads: capability(!!services.downloads),
    extensions: capability(services.browserHost?.extensionsAvailable === true),
    siteSettings: capability(services.browserHost?.siteSettingsAvailable === true),
    passwordManager: capability(state.connections.length > 0), contactInfo: capability(state.connections.length > 0),
  }), [state]);
}

// Electron <webview> destroys its guest when moved between DOM parents, unlike
// Codex's Owl host. Keep the original container stationary; REA still owns bounds,
// visibility, clipping, cursor content and handoff timing.
export function attachBrowserGuest(host, parent) {
  const container = host.container;
  if (!container) return;
  if (!container.isConnected) parent.append(container);
  const cover = host.stagedCover;
  if (cover) container.parentElement.insertBefore(cover, host.isStaged ? container.nextSibling : container);
}

export function orderBrowserGuestBehind(host, other) {
  const container = host.container, next = other.container;
  if (!container?.isConnected || !next?.isConnected) return;
  const z = Number.parseInt(getComputedStyle(next).zIndex, 10) || 0;
  container.style.zIndex = String(z - 1);
  if (host.stagedCover) host.stagedCover.style.zIndex = String(z - 1);
}

const noSiteToolCalls = [];
export function useSiteToolCalls(sessionId) {
  const source = services.sources;
  const snapshot = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return snapshot[sessionId]?.webMcpCalls ?? noSiteToolCalls;
}

export function useSiteToolSources() {
  const source = services.sources;
  const snapshot = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return Object.values(snapshot).some(session => session.webMcpCalls?.length);
}

export const ReaPortalContext = React.createContext(null);
export const ReaPaneContext = React.createContext(null);
export const ImageMarkupCloseContext = React.createContext(null);
export const ReferenceEditorDialogContext = React.createContext(null);
export function ReferenceEditorDialog({ Dialog, contentProps, ...props }) {
  const lifecycle = React.useContext(ReferenceEditorDialogContext);
  return React.createElement(Dialog, { ...props, open: lifecycle?.open ?? props.open,
    contentProps: { ...contentProps, onCloseAutoFocus(event) {
      contentProps?.onCloseAutoFocus?.(event);
      if (lifecycle && !lifecycle.open) queueMicrotask(lifecycle.closed);
    } } });
}
export function ImageMarkupDiscardDialog({ Dialog, onKeepEditing, ...props }) {
  const kept = React.useContext(ImageMarkupCloseContext);
  return React.createElement(Dialog, { ...props, onKeepEditing: () => { onKeepEditing(); kept?.(); } });
}
export function usePaneLayout() { return React.useContext(ReaPaneContext); }

const notificationHosts = [];
export function registerNotificationHost(toaster, install) {
  const entry = { toaster, dispose: install(toaster) };
  notificationHosts.push(entry);
  return () => {
    const current = notificationHosts.at(-1) === entry;
    const index = notificationHosts.indexOf(entry);
    if (index < 0) return;
    notificationHosts.splice(index, 1); entry.dispose();
    const previous = notificationHosts.at(-1);
    if (current && previous) previous.dispose = install(previous.toaster);
  };
}

export function waitForPdfWorker(worker, signal) {
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer); worker.removeEventListener('message', message); worker.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    };
    const message = event => {
      if (event.data?.sourceName === 'worker' && event.data?.targetName === 'main' && event.data?.action === 'ready') finish();
    };
    const failed = event => finish(new Error(event.message || 'PDF worker could not start'));
    const aborted = () => finish(signal.reason ?? new DOMException('PDF preview closed', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('PDF worker readiness timed out')), 15000);
    worker.addEventListener('message', message); worker.addEventListener('error', failed);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

// REA owns portal content; the host only supplies its styled, isolated mount point.
export function ReaPortalMount({ container, element }) {
  const host = React.useContext(ReaPortalContext);
  React.useLayoutEffect(() => {
    const parent = container === document.body && host ? host : container;
    parent.appendChild(element);
  }, [container, element, host]);
  return null;
}
