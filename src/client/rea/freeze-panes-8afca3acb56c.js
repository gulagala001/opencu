import * as Host from "../host-boundaries.mjs";
import { f as n } from "./draw-drawing-selection-35a6f5da1dd6.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { y as t } from "./address-utils-9482ac1b51ec.js";
import { h as r } from "./draw-drawing-selection-35a6f5da1dd6.js";
function i(e,t){let n=0;for(let r=0;r<t;r+=1)n+=e[r]??0;return n}
function a(e){if(!(e.size>0))return[];let t=e.start+e.size,n=e.headerSize+e.frozenBodySize,r=[],i=Math.min(t,n);i>e.start&&r.push({start:e.start,size:i-e.start});let a=Math.max(e.start,n);if(t>a){let i=a-e.scroll,o=t-e.scroll,s=Math.max(i,n);o>s&&r.push({start:s,size:o-s})}return r}
function o(e){let t=[0];for(let n=0;n<e.length;n+=1)t[n+1]=(t[n]??0)+(e[n]??0);return t}
function s(e,t){let n=Math.max(0,t),r=0,i=1/0;for(let t=0;t<e.length;t+=1){let a=e[t]??0,o=Math.abs(a-n);o<i&&(r=t,i=o)}return r}
function c(e){let t=i(e.columnWidths,e.freezePanes.columnCount),n=i(e.rowHeights,e.freezePanes.rowCount);return{frozenBodyWidth:t,frozenBodyHeight:n,freezeLineX:40+t,freezeLineY:20+n}}
function l(e){let t=Math.min(e.maxZoom,Math.max(e.minZoom,e.camera.k)),r=c(e),a=Math.max(0,e.viewportWidth/t-40),o=Math.max(0,e.viewportHeight/t-20),s=Math.max(0,e.bottomScrollReservePx??0)/t,l=i(e.columnWidths,e.columnWidths.length),u=i(e.rowHeights,e.rowHeights.length),d=Math.max(0,l-r.frozenBodyWidth),f=Math.max(0,u-r.frozenBodyHeight),p=Math.max(0,a-r.frozenBodyWidth),m=Math.max(0,o-r.frozenBodyHeight),h=Math.max(0,d-p),g=Math.max(0,f+s-m),_=n({...e.camera,k:t}),v=Math.min(h,Math.max(0,_.left)),y=Math.min(g,Math.max(0,_.top));return{x:-v*t,y:-y*t,k:t}}
function u(e){let t=n(e.camera),r=c(e),i=e.logicalX-40,a=e.logicalY-20,o=e.logicalX>=0&&e.logicalX<40,s=e.logicalY>=0&&e.logicalY<20,l=e.freezePanes.columnCount>0&&i>=0&&i<r.frozenBodyWidth,u=e.freezePanes.rowCount>0&&a>=0&&a<r.frozenBodyHeight,d=o||l?i:r.frozenBodyWidth+(i-r.frozenBodyWidth)+t.left,f=s||u?a:r.frozenBodyHeight+(a-r.frozenBodyHeight)+t.top;return{x:o?e.logicalX:40+d,y:s?e.logicalY:20+f}}
function d(e){let t=Math.max(e.camera.k,2**-52);return u({camera:e.camera,logicalX:e.screenX/t,logicalY:e.screenY/t,freezePanes:e.freezePanes,columnWidths:e.columnWidths,rowHeights:e.rowHeights})}
function f(e){let t=n(e.camera),r=c(e),i=e.worldX-40,a=e.worldY-20,o=e.worldX>=0&&e.worldX<40,s=e.worldY>=0&&e.worldY<20,l=e.freezePanes.columnCount>0&&i>=0&&i<r.frozenBodyWidth,u=e.freezePanes.rowCount>0&&a>=0&&a<r.frozenBodyHeight,d=o||l?i:r.frozenBodyWidth+(i-r.frozenBodyWidth)-t.left,f=s||u?a:r.frozenBodyHeight+(a-r.frozenBodyHeight)-t.top;return{x:o?e.worldX:40+d,y:s?e.worldY:20+f}}
function p(e){let t=f(e);return{x:t.x*e.camera.k,y:t.y*e.camera.k}}
function m(e){let t=Math.max(e.camera.k,2**-52),n=-e.camera.x/t,r=-e.camera.y/t,o=a({start:e.worldX,size:e.width,headerSize:40,frozenBodySize:i(e.columnWidths,e.freezePanes.columnCount),scroll:n}),s=a({start:e.worldY,size:e.height,headerSize:20,frozenBodySize:i(e.rowHeights,e.freezePanes.rowCount),scroll:r}),c=[];for(let e of o)for(let t of s)c.push({x:e.start,y:t.start,width:e.size,height:t.size});return c}
function h(e){return m(e).map(t=>({x:t.x*e.camera.k,y:t.y*e.camera.k,width:t.width*e.camera.k,height:t.height*e.camera.k}))}
function g(){return(g=e(()=>{t();r();}))();}
export { n, e, t, r, i, a, o, s, c, l, u, d, f, p, m, h, g };
