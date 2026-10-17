import * as Host from "../host-boundaries.mjs";
import { dKr as f } from "./app-shared-2f2228189a8d.js";
import { HK as l } from "./app-shared-2f2228189a8d.js";
import { Ugn as r } from "./app-shared-2f2228189a8d.js";
import { oA as i } from "./app-shared-2f2228189a8d.js";
import { X as a } from "./app-shared-2f2228189a8d.js";
import { FI as u } from "./app-shared-2f2228189a8d.js";
import { Xe as _ } from "./browser-clear-browsing-data-dialog-view-a2ab4c91f88e.js";
import { xNt as p } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as s } from "./app-shared-2f2228189a8d.js";
import { C2 as t } from "./app-shared-2f2228189a8d.js";
import { GK as o } from "./app-shared-2f2228189a8d.js";
import { DF as h } from "./app-shared-2f2228189a8d.js";
import { sA as c } from "./app-shared-2f2228189a8d.js";
import { II as m } from "./app-shared-2f2228189a8d.js";
import { gI as d } from "./app-shared-2f2228189a8d.js";
import { ct as g } from "./browser-clear-browsing-data-dialog-view-a2ab4c91f88e.js";
import { K as n } from "./app-shared-2f2228189a8d.js";
function v(e){let t=(0,y.c)(13),{browsingDataSettings:n,browsingHistory:r,onClose:o}=e,s=i(a),c;t[0]===s.queryClient?c=t[1]:(c=async e=>{await Promise.all([s.queryClient.invalidateQueries({queryKey:[`browser-browsing-history`]}),...e.includes(`downloads`)?[s.queryClient.invalidateQueries({queryKey:[`browser-download-history`]})]:[]])},t[0]=s.queryClient,t[1]=c);let l=c,d;t[2]===s?d=t[3]:(d=e=>s.get(u).danger(e,{errorAnalytics:{toastId:`browserClearBrowsingDataDialog.clearBrowsingData`}}),t[2]=s,t[3]=d);let f;t[4]!==n||t[5]!==r||t[6]!==l||t[7]!==o||t[8]!==d?(f=(0,b.jsx)(_,{browsingDataSettings:n,browsingHistory:r,onCleared:l,onClose:o,onError:d}),t[4]=n,t[5]=r,t[6]=l,t[7]=o,t[8]=d,t[9]=f):f=t[9];let m;return t[10]!==s.queryClient||t[11]!==f?(m=(0,b.jsx)(p,{client:s.queryClient,children:f}),t[10]=s.queryClient,t[11]=f,t[12]=m):m=t[12],m}
var y;
var b;
function x(){return(x=e(()=>{y=s();h();c();m();d();g();b=n();}))();}
function S(){return Host.useBrowserSettingsCapabilities();}
var C;
function w(){return(w=e(()=>{C=s();t();o();}))();}
export { f, l, r, i, a, u, _, p, e, s, t, o, h, c, m, d, g, n, v, y, b, x, S, C, w };
