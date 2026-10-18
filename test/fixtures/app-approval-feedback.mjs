import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const clientRoot = new URL('../../src/client/', import.meta.url);
const cardFile = 'rea/computer-use-app-approval-request-card-82a4252ecef7.js';
const noop = () => {};
const empty = () => ({});

/**
 * Execute the complete production client entry, service registry and REA card.
 * Only React/compiler primitives, unrelated services and the DSH/HTTP boundary
 * are synthetic. Effects are recorded, not run: no browser, DOM, IPC or grant.
 */
export async function approvalFeedbackFixture(options = {}) {
  const calls = [], notices = [], scopeLookups = [], inputScopes = [], effects = [];
  const scopes = new Map(['A', 'B'].map(id => [id, { id }]));
  let activeSession = 'A', activeReads = 0;
  const context = vm.createContext({ URL, ...options.globals });
  const modules = new Map();
  const client = {
    getSnapshot: () => ({connected:false, revision:0}), subscribe: () => noop,
    request(method, response) {
      calls.push({ method, response });
      if (options.request) return options.request(method, response);
      return Promise.resolve({ ok: true });
    },
  };
  const ctx = {
    effect(_run, label) { effects.push(label); },
    inject: noop,
    uiSession: {registerPendingInteraction: () => () => noop},
    slots: {inject: noop},
    locale: { bind: () => key => key },
    sidebarRight: { mounted: { getSnapshot() { activeReads++; return activeSession; } } },
    sessions: { scope(id) { scopeLookups.push(id); return scopes.get(id); } },
    conversation: { input: { for(scope) {
      assert.equal(scopes.get(scope.id), scope, 'input must use the exact retained scope');
      inputScopes.push(scope.id);
      return { notify(level, message) {
        const notice = { conversationId: scope.id, level, message };
        if (options.notify) return options.notify(notice);
        notices.push(notice);
      } };
    } } },
  };
  ctx.root = { plugin(plugin) { plugin.apply(ctx); return { dispose: noop }; } };

  // Every unrelated import is explicit. An unexpected dependency fails closed.
  const stubs = {
    './app-approval-slot.jsx': {AppApprovalSlot: noop},
    // The entry re-exports overview UI; these approval/folder contracts never mount it.
    './session-overview.jsx': {OverviewSlot: noop},
    './host-compat.mjs': { resolveDesktopBrowserHost: () => ({ desktop: null, error: null }) },
    './base64.mjs': { decodeBase64: noop },
    './core-client.mjs': { createCoreClient: () => client },
    './configuration.mjs': { sharedConfigForm: empty, configureCapability: noop },
    './browser-history.mjs': { createBrowserHistoryHost: empty },
    './downloads-host.mjs': { createDownloadsHost: empty },
    './browser-transport.mjs': { createBrowserTransport: () => ({ setSessionOwner: noop }) },
    './rea-browser-host.mjs': { createReaBrowserHost: () => ({ service: { available: false } }) },
    './browser-surfaces.mjs': { createBrowserSurfaces: () => {
      if (options.realClient) return { service: { available: false } };
      throw new Error('unexpected desktop mount');
    } },
    './rea-root.jsx': { initializeRea: noop },
    './references.mjs': { createReferences: empty },
    './settings-host.mjs': { createSettingsHost: empty },
    './browser-settings.mjs': { createBrowserSettings: empty },
    './files-host.mjs': { createFilesHost: empty },
    './artifact-documents.mjs': { createArtifactDocumentsHost: empty },
    './sources-host.mjs': { createSourcesHost: empty },
    './reference-editor.mjs': { createReferenceEditor: empty },
    './browser-address.mjs': { createBrowserAddress: empty, createBrowserAddressAutocomplete: empty },
    './rea/app-initial-c468e3fd7f91.js': { AW: {} },
    './text-annotations.mjs': { createTextAnnotations: empty },
    './annotation-message-slot.jsx': { installAnnotationMessages: noop },
    './presentation-host.mjs': { createPresentationClient: empty },
    './presentation-layout.mjs': { createPresentationLayout: noop },
    './portal-host.mjs': { guestPortalStyles: '' },
  };
  for (const [file, name] of [
    ['browser-slot', 'BrowserSlot'], ['hidden-browser-slot', 'HiddenBrowserSlot'],
    ['browser-title', 'BrowserTitleSlot'], ['settings-slot', 'SettingsSlot'],
    ['image-slot', 'ImageSlot'], ['document-slot', 'DocumentSlot'], ['tool-slot', 'ToolSlot'],
    ['sources-slot', 'SourcesSlot'], ['reference-editor-slot', 'ReferenceEditorSlot'],
    ['browser-address-slot', 'BrowserAddressSlot'], ['text-annotation-slot', 'TextAnnotationSlot'],
    ['presentation-slot', 'PresentationSlot'],
  ]) stubs[`./${file}.jsx`] = { [name]: noop };

  function synthetic(key, values) {
    if (!modules.has(key)) modules.set(key, new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context, identifier: key }));
    return modules.get(key);
  }
  async function source(file) {
    if (modules.has(file)) return modules.get(file);
    const url = new URL(file, clientRoot);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), {
      context, identifier: url.href, initializeImportMeta(meta) { meta.url = url.href; },
    });
    modules.set(file, module);
    await module.link(async name => {
      if (name === './rea-services.mjs' || name === './app-approval-response.mjs' || name === './extension-download.mjs' || name === './pending-app-approvals.mjs') return source(name.slice(2));
      if (options.realClient && ['./host-compat.mjs', './host-target.mjs', './ipc-result.mjs', './core-client.mjs', './pending-app-approvals.mjs'].includes(name)) return source(name.slice(2));
      assert.ok(Object.hasOwn(stubs, name), `unexpected client import: ${name}`);
      return synthetic(name, stubs[name]);
    });
    return module;
  }
  const index = await source('index.jsx');
  await index.evaluate();
  await index.namespace.apply(ctx);
  const services = modules.get('rea-services.mjs').namespace.services;
  assert.equal(typeof services.computerUseSettings.respondAppApproval, 'function');

  const hooks = [];
  let hookIndex = 0;
  function hook(create) {
    const index = hookIndex++;
    if (!(index in hooks)) hooks[index] = create();
    return index;
  }
  const React = {
    useRef(value) { return hooks[hook(() => ({ current: value }))]; },
    useState(value) {
      const index = hook(() => value);
      return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }];
    },
  };
  const compiler = { c(size) { return hooks[hook(() => Array(size).fill(Symbol.for('react.memo_cache_sentinel')))]; } };
  const jsx = (type, props) => ({ type, props });
  const store = { set: noop }, intl = { formatMessage: message => message.defaultMessage };
  const shared = {
    oA: () => store, X: {}, lS: () => intl, tA: () => false, iOr: {}, hL: () => false,
    t5: noop, mar: {}, hS: noop, c: () => compiler, o: () => React,
    K: () => ({ jsx, jsxs: jsx, Fragment: Symbol('Fragment') }),
  };
  for (const name of ['har', 'sA', 'Qhn', 'xS', 'tR', 'n5', 'gI', 'NL', 'aOr']) shared[name] = noop;
  const cardUrl = new URL(cardFile, clientRoot);
  const card = new vm.SourceTextModule(await readFile(cardUrl, 'utf8'), {
    context, identifier: cardUrl.href, initializeImportMeta(meta) { meta.url = cardUrl.href; },
  });
  await card.link(name => {
    if (name === '../host-boundaries.mjs') return synthetic('card-host', { services });
    if (name === './app-shared-2f2228189a8d.js') return synthetic('card-react', shared);
    assert.equal(name, './rolldown-runtime-2d059c5e81f4.js');
    return synthetic('card-runtime', { o: initialize => {
      let initialized = false;
      return () => { if (!initialized) { initialized = true; initialize(); } };
    } });
  });
  await card.evaluate();
  card.namespace.A();

  const settled = [];
  const props = {
    ApprovalCard: noop, conversationId: 'A', hostId: 'local', requestId: 'approval-1',
    onRequestSettled: action => settled.push(action),
    request: { connectorName: 'Computer Use', appDisplayName: 'Fixture App', riskLevel: 'normal', persistModes: ['session', 'always'] },
  };
  return {
    calls, notices, scopeLookups, inputScopes, scopes, effects, settled, services,
    service: services.computerUseSettings,
    get activeReads() { return activeReads; },
    setActiveSession(value) { activeSession = value; },
    render(overrides = {}) {
      Object.assign(props, overrides);
      hookIndex = 0;
      return card.namespace.E(props).props.actions;
    },
  };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Real REA click callbacks return void; give their promise handlers a full turn.
export const flush = () => new Promise(resolve => setImmediate(resolve));
