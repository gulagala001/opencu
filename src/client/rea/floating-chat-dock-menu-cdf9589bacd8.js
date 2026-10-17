import * as Host from "../host-boundaries.mjs";
import { oA as o } from "./app-shared-2f2228189a8d.js";
import { h1 as d } from "./app-shared-2f2228189a8d.js";
import { tA as r } from "./app-shared-2f2228189a8d.js";
import { $ur as x } from "./app-shared-2f2228189a8d.js";
import { MHe as v } from "./app-shared-2f2228189a8d.js";
import { $H as N } from "./app-initial-c468e3fd7f91.js";
import { HW as P } from "./app-initial-c468e3fd7f91.js";
import { AP as D } from "./app-initial-c468e3fd7f91.js";
import { fdr as C } from "./app-shared-2f2228189a8d.js";
import { Wji as O } from "./app-initial-c468e3fd7f91.js";
import { mdr as b } from "./app-shared-2f2228189a8d.js";
import { lS as y } from "./app-shared-2f2228189a8d.js";
import { smr as u } from "./app-shared-2f2228189a8d.js";
import { iMi as p } from "./app-shared-2f2228189a8d.js";
import { hS as w } from "./app-shared-2f2228189a8d.js";
import { wdr as s } from "./app-shared-2f2228189a8d.js";
import { r5 as i } from "./app-shared-2f2228189a8d.js";
import { w5 as n } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as c } from "./app-shared-2f2228189a8d.js";
import { sA as l } from "./app-shared-2f2228189a8d.js";
import { xS as S } from "./app-shared-2f2228189a8d.js";
import { zS as E } from "./app-initial-c468e3fd7f91.js";
import { Kj as A } from "./app-initial-c468e3fd7f91.js";
import { a5 as f } from "./app-shared-2f2228189a8d.js";
import { mMi as h } from "./app-shared-2f2228189a8d.js";
import { C$ as a } from "./app-shared-2f2228189a8d.js";
import { O5 as m } from "./app-shared-2f2228189a8d.js";
import { g1 as g } from "./app-shared-2f2228189a8d.js";
import { eU as k } from "./app-initial-c468e3fd7f91.js";
import { WW as F } from "./app-initial-c468e3fd7f91.js";
import { jP as T } from "./app-initial-c468e3fd7f91.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { J as _ } from "./app-shared-2f2228189a8d.js";
import { NS as M } from "./app-initial-c468e3fd7f91.js";
import { Uj as j } from "./app-initial-c468e3fd7f91.js";
function I(e){let t=(0,z.c)(6),n=o(d),i=r(V),a;t[0]!==i||t[1]!==n?(a=i===`hidden`?[]:[{id:`full-view`,icon:x,message:v({id:`quickChat.dock.openTab`,defaultMessage:`Open in full view`,description:`Opens the existing Chat in a tab that fills the workspace`}),onSelect:()=>{N(n,`context_menu`,()=>P(n,n.get(D).chat,{mode:`full`}))}},{id:`left`,icon:C,enabled:i===`split`,message:v({id:`quickChat.dock.left`,defaultMessage:`Move to left pane`,description:`Moves the floating Chat into the left split pane beside the current content`}),onSelect:()=>{N(n,`context_menu`,()=>O(n,n.get(D).chat,`left`))}},{id:`right`,icon:b,enabled:i===`split`,message:v({id:`quickChat.dock.right`,defaultMessage:`Move to right pane`,description:`Moves the floating Chat into the right split pane beside the current content`}),onSelect:()=>{N(n,`context_menu`,()=>O(n,n.get(D).chat,`right`))}}],t[0]=i,t[1]=n,t[2]=a):a=t[2];let s=a,c;return t[3]!==s||t[4]!==e?(c=(0,B.jsx)(L,{...e,items:s}),t[3]=s,t[4]=e,t[5]=c):c=t[5],c}
function L(e){let t=(0,z.c)(32),{contextMenuTrigger:r,isCompact:a,isDragging:o,items:c,open:l,onMinimize:d,onOpenChange:f}=e,m=y(),h;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(h=v({id:`quickChat.dock.minimizeComposer`,defaultMessage:`Minimize composer`,description:`Minimizes the floating composer to its compact minimized button`}),t[0]=h):h=t[0];let g;t[1]===d?g=t[2]:(g={id:`minimize`,icon:u,message:h,onSelect:d,selectAfterClose:!0},t[1]=d,t[2]=g);let _;t[3]!==c||t[4]!==g?(_=[...c,g],t[3]=c,t[4]=g,t[5]=_):_=t[5];let b=_;if(r!=null){let e;t[6]===r?e=t[7]:(e=(0,B.jsx)(`div`,{className:`contents`,children:r}),t[6]=r,t[7]=e);let n;return t[8]!==b||t[9]!==e?(n=(0,B.jsx)(p,{disableNative:!0,items:b,children:e}),t[8]=b,t[9]=e,t[10]=n):n=t[10],n}let x=!o&&void 0,S=l||o,C;t[11]===Symbol.for(`react.memo_cache_sentinel`)?(C=(0,B.jsx)(w,{id:`quickChat.dock.dragHint`,defaultMessage:`Drag to move · Click for options`,description:`Tooltip for the floating Chat grip that can be dragged to move the Chat or clicked to open docking options`}),t[11]=C):C=t[11];let T;t[12]===m?T=t[13]:(T=m.formatMessage({id:`quickChat.dock.menu`,defaultMessage:`Dock Chat`,description:`Opens a menu to place Chat in a tab or a left or right split pane`}),t[12]=m,t[13]=T);let E=a?`composer`:`toolbar`,D;t[14]!==f||t[15]!==l?(D=e=>{e.button===0&&!e.ctrlKey&&e.detail>0&&!e.defaultPrevented&&f?.(!l)},t[14]=f,t[15]=l,t[16]=D):D=t[16];let O;t[17]===Symbol.for(`react.memo_cache_sentinel`)?(O=(0,B.jsx)(s,{}),t[17]=O):O=t[17];let k;t[18]!==T||t[19]!==E||t[20]!==D?(k=(0,B.jsx)(i,{className:`cursor-grab touch-none active:cursor-grabbing`,"aria-label":T,color:`ghostSecondary`,"data-quick-chat-drag-handle":!0,size:E,uniform:!0,onPointerDown:R,onClick:D,children:O}),t[18]=T,t[19]=E,t[20]=D,t[21]=k):k=t[21];let A;t[22]!==b||t[23]!==f||t[24]!==l||t[25]!==k?(A=(0,B.jsx)(p,{disableNative:!0,trigger:`click`,align:`end`,open:l,onOpenChange:f,items:b,children:k}),t[22]=b,t[23]=f,t[24]=l,t[25]=k,t[26]=A):A=t[26];let j;return t[27]!==l||t[28]!==A||t[29]!==x||t[30]!==S?(j=(0,B.jsx)(n,{open:x,triggerPopupOpen:l,disableHoverOpen:S,closeOnTriggerClick:!0,tooltipContent:C,children:A}),t[27]=l,t[28]=A,t[29]=x,t[30]=S,t[31]=j):j=t[31],j}
function R(e){e.button===0&&!e.ctrlKey&&e.preventDefault()}
var z;
var B;
var V;
function H(){return(H=e(()=>{z=c();l();S();E();A();f();h();a();m();g();k();F();T();B=t();V=_(d,({get:e})=>e(M)==null?`hidden`:e(j.activeTab$)==null?`tab`:`split`);}))();}
export { o, d, r, x, v, N, P, D, C, O, b, y, u, p, w, s, i, n, e, c, l, S, E, A, f, h, a, m, g, k, F, T, t, _, M, j, I, L, R, z, B, V, H };
