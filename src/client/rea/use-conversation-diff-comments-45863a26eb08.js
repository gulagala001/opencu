import * as Host from "../host-boundaries.mjs";
import { oA as a } from "./app-shared-2f2228189a8d.js";
import { X as o } from "./app-shared-2f2228189a8d.js";
import { iA as f } from "./app-shared-2f2228189a8d.js";
import { wIr as k } from "./app-initial-c468e3fd7f91.js";
import { RL as r } from "./app-shared-2f2228189a8d.js";
import { tA as i } from "./app-shared-2f2228189a8d.js";
import { xUr as d } from "./app-shared-2f2228189a8d.js";
import { gUr as n } from "./app-shared-2f2228189a8d.js";
import { r1 as h } from "./app-shared-2f2228189a8d.js";
import { bIr as O } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as s } from "./app-shared-2f2228189a8d.js";
import { sA as l } from "./app-shared-2f2228189a8d.js";
import { CF as E } from "./app-shared-2f2228189a8d.js";
import { Y3 as v } from "./app-shared-2f2228189a8d.js";
import { Khn as b } from "./app-shared-2f2228189a8d.js";
import { TIr as A } from "./app-initial-c468e3fd7f91.js";
import { gI as m } from "./app-shared-2f2228189a8d.js";
import { zL as D } from "./app-shared-2f2228189a8d.js";
import { a1 as C } from "./app-shared-2f2228189a8d.js";
import { SUr as x } from "./app-shared-2f2228189a8d.js";
import { Gk as w } from "./app-shared-2f2228189a8d.js";
import { TK as u } from "./app-shared-2f2228189a8d.js";
import { G3 as g } from "./app-shared-2f2228189a8d.js";
import { EK as t } from "./app-shared-2f2228189a8d.js";
import { DK as c } from "./app-shared-2f2228189a8d.js";
import { wK as _ } from "./app-shared-2f2228189a8d.js";
import { Bii as T } from "./app-shared-2f2228189a8d.js";
import { dsi as y } from "./app-shared-2f2228189a8d.js";
import { Y as S } from "./app-shared-2f2228189a8d.js";
import { qii as p } from "./app-shared-2f2228189a8d.js";
function j({cache:e,storedModelComments:t,turns:n,workspaceRoots:r}){if(n==null||n.length===0)return t;let i=new Set(t.map(h)),a=[...t],o=!1;for(let t of n)if(t.status===`completed`)for(let n of M(t,r,e)){let e=h(n);i.has(e)||(i.add(e),a.push(n),o=!0)}return o?a:t}
function M(e,t,n){let r=n?.get(e);if(r?.items===e.items&&r.workspaceRoots===t)return r.comments;let i=[];for(let n of e.items)n.type===`agentMessage`&&n.phase!==`commentary`&&i.push(...T(n.text,e.params.cwd??null,t));return n?.set(e,{comments:i,items:e.items,workspaceRoots:t}),i}
function N(){return(N=e(()=>{p();C();}))();}
function P(e,t,s){let c=(0,L.c)(16),l=s===void 0?e:s,u=a(o),p;c[0]===l?p=c[1]:(p={conversationId:l,path:null,pullRequestReviewKey:null},c[0]=l,c[1]=p);let m=f(k,p),[h]=r(`diff_comments_from_model`),g=i(d),_=f(B,t),v;if(c[2]!==g||c[3]!==e||c[4]!==h||c[5]!==_){let t;c[7]===g?t=c[8]:(t=e=>!n(g,e),c[7]=g,c[8]=t),v=F({storedModelComments:h?.[e]??R,turnModelComments:_}).filter(t),c[2]=g,c[3]=e,c[4]=h,c[5]=_,c[6]=v}else v=c[6];let y=v,b;c[9]!==l||c[10]!==u?(b=e=>{O(u,{conversationId:l,path:null,pullRequestReviewKey:null},e)},c[9]=l,c[10]=u,c[11]=b):b=c[11];let x=b,S;return c[12]!==m||c[13]!==y||c[14]!==x?(S={comments:m,modelComments:y,setComments:x},c[12]=m,c[13]=y,c[14]=x,c[15]=S):S=c[15],S}
function F({storedModelComments:e,turnModelComments:t}){if(t.length===0)return e;let n=new Set(e.map(h)),r=[...e],i=!1;for(let e of t){let t=h(e);n.has(t)||(n.add(t),r.push(e),i=!0)}return i?r:e}
function I(e,t){return e.length===t.length&&e.every((e,n)=>{let r=t[n];return r!=null&&h(e)===h(r)})}
var L;
var R;
var z;
var B;
function V(){return(V=e(()=>{L=s();l();E();v();b();A();m();D();N();C();x();R=[];z=w(o,(e,{get:n})=>{let r=n(t,e);if(r?.status!==`completed`)return R;let i=(n(c,e)??[]).flatMap(t=>{let r=n(_,{...e,itemId:t});return r==null?[]:[r];});return j({storedModelComments:R,turns:[{...r,items:i}],workspaceRoots:n(y,S(e.threadId))});},{owner:e=>e.threadId,isEqual:I});B=w(o,(e,{get:t})=>{if(e==null)return R;let n=t(u,{hostId:t(g,e),threadId:e});return F({storedModelComments:R,turnModelComments:n?.flatMap(e=>t(z,e))??R});},{isEqual:I});}))();}
export { a, o, f, k, r, i, d, n, h, O, e, s, l, E, v, b, A, m, D, C, x, w, u, g, t, c, _, T, y, S, p, j, M, N, P, F, I, L, R, z, B, V };
