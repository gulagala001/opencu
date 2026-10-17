import * as Host from "../host-boundaries.mjs";
import { lS as l } from "./app-shared-2f2228189a8d.js";
import { q as f } from "./app-shared-2f2228189a8d.js";
import { r5 as r } from "./app-shared-2f2228189a8d.js";
import { Wbi as p } from "./app-shared-2f2228189a8d.js";
import { t5 as u } from "./app-shared-2f2228189a8d.js";
import { VPi as i } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as a } from "./app-shared-2f2228189a8d.js";
import { HPi as c } from "./app-shared-2f2228189a8d.js";
import { o as o } from "./app-shared-2f2228189a8d.js";
import { xS as d } from "./app-shared-2f2228189a8d.js";
import { n5 as n } from "./app-shared-2f2228189a8d.js";
import { a5 as s } from "./app-shared-2f2228189a8d.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
function h(e){let t=(0,g.c)(17),{ancestors:n,current:a,textSm:o}=e,s=l(),c;t[0]===s?c=t[1]:(c=s.formatMessage({id:`toolbarBreadcrumb.label`,defaultMessage:`Breadcrumb`,description:`Accessible label for toolbar breadcrumb navigation`}),t[0]=s,t[1]=c);let d=o?`text-sm`:`text-base`,m;t[2]===d?m=t[3]:(m=f(`flex min-w-0 items-center gap-1 text-codex-description`,d),t[2]=d,t[3]=m);let h;if(t[4]!==n||t[5]!==o){let e;t[7]===o?e=t[8]:(e=(e,t)=>{let{id:n,...a}=e,s=`content`in a?a.content:(0,v.jsx)(`span`,{className:`min-w-0 truncate`,children:a.label}),c=s;if(!(`content`in a)){let{label:e,...t}=a,n={className:f(`min-w-0`,o&&`text-sm`),color:`ghost`,size:`toolbar`};c=t.to==null?(0,v.jsx)(r,{...n,onClick:t.onClick,children:s}):(0,v.jsx)(p,{...t,...n,children:s})}return(0,v.jsxs)(_.Fragment,{children:[t>0?(0,v.jsx)(u,{className:`shrink-0`,asset:i}):null,c]},n)},t[7]=o,t[8]=e),h=n.map(e),t[4]=n,t[5]=o,t[6]=h}else h=t[6];let y;t[9]!==n.length||t[10]!==a?(y=a==null?null:(0,v.jsxs)(v.Fragment,{children:[n.length>0?(0,v.jsx)(u,{className:`shrink-0`,asset:i}):null,(0,v.jsx)(`span`,{"aria-current":`page`,className:`flex h-token-button-composer min-w-0 flex-auto items-center truncate px-2 text-default`,children:a})]}),t[9]=n.length,t[10]=a,t[11]=y):y=t[11];let b;return t[12]!==c||t[13]!==m||t[14]!==h||t[15]!==y?(b=(0,v.jsxs)(`nav`,{"aria-label":c,className:m,children:[h,y]}),t[12]=c,t[13]=m,t[14]=h,t[15]=y,t[16]=b):b=t[16],b}
var g;
var _;
var v;
function y(){return(y=e(()=>{g=a();c();_=o();d();n();s();v=t();}))();}
export { l, f, r, p, u, i, e, a, c, o, d, n, s, t, h, g, _, v, y };
