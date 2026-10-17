import * as Host from "../host-boundaries.mjs";
import { b as t } from "./font-metrics-1f28ced166ed.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { N as n } from "./font-metrics-1f28ced166ed.js";
function r(){let e=globalThis.fonts;if(e)return e;if(typeof document<`u`)return document.fonts}
function i(e){return e.replaceAll(/['"]/g,``).trim().toLowerCase()}
function a(e){let t=e.trim().toLowerCase();return t===`normal`?`400`:t===`bold`?`700`:t}
function o(e){return[i(e.family),e.style.trim().toLowerCase(),a(e.weight),e.src,e.format,e.local??!1,e.localNames?.join(`|`)??``,e.unicodeRange??``].join(`|`)}
function s(e,t){let n=o(t);if(_.has(n))return!0;if(typeof e.values!=`function`)return!1;for(let r of Array.from(e.values()))if(i(r.family)===i(t.family)&&(r.style||`normal`).trim().toLowerCase()===t.style.trim().toLowerCase()&&a(String(r.weight||`400`))===a(t.weight))return _.add(n),!0;return!1}
function c(e,t){let n=e.matchAll(/url\((["']?)([^"')]+)\1\)\s*(?:format\((["']?)([^"')]+)\3\))?/g),r=[];for(let e of n){let n=e[2]?.trim();n&&r.push({family:`Carlito`,style:`normal`,weight:`400`,src:new URL(n,t).toString(),format:(e[4]?.trim()||`woff2`).toLowerCase(),unicodeRange:void 0})}return r}
function l(){return u([`Carlito`]).filter(e=>!e.local&&h.has(e.weight))}
function u(e,t){if(typeof document>`u`)return[];let n=new Map(e.map(e=>[i(e),e])),r=[],a=new Set;for(let e of Array.from(document.styleSheets)){let t;try{t=e.cssRules}catch{continue}let o=e.href||document.baseURI;for(let e of Array.from(t)){if(e.type!==CSSRule.FONT_FACE_RULE)continue;let t=e,s=i(t.style.getPropertyValue(`font-family`));if(!n.has(s))continue;let l=t.style.getPropertyValue(`font-weight`).trim()||`400`,u=t.style.getPropertyValue(`font-style`).trim()||`normal`,d=c(t.style.getPropertyValue(`src`),o),f=d.find(e=>e.format===`woff2`)??d[0];if(!f)continue;let p={family:n.get(s),style:u,weight:l,src:f.src,format:f.format,unicodeRange:t.style.getPropertyValue(`unicode-range`).trim()||void 0},m=[p.family,p.style,p.weight,p.src,p.format,p.unicodeRange??``].join(`|`);a.has(m)||(a.add(m),r.push(p))}}let o=new Set(r.map(e=>i(e.family)));for(let[e,i]of n)if(!o.has(e)){let e=t?.(i);r.push({family:i,style:`normal`,weight:`400`,src:e?.[0]??i,format:``,local:!0,localNames:e})}return r.sort((e,t)=>Number(e.weight)-Number(t.weight))}
async function d(e){let n=r();!n||typeof FontFace>`u`||typeof n.add!=`function`||(await Promise.allSettled(e.map(async e=>{let t=o(e);if(s(n,e))return;let r=new FontFace(e.family,e.local?(e.localNames??[e.src]).map(e=>`local(${JSON.stringify(e)})`).join(`, `):`url(${JSON.stringify(e.src)}) format(${JSON.stringify(e.format)})`,{style:e.style,weight:e.weight,display:`swap`,unicodeRange:e.unicodeRange});await r.load(),n.add(r),_.add(t)})),typeof n.load==`function`&&await Promise.allSettled(e.map(e=>n.load(`${e.weight} 16px ${e.family}`))),t())}
function f(){return typeof OffscreenCanvas<`u`?new OffscreenCanvas(1,1).getContext(`2d`):typeof document<`u`?document.createElement(`canvas`).getContext(`2d`):null}
function p(e){let t=f();return t?(t.font=e,Number(t.measureText(g).width.toFixed(3))):null}
function m(){let e=r(),t=e&&typeof e.check==`function`?e.check(`400 16px Carlito`):null,n=e&&typeof e.check==`function`?e.check(`700 16px Carlito`):null;return{hasFontFaceCtor:typeof FontFace<`u`,hasFontFaceSet:!!e,check400:t,check700:n,sampleWidths:{carlito400:p(`400 16px Carlito`),carlito700:p(`700 16px Carlito`),calibri400:p(`400 16px Calibri`),arial400:p(`400 16px Arial`)}}}
var h;
var g;
var _;
function v(){return(v=e(()=>{n();h=new Set([`400`,`700`]);g=`Sphinx of black quartz, judge my vow 1234567890`;_=new Set();}))();}
export { t, e, n, r, i, a, o, s, c, l, u, d, f, p, m, h, g, _, v };
