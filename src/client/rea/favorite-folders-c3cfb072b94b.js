import * as Host from "../host-boundaries.mjs";
import { JX as t } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sA as n } from "./app-shared-2f2228189a8d.js";
import { YX as i } from "./app-shared-2f2228189a8d.js";
import { RX as o } from "./app-initial-c468e3fd7f91.js";
async function s(e,n,r){await t.safePatch(`/files/library/files/{library_file_id}/move`,{additionalHeaders:{"ChatGPT-Account-ID":e.value.accountId},parameters:{path:{library_file_id:n}},requestBody:{directory_id:r}}),await e.queryClient.invalidateQueries({queryKey:[`library-api`,e.value.accountId,e.value.userId]})}
function l(){return(l=e(()=>{n();i();o();}))();}
export { t, e, n, i, o, s, l };
