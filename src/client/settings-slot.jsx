import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { da as BrowserSettings, gi, Va } from './rea/browser-use-settings-61138c2e595e.js';
import { jA as useLocation, _lt as Scope, jX as ThreadScope, h1 as RouteScope } from './rea/app-shared-2f2228189a8d.js';
import { CapabilitySettings, CapabilityDetails, CapabilityProvider, initializeCapabilities } from './capability-settings.jsx';
import { services } from './rea-services.mjs';
import styles from './rea-styles.css';
import { createReaPortal } from './portal-host.mjs';

function SettingsContent() {
  const { pathname, search } = useLocation();
  const route = React.useMemo(() => ({ routeKind: 'other', pathname, search, hostId: 'local' }), [pathname, search]);
  const section = pathname.match(/^\/settings\/(?:computer-use\/(applications|connections)|browser-use\/(managed))$/);
  return <Scope scope={ThreadScope} value={{ clientThreadId: null, routeConversationId: null }}>
    <Scope scope={RouteScope} value={route}><CapabilityProvider>
      {section ? <CapabilityDetails section={section[1] || section[2]} />
        : pathname === '/settings/computer-use' || pathname === '/settings/browser-use'
          ? <div className="mx-auto flex w-full max-w-2xl flex-col gap-10"><CapabilitySettings /><BrowserSettings /></div> : <BrowserSettings />}
    </CapabilityProvider></Scope>
  </Scope>;
}

export function SettingsSlot() {
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  const currentPath = HostReact.useSyncExternalStore(services.settingsRoute.subscribe, services.settingsRoute.getSnapshot, services.settingsRoute.getSnapshot);
  HostReact.useLayoutEffect(() => {
    Va(); gi(); initializeCapabilities();
    const shadow = host.current.shadowRoot ?? host.current.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = styles;
    const mount = document.createElement('div');
    mount.dataset.reaRoot = ''; mount.dataset.codexWindowType = 'electron';
    // DSH's settings overlay is at 1000; body-portaled menus must sit above it.
    const { portal, dispose: disposePortal } = createReaPortal(styles, mount, 1001);
    const root = createRoot(mount, { onUncaughtError(error) {
      console.error('OpenCU REA settings', error);
      const alert = document.createElement('pre'); alert.setAttribute('role', 'alert');
      alert.style.whiteSpace = 'pre-wrap'; alert.textContent = error.stack || error.message;
      queueMicrotask(() => mount.replaceChildren(alert));
    } });
    shadow.replaceChildren(style, mount);
    mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; shadow.replaceChildren(); };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(<ReaProviders key={currentPath} portal={portal} path={currentPath}><SettingsContent /></ReaProviders>);
  }, [currentPath]);
  return HostReact.createElement('div', { ref: host, style: { width: '100%', minWidth: 0 } });
}
