import * as Host from "../host-boundaries.mjs";
import { iA as o } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sA as i } from "./app-shared-2f2228189a8d.js";
import { gI as s } from "./app-shared-2f2228189a8d.js";
import { pq as t } from "./app-shared-2f2228189a8d.js";
import { EJ as r } from "./app-shared-2f2228189a8d.js";
import { wJ as a } from "./app-shared-2f2228189a8d.js";
import { X as n } from "./app-shared-2f2228189a8d.js";
import { fq as c } from "./app-shared-2f2228189a8d.js";
function l(e){let{data:t}=o(u,e?.kind===`appId`?e.appId:null),{data:n}=o(d,e?.kind===`displayName`?e.displayName:null);return t??n??null}
var u;
var d;
function f(){return(f=e(()=>{i();s();t();r();u=a(n,`native-desktop-app-by-bundle-id`,e=>({enabled:e!=null,params:e==null?void 0:{bundleId:e},refetchOnWindowFocus:!1,select:e=>e.app,staleTime:c.FIVE_MINUTES}));d=a(n,`native-desktop-apps`,e=>({cacheKey:[`computer-use-tool-row-display-name`,e],enabled:e!=null,params:{order:`usage`},refetchOnWindowFocus:!1,select:t=>t.apps.find(t=>t.displayName.toLowerCase()===e?.toLowerCase())??null,staleTime:c.FIVE_MINUTES}));}))();}
export { o, e, i, s, t, r, a, n, c, l, u, d, f };
