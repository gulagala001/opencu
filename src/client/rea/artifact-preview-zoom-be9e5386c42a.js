import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
function t(e){return Math.min(s,Math.max(o,e))}
function n(e,n){return t(Math.round(e*Math.exp(-n*c)))}
function r({initialDistance:e,initialZoomPercent:n,nextDistance:r}){return t(Math.round(r/e*n))}
function i(e,t,n,r){let i=e-n,a=t-r;return Math.hypot(i,a)}
var a;
var o;
var s;
var c;
function l(){return(l=e(()=>{a=[25,50,100,150,200];o=10;s=400;c=.01;}))();}
export { e, t, n, r, i, a, o, s, c, l };
