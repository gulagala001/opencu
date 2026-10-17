import * as Host from "../host-boundaries.mjs";
import { Dz as c } from "./app-shared-2f2228189a8d.js";
import { e6 as o } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sA as r } from "./app-shared-2f2228189a8d.js";
import { t6 as s } from "./app-shared-2f2228189a8d.js";
import { gI as a } from "./app-shared-2f2228189a8d.js";
import { pq as t } from "./app-shared-2f2228189a8d.js";
import { qk as i } from "./app-shared-2f2228189a8d.js";
import { X as n } from "./app-shared-2f2228189a8d.js";
import { fq as l } from "./app-shared-2f2228189a8d.js";
async function u(e){return c(o.computerUseSettings.removeAppApproval(e))}
async function _(e){return c(o.computerUseSettings.setSoundMode(e))}
async function v(e){return c(o.computerUseSettings.setLockedUseEnabled(e))}
var b;
var C;
var w;
function T(){return(T=e(()=>{r();s();a();t();b=i(n,()=>({queryFn:({signal:e})=>c(o.computerUseSettings.getAppApprovals(),e),queryKey:[`computer-use-app-approvals`],refetchOnMount:`always`,refetchOnWindowFocus:!0,staleTime:l.ONE_MINUTE}));C=i(n,()=>({queryFn:({signal:e})=>c(o.computerUseSettings.getSoundMode(),e),queryKey:[`computer-use-sound-mode`],refetchOnMount:`always`,refetchOnWindowFocus:!0,staleTime:l.FIVE_SECONDS}));w=i(n,()=>({queryFn:({signal:e})=>c(o.computerUseSettings.getLockedUseState(),e),queryKey:[`locked-computer-use`],refetchOnMount:`always`,refetchOnWindowFocus:!0,staleTime:l.FIVE_SECONDS}));}))();}
export { c, o, e, r, s, a, t, i, n, l, u, _, v, b, C, w, T };
