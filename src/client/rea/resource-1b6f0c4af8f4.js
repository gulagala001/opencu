import * as Host from "../host-boundaries.mjs";
import { o as t } from "./rolldown-runtime-2d059c5e81f4.js";
import { CF as C } from "./app-shared-2f2228189a8d.js";
import { G as te } from "./app-shared-2f2228189a8d.js";
import { Nf as re } from "./app-shared-2f2228189a8d.js";
import { cEt as x } from "./app-shared-2f2228189a8d.js";
import { H as h } from "./app-shared-2f2228189a8d.js";
import { z as a } from "./app-shared-2f2228189a8d.js";
import { uu as c } from "./app-shared-2f2228189a8d.js";
import { B as p } from "./app-shared-2f2228189a8d.js";
import { V as m } from "./app-shared-2f2228189a8d.js";
import { Pm as u } from "./app-shared-2f2228189a8d.js";
import { Of as S } from "./app-shared-2f2228189a8d.js";
import { f as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { Eu as g } from "./app-shared-2f2228189a8d.js";
import { W as y } from "./app-shared-2f2228189a8d.js";
import { ju as d } from "./app-shared-2f2228189a8d.js";
import { yu as n } from "./app-shared-2f2228189a8d.js";
import { bu as o } from "./app-shared-2f2228189a8d.js";
import { bm as v } from "./app-shared-2f2228189a8d.js";
import { xm as f } from "./app-shared-2f2228189a8d.js";
import { Sm as b } from "./app-shared-2f2228189a8d.js";
import { Tm as ne } from "./app-shared-2f2228189a8d.js";
import { sm as w } from "./app-shared-2f2228189a8d.js";
import { vu as s } from "./app-shared-2f2228189a8d.js";
import { tm as r } from "./app-shared-2f2228189a8d.js";
import { Cm as l } from "./app-shared-2f2228189a8d.js";
import { gu as _ } from "./app-shared-2f2228189a8d.js";
function T(){return(T=t(()=>{u();}))();}
var E;
var D;
var O;
var k;
var A;
var j;
var M;
var N;
var P;
var F;
var I;
var L;
var R;
function B(){return(B=t(()=>{u();T();S();(t=>typeof e<`u`?e:typeof Proxy<`u`?new Proxy(t,{get:(t,n)=>(typeof e<`u`?e:t)[n]}):t)(function(t){if(typeof e<`u`)return e.apply(this,arguments);throw Error(`Dynamic require of "`+t+`" is not supported`);});E=g([y(`light`),y(`dark`)]).describe(`Color theme preference for the host environment.`);D=g([y(`inline`),y(`fullscreen`),y(`pip`)]).describe(`Display mode for UI presentation.`);O=g([y(`--color-background-primary`),y(`--color-background-secondary`),y(`--color-background-tertiary`),y(`--color-background-inverse`),y(`--color-background-ghost`),y(`--color-background-info`),y(`--color-background-danger`),y(`--color-background-success`),y(`--color-background-warning`),y(`--color-background-disabled`),y(`--color-text-primary`),y(`--color-text-secondary`),y(`--color-text-tertiary`),y(`--color-text-inverse`),y(`--color-text-ghost`),y(`--color-text-info`),y(`--color-text-danger`),y(`--color-text-success`),y(`--color-text-warning`),y(`--color-text-disabled`),y(`--color-border-primary`),y(`--color-border-secondary`),y(`--color-border-tertiary`),y(`--color-border-inverse`),y(`--color-border-ghost`),y(`--color-border-info`),y(`--color-border-danger`),y(`--color-border-success`),y(`--color-border-warning`),y(`--color-border-disabled`),y(`--color-ring-primary`),y(`--color-ring-secondary`),y(`--color-ring-inverse`),y(`--color-ring-info`),y(`--color-ring-danger`),y(`--color-ring-success`),y(`--color-ring-warning`),y(`--font-sans`),y(`--font-mono`),y(`--font-weight-normal`),y(`--font-weight-medium`),y(`--font-weight-semibold`),y(`--font-weight-bold`),y(`--font-text-xs-size`),y(`--font-text-sm-size`),y(`--font-text-md-size`),y(`--font-text-lg-size`),y(`--font-heading-xs-size`),y(`--font-heading-sm-size`),y(`--font-heading-md-size`),y(`--font-heading-lg-size`),y(`--font-heading-xl-size`),y(`--font-heading-2xl-size`),y(`--font-heading-3xl-size`),y(`--font-text-xs-line-height`),y(`--font-text-sm-line-height`),y(`--font-text-md-line-height`),y(`--font-text-lg-line-height`),y(`--font-heading-xs-line-height`),y(`--font-heading-sm-line-height`),y(`--font-heading-md-line-height`),y(`--font-heading-lg-line-height`),y(`--font-heading-xl-line-height`),y(`--font-heading-2xl-line-height`),y(`--font-heading-3xl-line-height`),y(`--border-radius-xs`),y(`--border-radius-sm`),y(`--border-radius-md`),y(`--border-radius-lg`),y(`--border-radius-xl`),y(`--border-radius-full`),y(`--border-width-regular`),y(`--shadow-hairline`),y(`--shadow-sm`),y(`--shadow-md`),y(`--shadow-lg`)]).describe(`CSS variable keys available to MCP apps for theming.`);k=d(O.describe(`Style variables for theming MCP apps.

Individual style keys are optional - hosts may provide any subset of these values.
Values are strings containing CSS values (colors, sizes, font stacks, etc.).

Note: This type uses \`Record<K, string | undefined>\` rather than \`Partial<Record<K, string>>\`
for compatibility with Zod schema generation. Both are functionally equivalent for validation.`),g([a(),_()]).describe(`Style variables for theming MCP apps.

Individual style keys are optional - hosts may provide any subset of these values.
Values are strings containing CSS values (colors, sizes, font stacks, etc.).

Note: This type uses \`Record<K, string | undefined>\` rather than \`Partial<Record<K, string>>\`
for compatibility with Zod schema generation. Both are functionally equivalent for validation.`)).describe(`Style variables for theming MCP apps.

Individual style keys are optional - hosts may provide any subset of these values.
Values are strings containing CSS values (colors, sizes, font stacks, etc.).

Note: This type uses \`Record<K, string | undefined>\` rather than \`Partial<Record<K, string>>\`
for compatibility with Zod schema generation. Both are functionally equivalent for validation.`);h({method:y(`ui/open-link`),params:h({url:a().describe(`URL to open in the host's browser`)})});h({isError:p().optional().describe(`True if the host failed to open the URL (e.g., due to security policy).`)}).passthrough();h({isError:p().optional().describe(`True if the download failed (e.g., user cancelled or host denied).`)}).passthrough();h({isError:p().optional().describe(`True if the host rejected or failed to deliver the message.`)}).passthrough();h({method:y(`ui/notifications/sandbox-proxy-ready`),params:h({})});A=h({connectDomains:m(a()).optional().describe(`Origins for network requests (fetch/XHR/WebSocket).

- Maps to CSP \`connect-src\` directive
- Empty or omitted → no network connections (secure default)`),resourceDomains:m(a()).optional().describe("Origins for static resources (images, scripts, stylesheets, fonts, media).\n\n- Maps to CSP `img-src`, `script-src`, `style-src`, `font-src`, `media-src` directives\n- Wildcard subdomains supported: `https://*.example.com`\n- Empty or omitted → no network resources (secure default)"),frameDomains:m(a()).optional().describe("Origins for nested iframes.\n\n- Maps to CSP `frame-src` directive\n- Empty or omitted → no nested iframes allowed (`frame-src 'none'`)"),baseUriDomains:m(a()).optional().describe("Allowed base URIs for the document.\n\n- Maps to CSP `base-uri` directive\n- Empty or omitted → only same origin allowed (`base-uri 'self'`)")});j=h({camera:h({}).optional().describe(`Request camera access.

Maps to Permission Policy \`camera\` feature.`),microphone:h({}).optional().describe(`Request microphone access.

Maps to Permission Policy \`microphone\` feature.`),geolocation:h({}).optional().describe(`Request geolocation access.

Maps to Permission Policy \`geolocation\` feature.`),clipboardWrite:h({}).optional().describe(`Request clipboard write access.

Maps to Permission Policy \`clipboard-write\` feature.`)});h({method:y(`ui/notifications/size-changed`),params:h({width:c().optional().describe(`New width in pixels.`),height:c().optional().describe(`New height in pixels.`)})});h({method:y(`ui/notifications/tool-input`),params:h({arguments:d(a(),n().describe(`Complete tool call arguments as key-value pairs.`)).optional().describe(`Complete tool call arguments as key-value pairs.`)})});h({method:y(`ui/notifications/tool-input-partial`),params:h({arguments:d(a(),n().describe(`Partial tool call arguments (incomplete, may change).`)).optional().describe(`Partial tool call arguments (incomplete, may change).`)})});h({method:y(`ui/notifications/tool-cancelled`),params:h({reason:a().optional().describe(`Optional reason for the cancellation (e.g., "user action", "timeout").`)})});M=h({fonts:a().optional()});N=h({variables:k.optional().describe(`CSS variables for theming the app.`),css:M.optional().describe(`CSS blocks that apps can inject.`)});h({method:y(`ui/resource-teardown`),params:h({})});d(a(),n());P=h({text:h({}).optional().describe(`Host supports text content blocks.`),image:h({}).optional().describe(`Host supports image content blocks.`),audio:h({}).optional().describe(`Host supports audio content blocks.`),resource:h({}).optional().describe(`Host supports resource content blocks.`),resourceLink:h({}).optional().describe(`Host supports resource link content blocks.`),structuredContent:h({}).optional().describe(`Host supports structured content.`)});h({method:y(`ui/notifications/request-teardown`),params:h({}).optional()});F=h({experimental:d(a(),d(a(),s()).describe(`Experimental features keyed by identifier.`)).optional().describe(`Experimental features keyed by identifier.`),openLinks:h({}).optional().describe(`Host supports opening external URLs.`),downloadFile:h({}).optional().describe(`Host supports file downloads via ui/download-file.`),serverTools:h({listChanged:p().optional().describe(`Host supports tools/list_changed notifications.`)}).optional().describe(`Host can proxy tool calls to the MCP server.`),serverResources:h({listChanged:p().optional().describe(`Host supports resources/list_changed notifications.`)}).optional().describe(`Host can proxy resource reads to the MCP server.`),logging:h({}).optional().describe(`Host accepts log messages.`),sandbox:h({permissions:j.optional().describe(`Permissions granted by the host (camera, microphone, geolocation).`),csp:A.optional().describe(`CSP domains approved by the host.`)}).optional().describe(`Sandbox configuration applied by the host.`),updateModelContext:P.optional().describe(`Host accepts context updates (ui/update-model-context) to be included in the model's context for future turns.`),message:P.optional().describe(`Host supports receiving content messages (ui/message) from the view.`),sampling:h({tools:h({}).optional().describe("Host supports tool use via `tools` and `toolChoice` parameters.")}).optional().describe("Host supports LLM sampling (sampling/createMessage) from the view.\nMirrors the MCP `ClientCapabilities.sampling` shape so hosts can pass it through.")});I=h({experimental:d(a(),d(a(),s()).describe(`Experimental features keyed by identifier.`)).optional().describe(`Experimental features keyed by identifier.`),tools:h({listChanged:p().optional().describe(`App supports tools/list_changed notifications.`)}).optional().describe(`App exposes MCP-style tools that the host can call.`),availableDisplayModes:m(D).optional().describe(`Display modes the app supports.`)});h({method:y(`ui/notifications/initialized`),params:h({}).optional()});h({csp:A.optional().describe(`Content Security Policy configuration for UI resources.`),permissions:j.optional().describe(`Sandbox permissions requested by the UI resource.`),domain:a().optional().describe(`Dedicated origin for view sandbox.

Useful when views need stable, dedicated origins for OAuth callbacks, CORS policies, or API key allowlists.

**Host-dependent:** The format and validation rules for this field are determined by each host. Servers MUST consult host-specific documentation for the expected domain format. Common patterns include:
- Hash-based subdomains (e.g., \`{hash}.claudemcpcontent.com\`)
- URL-derived subdomains (e.g., \`www-example-com.oaiusercontent.com\`)

If omitted, host uses default sandbox origin (typically per-conversation).`),prefersBorder:p().optional().describe(`Visual boundary preference - true if view prefers a visible border.

Boolean requesting whether a visible border and background is provided by the host. Specifying an explicit value for this is recommended because hosts' defaults may vary.

- \`true\`: request visible border + background
- \`false\`: request no visible border + background
- omitted: host decides border`)});h({method:y(`ui/request-display-mode`),params:h({mode:D.describe(`The display mode being requested.`)})});h({mode:D.describe(`The display mode that was actually set. May differ from requested if not supported.`)}).passthrough();L=g([y(`model`),y(`app`)]).describe(`Tool visibility scope - who can access the tool.`);h({resourceUri:a().optional(),visibility:m(L).optional().describe(`Who can access this tool. Default: ["model", "app"]
- "model": Tool visible to and callable by the agent
- "app": Tool callable by the app from this server only`),csp:o().optional(),permissions:o().optional()});h({mimeTypes:m(a()).optional().describe('Array of supported MIME types for UI resources.\nMust include `"text/html;profile=mcp-app"` for MCP Apps support.')});h({method:y(`ui/download-file`),params:h({contents:m(g([v,f])).describe(`Resource contents to download — embedded (inline data) or linked (host fetches). Uses standard MCP resource types.`)})});h({method:y(`ui/message`),params:h({role:y(`user`).describe(`Message role, currently only "user" is supported.`),content:m(b).describe(`Message content blocks (text, image, etc.).`)})});h({method:y(`ui/notifications/sandbox-resource-ready`),params:h({html:a().describe(`HTML content to load into the inner iframe.`),sandbox:a().optional().describe(`Optional override for the inner iframe's sandbox attribute.`),csp:A.optional().describe(`CSP configuration from resource metadata.`),permissions:j.optional().describe(`Sandbox permissions from resource metadata.`)})});h({method:y(`ui/notifications/tool-result`),params:ne.describe(`Standard MCP tool execution result.`)});R=h({toolInfo:h({id:r.optional().describe(`JSON-RPC id of the tools/call request.`),tool:l.describe(`Tool definition including name, inputSchema, etc.`)}).optional().describe(`Metadata of the tool call that instantiated this App.`),theme:E.optional().describe(`Current color theme preference.`),styles:N.optional().describe(`Style configuration for theming the app.`),displayMode:D.optional().describe(`How the UI is currently displayed.`),availableDisplayModes:m(D).optional().describe(`Display modes the host supports.`),containerDimensions:g([h({height:c().describe(`Fixed container height in pixels.`)}),h({maxHeight:g([c(),_()]).optional().describe(`Maximum container height in pixels.`)})]).and(g([h({width:c().describe(`Fixed container width in pixels.`)}),h({maxWidth:g([c(),_()]).optional().describe(`Maximum container width in pixels.`)})])).optional().describe(`Container dimensions. Represents the dimensions of the iframe or other
container holding the app. Specify either width or maxWidth, and either height or maxHeight.`),locale:a().optional().describe(`User's language and region preference in BCP 47 format.`),timeZone:a().optional().describe(`User's timezone in IANA format.`),userAgent:a().optional().describe(`Host application identifier.`),platform:g([y(`web`),y(`desktop`),y(`mobile`)]).optional().describe(`Platform type for responsive design decisions.`),deviceCapabilities:h({touch:p().optional().describe(`Whether the device supports touch input.`),hover:p().optional().describe(`Whether the device supports hover interactions.`)}).optional().describe(`Device input capabilities.`),safeAreaInsets:h({top:c().describe(`Top safe area inset in pixels.`),right:c().describe(`Right safe area inset in pixels.`),bottom:c().describe(`Bottom safe area inset in pixels.`),left:c().describe(`Left safe area inset in pixels.`)}).optional().describe(`Mobile safe area boundaries in pixels.`)}).passthrough();h({method:y(`ui/notifications/host-context-changed`),params:R.describe(`Partial context update containing only changed fields.`)});h({method:y(`ui/initialize`),params:h({appInfo:w.describe(`App identification (name and version).`),appCapabilities:I.describe(`Features and capabilities this app provides.`),protocolVersion:a().describe(`Protocol version this app supports.`)})});h({protocolVersion:a().describe(`Negotiated protocol version string (e.g., "2025-11-21").`),hostInfo:w.describe(`Host application identification and version.`),hostCapabilities:F.describe(`Features and capabilities provided by the host.`),hostContext:R.describe(`Rich context about the host environment.`)}).passthrough();}))();}
function V(e){let t=null;for(let n of e?.contents??[]){let e=Q.safeParse(n);if(!e.success)continue;if(e.data.mimeType===`text/x-dil;profile=mcp-app`){t??={htmlFallback:null,kind:`dil`,source:e.data.text??null};continue}if(e.data.mimeType==null||!K.has(e.data.mimeType))continue;let r=e.data._meta?.[`openai/widgetHeightHint`],i=e.data._meta?.[`openai/widgetMinFrameHeight`],a=e.data._meta?.[`openai/ui`],o={availableDisplayModes:a?.availableDisplayModes,preferredDisplayMode:a?.preferredDisplayMode,csp:W(e.data._meta),heightHint:r,hideAttribution:e.data._meta?.[`openai/widgetHideAttribution`],html:e.data.text??null,htmlByteLength:new Blob([e.data.text??``]).size,kind:`html`,minFrameHeight:i,prefersBorder:e.data._meta?.[`openai/widgetPrefersBorder`]??e.data._meta?.ui?.prefersBorder??!1,isCollapsible:!(e.data._meta?.[`openai/widgetShowCodexWidgetInline`]??!1),widgetDomain:e.data._meta?.ui?.domain??e.data._meta?.[`openai/widgetDomain`]??null};return t==null?o:{...t,htmlFallback:o}}return t}
function U({hasResourceError:e=!1,isDilEnabled:t,isResourceLoading:n=!1,renderData:r,resourceUri:i,shouldRenderMcpApp:a}){if(!a)return{kind:`fallback`};if(r==null||r.kind===`html`&&r.html==null)return n||e?{kind:`html`,renderData:null}:{kind:`fallback`};if(r.kind!==`dil`)return{kind:`html`,renderData:r};if(!t||i==null||r.source==null){let t=r.htmlFallback;return t?.html==null?e?{kind:`html`,renderData:null}:{kind:`fallback`}:{kind:`html`,renderData:t}}return e?{kind:`html`,renderData:null}:{kind:`dil`,source:r.source}}
function W(e){let t=e?.ui?.csp,n=e?.[`openai/widgetCSP`],r=t?.resourceDomains??n?.resourceDomains??n?.resource_domains??[],i=t?.frameDomains??n?.frameDomains??n?.frame_domains??[];return{baseUriDomains:t?.baseUriDomains??n?.baseUriDomains??n?.base_uri_domains??[],connectDomains:[...new Set([...t?.connectDomains??n?.connectDomains??n?.connect_domains??[],...r])],frameDomains:i,includeDefaultDomains:!1,isTrusted:t!=null||n!=null,resourceDomains:r}}
function G(e,t,n){return[...new Set(e.flatMap(e=>{let r=se(e,t,n);return r==null?[]:[r]}))]}
function oe(){return!1}
function se(e,t,n){let r=e.trim();if(r.length===0||J.test(r))return null;if(r===`blob:`||r===`data:`)return r;let i=r.replace(q,`$1*`),a=/^[a-z][a-z0-9+.-]*:\/\//i.test(i)?i:`https://${i}`,o;try{o=new URL(a)}catch{return null}let s=n&&oe()&&o.hostname===`localhost`&&(o.protocol===`http:`||t&&o.protocol===`ws:`);if(!(o.protocol===`https:`||t&&o.protocol===`wss:`||s)||o.hostname===`*`||o.username.length>0||o.password.length>0)return null;let c=o.hostname.replace(/^%2a(?=\.)/i,`*`);return c.includes(`*`)&&!c.startsWith(`*.`)?null:`${o.protocol}//${c}${o.port.length>0?`:${o.port}`:``}`}
var K;
var q;
var J;
var Y;
var X;
var Z;
var Q;
function $(){return($=t(()=>{B();C();te();re();K=new Set([`text/html`,...x]);q=/^([a-z][a-z0-9+.-]*:\/\/)?%2a(?=\.)/i;J=/[\s;,"']/;Y=m(a()).transform(e=>G(e,!1,!1));X=m(a()).transform(e=>G(e,!1,!0));Z=m(a()).transform(e=>G(e,!0,!0));Q=h({_meta:h({"openai/widgetCSP":h({baseUriDomains:Y.optional(),base_uri_domains:Y.optional(),connectDomains:Z.optional(),connect_domains:Z.optional(),frameDomains:Y.optional(),frame_domains:Y.optional(),resourceDomains:X.optional(),resource_domains:X.optional()}).strip().optional(),"openai/widgetDomain":a().optional(),"openai/widgetHeightHint":c().positive().optional().catch(void 0),"openai/widgetShowCodexWidgetInline":p().optional(),"openai/widgetHideAttribution":p().optional().catch(void 0),"openai/widgetMinFrameHeight":c().nonnegative().optional().catch(void 0),"openai/widgetPrefersBorder":p().optional(),"openai/ui":h({availableDisplayModes:m(D).optional(),preferredDisplayMode:D.optional()}).optional(),ui:h({csp:h({baseUriDomains:Y.optional(),connectDomains:Z.optional(),frameDomains:Y.optional(),resourceDomains:X.optional()}).strip().optional(),domain:a().optional(),prefersBorder:p().optional()}).strip().optional()}).strip().optional(),mimeType:a().optional().catch(void 0),text:a().optional().catch(void 0)}).strip();}))();}
export { t, C, te, re, x, h, a, c, p, m, u, S, e, g, y, d, n, o, v, f, b, ne, w, s, r, l, _, T, E, D, O, k, A, j, M, N, P, F, I, L, R, B, V, U, W, G, oe, se, K, q, J, Y, X, Z, Q, $ };
