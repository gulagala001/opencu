import * as Host from "../host-boundaries.mjs";
import { Nj as r } from "./app-shared-2f2228189a8d.js";
import { Y as S } from "./app-shared-2f2228189a8d.js";
import { ET as k } from "./app-initial-c468e3fd7f91.js";
import { yle as v } from "./app-shared-2f2228189a8d.js";
import { wV as O } from "./app-initial-c468e3fd7f91.js";
import { IT as R } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sA as s } from "./app-shared-2f2228189a8d.js";
import { CF as T } from "./app-shared-2f2228189a8d.js";
import { Qm as u } from "./app-shared-2f2228189a8d.js";
import { UJr as A } from "./app-initial-c468e3fd7f91.js";
import { Khn as m } from "./app-shared-2f2228189a8d.js";
import { Gk as L } from "./app-initial-c468e3fd7f91.js";
import { wpi as N } from "./app-initial-c468e3fd7f91.js";
import { bpi as I } from "./app-initial-c468e3fd7f91.js";
import { owr as p } from "./app-shared-2f2228189a8d.js";
import { gI as l } from "./app-shared-2f2228189a8d.js";
import { RX as C } from "./app-shared-2f2228189a8d.js";
import { F as B } from "./artifact-request-progress-34a059bcac41.js";
import { Uk as g } from "./app-shared-2f2228189a8d.js";
import { X as i } from "./app-shared-2f2228189a8d.js";
import { Gk as w } from "./app-shared-2f2228189a8d.js";
import { TK as c } from "./app-shared-2f2228189a8d.js";
import { EK as n } from "./app-shared-2f2228189a8d.js";
import { DK as o } from "./app-shared-2f2228189a8d.js";
import { wK as f } from "./app-shared-2f2228189a8d.js";
import { BCr as d } from "./app-shared-2f2228189a8d.js";
import { Zm as a } from "./app-shared-2f2228189a8d.js";
import { NT as D } from "./app-initial-c468e3fd7f91.js";
import { sfn as x } from "./app-shared-2f2228189a8d.js";
import { DT as j } from "./app-initial-c468e3fd7f91.js";
import { hfn as h } from "./app-shared-2f2228189a8d.js";
import { CT as z } from "./app-initial-c468e3fd7f91.js";
import { FT as F } from "./app-initial-c468e3fd7f91.js";
import { _pi as M } from "./app-initial-c468e3fd7f91.js";
import { Ahn as b } from "./app-shared-2f2228189a8d.js";
import { Spi as P } from "./app-initial-c468e3fd7f91.js";
import { _Ln as y } from "./app-shared-2f2228189a8d.js";
import { P as V } from "./artifact-request-progress-34a059bcac41.js";
import { u as t } from "./rolldown-runtime-2d059c5e81f4.js";
import { _p as _ } from "./app-shared-2f2228189a8d.js";
function H(e,t,n,r){let i=t?.find(e=>v(e)===n),a=e.seenQueued||i!=null,o=e.dispatched||r||i?.submission?.status===`sending`||i?.submission?.status===`outcome-unknown`;return{seenQueued:a,dispatched:o,canceled:a&&i==null&&t!=null&&!o}}
function U(e,t,n,i){e.set(J,t,e=>new Map(e).set(i.requestId,{...i,heading:null}));let a=()=>{},o={seenQueued:!1,dispatched:!1,canceled:!1},s=()=>{a(),e.set(J,t,e=>{let t=new Map(e);return t.delete(i.requestId),t})};return{finish:s,accepted:(c,l=!1)=>{if(c==null){s();return}o.seenQueued=l,a=e.watch(({get:a})=>{let l={hostId:n,threadId:r(c)?c:S(c)};if(!a(k,l.threadId)&&(o=H(o,a(O,l),i.requestId,a(Y,{...l,requestId:i.requestId})!=null),o.canceled)){queueMicrotask(s);return}let u=a(X,{...l,requestId:i.requestId});u.complete?queueMicrotask(s):e.set(J,t,e=>{let t=e.get(i.requestId);return t==null||t.heading===u.heading?e:new Map(e).set(i.requestId,{...t,heading:u.heading})})})}}}
function W(e,t,n){e.set(Z,t,e=>[...e.filter(e=>e.request.annotationId!==n.annotationId),{request:n,task:null}])}
function G(e,t,n){e.set(Z,t,e=>e.filter(({request:e})=>e.annotationId!==n))}
function K(e,t,n,i,a){let o=r(a)?a:S(a),s=e.get(R,o);e.set(Z,t,e=>e.map(e=>e.request.annotationId===n?{...e,task:{hostId:i,threadId:a,streamRequestId:s}}:e)),e.when(({get:e})=>!e(Q,t).some(e=>e.annotationId===n)).then(()=>G(e,t,n))}
var q;
var J;
var Y;
var X;
var Z;
var Q;
function $(){return($=e(()=>{q=t(_(),1);s();T();u();A();m();L();N();I();p();l();C();B();J=g(i,e=>new Map(),void 0,{autoDispose:!1});Y=w(i,(e,{get:t})=>{let r=t(c,{hostId:e.hostId,threadId:e.threadId});for(let i of r?.toReversed()??[]){let r=t(n,i);if(r==null)continue;let s=r.params.input;if(s.length===0&&!r.params.commentAttachments?.length)for(let e of t(o,i)??[]){let n=t(f,{...i,itemId:e});if(n?.type===`userMessage`){s=n.content;break;}}if(d(a({input:s}).rawText,{commentAttachments:r.params.commentAttachments}).some(t=>t.annotationId===e.requestId))return i;}return null;},{isEqual:q.default});X=w(i,(e,{get:t})=>{if(t(k,e.threadId)){let n=t(D,e.threadId);if(n==null)return{complete:!1,heading:null};let r=x({current_node:t(j,e.threadId),mapping:n}),i=t=>d(t).some(t=>t.annotationId===e.requestId),a=r.some(e=>e.author.role===`user`&&i(h(e))),o=(a||Object.values(n).some(({message:e})=>e?.author.role===`user`&&i(h(e))))&&(!a||!z(t(F,e.threadId))),s=a?r.findLast(e=>e.author.role===`assistant`&&e.channel===`commentary`):void 0;return{complete:o,heading:s==null?null:M(h(s))};}t(b,{hostId:e.hostId,threadId:e.threadId});let r=t(Y,e),i=t(n,r);if(r==null||i==null)return{complete:!1,heading:null};if(i.status!==`inProgress`)return{complete:!0,heading:null};for(let e of t(o,r)?.toReversed()??[]){let n={...r,itemId:e},i=t(P,n);if(i!=null)return{complete:!1,heading:i};let a=t(f,n);if(a?.type===`agentMessage`&&a.phase===`commentary`){let e=M(a.text);if(e!=null)return{complete:!1,heading:e};}}return{complete:!1,heading:null};},{isEqual:q.default});Z=g(i,e=>[],void 0,{autoDispose:!1});Q=w(i,(e,{get:t})=>t(Z,e).flatMap(({request:e,task:n})=>{if(n==null)return[e];let i=t(y,r(n.threadId)?n.threadId:S(n.threadId)),a=i==null?null:t(V,{hostId:n.hostId,threadId:i,annotationId:e.annotationId,streamRequestId:n.streamRequestId});return a===`finished`||a===`missing`?[]:[e];}));}))();}
export { r, S, k, v, O, R, e, s, T, u, A, m, L, N, I, p, l, C, B, g, i, w, c, n, o, f, d, a, D, x, j, h, z, F, M, b, P, y, V, t, _, H, U, W, G, K, q, J, Y, X, Z, Q, $ };
