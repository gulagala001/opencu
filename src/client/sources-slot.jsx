import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { services } from './rea-services.mjs';
import { _lt as Scope, jX as ThreadScope, h1 as RouteScope } from './rea/app-shared-2f2228189a8d.js';
import { de as SourcesContent, $ as initializeSources } from './rea/local-conversation-sources-side-panel-tab-ced36bc5770b.js';
import styles from './rea-styles.css';
import { adoptReaStyles, createReaPortal } from './portal-host.mjs';

function Sources({ sessionId }) {
  const saved = React.useSyncExternalStore(services.sources.subscribe, services.sources.getSnapshot, services.sources.getSnapshot);
  const [error, setError] = React.useState(null);
  const source = saved[sessionId];
  const files = React.useMemo(() => (source?.files ?? []).map(file => ({ label: file.name, fsPath: file.name, path: services.files.address(file), file })), [source]);
  const route = React.useMemo(() => ({ routeKind: 'local-thread', pathname: `/ca/${sessionId}`, conversationId: sessionId, hostId: 'local' }), [sessionId]);
  return <Scope scope={ThreadScope} value={{ clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
    <Scope scope={RouteScope} value={route}>
      <SourcesContent conversationId={sessionId} hostId="local" fileSources={files} externalSources={source?.pages ?? []}
        toolSources={[]} webMcpCalls={source?.webMcpCalls ?? []} webSearchSource={null}
        onOpenFile={item => { void services.files.preview(item.file, sessionId).catch(error => setError(error.message)); }} />
      {error && <div role="alert" className="p-3 text-sm text-danger">{error}</div>}
    </Scope>
  </Scope>;
}

export function SourcesSlot({ sessionId }) {
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    initializeSources();
    const shadow = host.current.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    const { dispose: disposePortal, portal } = createReaPortal(styles, container, 70);
    adoptReaStyles(shadow, styles); shadow.append(container);
    const root = createRoot(container, { onUncaughtError(error) {
      console.error('OpenCU REA sources', error);
      const alert = document.createElement('pre'); alert.setAttribute('role', 'alert');
      alert.style.whiteSpace = 'pre-wrap'; alert.textContent = error.stack || error.message;
      queueMicrotask(() => container.replaceChildren(alert));
    } });
    mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(<ReaProviders portal={portal} path={`/ca/${sessionId}`}><Sources sessionId={sessionId} /></ReaProviders>);
  }, [sessionId]);
  return HostReact.createElement('div', { ref: host, style: { height: '100%', width: '100%', minHeight: 0, overflow: 'auto' } });
}
