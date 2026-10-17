import * as Host from "../host-boundaries.mjs";
import { lS as o } from "./app-shared-2f2228189a8d.js";
import { q as u } from "./app-shared-2f2228189a8d.js";
import { WSi as t } from "./app-shared-2f2228189a8d.js";
import { fxi as s } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as r } from "./app-shared-2f2228189a8d.js";
import { o as i } from "./app-shared-2f2228189a8d.js";
import { xS as l } from "./app-shared-2f2228189a8d.js";
import { GSi as c } from "./app-shared-2f2228189a8d.js";
import { o5 as a } from "./app-shared-2f2228189a8d.js";
import { K as n } from "./app-shared-2f2228189a8d.js";
var f;
var p;
var m;
function h(){return(h=e(()=>{f=`_dots_sybo7_1`;p=`_reducedMotion_sybo7_18`;m={dots:f,"dot-field-opacity":`_dot-field-opacity_sybo7_30`,reducedMotion:p};}))();}
function g(e){let t=(0,w.c)(13),{ariaLabel:n,background:r,isAnimating:i,presentation:a}=e,s=r===void 0?`surface`:r,c=i===void 0||i,l=a===void 0?`default`:a,d=o(),f=l;f===`single`?f=`playground`:f===`fill`&&(f=`default`);let p;t[0]!==n||t[1]!==d?(p=n??d.formatMessage({id:`codex.chatGptConversation.imageGeneration.loadingLabel`,defaultMessage:`Generating image...`,description:`Aria label for the image generation loading placeholder`}),t[0]=n,t[1]=d,t[2]=p):p=t[2];let m=s===`surface`&&`dark:bg-primary-ghost-hover bg-primary-soft-active`,h;t[3]!==l||t[4]!==m?(h=u(`dark:text-white/70 overflow-clip text-secondary`,m,l===`fill`?`absolute inset-0 size-full`:[`relative aspect-square`,l===`thumbnail`?`rounded-lg`:`rounded-2xl`,l===`single`?`size-[min(100cqw,100cqh)]`:`w-full max-w-[400px]`]),t[3]=l,t[4]=m,t[5]=h):h=t[5];let g;t[6]!==f||t[7]!==c?(g=(0,E.jsx)(_,{isAnimating:c,presentation:f}),t[6]=f,t[7]=c,t[8]=g):g=t[8];let v;return t[9]!==p||t[10]!==h||t[11]!==g?(v=(0,E.jsx)(`div`,{"aria-busy":!0,"aria-label":p,className:h,children:g}),t[9]=p,t[10]=h,t[11]=g,t[12]=v):v=t[12],v}
function _(e){let n=(0,w.c)(11),{isAnimating:r,presentation:i}=e,a=t(),o=s(),c=(0,T.useRef)(null),l=(0,T.useRef)(null),d,f;n[0]!==r||n[1]!==o||n[2]!==i||n[3]!==a?(d=()=>{if(!r)return;let e=c.current,t=l.current,n=t?.getContext(`2d`);if(e==null||t==null||n==null)return;let s=Math.PI*2,u=getComputedStyle(e).color||(o?`white`:`black`),d=(e,t)=>e+(a?.5:Math.random())*(t-e),f=e=>e*I*d(1,1.35),p={durations:{offsetX1:f(L.offsetX1),offsetY1:f(L.offsetY1),offsetX2:f(L.offsetX2),offsetY2:f(L.offsetY2),fieldSize1:f(L.fieldSize1),fieldSize2:f(L.fieldSize2)},phases:{offsetX1:d(0,1),offsetY1:d(0,1),offsetX2:d(0,1),offsetY2:d(0,1),fieldSize1:d(0,1),fieldSize2:d(0,1)},bounds:{x1Start:d(.1,.32),x1End:d(.68,.9),y1Start:d(.1,.32),y1End:d(.68,.9),x2Start:d(.68,.9),x2End:d(.1,.32),y2Start:d(.68,.9),y2End:d(.1,.32)},fieldSizeRange:{firstStart:d(.42,.52),firstEnd:d(.62,.75),secondStart:d(.5,.62),secondEnd:d(.74,.9)}},m=null,h=0,g=null,_=!0,w=null,T=()=>{let n=e.getBoundingClientRect(),r=Math.max(0,Math.floor(n.width)),a=Math.max(0,Math.floor(n.height));if(r===0||a===0){g=null,_=!1;return}let o=Math.max(1,window.devicePixelRatio||1),s=Math.floor(r*o),c=Math.floor(a*o);(t.width!==s||t.height!==c)&&(t.width=s,t.height=c);let l=i==="default"?Math.max(1,D/o):A[i].spacing,u=Math.max(1,Math.floor(r/l)),d=Math.max(1,Math.floor(a/l)),f=(r-(u-1)*l)*.5,p=(a-(d-1)*l)*.5,m=new Float32Array(u),h=new Float32Array(d),v=new Float32Array(u),y=new Float32Array(d);for(let e=0;e<u;e+=1)m[e]=f+e*l,v[e]=u===1?.5:e/(u-1);for(let e=0;e<d;e+=1)h[e]=p+e*l,y[e]=d===1?.5:e/(d-1);g={width:r,height:a,dpr:o,spacing:l,xPositions:m,yPositions:h,xNormals:v,yNormals:y},_=!1},E=e=>{if(!a&&h!==0&&e-h<33.333333333333336){m=requestAnimationFrame(E);return}if(h=e,w??=e,(_||g==null)&&T(),g==null){m=null;return}let t=a?0:e-w,r=(e,n)=>b(t/e+n),o=C(p.bounds.x1Start,p.bounds.x1End,S(r(p.durations.offsetX1,p.phases.offsetX1))),c=C(p.bounds.y1Start,p.bounds.y1End,x(r(p.durations.offsetY1,p.phases.offsetY1))),l=C(p.bounds.x2Start,p.bounds.x2End,S(r(p.durations.offsetX2,p.phases.offsetX2))),d=C(p.bounds.y2Start,p.bounds.y2End,x(r(p.durations.offsetY2,p.phases.offsetY2))),f=M*C(p.fieldSizeRange.firstStart,p.fieldSizeRange.firstEnd,x(r(p.durations.fieldSize1,p.phases.fieldSize1))),D=M*C(p.fieldSizeRange.secondStart,p.fieldSizeRange.secondEnd,x(r(p.durations.fieldSize2,p.phases.fieldSize2)));n.save(),n.setTransform(g.dpr,0,0,g.dpr,0,0),n.clearRect(0,0,g.width,g.height),n.fillStyle=u;let I=i==="default"?Math.max(k,g.spacing*.5*O):A[i].radius;for(let e=0;e<g.yPositions.length;e+=1){let t=g.yPositions[e],r=g.yNormals[e];for(let e=0;e<g.xPositions.length;e+=1){let i=g.xPositions[e],a=g.xNormals[e],u=v((1-y(0,f,Math.hypot(a-o,r-c)))*N+(1-y(0,D,Math.hypot(a-l,r-d)))*P)**+F;u<=j||(n.globalAlpha=u,n.beginPath(),n.moveTo(i+I,t),n.arc(i,t,I,0,s),n.fill())}}n.restore(),m=a?null:requestAnimationFrame(E)},R=new ResizeObserver(()=>{_=!0,m??=requestAnimationFrame(E)});return R.observe(e),m=requestAnimationFrame(E),()=>{m!=null&&cancelAnimationFrame(m),R.disconnect()}},f=[r,o,i,a],n[0]=r,n[1]=o,n[2]=i,n[3]=a,n[4]=d,n[5]=f):(d=n[4],f=n[5]),(0,T.useEffect)(d,f);let p=(!r||a)&&m.reducedMotion,h;n[6]===p?h=n[7]:(h=u(m.dots,p),n[6]=p,n[7]=h);let g;n[8]===Symbol.for(`react.memo_cache_sentinel`)?(g=(0,E.jsx)(`canvas`,{ref:l,"aria-hidden":!0,className:`block h-full w-full`}),n[8]=g):g=n[8];let _;return n[9]===h?_=n[10]:(_=(0,E.jsx)(`div`,{ref:c,className:h,children:g}),n[9]=h,n[10]=_),_}
function v(e){return Math.min(1,Math.max(0,e))}
function y(e,t,n){let r=v((n-e)/(t-e));return r*r*(3-2*r)}
function b(e){let t=e%1;return t<=.5?t*2:2-t*2}
function x(e){return e*e*(3-2*e)}
function S(e){return e<.5?4*e*e*e:1-(-2*e+2)**3/2}
function C(e,t,n){return e+(t-e)*n}
var w;
var T;
var E;
var D;
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
function R(){return(R=e(()=>{w=r();T=i();l();c();a();h();E=n();D=12;O=.16;k=.55;A={playground:{spacing:14,radius:1.5},thumbnail:{spacing:6,radius:.75}};j=.03;M=.78;N=1.2;P=.82;F=1.18;I=1.2;L={offsetX1:4500,offsetY1:6330,offsetX2:5600,offsetY2:5750,fieldSize1:3600,fieldSize2:2400};}))();}
export { o, u, t, s, e, r, i, l, c, a, n, f, p, m, h, g, _, v, y, b, x, S, C, w, T, E, D, O, k, A, j, M, N, P, F, I, L, R };
