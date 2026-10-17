import * as Host from "../host-boundaries.mjs";
import { lS as o } from "./app-shared-2f2228189a8d.js";
import { Qri as g } from "./app-initial-c468e3fd7f91.js";
import { d5 as s } from "./app-shared-2f2228189a8d.js";
import { JMi as h } from "./app-shared-2f2228189a8d.js";
import { hS as p } from "./app-shared-2f2228189a8d.js";
import { VW as u } from "./app-shared-2f2228189a8d.js";
import { wxi as d } from "./app-shared-2f2228189a8d.js";
import { Zi as y } from "./annotation-comment-editor-card-788d882d42ad.js";
import { qMi as r } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as i } from "./app-shared-2f2228189a8d.js";
import { CF as m } from "./app-shared-2f2228189a8d.js";
import { UW as f } from "./app-shared-2f2228189a8d.js";
import { o as a } from "./app-shared-2f2228189a8d.js";
import { xS as c } from "./app-shared-2f2228189a8d.js";
import { $ri as _ } from "./app-initial-c468e3fd7f91.js";
import { f5 as l } from "./app-shared-2f2228189a8d.js";
import { Ya as v } from "./annotation-comment-editor-card-788d882d42ad.js";
import { iNi as n } from "./app-shared-2f2228189a8d.js";
import { K as t } from "./app-shared-2f2228189a8d.js";
function b(e){let t=(0,x.c)(40),{dictationProductSurface:n,annotation:i,cwd:a,onClose:c,onRemove:l,onSave:f}=e,m=o(),_=(0,S.useContext)(g),v=s(),[b,w]=(0,S.useState)(120),[T,E]=(0,S.useState)(!0),D=i.localBrowserDesignChange?.group,O;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(O={"aria-describedby":void 0,style:{maxWidth:294}},t[0]=O):O=t[0];let k=!T,A;t[1]===c?A=t[2]:(A=e=>{e||c()},t[1]=c,t[2]=A);let j;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(j=(0,C.jsx)(h,{className:`sr-only`,children:(0,C.jsx)(p,{id:`composer.annotationEditor.title`,defaultMessage:`Edit annotation`,description:`Title of the editor for an annotation attached to the composer`})}),t[3]=j):j=t[3];let M;t[4]===b?M=t[5]:(M={height:b},t[4]=b,t[5]=M);let N=D!=null&&(D.declarations.length>0||D.text!=null||(D.annotationControlChanges?.length??0)>0),P;t[6]===m?P=t[7]:(P=m.formatMessage({id:`composer.annotationEditor.comment`,defaultMessage:`Annotation comment`,description:`Accessible label for editing an annotation's comment from the composer`}),t[6]=m,t[7]=P);let F;t[8]===Symbol.for(`react.memo_cache_sentinel`)?(F={mode:`edit`,commentId:`composer-annotation`},t[8]=F):F=t[8];let I;t[9]!==i||t[10]!==D?(I=D==null?u(i):D.comment??``,t[9]=i,t[10]=D,t[11]=I):I=t[11];let L;t[12]!==i.localBrowserAttachedImages||t[13]!==a||t[14]!==I?(L={sessionId:`composer-annotation-edit`,target:F,body:I,attachedImages:i.localBrowserAttachedImages,cwd:a,previewAlignment:`center`,surfaceMode:`editor`},t[12]=i.localBrowserAttachedImages,t[13]=a,t[14]=I,t[15]=L):L=t[15];let R;t[16]===f?R=t[17]:(R=e=>{let{body:t}=e;return f(t)},t[16]=f,t[17]=R);let z;t[18]===v?z=t[19]:(z=(e,t)=>{t!=null&&w(d(t.height,v))},t[18]=v,t[19]=z);let B;t[20]===f?B=t[21]:(B=e=>{let{body:t}=e;return f(t)},t[20]=f,t[21]=B);let V;t[22]!==n||t[23]!==c||t[24]!==l||t[25]!==L||t[26]!==R||t[27]!==z||t[28]!==B||t[29]!==N||t[30]!==P?(V=(0,C.jsx)(y,{dictationProductSurface:n,allowDirectSubmit:!1,allowEmptySubmit:N,allowImageAttachments:!1,inputAriaLabel:P,session:L,showAdjustEntry:!1,windowHeight:120,onCancel:c,onDelete:l,onDirectSubmit:R,onEscape:c,onLightDismissibilityChange:E,onMounted:z,onSubmit:B}),t[22]=n,t[23]=c,t[24]=l,t[25]=L,t[26]=R,t[27]=z,t[28]=B,t[29]=N,t[30]=P,t[31]=V):V=t[31];let H;t[32]!==V||t[33]!==M?(H=(0,C.jsx)(`div`,{className:`relative max-w-full`,style:M,children:V}),t[32]=V,t[33]=M,t[34]=H):H=t[34];let U;return t[35]!==_||t[36]!==H||t[37]!==k||t[38]!==A?(U=(0,C.jsxs)(Host.ReferenceEditorDialog,{Dialog:r,open:!0,contentClassName:`top-toolbar inset-x-4 mt-4`,contentPosition:`anchored`,contentProps:O,portalContainer:_,showDialogClose:!1,shouldIgnoreClickOutside:k,unstyledContent:!0,onOpenChange:A,children:[j,H]}),t[35]=_,t[36]=H,t[37]=k,t[38]=A,t[39]=U):U=t[39],U}
var x;
var S;
var C;
function w(){return(w=e(()=>{x=i();m();f();S=a();c();_();l();v();n();C=t();}))();}
export { o, g, s, h, p, u, d, y, r, e, i, m, f, a, c, _, l, v, n, t, b, x, S, C, w };
