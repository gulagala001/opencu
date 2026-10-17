import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import * as Initial from './rea/app-initial-c468e3fd7f91.js';
import styles from './rea-styles.css';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { services } from './rea-services.mjs';
import { createReaPortal } from './portal-host.mjs';

function BrowserTitle({ sessionId, tabId, fallback }) {
  const subscribe = React.useCallback(listener => Initial.AW.subscribe(listener), []);
  const snapshot = React.useCallback(() => Initial.AW.getSnapshot(sessionId, tabId), [sessionId, tabId]);
  const activeSnapshot = React.useCallback(() => Initial.AW.isBrowserUseActive(sessionId, tabId), [sessionId, tabId]);
  const state = React.useSyncExternalStore(subscribe, snapshot, snapshot);
  const active = React.useSyncExternalStore(subscribe, activeSnapshot, activeSnapshot);
  const chrome = Initial.Afa({ ...state, isHighlighted: active }, { isSourceLive: true });
  const scope = Shared.oA(Shared.X), intl = Shared.lS();
  const [renaming, setRenaming] = React.useState(false);
  const identity = { conversationId: sessionId, browserTabId: tabId };
  const report = error => scope.get(Shared.FI).danger(error.message);
  const menu = () => Initial.zfa(scope, { browserConversationId: sessionId, browserTabId: tabId },
    { controller: { panelId: 'right' }, placement: 'tab-strip', onBeginRename: () => setRenaming(true) }).concat(services.browserHost.detachTab ? [{
      id: 'move-browser-window', icon: Shared._p,
      message: state?.isDetached ? { id: 'opencu.browser.dock', defaultMessage: 'Return to sidebar' }
        : { id: 'externalLink.contextMenu.openInNewWindow', defaultMessage: 'Open in new window' },
      onSelect: () => services.browserHost.detachTab(identity),
    }] : []).map(item => {
      const result = { ...item, onSelect: item.onSelect && (() => {
        try { Promise.resolve(item.onSelect()).catch(report); } catch (error) { report(error); }
      }) };
      if (item.id === 'new-browser-tab-to-the-right') result.message = { id: 'thread.browser.newTab', defaultMessage: 'New tab' };
      return result;
    });
  return <Shared.iMi getItems={menu} disableNative><span tabIndex={0}>
    <Initial.P8n id={tabId} title={state?.title || fallback} icon={chrome.icon}
      highlightedIcon={chrome.highlightedIcon} isHighlighted={chrome.isHighlighted}
      isSuspended={chrome.isSuspended} trailingContent={chrome.statusContent}
      rename={renaming ? { renameValue: state?.title || fallback, renamePlaceholder: intl.formatMessage({ id: 'codex.tabs.renameTitleAriaLabel', defaultMessage: 'Tab title' }),
        onFinishRenaming: () => setRenaming(false), onRename: title => { void services.browserHost.renameTab(identity, title).catch(report); } } : undefined}
      isLabel showsTabChrome={false} showCloseButton={false} tabActivator="span" />
  </span></Shared.iMi>;
}

export function BrowserTitleSlot(props) {
  const { tab } = props.useTabInfo();
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    Initial.H8n(); Initial.Pfa(); Initial.Gfa(); Shared.mMi();
    const shadow = host.current.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style'); sheet.textContent = styles;
    const container = document.createElement('span');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    container.dataset.theme = getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light';
    const { dispose: disposePortal, portal } = createReaPortal(styles, container, 70);
    shadow.append(sheet, container);
    const root = createRoot(container); mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(<ReaProviders portal={portal} path={`/ca/${props.sessionId}`}>
      <BrowserTitle sessionId={props.sessionId} tabId={tab.id} fallback={tab.title} />
    </ReaProviders>);
  }, [props.sessionId, tab.id, tab.title]);
  return HostReact.createElement('span', { ref: host, style: { display: 'inline-flex', maxWidth: '100%', minWidth: 0 } });
}
