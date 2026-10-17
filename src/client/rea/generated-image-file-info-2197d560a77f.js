import * as Host from "../host-boundaries.mjs";
import { qE as c } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sA as r } from "./app-shared-2f2228189a8d.js";
import { gI as i } from "./app-shared-2f2228189a8d.js";
import { YE as s } from "./app-initial-c468e3fd7f91.js";
import { YX as o } from "./app-shared-2f2228189a8d.js";
import { Jk as a } from "./app-shared-2f2228189a8d.js";
import { X as n } from "./app-shared-2f2228189a8d.js";
import { JX as t } from "./app-shared-2f2228189a8d.js";
function l(e){return e.status!==`completed`||e.isPreview||e.src==null||!c(e.src)?null:e.src.slice(e.src.indexOf(`://`)+3)}
function u(e,t,n){if(e==null)return;let r=l(e);if(r!=null)return{conversationId:t,identity:{type:`file`,fileId:r},mimeType:e.chatGptImageMetadata?.mimeType,name:n}}
var d;
function f(){return(f=e(()=>{r();i();s();o();d=a(n,({accountId:e,conversationId:n,fileId:r,userId:i})=>({queryKey:[`library-api`,e,i,`generated-image-info`,r,n],staleTime:3e4,queryFn:({signal:i})=>t.safeGet(`/files/{file_id}/simple`,{additionalHeaders:{"ChatGPT-Account-ID":e},parameters:{path:{file_id:r},query:{conversation_id:n}},signal:i}),refetchInterval:e=>e.state.status===`success`&&e.state.data?.library_file_id==null&&e.state.dataUpdateCount<6&&Math.min(2e3*2**(e.state.dataUpdateCount-1),8e3)}));}))();}
export { c, e, r, i, s, o, a, n, t, l, u, d, f };
