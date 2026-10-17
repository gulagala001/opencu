import * as Host from "../host-boundaries.mjs";
import { d5 as o } from "./app-shared-2f2228189a8d.js";
import { AW as l } from "./app-initial-c468e3fd7f91.js";
import { Zht as n } from "./app-shared-2f2228189a8d.js";
import { c as f } from "./webview-841c96a84b74.js";
import { kj as a } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as r } from "./app-shared-2f2228189a8d.js";
import { CF as c } from "./app-shared-2f2228189a8d.js";
import { o as i } from "./app-shared-2f2228189a8d.js";
import { f5 as s } from "./app-shared-2f2228189a8d.js";
import { jW as u } from "./app-initial-c468e3fd7f91.js";
import { h as d } from "./webview-841c96a84b74.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
function p(e){let t=(0,_.c)(7),{browserUseTabIdsKey:n,conversationId:r}=e,i;if(t[0]!==n||t[1]!==r){let e;t[3]===r?e=t[4]:(e=e=>(0,y.jsx)(m,{browserTabId:e,conversationId:r},e),t[3]=r,t[4]=e),i=n.split(`\0`).map(a).map(e),t[0]=n,t[1]=r,t[2]=i}else i=t[2];let o;return t[5]===i?o=t[6]:(o=(0,y.jsx)(y.Fragment,{children:i}),t[5]=i,t[6]=o),o}
function m(e){let t=(0,_.c)(11),{browserTabId:r,conversationId:i}=e,a=o(),s=(0,v.useRef)(null),c;t[0]!==r||t[1]!==i?(c=()=>l.getSnapshot(i,r),t[0]=r,t[1]=i,t[2]=c):c=t[2];let u=(0,v.useSyncExternalStore)(l.subscribe,c,g),d;if(t[3]!==r||t[4]!==i?(d=()=>l.pages.hasPresentedMount(i,r)||l.isTabPresented(i,r),t[3]=r,t[4]=i,t[5]=d):d=t[5],(0,v.useSyncExternalStore)(l.subscribe,d,h)||u!=null&&u.tabType!==n.WEB)return null;let p=u==null||u.url.length===0?`about:blank`:u.url,m;return t[6]!==r||t[7]!==i||t[8]!==p||t[9]!==a?(m=(0,y.jsx)(f,{bounds:null,browserTabId:r,conversationId:i,hostKind:`hidden-browser-use`,initialUrl:p,isVisible:!1,scale:1,shouldBootstrapWhenHidden:!0,shouldPaint:!1,webviewRef:s,windowZoom:a}),t[6]=r,t[7]=i,t[8]=p,t[9]=a,t[10]=m):m=t[10],m}
function h(){return!1}
function g(){return null}
var _;
var v;
var y;
function b(){return(b=e(()=>{_=r();c();v=i();s();u();d();y=t();}))();}
export { o, l, n, f, a, e, r, c, i, s, u, d, t, p, m, h, g, _, v, y, b };
