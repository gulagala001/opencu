import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { createReaPortal } from './portal-host.mjs';
import styles from './rea-styles.css';
import { p as HiddenBrowserUseWebviewHost, b } from './rea/hidden-browser-use-webview-host-bdd4db5a6c73.js';

/** The original hidden host retains the same Electron page between visible mounts. */
export function HiddenBrowserSlot(props) {
  const pages = props.usePages(value => value);
  const container = HostReact.useRef(null), root = HostReact.useRef(null), overlay = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    b();
    const { portal, dispose } = createReaPortal(styles, { reaRoot: '', codexWindowType: 'electron' }, 60);
    overlay.current = portal;
    root.current = createRoot(container.current);
    return () => { root.current.unmount(); root.current = null; dispose(); overlay.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    root.current.render(<ReaProviders portal={overlay.current} path="/opencu-hidden-pages">
      {pages.map(page => <HiddenBrowserUseWebviewHost key={page.key}
        conversationId={page.conversationId} browserUseTabIdsKey={page.browserTabId} />)}
    </ReaProviders>);
  }, [pages]);
  return HostReact.createElement('div', { ref: container, 'aria-hidden': true, style: { display: 'contents' } });
}
