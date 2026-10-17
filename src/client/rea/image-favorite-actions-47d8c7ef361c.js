import * as Host from "../host-boundaries.mjs";
import { iJ as m } from "./app-shared-2f2228189a8d.js";
import { aJ as T } from "./app-shared-2f2228189a8d.js";
import { LI as d } from "./app-shared-2f2228189a8d.js";
import { ESc as O } from "./app-initial-c468e3fd7f91.js";
import { eoi as k } from "./app-initial-c468e3fd7f91.js";
import { TSc as N } from "./app-initial-c468e3fd7f91.js";
import { CB as h } from "./app-shared-2f2228189a8d.js";
import { jSc as P } from "./app-initial-c468e3fd7f91.js";
import { wSc as A } from "./app-initial-c468e3fd7f91.js";
import { Xoi as F } from "./app-initial-c468e3fd7f91.js";
import { bZr as R } from "./app-initial-c468e3fd7f91.js";
import { s as B } from "./favorite-folders-c3cfb072b94b.js";
import { FI as o } from "./app-shared-2f2228189a8d.js";
import { vxc as j } from "./app-initial-c468e3fd7f91.js";
import { gxc as M } from "./app-initial-c468e3fd7f91.js";
import { s5 as v } from "./app-shared-2f2228189a8d.js";
import { YGi as s } from "./app-shared-2f2228189a8d.js";
import { ZGi as n } from "./app-shared-2f2228189a8d.js";
import { B3n as p } from "./app-shared-2f2228189a8d.js";
import { H3n as _ } from "./app-shared-2f2228189a8d.js";
import { hS as x } from "./app-shared-2f2228189a8d.js";
import { y7 as y } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as i } from "./app-shared-2f2228189a8d.js";
import { XGi as r } from "./app-shared-2f2228189a8d.js";
import { QGi as C } from "./app-shared-2f2228189a8d.js";
import { V3n as c } from "./app-shared-2f2228189a8d.js";
import { U3n as b } from "./app-shared-2f2228189a8d.js";
import { xS as g } from "./app-shared-2f2228189a8d.js";
import { b7 as a } from "./app-shared-2f2228189a8d.js";
import { u5 as l } from "./app-shared-2f2228189a8d.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { FSc as E } from "./app-initial-c468e3fd7f91.js";
import { aU as I } from "./app-initial-c468e3fd7f91.js";
import { lJ as S } from "./app-shared-2f2228189a8d.js";
import { II as w } from "./app-shared-2f2228189a8d.js";
import { RI as f } from "./app-shared-2f2228189a8d.js";
import { l as z } from "./favorite-folders-c3cfb072b94b.js";
import { wxc as D } from "./app-initial-c468e3fd7f91.js";
import { CZr as L } from "./app-initial-c468e3fd7f91.js";
import { OB as u } from "./app-shared-2f2228189a8d.js";
function V(e){let t=(0,H.c)(9),{isFavorited:r,disabled:i,onSelect:a}=e,o;t[0]===r?o=t[1]:(o=(0,U.jsx)(v,{icon:{assets:r?{16:s,20:n}:{16:p,20:_}}}),t[0]=r,t[1]=o);let c;t[2]===r?c=t[3]:(c=r?(0,U.jsx)(x,{id:`library.favorites.remove`,defaultMessage:`Remove from Favorites`,description:`Action in a Library item menu or preview to remove the item from Favorites`}):(0,U.jsx)(x,{id:`library.favorites.add`,defaultMessage:`Add to Favorites`,description:`Action to save a Library file as a favorite`}),t[2]=r,t[3]=c);let l;return t[4]!==i||t[5]!==a||t[6]!==o||t[7]!==c?(l=(0,U.jsx)(y.Item,{disabled:i,leftIcon:o,onSelect:a,children:c}),t[4]=i,t[5]=a,t[6]=o,t[7]=c,t[8]=l):l=t[8],l}
var H;
var U;
function W(){return(W=e(()=>{H=i();r();C();c();b();g();a();l();U=t();}))();}
async function G(e,{image:t,conversationId:n,libraryFileId:r,status:i,folder:a,created:o,onView:s,surface:c=`image_tile`}){return K(e,{conversationId:n,messageId:t.chatGptMessageId,libraryFileId:r,status:i,surface:c,folder:a,created:o,onView:s,updateFavorite:async(t,n,a)=>await M(e,{libraryFileId:r,favoriteId:i.favoriteId,isFavorited:t,surface:c,entityKind:`image`,source:`conversation`,showToast:n,onView:a})?r:null})}
async function K(e,{conversationId:t,messageId:n,libraryFileId:r,status:i,surface:a,folder:s,created:c,onView:l,updateFavorite:u}){let f=()=>e.get(m)===e.value.accountId&&e.get(T)===e.value.userId;if(!f()||i.isUnavailable)return;let p=e.get(d),h=r=>{f()&&(q(e,t,n,`toast_action`,a),l?.(R(r,`banner`)))},g=r,_=s!=null||!i.isFavorited,v=s==null||!i.isFavorited,y=_?`save`:`unsave`,b=performance.now();if(v){q(e,t,n,y,a),g=await u(_,s==null,l==null?void 0:()=>h(`/library?tab=favorites`));let r=g!=null;if(!f())return;let i;if(i=r?_?k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_SAVE_SUCCESS:k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_UNSAVE_SUCCESS:_?k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_SAVE_ERROR:k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_UNSAVE_ERROR,J(e,{eventType:i,action:y,result:r?`success`:`error`,surface:a,mutationDurationMs:r?performance.now()-b:void 0}),!r)return}if(f()){if(s!=null){try{if(g==null)throw Error(`Image Library file ID is missing.`);await B(e,g,s.id)}catch{f()&&e.get(o).danger(p.formatMessage({id:`library.favoriteFolder.moveFailed`,defaultMessage:`Could not add to folder`,description:`Error toast when the saved image could not be moved into the selected Library folder. The image remains in Favorites`}),{errorAnalytics:{toastId:`library.favoriteFolder.moveFailed`}});return}if(!f())return;j(e),e.get(o).success(c?p.formatMessage({id:`library.favoriteFolder.created`,defaultMessage:`{folderName} successfully created`,description:`Success toast after creating a Library folder and moving the saved image into it. folderName is the user's folder name`},{folderName:s.name}):p.formatMessage({id:`library.favoriteFolder.added`,defaultMessage:`Added to {folderName}`,description:`Success toast after moving the saved image into a Library folder. folderName is the user's folder name`},{folderName:s.name}),{primaryAction:{label:p.formatMessage({id:`library.favoriteFolder.view`,defaultMessage:`View`,description:`Toast action that opens the Library folder which now contains the saved image`}),onClick:()=>h(`/library/d/${encodeURIComponent(s.id)}`)}})}v&&_&&J(e,{eventType:k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_SUCCESS_TOAST_RENDERED,surface:`save_toast`,action:y,clickToSuccessToastMs:performance.now()-b})}}
function q(e,t,n,r,i){let a=n===`client-created-root`?void 0:n??void 0,o,s;r===`save`?(o=O.CHATGPT_ENTITY_AFFORDANCE_SAVE_BUTTON,s=k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_SAVE_CLICKED):r===`unsave`?(o=O.CHATGPT_ENTITY_AFFORDANCE_UNSAVE_BUTTON,s=k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_UNSAVE_CLICKED):(o=O.CHATGPT_ENTITY_AFFORDANCE_SAVED_ENTITY_TOAST_ACTION,s=k.CHATGPT_WEB_SAVED_ENTITIES_INTERACTION_EVENT_TYPE_TOAST_ACTION_CLICKED);let c=N.CHATGPT_ENGAGEMENT_SURFACE_LOCATION_RESPONSE;r===`toast_action`?c=N.CHATGPT_ENGAGEMENT_SURFACE_LOCATION_SAVE_TOAST:i===`image_lightbox`&&(c=N.CHATGPT_ENGAGEMENT_SURFACE_LOCATION_FULLSCREEN_IMAGE_GALLERY),h(e,P,{actionType:A.CHATGPT_ENGAGEMENT_ACTION_TYPE_CLICKED,surfaceLocation:c,entityAffordance:o,entityCategory:`image`,conversationId:t,messageId:a,assistantMessageId:a,contentReferenceType:`entity`}),J(e,{eventType:s,action:r===`toast_action`?void 0:r,surface:r===`toast_action`?`save_toast`:i})}
function J(e,t){h(e,F,{...t,entityKind:`image`})}
function Y(){return(Y=e(()=>{E();I();S();w();f();z();D();L();u();}))();}
export { m, T, d, O, k, N, h, P, A, F, R, B, o, j, M, v, s, n, p, _, x, y, e, i, r, C, c, b, g, a, l, t, E, I, S, w, f, z, D, L, u, V, H, U, W, G, K, q, J, Y };
