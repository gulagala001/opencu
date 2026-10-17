import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { b as ComposerAnnotationEditor, w } from './rea/annotation-editor-2d914a40819d.js';
import { Qri } from './rea/app-initial-c468e3fd7f91.js';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import styles from './rea-styles.css';
import { createReaPortal } from './portal-host.mjs';
import { ReferenceEditorDialogContext } from './host-boundaries.mjs';

function Editor({ value, portal, save, remove, close }) {
  const comment = value.value.payload.comments[0], sessionId = value.sessionId;
  const annotation = React.useMemo(() => ({ content: [{ content_type: 'text', text: comment.body ?? '' }],
    localBrowserAttachedImages: comment.attachedImages,
    localBrowserDesignChange: comment.designChange ? { group: comment.designChange } : undefined,
  }), [comment]);
  return <ReaProviders portal={portal} path={`/ca/${sessionId}`}>
    <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
      <Shared._lt scope={Shared.h1} value={{ routeKind: 'local-thread', pathname: `/ca/${sessionId}`, conversationId: sessionId, hostId: 'local' }}>
        <Shared._lt scope={Shared.j0r} value={{ kind: 'local', placement: 'main', conversationId: sessionId,
          clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
          <Qri.Provider value={portal}>
            <ComposerAnnotationEditor annotation={annotation} cwd={null} onSave={save} onRemove={remove} onClose={close} />
          </Qri.Provider>
        </Shared._lt>
      </Shared._lt>
    </Shared._lt>
  </ReaProviders>;
}

function EditorPresence({ value, ...props }) {
  const [retained, retain] = React.useState(value), current = React.useRef(value);
  current.current = value;
  React.useLayoutEffect(() => { if (value) retain(value); }, [value]);
  const shown = value ?? retained;
  const lifecycle = React.useMemo(() => ({ open: !!value, closed() {
    if (!current.current) retain(null);
  } }), [value]);
  return shown && <ReferenceEditorDialogContext.Provider value={lifecycle}>
    <Editor key={`${shown.sessionId}:${shown.ref}`} value={shown} {...props} />
  </ReferenceEditorDialogContext.Provider>;
}

/** The real REA composer editor uses a DSH overlay; it never submits or cancels a turn. */
export function ReferenceEditorSlot(props) {
  const value = props.useEditor(value => value);
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    w();
    const shadow = host.current.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style'); sheet.textContent = styles;
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    container.dataset.theme = getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light';
    const { dispose: disposePortal, portal } = createReaPortal(styles, container, 70);
    shadow.append(sheet, container);
    const root = createRoot(container, { onUncaughtError(error) { props.report(error.message); } });
    mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(<EditorPresence value={value} portal={portal}
      save={props.save} remove={props.remove} close={props.close} />);
  }, [value, props.save, props.remove, props.close]);
  return HostReact.createElement('div', { ref: host, style: { display: 'contents' } });
}
