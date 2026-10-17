import React from 'react';
import { createPortal } from 'react-dom';
import { Zi as CommentEditor } from './rea/annotation-comment-editor-card-788d882d42ad.js';
import { services } from './rea-services.mjs';

/** Places the original editor at the selected real-page anchor in DSH's portal. */
export function AnnotationOverlay({ sessionId, tabId, portal, visible }) {
  const host = services.browserHost;
  const subscribe = React.useCallback(listener => host.subscribeEditor(listener), [host]);
  const read = React.useCallback(() => host.editorFor(sessionId, tabId), [host, sessionId, tabId]);
  const session = React.useSyncExternalStore(subscribe, read, read);
  const [size, setSize] = React.useState({ width: 360, height: 160 });
  const [lightDismissible, setLightDismissible] = React.useState(true), [error, setError] = React.useState(null);
  const [, setLayout] = React.useState(0);
  const surface = React.useRef(null);
  const act = React.useCallback((action, ...args) => Promise.resolve().then(() => host.annotationAction(sessionId, tabId, action, ...args))
    .then(value => { setError(null); return value; })
    .catch(error => { setError(error.message); }), [host, sessionId, tabId]);
  React.useEffect(() => {
    if (!session || !visible) return;
    const resize = () => setLayout(value => value + 1), observer = new ResizeObserver(resize);
    if (surface.current?.parentElement) observer.observe(surface.current.parentElement);
    window.addEventListener('resize', resize); window.addEventListener('scroll', resize, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('scroll', resize, true); };
  }, [session?.sessionId, visible]);
  React.useEffect(() => {
    if (!session || !visible || !session.focusRevision) return;
    surface.current?.querySelector('[contenteditable="true"],textarea,input')?.focus({ preventScroll: true });
  }, [session?.focusRevision, session?.sessionId, visible]);
  React.useEffect(() => {
    if (!session || !visible) return;
    const escape = event => { if (event.key === 'Escape' && lightDismissible) void act('close'); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [session, visible, lightDismissible, act]);
  if (!session || !visible) return null;
  const bounds = host.guestBounds(sessionId, tabId), anchor = session.anchorState;
  const point = anchor.cardViewportRect ?? anchor.viewportRect ?? anchor.anchor?.rect ?? {};
  const scaleX = bounds.width / (anchor.viewportSize?.width || bounds.width);
  const scaleY = bounds.height / (anchor.viewportSize?.height || bounds.height);
  const x = (point.x ?? point.left ?? anchor.viewportPoint?.x ?? bounds.width / 2) * scaleX;
  const y = (point.y ?? point.top ?? anchor.viewportPoint?.y ?? bounds.height / 3) * scaleY;
  const width = Math.max(1, Math.min(Math.max(size.width, 320), bounds.width - 24));
  const left = Math.max(bounds.left + 12, Math.min(bounds.left + x, bounds.right - width - 12));
  const top = Math.max(bounds.top + 12, Math.min(bounds.top + y + (point.height ?? 0) * scaleY + 12, innerHeight - size.height - 12));
  return createPortal(<div ref={surface} style={{ position: 'fixed', left, top, width, zIndex: 56 }}>
    <CommentEditor key={session.sessionId} session={session} browserTabId={tabId}
      windowHeight={Math.max(180, innerHeight - top - 12)} windowWidth={width} maxSurfaceWidth={width}
      annotationSelectionAnchors={[anchor.anchor, ...anchor.additionalAnchors ?? []]}
      defaultDesignEditorOpen={session.target.mode === 'design'} defaultCreateSubmitMode={session.defaultCreateSubmitMode} keyboardEventTarget={window}
      onSubmit={value => act('save', value)} onDirectSubmit={value => act('save', value, true)}
      onCancel={() => act('close')} onEscape={() => lightDismissible && act('close')} onDelete={() => act('remove')}
      onBodyChange={value => act('body', value)} onLightDismissibilityChange={setLightDismissible}
      onMounted={(_id, value) => setSize(previous => previous.width === value.width && previous.height === value.height ? previous : value)}
      onDesignChangeUpdate={value => act('design', value)} onDesignChangeDelete={() => act('design', null)}
      onTweaksEditorOpenChange={open => act('sync', { isTweaksEditorOpen: open })}
      onDesignControlInteractionChange={value => act('dispatch', { type: 'browser-sidebar-runtime-design-scrub-changed', ...value })}
      onAnnotationSelectionHoverChange={selectionIndex => act('dispatch', { type: 'browser-sidebar-runtime-annotation-selection-hover-state', selectionIndex })}
      onAnnotationSelectionRemove={selectionIndex => act('dispatch', { type: 'browser-sidebar-runtime-remove-annotation-selection', selectionIndex })}
    />
    {error && <div role="alert" className="rounded-md bg-surface-elevated p-3 text-sm text-danger">{error}</div>}
  </div>, portal);
}
