import * as Host from "../host-boundaries.mjs";
import { TK as i } from "./app-shared-2f2228189a8d.js";
import { Lhn as o } from "./app-shared-2f2228189a8d.js";
import { Nhn as s } from "./app-shared-2f2228189a8d.js";
import { _hn as p } from "./app-shared-2f2228189a8d.js";
import { _Sr as f } from "./app-shared-2f2228189a8d.js";
import { nN as n } from "./app-shared-2f2228189a8d.js";
import { jz as d } from "./app-shared-2f2228189a8d.js";
import { V1 as r } from "./app-shared-2f2228189a8d.js";
import { H1 as a } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { Khn as c } from "./app-shared-2f2228189a8d.js";
import { W1 as t } from "./app-shared-2f2228189a8d.js";
import { ySr as l } from "./app-shared-2f2228189a8d.js";
import { Nz as u } from "./app-shared-2f2228189a8d.js";
function m(e,{hostId:t,originatingTurn:n,path:r,threadId:i}){let a=e.value,o=a.routeKind===`local-thread`&&a.conversationId===i?a.conversationId:null,s=o==null?void 0:h(e,{conversationId:o,fallback:n,hostId:t,path:r});return{threadId:o,turnId:s?.turnId??null,inputMessageId:s?.inputMessageId??null,messageId:s?.messageId??null}}
function h(e,{conversationId:t,fallback:c,hostId:l,path:u}){let m=e.value;if(m.routeKind!==`local-thread`||m.conversationId!==t||m.hostId!=null&&m.hostId!==l)return;let h={hostId:l,threadId:m.conversationId},g=e.get(i,h);if(g!=null){if(e.get(o,h)!==!0){let t=e.get(s,h);if(t?.at(-1)?.type!==`content`)return;let n=t[t.findLastIndex(e=>e.type===`gap`)+1];if(n?.type!==`content`)return;let r=g.findIndex(e=>e.entityKey===n.value);if(r<0)return;g=g.slice(r)}for(let t=g.length-1;t>=0;--t){let i=p(e,g[t]);if(i?.status!==`completed`||i.itemsPagination?.hasLoadedOldest===!1)return;let o=f(i);if(![...o.outputFilePaths,...o.editedFilePaths].some(e=>n(d(i.params.cwd??``,e),u)))continue;if(i.turnId==null)return;let s=c?.turnId===i.turnId?c:void 0;return{turnId:i.turnId,inputMessageId:r(i)??s?.inputMessageId??null,messageId:a(i)??s?.messageId??null}}}}
function g(){return(g=e(()=>{c();t();l();u();}))();}
export { i, o, s, p, f, n, d, r, a, e, c, t, l, u, m, h, g };
