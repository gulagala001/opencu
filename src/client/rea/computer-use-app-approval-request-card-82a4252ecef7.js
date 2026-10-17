import * as Host from "../host-boundaries.mjs";
import { oA as o } from "./app-shared-2f2228189a8d.js";
import { X as s } from "./app-shared-2f2228189a8d.js";
import { lS as h } from "./app-shared-2f2228189a8d.js";
import { tA as a } from "./app-shared-2f2228189a8d.js";
import { iOr as t } from "./app-shared-2f2228189a8d.js";
import { hL as S } from "./app-shared-2f2228189a8d.js";
import { t5 as _ } from "./app-shared-2f2228189a8d.js";
import { mar as g } from "./app-shared-2f2228189a8d.js";
import { hS as x } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as c } from "./app-shared-2f2228189a8d.js";
import { har as n } from "./app-shared-2f2228189a8d.js";
import { sA as l } from "./app-shared-2f2228189a8d.js";
import { Qhn as p } from "./app-shared-2f2228189a8d.js";
import { o as u } from "./app-shared-2f2228189a8d.js";
import { xS as y } from "./app-shared-2f2228189a8d.js";
import { tR as f } from "./app-shared-2f2228189a8d.js";
import { n5 as i } from "./app-shared-2f2228189a8d.js";
import { gI as d } from "./app-shared-2f2228189a8d.js";
import { NL as b } from "./app-shared-2f2228189a8d.js";
import { aOr as m } from "./app-shared-2f2228189a8d.js";
import { K as r } from "./app-shared-2f2228189a8d.js";
var w;
function T(){return(T=e(()=>{w=``+new URL(`computer-use-plugin-icon-5eae5ff78888.png`,import.meta.url).href;}))();}
function E(e){let n=(0,D.c)(42),{ApprovalCard:r,conversationId:i,hostId:c,onRequestSettled:l,request:u,requestId:d}=e,f=o(s),p=h(),m=a(t)??S(`has-approved-computer-use-app`,!1),y;n[0]!==i||n[1]!==c||n[2]!==d?(y=JSON.stringify([c,i,d]),n[0]=i,n[1]=c,n[2]=d,n[3]=y):y=n[3];let b=y,T=(0,O.useRef)(null),[E,A]=(0,O.useState)(null),j=u.riskLevel===`high`,M;n[4]!==m||n[5]!==p||n[6]!==u.subtitle?(M=[m===!1?p.formatMessage({id:`composer.computerUseAppApproval.disclosure`,defaultMessage:`Computer Use lets ChatGPT use apps on your computer. It may take screenshots of app contents while working. You can choose which apps ChatGPT can access, stop actions at any time, and control whether screenshots are used for training.`,description:`First-use disclosure explaining native Computer Use app access, screenshot capture, and user controls, shown until the user approves an app`}):void 0,u.subtitle].filter(Boolean).join(`

`)||void 0,n[4]=m,n[5]=p,n[6]=u.subtitle,n[7]=M):M=n[7];let N=M,P;n[8]!==i||n[9]!==c||n[10]!==l||n[11]!==d||n[12]!==b||n[13]!==f?(P=(e,n)=>{let r=n===void 0?null:n;T.current!==b&&(T.current=b,A(b),e===`accept`&&f.set(t,!0),Host.services.computerUseSettings.respondAppApproval({conversationId:i,requestId:d,action:e,persist:r}).then(()=>l(e),()=>{T.current===b&&(T.current=null,A(null))}))},n[8]=i,n[9]=c,n[10]=l,n[11]=d,n[12]=b,n[13]=f,n[14]=P):P=n[14];let F=P,I;n[15]!==j||n[16]!==u.connectorName?(I=j?(0,k.jsxs)(k.Fragment,{children:[(0,k.jsx)(_,{className:`shrink-0 text-warning`,"aria-hidden":!1,asset:g}),(0,k.jsx)(`span`,{className:`font-medium text-warning`,children:(0,k.jsx)(x,{id:`composer.mcpToolCallApproval.elevatedRiskLabel`,defaultMessage:`Elevated Risk`,description:`Header label for elevated-risk MCP approval requests`})})]}):(0,k.jsxs)(k.Fragment,{children:[(0,k.jsx)(`img`,{alt:``,className:`icon-sm rounded-[3px] object-contain`,draggable:!1,src:w}),(0,k.jsx)(`span`,{children:u.connectorName})]}),n[15]=j,n[16]=u.connectorName,n[17]=I):I=n[17];let L;n[18]===u.appDisplayName?L=n[19]:(L=(0,k.jsx)(x,{id:`composer.computerUseAppApproval.title.chatgpt`,defaultMessage:`Allow ChatGPT to use {appDisplayName}?`,description:`Title asking whether ChatGPT may use an app through Computer Use`,values:{appDisplayName:u.appDisplayName}}),n[18]=u.appDisplayName,n[19]=L);let R;n[20]===N?R=n[21]:(R=N&&(0,k.jsx)(`span`,{className:`whitespace-pre-line`,children:N}),n[20]=N,n[21]=R);let z=E===b,B;n[22]!==F||n[23]!==u.persistModes?(B=u.persistModes.includes(`always`)?{label:(0,k.jsx)(x,{id:`composer.computerUseAppApproval.action.alwaysApprove`,defaultMessage:`Always allow`,description:`Button label for always approving Computer Use access to an app`}),onClick:()=>F(`accept`,`always`)}:void 0,n[22]=F,n[23]=u.persistModes,n[24]=B):B=n[24];let V;n[25]===Symbol.for(`react.memo_cache_sentinel`)?(V=(0,k.jsx)(x,{id:`composer.computerUseAppApproval.action.approve`,defaultMessage:`Allow this conversation`,description:`Primary action label for approving Computer Use access to an app`}),n[25]=V):V=n[25];let H;n[26]!==F||n[27]!==u.persistModes?(H=()=>{F(`accept`,u.persistModes.includes(`session`)?`session`:null)},n[26]=F,n[27]=u.persistModes,n[28]=H):H=n[28];let U;n[29]===F?U=n[30]:(U=()=>{F(`decline`)},n[29]=F,n[30]=U);let W;n[31]!==H||n[32]!==U||n[33]!==z||n[34]!==B?(W={isLoading:z,leadingAction:B,approveLabel:V,onApprove:H,onDeny:U},n[31]=H,n[32]=U,n[33]=z,n[34]=B,n[35]=W):W=n[35];let G;return n[36]!==r||n[37]!==W||n[38]!==I||n[39]!==L||n[40]!==R?(G=(0,k.jsx)(r,{headerContent:I,title:L,subtitle:R,actions:W}),n[36]=r,n[37]=W,n[38]=I,n[39]=L,n[40]=R,n[41]=G):G=n[41],G}
var D;
var O;
var k;
function A(){return(A=e(()=>{D=c();n();l();p();O=u();y();f();T();i();d();b();m();k=r();}))();}
export { o, s, h, a, t, S, _, g, x, e, c, n, l, p, u, y, f, i, d, b, m, r, w, T, E, D, O, k, A };
