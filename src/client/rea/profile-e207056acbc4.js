import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { u as t } from "./rolldown-runtime-2d059c5e81f4.js";
import { _p as n } from "./app-shared-2f2228189a8d.js";
async function r(e){if(e==null)return;let t=null,n=!1,r=()=>{n=!0,t?.[Symbol.dispose](),t=null,window.removeEventListener(`pagehide`,r)};window.addEventListener(`pagehide`,r,{once:!0});try{t=await e.subscribeExtensionProfile(e=>{n||l.receive(e)}),n&&r()}catch(e){throw r(),e}}
var i;
var a;
var o;
var s;
var c;
var l;
function u(){return(u=e(()=>{i=t(n(),1);a=null;o=null;s=!1;c=new Set();l={getSnapshot:()=>a,subscribe:e=>(c.add(e),()=>{c.delete(e);}),initialize:e=>o??(s=!1,o=r(e).catch(()=>{o=null,s=!0,l.receive(null);}),o),retry:e=>{s&&l.initialize(e);},receive:e=>{if(!(0,i.default)(a,e)){a=e;for(let e of c)e();}}};}))();}
export { e, t, n, r, i, a, o, s, c, l, u };
