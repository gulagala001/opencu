import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { u as SelectedTextEditor, m } from './rea/annotation-editor-8063237bdf92.js';
import styles from './rea-styles.css';
import { createReaPortal } from './portal-host.mjs';

function Editor({ value, portal, body, close, submit, copy, edit }) {
  const left = Math.max(8, Math.min(value.rect.left, innerWidth - 310));
  const top = Math.max(8, Math.min(value.rect.bottom + 8, innerHeight - (value.editing ? 240 : 48)));
  return <ReaProviders portal={portal} path={`/ca/${value.sessionId}`}>
    <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${value.sessionId}`, routeConversationId: value.sessionId }}>
      <Shared._lt scope={Shared.h1} value={{ routeKind: 'local-thread', pathname: `/ca/${value.sessionId}`, conversationId: value.sessionId, hostId: 'local' }}>
        <Shared._lt scope={Shared.j0r} value={{ kind: 'local', placement: 'main', conversationId: value.sessionId, clientThreadId: `local:${value.sessionId}`, routeConversationId: value.sessionId }}>
          <div style={{ position: 'fixed', left, top, pointerEvents: 'auto' }} aria-busy={value.pending}>
            {value.editing ? <SelectedTextEditor draftBody={value.body} onBodyChange={body} onCancel={close} onEscape={close}
              onSubmit={body => submit(body, false)} onDirectSubmit={body => submit(body, true)} />
              : <div className="flex items-center gap-1 rounded-xl border border-default bg-surface-elevated p-1 shadow-lg"
                onPointerDown={event => event.preventDefault()}>
                <Shared.OGi buttonText={true} showTooltip={false} variant="codeBlock" onCopy={copy} />
                <Shared.r5 color="ghost" size="composerSm" onClick={edit}>
                  <Shared.hS id="opencu.textAnnotation.annotate" defaultMessage="Annotate" />
                </Shared.r5>
              </div>}
            {value.error && <div role="alert" className="bg-surface-elevated p-3 text-sm text-danger">{value.error}</div>}
          </div>
        </Shared._lt>
      </Shared._lt>
    </Shared._lt>
  </ReaProviders>;
}

export function TextAnnotationSlot(props) {
  const value = props.useAnnotation(value => value), mounted = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    m(); Shared.NGi();
    const { dispose: disposePortal, portal } = createReaPortal(styles, { reaRoot: '', codexWindowType: 'electron', theme: getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light' }, 70);
    const mount = document.createElement('div'); portal.append(mount);
    const root = createRoot(mount, { onUncaughtError: error => props.report(error.message) }); mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(value ? <Editor key={`${value.sessionId}:${value.nodeKey}:${value.start}:${value.text}`} value={value} portal={portal}
      body={props.body} close={props.close} submit={props.submit} copy={props.copy} edit={props.edit} /> : null);
  }, [value, props.body, props.close, props.submit, props.copy, props.edit]);
  return null;
}
