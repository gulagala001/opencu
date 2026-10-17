import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as t } from "./app-shared-2f2228189a8d.js";
import { o as n } from "./app-shared-2f2228189a8d.js";
function r(e,t){let n=(0,i.c)(13),r=t??(typeof window>`u`?void 0:window),o=(0,a.useRef)(null),s;n[0]!==r||n[1]!==e?(s=()=>{o.current!=null&&(r?.cancelAnimationFrame(o.current),o.current=null),e.current?.style.removeProperty(`animation`)},n[0]=r,n[1]=e,n[2]=s):s=n[2];let c=s,l;n[3]!==r||n[4]!==e||n[5]!==c?(l=()=>{c(),r!=null&&e.current!=null&&(o.current=r.requestAnimationFrame(()=>{o.current=null,e.current!=null&&(e.current.style.animation=`shake 900ms linear both`)}))},n[3]=r,n[4]=e,n[5]=c,n[6]=l):l=n[6];let u=l,d,f;n[7]===c?(d=n[8],f=n[9]):(d=()=>c,f=[c],n[7]=c,n[8]=d,n[9]=f),(0,a.useEffect)(d,f);let p;return n[10]!==u||n[11]!==c?(p={shake:u,stopShake:c},n[10]=u,n[11]=c,n[12]=p):p=n[12],p}
var i;
var a;
function o(){return(o=e(()=>{i=t();a=n();}))();}
function s({isLightDismissible:e,isLightDismissArmed:t}){return e||t?`dismiss`:`shake`}
export { e, t, n, r, i, a, o, s };
