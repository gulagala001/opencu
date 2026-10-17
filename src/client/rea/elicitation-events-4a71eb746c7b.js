import * as Host from "../host-boundaries.mjs";
import { CB as a } from "./app-shared-2f2228189a8d.js";
import { u$t as o } from "./app-shared-2f2228189a8d.js";
import { EP as c } from "./app-initial-c468e3fd7f91.js";
import { TB as n } from "./app-shared-2f2228189a8d.js";
import { wB as i } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { SB as t } from "./app-shared-2f2228189a8d.js";
import { DP as s } from "./app-initial-c468e3fd7f91.js";
import { OB as r } from "./app-shared-2f2228189a8d.js";
function l(e,t,n){a(e,o,{...t,stage:`interacted`,action:n})}
function u(e,t){return t.visibilityState===`visible`&&e.get(c)===!0}
function d(e,t,r,s){if(t==null||r==null||typeof IntersectionObserver>`u`)return;let l=JSON.stringify([r.threadId,r.turnId,r.itemId]),d=t.ownerDocument,f=!1,p=()=>{s.current!==l&&f&&t.isConnected&&u(e,d)&&(t.checkVisibility?.({visibilityProperty:!0,opacityProperty:!0})??!0)&&e.get(n)!==i&&(s.current=l,a(e,o,{...r,stage:`shown`}))},m=new IntersectionObserver(e=>{f=e.some(e=>e.intersectionRatio>0),p()});m.observe(t);let h=e.watch(e=>{e.get(c),e.get(n),p()});return d.addEventListener(`visibilitychange`,p),d.defaultView?.addEventListener(`focus`,p),()=>{m.disconnect(),h(),d.removeEventListener(`visibilitychange`,p),d.defaultView?.removeEventListener(`focus`,p)}}
function f(){return(f=e(()=>{t();s();r();}))();}
export { a, o, c, n, i, e, t, s, r, l, u, d, f };
