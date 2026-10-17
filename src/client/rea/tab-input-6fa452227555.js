import * as Host from "../host-boundaries.mjs";
import { oA as r } from "./app-shared-2f2228189a8d.js";
import { h1 as s } from "./app-shared-2f2228189a8d.js";
import { p5 as l } from "./app-shared-2f2228189a8d.js";
import { d as d } from "./input-fe3a757b270a.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as i } from "./app-shared-2f2228189a8d.js";
import { sA as a } from "./app-shared-2f2228189a8d.js";
import { o as o } from "./app-shared-2f2228189a8d.js";
import { g1 as c } from "./app-shared-2f2228189a8d.js";
import { m5 as t } from "./app-shared-2f2228189a8d.js";
import { m as u } from "./input-fe3a757b270a.js";
import { K as n } from "./app-shared-2f2228189a8d.js";
function f(e){let t=(0,p.c)(27),n,i,a,o,c;t[0]===e?(n=t[1],i=t[2],a=t[3],o=t[4],c=t[5]):({conversationId:n,providers:o,sources:c,onNavigate:i,...a}=e,t[0]=e,t[1]=n,t[2]=i,t[3]=a,t[4]=o,t[5]=c);let u=r(s),f;t[6]!==n||t[7]!==a.addressValue||t[8]!==a.id||t[9]!==a.panelTarget?(f=()=>({id:a.id,conversationId:n,panelTarget:a.panelTarget,value:a.addressValue}),t[6]=n,t[7]=a.addressValue,t[8]=a.id,t[9]=a.panelTarget,t[10]=f):f=t[10];let g=l(f),_=l(i),v;t[11]!==g||t[12]!==_||t[13]!==o||t[14]!==u?(v=()=>o.map(e=>e(u,{getContext:g,onNavigate:_})),t[11]=g,t[12]=_,t[13]=o,t[14]=u,t[15]=v):v=t[15];let[y]=(0,m.useState)(v),b;t[16]===c?b=t[17]:(b=c??[],t[16]=c,t[17]=b);let x;t[18]!==y||t[19]!==b?(x=[...b,...y],t[18]=y,t[19]=b,t[20]=x):x=t[20];let S;t[21]===i?S=t[22]:(S=e=>i(e,!1),t[21]=i,t[22]=S);let C;return t[23]!==a||t[24]!==x||t[25]!==S?(C=(0,h.jsx)(d,{...a,sources:x,onCommitAddress:S}),t[23]=a,t[24]=x,t[25]=S,t[26]=C):C=t[26],C}
var p;
var m;
var h;
function g(){return(g=e(()=>{p=i();a();m=o();c();t();u();h=n();}))();}
export { r, s, l, d, e, i, a, o, c, t, u, n, f, p, m, h, g };
