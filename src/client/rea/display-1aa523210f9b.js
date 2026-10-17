import * as Host from "../host-boundaries.mjs";
import { hS as g } from "./app-shared-2f2228189a8d.js";
import { cxn as w } from "./app-initial-c468e3fd7f91.js";
import { ixn as b } from "./app-initial-c468e3fd7f91.js";
import { t5 as l } from "./app-shared-2f2228189a8d.js";
import { pQi as s } from "./app-shared-2f2228189a8d.js";
import { oxn as E } from "./app-initial-c468e3fd7f91.js";
import { rxn as C } from "./app-initial-c468e3fd7f91.js";
import { nxn as x } from "./app-initial-c468e3fd7f91.js";
import { M8 as d } from "./app-shared-2f2228189a8d.js";
import { xgi as _ } from "./app-shared-2f2228189a8d.js";
import { h_i as o } from "./app-shared-2f2228189a8d.js";
import { kgi as u } from "./app-shared-2f2228189a8d.js";
import { qmi as f } from "./app-shared-2f2228189a8d.js";
import { N8 as c } from "./app-shared-2f2228189a8d.js";
import { Tgi as m } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as i } from "./app-shared-2f2228189a8d.js";
import { mQi as y } from "./app-shared-2f2228189a8d.js";
import { o as a } from "./app-shared-2f2228189a8d.js";
import { xS as p } from "./app-shared-2f2228189a8d.js";
import { n5 as n } from "./app-shared-2f2228189a8d.js";
import { pxn as T } from "./app-initial-c468e3fd7f91.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { Lhi as h } from "./app-shared-2f2228189a8d.js";
import { g_i as r } from "./app-shared-2f2228189a8d.js";
import { F8 as v } from "./app-shared-2f2228189a8d.js";
function k(e){let t=(0,A.c)(28),{ref:n,title:r,subtitle:i,ariaLabel:a,canOpen:o,onOpen:c,openLabel:u,actions:d}=e,f=(0,j.useId)(),p=(0,j.useId)(),m=d;if(d==null&&o){let e;t[0]===u?e=t[1]:(e=u??(0,M.jsx)(g,{id:`automation.updateDirective.open`,defaultMessage:`Open`,description:`Button label for opening an automation from a task message`}),t[0]=u,t[1]=e);let n;t[2]===e?n=t[3]:(n=(0,M.jsx)(w,{label:e}),t[2]=e,t[3]=n),m=n}let h;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(h=(0,M.jsx)(b,{children:(0,M.jsx)(l,{asset:s,"aria-hidden":!0})}),t[4]=h):h=t[4];let _;t[5]!==r||t[6]!==p?(_=(0,M.jsx)(`span`,{id:p,children:r}),t[5]=r,t[6]=p,t[7]=_):_=t[7];let v;t[8]!==f||t[9]!==i?(v=i?(0,M.jsx)(`span`,{id:f,children:i}):null,t[8]=f,t[9]=i,t[10]=v):v=t[10];let y;t[11]===m?y=t[12]:(y=m==null?null:(0,M.jsx)(`span`,{className:`pointer-events-auto flex shrink-0 items-center gap-1`,children:m}),t[11]=m,t[12]=y);let S;t[13]!==_||t[14]!==v||t[15]!==y?(S=(0,M.jsx)(E,{className:`pointer-events-none relative z-10`,icon:h,title:_,subtitle:v,trailing:y}),t[13]=_,t[14]=v,t[15]=y,t[16]=S):S=t[16];let T=S,D=a==null?p:void 0,O=i?f:void 0,k=!o,N=d==null?T:null,P;t[17]!==a||t[18]!==c||t[19]!==n||t[20]!==D||t[21]!==O||t[22]!==k||t[23]!==N?(P=(0,M.jsx)(C,{ref:n,"aria-label":a,"aria-labelledby":D,"aria-describedby":O,disabled:k,onClick:c,children:N}),t[17]=a,t[18]=c,t[19]=n,t[20]=D,t[21]=O,t[22]=k,t[23]=N,t[24]=P):P=t[24];let F=d==null?null:T,I;return t[25]!==P||t[26]!==F?(I=(0,M.jsx)(x,{as:`span`,className:`mt-3 select-none`,variant:`attachment`,children:(0,M.jsxs)(`span`,{className:`group/resource-card relative`,"data-automation-card":!0,children:[P,F]})}),t[25]=P,t[26]=F,t[27]=I):I=t[27],I}
var A;
var j;
var M;
function N(){return(N=e(()=>{A=i();y();j=a();p();n();T();M=t();}))();}
function R(){return(R=e(()=>{p();T();}))();}
function z(e,t,n){let r=t!=null&&d(t.automation)===`completed`,i=!r&&(t?.automation.is_enabled??e.isEnabled),a=t==null?e.title:_(t);if(!i)return{isEnabled:i,nextRunAt:null,scheduleLabel:r?n.formatMessage(o.completed):n.formatMessage(o.paused),title:a};let s=t?.automation.schedule??e.schedule,l=/^DTSTART[;:]/m.test(s)&&!/^RRULE:/m.test(s)||/(?:^|[;:])COUNT=1(?:;|$)/m.test(s),p=t==null?e.nextRunAt??null:u(t),h;return h=l?f({rrule:s,nextRunAt:p==null?null:Date.parse(p),intl:n,fallbackMessage:n.formatMessage({id:`settings.automations.rruleSummaryFallback`,defaultMessage:`Custom schedule`,description:`Fallback label when RRULE summary cannot be generated`})}):t==null?e.displaySchedule?.trim()||f({rrule:c(e.schedule),intl:n,fallbackMessage:n.formatMessage({id:`settings.automations.rruleSummaryFallback`,defaultMessage:`Custom schedule`,description:`Fallback label when RRULE summary cannot be generated`})}):m(t,n),{isEnabled:i,nextRunAt:p,scheduleLabel:h,title:a}}
function B(){return(B=e(()=>{h();r();v();}))();}
export { g, w, b, l, s, E, C, x, d, _, o, u, f, c, m, e, i, y, a, p, n, T, t, h, r, v, k, A, j, M, N, R, z, B };
