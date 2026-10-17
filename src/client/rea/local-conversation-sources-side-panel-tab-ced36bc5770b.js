import * as Host from "../host-boundaries.mjs";
import { oA as o } from "./app-shared-2f2228189a8d.js";
import { h1 as u } from "./app-shared-2f2228189a8d.js";
import { lS as te } from "./app-shared-2f2228189a8d.js";
import { tA as r } from "./app-shared-2f2228189a8d.js";
import { v_c as M } from "./app-initial-c468e3fd7f91.js";
import { Dt as I } from "./thread-summary-panel-components-3aba951edec7.js";
import { xjs as ne } from "./app-initial-c468e3fd7f91.js";
import { hS as b } from "./app-shared-2f2228189a8d.js";
import { Win as ee } from "./app-shared-2f2228189a8d.js";
import { c as ie } from "./local-conversation-webmcp-tools-model-4c5708629975.js";
import { de as oe } from "./use-local-conversation-sources-fc9ee60ab4e3.js";
import { s as R } from "./local-conversation-webmcp-tools-model-4c5708629975.js";
import { x as H } from "./mcp-tool-call-approval-b02f87023626.js";
import { kqi as f } from "./app-shared-2f2228189a8d.js";
import { Vjs as k } from "./app-initial-c468e3fd7f91.js";
import { tK as A } from "./app-initial-c468e3fd7f91.js";
import { aJr as j } from "./app-initial-c468e3fd7f91.js";
import { Jjs as re } from "./app-initial-c468e3fd7f91.js";
import { CB as v } from "./app-shared-2f2228189a8d.js";
import { DYt as a } from "./app-shared-2f2228189a8d.js";
import { XGt as x } from "./app-shared-2f2228189a8d.js";
import { xa as B } from "./mcp-tool-item-content-f32f64d93b42.js";
import { CEi as l } from "./app-shared-2f2228189a8d.js";
import { ZO as D } from "./app-initial-c468e3fd7f91.js";
import { t5 as _ } from "./app-shared-2f2228189a8d.js";
import { Oer as p } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as s } from "./app-shared-2f2228189a8d.js";
import { SB as d } from "./app-shared-2f2228189a8d.js";
import { ker as i } from "./app-shared-2f2228189a8d.js";
import { sA as c } from "./app-shared-2f2228189a8d.js";
import { xS as y } from "./app-shared-2f2228189a8d.js";
import { Tjs as N } from "./app-initial-c468e3fd7f91.js";
import { y_c as C } from "./app-initial-c468e3fd7f91.js";
import { rK as T } from "./app-initial-c468e3fd7f91.js";
import { $O as E } from "./app-initial-c468e3fd7f91.js";
import { Wjs as w } from "./app-initial-c468e3fd7f91.js";
import { n5 as n } from "./app-shared-2f2228189a8d.js";
import { oJr as O } from "./app-initial-c468e3fd7f91.js";
import { wEi as g } from "./app-shared-2f2228189a8d.js";
import { Ia as z } from "./mcp-tool-item-content-f32f64d93b42.js";
import { T as V } from "./mcp-tool-call-approval-b02f87023626.js";
import { OB as h } from "./app-shared-2f2228189a8d.js";
import { g1 as m } from "./app-shared-2f2228189a8d.js";
import { X as ae } from "./use-local-conversation-sources-fc9ee60ab4e3.js";
import { Yjs as P } from "./app-initial-c468e3fd7f91.js";
import { l as L } from "./local-conversation-webmcp-tools-model-4c5708629975.js";
import { kt as F } from "./thread-summary-panel-components-3aba951edec7.js";
import { $ as se } from "./use-local-conversation-sources-fc9ee60ab4e3.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { Bqi as S } from "./app-shared-2f2228189a8d.js";
function U(e){let t=(0,K.c)(6),{calls:n}=e,r,i;if(t[0]!==n){let e=R(n);r=`flex flex-col gap-1`,i=e.map(W),t[0]=n,t[1]=r,t[2]=i}else r=t[1],i=t[2];let a;return t[3]!==r||t[4]!==i?(a=(0,q.jsx)(`ul`,{className:r,children:i}),t[3]=r,t[4]=i,t[5]=a):a=t[5],a}
function W(e){let t=e.calls.filter(le);return(0,q.jsx)(`li`,{children:(0,q.jsx)(H,{icon:null,indentContent:!1,status:`completed`,summary:(0,q.jsx)(`span`,{className:`text-sm leading-5 text-secondary`,children:(0,q.jsx)(b,{id:`codex.localConversation.sources.panel.toolUseCount`,defaultMessage:`{name} {count, plural, one {once} other {# times}}`,description:`Completed tool activity label and number of uses of a source`,values:{count:e.calls.length,name:e.name}})}),children:t.length===0?null:(0,q.jsx)(`ul`,{className:`flex flex-col gap-2`,children:t.map((t,n)=>(0,q.jsxs)(`li`,{className:`flex min-w-0 flex-col gap-2`,children:[t.kind!==`invokeTool`||t.inputJson==null?null:(0,q.jsx)(f,{codeContainerClassName:`max-h-48 overflow-auto`,content:G(t.inputJson),language:`json`,showStickyRightContent:!1,title:t.inputTruncated?(0,q.jsx)(b,{id:`codex.localConversation.webMcpTools.inputTruncated`,defaultMessage:`Input (truncated)`,description:`Title for truncated WebMCP tool input JSON`}):(0,q.jsx)(b,{id:`codex.localConversation.webMcpTools.input`,defaultMessage:`Input`,description:`Title for WebMCP tool input JSON`})}),t.outputJson==null?null:(0,q.jsx)(f,{codeContainerClassName:`max-h-48 overflow-auto`,content:G(t.outputJson),language:`json`,showStickyRightContent:!1,title:t.outputTruncated?(0,q.jsx)(b,{id:`codex.localConversation.webMcpTools.resultTruncated`,defaultMessage:`Result (truncated)`,description:`Title for truncated WebMCP tool result JSON`}):(0,q.jsx)(b,{id:`codex.localConversation.webMcpTools.result`,defaultMessage:`Result`,description:`Title for WebMCP tool result JSON`})})]},`${e.name}:${n}`))})})},e.name)}
function le(e){return e.kind===`invokeTool`&&e.inputJson!=null||e.outputJson!=null}
function G(e){try{return JSON.stringify(JSON.parse(e),null,2)}catch{return e}}
var K;
var q;
function J(){return(J=e(()=>{K=s();y();S();V();L();q=t();}))();}
function de(e){let t=(0,Z.c)(54),{conversationId:n,externalSources:i,fileSources:s,getImagePreviewSrc:c,hostId:d,onOpenFile:f,onOpenImage:p,onOpenMcpApp:m,toolSources:h,webMcpCalls:g,webSearchSource:_}=e,y=o(u),S=te(),C=Host.useSiteToolSources(),w;t[0]===S?w=t[1]:(w=S.formatMessage({id:`codex.localConversation.sources.panel.listLabel`,defaultMessage:`Sources`,description:`Accessible label for the complete source list side panel`}),t[0]=S,t[1]=w);let T=w,E,D,O,k,N,P;if(t[2]!==i||t[3]!==s||t[4]!==c||t[5]!==d||t[6]!==f||t[7]!==p||t[8]!==T||t[9]!==C||t[10]!==g){if(P=new Map,C)for(let e of g){if(e.sourceHostname==null)continue;let t=P.get(e.sourceHostname);t==null?P.set(e.sourceHostname,[e]):t.push(e)}if(D=I.SourcesSidePanel,E=I.SourcesSidePanelList,O=T,t[17]!==s||t[18]!==c||t[19]!==f||t[20]!==p){let e;t[22]!==c||t[23]!==f||t[24]!==p?(e=e=>{let t=e.fsPath||e.path||e.label,n=c?.(t)??null,r;return n!=null&&p!=null?r=()=>p(e,n):f!=null&&(r=()=>f(e)),(0,Q.jsx)(I.SourceDetails,{icon:(0,Q.jsx)(ne,{getImagePreviewSrc:c,iconClassName:`icon-sm`,imageClassName:`size-[18px] rounded-[3px] border border-default`,path:t}),label:e.label,meta:t,onOpen:r,children:(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.fileAttached`,defaultMessage:`Attached to the conversation`,description:`Explanation of how a file source was used`})},ee(e))},t[22]=c,t[23]=f,t[24]=p,t[25]=e):e=t[25],k=s.map(e),t[17]=s,t[18]=c,t[19]=f,t[20]=p,t[21]=k}else k=t[21];N=i.map(e=>{let t=ie(e.url),n=t==null||e.title!==t?[]:P.get(t)??[];t!=null&&e.title===t&&P.delete(t);let r;return e.activities.includes(`provided`)||(r=e.provider==null?e.url:`${e.provider.name} · ${e.url}`),(0,Q.jsxs)(oe,{hostId:d,meta:r,presentation:`side-panel`,resource:e,children:[(0,Q.jsx)(`ul`,{className:`flex flex-col gap-1`,children:e.activities.map(Y)}),n.length===0?null:(0,Q.jsx)(U,{calls:n})]},e.key)}),t[2]=i,t[3]=s,t[4]=c,t[5]=d,t[6]=f,t[7]=p,t[8]=T,t[9]=C,t[10]=g,t[11]=E,t[12]=D,t[13]=O,t[14]=k,t[15]=N,t[16]=P}else E=t[11],D=t[12],O=t[13],k=t[14],N=t[15],P=t[16];let F;t[26]===P?F=t[27]:(F=Array.from(P,me),t[26]=P,t[27]=F);let L;if(t[28]!==n||t[29]!==d||t[30]!==m||t[31]!==y||t[32]!==h){let e;t[34]!==n||t[35]!==d||t[36]!==m||t[37]!==y?(e=e=>{let t=ge(e),r=e.mcpAppId;return(0,Q.jsx)(I.SourceDetails,{icon:(0,Q.jsx)(A,{alt:``,className:`icon-sm shrink-0 object-contain`,fallback:(0,Q.jsx)(j,{className:`icon-sm shrink-0`}),knownAppId:re(e),logoDarkUrl:e.logoUrlDark,logoUrl:e.logoUrl}),label:t,onOpen:r==null||m==null?void 0:()=>m(r),children:(0,Q.jsx)(`ul`,{className:`flex flex-col gap-1`,children:e.activities.flatMap(t=>{if(t.calls.length===0)return[];let r=(0,Q.jsx)(`span`,{className:`text-sm leading-5 text-secondary`,children:(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.toolUseCount`,defaultMessage:`{name} {count, plural, one {once} other {# times}}`,description:`Completed tool activity label and number of uses of a source`,values:{count:t.calls.length,name:t.label}})}),i=()=>{v(y,a,{sectionType:x.CODEX_SOURCES_SECTION_TYPE_MCP_TOOL_CALLS,appName:e.trustedAnalyticsAppName,itemCount:t.calls.length})};return t.calls.length===1?t.calls.map(e=>(0,Q.jsx)(`li`,{children:(0,Q.jsx)(X,{conversationId:n,hostId:d,item:e,onExpand:i,summary:r})},e.callId)):[(0,Q.jsx)(`li`,{children:(0,Q.jsx)(H,{icon:null,indentContent:!1,onExpand:i,status:`completed`,summary:r,children:(0,Q.jsx)(`ul`,{className:`flex flex-col gap-1`,children:t.calls.map(e=>(0,Q.jsx)(`li`,{children:(0,Q.jsx)(X,{conversationId:n,expandedContentOnly:!0,hostId:d,item:e})},e.callId))})})},t.label)]})})},e.id)},t[34]=n,t[35]=d,t[36]=m,t[37]=y,t[38]=e):e=t[38],L=h.map(e),t[28]=n,t[29]=d,t[30]=m,t[31]=y,t[32]=h,t[33]=L}else L=t[33];let R;t[39]!==S||t[40]!==y||t[41]!==_?(R=_==null?null:(0,Q.jsx)(I.SourceDetails,{icon:(0,Q.jsx)(l,{"aria-hidden":!0,className:`icon-sm shrink-0`}),label:S.formatMessage({id:`codex.localConversation.sources.webSearch`,defaultMessage:`Web search`,description:`Label for web search in the thread summary side panel sources section`}),children:(0,Q.jsxs)(`ul`,{className:`flex flex-col gap-1`,children:[_.queryCount>0?(0,Q.jsx)(`li`,{children:(0,Q.jsx)(H,{icon:null,indentContent:!1,onExpand:()=>{v(y,a,{sectionType:x.CODEX_SOURCES_SECTION_TYPE_WEB_SEARCHES,itemCount:_.queryCount})},status:`completed`,summary:(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.webSearchCount`,defaultMessage:`{count, plural, one {Searched once} other {Searched # times}}`,description:`Summary of how many web search queries were sent`,values:{count:_.queryCount}}),children:_.queries.length===0?null:(0,Q.jsx)(`ul`,{className:`flex flex-col gap-1`,children:_.queries.map(pe)})})}):null,_.viewedLinks.length>0?(0,Q.jsx)(`li`,{children:(0,Q.jsx)(H,{icon:null,indentContent:!1,onExpand:()=>{v(y,a,{sectionType:x.CODEX_SOURCES_SECTION_TYPE_WEB_PAGES,itemCount:_.viewedLinks.length})},status:`completed`,summary:(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.webPageCount`,defaultMessage:`{count, plural, one {Opened one page} other {Opened # pages}}`,description:`Summary of how many web pages were opened`,values:{count:_.viewedLinks.length}}),children:(0,Q.jsx)(`ul`,{className:`flex flex-col gap-1.5`,children:_.viewedLinks.map(fe)})})}):null]})}),t[39]=S,t[40]=y,t[41]=_,t[42]=R):R=t[42];let z;t[43]!==E||t[44]!==O||t[45]!==k||t[46]!==N||t[47]!==F||t[48]!==L||t[49]!==R?(z=(0,Q.jsxs)(E,{label:O,children:[k,N,F,L,R]}),t[43]=E,t[44]=O,t[45]=k,t[46]=N,t[47]=F,t[48]=L,t[49]=R,t[50]=z):z=t[50];let B;return t[51]!==D||t[52]!==z?(B=(0,Q.jsx)(D,{children:z}),t[51]=D,t[52]=z,t[53]=B):B=t[53],B}
function fe(e){return(0,Q.jsx)(`li`,{children:(0,Q.jsxs)(`button`,{className:`flex min-w-0 cursor-interaction items-center gap-1.5 rounded-sm text-start text-info hover:underline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring`,title:e.url,type:`button`,onClick:t=>{D({event:t,href:e.url,initiator:`browser_use`,source:`browser_use`})},children:[(0,Q.jsx)(_,{className:`shrink-0`,asset:p}),(0,Q.jsx)(`span`,{className:`truncate`,children:e.label})]})},e.url)}
function pe(e){return(0,Q.jsx)(`li`,{className:`break-words`,children:e},e)}
function me(e){let[t,n]=e;return(0,Q.jsx)(I.SourceDetails,{icon:(0,Q.jsx)(k,{className:`icon-sm shrink-0`,href:`https://${t}`}),label:t,children:(0,Q.jsx)(U,{calls:n})},t)}
function Y(e){return(0,Q.jsx)(`li`,{children:(0,Q.jsx)(he,{activity:e})},e)}
function X(e){let t=(0,Z.c)(7),{conversationId:n,expandedContentOnly:r,hostId:i,item:a,onExpand:o,summary:s}=e,c=r!==void 0&&r,l;return t[0]!==n||t[1]!==c||t[2]!==i||t[3]!==a||t[4]!==o||t[5]!==s?(l=(0,Q.jsx)(B,{conversationId:n,expandedContentOnly:c,hideTextBlocksWithStructuredContent:!0,hostId:i,item:a,loadRemoteLogos:!1,onExpand:o,renderMcpApps:!1,summary:s,summaryIcon:null}),t[0]=n,t[1]=c,t[2]=i,t[3]=a,t[4]=o,t[5]=s,t[6]=l):l=t[6],l}
function he(e){let t=(0,Z.c)(4),{activity:n}=e;switch(n){case`provided`:{let e;return t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.activity.provided`,defaultMessage:`Provided in the conversation`,description:`Source activity label for a resource provided by the user`}),t[0]=e):e=t[0],e}case`read`:{let e;return t[1]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.activity.read`,defaultMessage:`Read during the chat`,description:`Source activity label for a resource read during the task`}),t[1]=e):e=t[1],e}case`created`:{let e;return t[2]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.activity.created`,defaultMessage:`Created during the chat`,description:`Source activity label for a resource created during the task`}),t[2]=e):e=t[2],e}case`updated`:{let e;return t[3]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,Q.jsx)(b,{id:`codex.localConversation.sources.panel.activity.updated`,defaultMessage:`Updated during the chat`,description:`Source activity label for a resource updated during the task`}),t[3]=e):e=t[3],e}}}
function ge(e){return e.name.trim()||e.pluginDisplayNames.join(`, `)}
var Z;
var Q;
function $(){return($=e(()=>{Z=s();d();i();c();y();N();C();T();E();w();n();O();g();z();V();h();m();ae();P();J();L();F();se();Q=t();}))();}
export { o, u, te, r, M, I, ne, b, ee, ie, oe, R, H, f, k, A, j, re, v, a, x, B, l, D, _, p, e, s, d, i, c, y, N, C, T, E, w, n, O, g, z, V, h, m, ae, P, L, F, se, t, S, U, W, le, G, K, q, J, de, fe, pe, me, Y, X, he, ge, Z, Q, $ };
