import * as Host from "../host-boundaries.mjs";
import { t as r } from "./constant-363a14bf6d8f.js";
import { n as o } from "./linear-51abf1a86c3b.js";
import { l as t } from "./path-3b8129ebc7ff.js";
import { t as a } from "./array-15adaa1bc228.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { r as s } from "./linear-51abf1a86c3b.js";
import { u as n } from "./path-3b8129ebc7ff.js";
function c(e){return e[0]}
function l(e){return e[1]}
function d(e,n){var i=r(!0),s=null,u=o,d=null,f=t(p);e=typeof e==`function`?e:e===void 0?c:r(e),n=typeof n==`function`?n:n===void 0?l:r(n);function p(t){var r,o=(t=a(t)).length,c,l=!1,p;for(s??(d=u(p=f())),r=0;r<=o;++r)!(r<o&&i(c=t[r],r,t))===l&&((l=!l)?d.lineStart():d.lineEnd()),l&&d.point(+e(c,r,t),+n(c,r,t));if(p)return d=null,p+``||null}return p.x=function(t){return arguments.length?(e=typeof t==`function`?t:r(+t),p):e},p.y=function(e){return arguments.length?(n=typeof e==`function`?e:r(+e),p):n},p.defined=function(e){return arguments.length?(i=typeof e==`function`?e:r(!!e),p):i},p.curve=function(e){return arguments.length?(u=e,s!=null&&(d=u(s)),p):u},p.context=function(e){return arguments.length?(e==null?s=d=null:d=u(s=e),p):s},p}
function f(){return(f=e(()=>{s();n();}))();}
export { r, o, t, a, e, s, n, c, l, d, f };
