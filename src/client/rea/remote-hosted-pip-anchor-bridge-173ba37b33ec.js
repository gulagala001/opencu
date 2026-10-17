import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
function i({homeSurfaceRect:e,hostId:t,hostRect:n,isCodexHomeAvailable:r,obstacleRects:i,presentationSize:q}){T=q??{height:250,width:250};let s=i.map(e=>f(n,e)),c=r&&e!=null?o(n,e):null;return{anchorRect:n,anchors:A.map(e=>a(e,n,s,e===`top-right`?c:null)),animated:!1,hostId:t,homeSurfaceWidth:e?.width??null,isCodexHomeAvailable:r,interactionPassthroughRect:null,presentationScope:`thread`}}
function a(e,t,n,r){if(r!=null)return{alignment:e,point:p(e,t,r)};let i=m(s(e,t),t),a=i;for(let r=0;r<E;r+=1){let r=d(a,n);if(r==null)break;a=c({alignment:e,hostRect:t,obstacle:r,obstacles:n,rect:a,sourceRect:i})}return{alignment:e,point:p(e,t,a)}}
function o(e,t){let n=t.x-e.x+t.width,r=t.y-e.y;return h(n-T.width,r,T)}
function s(e,t){switch(e){case`top-left`:return h(C,C,T);case`top-right`:return h(t.width-T.width-C,C,T);case`bottom-left`:return h(C,t.height-T.height-C,T);case`bottom-right`:return h(t.width-T.width-C,t.height-T.height-C,T)}}
function c({alignment:e,hostRect:t,obstacle:n,obstacles:r,rect:i,sourceRect:a}){let o=l(e,i,n).map(e=>({priority:e.priority,rect:m(e.rect,t)})),s=o[0],c=s==null?1/0:u(s,r,a);for(let e of o.slice(1)){let t=u(e,r,a);t<c&&(s=e,c=t)}return s?.rect??i}
function l(e,t,n){let r=h(t.left,n.bottom,t),i=h(t.left,n.top-t.height,t),a=h(n.right,t.top,t),o=h(n.left-t.width,t.top,t);switch(e){case`top-left`:return[{priority:0,rect:r},{priority:1,rect:a},{priority:2,rect:o},{priority:3,rect:i}];case`top-right`:return[{priority:0,rect:r},{priority:1,rect:o},{priority:2,rect:a},{priority:3,rect:i}];case`bottom-left`:return[{priority:0,rect:i},{priority:1,rect:a},{priority:2,rect:o},{priority:3,rect:r}];case`bottom-right`:return[{priority:0,rect:i},{priority:1,rect:o},{priority:2,rect:a},{priority:3,rect:r}]}}
function u(e,t,n){let r=t.reduce((t,n)=>t+_(e.rect,n),0);return(r>0?D:0)+r*O+e.priority*k+(e.rect.left-n.left)**2+(e.rect.top-n.top)**2}
function d(e,t){for(let n of t)if(_(e,n)>0)return n;return null}
function f(e,t){return g({bottom:t.y-e.y+t.height+w,left:t.x-e.x-w,right:t.x-e.x+t.width+w,top:t.y-e.y-w})}
function p(e,t,n){switch(e){case`top-left`:return{x:t.x+n.left,y:t.y+n.top};case`top-right`:return{x:t.x+n.right,y:t.y+n.top};case`bottom-left`:return{x:t.x+n.left,y:t.y+n.bottom};case`bottom-right`:return{x:t.x+n.right,y:t.y+n.bottom}}}
function m(e,t){return h(v(e.left,C,Math.max(C,t.width-e.width-C)),v(e.top,C,Math.max(C,t.height-e.height-C)),e)}
function h(e,t,n){return{bottom:t+n.height,height:n.height,left:e,right:e+n.width,top:t,width:n.width}}
function g({bottom:e,left:t,right:n,top:r}){return{bottom:e,height:e-r,left:t,right:n,top:r,width:n-t}}
function _(e,t){let n=Math.min(e.right,t.right)-Math.max(e.left,t.left),r=Math.min(e.bottom,t.bottom)-Math.max(e.top,t.top);return n<=0||r<=0?0:n*r}
function v(e,t,n){return Math.min(Math.max(e,t),n)}
var C;
var w;
var T;
var E;
var D;
var O;
var k;
var A;
function j(){return(j=e(()=>{C=24;w=12;T={height:250,width:250};E=6;D=1e9;O=1e4;k=1e6;A=[`top-left`,`top-right`,`bottom-left`,`bottom-right`];}))();}
export { e, i, a, o, s, c, l, u, d, f, p, m, h, g, _, v, C, w, T, E, D, O, k, A, j };
