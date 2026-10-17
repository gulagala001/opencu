import * as Host from "../host-boundaries.mjs";
import { d as t } from "./font-face-utils-fe93ca9bfec0.js";
import { l as r } from "./font-face-utils-fe93ca9bfec0.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { v as n } from "./font-face-utils-fe93ca9bfec0.js";
function o(){return l||(l=Promise.resolve().then(async()=>{typeof document>`u`||!document.fonts?.load||(await Promise.all(c.map(e=>document.fonts.load(`${e} 16px Carlito`))),await t(r()))}).catch(()=>{}).then(()=>{u=!0}),l)}
function s(){return u}
var c;
var l;
var u;
function d(){return(d=e(()=>{n();c=[`400`,`700`];l=null;u=!1;}))();}
export { t, r, e, n, o, s, c, l, u, d };
