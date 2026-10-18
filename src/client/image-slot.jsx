import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { r5 as ReaButton, pur as DownloadIcon, lS as useIntl } from './rea/app-shared-2f2228189a8d.js';
import { d as createMarkupPreview, f as initializeMarkupExport } from './rea/export-30081509394d.js';
import { Ot as ImageViewport, Pt, mn as ImageTools, _n, Ft as RemoveSurface, Jt } from './rea/image-tools-toolbar-6d3d3fb8d826.js';
import { mi as CommentSurface, wi, Ti as CommentToolbar, Oi, Ii as FloatingToolbar, Vi } from './rea/image-side-panel-6c7023add54c.js';
import styles from './rea-styles.css';
import { createReaPortal } from './portal-host.mjs';
import { ViewerControls, initializeViewerControls } from './viewer-controls.jsx';
import { services } from './rea-services.mjs';
import { ImageMarkupCloseContext } from './host-boundaries.mjs';
import * as Shared from './rea/app-shared-2f2228189a8d.js';

const mediaTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml' };

function ImageRoute({ sessionId, children }) {
  const route = React.useMemo(() => ({ routeKind: 'local-thread', routeTemplate: '/ca/:conversationId',
    pathname: `/ca/${sessionId}`, conversationId: sessionId, hostId: 'local' }), [sessionId]);
  return <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
    <Shared._lt scope={Shared.h1} value={route}>{children}</Shared._lt>
  </Shared._lt>;
}

function ImagePreview({ src, title, resourceAddress, sessionId, data, mediaType, path, deliver, container, pane }) {
  const [mode, setMode] = React.useState('view');
  const intl = useIntl();
  const [comments, setComments] = React.useState([]);
  const [storageKey, setStorageKey] = React.useState(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(null);
  const [resizeOpen, setResizeOpen] = React.useState(false), [manualZoomPercent, setZoomPercent] = React.useState(null);
  const zoom = React.useMemo(() => ({ manualZoomPercent, onZoomPercentChange: setZoomPercent, onZoomToFit: () => setZoomPercent(null) }), [manualZoomPercent]);
  const submitting = React.useRef(false), markup = React.useRef(null), image = React.useRef(null);
  const lifetime = React.useRef(null), pendingClose = React.useRef(null), currentMode = React.useRef(mode);
  currentMode.current = mode;
  const [zoomContainer, setZoomContainer] = React.useState(null);
  const cancelClose = React.useCallback(() => { pendingClose.current?.(false); pendingClose.current = null; }, []);
  const leaveMarkup = React.useCallback(() => {
    pendingClose.current?.(true); pendingClose.current = null; setMode('view');
  }, []);
  React.useEffect(() => () => { lifetime.current?.abort(); cancelClose(); }, [cancelClose]);
  React.useEffect(() => pane.bindCloseGuard(() => {
    if (submitting.current) return Promise.resolve(false);
    if (currentMode.current !== 'markup') return Promise.resolve(true);
    if (!markup.current || markup.current.isReadOnly) return Promise.resolve(false);
    return new Promise(resolve => { pendingClose.current = resolve; markup.current.requestClose(); });
  }), [pane.bindCloseGuard]);
  React.useEffect(() => {
    const escape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || submitting.current || mode === 'view') return;
      event.preventDefault(); event.stopPropagation();
      if (mode === 'markup') markup.current?.requestClose(); else setMode('view');
    };
    container.addEventListener('keydown', escape);
    return () => container.removeEventListener('keydown', escape);
  }, [container, mode]);
  React.useEffect(() => {
    let active = true;
    crypto.subtle.digest('SHA-256', data).then(digest => {
      if (!active) return;
      const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const key = `opencu:image-comments:${sessionId}:${resourceAddress}:${hash}`;
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      setComments(saved); setStorageKey(key);
    }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [data, resourceAddress, sessionId]);
  const save = next => {
    try {
      if (!storageKey) throw new Error('The image comments are still loading');
      localStorage.setItem(storageKey, JSON.stringify(next)); setComments(next);
    }
    catch (error) { setError(error.message); }
  };
  const submit = async (prompt, maskSrc) => {
    if (submitting.current || !storageKey) return;
    const controller = new AbortController(); lifetime.current = controller;
    submitting.current = true; setBusy(true); setError(null);
    try {
      await deliver({ sessionId, resourceAddress, title, data, mediaType, comments, prompt, maskSrc, signal: controller.signal });
      controller.signal.throwIfAborted();
      if (mode === 'comment') save([]);
      setMode('view');
    } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { submitting.current = false; if (!controller.signal.aborted) setBusy(false); }
  };
  const submitMarkup = async () => {
    const editor = markup.current;
    if (submitting.current || !editor || editor.isReadOnly) return;
    editor.commitComment(); editor.editor.pointerCommit(); editor.editor.commitPendingTextEdit();
    const document = editor.editor.getSnapshot().effectiveDocument;
    if (!document.objects.some(object => object.kind !== 'eraser')) return;
    const controller = new AbortController(); lifetime.current = controller;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const preview = await createMarkupPreview(src, document, controller.signal, image.current ?? undefined);
      if (!preview) throw new Error(intl.formatMessage({ id: 'imageMarkup.prepareError', defaultMessage: 'Could not prepare markup. Try again' }));
      await deliver({ sessionId, resourceAddress, title, data, mediaType, comments: [], prompt: preview.prompt,
        markupSrc: preview.src, markupDocument: document, signal: controller.signal });
      controller.signal.throwIfAborted(); leaveMarkup();
    } catch (error) { if (!controller.signal.aborted) setError(error.message); }
    finally { submitting.current = false; if (!controller.signal.aborted) setBusy(false); }
  };
  const download = <ReaButton color="ghostActive" size="imageToolbar" radius="full" uniform
    aria-label={intl.formatMessage({ id: 'imageSidePanel.download', defaultMessage: 'Download image' })}
    onClick={() => {
      if (!path) { setError('The original image file is unavailable'); return; }
      void services.workspaceFiles.saveCopy({ hostId: 'local', path }).catch(error => setError(error.message));
    }}><DownloadIcon /></ReaButton>;
  const toolbar = mode === 'comment' ? <CommentToolbar variant="embedded" commentCount={comments.length}
    emptyMessage={intl.formatMessage({ id: 'imageSidePanel.commentHelperDesktop', defaultMessage: 'Click on the image to add comments' })} isSubmitting={busy} onCancel={() => setMode('view')}
    onSubmit={() => submit('')} /> : <ImageTools variant="embedded" canEditImage={!busy && !!storageKey}
    isLoading={!storageKey} showComment={!!storageKey} onComment={() => setMode('comment')} onMarkup={() => setMode('markup')} onErase={() => setMode('remove')}
    onRemoveBackground={() => submit('Remove the background. Preserve the foreground and use transparency.')}
    onResize={ratio => submit(`Change the image aspect ratio to ${ratio}.`)}
    resizeMenuOpen={resizeOpen} onResizeMenuOpenChange={setResizeOpen} downloadAction={download} />;
  return <div className="relative flex h-full min-h-0 flex-col">
    <div className="absolute right-2 top-2 z-40 flex items-center gap-1"><span ref={setZoomContainer} /><ViewerControls pane={pane} /></div>
    <ImageMarkupCloseContext.Provider value={cancelClose}>
    <ImageViewport mode={mode} src={src} alt={title} imageId={resourceAddress} isSubmitting={busy} zoom={zoom}
      imageRef={image} markupEditorRef={markup} onCancel={leaveMarkup} showCommentTool
      viewerZoomControlContainer={zoomContainer}
      onImageError={() => setError(intl.formatMessage({ id: 'imagePreview.loadError', defaultMessage: 'Could not load image' }))}
      toolbarVariant="imageTools" toolbarControls={toolbar}
      renderToolbar={content => <FloatingToolbar dragBoundary={container}>{content}{mode === 'markup' &&
        <ReaButton color="primary" size="imageToolbar" radius="full" disabled={busy} onClick={submitMarkup}>
          {intl.formatMessage({ id: 'opencu.imageMarkup.addToMessage', defaultMessage: 'Add to message' })}
        </ReaButton>}</FloatingToolbar>}
      renderOverlay={(viewport, imageSize, renderToolbar) => mode === 'comment'
        ? <CommentSurface src={src} alt={title} comments={comments} viewport={viewport}
          onDeleteComment={id => save(comments.filter(comment => comment.id !== id))}
          onSubmitComment={comment => {
            const item = { ...comment, id: comment.id ?? crypto.randomUUID() };
            save(comment.id ? comments.map(current => current.id === item.id ? item : current) : [...comments, item]);
          }} />
        : mode === 'remove' ? <RemoveSurface viewport={viewport} imageSize={imageSize}
          renderToolbar={renderToolbar} toolbarVariant="embedded" isSubmitting={busy}
          onCancel={() => setMode('view')} onSubmit={mask => submit('Remove the area marked in the mask image.', mask)} /> : null} />
    </ImageMarkupCloseContext.Provider>
    {error && <div role="alert" className="absolute inset-x-0 bottom-0 p-4 text-sm text-danger">{error}</div>}
  </div>;
}

export function ImageSlot(props) {
  const { sidebar, tab } = props.useTabInfo();
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  const pane = HostReact.useMemo(() => ({ fullscreen: sidebar.fullscreen, canExpand: true,
    toggle: () => { try { props.toggleFullscreen(host.current); } catch (error) { props.report(error.message); } }, close: tab.actions.close, bindCloseGuard: tab.actions.bindCloseGuard,
  }), [sidebar.fullscreen, props.toggleFullscreen, props.report, tab.actions]);
  const [image, setImage] = HostReact.useState(null);
  const resource = props.useResource(props.resourceAddress);
  HostReact.useEffect(() => {
    if (props.content.kind !== 'bytes') { setImage(null); return; }
    const title = decodeURIComponent(props.resourceAddress.split('/').at(-1));
    const mediaType = mediaTypes[title.split('.').at(-1).toLowerCase()];
    const src = URL.createObjectURL(new Blob([props.content.data], { type: mediaType }));
    setImage({ title, mediaType, data: props.content.data, src, resourceAddress: props.resourceAddress });
    return () => URL.revokeObjectURL(src);
  }, [props.content, props.resourceAddress]);
  HostReact.useLayoutEffect(() => {
    Pt(); _n(); Jt(); wi(); Oi(); Vi(); initializeMarkupExport(); initializeViewerControls();
    const shadow = host.current.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style'); sheet.textContent = styles;
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    container.style.cssText = 'height:100%;width:100%;min-height:0;position:relative';
    const { dispose: disposePortal, portal } = createReaPortal(styles, container);
    const root = createRoot(container, { onUncaughtError(error) {
      console.error('OpenCU REA image', error);
      const alert = document.createElement('pre'); alert.setAttribute('role', 'alert');
      alert.style.whiteSpace = 'pre-wrap'; alert.textContent = error.stack || error.message;
      queueMicrotask(() => container.replaceChildren(alert));
    } });
    shadow.append(sheet, container); mounted.current = { root, portal, container };
    props.scrollportRef(container);
    return () => { root.unmount(); disposePortal(); mounted.current = null; props.scrollportRef(null); };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal, container } = mounted.current;
    root.render(image && image.resourceAddress === props.resourceAddress && image.data === props.content.data ? <ReaProviders portal={portal} path={`/ca/${props.sessionId}`}>
      <ImageRoute sessionId={props.sessionId}>
        <ImagePreview key={image.src} {...image} pane={pane} path={resource.value?.absolutePath}
          sessionId={props.sessionId} resourceAddress={props.resourceAddress} deliver={props.deliverImage} container={container} />
      </ImageRoute>
    </ReaProviders> : null);
  }, [image, pane, props.content, props.resourceAddress, props.sessionId, props.deliverImage, resource.value?.absolutePath]);
  return HostReact.createElement('div', { ref: host, style: { height: '100%', width: '100%', minHeight: 320 } });
}
