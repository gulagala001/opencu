import * as Host from "../host-boundaries.mjs";
import { hS as l } from "./app-shared-2f2228189a8d.js";
import { f as p } from "./app-connect-skeleton-a7fcc03f1395.js";
import { MW as u } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as r } from "./app-shared-2f2228189a8d.js";
import { o as i } from "./app-shared-2f2228189a8d.js";
import { xS as c } from "./app-shared-2f2228189a8d.js";
import { g as f } from "./app-connect-skeleton-a7fcc03f1395.js";
import { PW as d } from "./app-initial-c468e3fd7f91.js";
import { sxi as o } from "./app-shared-2f2228189a8d.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { rxi as a } from "./app-shared-2f2228189a8d.js";
import { Lf as s } from "./app-shared-2f2228189a8d.js";
var __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./app-connect-modal-content-9a52dc3a1677.js","./rolldown-runtime-2d059c5e81f4.js","./app-shared-2f2228189a8d.js","./app-shared-9a94b907ed47.css","./app-initial-c468e3fd7f91.js","./app-initial-99e8b4b455fa.css","./client-37a80205968b.js","./app-connect-mfa-continuation-8054d1457afa.js","./app-connect-load-state-da6975266357.js","./app-connect-skeleton-a7fcc03f1395.js","./app-connect-queries-9a5a6abbd473.js","./microsoft-oauth-bundle-d3907c124361.js","./background-ce9b0228a159.js","./google-logo-5b25ca29a0f5.js","./country-codes-1c845666fc28.js","./run-fe10163e2a17.js","./app-google-drive-e28c84581680.js","./app-connect-modal-content-8102d824cf6b.css"])))=>i.map(i=>d[i]);
function h(e){let t=(0,_.c)(3),n=e.app!=null||e.connectorId!=null,[r,i]=(0,v.useState)(n);n&&!r&&i(!0);let a;return t[0]!==r||t[1]!==e?(a=r?(0,y.jsx)(v.Suspense,{fallback:e.showLoadingDialog===!1?null:(0,y.jsx)(g,{...e}),children:(0,y.jsx)(b,{...e})}):null,t[0]=r,t[1]=e,t[2]=a):a=t[2],a}
function g(e){let t=(0,_.c)(13),{app:n,connectorId:r,onOpenChange:i,onUserDismissed:a,failed:o,embedded:s}=e,c=o!==void 0&&o,d=n!=null||r!=null,f;t[0]!==i||t[1]!==a?(f=e=>{e||a?.(),i(e)},t[0]=i,t[1]=a,t[2]=f):f=t[2];let m;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(m=(0,y.jsx)(l,{id:`appConnectModal.loadError`,defaultMessage:`Couldn’t open app connection`,description:`Title when downloading the app connection dialog fails after retrying`}),t[3]=m):m=t[3];let h;t[4]!==s||t[5]!==c?(h=c?null:(0,y.jsx)(p,{embedded:s}),t[4]=s,t[5]=c,t[6]=h):h=t[6];let g;return t[7]!==s||t[8]!==c||t[9]!==d||t[10]!==f||t[11]!==h?(g=(0,y.jsx)(u,{open:d,size:`setup`,onOpenChange:f,failed:c,embedded:s,title:m,children:h}),t[7]=s,t[8]=c,t[9]=d,t[10]=f,t[11]=h,t[12]=g):g=t[12],g}
var _;
var v;
var y;
var b;
function x(){return(x=e(()=>{_=r();v=i();c();f();d();o();y=t();b=a(async()=>(await s(async()=>{let{AppConnectModal:e}=await import(`./app-connect-modal-content-9a52dc3a1677.js`);return{AppConnectModal:e};},__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17]),import.meta.url)).AppConnectModal,{suspendToParent:!0,errorFallback:e=>(0,y.jsx)(g,{...e,failed:!0})});}))();}
export { l, p, u, e, r, i, c, f, d, o, t, a, s, __vite__mapDeps, h, g, _, v, y, b, x };
