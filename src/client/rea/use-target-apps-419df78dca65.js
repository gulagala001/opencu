import * as Host from "../host-boundaries.mjs";
import { oA as n } from "./app-shared-2f2228189a8d.js";
import { h1 as c } from "./app-shared-2f2228189a8d.js";
import { zG as O } from "./app-initial-c468e3fd7f91.js";
import { e6 as h } from "./app-shared-2f2228189a8d.js";
import { uzi as k } from "./app-initial-c468e3fd7f91.js";
import { Dz as C } from "./app-shared-2f2228189a8d.js";
import { dxt as r } from "./app-shared-2f2228189a8d.js";
import { sN as u } from "./app-shared-2f2228189a8d.js";
import { fq as E } from "./app-shared-2f2228189a8d.js";
import { MF as v } from "./app-shared-2f2228189a8d.js";
import { lS as _ } from "./app-shared-2f2228189a8d.js";
import { FI as l } from "./app-shared-2f2228189a8d.js";
import { s as M } from "./codex-analytics-attribution-9703bc16df6d.js";
import { TB as f } from "./app-shared-2f2228189a8d.js";
import { MBi as j } from "./app-initial-c468e3fd7f91.js";
import { jX as d } from "./app-shared-2f2228189a8d.js";
import { hEr as m } from "./app-shared-2f2228189a8d.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as a } from "./app-shared-2f2228189a8d.js";
import { NF as b } from "./app-shared-2f2228189a8d.js";
import { sA as o } from "./app-shared-2f2228189a8d.js";
import { CF as w } from "./app-shared-2f2228189a8d.js";
import { o as s } from "./app-shared-2f2228189a8d.js";
import { xS as y } from "./app-shared-2f2228189a8d.js";
import { II as T } from "./app-shared-2f2228189a8d.js";
import { fzi as D } from "./app-initial-c468e3fd7f91.js";
import { NBi as A } from "./app-initial-c468e3fd7f91.js";
import { c as N } from "./codex-analytics-attribution-9703bc16df6d.js";
import { OB as g } from "./app-shared-2f2228189a8d.js";
import { g1 as p } from "./app-shared-2f2228189a8d.js";
import { RX as S } from "./app-shared-2f2228189a8d.js";
import { HL as i } from "./app-shared-2f2228189a8d.js";
import { pq as t } from "./app-shared-2f2228189a8d.js";
import { t6 as x } from "./app-shared-2f2228189a8d.js";
async function P({params:e,queryClient:t,queryKey:n,signal:r}){let i=h.openIn,a=await k(e,r);return r?.aborted?a:(t.setQueryData(n,a),await Promise.all(a.targets.map(async e=>{let a;try{a=(await C(i.detectTarget({target:e.target}),r)).available}catch{F(t,n,e.id,r,{available:!1,resolvedIcon:null});return}if(F(t,n,e.id,r,{available:a,...a?{}:{resolvedIcon:null}}),a&&!r?.aborted)try{let{icon:a}=await C(i.loadTargetIcon({target:e.target}),r);F(t,n,e.id,r,{resolvedIcon:a})}catch{F(t,n,e.id,r,{resolvedIcon:null})}})),t.getQueryData(n)??a)}
function F(e,t,n,r,i){r?.aborted||e.setQueryData(t,e=>{if(e==null)return e;let t=e.targets.map(e=>e.id===n?{...e,...i}:e);return{...e,availableTargets:t.flatMap(e=>e.available?[e.target]:[]),targets:t}})}
function I(){return(I=e(()=>{D();x();}))();}
function L(e){let t=(0,G.c)(30),{turnId:n,cwd:r,deferEnrichment:i,getOpenPath:a,hostId:o,openPath:s}=e,c=i!==void 0&&i,l;t[0]!==r||t[1]!==c||t[2]!==a||t[3]!==o||t[4]!==s?(l={cwd:r,hostId:o,isQueryEnabled:c,getOpenPath:a,openPath:s,deferEnrichment:c},t[0]=r,t[1]=c,t[2]=a,t[3]=o,t[4]=s,t[5]=l):l=t[5];let{data:u,isFetching:d}=V(l),f=u?.targets,p;t[6]!==r||t[7]!==c||t[8]!==o||t[9]!==s||t[10]!==f||t[11]!==n?(p={turnId:n,cwd:r,deferEnrichment:c,hostId:o,openPath:s,targets:f},t[6]=r,t[7]=c,t[8]=o,t[9]=s,t[10]=f,t[11]=n,t[12]=p):p=t[12];let m=B(p),h;t[13]!==r||t[14]!==o||t[15]!==s?(h=z({cwd:r,hostId:o,openPath:s}),t[13]=r,t[14]=o,t[15]=s,t[16]=h):h=t[16];let g=h,_=u?.preferredTarget??null,v;t[17]===u?.targets?v=t[18]:(v=u?.targets??[],t[17]=u?.targets,t[18]=v);let y;t[19]===u?.availableTargets?y=t[20]:(y=u?.availableTargets??[],t[19]=u?.availableTargets,t[20]=y);let b=u?.mode,x=u!=null,S;return t[21]!==g||t[22]!==d||t[23]!==m||t[24]!==x||t[25]!==_||t[26]!==v||t[27]!==y||t[28]!==b?(S={canLoadTargets:g,preferredTarget:_,targets:v,availableTargets:y,mode:b,hasLoadedTargets:x,isLoadingTargets:d,open:m},t[21]=g,t[22]=d,t[23]=m,t[24]=x,t[25]=_,t[26]=v,t[27]=y,t[28]=b,t[29]=S):S=t[29],S}
function R(e){let t=(0,G.c)(26),{cwd:n,delayMs:r,getOpenPath:i,hostId:a,openPath:o}=e,s=r===void 0?0:r,c;t[0]!==n||t[1]!==a||t[2]!==o?(c=z({cwd:n,hostId:a,openPath:o}),t[0]=n,t[1]=a,t[2]=o,t[3]=c):c=t[3];let l=c,u=s<=0,d;t[4]!==n||t[5]!==i||t[6]!==a||t[7]!==o||t[8]!==u?(d={cwd:n,hostId:a,isQueryEnabled:u,getOpenPath:i,openPath:o},t[4]=n,t[5]=i,t[6]=a,t[7]=o,t[8]=u,t[9]=d):d=t[9];let{data:f,refetch:p}=V(d),m;t[10]===p?m=t[11]:(m=()=>{p()},t[10]=p,t[11]=m);let h=(0,K.useEffectEvent)(m),g;t[12]!==l||t[13]!==f||t[14]!==s||t[15]!==h||t[16]!==u?(g=()=>{if(u||!l||f!=null)return;let e=window.setTimeout(h,s);return()=>{window.clearTimeout(e)}},t[12]=l,t[13]=f,t[14]=s,t[15]=h,t[16]=u,t[17]=g):g=t[17];let _;return t[18]!==l||t[19]!==n||t[20]!==f||t[21]!==s||t[22]!==a||t[23]!==o||t[24]!==u?(_=[l,n,f,s,a,o,u],t[18]=l,t[19]=n,t[20]=f,t[21]=s,t[22]=a,t[23]=o,t[24]=u,t[25]=_):_=t[25],(0,K.useEffect)(g,_),null}
function z({cwd:e,hostId:t,openPath:n}){return!!(e??n)}
function B(e){let t=(0,G.c)(12),{turnId:r,cwd:i,deferEnrichment:a,hostId:o,openPath:s,targets:u}=e,p=n(c),h=_(),g;t[0]!==h||t[1]!==p?(g=()=>{p.get(l).danger(h.formatMessage({id:`localConversation.openTarget.error`,defaultMessage:`Unable to open item`,description:`Toast shown when opening a file or website externally fails`}),{errorAnalytics:{toastId:`localConversation.openTarget.error`}})},t[0]=h,t[1]=p,t[2]=g):g=t[2];let v=g,y;return t[3]!==i||t[4]!==a||t[5]!==o||t[6]!==s||t[7]!==p||t[8]!==v||t[9]!==u||t[10]!==r?(y=(e,t)=>{let{appPath:n,environmentId:c,openMode:l,persistPreferred:h,line:g,column:_,path:y}=t,b=y??s??i;if(b){if(u?.find(t=>t.target===e&&(t.appPath??null)===(n??null))?.kind===`editor`&&r!=null){let t=p.get(M);t!=null&&p.get(f).submitCodexAnalyticsEvent?.({action:`open_in_ide`,eventKind:`action`,metadata:{target:e},threadId:t.threadId,turnId:r})}h&&i&&p.query.setData(O,{cwd:i,hostId:o,path:s,...a?{deferEnrichment:!0}:{}},t=>t&&{...t,preferredTarget:e,targets:t.targets.map(t=>({...t,default:t.target===e||void 0}))}),p.get(j).mutate({recentFilesThreadId:p.getOwnValue(d).clientThreadId,path:b,conversationId:m(p.value)??void 0,environmentId:c,cwd:i??null,target:e,appPath:n,line:g,column:_,openMode:l,...h&&i?{persistPreferredTargetPath:i}:{},hostId:o},{onSuccess:e=>{e.success||v()},onError:v})}},t[3]=i,t[4]=a,t[5]=o,t[6]=s,t[7]=p,t[8]=v,t[9]=u,t[10]=r,t[11]=y):y=t[11],y}
function V(e){let t=(0,G.c)(21),{cwd:r,deferEnrichment:i,getOpenPath:a,hostId:o,isQueryEnabled:s,openPath:l}=e,u=i!==void 0&&i,d=n(c),f,p;t[0]!==r||t[1]!==u||t[2]!==o||t[3]!==l||t[4]!==d.query?(f={cwd:r,hostId:o,path:l,...u?{deferEnrichment:!0}:{}},p=d.query.getOptions(O,f),t[0]=r,t[1]=u,t[2]=o,t[3]=l,t[4]=d.query,t[5]=f,t[6]=p):(f=t[5],p=t[6]);let m=p,h;t[7]!==a||t[8]!==f||t[9]!==m||t[10]!==d.queryClient?(h=async e=>{let{signal:t}=e;return H({params:a==null?f:{...f,path:await a()},queryClient:d.queryClient,queryKey:m.queryKey,signal:t})},t[7]=a,t[8]=f,t[9]=m,t[10]=d.queryClient,t[11]=h):h=t[11];let g;t[12]!==r||t[13]!==o||t[14]!==s||t[15]!==l?(g=z({cwd:r,hostId:o,openPath:l})&&s,t[12]=r,t[13]=o,t[14]=s,t[15]=l,t[16]=g):g=t[16];let _;return t[17]!==m||t[18]!==h||t[19]!==g?(_={...m,queryFn:h,enabled:g,staleTime:E.ONE_MINUTE},t[17]=m,t[18]=h,t[19]=g,t[20]=_):_=t[20],v(_)}
async function H({params:e,queryClient:t,queryKey:n,signal:r}){if(e.deferEnrichment)return P({params:e,queryClient:t,queryKey:n,signal:r});if(W(e.hostId)&&U(e.path)){let i=await k({...e,nativeBrowserDiscovery:`known`},r);i.targets.some(e=>e.kind===`native`&&e.appPath!=null)&&t.setQueryData(n,i)}return k(e,r)}
function U(e){if(e==null)return!1;if(r(e)||u(e))return!0;try{let t=new URL(e);return t.protocol===`http:`||t.protocol===`https:`}catch{return!1}}
function W(e){return e==null||e===`local`}
var G;
var K;
function q(){return(q=e(()=>{G=a();b();o();w();K=s();y();T();D();A();N();g();p();S();i();t();I();}))();}
export { n, c, O, h, k, C, r, u, E, v, _, l, M, f, j, d, m, e, a, b, o, w, s, y, T, D, A, N, g, p, S, i, t, x, P, F, I, L, R, z, B, V, H, U, W, G, K, q };
