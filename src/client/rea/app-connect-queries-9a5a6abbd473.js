import * as Host from "../host-boundaries.mjs";
import { oqr as l } from "./app-shared-2f2228189a8d.js";
import { Fqr as r } from "./app-shared-2f2228189a8d.js";
import { fq as u } from "./app-shared-2f2228189a8d.js";
import { xq as a } from "./app-shared-2f2228189a8d.js";
import { E2 as c } from "./app-shared-2f2228189a8d.js";
import { k2 as i } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { pq as t } from "./app-shared-2f2228189a8d.js";
import { Sq as o } from "./app-shared-2f2228189a8d.js";
import { lJr as s } from "./app-shared-2f2228189a8d.js";
import { dqr as n } from "./app-shared-2f2228189a8d.js";
function d(e,t){return{queryKey:[`mcp-settings`,`app-connect`,`tos`,e,t],staleTime:u.FIVE_MINUTES,queryFn:({signal:n})=>a.safeGet(`/aip/connectors/{connector_id}/tos`,{surface:`connector_setup`,parameters:{path:{connector_id:e}},additionalHeaders:{[c]:t},signal:n})}}
function p(e,t,n){let a=l(t,n);e.prefetchQuery(r(t,{productSku:a?.productSku})),e.prefetchQuery(d(t,a?.productSku??i()))}
function m(){return(m=e(()=>{t();o();s();n();}))();}
export { l, r, u, a, c, i, e, t, o, s, n, d, p, m };
