import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sA as l } from "./app-shared-2f2228189a8d.js";
import { YX as g } from "./app-shared-2f2228189a8d.js";
import { Gk as O } from "./app-initial-c468e3fd7f91.js";
import { Ngl as j } from "./app-initial-c468e3fd7f91.js";
import { II as S } from "./app-shared-2f2228189a8d.js";
import { U0c as T } from "./app-initial-c468e3fd7f91.js";
import { RI as h } from "./app-shared-2f2228189a8d.js";
import { g1 as p } from "./app-shared-2f2228189a8d.js";
import { YE as D } from "./app-initial-c468e3fd7f91.js";
import { _q as s } from "./app-shared-2f2228189a8d.js";
import { Gk as b } from "./app-shared-2f2228189a8d.js";
import { h1 as u } from "./app-shared-2f2228189a8d.js";
import { Mgl as A } from "./app-initial-c468e3fd7f91.js";
import { Bk as y } from "./app-shared-2f2228189a8d.js";
import { qE as M } from "./app-initial-c468e3fd7f91.js";
import { Ptn as E } from "./app-initial-c468e3fd7f91.js";
import { V0c as k } from "./app-initial-c468e3fd7f91.js";
import { Lf as v } from "./app-shared-2f2228189a8d.js";
import { pZn as a } from "./app-shared-2f2228189a8d.js";
import { TT as w } from "./app-initial-c468e3fd7f91.js";
import { JX as t } from "./app-shared-2f2228189a8d.js";
import { mq as n } from "./app-shared-2f2228189a8d.js";
import { FI as d } from "./app-shared-2f2228189a8d.js";
import { LI as m } from "./app-shared-2f2228189a8d.js";
import { a5 as f } from "./app-shared-2f2228189a8d.js";
import { Uk as _ } from "./app-shared-2f2228189a8d.js";
var __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./decoder-f966011fa07a.js","./decoder-c080d3c57107.js","./rolldown-runtime-2d059c5e81f4.js"])))=>i.map(i=>d[i]);
function R(){return(R=e(()=>{f();}))();}
function z(e,t,n=e.value.routeKind===`chatgpt-thread`?e.value.conversationId:null){return t?.isAnimated===!0&&n!=null?e.get(A,n)?.find(e=>e.id===t.id)??t:t}
function B(e,t){return e.isAnimated!==!0||t==null||t.originalSrc!==(e.gifPlayback?.originalSrc??e.src)?e:{...e,src:t.src,sizeBytes:t.sizeBytes,gifPlayback:{...e.gifPlayback,originalSrc:t.originalSrc,speed:t.speed}}}
var V;
var H;
var U;
function W(){return(W=e(()=>{l();g();O();j();S();T();h();p();D();s();V=_(u,e=>null);H=y(u,({image:e,imageAssetResolver:r},{signal:i,scope:o})=>{let s=e?.gifPlayback?.originalSrc??e?.src,c=JSON.stringify([e?.id,s]),l,u=0,f=Promise.resolve(),p=i({preview:null,busy:!1},{onMount:t=>{if(e?.isAnimated)return o.watch(n=>{if(u!==0)return;let r=n.get(V,c),i=r??z(n,e)?.gifPlayback?.speed??1;(r!=null||i!==1)&&(t({preview:null,busy:!0}),y(i,!1));});}}),h=async e=>{let t=e!=null&&M(e)&&r!=null?await E(o.queryClient,e,r):e,n=t==null?null:await k(t);if(n==null)throw Error(`GIF download unavailable`);return n.blob;},g=()=>(l??=h(s).catch(e=>{throw l=void 0,e;}),l),_=async(t,n=s)=>{let r=p.get().preview;if(r?.speed===t&&r.originalSrc===n)return r;let i=(n===e?.watermarkedSrc?e?.gifPlayback?.watermarkedVariants:e?.gifPlayback?.variants)?.[String(t)],o=i==null?null:await h(i).catch(()=>null),c=o??(n===s?await g():await h(n)),l=o!=null||t===1?c:await(await v(async()=>{let{withGifPlaybackSpeed:e}=await import(`./decoder-f966011fa07a.js`);return{withGifPlaybackSpeed:e};},__vite__mapDeps([0,1,2]),import.meta.url)).withGifPlaybackSpeed(c,t);return{assetSrc:o==null?void 0:i,originalSrc:n??``,speed:t,src:await a(l),sizeBytes:l.size};},y=async(r,i)=>{let a=++u;p.set(e=>({...e,busy:!0}));try{let l=await _(r);return a===u&&(p.set({preview:l,busy:!1}),i&&(o.set(V,c,r),f=f.then(async()=>{if(a!==u||o.value.routeKind!==`chatgpt-thread`||e?.chatGptMessageId==null||s==null)return;let n=o.get(w,o.value.conversationId);n!=null&&(await t.safePost(`/image-gen/gif/select_speed`,{requestBody:{conversation_id:n,message_id:e.chatGptMessageId,asset_pointer:s,selected_speed:r},expectedErrorStatuses:[404,405]}));}).catch(e=>{e instanceof n&&(e.status===404||e.status===405)||o.get(d).danger(o.get(m).formatMessage({id:`gifEditor.saveSpeedFailed`,defaultMessage:`Couldn’t save GIF speed. Try again`,description:`Error toast when the selected GIF playback speed could not be saved to the conversation`}),{errorAnalytics:{toastId:`gifEditor.saveSpeedFailed`}});})),!0);}catch{return i&&a===u&&o.get(d).danger(o.get(m).formatMessage({id:`gifEditor.speedChangeFailed`,defaultMessage:`Couldn’t change GIF speed. Try again`,description:`Error shown when a generated GIF could not be loaded or retimed after choosing a playback speed`}),{errorAnalytics:{toastId:`gifEditor.speedChangeFailed`}}),!1;}finally{a===u&&p.set(e=>({...e,busy:!1}));}};return{state$:p,loadOriginal:g,loadExport:async e=>h((await _(e)).src),changeSpeed:e=>y(e,!0),imageForExport:async(e,t=s,{forSharing:n=!1}={})=>{if(!e.isAnimated||t==null)return e;let r=p.get().preview?.speed??o.get(V,c)??e.gifPlayback?.speed??1,i={...e,src:t,gifPlayback:{...e.gifPlayback,originalSrc:t,speed:r}};if(r===1)return i;let a=await _(r,t);return B(i,n&&a.assetSrc!=null?{...a,src:a.assetSrc}:a);}};},{autoDispose:6e4,key:({image:e})=>JSON.stringify([e?.id,e?.gifPlayback?.originalSrc??e?.src])});U=b(u,({image:e,conversationId:t,imageAssetResolver:n},{scope:r})=>{let i=z(r,e,t),a=r.get(H,{image:i?.isAnimated===!0?i:void 0,imageAssetResolver:n}),{preview:o}=r.get(a.state$);return{playback:a,previewSrc:o?.src,image:i==null?void 0:B(i,o),originalSrc:i?.isAnimated===!0?i.gifPlayback?.originalSrc??i.src:i?.src,canControl:e?.isAnimated===!0&&e.gifPlayback!=null&&r.value.routeKind===`chatgpt-thread`};});}))();}
export { e, l, g, O, j, S, T, h, p, D, s, b, u, A, y, M, E, k, v, a, w, t, n, d, m, f, _, __vite__mapDeps, R, z, B, V, H, U, W };
