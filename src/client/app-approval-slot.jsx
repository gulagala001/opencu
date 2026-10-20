import HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { Aml as RequestCard } from './rea/app-initial-c468e3fd7f91.js';
import { E as AppApprovalCard } from './rea/computer-use-app-approval-request-card-82a4252ecef7.js';
import { initializePermissionNotice } from './permission-notice.jsx';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { adoptReaStyles, createReaPortal, createReaRenderFallback } from './portal-host.mjs';
import styles from './rea-styles.css';
function Approval({matched,portal}) {
 const sessionId=matched.sessionId;
 const route={routeKind:'local-thread',routeTemplate:'/ca/:conversationId',pathname:`/ca/${sessionId}`,conversationId:sessionId,hostId:'local'};
 return <ReaProviders portal={portal} path={`/ca/${sessionId}`}><Shared._lt scope={Shared.jX} value={{clientThreadId:`local:${sessionId}`,routeConversationId:sessionId}}><Shared._lt scope={Shared.h1} value={route}><Shared._lt scope={Shared.j0r} value={{kind:'local',placement:'main',conversationId:sessionId,clientThreadId:`local:${sessionId}`,routeConversationId:sessionId,browserTabMentionConversationId:sessionId}}><AppApprovalCard key={matched.requestId} ApprovalCard={RequestCard} conversationId={sessionId} hostId="local" request={matched.request} requestId={matched.requestId} onRequestSettled={()=>{}} /></Shared._lt></Shared._lt></Shared._lt></ReaProviders>;
}
export function AppApprovalSlot({sessionId,matched}) {
 const host=HostReact.useRef(null);
 HostReact.useLayoutEffect(()=>{
  if(!matched||matched.sessionId!==sessionId)return;
  initializePermissionNotice();
  const shadow=host.current.shadowRoot??host.current.attachShadow({mode:'open'}),container=document.createElement('div');
  container.dataset.reaRoot='';container.dataset.codexWindowType='electron';
  adoptReaStyles(shadow,styles);shadow.append(container);
  const {portal,dispose}=createReaPortal(styles,container,70);
  const fallback=createReaRenderFallback(container,'OpenCU REA app approval');
  const root=createRoot(container,{onUncaughtError:fallback.onUncaughtError});
  root.render(<Approval matched={matched} portal={portal}/>);
  return ()=>{fallback.dispose();root.unmount();dispose();shadow.replaceChildren();};
 },[sessionId,matched]);
 return HostReact.createElement('div',{ref:host,key:matched?.key,style:{width:'100%'}});
}
