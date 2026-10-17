import * as Host from "../host-boundaries.mjs";
import { Lf as u } from "./app-shared-2f2228189a8d.js";
import { At as v } from "./walnut-reader-a850015a2722.js";
import { oA as i } from "./app-shared-2f2228189a8d.js";
import { h1 as c } from "./app-shared-2f2228189a8d.js";
import { tA as r } from "./app-shared-2f2228189a8d.js";
import { CS as h } from "./app-initial-c468e3fd7f91.js";
import { CEi as g } from "./app-initial-c468e3fd7f91.js";
import { q as d } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as a } from "./app-shared-2f2228189a8d.js";
import { sA as o } from "./app-shared-2f2228189a8d.js";
import { zS as p } from "./app-initial-c468e3fd7f91.js";
import { g1 as l } from "./app-shared-2f2228189a8d.js";
import { TEi as m } from "./app-initial-c468e3fd7f91.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { Nt as _ } from "./walnut-reader-a850015a2722.js";
import { o as s } from "./app-shared-2f2228189a8d.js";
var __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./presentation-e38e6a3bf5bc.js","./presentation-1352f5c0a652.js","./rolldown-runtime-2d059c5e81f4.js","./app-initial-c468e3fd7f91.js","./app-shared-2f2228189a8d.js","./app-shared-9a94b907ed47.css","./app-initial-99e8b4b455fa.css","./presentation-panel-2892de0b3010.js","./workbook-20cc733f9760.js","./linear-679e303fb101.js","./string-963febbec52f.js","./defaultLocale-1a6eeada7f42.js","./init-cd6c1f803e47.js","./ordinal-654830f58ee1.js","./pow-8b9b02ff1564.js","./nice-2b3cc20611af.js","./band-7f9eb19564f9.js","./treemap-4d58692b5de2.js","./Tableau10-232fa539940a.js","./arc-a62fdff23ebe.js","./path-3b8129ebc7ff.js","./constant-363a14bf6d8f.js","./math-de3a0e0db4e2.js","./linear-51abf1a86c3b.js","./line-5171f1d885cc.js","./array-15adaa1bc228.js","./area-76377dfd01aa.js","./pie-f34043ff89c8.js","./catmullRom-b244076d0269.js","./monotone-68fb4f84bd88.js","./expand-f3906952405c.js","./presentation-image-assets-7a446fb4d4d8.js","./address-utils-9482ac1b51ec.js","./spreadsheet-7f83c4c62da8.js","./font-metrics-1f28ced166ed.js","./merged-range-index-40f5524b9dda.js","./three.module-859594e5f29f.js","./artifact-session-image-references-bd448f94ed2c.js","./core-51383d4e7880.js","./union-2f12e2dfc01f.js","./zipObject-b39425e8947b.js","./map-3ea4bc6d7205.js","./PopcornIcons-6bf9c538cb49.js","./artifact-source-bootstrap-f0e1f54dfa8f.js","./app-primary-5433e23a397e.js","./app-primary-6a01c6b721a4.css","./PopcornManualEditHeaderControls-b8db5d8994b8.js","./draw-drawing-selection-35a6f5da1dd6.js","./drawing-resize-handles-ea28c73efff1.js","./artifact-interaction-keyboard-e3d7588fb18d.js","./artifact-source-bootstrap-c4c481274826.css","./TextUnderlineIcon-91d18f55c922.js","./font-face-utils-fe93ca9bfec0.js","./ensure-fonts-loaded-7e4460e9b2ad.js","./ensure-fonts-loaded-cc781733d401.css","./inspector-font-size-menu-c677f44bf8d7.js","./artifact-comments-header-5e5064568630.js","./PopcornCommentsSidebarLayout-df86b85d630a.js","./PopcornCommentMessageLayout-2a5074f9108e.js","./artifact-annotation-batch-controls-640617fbcc48.js","./artifact-request-progress-34a059bcac41.js","./use-command-hotkey-df798c60503f.js","./arrow-rotate-ccw-ad182eb49f3e.js","./artifact-annotation-batch-controls-84ae7e0fceaf.css","./inspector-color-field-7ab6f7c5ce2e.js","./dist-b5216f83dbc6.js","./inspector-color-field-440c11a216e5.css","./inspector-font-size-menu-b0cdc217acc7.css","./PopcornReviewBarOverlay-2eed66e1c427.js","./annotation-mode-icon-8c7db0ca0737.js","./annotation-mode-icon-443b825e9772.css","./artifact-accessories-cf4e64e05d2d.js","./panel-state-1fd21df9ae53.js","./layout-8d77a39778af.js","./worker-preparation-366e96b2f502.js","./generation-progress-a3e25b033b50.js","./presentation-review-utils-8cc9bc91f541.js","./controller-worker-363daa08d666.js","./appearance-73c153a42318.js","./image-loading-state-cc992bc4b076.js","./image-loading-state-8c612077a546.css","./insertion-button-8efb95038832.js","./presentation-panel-c1e0239b17dd.css"])))=>i.map(i=>d[i]);
function y(e){let t=new Map,n=e.slides.map(e=>{let n=new Map;return t.set(e.id,n),{...e,elements:b(e.elements,n)}}),r=e=>{if(!e)return e;let n=t.get(e.slideId)?.get(e.elementId);return n===void 0?e:{...e,elementId:n}};return{...e,slides:n,layouts:e.layouts.map(e=>({...e,elements:b(e.elements,new Map)})),threads:e.threads.map(e=>e.target?{...e,target:{...e.target,element:r(e.target.element),textRange:r(e.target.textRange)}}:e)}}
function b(e,t){let n=[],r=e=>{n.push(e),e.children.forEach(r)};e.forEach(r);let i=n.filter(e=>Number(e.id)>4294967295);if(i.length===0)return e;let a=new Set(n.map(e=>Number(e.id))),o=2;for(let e of i){for(;a.has(o);)o+=1;t.set(e.id,String(o)),a.add(o++)}let s=e=>{let n={...e,id:t.get(e.id)??e.id,children:e.children.map(s)};return e.connector&&(n.connector={...e.connector,fromElementId:t.get(e.connector.fromElementId)??e.connector.fromElementId,toElementId:t.get(e.connector.toElementId)??e.connector.toElementId}),n};return e.map(s)}
async function x(e){let[{Presentation:t},n]=await Promise.all([u(()=>import(`./presentation-e38e6a3bf5bc.js`),__vite__mapDeps([0,1,2,3,4,5,6]),import.meta.url),v()]),r=n.PptxExport.ExportProtoToPptx(t.encode(y(e)).finish());if(r.length===0)throw Error(`Walnut PPTX export produced no bytes`);return r}
function S(){return(S=e(()=>{_();}))();}
var C;
var w;
function T(){return(T=e(()=>{C=`_panel_gm5ek_1`;w={panel:C};}))();}
function E(e){let t=(0,D.c)(7),{alignComposer:n,...a}=e,o=n===void 0||n,s=i(c),l=r(h),u;t[0]===s?u=t[1]:(u=e=>{if(e!=null)return g(s,e)},t[0]=s,t[1]=u);let f=u,p=A,m=d(a.className,w.panel),_=o&&l?f:void 0,v;return t[2]!==p||t[3]!==a||t[4]!==m||t[5]!==_?(v=(0,k.jsx)(p,{...a,className:m,viewportAlignmentRef:_}),t[2]=p,t[3]=a,t[4]=m,t[5]=_,t[6]=v):v=t[6],v}
var D;
var O;
var k;
var A;
function j(){return(j=e(()=>{D=a();o();O=s();p();l();m();T();k=t();A=(0,O.lazy)(async()=>{let{PresentationPanel:e}=await u(async()=>{let{PresentationPanel:e}=await import(`./presentation-panel-2892de0b3010.js`).then(module => module.__opencuDynamicExports).then(e=>(e.t(),e.n));return{PresentationPanel:e};},__vite__mapDeps([7,2,4,5,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,3,6,1,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82]),import.meta.url);return{default:e};});}))();}
export { u, v, i, c, r, h, g, d, e, a, o, p, l, m, t, _, s, __vite__mapDeps, y, b, x, S, C, w, T, E, D, O, k, A, j };
