import * as Host from "../host-boundaries.mjs";
import { y7 as f } from "./app-shared-2f2228189a8d.js";
import { hS as p } from "./app-shared-2f2228189a8d.js";
import { t7t as h } from "./app-initial-c468e3fd7f91.js";
import { y$ as o } from "./app-shared-2f2228189a8d.js";
import { p7 as i } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as s } from "./app-shared-2f2228189a8d.js";
import { sA as c } from "./app-shared-2f2228189a8d.js";
import { PE as m } from "./app-initial-c468e3fd7f91.js";
import { xS as d } from "./app-shared-2f2228189a8d.js";
import { b7 as l } from "./app-shared-2f2228189a8d.js";
import { C$ as r } from "./app-shared-2f2228189a8d.js";
import { R as y } from "./inline-playback-4369d8a5c70a.js";
import { W as g } from "./inline-playback-4369d8a5c70a.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
function b(e){let t=(0,C.c)(11),{speed:n,disabled:r,triggerButton:a,showLabel:s,onSpeedChange:c}=e,l=s!==void 0&&s,u=l?`start`:void 0,d;t[0]===l?d=t[1]:(d=l?(0,w.jsx)(f.SectionLabel,{children:(0,w.jsx)(p,{id:`gifEditor.speedMenuLabel`,defaultMessage:`GIF speed`,description:`Heading for the menu that changes the playback speed of a generated animated GIF`})}):null,t[0]=l,t[1]=d);let m;t[2]!==r||t[3]!==c||t[4]!==n?(m=h.map(e=>(0,w.jsx)(f.Item,{role:`menuitemradio`,"aria-checked":n===e,disabled:r,RightIcon:n===e?o:void 0,onSelect:()=>c(e),children:(0,w.jsx)(p,{id:`gifEditor.speedValue`,defaultMessage:`{speed}×`,description:`GIF playback speed multiplier, such as 0.5× or 2×`,values:{speed:e}})},e)),t[2]=r,t[3]=c,t[4]=n,t[5]=m):m=t[5];let g;return t[6]!==u||t[7]!==d||t[8]!==m||t[9]!==a?(g=(0,w.jsxs)(i,{side:`top`,align:u,triggerButton:a,children:[d,m]}),t[6]=u,t[7]=d,t[8]=m,t[9]=a,t[10]=g):g=t[10],g}
var C;
var w;
function T(){return(T=e(()=>{C=s();c();m();d();l();r();y();g();w=t();}))();}
export { f, p, h, o, i, e, s, c, m, d, l, r, y, g, t, b, C, w, T };
