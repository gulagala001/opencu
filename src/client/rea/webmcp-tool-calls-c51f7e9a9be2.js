import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { G as o } from "./app-shared-2f2228189a8d.js";
import { H as a } from "./app-shared-2f2228189a8d.js";
import { W as s } from "./app-shared-2f2228189a8d.js";
import { V as i } from "./app-shared-2f2228189a8d.js";
import { Ou as n } from "./app-shared-2f2228189a8d.js";
import { z as t } from "./app-shared-2f2228189a8d.js";
import { B as r } from "./app-shared-2f2228189a8d.js";
function c(e){let t=u.safeParse(e);return t.success?t.data[`codex/toolSurface`].webMcpCalls:[]}
var l;
var u;
function d(){return(d=e(()=>{o();l=n(`kind`,[a({kind:s(`listTools`),name:s(`webmcp_list_tools`),title:t().transform(e=>e||void 0).optional(),description:t().optional(),readOnlyHint:r().optional(),sourceHostname:t().min(1).optional(),outputJson:t().optional(),outputTruncated:s(!0).optional()}),a({kind:s(`invokeTool`),name:t().refine(e=>e.trim().length>0),title:t().transform(e=>e||void 0).optional(),description:t().optional(),readOnlyHint:r().optional(),sourceHostname:t().min(1).optional(),inputJson:t().optional(),inputTruncated:s(!0).optional(),outputJson:t().optional(),outputTruncated:s(!0).optional()})]);u=a({"codex/toolSurface":a({kind:s(`browserUse`),webMcpCalls:i(l)})});}))();}
export { e, o, a, s, i, n, t, r, c, l, u, d };
