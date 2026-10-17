import * as Host from "../host-boundaries.mjs";
import { H as i } from "./linear-679e303fb101.js";
import { Z as o } from "./linear-679e303fb101.js";
import { G as l } from "./linear-679e303fb101.js";
import { W as s } from "./linear-679e303fb101.js";
import { t as y } from "./init-cd6c1f803e47.js";
import { C as d } from "./linear-679e303fb101.js";
import { s as h } from "./defaultLocale-1a6eeada7f42.js";
import { E as v } from "./defaultLocale-1a6eeada7f42.js";
import { a as p } from "./nice-2b3cc20611af.js";
import { _ as t } from "./linear-679e303fb101.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { k as r } from "./linear-679e303fb101.js";
import { O as g } from "./defaultLocale-1a6eeada7f42.js";
import { u as _ } from "./defaultLocale-1a6eeada7f42.js";
import { J as a } from "./linear-679e303fb101.js";
import { $ as c } from "./linear-679e303fb101.js";
function D(e,n,r=t){if((i=e.length)&&!isNaN(n=+n)){if(n<=0||i<2)return+r(e[0],0,e);if(n>=1)return+r(e[i-1],i-1,e);var i,a=(i-1)*n,o=Math.floor(a),s=+r(e[o],o,e);return s+(+r(e[o+1],o+1,e)-s)*(a-o)}}
function k(e){return Math.log(e)}
function A(e){return Math.exp(e)}
function j(e){return-Math.log(-e)}
function M(e){return-Math.exp(-e)}
function N(e){return isFinite(e)?+(`1e`+e):e<0?0:e}
function P(e){return e===10?N:e===Math.E?Math.exp:t=>e**+t}
function F(e){return e===Math.E?Math.log:e===10&&Math.log10||e===2&&Math.log2||(e=Math.log(e),t=>Math.log(t)/e)}
function I(e){return(t,n)=>-e(-t,n)}
function L(e){let t=e(k,A),n=t.domain,r=10,i,a;function o(){return i=F(r),a=P(r),n()[0]<0?(i=I(i),a=I(a),e(j,M)):e(k,A),t}return t.base=function(e){return arguments.length?(r=+e,o()):r},t.domain=function(e){return arguments.length?(n(e),o()):n()},t.ticks=e=>{let t=n(),o=t[0],s=t[t.length-1],c=s<o;c&&([o,s]=[s,o]);let l=i(o),u=i(s),f,p,m=e==null?10:+e,h=[];if(!(r%1)&&u-l<m){if(l=Math.floor(l),u=Math.ceil(u),o>0){for(;l<=u;++l)for(f=1;f<r;++f)if(p=l<0?f/a(-l):f*a(l),!(p<o)){if(p>s)break;h.push(p)}}else for(;l<=u;++l)for(f=r-1;f>=1;--f)if(p=l>0?f/a(-l):f*a(l),!(p<o)){if(p>s)break;h.push(p)}h.length*2<m&&(h=d(o,s,m))}else h=d(l,u,Math.min(u-l,m)).map(a);return c?h.reverse():h},t.tickFormat=(e,n)=>{if(e??=10,n??=r===10?`s`:`,`,typeof n!=`function`&&(!(r%1)&&(n=h(n)).precision==null&&(n.trim=!0),n=v(n)),e===1/0)return n;let o=Math.max(1,r*e/t.ticks().length);return e=>{let t=e/a(Math.round(i(e)));return t*r<r-.5&&(t*=r),t<=o?n(e):``}},t.nice=()=>n(p(n(),{floor:e=>a(Math.floor(i(e))),ceil:e=>a(Math.ceil(i(e)))})),t}
function R(){let e=L(l()).domain([1,10]);return e.copy=()=>s(e,R()).base(e.base()),y.apply(e,arguments),e}
function z(){return(z=e(()=>{r();g();_();a();}))();}
function B(e){return function(t){return t<0?-((-t)**+e):t**+e}}
function V(e){return e<0?-Math.sqrt(-e):Math.sqrt(e)}
function H(e){return e<0?-e*e:e*e}
function U(e){var t=e(i,i),n=1;function r(){return n===1?e(i,i):n===.5?e(V,H):e(B(n),B(1/n))}return t.exponent=function(e){return arguments.length?(n=+e,r()):n},o(t)}
function W(){var e=U(l());return e.copy=function(){return s(e,W()).exponent(e.exponent())},y.apply(e,arguments),e}
function G(){return W.apply(null,arguments).exponent(.5)}
function K(){return(K=e(()=>{c();a();}))();}
export { i, o, l, s, y, d, h, v, p, t, e, r, g, _, a, c, D, k, A, j, M, N, P, F, I, L, R, z, B, V, H, U, W, G, K };
