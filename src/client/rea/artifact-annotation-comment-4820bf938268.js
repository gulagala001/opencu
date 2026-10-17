import * as Host from "../host-boundaries.mjs";
import { Abt as t } from "./app-shared-2f2228189a8d.js";
import { kbt as n } from "./app-shared-2f2228189a8d.js";
import { VW as r } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { CF as a } from "./app-shared-2f2228189a8d.js";
import { UW as i } from "./app-shared-2f2228189a8d.js";
function o({line:e,path:t,payload:r,sourcePath:i,title:a}){switch(r.target.type){case`presentation-element-selection`:case`presentation-region`:case`workbook-floating-element`:case`workbook-range`:return n({annotationId:r.annotationId,artifactKind:r.artifactKind,body:r.body,label:r.label,line:e,metadata:{target:r.target},path:t,sourcePath:i,title:a})}}
function s(e,n){return e.filter(e=>t(e)&&e.localArtifactAnnotationContext?.path===n)}
function c(e){return e.flatMap(e=>{let t=e.localArtifactAnnotationContext,n=e.localArtifactAnnotationMetadata?.target;if(t?.annotationId==null||t.artifactKind===`document`||t.artifactKind===`site`||n==null)return[];switch(n.type){case`presentation-element-selection`:case`presentation-region`:case`workbook-floating-element`:case`workbook-range`:return[{annotationId:t.annotationId,artifactKind:t.artifactKind,body:r(e),label:t.label,target:n}];case`document-element-selection`:case`document-page-point`:case`document-page-region`:case`site-element-selection`:return[]}})}
function l({currentComments:e,path:t,previousComments:n}){let r=new Set;for(let n of s(e,t)){let e=n.localArtifactAnnotationContext?.annotationId;e!=null&&r.add(e)}let i=[];for(let e of s(n,t)){let t=e.localArtifactAnnotationContext?.annotationId;t!=null&&!r.has(t)&&i.push(t)}return i}
function u(e,n){let r=e.filter(e=>!t(e)||e.localArtifactAnnotationContext?.path!==n);return r.length===e.length?e:r}
function d(e){return Math.max(0,...e.map(e=>e.position.line))+1}
function f(){return(f=e(()=>{a();i();}))();}
export { t, n, r, e, a, i, o, s, c, l, u, d, f };
