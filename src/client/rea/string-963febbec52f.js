import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
function i(){}
function l(e){var t,n;return e=(e+``).trim().toLowerCase(),(t=j.exec(e))?(n=t[1].length,t=parseInt(t[1],16),n===6?u(t):n===3?new m(t>>8&15|t>>4&240,t>>4&15|t&240,(t&15)<<4|t&15,1):n===8?d(t>>24&255,t>>16&255,t>>8&255,(t&255)/255):n===4?d(t>>12&15|t>>8&240,t>>8&15|t>>4&240,t>>4&15|t&240,((t&15)<<4|t&15)/255):null):(t=M.exec(e))?new m(t[1],t[2],t[3],1):(t=N.exec(e))?new m(t[1]*255/100,t[2]*255/100,t[3]*255/100,1):(t=P.exec(e))?d(t[1],t[2],t[3],t[4]):(t=F.exec(e))?d(t[1]*255/100,t[2]*255/100,t[3]*255/100,t[4]):(t=I.exec(e))?b(t[1],t[2]/100,t[3]/100,1):(t=L.exec(e))?b(t[1],t[2]/100,t[3]/100,t[4]):R.hasOwnProperty(e)?u(R[e]):e===`transparent`?new m(NaN,NaN,NaN,0):null}
function u(e){return new m(e>>16&255,e>>8&255,e&255,1)}
function d(e,t,n,r){return r<=0&&(e=t=n=NaN),new m(e,t,n,r)}
function f(e){return e instanceof i||(e=l(e)),e?(e=e.rgb(),new m(e.r,e.g,e.b,e.opacity)):new m}
function p(e,t,n,r){return arguments.length===1?f(e):new m(e,t,n,r??1)}
function m(e,t,n,r){this.r=+e,this.g=+t,this.b=+n,this.opacity=+r}
function b(e,t,n,r){return r<=0?e=t=n=NaN:n<=0||n>=1?e=t=NaN:t<=0&&(e=NaN),new S(e,t,n,r)}
function S(e,t,n,r){this.h=+e,this.s=+t,this.l=+n,this.opacity=+r}
var O;
var k;
var A;
var j;
var M;
var N;
var P;
var F;
var I;
var L;
var R;
function z(){return(z=e(()=>{O=`\\s*([+-]?\\d+)\\s*`;k=`\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*`;A=`\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*`;j=/^#([0-9a-f]{3,8})$/;M=RegExp(`^rgb\\(${O},${O},${O}\\)$`);N=RegExp(`^rgb\\(${A},${A},${A}\\)$`);P=RegExp(`^rgba\\(${O},${O},${O},${k}\\)$`);F=RegExp(`^rgba\\(${A},${A},${A},${k}\\)$`);I=RegExp(`^hsl\\(${k},${A},${A}\\)$`);L=RegExp(`^hsla\\(${k},${A},${A},${k}\\)$`);R={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074};}))();}
var H;
function U(){return(U=e(()=>{H=e=>()=>e;}))();}
function W(e,t){return function(n){return e+n*t}}
function ne(e,t,n){return e**=+n,t=t**+n-e,n=1/n,function(r){return(e+r*t)**+n}}
function ie(e){return(e=+e)==1?G:function(t,n){return n-t?ne(t,n,e):H(isNaN(t)?n:t)}}
function G(e,t){var n=t-e;return n?W(e,n):H(isNaN(e)?t:e)}
function K(){return(K=e(()=>{U();}))();}
var q;
function J(){return(J=e(()=>{z();K();q=function e(t){var n=ie(t);function r(e,t){var r=n((e=p(e)).r,(t=p(t)).r),i=n(e.g,t.g),a=n(e.b,t.b),o=G(e.opacity,t.opacity);return function(t){return e.r=r(t),e.g=i(t),e.b=a(t),e.opacity=o(t),e+``;};}return r.gamma=e,r;}(1);}))();}
function Y(e,t){return e=+e,t=+t,function(n){return e*(1-n)+t*n}}
function ae(e){return function(){return e}}
function oe(e){return function(t){return e(t)+``}}
function se(e,t){var n=Z.lastIndex=Q.lastIndex=0,r,i,a,o=-1,s=[],c=[];for(e+=``,t+=``;(r=Z.exec(e))&&(i=Q.exec(t));)(a=i.index)>n&&(a=t.slice(n,a),s[o]?s[o]+=a:s[++o]=a),(r=r[0])===(i=i[0])?s[o]?s[o]+=i:s[++o]=i:(s[++o]=null,c.push({i:o,x:Y(r,i)})),n=Q.lastIndex;return n<t.length&&(a=t.slice(n),s[o]?s[o]+=a:s[++o]=a),s.length<2?c[0]?oe(c[0].x):ae(t):(t=c.length,function(e){for(var n=0,r;n<t;++n)s[(r=c[n]).i]=r.x(e);return s.join(``)})}
var Z;
var Q;
function $(){return($=e(()=>{Z=/[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g;Q=new RegExp(Z.source,`g`);}))();}
export { e, i, l, u, d, f, p, m, b, S, O, k, A, j, M, N, P, F, I, L, R, z, H, U, W, ne, ie, G, K, q, J, Y, ae, oe, se, Z, Q, $ };
