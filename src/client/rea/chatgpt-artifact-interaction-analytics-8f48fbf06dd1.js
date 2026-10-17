import * as Host from "../host-boundaries.mjs";
import { jT as _ } from "./app-initial-c468e3fd7f91.js";
import { roi as g } from "./app-initial-c468e3fd7f91.js";
import { MT as d } from "./app-initial-c468e3fd7f91.js";
import { toi as f } from "./app-initial-c468e3fd7f91.js";
import { qTi as t } from "./app-shared-2f2228189a8d.js";
import { VTi as i } from "./app-shared-2f2228189a8d.js";
import { KTi as n } from "./app-shared-2f2228189a8d.js";
import { CB as o } from "./app-shared-2f2228189a8d.js";
import { tsi as u } from "./app-initial-c468e3fd7f91.js";
import { noi as l } from "./app-initial-c468e3fd7f91.js";
import { dTn as c } from "./app-shared-2f2228189a8d.js";
import { ioi as p } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { xEi as r } from "./app-shared-2f2228189a8d.js";
import { aU as m } from "./app-initial-c468e3fd7f91.js";
import { OB as a } from "./app-shared-2f2228189a8d.js";
import { Gk as h } from "./app-initial-c468e3fd7f91.js";
import { MJ as s } from "./app-shared-2f2228189a8d.js";
function v(e,t){return{onPreviewOpened:()=>y(e,{...t,action:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_OPEN_PREVIEW}),onDownload:()=>y(e,{...t,action:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_DOWNLOAD}),onClose:()=>y(e,{...t,action:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_CLOSE_PREVIEW}),onInteractionAttempt:n=>{y(e,{...t,action:x[n]})}}}
function y(e,{action:r,importKind:a,source:s,isEditing:m,originatingTurn:h}){if(s==null||m)return;let{conversationId:v,target:y}=s;if(e.value.routeKind!==`chatgpt-thread`||e.value.conversationId!==v||s.sharedConversationId!=null||s.artifactInteractionExcluded===!0||e.get(_,v)!=null)return;let x;if(a===`pptx`)x=g.CHATGPT_WEB_ARTIFACT_KIND_PRESENTATION;else if(a===`xlsx`||a===`csv`||a===`tsv`)x=g.CHATGPT_WEB_ARTIFACT_KIND_SPREADSHEET;else return;let S=e.get(d,v),C=S===`tpp`||S===`flora`;if(!(C&&r===f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_OPEN_PREVIEW))try{let a=`fileId`in y?y.fileId:void 0,s=`libraryFileId`in y?y.libraryFileId:void 0,d=t(y.type===`mounted-library`?y.mountedLibraryFileId:void 0,s,a),f=d!=null&&(i(d)!=null||n(d))?d:void 0;o(e,u,{action:r,artifactKind:x,conversationId:v,fileId:b(a),libraryFileId:b(s),mountedLibraryFileId:f,messageId:h?.messageId??(y.type===`sandbox`?y.messageId:void 0),inputMessageId:h?.inputMessageId??void 0,turnExchangeId:h?.turnId,interactionMode:l.CHATGPT_WEB_ARTIFACT_INTERACTION_MODE_VIEW_ONLY,isTemporaryChat:c(e.value.search??``),productExperience:C?p.CHATGPT_WEB_ARTIFACT_INTERACTION_PRODUCT_EXPERIENCE_WORK:p.CHATGPT_WEB_ARTIFACT_INTERACTION_PRODUCT_EXPERIENCE_CHAT})}catch{}}
function b(e){return e?.replace(/^(?:file-library:)+/u,``).startsWith(`external-`)?void 0:e||void 0}
var x;
function S(){return(S=e(()=>{r();m();a();h();s();x={"autofit-column":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_AUTOFIT_COLUMN,"autofit-row":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_AUTOFIT_ROW,"click-formula-bar":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_CLICK_FORMULA_BAR,copy:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_COPY,cut:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_CUT,"delete-selection":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_DELETE_SELECTION,"double-click-content":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_DOUBLE_CLICK_CONTENT,"fit-to-viewport":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_FIT_TO_VIEWPORT,paste:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_PASTE,"paste-without-formatting":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_PASTE_WITHOUT_FORMATTING,redo:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_REDO,"resize-column":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_RESIZE_COLUMN,"resize-row":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_RESIZE_ROW,save:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_SAVE,search:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_SEARCH,"select-all":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_SELECT_ALL,undo:f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_UNDO,"zoom-in":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_ZOOM_IN,"zoom-out":f.CHATGPT_WEB_ARTIFACT_INTERACTION_ACTION_ZOOM_OUT};}))();}
export { _, g, d, f, t, i, n, o, u, l, c, p, e, r, m, a, h, s, v, y, b, x, S };
