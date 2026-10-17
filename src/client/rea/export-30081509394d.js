import * as Host from "../host-boundaries.mjs";
import { V0c as r } from "./app-initial-c468e3fd7f91.js";
import { bo as a } from "./sketch-4107a9848ded.js";
import { We as i } from "./sketch-4107a9848ded.js";
import { le as o } from "./sketch-4107a9848ded.js";
import { pZn as t } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { ts as s } from "./sketch-4107a9848ded.js";
import { U0c as n } from "./app-initial-c468e3fd7f91.js";
function c({width:e,height:t}){let n=1024/Math.max(e,t);return{width:e*n,height:t*n}}
async function l(e,t,n,r){let{width:s,height:l}=t;if(!Number.isSafeInteger(s)||!Number.isSafeInteger(l)||s<=0||l<=0||s*l>2e7)return null;let d=Math.max(s,l)/1024,f=await a(e,{outputBounds:{x:0,y:0,width:(s-1e-6)/d,height:(l-1e-6)/d},scale:d,maxDimension:Math.max(s,l),maxPixelCount:s*l,padding:0,mimeType:`image/png`,drawBackground:r});if(f.kind!==`success`||f.width!==s||f.height!==l||r==null&&f.blob.size>20971520)return null;let p=c(t),m=i(e).map((e,t)=>{let n=o(e);return`${t+1}. (x: ${u(n.x/p.width)}, y: ${u(n.y/p.height)}) ${e.text}`}),h=n.trim().length>0?[n.trim()]:[];return{overlay:f.blob,promptText:[m.join(`
`),...h].filter(e=>e.length>0).join(`

`)}}
function u(e){return`${(Math.min(Math.max(e,0),1)*100).toFixed(1)}%`}
async function d(e,n,i,a){let o=await r(e,{image:a,signal:i});if(i.throwIfAborted(),o==null)return null;let s=await createImageBitmap(o.blob);try{i.throwIfAborted();let e=await l(n,s,``,(e,t)=>{e.drawImage(s,0,0,t.width,t.height)});if(i.throwIfAborted(),e==null)return null;let r=await t(e.overlay);return i.throwIfAborted(),{src:r,prompt:e.promptText}}finally{s.close()}}
function f(){return(f=e(()=>{s();n();}))();}
export { r, a, i, o, t, e, s, n, c, l, u, d, f };
