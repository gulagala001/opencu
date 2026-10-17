import * as Host from "../host-boundaries.mjs";
import { WD as n } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { YD as t } from "./app-shared-2f2228189a8d.js";
function r(e,t,n){for(let r of t.children)n=i(e,r,n)}
function i(e,t,r){if(t.type===`element`){let i=r+a(t),{className:o,...s}=t.properties||{};return e.push(n.inline(r,i,{class:o?Array.isArray(o)?o.join(` `):String(o):void 0,...s,nodeName:t.tagName})),i}return t.type===`text`?r+t.value.length:r}
function a(e){let t=0;for(let n of e.children)t+=o(n);return t}
function o(e){switch(e.type){case`element`:return a(e);case`text`:return e.value.length;default:return 0}}
function s(){return(s=e(()=>{t();}))();}
function c(e){return function({content:t,language:n,pos:i}){let a=n?e.highlight(n,t):e.highlightAuto(t),o=[];return r(o,a,i+1),o}}
function l(){return(l=e(()=>{s();}))();}
l();
export { c as createParser };
export { n, e, t, r, i, a, o, s, c, l };
