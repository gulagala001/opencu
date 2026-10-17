import * as Host from "../host-boundaries.mjs";
import { E8r as n } from "./app-shared-2f2228189a8d.js";
import { pj as t } from "./app-shared-2f2228189a8d.js";
import { c as a } from "./webmcp-tool-calls-c51f7e9a9be2.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { CF as r } from "./app-shared-2f2228189a8d.js";
import { d as i } from "./webmcp-tool-calls-c51f7e9a9be2.js";
function o(e){let r=[];for(let i=e.length-1;i>=0;--i){let o=n(e[i]?.items??[]);for(let e=o.length-1;e>=0;--e){let n=o[e];n?.type===`mcpToolCall`&&n.status!==`inProgress`&&t(n.server)&&r.push(...a(n.result?._meta).slice().reverse())}}return r}
function s(e){let t=new Map;for(let n of e){let e=t.get(n.name);e==null?t.set(n.name,{calls:[n],name:n.name}):e.calls.push(n)}return Array.from(t.values())}
function c(e){try{return new URL(e).hostname||void 0}catch{return}}
function l(){return(l=e(()=>{r();i();}))();}
export { n, t, a, e, r, i, o, s, c, l };
