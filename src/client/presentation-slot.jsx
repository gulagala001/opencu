import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { tT as MonitorMenu, aT, Jw, Q as SummaryPanel, Te as Menu } from './rea/local-conversation-thread-6508b6dc26ad.js';
import { MonitorStack } from './presentation-stack.jsx';
import styles from './rea-styles.css';
import presentationStyles from './presentation.css';
import { createReaPortal } from './portal-host.mjs';
import { OverviewContent, initializeOverview } from './session-overview.jsx';

function Monitor({ sessionId, state, docked, service, report, overview }) {
  const intl = Shared.lS();
  const [open, setOpen] = React.useState(false);
  const active = state.activeTaskIds.includes(sessionId), shown = state.taskVisibilities[sessionId] === 'shown';
  const handoff = state.handoff?.sessionId === sessionId ? state.handoff : null;
  const frames = handoff ? handoff.frames : active ? state.frames.filter(frame => frame.threadID === sessionId && frame.placement === 'home') : [];
  const surface = React.useRef(null);
  const concealed = handoff && (handoff.placement === 'home' ? !handoff.landed : handoff.moving);
  React.useLayoutEffect(() => {
    if (!docked) return;
    return service.registerHome(sessionId, () => {
      const root = surface.current;
      if (!root) return null;
      const elements = [...root.querySelectorAll('[data-pip-presentation-frame]')];
      if (elements.length !== frames.length || !frames.length || elements.some(element => element.dataset.monitorReady !== 'true')) return null;
      return elements.map(element => { const rect = element.getBoundingClientRect(); return { id: element.dataset.pipPresentationFrame, x: rect.x, y: rect.y, width: rect.width, height: rect.height }; });
    });
  }, [docked, sessionId, frames.length, service]);
  const [exiting, setExiting] = React.useState(false);
  React.useLayoutEffect(() => { if (frames.length) setExiting(true); }, [frames.length]);
  if ((docked ? !frames.length && !exiting : !active && !overview)) return null;
  const label = overview ? '会话总览' : intl.formatMessage({ id: 'codex.localConversation.remoteHostedPip.pictureInPicture', defaultMessage: 'Picture in Picture' });
  const controls = <><MonitorMenu sessionId={sessionId} active={active} shown={shown}
    layout={{ activeThreadID: sessionId, placement: state.placements[sessionId] }} service={service} />
    {shown && state.hiddenTargetCounts?.[sessionId] > 0 && <Shared.r5 color="secondary" size="toolbar" onClick={() => service.showTask(sessionId)}>
      {intl.formatMessage({ id: 'opencu.monitor.restoreClosed', defaultMessage: intl.locale.startsWith('zh') ? '显示已关闭的预览' : 'Show closed previews' })}
    </Shared.r5>}</>;
  return docked ? <>
    <SummaryPanel.Content>{controls}</SummaryPanel.Content>
    <div ref={surface} data-pip-surface="" inert={!!handoff} aria-hidden={!!concealed} className="relative grid grid-cols-1 grid-rows-1" style={{ height: 240, padding: 16, maxWidth: 380, margin: '0 auto', visibility: concealed ? 'hidden' : undefined }}>
      <MonitorStack frames={frames} transferring={!!handoff} focus={service.focus} report={report} close={service.hideTarget} onEmpty={() => { if (!frames.length) setExiting(false); }} />
    </div>
  </> : <Menu open={open} onOpenChange={setOpen} align="end" contentRole="dialog"
    // SummaryPanel.Content owns the island surface. Menu only positions it and
    // handles dismissal; its default menu chrome would draw a second shell.
    contentStyle={{ background: 'transparent', padding: 0, boxShadow: 'none', backdropFilter: 'none' }}
    triggerButton={<SummaryPanel.HeaderButton label={label} pressed={open} />}>
    <SummaryPanel.PopoverContent><SummaryPanel.Content>{overview && <OverviewContent sessionId={sessionId} overview={overview} close={() => setOpen(false)}/>} {active && controls}</SummaryPanel.Content></SummaryPanel.PopoverContent>
  </Menu>;
}

/** Host slots supply monitoring data; REA retains the menu, frames and interactions. */
export function PresentationSlot(props) {
  const state = props.usePresentation(value => value);
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  HostReact.useLayoutEffect(() => {
    aT(); Jw(); initializeOverview();
    const shadow = host.current.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style'); sheet.textContent = styles + '\n' + presentationStyles;
    const container = document.createElement('div');
    container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    shadow.append(sheet, container);
    const { dispose: disposePortal, portal } = createReaPortal(styles, container, 70);
    const root = createRoot(container, { onUncaughtError(error) { props.report({ type: 'error', message: error.message }); } });
    mounted.current = { root, portal };
    return () => { root.unmount(); disposePortal(); mounted.current = null; };
  }, []);
  HostReact.useLayoutEffect(() => {
    const { root, portal } = mounted.current, sessionId = props.sessionId;
    root.render(<ReaProviders portal={portal} path={`/ca/${sessionId}`}>
      <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
        <Shared._lt scope={Shared.h1} value={{ routeKind: 'local-thread', pathname: `/ca/${sessionId}`, conversationId: sessionId, hostId: 'local' }}>
          <Monitor key={sessionId} sessionId={sessionId} state={state} docked={props.docked} service={props.service} report={props.report} overview={props.overview} />
        </Shared._lt>
      </Shared._lt>
    </ReaProviders>);
  }, [state, props.sessionId, props.docked, props.service, props.report, props.overview]);
  return HostReact.createElement('div', { ref: host, style: { minWidth: 0, flexShrink: 0 } });
}
