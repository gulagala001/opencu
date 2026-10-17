import * as Host from "../host-boundaries.mjs";
import { hS as i } from "./app-shared-2f2228189a8d.js";
import { q as o } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as n } from "./app-shared-2f2228189a8d.js";
import { xS as r } from "./app-shared-2f2228189a8d.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
import { bS as a } from "./app-shared-2f2228189a8d.js";
function c(e){let t=(0,l.c)(10),{status:n}=e;if(n.isLoading){let e;return t[0]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,u.jsx)(i,{...d.loading}),t[0]=e):e=t[0],e}let r=n.isInstalled?`bg-[var(--app-color-icon-success)]`:`bg-[var(--app-color-icon-error)]`,a;t[1]===r?a=t[2]:(a=o(`h-2 w-2 shrink-0 rounded-full`,r),t[1]=r,t[2]=a);let s;t[3]===a?s=t[4]:(s=(0,u.jsx)(`span`,{className:a}),t[3]=a,t[4]=s);let c;t[5]===n.isInstalled?c=t[6]:(c=(0,u.jsx)(`span`,{className:`min-w-0 truncate`,children:n.isInstalled?(0,u.jsx)(i,{...d.installed}):(0,u.jsx)(i,{...d.notInstalled})}),t[5]=n.isInstalled,t[6]=c);let f;return t[7]!==s||t[8]!==c?(f=(0,u.jsxs)(`span`,{className:`inline-flex max-w-full items-center gap-2`,children:[s,c]}),t[7]=s,t[8]=c,t[9]=f):f=t[9],f}
var l;
var u;
var d;
function f(){return(f=e(()=>{l=n();r();u=t();d=a({installed:{id:`plugins.browserExtension.installed`,defaultMessage:`Browser extension installed`,description:`Status text shown when a browser extension is installed`},notInstalled:{id:`plugins.browserExtension.notInstalled`,defaultMessage:`Browser extension not installed`,description:`Status text shown when a browser extension is not installed`},loading:{id:`plugins.browserExtension.loading`,defaultMessage:`Use the browser extension for additional control`,description:`Status text shown while a browser extension install state is loading`}});}))();}
export { i, o, e, n, r, t, a, c, l, u, d, f };
