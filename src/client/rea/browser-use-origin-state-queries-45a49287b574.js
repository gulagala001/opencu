import * as Host from "../host-boundaries.mjs";
import { TJ as m } from "./app-shared-2f2228189a8d.js";
import { Mf as i } from "./app-shared-2f2228189a8d.js";
import { IF as E } from "./app-shared-2f2228189a8d.js";
import { mMn as y } from "./app-shared-2f2228189a8d.js";
import { Qjn as s } from "./app-shared-2f2228189a8d.js";
import { uMn as h } from "./app-shared-2f2228189a8d.js";
import { $jn as f } from "./app-shared-2f2228189a8d.js";
import { fMn as n } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as te } from "./app-shared-2f2228189a8d.js";
import { RF as ce } from "./app-shared-2f2228189a8d.js";
import { DF as pe } from "./app-shared-2f2228189a8d.js";
import { sA as g } from "./app-shared-2f2228189a8d.js";
import { v_n as fe } from "./app-shared-2f2228189a8d.js";
import { tR as oe } from "./app-shared-2f2228189a8d.js";
import { qY as me } from "./app-shared-2f2228189a8d.js";
import { xJ as k } from "./app-shared-2f2228189a8d.js";
import { t6 as ue } from "./app-shared-2f2228189a8d.js";
import { gI as ae } from "./app-shared-2f2228189a8d.js";
import { WL as p } from "./app-shared-2f2228189a8d.js";
import { Nf as A } from "./app-shared-2f2228189a8d.js";
import { pq as r } from "./app-shared-2f2228189a8d.js";
import { EJ as u } from "./app-shared-2f2228189a8d.js";
import { CJ as o } from "./app-shared-2f2228189a8d.js";
import { X as l } from "./app-shared-2f2228189a8d.js";
import { fq as O } from "./app-shared-2f2228189a8d.js";
import { $Y as T } from "./app-shared-2f2228189a8d.js";
import { G as x } from "./app-shared-2f2228189a8d.js";
function j(e){let t=[];for(let[n,r]of Object.entries(e?.browserUse?.origins??{})){let e=y(n);e!=null&&r!=null&&Object.values(r).some(e=>e!=null)&&t.push({pattern:e.canonicalPattern,policy:r})}return t}
function M(e){let t=e?.network;return(t?.domains==null?[...(t?.allowedDomains??[]).map(e=>[e,`allow`]),...(t?.deniedDomains??[]).map(e=>[e,`deny`])]:Object.entries(t.domains).flatMap(([e,t])=>t==null?[]:[[e,t]])).flatMap(([e,t])=>{let n=s(e);return n==null||n.canonicalPattern.length===0?[]:[{decision:t,pattern:n}]})}
function N(e){if(e==null)return!1;let t=e.browserUse,n=e.featureRequirements,r=e.network;return e.allowBrowserAndComputerUse!=null||n?.in_app_browser!=null||n?.browser_use!=null||n?.browser_use_external!=null||n?.browser_use_full_cdp_access!=null||t?.allowHistoryAccess!=null||t?.disableAutoReview!=null||t?.allowGlobalPersistentApproval!=null||t?.defaultOriginPolicy!=null&&Object.values(t.defaultOriginPolicy).some(e=>e!=null)||j(e).length>0||r?.enabled===!1||r?.managedAllowedDomainsOnly===!0||M(e).some(({decision:e})=>e===`deny`)}
function P(e,t){if(t!==`history`&&e?.network?.enabled===!1||!B(e))return!1;let n=e?.browserUse,r=n?.defaultOriginPolicy;switch(t){case`origin`:return e?.network?.managedAllowedDomainsOnly!==!0&&r?.access!==`deny`;case`history`:return n?.allowHistoryAccess!==!1;case`upload`:return r?.uploads!==`deny`;case`download`:return r?.downloads!==`deny`;case`fullCdp`:return e?.featureRequirements?.browser_use_full_cdp_access!==!1&&r?.fullCdpAccess!==`deny`;case`autoReview`:return n?.disableAutoReview!==!0&&r?.autoReview!==`deny`;case`persistentApproval`:return r?.persistentApproval!==!1}}
function F(e){return B(e)&&e?.browserUse?.allowGlobalPersistentApproval!==!1}
function I(e,t){if(e?.allowBrowserAndComputerUse===!1)return!1;let n=e?.featureRequirements;switch(t){case`iab`:return n?.in_app_browser!==!1&&n?.browser_use!==!1;case`extension`:return n?.browser_use_external!==!1;case`cdp`:case void 0:return n?.browser_use!==!1}}
function L(e,t,n){if(!B(e)||n===`fullCdp`&&e?.featureRequirements?.browser_use_full_cdp_access===!1||n===`autoReview`&&e?.browserUse?.disableAutoReview===!0)return!1;let r=h(t);return r==null||!he(e,r)||!V(e,r,`access`)?!1:n===`origin`||V(e,r,H[n])}
function R(e,t){let r=y(e.pattern),i=h(t);return r!=null&&i!=null&&n(r,i)}
function z(e,t){let n=h(t);return n!=null&&f(e.pattern,n.hostname)}
function B(e){return e?.allowBrowserAndComputerUse!==!1&&(e?.featureRequirements?.browser_use!==!1||e?.featureRequirements?.browser_use_external!==!1)}
function he(e,t){if(e?.network?.enabled===!1)return!1;let n=!1;for(let r of M(e))if(f(r.pattern,t.hostname)){if(r.decision===`deny`)return!1;n=!0}return e?.network?.managedAllowedDomainsOnly!==!0||n}
function V(e,t,r){let i=j(e),a=new Map;for(let e of i)a.set(e.pattern,(a.get(e.pattern)??0)+1);let o=!1;for(let e of i){let i=y(e.pattern);if(i==null||!n(i,t))continue;let s=e.policy[r];if(s===`deny`||s===!1)return!1;(s===`allow`||s===!0)&&a.get(e.pattern)===1&&(o=!0)}if(o)return!0;let s=e?.browserUse?.defaultOriginPolicy?.[r];return s!==`deny`&&s!==!1}
var H;
function U(){return(U=e(()=>{T();H={download:`downloads`,upload:`uploads`,fullCdp:`fullCdpAccess`,autoReview:`autoReview`,persistentApproval:`persistentApproval`};}))();}
function _e(e,t){switch(t){case`origin`:return e?.access;case`download`:return e?.downloads;case`upload`:return e?.uploads;case`fullCdp`:return e?.full_cdp_access}}
function G(){return(G=e(()=>{T();x();}))();}
function K(){return(K=e(()=>{U();G();}))();}
function Te(){let e=(0,Y.c)(1),t;return e[0]===Symbol.for(`react.memo_cache_sentinel`)?(t={mutationFn:q},e[0]=t):t=e[0],E(t)}
async function q(dataTypes){return Host.services.browsingHistory.clearBrowsingData({dataTypes:dataTypes.map(type=>type===`cookies`?`siteData`:type),timeRange:`allTime`});}
var Y;
var Z;
function $(){return($=e(()=>{Y=te();ce();pe();g();K();fe();oe();me();k();ue();ae();p();A();r();u();Z=o(l,`browser-use-origin-state-read`,{refetchOnMount:`always`,staleTime:O.FIVE_SECONDS});}))();}
export { m, i, E, y, s, h, f, n, e, te, ce, pe, g, fe, oe, me, k, ue, ae, p, A, r, u, o, l, O, T, x, j, M, N, P, F, I, L, R, z, B, he, V, H, U, _e, G, K, Te, q, Y, Z, $ };
