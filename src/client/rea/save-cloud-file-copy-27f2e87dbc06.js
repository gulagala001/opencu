import * as Host from "../host-boundaries.mjs";
import { e6 as s } from "./app-shared-2f2228189a8d.js";
import { Dz as p } from "./app-shared-2f2228189a8d.js";
import { QL as h } from "./app-shared-2f2228189a8d.js";
import { PM as n } from "./app-shared-2f2228189a8d.js";
import { zHn as c } from "./app-shared-2f2228189a8d.js";
import { Az as o } from "./app-shared-2f2228189a8d.js";
import { iA as _ } from "./app-initial-c468e3fd7f91.js";
import { Y as d } from "./app-shared-2f2228189a8d.js";
import { HN as r } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { u as t } from "./rolldown-runtime-2d059c5e81f4.js";
import { bP as i } from "./app-shared-2f2228189a8d.js";
import { CF as m } from "./app-shared-2f2228189a8d.js";
import { tR as a } from "./app-shared-2f2228189a8d.js";
import { t6 as u } from "./app-shared-2f2228189a8d.js";
import { aA as g } from "./app-initial-c468e3fd7f91.js";
import { Nz as l } from "./app-shared-2f2228189a8d.js";
function v(e,t){let n=t.environmentId,i=t.cwd;if(n==null){let a=e.get(_,t.conversationId==null?null:{kind:`app-server`,conversationId:d(t.conversationId)});if(a?.hostId!==`durable`)throw Error(`Cloud environment unavailable`);n=a.environmentId,i=a.cwd==null?null:r(a.cwd)}let a=t.path;if(!b.default.posix.isAbsolute(a)){if(i==null||!b.default.posix.isAbsolute(i))throw Error(`Cloud working directory unavailable`);a=b.default.posix.resolve(i,a)}return{environmentId:n,cwd:i,path:a}}
async function y(e,{environmentId:t,path:r}){if(t==null||s.workspaceFiles.saveCopy==null)throw Error(`Cloud file download is unavailable`);let i={environmentId:t,path:r},{dataBase64:a}=await p(h(e,n).sendRequest(`fs/readFile`,i)),l=c(a);if(l.byteLength>268435456)throw Error(`File is too large to download`);return p(s.workspaceFiles.saveCopy({bytes:l,fileName:o(r)}))}
var b;
function x(){return(x=e(()=>{b=t(i(),1);m();a();u();g();l();}))();}
export { s, p, h, n, c, o, _, d, r, e, t, i, m, a, u, g, l, v, y, b, x };
