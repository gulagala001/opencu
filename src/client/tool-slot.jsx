import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { DeliveryCards, initializeDeliveryCards } from './delivery-cards.jsx';
import { PermissionNotice, initializePermissionNotice } from './permission-notice.jsx';
import { xa as ToolContent, Ia } from './rea/mcp-tool-item-content-f32f64d93b42.js';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import styles from './rea-styles.css';
import { createReaPortal } from './portal-host.mjs';

function ToolRoute({ sessionId, item, files }) {
  const route = React.useMemo(() => ({ routeKind: 'local-thread', routeTemplate: '/ca/:conversationId',
    pathname: `/ca/${sessionId}`, conversationId: sessionId, hostId: 'local' }), [sessionId]);
  return <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
    <Shared._lt scope={Shared.h1} value={route}>
      <Shared._lt scope={Shared.j0r} value={{ kind: 'local', placement: 'main', conversationId: sessionId,
        clientThreadId: `local:${sessionId}`, routeConversationId: sessionId, browserTabMentionConversationId: sessionId }}>
        <ToolContent item={item} conversationId={sessionId} hostId="local" renderMcpApps={false} />
        <PermissionNotice item={item} />
        <DeliveryCards sessionId={sessionId} files={files} />
      </Shared._lt>
    </Shared._lt>
  </Shared._lt>;
}

function toolArguments(block, phase) {
  // alpha.3 supplies a partial view; rc.2 keeps the dispatched JSON on the call.
  if (block.args) return Object.fromEntries(block.args.keys().map(key => [key, block.args.text(key) ?? block.args.value(key)]));
  const raw = phase === 'result' ? block.call?.argsRaw : block.argsRaw;
  if (raw == null) return {};
  try { return JSON.parse(raw); }
  catch { return raw; /* Keep malformed call arguments visible in the original card. */ }
}

function toolItem(props) {
  const { block, phase, toolName, callId } = props;
  const args = toolArguments(block, phase);
  const completed = phase === 'result';
  const content = completed ? (block.content ?? []).filter(value => value.type === 'text').map(value => ({ ...value })) : [];
  return { id: callId, callId, type: 'mcpToolCall', functionName: toolName, completed,
    invocation: { server: 'computer-use', tool: toolName === 'computer_use' ? 'js' : toolName, arguments: args },
    source: { kind: 'computerUse' }, durationMs: completed && block.callTime != null ? block.time - block.callTime : undefined,
    result: !completed ? null : block.isError
      ? { type: 'error', error: content.map(value => value.text).join('\n') || block.error?.reason || block.error?.code }
      : { type: 'success', content, raw: { content, isError: false } },
  };
}

export function ToolSlot(props) {
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  const [attachments, setAttachments] = HostReact.useState({ block: null, content: [], error: null });
  const item = toolItem(props);
  if (item.result?.type === 'success' && attachments.block === props.block) item.result.content.push(...attachments.content);
  HostReact.useLayoutEffect(() => {
    Ia(); initializeDeliveryCards(); initializePermissionNotice();
    const shadow = host.current.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style'); sheet.textContent = styles;
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    container.dataset.theme = getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light';
    const { dispose: disposePortal, portal } = createReaPortal(styles, container, 70);
    shadow.append(sheet, container);
    const root = createRoot(container, { onUncaughtError(error) {
      console.error('OpenCU REA tool result', error);
      const alert = document.createElement('pre'); alert.setAttribute('role', 'alert');
      alert.style.whiteSpace = 'pre-wrap'; alert.textContent = error.stack || error.message;
      queueMicrotask(() => container.replaceChildren(alert));
    } });
    mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current;
    root.render(<ReaProviders portal={portal} path={`/ca/${props.sessionId}`}>
      <ToolRoute sessionId={props.sessionId} item={item} files={props.phase === 'result'
        ? (props.block.content ?? []).filter(value => value.type === 'file' && value.attachment).map(value => value.attachment) : []} />
      {attachments.block === props.block && attachments.error && <div role="alert" className="p-3 text-sm text-danger">{attachments.error}</div>}
    </ReaProviders>);
  });
  HostReact.useEffect(() => {
    if (props.phase !== 'result') return;
    let disposed = false;
    const images = (props.block.content ?? []).filter(value => value.type === 'image' && value.attachment);
    if (!images.length) return;
    Promise.all(images.map(async value => {
      const url = await props.loadImage(value.attachment);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load tool image: HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return { type: 'image', mimeType: value.attachment.mediaType, data: btoa(binary), attachment: value.attachment };
    })).then(content => {
      if (disposed) return;
      setAttachments({ block: props.block, content, error: null });
    }).catch(error => {
      console.error('OpenCU tool attachments', error);
      if (!disposed) setAttachments({ block: props.block, content: [], error: error.message });
    });
    return () => { disposed = true; };
  }, [props.block, props.phase, props.loadImage, props.sessionId]);
  return HostReact.createElement('div', { ref: host, style: { width: '100%', minWidth: 0 } });
}
