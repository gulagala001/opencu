import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sA as n } from "./app-shared-2f2228189a8d.js";
import { gI as r } from "./app-shared-2f2228189a8d.js";
import { Uk as i } from "./app-shared-2f2228189a8d.js";
import { X as t } from "./app-shared-2f2228189a8d.js";
function o(e,t,n){e.set(p,t,()=>({accessory:n,phase:`open`}))}
function s(e,t,n){let r=e.get(p,t);r?.accessory===n&&r.phase===`open`&&e.set(p,t,()=>({accessory:n,phase:`closing`}))}
function c(e,t,n){let r=e.get(p,t);r?.accessory===n&&r.phase===`closing`&&e.set(p,t,null)}
function l(e,t,n){e.get(p,t)?.accessory===n&&e.set(p,t,null)}
function u(e){return`artifact:${e}`}
function d(e){return e.identity.type===`library`?f(e.identity.libraryFileId):`file:${e.identity.fileId}`}
function f(e){return`library:${e}`}
var p;
var h;
function g(){return(g=e(()=>{n();r();p=i(t,e=>null,void 0,{autoDispose:!0});h=i(t,e=>null,void 0,{autoDispose:!0});}))();}
export { e, n, r, i, t, o, s, c, l, u, d, f, p, h, g };
