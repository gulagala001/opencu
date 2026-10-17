import * as Host from "../host-boundaries.mjs";
import { z7 as c } from "./app-shared-2f2228189a8d.js";
import { Q4s as d } from "./app-initial-c468e3fd7f91.js";
import { hT as o } from "./app-shared-2f2228189a8d.js";
import { sCi as s } from "./app-shared-2f2228189a8d.js";
import { a as h } from "./timeline-activity-body-3a06d27aa6ba.js";
import { qJe as p } from "./app-primary-5433e23a397e.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as r } from "./app-shared-2f2228189a8d.js";
import { o as i } from "./app-shared-2f2228189a8d.js";
import { SPi as l } from "./app-shared-2f2228189a8d.js";
import { gT as a } from "./app-shared-2f2228189a8d.js";
import { lCi as n } from "./app-shared-2f2228189a8d.js";
import { WI as f } from "./app-primary-5433e23a397e.js";
import { o3s as u } from "./app-initial-c468e3fd7f91.js";
import { c as m } from "./timeline-activity-body-3a06d27aa6ba.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
function g(){let e=(0,v.c)(7),[t,n]=(0,y.useState)(0),r;e[0]===Symbol.for(`react.memo_cache_sentinel`)?(r=e=>{n(t=>t===e?t:e)},e[0]=r):r=e[0];let i=r,a;e[1]===Symbol.for(`react.memo_cache_sentinel`)?(a=e=>{i(_(e))},e[1]=a):a=e[1];let o=c(a),s;e[2]===o?s=e[3]:(s=e=>{e!=null&&i(e.scrollHeight),o(e)},e[2]=o,e[3]=s);let l=s,u;return e[4]!==t||e[5]!==l?(u={elementHeightPx:t,elementRef:l},e[4]=t,e[5]=l,e[6]=u):u=e[6],u}
function _(e){return e.borderBoxSize?(Array.isArray(e.borderBoxSize)?e.borderBoxSize[0]:e.borderBoxSize)?.blockSize??e.contentRect.height:e.contentRect.height}
var v;
var y;
function b(){return(b=e(()=>{v=r();y=i();l();}))();}
function x(e){let t=(0,S.c)(25),{defaultExpanded:n,indentContent:r,icon:i,onExpand:a,summary:c,status:l,children:u}=e,f=n!==void 0&&n,m=r===void 0||r,[_,v]=(0,C.useState)(!1),[y,b]=(0,C.useState)(f),{elementHeightPx:x,elementRef:T}=g(),E=l===`running`,D=u!=null,O=D&&(E?!_:y),k;t[0]!==_||t[1]!==y||t[2]!==O||t[3]!==E||t[4]!==a?(k=()=>{O||a?.(),E?v(!_):b(!y)},t[0]=_,t[1]=y,t[2]=O,t[3]=E,t[4]=a,t[5]=k):k=t[5];let A=k,j;t[6]!==E||t[7]!==c?(j=(0,w.jsx)(d,{active:E,className:`min-w-0 truncate text-size-chat text-text-tertiary/90 group-hover/activity-header:text-default`,children:c}),t[6]=E,t[7]=c,t[8]=j):j=t[8];let M=j,N;t[9]!==A||t[10]!==D||t[11]!==O?(N=D?{expanded:O,onToggle:A}:void 0,t[9]=A,t[10]=D,t[11]=O,t[12]=N):N=t[12];let P=N,F;t[13]!==u||t[14]!==x||t[15]!==T||t[16]!==m||t[17]!==D||t[18]!==O?(F=D?(0,w.jsx)(o.div,{initial:!1,animate:{height:O?x:0,opacity:+!!O},"aria-hidden":!O,inert:!O,className:O?`overflow-visible`:`overflow-hidden`,style:{pointerEvents:O?`auto`:`none`},transition:s,children:(0,w.jsx)(h,{ref:T,indent:m,children:u})}):null,t[13]=u,t[14]=x,t[15]=T,t[16]=m,t[17]=D,t[18]=O,t[19]=F):F=t[19];let I=F,L;return t[20]!==I||t[21]!==P||t[22]!==i||t[23]!==M?(L=(0,w.jsx)(p,{body:I,disclosure:P,icon:i,summary:M}),t[20]=I,t[21]=P,t[22]=i,t[23]=M,t[24]=L):L=t[24],L}
var S;
var C;
var w;
function T(){return(T=e(()=>{S=r();a();C=i();n();b();f();u();m();w=t();}))();}
function E(e){return e.result?.type===`error`&&e.result.error===`MCP tool call requires approval, but approval policy is never`}
export { c, d, o, s, h, p, e, r, i, l, a, n, f, u, m, t, g, _, v, y, b, x, S, C, w, T, E };
