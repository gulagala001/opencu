import * as Host from "../host-boundaries.mjs";
import { Wcl as r } from "./app-initial-c468e3fd7f91.js";
import { mJr as t } from "./app-shared-2f2228189a8d.js";
import { C7 as i } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { vJr as n } from "./app-shared-2f2228189a8d.js";
import { w7 as a } from "./app-initial-c468e3fd7f91.js";
import { qcl as o } from "./app-initial-c468e3fd7f91.js";
function s(){return typeof ClipboardItem<`u`&&typeof navigator.clipboard?.write==`function`}
function c({conversationId:e,environmentId:n,filename:a,hostId:o,imageAssetResolver:s,onCopySucceeded:c,onFailure:l,queryClient:u,src:d}){let f=r({conversationId:e,environmentId:n,absoluteImageFilePath:t(d),hostId:o,imageAssetResolver:s,queryClient:u,src:d}).then(async e=>{if(e==null)throw Error(`Could not read image for clipboard copy`);let{file:t}=i(e,a);if(t.type===`image/png`)return t;let n=await createImageBitmap(t),r=document.createElement(`canvas`);r.width=n.width,r.height=n.height;let o=r.getContext(`2d`);if(o==null)throw n.close(),Error(`Could not create image clipboard canvas`);o.drawImage(n,0,0),n.close();let s=await new Promise(e=>{r.toBlob(e,`image/png`)});if(s==null)throw Error(`Could not encode image for clipboard copy`);return s});f.catch(()=>void 0);try{navigator.clipboard.write([new ClipboardItem({"image/png":f})]).then(c,l)}catch{l()}}
function l(){return(l=e(()=>{n();a();o();}))();}
export { r, t, i, e, n, a, o, s, c, l };
