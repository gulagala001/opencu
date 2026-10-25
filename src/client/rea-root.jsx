import React from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ReaPortalContext, services } from './host-boundaries.mjs';
import { AnnotationOverlay } from './annotation-overlay.jsx';
import { reaIntl, subscribeReaLocale } from './rea-locale.mjs';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import * as Initial from './rea/app-initial-c468e3fd7f91.js';
import { sl as BrowserPanel, Il } from './rea/tab-content-6a1dfa5c5ac1.js';
import { VNt as BrowserFindController, HNt as BrowserFindBar, UNt } from './rea/app-primary-5433e23a397e.js';

let queryClient;
// DSH owns model authentication. This local plugin has no Codex cloud account or
// ChatGPT app directory; the original auth consumers must see that real boundary.
const codexAuth = Object.freeze({ openAIAuth: null, authMethod: null, requiresAuth: false,
  email: null, planAtLogin: null, isLoading: false, isCopilotApiAvailable: false,
  accountId: null, userId: null, computeResidency: null });
export function initializeRea() {
  Il(); UNt(); Shared.CHe(); Shared.ust(); Shared.DF(); Shared.gI(); Shared.RX(); Shared.g1(); Initial.uC(); Initial.jmc(); Initial.lDi();
  queryClient ??= new Shared.lst();
  const stored = JSON.parse(localStorage.getItem('opencu:rea-state') || '{}');
  Shared.MLt(stored, (key, value) => {
    if (value === undefined) delete stored[key]; else stored[key] = value;
    localStorage.setItem('opencu:rea-state', JSON.stringify(stored));
  });
}

function renderBrowserSlots({ headerRows, content }) {
  return <div className="flex h-full min-h-0 flex-col" data-app-shell-focus-area="right-panel">
    {headerRows.map(row => <div key={row.id} className="shrink-0" style={{ height: row.height === 'content' ? undefined : 'var(--height-toolbar)' }}>{row.content}</div>)}
    <div className="relative min-h-0 flex-1" data-app-shell-pane-content-viewport="">{content}</div>
  </div>;
}

function BrowserFindOverlay({ portal, visible, container }) {
  const [bounds, setBounds] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      setBounds(previous => previous?.top === rect.top && previous?.right === rect.right && previous?.width === rect.width
        ? previous : { top: rect.top, right: rect.right, width: rect.width });
    };
    const observer = new ResizeObserver(update); observer.observe(container); update();
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [visible, container]);
  React.useLayoutEffect(() => {
    if (!portal || !visible) return;
    let focused, timer;
    const observer = new MutationObserver(() => {
      const input = portal.querySelector('input[id^="content-search-input-"]');
      if (input !== focused) {
        clearTimeout(timer);
        // Menu dismissal restores its trigger after the find bar mounts.
        if (input) timer = setTimeout(() => {
          if (input.isConnected && focused === input) { input.focus(); input.select(); }
        }, 0);
      }
      focused = input;
    });
    observer.observe(portal, { childList: true, subtree: true });
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [portal, visible]);
  if (!visible || !bounds) return null;
  return <BrowserFindController>{controller => createPortal(
    <div style={{ position: 'fixed', top: bounds.top + 42, right: Math.max(12, innerWidth - bounds.right + 12), zIndex: 55, maxWidth: Math.max(120, bounds.width - 24) }}>
      <BrowserFindBar controller={controller} />
    </div>, portal)}</BrowserFindController>;
}

function BrowserRoute({ sessionId, tabId, visible, container, portal }) {
  const layout = React.useMemo(() => ({
    leftPanelAnimatedWidth: new Shared.XKe(0), rightPanelAnimatedWidth: new Shared.XKe(0),
    rightPanelLayoutTick: new Shared.XKe(0), contentPaneElement: container,
  }), [container]);
  React.useLayoutEffect(() => {
    const update = () => {
      const bounds = container.getBoundingClientRect();
      layout.leftPanelAnimatedWidth.set(bounds.left);
      layout.rightPanelAnimatedWidth.set(bounds.width);
      layout.rightPanelLayoutTick.set(layout.rightPanelLayoutTick.get() + 1);
    };
    const observer = new ResizeObserver(update); observer.observe(container); update();
    return () => observer.disconnect();
  }, [container, layout]);
  const appScope = Shared.oA(Shared.X);
  React.useEffect(() => {
    if (!visible) return;
    const shortcuts = event => {
      if (event.defaultPrevented || event.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (!['f', 'l', 't'].includes(key)) return;
      const identity = { conversationId: sessionId, browserTabId: tabId };
      if (!event.composedPath().includes(container) && !services.browserHost.isPageFocused(identity)) return;
      event.preventDefault(); event.stopPropagation();
      const action = key === 't' ? services.browserHost.newTab(identity)
        : services.browserHost.runPageCommand({ ...identity, command: { type: key === 'f' ? 'open-find' : 'focus-address' } });
      void action.catch(error => appScope.get(Shared.FI).danger(error.message));
    };
    window.addEventListener('keydown', shortcuts, true);
    return () => window.removeEventListener('keydown', shortcuts, true);
  }, [visible, sessionId, tabId, container, appScope]);
  React.useEffect(() => Shared.Ff.subscribe('browser-sidebar-command-error', event => {
    if (event.conversationId === sessionId && event.browserTabId === tabId) appScope.get(Shared.FI).danger(event.error.message);
  }), [appScope, sessionId, tabId]);
  React.useEffect(() => {
    const key = event => Initial.i8n(appScope, event);
    const pointer = event => flushSync(() => key(event));
    const blur = () => Initial.n8n(appScope);
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', key, true);
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true);
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('blur', blur); blur();
    };
  }, [appScope]);
  const route = React.useMemo(() => ({ routeKind: 'local-thread', routeTemplate: '/ca/:conversationId',
    pathname: `/ca/${sessionId}`, conversationId: sessionId, hostId: 'local' }), [sessionId]);
  return <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
    <Shared._lt scope={Shared.h1} value={route}>
      <Initial.lC.Provider value={layout}>
        <BrowserPanel conversationId={sessionId} browserTabId={tabId} isVisible={visible} panelTarget="right" renderSlots={renderBrowserSlots} />
        <BrowserFindOverlay portal={portal} visible={visible} container={container} />
        <AnnotationOverlay sessionId={sessionId} tabId={tabId} portal={portal} visible={visible} />
      </Initial.lC.Provider>
    </Shared._lt>
  </Shared._lt>;
}

export function ReaProviders({ portal, path, children }) {
  // Every REA overlay needs its own styles; falling back to the host body can
  // turn an empty notification viewport into a full-window input blocker.
  if (!portal) throw new Error('REA providers require a styled portal');
  const intl = React.useSyncExternalStore(subscribeReaLocale, reaIntl, reaIntl);
  const history = React.useMemo(() => Shared.Ult({ initialEntries: [path], v5Compat: true }), [path]);
  const [current, setCurrent] = React.useState(() => ({ history, location: history.location }));
  if (current.history !== history) setCurrent({ history, location: history.location });
  const location = current.history === history ? current.location : history.location;
  React.useEffect(() => history.listen(event => {
    if (event.location.pathname.startsWith('/settings') && !path.startsWith('/settings')) {
      services.openSettings(event.location.pathname);
      return;
    }
    setCurrent({ history, location: event.location });
  }), [history, path]);
  return <ReaPortalContext.Provider value={portal}><Shared.fft navigator={history} location={location}>
    <Shared.SHe {...intl}>
    <Shared.xNt client={queryClient}>
      <Shared.plt queryClient={queryClient}>
        <Shared._lt scope={Shared.X} value={{ host: 'dsh' }}>
          <Shared.v2.Provider value={codexAuth}><Initial.Omc><Initial.oDi>{children}</Initial.oDi></Initial.Omc></Shared.v2.Provider>
        </Shared._lt>
      </Shared.plt>
    </Shared.xNt>
    </Shared.SHe>
  </Shared.fft></ReaPortalContext.Provider>;
}

export function ReaRoot(props) {
  return <ReaProviders portal={props.portal} path={`/ca/${props.sessionId}`}><BrowserRoute {...props} /></ReaProviders>;
}
