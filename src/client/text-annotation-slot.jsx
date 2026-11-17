import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { u as SelectedTextEditor, m } from './rea/annotation-editor-8063237bdf92.js';
import styles from './rea-styles.css';
import { adoptReaStyles, createReaPortal } from './portal-host.mjs';

function SelectionActions({ copy, edit }) {
  return <div className="flex items-center gap-1 rounded-xl border border-default bg-surface-elevated p-1 shadow-lg"
    onPointerDown={event => event.preventDefault()}>
    <Shared.OGi buttonText={true} showTooltip={false} variant="codeBlock" onCopy={copy} />
    <Shared.r5 color="ghost" size="composerSm" onClick={edit}>
      <Shared.hS id="opencu.textAnnotation.quoteOrAnnotate" defaultMessage="Quote or annotate" />
    </Shared.r5>
  </div>;
}

function QuoteActions({ value, copy, edit, report }) {
  const anchor = HostReact.useRef(null), mounted = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    m(); Shared.NGi();
    const shadow = anchor.current.shadowRoot ?? anchor.current.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    const { dispose, portal } = createReaPortal(styles, container, 70);
    adoptReaStyles(shadow, styles); shadow.append(container);
    const root = createRoot(container, { onUncaughtError: error => report(error.message) });
    mounted.current = { root, portal };
    return () => { root.unmount(); container.remove(); dispose(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(<ReaProviders portal={portal} path={`/ca/${value.sessionId}`}>
      <SelectionActions copy={copy} edit={edit} />
    </ReaProviders>);
  }, [value.sessionId, copy, edit]);
  return HostReact.createElement('div', { ref: anchor });
}

export function withTextQuote(NativeQuote) {
  return function TextQuote(props) {
    const toolbar = HostReact.useRef(null), id = HostReact.useRef(Symbol('quote surface')).current;
    const { attachQuote, dismiss, clearSelection, readText, edit, copy, report } = props;
    const value = props.useAnnotation(value => value?.quoteSurface === id ? value : null);
    const enabled = props.useSession(s => !s.removed && (s.subagent === null || s.subagent.address.mode === 'continuable'));
    HostReact.useLayoutEffect(() => {
      if (!enabled) { dismiss(); return; }
      return attachQuote(id, toolbar.current, readText, dismiss, clearSelection);
    }, [enabled, id, attachQuote, readText, dismiss, clearSelection]);
    const open = HostReact.useCallback(() => edit(id), [edit, id]);
    const copySelection = HostReact.useCallback(() => copy(id), [copy, id]);
    if (!enabled) return null;
    return HostReact.createElement('div', { ref: toolbar, 'data-opencu-text-quote': '' }, value && !value.editing
      ? HostReact.createElement(QuoteActions, { value, edit: open, copy: copySelection, report })
      : HostReact.createElement(NativeQuote, props));
  };
}

function Editor({ value, portal, body, close, submit }) {
  const left = Math.max(8, Math.min(value.rect.left, innerWidth - 310));
  const top = Math.max(8, Math.min(value.rect.bottom + 8, innerHeight - 240));
  return <ReaProviders portal={portal} path={`/ca/${value.sessionId}`}>
    <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${value.sessionId}`, routeConversationId: value.sessionId }}>
      <Shared._lt scope={Shared.h1} value={{ routeKind: 'local-thread', pathname: `/ca/${value.sessionId}`, conversationId: value.sessionId, hostId: 'local' }}>
        <Shared._lt scope={Shared.j0r} value={{ kind: 'local', placement: 'main', conversationId: value.sessionId, clientThreadId: `local:${value.sessionId}`, routeConversationId: value.sessionId }}>
          <div style={{ position: 'fixed', left, top, pointerEvents: 'auto' }} aria-busy={value.pending}>
            <SelectedTextEditor draftBody={value.body} onBodyChange={body} onCancel={close} onEscape={close}
              onSubmit={body => submit(body, false)} onDirectSubmit={body => submit(body, true)} />
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
    const { dispose: disposePortal, portal } = createReaPortal(styles, { reaRoot: '', codexWindowType: 'electron' }, 70);
    const mount = document.createElement('div'); portal.append(mount);
    const root = createRoot(mount, { onUncaughtError: error => props.report(error.message) }); mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(value?.editing
      ? <Editor key={`${value.sessionId}:${value.nodeKey}:${value.start}:${value.text}`} value={value} portal={portal}
          body={props.body} close={props.close} submit={props.submit} /> : null);
  }, [value, props.body, props.close, props.submit]);
  return null;
}
