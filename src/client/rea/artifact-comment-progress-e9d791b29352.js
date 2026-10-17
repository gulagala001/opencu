import * as Host from "../host-boundaries.mjs";
import { oA as a } from "./app-shared-2f2228189a8d.js";
import { h1 as p } from "./app-shared-2f2228189a8d.js";
import { lS as ee } from "./app-shared-2f2228189a8d.js";
import { v0c as ne } from "./app-initial-c468e3fd7f91.js";
import { h2e as pe } from "./app-primary-5433e23a397e.js";
import { tta as ae } from "./app-initial-c468e3fd7f91.js";
import { FI as m } from "./app-shared-2f2228189a8d.js";
import { Q1c as re } from "./app-initial-c468e3fd7f91.js";
import { R$c as de } from "./app-initial-c468e3fd7f91.js";
import { L$c as oe } from "./app-initial-c468e3fd7f91.js";
import { W as ve } from "./generation-progress-a3e25b033b50.js";
import { U as ye } from "./generation-progress-a3e25b033b50.js";
import { G as H } from "./generation-progress-a3e25b033b50.js";
import { K as _e } from "./generation-progress-a3e25b033b50.js";
import { LX as V } from "./app-primary-5433e23a397e.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as c } from "./app-shared-2f2228189a8d.js";
import { sA as u } from "./app-shared-2f2228189a8d.js";
import { o as f } from "./app-shared-2f2228189a8d.js";
import { xS as E } from "./app-shared-2f2228189a8d.js";
import { V$c as se } from "./app-initial-c468e3fd7f91.js";
import { ita as R } from "./app-initial-c468e3fd7f91.js";
import { l0c as ie } from "./app-initial-c468e3fd7f91.js";
import { b0c as z } from "./app-initial-c468e3fd7f91.js";
import { II as I } from "./app-shared-2f2228189a8d.js";
import { g1 as b } from "./app-shared-2f2228189a8d.js";
import { K as r } from "./app-shared-2f2228189a8d.js";
import { Qm as _ } from "./app-shared-2f2228189a8d.js";
import { Khn as S } from "./app-shared-2f2228189a8d.js";
import { Gk as ce } from "./app-initial-c468e3fd7f91.js";
import { owr as x } from "./app-shared-2f2228189a8d.js";
import { gI as g } from "./app-shared-2f2228189a8d.js";
import { Gk as N } from "./app-shared-2f2228189a8d.js";
import { X as o } from "./app-shared-2f2228189a8d.js";
import { RX as fe } from "./app-primary-5433e23a397e.js";
import { $ as ge } from "./generation-progress-a3e25b033b50.js";
import { u as t } from "./rolldown-runtime-2d059c5e81f4.js";
import { _p as T } from "./app-shared-2f2228189a8d.js";
import { ET as B } from "./app-initial-c468e3fd7f91.js";
import { BCr as v } from "./app-shared-2f2228189a8d.js";
import { TK as d } from "./app-shared-2f2228189a8d.js";
import { EK as n } from "./app-shared-2f2228189a8d.js";
import { DK as l } from "./app-shared-2f2228189a8d.js";
import { wK as y } from "./app-shared-2f2228189a8d.js";
import { Zm as s } from "./app-shared-2f2228189a8d.js";
import { UW as M } from "./app-shared-2f2228189a8d.js";
import { jP as h } from "./app-shared-2f2228189a8d.js";
import { aQt as le } from "./app-initial-c468e3fd7f91.js";
import { NT as L } from "./app-initial-c468e3fd7f91.js";
import { sfn as k } from "./app-shared-2f2228189a8d.js";
import { DT as te } from "./app-initial-c468e3fd7f91.js";
import { hfn as C } from "./app-shared-2f2228189a8d.js";
import { CF as P } from "./app-shared-2f2228189a8d.js";
import { RX as j } from "./app-shared-2f2228189a8d.js";
import { F as me } from "./artifact-request-progress-34a059bcac41.js";
function K(){return(K=e(()=>{u();P();ce();g();j();me();}))();}
async function Se({comments:e,body:t,turnTrigger:n,isCurrent:r,getDestination:i,onAccepted:a}){let o=e[0];if(o==null||!r())throw Error(`Artifact request is no longer available`);let s=await i(),c=()=>r()&&s.isCurrent();if(!c())throw Error(`Artifact destination is no longer available`);let l=!1;if(await s.submit({type:`artifact-annotation-direct-submit`,turnTrigger:n,comment:o,comments:e,body:t,isCurrent:c,onAccepted:(e,t)=>{l=!0,a?.(e,t)}}),!l)throw Error(`Artifact submission was not accepted`)}
function q(){return(q=e(()=>{M();K();}))();}
async function Ce({scope:e,artifactKey:t,progressKey:n,hostId:r,request:i,handleRef:a,intl:o,isCurrent:s,createComment:c,getDestination:l}){let{requestId:u,...d}=i;if(a.current==null||!s())return!1;let f=c({...d,annotationId:u});if(f==null)return!1;let p=i.target.type===`presentation-element-selection`&&i.target.primaryElementKind===`image`;p&&(f.localArtifactAnnotationMetadata={...f.localArtifactAnnotationMetadata,target:i.target,generation:`image`},ve(e,t,{annotationId:u,target:i.target,body:i.body}));let h=ye(e,n,r,i),g=!1;try{let n;return await Se({comments:[f],body:i.body,turnTrigger:`artifact_creation`,isCurrent:()=>a.current!=null&&s(),getDestination:async()=>{let e=await l();return n=e.threadId,e},onAccepted:(i,a)=>{let o=i??n;h.accepted(o,a),g=o!=null,p&&(o==null?H(e,t,u):_e(e,t,u,r,o))}}),!0}catch{return g?!0:(h.finish(),H(e,t,u),e.get(m).danger(o.formatMessage({id:`artifactGeneration.sendFailed`,defaultMessage:`Couldn't send this request. Check the chat and try again.`,description:`Error when an image or chart creation prompt could not be sent; the prompt stays open for retry`}),{errorAnalytics:{toastId:`artifactGeneration.sendFailed`}}),!1)}}
async function we(e,t){let n=e.get(V,t);if(n==null)throw Error(`Artifact composer is unavailable`);return{submit:n.submit,threadId:n.threadId??t,isCurrent:()=>e.get(V,t)===n}}
function Te(){return(Te=e(()=>{fe();I();ge();q();}))();}
function Ee(e){let t=(0,De.c)(51),{children:n,onBusyChange:r,onChange:i,onSubmit:o,tooltipPortalContainer:s,value:c}=e,l=a(p),u=ee(),d=(0,J.useRef)(c),f,h;t[0]===c?(f=t[1],h=t[2]):(f=()=>{d.current=c},h=[c],t[0]=c,t[1]=f,t[2]=h),(0,J.useEffect)(f,h);let g=ne(),_=g===!0,v;t[3]===l.value?v=t[4]:(v=pe(l.value),t[3]=l.value,t[4]=v);let y;t[5]===Symbol.for(`react.memo_cache_sentinel`)?(y=()=>d.current,t[5]=y):y=t[5];let b;t[6]===i?b=t[7]:(b=e=>{let t=ae(d.current,e);d.current=t,i(t)},t[6]=i,t[7]=b);let x;t[8]!==i||t[9]!==o?(x=e=>{let t=ae(d.current,e);d.current=t;let n=t.trim();n.length!==0&&(i(t),o(n))},t[8]=i,t[9]=o,t[10]=x):x=t[10];let S,C,w;t[11]!==u||t[12]!==l?(S=()=>{l.get(m).danger(u.formatMessage({id:`composer.dictation.startError`,defaultMessage:`Unable to start dictation`,description:`Toast text shown when dictation could not be started`}),{errorAnalytics:{toastId:`composer.dictation.startError`}})},C=()=>{l.get(m).danger(u.formatMessage({id:`composer.dictation.transcribeError`,defaultMessage:`Unable to transcribe audio`,description:`Toast text shown when dictation audio transcription fails`}),{errorAnalytics:{toastId:`composer.dictation.transcribeError`}})},w=()=>{l.get(m).danger(u.formatMessage({id:`composer.dictation.unsupported`,defaultMessage:`Dictation is not available on this device`,description:`Toast text shown when dictation is not supported on the current device`}),{errorAnalytics:{toastId:`composer.dictation.unsupported`}})},t[11]=u,t[12]=l,t[13]=S,t[14]=C,t[15]=w):(S=t[13],C=t[14],w=t[15]);let T;t[16]!==_||t[17]!==v||t[18]!==b||t[19]!==x||t[20]!==S||t[21]!==C||t[22]!==w?(T={productSurface:v,enabled:_,getSurroundingText:y,onTranscriptInsert:b,onTranscriptSend:x,onStartError:S,onTranscribeError:C,onUnsupported:w},t[16]=_,t[17]=v,t[18]=b,t[19]=x,t[20]=S,t[21]=C,t[22]=w,t[23]=T):T=t[23];let{isDictationStarting:E,isDictating:D,isTranscribing:O,transcriptionAction:k,canRetryDictation:A,retryDictation:j,waveformCanvasRef:M,startDictation:N,stopDictation:P}=re(T),F=E||D||O,I,L;t[24]!==F||t[25]!==r?(I=()=>(r?.(F),()=>{r?.(!1)}),L=[F,r],t[24]=F,t[25]=r,t[26]=I,t[27]=L):(I=t[26],L=t[27]),(0,J.useEffect)(I,L);let R;t[28]!==A||t[29]!==g||t[30]!==E||t[31]!==_||t[32]!==O||t[33]!==j||t[34]!==N||t[35]!==P||t[36]!==s?(R=g==null||_?(0,Y.jsx)(de,{isVisible:!0,isStarting:E,isTranscribing:O,canRetryDictation:A,disabled:g==null,radius:`full`,retryDictation:j,size:`formatToolbarIcon`,startDictation:N,stopDictation:P,tooltipPortalContainer:s}):null,t[28]=A,t[29]=g,t[30]=E,t[31]=_,t[32]=O,t[33]=j,t[34]=N,t[35]=P,t[36]=s,t[37]=R):R=t[37];let z;t[38]!==D||t[39]!==O||t[40]!==P||t[41]!==s||t[42]!==k||t[43]!==M?(z=D||O?(0,Y.jsx)(`div`,{className:`absolute inset-0 z-20 flex flex-col justify-center bg-surface-elevated-secondary`,children:(0,Y.jsx)(oe,{transcriptionAction:k,waveformCanvasRef:M,stopDictation:P,noBottomMargin:!0,tooltipPortalContainer:s})}):null,t[38]=D,t[39]=O,t[40]=P,t[41]=s,t[42]=k,t[43]=M,t[44]=z):z=t[44];let B;return t[45]!==n||t[46]!==F||t[47]!==D||t[48]!==R||t[49]!==z?(B=n({dictationButton:R,recordingOverlay:z,isBusy:F,isDictating:D}),t[45]=n,t[46]=F,t[47]=D,t[48]=R,t[49]=z,t[50]=B):B=t[50],B}
var De;
var J;
var Y;
function Oe(){return(Oe=e(()=>{De=c();u();J=f();E();se();R();ie();z();I();b();Y=r();}))();}
var ke;
var X;
var Z;
var Ae;
var Q;
var je;
function $(){return($=e(()=>{ke=t(h(),1);X=t(T(),1);u();_();S();ce();x();g();Z=N(o,(e,{get:t})=>{if(!t(le,e))return null;let n=t(L,e);if(n==null)return null;let r=k({current_node:t(te,e),mapping:n}).find(e=>e.author.role===`user`);return r==null?null:{turnId:r.id,text:C(r)};},{isEqual:X.default});Ae=N(o,(e,{get:t})=>{if(t(B,e.threadId)){let n=t(Z,e.threadId);return n==null?null:{turnId:n.turnId,comments:v(n.text)};}let r=(0,ke.default)(t(d,e),e=>!t(n,e)?.pendingUserMessageAdmission);if(r==null)return null;let i=t(n,r);if(i?.status!==`inProgress`||i.turnId==null)return null;let a=i.params.input;if(a.length===0&&(i.params.commentAttachments?.length??0)===0)for(let e of t(l,r)??[]){let n=t(y,{...r,itemId:e});if(n?.type===`userMessage`){a=n.content;break;}}return{turnId:i.turnId,comments:v(s({input:a}).rawText,{commentAttachments:i.params.commentAttachments})};},{isEqual:X.default});Q=N(o,(e,{get:t})=>{let n=new Map();if(e==null)return n;let r=t(Ae,{hostId:e.hostId,threadId:e.threadId});for(let t of r?.comments??[]){let i;i=`pageId`in e?t.pageId===e.pageId:`artifactRef`in e?t.artifactRef===e.artifactRef:t.artifactAnnotationFilePath===e.path,i&&t.commentThreadId!=null&&r?.turnId!=null&&n.set(t.commentThreadId,r.turnId);}return n;},{isEqual:X.default});je=N(o,(e,{get:t})=>new Set(t(Q,e).keys()),{isEqual:X.default});}))();}
export { a, p, ee, ne, pe, ae, m, re, de, oe, ve, ye, H, _e, V, e, c, u, f, E, se, R, ie, z, I, b, r, _, S, ce, x, g, N, o, fe, ge, t, T, B, v, d, n, l, y, s, M, h, le, L, k, te, C, P, j, me, K, Se, q, Ce, we, Te, Ee, De, J, Y, Oe, ke, X, Z, Ae, Q, je, $ };
