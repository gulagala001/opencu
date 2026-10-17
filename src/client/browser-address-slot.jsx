import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { he as BrowserAddressSuggestionOverlay, ye as initializeBrowserAddress } from './rea/browser-address-suggestion-overlay-185e242f325f.js';
import { xfl as ComposerOverlay, Ofl as initializeComposerOverlay } from './rea/app-initial-c468e3fd7f91.js';
import { createReaPortal } from './portal-host.mjs';
import styles from './rea-styles.css';

const BrowserAddressContext = React.createContext(null);

/** REA's original composer overlay receives the DSH card anchor instead of a Codex composer scope. */
export function BrowserAddressOverlay(props) {
  const controller = React.useContext(BrowserAddressContext);
  return <ComposerOverlay {...props} anchorRef={controller.anchorRef} />;
}

function Suggestions({ sessionId, controller, value, portal }) {
  return <ReaProviders portal={portal} path={`/ca/${sessionId}`}>
    <BrowserAddressContext.Provider value={controller}>
      <BrowserAddressSuggestionOverlay browserConversationId={sessionId} composerId={`opencu:${sessionId}`}
        composerController={controller} placement="top" suggestionState={value} />
    </BrowserAddressContext.Provider>
  </ReaProviders>;
}

/** Register in conversation.input.overlay; useBrowserAddress is an inject-bound hook, never HostReact inside REA. */
export function BrowserAddressSlot(props) {
  const value = props.useBrowserAddress(value => value);
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    initializeBrowserAddress(); initializeComposerOverlay();
    const shadow = host.current.shadowRoot ?? host.current.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style'); sheet.textContent = styles;
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    const { dispose: disposePortal, portal } = createReaPortal(styles, container, 70);
    portal.dataset.composerOverlay = '';
    shadow.append(sheet, container);
    const root = createRoot(container, { onUncaughtError(error) { props.report(error.message); } });
    let binding;
    try { binding = props.connectBrowserAddress(host.current, container, portal, props.inputActions); }
    catch (error) { root.unmount(); disposePortal(); sheet.remove(); container.remove(); throw error; }
    mounted.current = { root, portal, controller: binding.controller };
    return () => {
      root.unmount(); binding.dispose(); disposePortal(); sheet.remove(); container.remove(); mounted.current = null;
    };
  }, [props.sessionId, props.connectBrowserAddress]);
  HostReact.useLayoutEffect(() => {
    const { root, portal, controller } = mounted.current;
    root.render(value ? <Suggestions key={props.sessionId} sessionId={props.sessionId} controller={controller}
      value={value} portal={portal} /> : null);
  }, [value, props.sessionId, props.connectBrowserAddress]);
  return HostReact.createElement('div', { ref: host, style: { display: 'contents' } });
}
