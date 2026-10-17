import * as Host from "../host-boundaries.mjs";
import { JX as t } from "./app-shared-2f2228189a8d.js";
import { mq as n } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { YX as i } from "./app-shared-2f2228189a8d.js";
import { hq as r } from "./app-shared-2f2228189a8d.js";
async function a(e,r,i){let a={parameters:{path:{library_file_id:e}},additionalHeaders:{"ChatGPT-Account-ID":r},expectedErrorStatuses:[403,404],signal:i};i.throwIfAborted();try{let e=await t.safeGet(`/files/library/files/{library_file_id}`,a);return i.throwIfAborted(),e}catch(e){if(!(e instanceof n)||e.status!==403&&e.status!==404)throw e}let o;i.throwIfAborted();try{if(o=await t.safeGet(`/files/library/files/{library_file_id}/node`,a),i.throwIfAborted(),o.access_kind===`owned`&&o.library_file_category===`image`&&o.library_artifact_type==null){let e=await t.safeGet(`/files/library/files/{library_file_id}/versions`,{...a,parameters:{...a.parameters,query:{limit:1}}});return i.throwIfAborted(),{...o,library_artifact_type:e.items[0]?.library_artifact_type??o.library_artifact_type}}return o}catch(r){if(!(r instanceof n)||r.status!==403&&r.status!==404)throw r;let s=null,c=new Set;do{i.throwIfAborted();let n=await t.safePost(`/files/library`,{requestBody:{cursor:s,limit:100,include_hidden_files:!0,include_saved_entities:!0},additionalHeaders:a.additionalHeaders,expectedErrorStatuses:[403,404],signal:i});i.throwIfAborted();let r=n.items.find(t=>t.id===e);if(r!=null)return r;if(s=n.cursor??null,s==null||c.has(s))break;c.add(s)}while(s!=null);if(o!=null)return o;throw r}}
function o(){return(o=e(()=>{i();r();}))();}
export { t, n, e, i, r, a, o };
