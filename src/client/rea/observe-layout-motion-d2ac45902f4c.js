import * as Host from "../host-boundaries.mjs";
import { ZS as t } from "./app-shared-2f2228189a8d.js";
import { QS as r } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { tC as n } from "./app-shared-2f2228189a8d.js";
function i({update:e,motionValues:n}){let i=()=>{t.postRender(e)},a=n.map(e=>e?.on(`change`,i));return{scheduleUpdate:i,disconnect(){for(let e of a)e?.();r(e)}}}
function a(){return(a=e(()=>{n();}))();}
export { t, r, e, n, i, a };
