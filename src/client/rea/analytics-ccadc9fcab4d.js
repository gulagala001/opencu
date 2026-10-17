import * as Host from "../host-boundaries.mjs";
import { CB as r } from "./app-shared-2f2228189a8d.js";
import { oJs as d } from "./app-initial-c468e3fd7f91.js";
import { Zqs as h } from "./app-initial-c468e3fd7f91.js";
import { Qqs as p } from "./app-initial-c468e3fd7f91.js";
import { Xqs as c } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { sJs as f } from "./app-initial-c468e3fd7f91.js";
import { OB as n } from "./app-shared-2f2228189a8d.js";
import { Nf as i } from "./app-shared-2f2228189a8d.js";
import { QHs as s } from "./app-initial-c468e3fd7f91.js";
function y(e,t,n,i,a){r(e,d,{stepType:V[i],entryPoint:j(t),flowId:n,dismissalReason:a==null?void 0:M(a)})}
function b(e,t,n){r(e,d,{stepType:c.CODEX_BROWSER_PROFILE_IMPORT_LIFECYCLE_STEP_TYPE_DIALOG_OPENED,entryPoint:j(t),flowId:n})}
function j(e){switch(e){case`browser-settings-page`:return h.CODEX_BROWSER_PROFILE_IMPORT_ENTRY_POINT_BROWSER_SETTINGS_PAGE;case`connected-file-sign-in-notice`:return h.CODEX_BROWSER_PROFILE_IMPORT_ENTRY_POINT_CONNECTED_FILE_SIGN_IN_NOTICE;case`in-app-browser-import-banner`:return h.CODEX_BROWSER_PROFILE_IMPORT_ENTRY_POINT_IN_APP_BROWSER_IMPORT_BANNER;case`in-app-browser-import-modal`:return h.CODEX_BROWSER_PROFILE_IMPORT_ENTRY_POINT_IN_APP_BROWSER_IMPORT_MODAL;case`in-app-browser-overflow-menu`:return h.CODEX_BROWSER_PROFILE_IMPORT_ENTRY_POINT_IN_APP_BROWSER_OVERFLOW_MENU}}
function M(e){switch(e){case`backdrop`:return p.CODEX_BROWSER_PROFILE_IMPORT_DISMISSAL_REASON_BACKDROP;case`secondary-button`:return p.CODEX_BROWSER_PROFILE_IMPORT_DISMISSAL_REASON_SECONDARY_BUTTON;case`close-button`:return p.CODEX_BROWSER_PROFILE_IMPORT_DISMISSAL_REASON_CLOSE_BUTTON;case`escape-key`:return p.CODEX_BROWSER_PROFILE_IMPORT_DISMISSAL_REASON_ESCAPE_KEY;case`programmatic`:return p.CODEX_BROWSER_PROFILE_IMPORT_DISMISSAL_REASON_PROGRAMMATIC;case`done-button`:return p.CODEX_BROWSER_PROFILE_IMPORT_DISMISSAL_REASON_DONE_BUTTON}}
var V;
function H(){return(H=e(()=>{f();n();i();s();V={shown:c.CODEX_BROWSER_PROFILE_IMPORT_LIFECYCLE_STEP_TYPE_NUX_SHOWN,dismissed:c.CODEX_BROWSER_PROFILE_IMPORT_LIFECYCLE_STEP_TYPE_NUX_DISMISSED,"continue-clicked":c.CODEX_BROWSER_PROFILE_IMPORT_LIFECYCLE_STEP_TYPE_NUX_CONTINUE_CLICKED};}))();}
export { r, d, h, p, c, e, f, n, i, s, y, b, j, M, V, H };
