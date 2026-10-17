import * as Host from "../host-boundaries.mjs";
import { EF as u } from "./app-shared-2f2228189a8d.js";
import { iA as c } from "./app-shared-2f2228189a8d.js";
import { F3 as f } from "./app-shared-2f2228189a8d.js";
import { cRt as i } from "./app-shared-2f2228189a8d.js";
import { iA as b } from "./app-initial-c468e3fd7f91.js";
import { qE as y } from "./app-initial-c468e3fd7f91.js";
import { Ntn as v } from "./app-initial-c468e3fd7f91.js";
import { mJr as t } from "./app-shared-2f2228189a8d.js";
import { nYr as d } from "./app-shared-2f2228189a8d.js";
import { j2 as h } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as a } from "./app-shared-2f2228189a8d.js";
import { DF as m } from "./app-shared-2f2228189a8d.js";
import { sA as o } from "./app-shared-2f2228189a8d.js";
import { o as s } from "./app-shared-2f2228189a8d.js";
import { Y3 as l } from "./app-shared-2f2228189a8d.js";
import { vJr as n } from "./app-shared-2f2228189a8d.js";
import { WL as r } from "./app-shared-2f2228189a8d.js";
import { aA as _ } from "./app-initial-c468e3fd7f91.js";
import { YE as g } from "./app-initial-c468e3fd7f91.js";
import { sYr as p } from "./app-shared-2f2228189a8d.js";
function x(e){let n=(0,S.c)(32),{src:r,conversationId:a,hostId:o,imageAssetResolver:s,shouldLoadFileDataUrl:l}=e,p=u(),m=c(f,a),g=o??m??`local`,_=i(g),x;n[0]===a?x=n[1]:(x=a==null?null:{kind:`app-server`,conversationId:a},n[0]=a,n[1]=x);let w=c(b,x),T=w?.hostId===g?w.environmentId:void 0,[E,D]=(0,C.useState)(null),O;n[2]===r?O=n[3]:(O=r.trim(),n[2]=r,n[3]=O);let k=O.length>0,A=k&&y(r)?r:``,{dataUrl:j,src:M,isError:N,refetch:P,deleted:F}=v(A,s),I,L;n[4]!==k||n[5]!==_.id||n[6]!==_.kind||n[7]!==g||n[8]!==r?(I=k?t(r):null,L=_.kind===`local`&&_.id===g&&I!=null?d(I):null,n[4]=k,n[5]=_.id,n[6]=_.kind,n[7]=g,n[8]=r,n[9]=I,n[10]=L):(I=n[9],L=n[10]);let R=L,z=E?.src===r&&E.environmentId===T?E.dataUrl:null,B=k?M??R??(I==null&&!A?r:z):null,V,H;n[11]!==I||n[12]!==a||n[13]!==R||n[14]!==T||n[15]!==g||n[16]!==p||n[17]!==l||n[18]!==r?(V=()=>{if(I==null||R!=null&&!l)return;let e=!1;return D({src:r,dataUrl:null,environmentId:T}),h(I,g,p,void 0,a,T).then(t=>{e||D({src:r,dataUrl:t,environmentId:T})}),()=>{e=!0}},H=[I,a,R,T,g,p,l,r],n[11]=I,n[12]=a,n[13]=R,n[14]=T,n[15]=g,n[16]=p,n[17]=l,n[18]=r,n[19]=V,n[20]=H):(V=n[19],H=n[20]),(0,C.useEffect)(V,H);let U;n[21]!==j||n[22]!==z||n[23]!==r?(U=j??z??(r.startsWith(`data:image/`)?r:null),n[21]=j,n[22]=z,n[23]=r,n[24]=U):U=n[24];let W=j??z??B,G=!!A&&N,K;return n[25]!==F||n[26]!==B||n[27]!==P||n[28]!==U||n[29]!==W||n[30]!==G?(K={dataUrl:U,previewSrc:B,downloadSrc:W,isError:G,refetch:P,deleted:F},n[25]=F,n[26]=B,n[27]=P,n[28]=U,n[29]=W,n[30]=G,n[31]=K):K=n[31],K}
var S;
var C;
function w(){return(w=e(()=>{S=a();m();o();C=s();l();n();r();_();g();p();}))();}
export { u, c, f, i, b, y, v, t, d, h, e, a, m, o, s, l, n, r, _, g, p, x, S, C, w };
