import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { en as DocxPreview, Nn } from './rea/docx-preview-panel-ce9d293c8160.js';
import { jn as PdfPreview, Wn } from './rea/pdf-preview-panel-3b484c934828.js';
import { Se as NotebookPreview, $ as initializeNotebook } from './rea/notebook-preview-panel-3f8901f8935f.js';
import { Do as ArtifactPreview, ns as initializeArtifacts } from './rea/artifact-tab-content.electron-64a58871ee86.js';
import { services } from './rea-services.mjs';
import styles from './rea-styles.css';
import { createReaPortal } from './portal-host.mjs';
import { ViewerControls, initializeViewerControls } from './viewer-controls.jsx';
import { createDocumentSource } from './document-source.mjs';

function DocumentContent({ sessionId, resourceAddress, data, path, title, kind, deliver, pane, lifecycle }) {
  const scope = Shared.oA(Shared.X);
  const target = React.useMemo(() => ({ conversationId: sessionId, hostId: 'local', path }), [sessionId, path]);
  const comments = Shared.iA(Shared.h2, target);
  const storageKey = `opencu:document-comments:${sessionId}:${resourceAddress}`;
  const [restored, setRestored] = React.useState(false), [error, setError] = React.useState(null);
  React.useLayoutEffect(() => {
    try { Shared.rGr(scope, target, JSON.parse(localStorage.getItem(storageKey) || '[]')); setRestored(true); }
    catch (error) { setError(error.message); }
  }, [scope, target, storageKey]);
  React.useEffect(() => {
    if (restored) try { localStorage.setItem(storageKey, JSON.stringify(comments)); }
    catch (error) { setError(error.message); }
  }, [restored, comments, storageKey]);
  React.useEffect(() => {
    let sending = false, disposed = false;
    const receive = message => {
      if (!['artifact-direct-comment', 'pdf-direct-comment'].includes(message?.type) || message.conversationId !== sessionId) return;
      const selected = message.comments ?? [message.comment];
      if (!selected.length || selected.some(comment => (comment?.localArtifactAnnotationContext?.path ?? comment?.localPdfContext?.path ?? comment?.position?.path) !== path)) return;
      if (sending) return;
      sending = true;
      void deliver({ sessionId, resourceAddress, path, title, comments: selected }).then(() => {
        const submission = scope.get(Shared.g2, target);
        const sent = new Set(selected);
        Shared.rGr(scope, target, current => current.filter(comment => !sent.has(comment)));
        if (submission?.sessionId === message.sessionId) { submission.onAccepted?.(); Shared.iGr(scope, target); }
        localStorage.setItem(storageKey, JSON.stringify(scope.get(Shared.h2, target)));
        if (!disposed) setError(null);
      }).catch(error => {
        Shared.tGr(scope, { ...target, sessionId: message.sessionId }); if (!disposed) setError(error.message);
      }).finally(() => { sending = false; });
    };
    const dispose = ['artifact-direct-comment', 'pdf-direct-comment'].map(type => Shared.Ff.subscribe(type, receive));
    return () => { disposed = true; for (const unsubscribe of dispose) unsubscribe(); };
  }, [scope, target, sessionId, resourceAddress, path, title, deliver, storageKey]);
  const documentSource = React.useMemo(() => ['pdf', 'ipynb'].includes(kind) ? createDocumentSource(data) : undefined, [kind, data]);
  const preview = React.useRef(null), intl = Shared.lS();
  const [editable, setEditable] = React.useState(false);
  React.useEffect(() => {
    let closed = false;
    if (!['xlsx', 'pptx'].includes(kind)) return;
    void services.workspaceFiles.getMetadata({ hostId: 'local', path }).then(value => {
      if (!closed) setEditable(value.editable === true);
    }).catch(error => { if (!closed) setError(error.message); });
    return () => { closed = true; };
  }, [path, kind]);
  const flush = React.useCallback(async () => {
    if (await preview.current?.flush() === false) throw new Error(intl.formatMessage({ id: 'opencu.document.unsaved', defaultMessage: 'This document has unsaved changes. Keep it open and try saving again.' }));
  }, [intl]);
  React.useLayoutEffect(() => {
    lifecycle.flush = flush;
    return () => { if (lifecycle.flush === flush) lifecycle.flush = async () => {}; };
  }, [lifecycle, flush]);
  const workbook = React.useMemo(() => kind === 'xlsx' && editable ? {
    artifactDocuments: { bindToExactFile: args => services.artifactDocuments.bindToExactFile({ ...args, onError: setError }) },
    publicFilePath: path, workspaceRoot: path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))),
    initialPublicFileBytes: data,
    onBeforePublicFileMaterialization: () => services.workspaceFiles.getMetadata({ hostId: 'local', path }),
    onPublicFileMaterialized: () => setError(null),
  } : undefined, [kind, path, data, editable]);
  React.useEffect(() => pane.bindCloseGuard(async () => {
    try { await flush(); return true; }
    catch (error) { setError(error.message); return false; }
  }), [pane.bindCloseGuard, flush]);
  const props = { hostId: 'local', path, title, annotationBatchingEnabled: true, headerPlacement: 'inline',
    headerRightContent: <ViewerControls pane={pane} />,
    onDownload: async () => { await flush(); return services.workspaceFiles.saveCopy({ hostId: 'local', path }); },
    onError: error => { if (error) setError(error.message || String(error)); },
    onImportError: error => { if (error) setError(error.message || String(error)); } };
  return <React.Suspense fallback={null}>
    {kind === 'docx' ? <DocxPreview {...props} bytes={data} /> : kind === 'pdf'
      ? <PdfPreview {...props} fileDataUrl={documentSource} /> : kind === 'ipynb'
        ? <NotebookPreview {...props} contentsBase64={documentSource} />
        : <ArtifactPreview {...props} threadId={sessionId} importKind={kind} previewRef={preview} commentsEnabled={editable}
            presentationEditingEnabled={kind === 'pptx' && editable} spreadsheetManualEditUiEnabled={kind === 'xlsx' && editable} xlsxArtifactDocument={workbook}
            artifactKind={kind === 'pptx' ? 'presentation' : 'spreadsheet'}
            sourceArtifactKind={kind === 'pptx' ? 'presentation' : 'spreadsheet'} sourceBytes={data} />}
    {error && <div role="alert" className="absolute inset-x-0 bottom-0 p-3 text-sm text-danger">{error}</div>}
  </React.Suspense>;
}

function DocumentRoute(props) {
  const route = React.useMemo(() => ({ routeKind: 'local-thread', pathname: `/ca/${props.sessionId}`, conversationId: props.sessionId, hostId: 'local' }), [props.sessionId]);
  return <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${props.sessionId}`, routeConversationId: props.sessionId }}>
    <Shared._lt scope={Shared.h1} value={route}>
      <Shared._lt scope={Shared.j0r} value={{ kind: 'local', placement: 'main', conversationId: props.sessionId, clientThreadId: `local:${props.sessionId}`, routeConversationId: props.sessionId }}>
        <DocumentContent {...props} />
      </Shared._lt>
    </Shared._lt>
  </Shared._lt>;
}

/** Original document viewers occupy the existing DSH file-preview body. */
export function DocumentSlot(props) {
  const { sidebar, tab } = props.useTabInfo();
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  const pane = HostReact.useMemo(() => ({ fullscreen: sidebar.fullscreen, canExpand: true,
    toggle: () => { try { props.toggleFullscreen(host.current); } catch (error) { props.report(error.message); } },
    close: tab.actions.close, bindCloseGuard: tab.actions.bindCloseGuard,
  }), [sidebar.fullscreen, props.toggleFullscreen, props.report, tab.actions]);
  const resource = props.useResource(props.resourceAddress);
  HostReact.useLayoutEffect(() => {
    Nn(); Wn(); initializeNotebook(); initializeArtifacts(); initializeViewerControls();
    const shadow = host.current.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style'); sheet.textContent = styles;
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    container.style.cssText = 'height:100%;width:100%;min-height:0;position:relative';
    const { dispose: disposePortal, portal } = createReaPortal(styles, container);
    const root = createRoot(container, { onUncaughtError(error) {
      console.error('OpenCU REA document', error);
      const alert = document.createElement('pre'); alert.setAttribute('role', 'alert');
      alert.style.whiteSpace = 'pre-wrap'; alert.textContent = error.stack || error.message;
      queueMicrotask(() => container.replaceChildren(alert));
    } });
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true; container.inert = true;
      root.unmount(); disposePortal(); mounted.current = null;
    };
    const lifecycle = { flush: async () => {} };
    shadow.append(sheet, container); mounted.current = { root, portal, lifecycle };
    const unregister = services.artifactDocuments.registerEditor({
      quiesce: () => { container.inert = true; },
      flush: () => lifecycle.flush(), stop,
      resume: () => { if (!stopped) container.inert = false; },
    });
    props.scrollportRef(container);
    return () => { unregister(); stop(); props.scrollportRef(null); };
  }, []);
  HostReact.useLayoutEffect(() => {
    if (!mounted.current) return;
    const { root, portal, lifecycle } = mounted.current;
    if (props.content.kind !== 'bytes' || !resource.value?.absolutePath) { root.render(null); return; }
    const title = decodeURIComponent(props.resourceAddress.split('/').at(-1));
    root.render(<ReaProviders portal={portal} path={`/ca/${props.sessionId}`}>
      <DocumentRoute key={props.resourceAddress} sessionId={props.sessionId} resourceAddress={props.resourceAddress} lifecycle={lifecycle}
        data={props.content.data} path={resource.value.absolutePath} title={title} kind={title.split('.').at(-1).toLowerCase()} deliver={props.deliverDocument} pane={pane} />
    </ReaProviders>);
  }, [props.content, props.resourceAddress, props.sessionId, props.deliverDocument, resource.value?.absolutePath, pane]);
  return HostReact.createElement('div', { ref: host, style: { height: '100%', width: '100%', minHeight: 320 } });
}
