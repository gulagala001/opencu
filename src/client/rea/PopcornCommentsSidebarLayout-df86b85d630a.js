import * as Host from "../host-boundaries.mjs";
import { q as n } from "./app-shared-2f2228189a8d.js";
import { Q as i } from "./PopcornIcons-6bf9c538cb49.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { $ as a } from "./PopcornIcons-6bf9c538cb49.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
function o({adjacentToSelected:e}){return(0,c.jsx)(`div`,{"aria-hidden":!0,className:n(`mx-2 my-3 h-px shrink-0 bg-border-subtle`,e&&`invisible`)})}
function s({children:e,labels:t,embedded:r=!1,controls:a,closeButton:o,header:s,onClose:l,testId:u}){return(0,c.jsxs)(`aside`,{"aria-label":t.sidebar,className:n(`flex h-full min-h-0 max-w-full shrink-0 flex-col overflow-hidden text-default`,r?`w-full`:`w-74 rounded-2xl bg-surface shadow-card ring-1 ring-border ring-inset`),"data-testid":u,children:[s??(0,c.jsxs)(`header`,{className:`flex h-11 shrink-0 items-center justify-between gap-2 py-1 ps-4 pe-2`,children:[(0,c.jsx)(`h2`,{className:`text-base leading-5 font-medium text-secondary select-none`,children:t.heading}),(0,c.jsxs)(`div`,{className:`flex items-center gap-2`,children:[a,o??(0,c.jsx)(`button`,{type:`button`,"aria-label":t.close,className:`flex size-7 cursor-interaction items-center justify-center rounded-lg text-secondary hover:bg-primary-ghost-hover focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring`,onClick:l,children:(0,c.jsx)(i,{})})]})]}),e]})}
var c;
function l(){return(l=e(()=>{a();c=t();}))();}
export { n, i, e, a, t, o, s, c, l };
