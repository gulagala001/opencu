import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { G as i } from "./app-shared-2f2228189a8d.js";
import { gX as o } from "./app-shared-2f2228189a8d.js";
import { H as r } from "./app-shared-2f2228189a8d.js";
import { V as n } from "./app-shared-2f2228189a8d.js";
import { z as t } from "./app-shared-2f2228189a8d.js";
import { pX as a } from "./app-shared-2f2228189a8d.js";
import { BHs as s } from "./app-initial-c468e3fd7f91.js";
import { VHs as c } from "./app-initial-c468e3fd7f91.js";
import { HHs as d } from "./app-initial-c468e3fd7f91.js";
import { UHs as u } from "./app-initial-c468e3fd7f91.js";
import { WHs as l } from "./app-initial-c468e3fd7f91.js";
function f(e,t){if(!URL.canParse(t))return!1;let n=new URL(t),{domains:r,urls:i}=w.parse(e);return r.some(e=>{let t=e.trim().toLowerCase();return n.hostname===t||n.hostname.endsWith(`.${t}`)})||i.some(e=>{let t=e.trim();return URL.canParse(t)&&n.href.startsWith(new URL(t).href)})}
function p(e){let{bannerDismissedAtMs:t,experimentAvailable:n,hasImported:r,hasSeenBanner:i,hasSeenModal:a,isPanelSettled:o,isVisible:s,modalDismissedAtMs:c,serviceAvailable:l}=e,u=t??c;return t!=null&&c!=null&&(u=Math.max(t,c)),{cooldownEndsAtMs:u==null?null:u+C,presentation:m(e),shouldDiscoverProfiles:s&&o&&l&&r===!1&&(i===!1||c!=null||n&&(a===!1||t!=null))}}
function m({bannerAlreadyVisible:e,bannerDismissedAtMs:t,experimentEnabled:n,hasImported:r,hasLoadedBrowserPage:i,hasSeenBanner:a,hasSeenModal:o,isModalExperimentAssignment:s,isVisible:c,modalDismissedAtMs:l,nowMs:u,profiles:d,profilesQuerySucceeded:f,serviceAvailable:p}){return r!==!1||a===void 0||o===void 0||t===void 0||l===void 0||!c||!p||!f||d==null||d.length===0||s&&!i&&!e?null:t!=null&&(l==null||t>l)?n&&!o&&v(t,u)?`modal`:null:l!=null&&(t==null||l>t)?v(l,u)?`banner`:null:n&&!o&&!e?`modal`:!a&&!o?`banner`:null}
function h(e){e.set(T,!0),e.set(D,Date.now())}
function g(e){e.set(E,!0),e.set(O,Date.now())}
function _(e){e.set(T,!0),e.set(E,!0)}
function v(e,t){return t-e>=C}
var y;
var b;
var C;
var w;
var T;
var E;
var D;
var O;
function k(){return(k=e(()=>{i();o();l();y=`1161538056`;b=`show_modal`;C=864e5;w=r({domains:n(t()).catch([]),urls:n(t()).catch([])}).catch({domains:[],urls:[]});T=a(s,!1);E=a(c,!1);D=a(d,null);O=a(u,null);}))();}
export { e, i, o, r, n, t, a, s, c, d, u, l, f, p, m, h, g, _, v, y, b, C, w, T, E, D, O, k };
