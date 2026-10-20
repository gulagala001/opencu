import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaRoot } from './rea-root.jsx';
import styles from './rea-styles.css';
import { adoptReaStyles, createReaPortal } from './portal-host.mjs';
import { NativeBrowserSlot } from './native-browser-slot.jsx';

export function BrowserSlot(props) {
  if (props.browserAvailable === false) return HostReact.createElement('div', {
    role: 'status', style: { padding: '16px', whiteSpace: 'pre-wrap', lineHeight: 1.6 },
  }, props.browserUnavailableMessage);
  return props.updateBounds ? HostReact.createElement(NativeBrowserSlot, props) : HostReact.createElement(EmbeddedBrowserSlot, props);
}

function EmbeddedBrowserSlot(props) {
  const { tab } = props.useTabInfo();
  const host = HostReact.useRef(null), root = HostReact.useRef(null), overlay = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    const shadow = host.current.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    container.dataset.reaRoot = '';
    container.dataset.codexWindowType = 'electron';
    container.style.cssText = 'height:100%;width:100%;min-height:0;position:relative';
    adoptReaStyles(shadow, styles); shadow.append(container);
    const { dispose: disposePortal, portal: portalContainer } = createReaPortal(styles, container);
    overlay.current = portalContainer;
    root.current = createRoot(container, {
      onUncaughtError(error) {
        const report = failure => {
          console.error('OpenCU REA render', failure?.stack ?? failure);
          for (const cause of failure?.errors ?? []) report(cause);
        };
        report(error);
        const messages = failure => failure?.errors?.length ? failure.errors.flatMap(messages) : [failure?.stack ?? String(failure)];
        const alert = document.createElement('pre'); alert.setAttribute('role', 'alert');
        alert.style.cssText = 'white-space:pre-wrap;overflow:auto;padding:16px;font-size:12px';
        alert.textContent = messages(error).join('\n');
        queueMicrotask(() => container.replaceChildren(alert));
      },
    });
    return () => { root.current.unmount(); root.current = null; disposePortal(); overlay.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => props.mountTab({ sessionId: props.sessionId, tabId: tab.id,
    initialUrl: tab.navigation.params?.url, signal: tab.signal }), [props.sessionId, tab.id, tab.navigation.revision, tab.signal, props.mountTab]);
  HostReact.useLayoutEffect(() => {
    root.current.render(React.createElement(ReaRoot, { sessionId: props.sessionId, tabId: tab.id,
      visible: tab.visible, container: host.current, portal: overlay.current, initialUrl: tab.navigation.params?.url }));
  }, [props.sessionId, tab.id, tab.visible, tab.navigation.revision]);
  return HostReact.createElement('div', { ref: host, style: { height: '100%', width: '100%', minHeight: 0 } });
}
