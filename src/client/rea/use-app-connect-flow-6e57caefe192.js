import * as Host from "../host-boundaries.mjs";
import { nj as x } from "./app-shared-2f2228189a8d.js";
import { oA as n } from "./app-shared-2f2228189a8d.js";
import { X as i } from "./app-shared-2f2228189a8d.js";
import { lS as y } from "./app-shared-2f2228189a8d.js";
import { EF as _ } from "./app-shared-2f2228189a8d.js";
import { HK as d } from "./app-shared-2f2228189a8d.js";
import { Wgn as a } from "./app-shared-2f2228189a8d.js";
import { pAn as M } from "./app-initial-c468e3fd7f91.js";
import { QO as D } from "./app-initial-c468e3fd7f91.js";
import { oqr as oe } from "./app-shared-2f2228189a8d.js";
import { Rqr as ie } from "./app-shared-2f2228189a8d.js";
import { p as le } from "./app-connect-queries-9a5a6abbd473.js";
import { jWt as se } from "./app-initial-c468e3fd7f91.js";
import { PWt as ce } from "./app-initial-c468e3fd7f91.js";
import { o as fe } from "./microsoft-oauth-bundle-d3907c124361.js";
import { j as ue } from "./availability-14679d0aaf6b.js";
import { N as de } from "./availability-14679d0aaf6b.js";
import { Fqr as r } from "./app-shared-2f2228189a8d.js";
import { sqr as p } from "./app-shared-2f2228189a8d.js";
import { Iqr as re } from "./app-shared-2f2228189a8d.js";
import { Zqr as ee } from "./app-shared-2f2228189a8d.js";
import { zqr as ae } from "./app-shared-2f2228189a8d.js";
import { FI as m } from "./app-shared-2f2228189a8d.js";
import { Vqr as ne } from "./app-shared-2f2228189a8d.js";
import { Uqr as te } from "./app-shared-2f2228189a8d.js";
import { Xkn as E } from "./app-initial-c468e3fd7f91.js";
import { Wqr as g } from "./app-shared-2f2228189a8d.js";
import { dA as k } from "./app-initial-c468e3fd7f91.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as c } from "./app-shared-2f2228189a8d.js";
import { DF as T } from "./app-shared-2f2228189a8d.js";
import { sA as l } from "./app-shared-2f2228189a8d.js";
import { o as u } from "./app-shared-2f2228189a8d.js";
import { xS as S } from "./app-shared-2f2228189a8d.js";
import { cj as b } from "./app-shared-2f2228189a8d.js";
import { lJr as C } from "./app-shared-2f2228189a8d.js";
import { dqr as t } from "./app-shared-2f2228189a8d.js";
import { QAn as j } from "./app-initial-c468e3fd7f91.js";
import { m as P } from "./app-connect-queries-9a5a6abbd473.js";
import { RWt as A } from "./app-initial-c468e3fd7f91.js";
import { M as F } from "./availability-14679d0aaf6b.js";
import { p as L } from "./microsoft-oauth-bundle-d3907c124361.js";
import { P as I } from "./availability-14679d0aaf6b.js";
import { xQ as v } from "./app-shared-2f2228189a8d.js";
import { $O as O } from "./app-initial-c468e3fd7f91.js";
import { II as w } from "./app-shared-2f2228189a8d.js";
import { lAn as N } from "./app-initial-c468e3fd7f91.js";
import { gI as h } from "./app-shared-2f2228189a8d.js";
import { WL as o } from "./app-shared-2f2228189a8d.js";
import { GK as s } from "./app-shared-2f2228189a8d.js";
import { COr as f } from "./app-shared-2f2228189a8d.js";
function R(e){let t=(0,ye.c)(71),o;t[0]===e?o=t[1]:(o=e===void 0?{}:e,t[0]=e,t[1]=o);let{hostId:s,marketplaceAnalytics:c,oauthReferrer:l,onConnectStarted:u,onConnectFailed:f,onExternalConnectStarted:h}=o,v=(0,z.useContext)(x),b=n(i),S=y(),C=_(),w=s??`local`,T=d(`2761268526`),D=a(),{clearPendingAppConnect:O,getPendingAppConnectForApp:A,isAppConnectPending:j,markAppConnectOAuthPending:N}=M(),[P,F]=(0,z.useState)(null),[I,L]=(0,z.useState)(),[R,B]=(0,z.useState)(),[V,H]=(0,z.useState)(null),U;t[2]!==A||t[3]!==w?(U=(e,t)=>A(e,w,t==null||t.kind===`apps-tab`&&t.reauthLinkId==null?_e:t),t[2]=A,t[3]=w,t[4]=U):U=t[4];let W=U,be=he,G,K,q,J,Y,X,Z;if(t[5]!==O||t[6]!==P?.id||t[7]!==R||t[8]!==A||t[9]!==W||t[10]!==w||t[11]!==S||t[12]!==j||t[13]!==T||t[14]!==v?.location||t[15]!==N||t[16]!==c||t[17]!==l||t[18]!==f||t[19]!==u||t[20]!==h||t[21]!==V||t[22]!==C||t[23]!==b||t[24]!==D){J=async(e,t)=>{let{appConnectOptions:n,marketplaceAnalytics:i,addAccountAttempt:a,forceInApp:o,isAddingAccount:s,reauthLinkId:d,googleOAuthBundlePrepared:g,microsoftOAuthBundlePrepared:_,mustShowInstallationInterstitial:v}=t===void 0?{}:t,y=o!==void 0&&o,x=s!==void 0&&s,E=g!==void 0&&g,O=_!==void 0&&_;if(V!=null)return;let k=d==null&&(!e.isAccessible||x)?W(e.id):null,A=oe(e.id,n??(d==null?k?.appConnectOptions:W(e.id,{kind:`apps-tab`,reauthLinkId:d})?.appConnectOptions)),j=l==null?A:{connectorId:e.id,...A,oauthReferrer:A?.oauthReferrer??l},M=k?.marketplaceAnalytics??i??(typeof c==`function`?c():c),N=u?.(e,M)??M;if(!T&&!y&&k==null){be(ie(e,j)),h?.(e);return}le(C,e.id,j);let P=se({connectorId:e.id,statsigClient:D}),I=ce(e.id,P)!=null,R=fe({connectorId:e.id,statsigClient:D});if(!y&&!E&&!O&&k==null&&e.isAccessible!==!0&&(I||R)){H(e.id);let t={scope:b,appId:e.id,browserAccountId:void 0,hostId:w,queryClient:C};await(I?ue({...t,connectors:P}):de(t)).catch(t=>{throw f?.(e,N,`request_failed`),t}).finally(()=>{H(null)})}if(k!=null||v===!1&&(!y||x)&&(!e.isAccessible||x)&&(x||!I&&!R)){H(e.id);let t=await C.fetchQuery(r(e.id,{productSku:j?.productSku})).catch(me).then(async t=>t!=null&&t.status!==`DISABLED_BY_ADMIN`&&p(e.id,j)==null&&re(t,j?.authTypeOverride)&&ee(t,j?.authTypeOverride)===`OAUTH`?ae({scope:b,allowBrowserFallback:!1,app:e,appConnectOptions:j,connector:t,installAttemptId:N?.installAttemptId,requestedCompanionConnectorIds:k?.requestedCompanionConnectorIds,onOAuthStarted:(n,r)=>{K({app:e,oauthFlowCorrelationId:r?.oauthFlowCorrelationId,marketplaceAnalytics:N,pastedLinkProductExperience:k?.pastedLinkProductExperience,pluginInstallOAuthState:k?.pluginInstallOAuthState??(k?.resumeTarget.kind===`plugin-install`?k.oauthState:void 0),previousOAuthState:k?.oauthState,requestedCompanionConnectorIds:k?.requestedCompanionConnectorIds,resumeTarget:k?.resumeTarget??{kind:`apps-tab`,addAccountAttempt:a},isGithubConnector:e.id===`connector_76869538009648d5b282a4bb21c3d157`||t.template_id===`templated_apps_GitHubEnterprise`||t.service===`github`,redirectUrl:n,returnTo:j?.redirectAfter??k?.returnTo,appConnectOptions:j})},openInBrowser:pe,queryClient:C}):t==null?null:{kind:`requires-connection-form`}).finally(()=>{H(null)});if(t?.kind===`oauth-started`){b.get(m).info(ne({intl:S}));return}if((t==null||t.kind===`failed`)&&f?.(e,N,t==null?`request_failed`:`connect_failed`),k!=null&&t?.kind!==`requires-connection-form`&&t?.kind!==`requires-mfa`){b.get(m).danger(te(S),{errorAnalytics:{toastId:`useAppConnectFlow.handleConnectApp`}});return}}B(N),L(j),F(e)};let e;t[32]===Symbol.for(`react.memo_cache_sentinel`)?(e=()=>{F(null),L(void 0),B(void 0)},t[32]=e):e=t[32],G=e;let n;t[33]!==P?.id||t[34]!==W||t[35]!==w||t[36]!==j||t[37]!==V?(n=(e,t)=>V===e||P?.id===e||j(e,t??_e,w)||W(e,t)!=null,t[33]=P?.id,t[34]=W,t[35]=w,t[36]=j,t[37]=V,t[38]=n):n=t[38],X=n;let i;t[39]!==O||t[40]!==W||t[41]!==w||t[42]!==S||t[43]!==b?(i=(e,t)=>{let n=W(e,t);if(n==null)return;let r=n.pluginInstallOAuthState??(n.resumeTarget.kind===`plugin-install`?n.oauthState:void 0);r!=null&&(E(b,r)?b.get(m).danger(g(S),{errorAnalytics:{toastId:`useAppConnectFlow.handleAppConnected`}}):k(b,r)),O({oauthState:n.oauthState,hostId:w})},t[39]=O,t[40]=W,t[41]=w,t[42]=S,t[43]=b,t[44]=i):i=t[44],q=i;let a;t[45]!==O||t[46]!==W||t[47]!==w||t[48]!==S||t[49]!==h||t[50]!==b?(a=(e,t)=>{let n=W(e.id,t);if(n!=null){let e=n.pluginInstallOAuthState??(n.resumeTarget.kind===`plugin-install`?n.oauthState:void 0);e!=null&&E(b,e)&&b.get(m).danger(g(S),{errorAnalytics:{toastId:`useAppConnectFlow.handleExternalConnectStarted`}}),O({oauthState:n.oauthState,hostId:w})}h?.(e)},t[45]=O,t[46]=W,t[47]=w,t[48]=S,t[49]=h,t[50]=b,t[51]=a):a=t[51],Y=a;let o;t[52]!==A||t[53]!==w||t[54]!==j?(o=e=>j(e,ge,w)||A(e,w,ge)!=null,t[52]=A,t[53]=w,t[54]=j,t[55]=o):o=t[55],Z=o,K=e=>{let{app:t,appConnectOptions:n,isGithubConnector:r,marketplaceAnalytics:i,pastedLinkProductExperience:ee,pluginInstallOAuthState:te,previousOAuthState:a,oauthFlowCorrelationId:o,requestedCompanionConnectorIds:s,redirectUrl:l,returnTo:u,resumeTarget:d}=e,ne=i??R??(typeof c==`function`?c():c),f=a==null&&(d==null||d.kind===`apps-tab`)?W(t.id,d):null,p=a??f?.oauthState,m=f?.resumeTarget??d,h=N({app:t,oauthFlowCorrelationId:o,appConnectOptions:n??f?.appConnectOptions,hostId:w,isGithubConnector:r,marketplaceAnalytics:f?.marketplaceAnalytics??ne,pastedLinkProductExperience:ee??f?.pastedLinkProductExperience,pluginInstallOAuthState:te??f?.pluginInstallOAuthState??(f?.resumeTarget.kind===`plugin-install`?f.oauthState:void 0),requestedCompanionConnectorIds:s??f?.requestedCompanionConnectorIds,redirectUrl:l,returnTo:m?.kind===`apps-tab`&&m.reauthLinkId!=null&&m.addAccountAttempt!=null?f?.returnTo??ve(v?.location):u??f?.returnTo??ve(v?.location),resumeTarget:m});return h!=null&&p!=null&&p!==h&&O({oauthState:p,hostId:w}),h},t[5]=O,t[6]=P?.id,t[7]=R,t[8]=A,t[9]=W,t[10]=w,t[11]=S,t[12]=j,t[13]=T,t[14]=v?.location,t[15]=N,t[16]=c,t[17]=l,t[18]=f,t[19]=u,t[20]=h,t[21]=V,t[22]=C,t[23]=b,t[24]=D,t[25]=G,t[26]=K,t[27]=q,t[28]=J,t[29]=Y,t[30]=X,t[31]=Z}else G=t[25],K=t[26],q=t[27],J=t[28],Y=t[29],X=t[30],Z=t[31];let Q;t[56]!==O||t[57]!==w?(Q=e=>{O({...e,hostId:w})},t[56]=O,t[57]=w,t[58]=Q):Q=t[58];let $;return t[59]!==G||t[60]!==P||t[61]!==R||t[62]!==I||t[63]!==K||t[64]!==q||t[65]!==J||t[66]!==Y||t[67]!==X||t[68]!==Z||t[69]!==Q?($={connectingApp:P,connectingOptions:I,connectingMarketplaceAnalytics:R,clearConnectingApp:G,clearPendingAppConnect:Q,handleAppConnected:q,handleAppConnectOAuthStarted:K,handleConnectApp:J,handleExternalConnectStarted:Y,handleOpenAppUrl:be,isAppConnectPending:X,isAppReauthPending:Z},t[59]=G,t[60]=P,t[61]=R,t[62]=I,t[63]=K,t[64]=q,t[65]=J,t[66]=Y,t[67]=X,t[68]=Z,t[69]=Q,t[70]=$):$=t[70],$}
function pe(e){D({disposition:void 0,href:e,initiator:`open_in_browser_bridge`,openTarget:`external-browser`})}
function me(){return null}
function he(e){let t=e?.trim();t&&D({href:t,initiator:`open_in_browser_bridge`,openTarget:`external-browser`})}
function ge(e){return e.kind===`apps-tab`&&e.reauthLinkId!=null}
function _e(e){return e.kind===`apps-tab`&&e.reauthLinkId==null||e.kind===`plugin-install`&&e.origin==null&&e.pendingElicitationReply==null&&e.installOptions?.pendingElicitationReply==null}
function ve(e){return e==null?`${window.location.pathname}${window.location.search}${window.location.hash}`:`${e.pathname}${e.search}${e.hash}`}
var ye;
var z;
function B(){return(B=e(()=>{ye=c();T();l();z=u();S();b();C();t();j();P();f();A();F();L();I();v();O();w();N();h();o();s();}))();}
export { x, n, i, y, _, d, a, M, D, oe, ie, le, se, ce, fe, ue, de, r, p, re, ee, ae, m, ne, te, E, g, k, e, c, T, l, u, S, b, C, t, j, P, A, F, L, I, v, O, w, N, h, o, s, f, R, pe, me, he, ge, _e, ve, ye, z, B };
