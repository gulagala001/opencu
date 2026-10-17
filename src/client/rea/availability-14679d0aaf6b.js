import * as Host from "../host-boundaries.mjs";
import { OGt as S } from "./app-initial-c468e3fd7f91.js";
import { AYn as t } from "./app-shared-2f2228189a8d.js";
import { iJ as c } from "./app-shared-2f2228189a8d.js";
import { aJ as f } from "./app-shared-2f2228189a8d.js";
import { fq as p } from "./app-shared-2f2228189a8d.js";
import { fw as g } from "./app-initial-c468e3fd7f91.js";
import { s4i as C } from "./app-initial-c468e3fd7f91.js";
import { WWt as m } from "./app-initial-c468e3fd7f91.js";
import { p4i as b } from "./app-initial-c468e3fd7f91.js";
import { zM as i } from "./app-shared-2f2228189a8d.js";
import { GL as a } from "./app-shared-2f2228189a8d.js";
import { Fqr as r } from "./app-shared-2f2228189a8d.js";
import { FWt as _ } from "./app-initial-c468e3fd7f91.js";
import { MWt as h } from "./app-initial-c468e3fd7f91.js";
import { l as O } from "./microsoft-oauth-bundle-d3907c124361.js";
import { s as E } from "./microsoft-oauth-bundle-d3907c124361.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { RWt as v } from "./app-initial-c468e3fd7f91.js";
import { p as D } from "./microsoft-oauth-bundle-d3907c124361.js";
import { CF as d } from "./app-shared-2f2228189a8d.js";
import { Y3 as o } from "./app-shared-2f2228189a8d.js";
import { lJr as l } from "./app-shared-2f2228189a8d.js";
import { GWt as w } from "./app-initial-c468e3fd7f91.js";
import { b4i as T } from "./app-initial-c468e3fd7f91.js";
import { f4i as x } from "./app-initial-c468e3fd7f91.js";
import { mw as y } from "./app-initial-c468e3fd7f91.js";
import { xQ as s } from "./app-shared-2f2228189a8d.js";
import { lJ as u } from "./app-shared-2f2228189a8d.js";
import { pq as n } from "./app-shared-2f2228189a8d.js";
async function k({scope:e,appId:n,browserAccountId:o,freshLinkChecks:s=!1,getAvailableCompanions:l,getCompanionConnectorIds:u,hostId:d,primaryLink:h,productSku:_,queryClient:v}){if(h!=null)return[];let y=S({accountId:o??t(e)??e.get(c),userId:e.get(f),productSku:_});if(!y.enabled)return[];let x=u(n),[w,T,E,D]=await Promise.all([v.fetchQuery({...y,staleTime:s?0:p.FIVE_MINUTES}).catch(()=>void 0),g(d)?v.fetchQuery(C({userId:e.get(f),accountId:o??t(e)??null,productSku:_,appIds:x,enabled:!0})).then(m).catch(()=>new Set):v.fetchQuery(b({scope:e,appIds:x,browserAccountId:o,hostId:d,queryClient:v,supportsAppRead:i(e.get(a,d),`appRead`)})).then(e=>new Set(e.map(({id:e})=>e))).catch(()=>new Set),v.fetchQuery(r(n,{productSku:_})).catch(()=>null),Promise.all(x.map(e=>v.fetchQuery(r(e)).catch(()=>null)))]);return w==null||w.some(e=>e.connector_id===n)||E==null?[]:l({availableAppIds:T,companionConnectorIds:x,companionConnectors:D,companionLinks:x.map(e=>w.find(t=>t.connector_id===e)??null)})}
function A(){return(A=e(()=>{d();o();l();w();T();x();y();s();u();n();}))();}
function j(e){return k({...e,getAvailableCompanions:t=>_({...t,connectors:e.connectors}),getCompanionConnectorIds:t=>h(t,e.connectors)})}
function M(){return(M=e(()=>{A();v();}))();}
function N(e){return k({...e,getAvailableCompanions:O,getCompanionConnectorIds:E})}
function P(){return(P=e(()=>{A();D();}))();}
export { S, t, c, f, p, g, C, m, b, i, a, r, _, h, O, E, e, v, D, d, o, l, w, T, x, y, s, u, n, k, A, j, M, N, P };
