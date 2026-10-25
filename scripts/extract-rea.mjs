import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dependencyRequire } from './dependencies.mjs';
import { assignmentTargets, indexReaModule } from './rea-index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = dependencyRequire();
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = createRequire(require.resolve('@babel/traverse'))('@babel/types');
const manifest = JSON.parse(await readFile(resolve(root, 'vendor/build-inputs/rea/manifest.json'), 'utf8'));
const packed = dirname(manifest.records[0].source);
const originals = new Map(manifest.records.map(record => [basename(record.source), record]));
const modules = new Map();
const overrides = JSON.parse(await readFile(resolve(root, 'src/client/rea-boundaries.json'), 'utf8'));
const boundary = (file, name) => Object.hasOwn(overrides, file) && Object.hasOwn(overrides[file], name) ? overrides[file][name] : undefined;
// Rebuild one existing closure per process without loading every dependency AST.
// New cross-module edges still require full extraction; only retained locals change.
const requested = process.argv.slice(2);
if (requested.length && (requested[0] !== '--rebuild-existing' || requested.length !== 2)) throw new Error('Usage: extract-rea.mjs [--rebuild-existing <module.js>] (one module per process)');
const rebuild = requested.length ? new Set(requested.slice(1)) : null;
const previous = rebuild ? JSON.parse(await readFile(resolve(root, 'src/client/rea/provenance.json'), 'utf8')) : [];
const previousImports = new Map();
if (rebuild) for (const file of rebuild) {
  const prior = previous.find(record => record.file === file), original = originals.get(file);
  if (basename(file) !== file || !prior) throw new Error(`Not an existing REA module: ${file}`);
  if (!original || original.sha256 !== prior.sha256) throw new Error(`REA original/provenance mismatch: ${file}`);
  const ast = parse(await readFile(resolve(root, 'src/client/rea', file), 'utf8'), { sourceType: 'module' });
  previousImports.set(file, new Map(ast.program.body.filter(node => t.isImportDeclaration(node)).flatMap(node => node.specifiers.map(specifier => [specifier.local.name, specifier.imported?.name]))));
}

async function load(file) {
  if (modules.has(file)) return modules.get(file);
  let record = originals.get(file);
  let source = await readFile(record ? resolve(root, record.vendor) : resolve(packed, file), 'utf8');
  const sha256 = createHash('sha256').update(source).digest('hex');
  if (record && sha256 !== record.sha256) throw new Error(`REA original changed: ${record.vendor}`);
  if (!record) {
    record = { source: resolve(packed, file), sha256, vendor: `vendor/build-inputs/rea/${sha256}-${file}`, symbols: [] };
    await writeFile(resolve(root, record.vendor), source);
    manifest.records.push(record); originals.set(file, record);
  }
  if (file === 'local-conversation-thread-6508b6dc26ad.js') {
    const start = source.indexOf('function tT(){'), body = source.indexOf('if(!h||!g||!s||m)return null;', start);
    if (start < 0 || body < 0) throw new Error('REA monitoring menu host inputs changed');
    source = source.slice(0, start) + 'function tT({sessionId:i,active:s,shown:c,layout:u,service:t}){let e=(0,nT.c)(24),n=Ai(),_=t.platform,y=e=>t.setPlacement(i,e);' + source.slice(body);
    const end = source.indexOf('function aT()', start);
    let menu = source.slice(start, end);
    for (const [before, after] of [
      ['if(!h||!g||!s||m)return null;', 'if(!s)return null;'],
      ['bu(t,i)', 't.hideTask(i)'], ['xm(t)', 't.hideForAllActiveTasks()'], ['Uf(t,i)', 't.showTask(i)'],
      ['_===`macOS`&&u?.activeThreadID===i', 't.supportsPlacement&&u?.activeThreadID===i'],
      ['u.placement===`pet`?null:', 'true?null:'],
      ['T=(0,iT.jsx)(Yw,{})', 'T=null'],
    ]) {
      if (!menu.includes(before)) throw new Error(`REA monitoring menu adaptation changed: ${before}`);
      menu = menu.replace(before, after);
    }
    source = source.slice(0, start) + menu + source.slice(end);
  }
  if (file === 'remote-hosted-pip-anchor-bridge-173ba37b33ec.js') {
    const before = 'function i({homeSurfaceRect:e,hostId:t,hostRect:n,isCodexHomeAvailable:r,obstacleRects:i}){let s=';
    if (!source.includes(before)) throw new Error('REA monitor geometry inputs changed');
    source = source.replace(before, 'function i({homeSurfaceRect:e,hostId:t,hostRect:n,isCodexHomeAvailable:r,obstacleRects:i,presentationSize:q}){T=q??{height:250,width:250};let s=');
  }
  if (file === 'browser-address-suggestion-overlay-185e242f325f.js') {
    const before = 'document.getElementById(t)?.scrollIntoView';
    if (!source.includes(before)) throw new Error('REA address suggestion portal changed');
    source = source.replace(before, 's.findBrowserAddressSuggestion(t)?.scrollIntoView');
  }
  if (file === 'app-initial-c468e3fd7f91.js') {
    const viewerStart = source.indexOf('function _ii('), viewerEnd = source.indexOf('function vii(', viewerStart);
    let viewer = source.slice(viewerStart, viewerEnd);
    const inputs = 'i=Di(ws),a=G(CS),o=G(Cii),s=zd(),c=Zs(wP,`toggleMaximizeSidePanel`)';
    const actionStart = viewer.indexOf('let u=l,d;'), actionEnd = viewer.indexOf('let f=', actionStart);
    if (viewerStart < 0 || viewerEnd < viewerStart || !viewer.includes(inputs) || actionStart < 0 || actionEnd < actionStart) throw new Error('REA viewer full-width control changed');
    viewer = viewer.slice(0, actionStart) + 'let u=l;if(!o&&!a)return null;' + viewer.slice(actionEnd);
    viewer = viewer.replace(inputs, 'pane=Host.usePaneLayout(),a=pane?.fullscreen===true,o=pane?.canExpand===true,s=zd(),c=void 0');
    viewer = viewer.replace('(0,bii.c)(19)', '(0,bii.c)(20)');
    viewer = viewer.replace('t[8]!==a||t[9]!==u||t[10]!==p?', 't[8]!==a||t[9]!==u||t[10]!==p||t[19]!==pane.toggle?');
    viewer = viewer.replace('t[11]=m):m=t[11]', 't[11]=m,t[19]=pane.toggle):m=t[11]');
    viewer = viewer.replace('onClick:vii', 'onClick:pane.toggle');
    source = source.slice(0, viewerStart) + viewer + source.slice(viewerEnd);
    const start = source.indexOf('function oDi('), end = source.indexOf('var sDi,', start);
    if (start < 0 || end < start) throw new Error('REA notification provider changed');
    source = source.slice(0, start) + 'function oDi({children}){let scope=Di(q),id=pW.useId(),portal=pW.useContext(Host.ReaPortalContext),[toaster]=pW.useState(()=>kEe(id,HBe));pW.useLayoutEffect(()=>{let release=WQe(scope,toaster),global=portal?Host.registerNotificationHost(toaster,BOe):()=>{};return()=>{release();global();};},[scope,toaster,portal]);return (0,mW.jsxs)(mW.Fragment,{children:[(0,mW.jsx)(aDi,{toasterId:id,toaster}),children]});}' + source.slice(end);
    const before = '{toasterId:n,toaster:r}=e,i=G(pne);G(Xjn),G(ete);';
    if (!source.includes(before)) throw new Error('REA notification host geometry changed');
    source = source.replace(before, '{toasterId:n,toaster:r}=e,i=0,hostPortal=Host.React.useContext(Host.ReaPortalContext);');
    const toastStart = source.indexOf('function aDi('), toastEnd = source.indexOf('function oDi(', toastStart);
    let toast = source.slice(toastStart, toastEnd);
    for (const [before, after] of [
      ['(0,sDi.c)(22)', '(0,sDi.c)(23)'],
      ['c={inset:0}', 'c={inset:0,position:`fixed`,zIndex:60,pointerEvents:`none`}'],
      ['style:c,children:h', 'style:c,ref:Host.protectReaCarrier,children:h'],
      ['t[19]!==h||t[20]!==c?', 't[19]!==h||t[20]!==c||t[22]!==hostPortal?'],
      ['}),document.body),t[19]=h,t[20]=c,t[21]=g)', '}),hostPortal),t[19]=h,t[20]=c,t[21]=g,t[22]=hostPortal)'],
    ]) {
      if (!toast.includes(before)) throw new Error(`REA notification portal boundary changed: ${before}`);
      toast = toast.replace(before, after);
    }
    source = source.slice(0, toastStart) + toast + source.slice(toastEnd);
    const menuStart = source.indexOf('function zfa('), forkStart = source.indexOf('let u=gd(e.value);', menuStart), forkEnd = source.indexOf('Vfa(c)!=null', forkStart);
    if (menuStart < 0 || forkStart < 0 || forkEnd < forkStart) throw new Error('REA browser tab menu boundary changed');
    source = source.slice(0, forkStart) + source.slice(forkEnd);
    const newStart = source.indexOf('function Bfa('), newEnd = source.indexOf('function Vfa(', newStart);
    if (newStart < 0 || newEnd < newStart) throw new Error('REA new browser tab boundary changed');
    source = source.slice(0, newStart) + 'function Bfa(_scope,{browserInitialUrl:url,browserConversationId:conversationId,browserTabId}){return Host.services.browserHost.newTab({conversationId,browserTabId,url:url||`about:blank`});}' + source.slice(newEnd);
    for (const [before, after] of [
      ['onSelect:()=>{Bfa(e,{browserConversationId:t,browserHostDisplayName:n,browserTabId:r,cwd:i,target:a.panelId})}', 'onSelect:()=>Bfa(e,{browserConversationId:t,browserHostDisplayName:n,browserTabId:r,cwd:i,target:a.panelId})'],
      ['onSelect:()=>{Hfa(e,{browserConversationId:t,browserHostDisplayName:n,browserTabId:r,cwd:i,target:a.panelId})}', 'onSelect:()=>Hfa(e,{browserConversationId:t,browserHostDisplayName:n,browserTabId:r,cwd:i,target:a.panelId})'],
      ['s.cloneTab({active:!0,browserHostDisplayName:n,browserTabId:r,conversationId:t,cwd:i,navigation:`reload`}).catch(()=>void 0);return', 'return s.cloneTab({active:!0,browserHostDisplayName:n,browserTabId:r,conversationId:t,cwd:i,navigation:`reload`})'],
      ['}Bfa(e,{browserInitialUrl:o?.url??``', '}return Bfa(e,{browserInitialUrl:o?.url??``'],
    ]) {
      if (!source.includes(before)) throw new Error(`REA tab action boundary changed: ${before}`);
      source = source.replace(before, after);
    }
  }
  if (file === 'app-shared-2f2228189a8d.js') {
    // These original carriers retain native guests in document.body. Their
    // geometry and hit transparency cannot depend on the host's utility CSS.
    for (const [name, variable, browser] of [['MRi', 't', false], ['zRi', 'n', true]]) {
      const start = source.indexOf(`function ${name}(`), end = source.indexOf('function ', start + 10);
      let body = source.slice(start, end);
      const existing = browser ? 'if(t!=null)return t;' : 'if(e!=null)return e;';
      const previous = browser ? 't' : 'e';
      const append = browser ? 'e.append(n)' : 'document.body.append(t)';
      if (start < 0 || end < start || !body.includes(existing) || !body.includes(append)) throw new Error(`REA guest carrier changed: ${name}`);
      body = body.replace(existing, `if(${previous}!=null)return Host.prepareReaGuestRoot(${previous},${browser}),${previous};`)
        .replace(append, `Host.prepareReaGuestRoot(${variable},${browser}),${append}`);
      source = source.slice(0, start) + body + source.slice(end);
    }
  }
  if (file === 'mcp-tool-item-content-f32f64d93b42.js') {
    const start = source.indexOf('function ka(');
    const anchor = 'image:{kind:`generic`,src:c,alt:u},intl:o';
    if (start < 0 || !source.slice(start).includes(anchor)) throw new Error('REA tool image attachment boundary changed');
    source = source.slice(0, start) + source.slice(start).replace(anchor, 'image:{kind:`generic`,src:c,alt:u,opencuAttachment:n.attachment,opencuSessionId:r},intl:o');
    const cache = 't[5]!==r||t[6]!==i||t[7]!==u||t[8]!==c||t[9]!==o||t[10]!==a?';
    if (!source.includes(cache)) throw new Error('REA tool image menu cache changed');
    source = source.replace('function ka(e){let t=(0,Pa.c)(74)', 'function ka(e){let t=(0,Pa.c)(75)');
    source = source.replace(cache, 't[74]!==n.attachment||' + cache);
    source = source.replace('t[11]=d):d=t[11]', 't[11]=d,t[74]=n.attachment):d=t[11]');
  }
  if (file === 'generated-image-context-menu-5a2f4e49515e.js') {
    const open = '(async()=>{let n=T==null', add = 'if(l?.()===!1)return;';
    if (!source.includes(open) || !source.includes(add)) throw new Error('REA image menu host actions changed');
    source = source.replace(open, '(async()=>{if(o.opencuAttachment){await Host.services.images.open(o.opencuAttachment,o.opencuSessionId);_?.();return;}let n=T==null');
    source = source.replace(add, add + 'if(o.opencuAttachment){Host.services.images.add(o.opencuAttachment,o.opencuSessionId).then(()=>d?.()).catch(error=>e.get(f).danger(error.message));return;}');
    const download = 'if(m!=null){m().catch(n);return}';
    if (!source.includes(download)) throw new Error('REA image download boundary changed');
    source = source.replace(download, 'if(o.opencuAttachment){h?.();Host.services.images.saveCopy(o.opencuAttachment).then(result=>{if(result.path)g?.();}).catch(n);return;}' + download);
  }
  if (file === 'annotation-comment-editor-card-788d882d42ad.js') {
    for (const [before, after] of [
      ['xe=M(`2460218704`)', 'xe=a.siteAnnotationFeaturesEnabled!==false'],
      ['K.view.dom.ownerDocument.activeElement', 'Host.activeReaElement()'],
      ['w.document.activeElement', 'Host.activeReaElement()'],
      ['previewPortalContainer:w?.document.body??null', 'previewPortalContainer:Host.reaPortalContainer(w?.document.body??document.body,K.view.dom)'],
      ['ti=w?.document.body===document.body?null:w?.document.body??null', 'ti=Host.reaPortalContainer(w?.document.body??document.body,K.view.dom)'],
    ]) {
      if (!source.includes(before)) throw new Error(`REA annotation editor host input changed: ${before}`);
      source = source.replaceAll(before, after);
    }
  }
  if (file === 'input-fe3a757b270a.js') {
    for (const [before, after] of [
      ['document.getElementById(D)', 'Host.findReaElement(D,i.current)'],
      ['document.getElementById(e)', 'Host.findReaElement(e,i.current)'],
      ['e.target===i.current||e.target instanceof Node&&a?.contains(e.target)', 'e.composedPath().includes(i.current)||e.composedPath().some(node=>node instanceof Node&&a?.contains(node))'],
    ]) {
      if (!source.includes(before)) throw new Error(`REA address input shadow host changed: ${before}`);
      source = source.replace(before, after);
    }
    source = source.replaceAll('document.activeElement', 'Host.activeReaElement()');
  }
  if (file === 'editor-ea825d60e97b.js') {
    for (const before of ['D.ownerDocument.activeElement']) {
      if (!source.includes(before)) throw new Error('REA markup editor focus changed');
      source = source.replaceAll(before, 'Host.activeReaElement()');
    }
  }
  if (file === 'tab-content-6a1dfa5c5ac1.js') {
    source = source.replaceAll('document.activeElement', 'Host.activeReaElement()');
  }
  if (file === 'artifact-source-bootstrap-f0e1f54dfa8f.js') {
    for (const [before, after] of [
      ['this.#i.ownerDocument.activeElement===this.#a.textarea', 'Host.activeReaElement()===this.#a.textarea'],
      ['let e=this.#i.ownerDocument;if(!this.#j()){e.activeElement===this.#a.textarea&&this.#a.blur();return}let t=e.activeElement;',
        'let e=this.#i.ownerDocument;if(!this.#j()){Host.activeReaElement()===this.#a.textarea&&this.#a.blur();return}let t=Host.activeReaElement();'],
    ]) {
      if (!source.includes(before)) throw new Error('REA canvas text input focus changed');
      source = source.replaceAll(before, after);
    }
  }
  if (file === 'artifact-tab-content.electron-64a58871ee86.js') {
    const before = 'e!=null&&g(e),clearTimeout(c),l&&!f&&h();';
    if (!source.includes(before)) throw new Error('REA presentation save retry boundary changed');
    source = source.replace(before, 'e!=null&&g(e),clearTimeout(c),l&&(f=!1,h());');
  }
  if (file === 'browser-use-settings-61138c2e595e.js') {
    const start = source.indexOf('function fa(){'), end = source.indexOf('let O;', start);
    if (start < 0 || end < start) throw new Error('REA browser settings input boundary changed');
    source = source.slice(0, start) + 'function fa(){let e=(0,Q.c)(46),{capabilities:a,available:h,siteTools:S}=Host.useBrowserSettingsInputs(),g=a.passwordManager.enabled,_=a.contactInfo.enabled,v=g||_,y=a.siteSettings.enabled,b=a.extensions.enabled,C=y||S,s={available:h},u=false,D=(0,$.jsx)(J,{children:(0,$.jsx)(J.Content,{children:(0,$.jsx)(Host.BrowserControls,{})})});' + source.slice(end);
    source = source.replace('r=ba(),{selectedHostId:i}=on(),a;', 'r=ba(),i=`local`,a;');
    source = source.replace('function xa(e){switch(e){', 'function xa(e){if([`contactInfo`,`passwordManager`,`siteSettings`,`extensions`].includes(e))return (0,$.jsx)(Host.BrowserSettingsSubpage,{kind:e});switch(e){');
    source = source.replace('t=C(D),n=Cn(),r,i;', 't=C(D),n=rt(ht.openLinkInTargetPreference),r,i;');
    source = source.replace('Mt(t,Me.annotationScreenshotsMode,e.id)}', 'Mt(t,Me.annotationScreenshotsMode,e.id).catch(error=>t.get(le).danger(error.message))}');
    source = source.replace('Mt(t,Me.downloadDirectory,null)}', 'Mt(t,Me.downloadDirectory,null).catch(error=>t.get(le).danger(error.message))}');
    source = source.replace('Mt(t,Me.promptForDownloadLocation,e)}', 'Mt(t,Me.promptForDownloadLocation,e).catch(error=>t.get(le).danger(error.message))}');
    for (const key of ['openLinkInTargetPreference', 'openLocalUrlInTargetPreference']) {
      const before = `Mt(t,ht.${key},e),st(`;
      if (!source.includes(before)) throw new Error(`REA link preference save changed: ${key}`);
      source = source.replace(before, `Mt(t,ht.${key},e).catch(error=>t.get(le).danger(error.message)),st(`);
    }
  }
  if (file === 'computer-use-settings-615f56c63d73.js') {
    const start = source.indexOf('function Vr(){'), end = source.indexOf('let p,m;', start);
    if (start < 0 || end < start) throw new Error('REA computer settings input boundary changed');
    source = source.slice(0, start) + 'function Vr(){let e=(0,Q.c)(26),{availability:i,platform:o,lockedUse:n,allowedApps,sounds}=Host.useComputerSettingsInputs();' + source.slice(end);
    source = source.replace('(0,$.jsx)(Hr,{computerUseAvailability:i,platform:o})', '(0,$.jsx)(Host.ComputerControls,{})');
    source = source.replace('e[21]===i.available?y=e[22]:(y=i.available?', 'e[21]===allowedApps?y=e[22]:(y=allowedApps?');
    source = source.replace('(0,$.jsx)(ri,{})]}):null,e[21]=i.available', 'sounds?(0,$.jsx)(ri,{}):null]}):null,e[21]=allowedApps');
    const connectionStart = source.indexOf('function ti('), connectionEnd = source.indexOf('function ni(', connectionStart);
    let connection = source.slice(connectionStart, connectionEnd);
    const inputsEnd = connection.indexOf('if(f&&h==null)');
    if (connectionStart < 0 || connectionEnd < connectionStart || inputsEnd < 0) throw new Error('REA browser connection inputs changed');
    connection = 'function ti(){let t=(0,Q.c)(45),{isLoading:f,connected:g,status:x,service:C,title:y}=Host.useBrowserConnectionInputs(),n=`chrome`,r=v(ee),i=false,h=g?{}:null;' + connection.slice(inputsEnd);
    const redirectStart = connection.indexOf('if(!f&&!g&&!x.isLoading&&!x.isInstalled)'), redirectEnd = connection.indexOf('let w;', redirectStart);
    if (redirectStart < 0 || redirectEnd < redirectStart) throw new Error('REA browser connection redirect changed');
    connection = connection.slice(0, redirectStart) + connection.slice(redirectEnd);
    connection = connection.replace('(0,$.jsx)($r,{browserFamily:n,storeUrl:x.installUrl,children:w})', '(0,$.jsx)(Host.ConnectionInstallButton,{})');
    connection = connection.replace('(0,$.jsx)(ni,{installed:x.isInstalled})', '(0,$.jsx)(Host.ConnectionStatus,{connected:g})');
    connection = connection.replace('(0,$.jsx)(Fn,{backend:`chrome`,showWebMcp:i})', '(0,$.jsx)(Host.BrowserConnectionControls,{})');
    // Install and disconnect actions belong beside their steps or connected profiles.
    connection = connection.replace('action:j,backSlot:M', 'action:null,backSlot:M');
    source = source.slice(0, connectionStart) + connection + source.slice(connectionEnd);
  }
  if (file === 'computer-use-app-approval-request-card-82a4252ecef7.js') {
    const reply = 'C(f,c).replyWithMcpServerElicitationResponse(i,d,v(e,e===`accept`&&r!=null?{persist:r}:null))';
    if (!source.includes(reply)) throw new Error('REA computer application approval reply changed');
    source = source.replace(reply, 'Host.services.computerUseSettings.respondAppApproval({conversationId:i,requestId:d,action:e,persist:r})');
  }
  if (file === 'settings-plugin-controls-aa3e0c89c71f.js') {
    const start = source.indexOf('let f=d,p=k()'), end = source.indexOf('T=a.length+f.length;', start);
    if (start < 0 || end < start) throw new Error('REA settings list actions changed');
    source = source.slice(0, start) + 'let f=d,{openDetails:p,installPlugin:m,setPluginEnabled:y,uninstallPlugin:S,pendingPluginId:w}=Host.useSettingsPluginActions(),' + source.slice(end);
    const details = 'p(De(e,{hostId:c,breadcrumb:`settings`}))';
    if (!source.includes(details)) throw new Error('REA settings detail navigation changed');
    source = source.replace(details, 'p(e)');
    const permissionInputs = 'i=F(),a=l(r!==`iab`||Te),{data:o,isLoading:s}=l(qe),c=Be(),u;';
    if (!source.includes(permissionInputs)) throw new Error('REA site tools preference inputs changed');
    source = source.replace(permissionInputs, 'i=F(),{available:a,data:o,isLoading:s,mutation:c}=Host.useSiteToolsPreference(),u;');
    const policyStart = source.indexOf(',{selectedHostId:u}=ge(),d=E(We,u);', source.indexOf('function vt('));
    const policyEnd = source.indexOf('let f;', policyStart);
    if (policyStart < 0 || policyEnd < policyStart) throw new Error('REA browser permission platform boundary changed');
    source = source.slice(0, policyStart) + ';' + source.slice(policyEnd);
    source = source.replace('p=s?(0,Q.jsx)($e,{}):null', 'p=s?(0,Q.jsx)(Host.SiteToolsRules,{}):null');
  }
  if (file === 'browser-use-policy-site-permissions-2bd40069d7f2.js') {
    for (const [before, after] of [
      ['A=u(C!==`iab`||De)', 'A=e.webMcpAvailable===true'],
      ['supportsClearingDefaultsOnAdd:S}=e', 'supportsClearingDefaultsOnAdd:S,resources:hostResources}=e'],
      ['L=Mt(s,_)', 'L=hostResources??Mt(s,_)'],
      ['G=(0,$.jsxs)(`div`,{className:`flex flex-col gap-1.5`,children:[pe,', 'G=h.includes(`origin`)?(0,$.jsxs)(`div`,{className:`flex flex-col gap-1.5`,children:[pe,'],
      ['onSelect:C})]}),ne=D?h.map(', 'onSelect:C})]}):null,ne=D||!h.includes(`origin`)?h.map('],
    ]) {
      if (!source.includes(before)) throw new Error(`REA site permission resources changed: ${before}`);
      source = source.replace(before, after);
    }
  }
  const ast = parse(source, { sourceType: 'module' });
  const mod = { file, source, sha256, ast, defs: new Map(), imports: new Map(), exports: new Map(), owners: new Map(), selected: new Set(), init: new Set() };
  modules.set(file, mod);
  for (const node of ast.program.body) {
    if (t.isImportDeclaration(node)) for (const s of node.specifiers) mod.imports.set(s.local.name, { file: basename(node.source.value), name: s.imported?.name ?? 'default' });
    if (t.isExportNamedDeclaration(node)) for (const s of node.specifiers) mod.exports.set(s.exported.name, s.local.name);
  }
  indexReaModule(mod, { traverse, t, initBody });
  return mod;
}
const referenceCache = new WeakMap(), pieceCache = new WeakMap(), assignmentCache = new WeakMap();
function references(node) {
  if (referenceCache.has(node)) return referenceCache.get(node);
  const names = new Set();
  const wrapper = t.file(t.program([t.isStatement(node) ? t.cloneNode(node, true) : t.variableDeclaration('var', [t.cloneNode(node, true)])]));
  traverse(wrapper, {
    ReferencedIdentifier(p) { if (!p.scope.hasBinding(p.node.name)) names.add(p.node.name); },
    AssignmentExpression(p) { for (const name of assignmentTargets(p.node.left, t)) if (!p.scope.hasBinding(name)) names.add(name); },
  });
  referenceCache.set(node, names);
  return names;
}
function initBody(node) {
  const ret = node.body.body.find(t.isReturnStatement);
  const callback = ret?.argument?.callee?.right?.arguments?.find(n => t.isArrowFunctionExpression(n) || t.isFunctionExpression(n));
  return callback?.body;
}
function pieces(node) {
  if (pieceCache.has(node)) return pieceCache.get(node);
  const body = initBody(node);
  if (!body) return [];
  const result = [];
  for (const s of body.body) {
    if (t.isExpressionStatement(s) && t.isSequenceExpression(s.expression)) result.push(...s.expression.expressions.map(expression => t.expressionStatement(expression)));
    else result.push(s);
  }
  pieceCache.set(node, result);
  return result;
}
function assigned(node) {
  if (assignmentCache.has(node)) return assignmentCache.get(node);
  const names = new Set();
  traverse(t.file(t.program([t.cloneNode(node, true)])), { AssignmentExpression(p) { for (const name of assignmentTargets(p.node.left, t)) if (!p.scope.hasBinding(name)) names.add(name); } });
  assignmentCache.set(node, names);
  return names;
}
function selectedInitializer(mod, name, seen = new Set()) {
  if (mod.selected.has(name)) return true;
  const id = `${mod.file}:${name}`;
  if (seen.has(id)) return false;
  seen.add(id);
  const imported = mod.imports.get(name);
  if (imported) {
    const child = modules.get(imported.file), local = child?.exports.get(imported.name);
    return !!local && child.init.has(local) && selectedInitializer(child, local, seen);
  }
  if (!mod.init.has(name)) return false;
  return pieces(mod.defs.get(name)).some(piece => {
    const call = t.isExpressionStatement(piece) && piece.expression;
    return t.isCallExpression(call) && t.isIdentifier(call.callee) && selectedInitializer(mod, call.callee.name, seen);
  });
}
function retained(mod, node) {
  return pieces(node).filter(piece => {
    if ([...assigned(piece)].some(name => mod.selected.has(name) && !boundary(mod.file, name))) return true;
    const expression = t.isExpressionStatement(piece) && piece.expression;
    if (t.isCallExpression(expression) && t.isIdentifier(expression.callee)) return selectedInitializer(mod, expression.callee.name);
    // Conditional/global initialization is observable, even when no exported binding is assigned.
    return !t.isAssignmentExpression(expression) || !t.isIdentifier(expression.left);
  });
}
let changed = false;
async function select(mod, name) {
  if (mod.selected.has(name)) return;
  const override = boundary(mod.file, name);
  if (override) { mod.selected.add(name); changed = true; return; }
  if (mod.imports.has(name)) {
    if (rebuild) throw new Error(`Bounded REA rebuild needs a new import; run full extraction: ${mod.file}:${name}`);
    const imported = mod.imports.get(name);
    if (!imported.file.endsWith('.js')) throw new Error(`Unsupported REA import ${imported.file}`);
    const child = await load(imported.file);
    const local = child.exports.get(imported.name);
    if (!local) throw new Error(`Missing REA export ${imported.file}:${imported.name}`);
    mod.selected.add(name); changed = true;
    await select(child, local); return;
  }
  const node = mod.defs.get(name);
  if (!node) return; // Browser globals remain browser globals.
  mod.selected.add(name); changed = true;
  for (const owner of mod.owners.get(name) ?? []) await select(mod, owner);
  if (!mod.init.has(name)) for (const dependency of references(node)) await select(mod, dependency);
}
const roots = [
  ['app-shared-2f2228189a8d.js', ['tA', 'iA', 'oA', '_lt', 'X', 'SHe', 'CHe', 'plt', 'MLt', 'xNt', 'fft', 'Ult', '$$t', 'e1t', 'iMi', 'mMi']],
  ['tab-content-6a1dfa5c5ac1.js', ['sl', 'Il']],
  ['browser-address-suggestion-overlay-185e242f325f.js', ['he', 'ye']],
  ['app-initial-c468e3fd7f91.js', ['xfl', 'Ofl']],
  ['hidden-browser-use-webview-host-bdd4db5a6c73.js', ['p', 'b']],
  ['app-primary-5433e23a397e.js', ['VNt', 'HNt', 'UNt']],
  ['app-initial-c468e3fd7f91.js', ['Omc', 'P8n', 'Afa', 'H8n', 'Pfa', 'oDi', 'lDi', 'zfa', 'Gfa']],
  ['annotation-comment-editor-card-788d882d42ad.js', ['Zi', 'Ya']],
  ['annotation-editor-2d914a40819d.js', ['b', 'w']],
  ['annotation-editor-8063237bdf92.js', ['u', 'm']],
  ['local-conversation-thread-6508b6dc26ad.js', ['Fw', 'Bw', 'Jw', 'tT', 'aT']],
  ['remote-hosted-pip-anchor-bridge-173ba37b33ec.js', ['i', 'j']],
  ['cursor-chat-2be21330f98f.js', ['c', '$', 'Ne', 'Pe']],
  ['browser-use-settings-61138c2e595e.js', ['da', 'Va', 'Gr', 'ci', 'gi']],
  ['zh-CN-b05cfd55c534.js', ['ue', 'de']],
  ['image-side-panel-6c7023add54c.js', ['bo', 'Oo']],
  ['export-30081509394d.js', ['d', 'f']],
  ['mcp-tool-item-content-f32f64d93b42.js', ['xa', 'Ia']],
  ['settings-plugin-controls-aa3e0c89c71f.js', ['xt', 'Et', 'Ot', 'vt', 'bt']],
  ['computer-use-settings-615f56c63d73.js', ['Vr', 'Xr', 'Yr', 'xi', 'ti']],
  ['browser-extension-connection-status-description-fb2767d472db.js', ['c', 'f']],
  ['site-annotation-permission-dialog-5a46eeaa20cf.js', ['D', 'N']],
  ['artifact-preview-header-464ed5168662.js', ['Ze', 'tt', 'U']],
  ['docx-preview-panel-ce9d293c8160.js', ['en', 'Nn']],
  ['pdf-preview-panel-3b484c934828.js', ['jn', 'Wn']],
  ['notebook-preview-panel-3f8901f8935f.js', ['Se', '$']],
  ['artifact-tab-content.electron-64a58871ee86.js', ['Do', 'ns']],
  ['local-conversation-sources-side-panel-tab-ced36bc5770b.js', ['de', '$']],
  ['app-initial-c468e3fd7f91.js', ['nxn', 'rxn', 'ixn', 'oxn', 'Aml', 'Mml', 'V2s', 'W2s']],
  ['computer-use-app-approval-request-card-82a4252ecef7.js', ['w', 'T', 'E', 'A']],
  ['browser-use-policy-site-permissions-2bd40069d7f2.js', ['Zt', 'wn']],
];
const lazyFiles = new Set();
// Served data-only and standalone modules ship from lib/rea-assets as originals; no bundled copy is kept.
const served = new Set(JSON.parse(await readFile(resolve(root, 'scripts/lazy-grammars.json'), 'utf8')));
if (rebuild) {
  for (const file of rebuild) {
    const mod = await load(file);
    for (const name of previous.find(record => record.file === file).symbols) {
      if (!boundary(file, name) && !mod.imports.has(name) && !mod.defs.has(name)) throw new Error(`Original binding is missing: ${file}:${name}`);
      mod.selected.add(name);
    }
  }
  for (const file of JSON.parse(await readFile(resolve(root, 'src/client/rea/lazy-modules.json'), 'utf8'))) lazyFiles.add(file);
} else {
  for (const [file, names] of roots) { const mod = await load(file); for (const name of names) await select(mod, name); }
  const initial = await load('app-initial-c468e3fd7f91.js');
  const resourceFactories = ['uyt', 'pyt', 'JCt'].map(name => initial.defs.get(name)).filter(Boolean);
  for (const file of ['highlight-code-7c4c2ef3d4d8.js', 'lowlight-ac9e64ee8de6.js', 'lowlight-8c38fcddde20.js', 'wasm-7a831618ae1c.js', 'index.module-dcae5bed565a.js', 'decoder-f966011fa07a.js', 'docx-preview-8513c2dacad2.js', 'pdf-c29bb18a39db.js', 'workbook-panel-aa1c64a4a0e1.js', 'presentation-panel-2892de0b3010.js', 'workbook-a9ed5e9341c3.js', 'spreadsheet-a060a1e1b669.js', 'presentation-e38e6a3bf5bc.js', 'editor-ea825d60e97b.js']) lazyFiles.add(file);
  for (const node of resourceFactories) for (const match of initial.source.slice(node.start, node.end).matchAll(/import\(`\.\/([^`]+)`\)/g)) lazyFiles.add(match[1]);
  for (const file of lazyFiles) {
    const mod = await load(file);
    for (const name of mod.exports.values()) await select(mod, name);
    // Dynamic modules have their own top-level initialization, unlike imported lazy chunks.
    for (const node of mod.ast.program.body) if (t.isExpressionStatement(node)) for (const name of references(node)) await select(mod, name);
  }
}
do {
  changed = false;
  for (const mod of modules.values()) for (const name of [...mod.selected]) {
    if (boundary(mod.file, name) || mod.imports.has(name)) continue;
    if (rebuild && !mod.init.has(name)) for (const dependency of references(mod.defs.get(name))) await select(mod, dependency);
    if (!mod.init.has(name)) continue;
    const node = mod.defs.get(name);
    // Retain the lazy wrapper itself and only required original initialization edges.
    const ret = node.body.body.find(t.isReturnStatement);
    const factory = ret.argument.callee.right.callee;
    if (t.isIdentifier(factory)) await select(mod, factory.name);
    for (const piece of retained(mod, node)) for (const dependency of references(piece)) await select(mod, dependency);
  }
} while (changed);
// Keep dynamic public names separate from the internal names used by static imports.
const dynamicNamespaces = new Map();
if (rebuild) for (const file of lazyFiles) {
  if (served.has(file)) continue;
  if ((await readFile(resolve(root, 'src/client/rea', file), 'utf8')).includes('export const __opencuDynamicExports =')) dynamicNamespaces.set(file, []);
}
for (const mod of modules.values()) if (lazyFiles.has(mod.file)
  && [...mod.exports].some(([external, local]) => external !== local && mod.selected.has(external))) {
  if (mod.selected.has('__opencuDynamicExports')) throw new Error(`REA dynamic namespace name collision: ${mod.file}`);
  dynamicNamespaces.set(mod.file, [...mod.exports].filter(([, local]) => mod.selected.has(local)));
}

await mkdir(resolve(root, 'src/client/rea'), { recursive: true });
const provenance = [];
for (const mod of modules.values()) {
  const out = ['import * as Host from "../host-boundaries.mjs";'];
  const exports = [];
  const names = [...mod.selected].sort((a, b) => {
    const position = name => boundary(mod.file, name) || mod.imports.has(name) ? -1 : mod.defs.get(name)?.start ?? Infinity;
    return position(a) - position(b);
  });
  for (const name of names) {
    const override = boundary(mod.file, name);
    if (override) out.push(`const ${name} = ${override};`);
    else if (mod.imports.has(name)) {
      const imp = mod.imports.get(name), child = modules.get(imp.file), local = rebuild ? previousImports.get(mod.file).get(name) : child.exports.get(imp.name);
      if (!local) throw new Error(`Missing retained REA import: ${mod.file}:${name}`);
      out.push(`import { ${local} as ${name} } from ${JSON.stringify('./' + imp.file)};`);
    } else {
      const node = mod.defs.get(name);
      if (!node) continue;
      if (mod.init.has(name)) {
        const copy = t.cloneNode(node, true);
        initBody(copy).body = retained(mod, node).map(n => t.cloneNode(n, true));
        out.push(generate(copy, { compact: true }).code);
      } else out.push(t.isVariableDeclarator(node) ? `var ${mod.source.slice(node.start, node.end)};` : mod.source.slice(node.start, node.end));
    }
    exports.push(name);
  }
  if (mod.file === 'app-shared-2f2228189a8d.js') {
    const index = out.findIndex(source => source.startsWith('function A_()'));
    const expression = 'let o=n||i&&globalThis?.document?.body;';
    if (index < 0 || !out[index].includes(expression)) throw new Error('REA Radix portal host expression changed');
    out[index] = out[index].replace(expression, 'let host=tEe.useContext(Host.ReaPortalContext),o=n||i&&(host??globalThis?.document?.body);');
    const autocomplete = out.findIndex(source => source.startsWith('function nqi('));
    const autocompletePortal = '(0,cqi.createPortal)(ee,T.portalContainer)';
    if (autocomplete < 0 || !out[autocomplete].includes(autocompletePortal)) throw new Error('REA autocomplete portal changed');
    out[autocomplete] = out[autocomplete].replace(autocompletePortal, '(0,cqi.createPortal)(ee,Host.reaPortalContainer(T.portalContainer,n?.current??a?.element??r?.view.dom))');
    const capability = out.findIndex(source => source.startsWith('function e5()'));
    const gate = '$8=Gk(X,(e,{get:t})=>{';
    if (capability < 0 || !out[capability].includes(gate)) throw new Error('REA browser capability boundary changed');
    out[capability] = out[capability].replace(gate, `${gate}let host=Host.browserCapability(e);if(host!=null)return host;`);
    const flags = out.findIndex(source => source.startsWith('function VK()'));
    const extensionGate = 'zK=Uk(X,(e,{get:t})=>t(IK)?.getFeatureGate';
    if (flags < 0 || !out[flags].includes(extensionGate)) throw new Error('REA extension capability gate changed');
    out[flags] = out[flags].replace(extensionGate, 'zK=Uk(X,(e,{get:t})=>e===`2982604767`?Host.services.browserHost?.extensionsAvailable===true:t(IK)?.getFeatureGate');
    const guest = out.findIndex(source => source.startsWith('function SBi()'));
    for (const [method, next, replacement] of [
      ['attachToDom(e=zRi()){', 'syncStagedCoverStyle(){', 'attachToDom(e=zRi()){Host.attachBrowserGuest(this,e);}'],
      ['placeImmediatelyBehind(e){', 'listenForDidRegister(e){', 'placeImmediatelyBehind(e){Host.orderBrowserGuestBehind(this,e);}'],
    ]) {
      const start = out[guest]?.indexOf(method), end = out[guest]?.indexOf(next, start);
      if (!(start >= 0 && end > start)) throw new Error(`REA Electron guest boundary changed: ${method}`);
      out[guest] = out[guest].slice(0, start) + replacement + out[guest].slice(end);
    }
  }
  if (mod.file === 'annotation-editor-2d914a40819d.js') {
    const index = out.findIndex(source => source.startsWith('function b('));
    const dialog = '(0,C.jsxs)(r,{open:!0,';
    if (index < 0 || !out[index].includes(dialog)) throw new Error('REA composer annotation dialog boundary changed');
    out[index] = out[index].replace(dialog, '(0,C.jsxs)(Host.ReferenceEditorDialog,{Dialog:r,open:!0,');
  }
  if (mod.file === 'editor-ea825d60e97b.js') {
    const index = out.findIndex(source => source.startsWith('function ut('));
    const dialog = '(0,gt.jsx)(Ae,{onDiscard:';
    if (index < 0 || !out[index].includes(dialog)) throw new Error('REA markup discard dialog boundary changed');
    out[index] = out[index].replace(dialog, '(0,gt.jsx)(Host.ImageMarkupDiscardDialog,{Dialog:Ae,onDiscard:');
  }
  if (mod.file === 'notebook-preview-panel-3f8901f8935f.js') {
    const decoder = out.findIndex(source => source.startsWith('function je(e){let t=atob(e),'));
    if (decoder < 0) throw new Error('REA notebook byte source boundary changed');
    out[decoder] = out[decoder].replace('function je(e){', 'function je(e){const bytes=Host.documentSourceBytes(e);if(bytes!==void 0)return bytes;');
  }
  if (mod.file === 'document-da61479b7b62.js') {
    const decoder = out.findIndex(source => source.startsWith('function s(e){let t=e.indexOf(`base64,`);'));
    if (decoder < 0) throw new Error('REA PDF byte source boundary changed');
    out[decoder] = out[decoder].replace('function s(e){', 'function s(e){const bytes=Host.documentSourceBytes(e);if(bytes!==void 0)return bytes;');
    const index = out.findIndex(source => source.startsWith('function a('));
    const ready = 'i=new Worker(p,{type:`module`}),i.addEventListener(`error`,h),c=t.PDFWorker.create({port:i})';
    if (index < 0 || !out[index].includes(ready)) throw new Error('REA PDF worker startup changed');
    out[index] = out[index].replace(ready, 'i=new Worker(p,{type:`module`}),i.addEventListener(`error`,h),await Host.waitForPdfWorker(i,workerLifetime.signal);if(e)return;c=t.PDFWorker.create({port:i})');
    for (const [before, after] of [
      ['let e=!1,t=!1,r=null,i=null,c=null,l=null;', 'let e=!1,t=!1,r=null,i=null,c=null,l=null;const workerLifetime=new AbortController();'],
      ['if(!t){t=!0,i?.removeEventListener', 'if(!t){t=!0,workerLifetime.abort(),i?.removeEventListener'],
      ['catch{h()}', 'catch(error){if(!e){console.error(`OpenCU PDF renderer`,error);h()}}'],
    ]) {
      if (!out[index].includes(before)) throw new Error(`REA PDF lifecycle changed: ${before}`);
      out[index] = out[index].replace(before, after);
    }
  }
  if (mod.file === 'app-primary-5433e23a397e.js') {
    const index = out.findIndex(source => source.startsWith('function Stt('));
    if (index >= 0) {
      const mount = 'portalContainer:r?.ownerDocument.body??null';
      if (!out[index].includes(mount)) throw new Error('REA document annotation portal changed');
      out[index] = out[index].replace(mount, 'portalContainer:Host.React.useContext(Host.ReaPortalContext)??r?.ownerDocument.body??null');
    }
  }
  if (mod.file === 'app-initial-c468e3fd7f91.js') {
    const store = out.findIndex(source => source.startsWith('function jW()'));
    const before = 'this.browserUseActiveTabKeys.add(r),i||this.browserUseCursorStates.delete(r)):(this.browserUseActiveTabKeys.delete(r),o!=null&&this.browserUseCursorStates.set(r,{visible:!1,x:o.x,y:o.y}))';
    if (store < 0 || !out[store].includes(before)) throw new Error('REA browser activity/cursor lifecycle changed');
    out[store] = out[store].replace(before, 'this.browserUseActiveTabKeys.add(r)):this.browserUseActiveTabKeys.delete(r)');
  }
  if (mod.file === 'cursor-chat-2be21330f98f.js') {
    const index = out.findIndex(source => source.startsWith('function c('));
    for (const [before, after] of [
      ['glowColor:i,onArrived:a}', 'glowColor:i,onArrived:a,onHidden:hideDone}'],
      ['b(o,t),r&&x(),te(t)&&S()', 'b(o,t),t.visibilitySpring.target===0&&t.visibilitySpring.value===0&&fe(t.visibilitySpring)&&hideDone?.(),r&&x(),te(t)&&S()'],
      // Preserve the original think motion on a repeated render, and enter that
      // same motion when a new sequenced move arrives without displacement.
      ['f.thinkStartedAt=null;let ee=t(f.point,i)', 'p!==g&&(f.thinkStartedAt=null);let ee=t(f.point,i)'],
      ['f.stretchSpring.velocity=0),b(o,f),x(),S()', 'f.stretchSpring.velocity=0),a&&s&&p!==g&&(f.thinkStartedAt=F()),b(o,f),x(),S()'],
    ]) {
      if (index < 0 || !out[index].includes(before)) throw new Error('REA cursor visibility completion boundary changed');
      out[index] = out[index].replace(before, after);
    }
  }
  if (mod.file === 'tab-content-6a1dfa5c5ac1.js') {
    const cursor = out.findIndex(source => source.startsWith('function Hc('));
    const visibility = 'u=a&&(l!=null||!i)';
    if (cursor < 0 || !out[cursor].includes(visibility)) throw new Error('REA browser cursor visibility changed');
    out[cursor] = out[cursor].replace(visibility, 'u=l?.visible===!0||a&&(l==null&&!i)');
    out.unshift('import { D as SiteAnnotationPermissionDialog, N as initializeSiteAnnotationPermission } from "./site-annotation-permission-dialog-5a46eeaa20cf.js";');
    const index = out.findIndex(source => source.startsWith('function Il()'));
    const start = out[index]?.indexOf('Pl=tt(async()'), end = out[index]?.indexOf(';Fl=', start);
    if (!(start >= 0 && end > start)) throw new Error('REA site annotation permission loader changed');
    out[index] = out[index].slice(0, start) + 'initializeSiteAnnotationPermission();Pl=SiteAnnotationPermissionDialog' + out[index].slice(end);
    const siteMenu = out.findIndex(source => source.startsWith('function tl('));
    for (const [before, after] of [
      ['u=_e(xn,e.open&&e.canUseWebMcp?e.sourcesConversationId??null:null)', 'u=Host.useSiteToolCalls(e.sourcesConversationId)'],
      ['So(u).filter(e=>e.kind===`invokeTool`', 'u.filter(e=>e.kind===`invokeTool`'],
    ]) {
      if (!out[siteMenu]?.includes(before)) throw new Error('REA site tools history boundary changed');
      out[siteMenu] = out[siteMenu].replace(before, after);
    }
    const panel = out.findIndex(source => source.startsWith('function sl('));
    const trailing = 'trailing:Bu';
    if (!out[panel]?.includes(trailing)) throw new Error('REA browser toolbar trailing controls changed');
    out[panel] = out[panel].replace(trailing, 'trailing:(0,$.jsx)(Host.BrowserWindowAction,{conversationId:s,browserTabId:c,children:Bu})');
    for (const [before, after] of [
      ['xt=m(vr),{data:St}=m(Fa)', 'xt=Je?.browserHost?.available===true,St=null'],
      ['It=xt&&Ct!=null&&St!=null&&x(G.url,St)===`allowed`', 'It=xt&&Ct!=null'],
    ]) {
      if (!out[panel]?.includes(before)) throw new Error('REA site tools platform capability changed');
      out[panel] = out[panel].replace(before, after);
    }
  }
  if (mod.file === 'local-conversation-sources-side-panel-tab-ced36bc5770b.js') {
    const index = out.findIndex(source => source.startsWith('function de('));
    if (index < 0 || !out[index].includes('C=r(M),w;')) throw new Error('REA sources capability boundary changed');
    out[index] = out[index].replace('C=r(M),w;', 'C=Host.useSiteToolSources(),w;');
  }
  if (mod.file === 'browser-use-settings-visibility-ed679f465e35.js') {
    const index = out.findIndex(source => source.startsWith('function S('));
    if (index < 0) throw new Error('REA browser settings capability boundary changed');
    out[index] = 'function S(){return Host.useBrowserSettingsCapabilities();}';
  }
  if (mod.file === 'browser-use-origin-state-queries-45a49287b574.js') {
    const index = out.findIndex(source => source.startsWith('async function q('));
    if (index < 0) throw new Error('REA browser data command changed');
    out[index] = 'async function q(dataTypes){return Host.services.browsingHistory.clearBrowsingData({dataTypes:dataTypes.map(type=>type===`cookies`?`siteData`:type),timeRange:`allTime`});}';
  }
  if (mod.file === 'browser-clear-browsing-data-dialog-view-a2ab4c91f88e.js') {
    const index = out.findIndex(source => source.startsWith('function Ze('));
    const expression = 'switch(e){';
    if (index < 0 || !out[index].includes(expression)) throw new Error('REA browsing data capability boundary changed');
    out[index] = out[index].replace(expression, 'if(Object.hasOwn(t,e))return t[e];switch(e){');
  }
  if (lazyFiles.has(mod.file)) {
    for (const node of mod.ast.program.body) if (t.isExpressionStatement(node)) out.push(mod.source.slice(node.start, node.end));
    const aliases = [...mod.exports].filter(([external, local]) => external !== local && !exports.includes(external) && mod.selected.has(local));
    if (aliases.length) out.push(`export { ${aliases.map(([external, local]) => `${local} as ${external}`).join(', ')} };`);
  }
  const namespace = dynamicNamespaces.get(mod.file);
  if (namespace) out.push(`export const __opencuDynamicExports = Object.freeze({ ${namespace.map(([external, local]) => `get [${JSON.stringify(external)}]() { return ${local}; }`).join(', ')} });`);
  out.push(`export { ${exports.join(', ')} };`);
  let output = out.join('\n') + '\n';
  if ([...dynamicNamespaces.keys()].some(file => output.includes(file))) {
    const imports = [];
    traverse(parse(output, { sourceType: 'module' }), { CallExpression(path) {
      if (!t.isImport(path.node.callee)) return;
      const argument = path.node.arguments[0];
      const file = t.isStringLiteral(argument) ? argument.value
        : t.isTemplateLiteral(argument) && !argument.expressions.length ? argument.quasis[0].value.cooked : null;
      if (file?.startsWith('./') && dynamicNamespaces.has(file.slice(2))) imports.push(path.node.end);
    } });
    for (const end of imports.sort((a, b) => b - a)) output = output.slice(0, end) + '.then(module => module.__opencuDynamicExports)' + output.slice(end);
  }
  if (!served.has(mod.file)) await writeFile(resolve(root, 'src/client/rea', mod.file), output);
  provenance.push({ file: mod.file, source: originals.get(mod.file)?.vendor ?? resolve(packed, mod.file), sha256: mod.sha256, symbols: exports, lazyInitializers: [...mod.init].filter(n => mod.selected.has(n)), hostBoundaries: Object.keys(overrides[mod.file] ?? {}).filter(n => mod.selected.has(n)) });
}
if (!rebuild) {
  await writeFile(resolve(root, 'vendor/build-inputs/rea/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(resolve(root, 'src/client/rea/lazy-modules.json'), JSON.stringify([...lazyFiles], null, 2) + '\n');
}
await writeFile(resolve(root, 'src/client/rea/provenance.json'), JSON.stringify(rebuild ? previous.map(record => provenance.find(next => next.file === record.file) ?? record) : provenance, null, 2));
console.log(`REA dependency closure: ${modules.size} chunks, ${provenance.reduce((n, r) => n + r.symbols.length, 0)} symbols`);
