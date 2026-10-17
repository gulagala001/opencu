import * as Host from "../host-boundaries.mjs";
import { Vzn as l } from "./app-initial-c468e3fd7f91.js";
import { d5 as i } from "./app-shared-2f2228189a8d.js";
import { wxi as o } from "./app-shared-2f2228189a8d.js";
import { q as s } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as n } from "./app-shared-2f2228189a8d.js";
import { Jj as u } from "./app-initial-c468e3fd7f91.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { o as r } from "./app-shared-2f2228189a8d.js";
import { f5 as a } from "./app-shared-2f2228189a8d.js";
function d(e,t,n,r,i=0,a=0){if(e==null)return{x:Math.round((r-t.width)/2),y:Math.round((n-t.height)/2)};let o=16-i/2,s=e.endsWith(`left`)?o:r-t.width-o;return e===`bottom-center`&&(s=Math.round((r-t.width)/2)),{x:s,y:e.startsWith(`top`)?a+o:n-t.height-o}}
function f(e,t,n,r=!1){let i=e.left+e.width/2;return!r&&e.top+e.height/2>=t/2&&i>=n/4&&i<=n*3/4?`bottom-center`:`${e.top+e.height/2<t/2?`top`:`bottom`}-${e.left+e.width/2<n/2?`left`:`right`}`}
function p(e,t,n){return _.reduce((r,i)=>{let a=d(r,e,t,n);return g(e,d(i,e,t,n))<g(e,a)?i:r})}
function m(e,t,n,r,i,a,o,s=0){let c=d(e,n,a,o,s).x+r,l=t===`left`?c+n.width-i:c,u=16-s/2;return Math.min(o-i-u,Math.max(u,l))-d(e,{...n,width:i},a,o,s).x}
function h(e,t){if(t==null)return e;let n=e.endsWith(`left`)?`bottom-left`:`bottom-right`;return n===t?n===`bottom-left`?`bottom-right`:`bottom-left`:n}
function g(e,t){return(e.left-t.x)**2+(e.top-t.y)**2}
var _;
function v(){return(v=e(()=>{_=[null,`bottom-left`,`bottom-right`];}))();}
function y(e){let t=(0,x.c)(34),{edge:n,getCurrentSize:r,maximumSize:a,minimumSize:c,onResizeEnd:l,onResizingChange:u,setSize:d,verticalEdge:f}=e,p=n===void 0?`left`:n,m=f===void 0?`top`:f,h=i(),g=(0,S.useRef)(null),_;t[0]!==p||t[1]!==a||t[2]!==c||t[3]!==d||t[4]!==m||t[5]!==h?(_=e=>{let t=g.current;if(t==null||t.pointerId!==e.pointerId)return;e.preventDefault();let n={height:b(t.startSize.height+(m===`top`?-1:1)*(o(e.clientY,h)-t.startPointer.y),c.height,a.height),width:b(t.startSize.width+(p===`left`?-1:1)*(o(e.clientX,h)-t.startPointer.x),c.width,a.width)};t.didMove||=n.height!==t.startSize.height||n.width!==t.startSize.width,t.lastSize=n,d(n)},t[0]=p,t[1]=a,t[2]=c,t[3]=d,t[4]=m,t[5]=h,t[6]=_):_=t[6];let v=_,y;t[7]!==l||t[8]!==u?(y=(e,t)=>{let n=g.current;n?.pointerId===e.pointerId&&(g.current=null,u?.(!1),t&&n.didMove&&l?.(n.lastSize))},t[7]=l,t[8]=u,t[9]=y):y=t[9];let w=y,T=m===`top`?`top-0`:`bottom-0`,E=p===`left`?`left-0`:`right-0`,D=p===`left`==(m===`top`)?`cursor-nwse-resize`:`cursor-nesw-resize`,O;t[10]!==T||t[11]!==E||t[12]!==D?(O=s(`group absolute z-50 flex size-4 touch-none select-none`,T,E,D),t[10]=T,t[11]=E,t[12]=D,t[13]=O):O=t[13];let k;t[14]===w?k=t[15]:(k=e=>{w(e,!1)},t[14]=w,t[15]=k);let A;t[16]!==v||t[17]!==w?(A=e=>{v(e),w(e,!0)},t[16]=v,t[17]=w,t[18]=A):A=t[18];let j;t[19]!==r||t[20]!==u||t[21]!==h?(j=e=>{if(e.button!==0)return;e.preventDefault(),e.currentTarget.setPointerCapture?.(e.pointerId);let t=r();g.current={didMove:!1,lastSize:t,pointerId:e.pointerId,startPointer:{x:o(e.clientX,h),y:o(e.clientY,h)},startSize:t},u?.(!0)},t[19]=r,t[20]=u,t[21]=h,t[22]=j):j=t[22];let M;t[23]!==v||t[24]!==w?(M=e=>{v(e),w(e,!0)},t[23]=v,t[24]=w,t[25]=M):M=t[25];let N;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(N=(0,C.jsx)(`div`,{className:`pointer-events-none m-auto h-px w-2 rotate-45 bg-text/25 opacity-0 group-hover:opacity-100 group-active:opacity-100`}),t[26]=N):N=t[26];let P;return t[27]!==v||t[28]!==A||t[29]!==j||t[30]!==M||t[31]!==O||t[32]!==k?(P=(0,C.jsx)(`div`,{"aria-hidden":!0,className:O,onLostPointerCapture:k,onPointerCancel:A,onPointerDown:j,onPointerMove:v,onPointerUp:M,children:N}),t[27]=v,t[28]=A,t[29]=j,t[30]=M,t[31]=O,t[32]=k,t[33]=P):P=t[33],P}
function b(e,t,n){return Math.min(Math.max(e,t),n)}
var x;
var S;
var C;
function w(){return(w=e(()=>{x=n();S=r();a();C=t();}))();}
function T(e){let t=(0,E.c)(32),{currentSize:n,defaultSize:r,extendIntoToolbar:i,heightLabel:a,maximumSize:o,minimumSize:s,onResize:c,onResizeEnd:u,onResizingChange:d,verticalEdge:f,widthLabel:p}=e,m=i===void 0||i,h=f===void 0?`top`:f,g;t[0]!==n||t[1]!==r||t[2]!==m||t[3]!==o||t[4]!==s||t[5]!==c||t[6]!==u||t[7]!==d||t[8]!==p?(g=O.map(e=>(0,D.jsx)(l,{ariaLabel:p,defaultSize:r.width,edge:e,extendIntoToolbar:m,getCurrentSize:()=>n.width,maximumSize:o.width,minimumSize:s.width,onResizeEnd:e=>{u({...n,width:e})},onResizingChange:d,setSize:t=>{c(e,{...n,width:t})}},e)),t[0]=n,t[1]=r,t[2]=m,t[3]=o,t[4]=s,t[5]=c,t[6]=u,t[7]=d,t[8]=p,t[9]=g):g=t[9];let _;t[10]!==n||t[11]!==r||t[12]!==a||t[13]!==o||t[14]!==s||t[15]!==c||t[16]!==u||t[17]!==d||t[18]!==h?(_=h!=null&&(0,D.jsx)(l,{ariaLabel:a,defaultSize:r.height,edge:h,getCurrentSize:()=>n.height,maximumSize:o.height,minimumSize:s.height,onResizeEnd:e=>{u({...n,height:e})},onResizingChange:d,setSize:e=>{c(`right`,{...n,height:e})}}),t[10]=n,t[11]=r,t[12]=a,t[13]=o,t[14]=s,t[15]=c,t[16]=u,t[17]=d,t[18]=h,t[19]=_):_=t[19];let v;t[20]!==n||t[21]!==o||t[22]!==s||t[23]!==c||t[24]!==u||t[25]!==d||t[26]!==h?(v=h!=null&&O.map(e=>(0,D.jsx)(y,{edge:e,getCurrentSize:()=>n,maximumSize:o,minimumSize:s,verticalEdge:h,onResizeEnd:u,onResizingChange:d,setSize:t=>{c(e,t)}},e)),t[20]=n,t[21]=o,t[22]=s,t[23]=c,t[24]=u,t[25]=d,t[26]=h,t[27]=v):v=t[27];let b;return t[28]!==g||t[29]!==_||t[30]!==v?(b=(0,D.jsxs)(D.Fragment,{children:[g,_,v]}),t[28]=g,t[29]=_,t[30]=v,t[31]=b):b=t[31],b}
var E;
var D;
var O;
function k(){return(k=e(()=>{E=n();u();w();D=t();O=[`left`,`right`];}))();}
export { l, i, o, s, e, n, u, t, r, a, d, f, p, m, h, g, _, v, y, b, x, S, C, w, T, E, D, O, k };
