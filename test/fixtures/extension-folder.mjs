import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { approvalFeedbackFixture } from './app-approval-feedback.mjs';

const noop = () => {};
export const tick = () => new Promise(resolve => setImmediate(resolve));
export function deferred() { return Promise.withResolvers(); }
export function desktopBridge(files) {
  return { openCU: { revision: 2, hostVersion: '0.2.1-rc.2', capabilities: ['artifactDocuments', 'tabCloseGuards', 'browserSurfaces', 'presentationSessions', 'presentationHitRegions', 'backgroundInput', 'structuredErrors', 'initialNavigation'] },
    ...Object.fromEntries(['acquireOpenCU', 'release', 'onOpenRequested', 'downloads', 'permissions', 'automation', 'extensions', 'profile', 'presentation', 'files', 'onPresentationEvent', 'onExtensionEvent', 'surface', 'onSurfaceEvent'].map(name => [name, noop])), files };
}
// Production index, registry, HTTP client and compatibility probe are real.
// Unrelated host services and REA visuals are synthetic; no DOM, desktop or network runs.
export async function extensionFolderFixture(options = {}) {
  const requests = [], copied = [];
  let path = options.path ?? '/srv/dsh/opencu/extension', readFailure = null;
  const clipboard = options.clipboard === undefined ? { writeText: async value => { copied.push(value); } } : options.clipboard;
  const globals = { AbortController, AbortSignal, navigator: { clipboard },
    ...(options.browser === undefined ? {} : { dshDesktop: { browser: options.browser } }),
    fetch: async (_url, request) => {
      const { method, args } = JSON.parse(request.body); requests.push({ method, args });
      if (method === 'extensionFiles') {
        if (options.request) return options.request();
        return { ok: true, json: async () => ({ ok: true, path }) };
      }
      assert.equal(method, 'capabilities');
      if (readFailure) throw new Error(readFailure);
      return { ok: true, json: async () => ({ config: {}, connections: [], backends: {}, browserResources: {}, warnings: [] }) };
    } };
  const production = await approvalFeedbackFixture({ realClient: true, globals });
  production.scopes.clear(); // No active conversation is needed for settings feedback.
  const frames = [{ hooks: [], alive: true }, { hooks: [], alive: true }];
  let frame, cursor = 0, value, dirty = false, writes = 0;
  const effects = [];
  function hook(create) { const at = cursor++; if (!(at in frame.hooks)) frame.hooks[at] = create(); return at; }
  const React = {
    Fragment: Symbol('Fragment'), createContext: () => ({ Provider: 'provider' }),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useContext: () => value,
    useRef: initial => frame.hooks[hook(() => ({ current: initial }))],
    useState(initial) {
      const owner = frame, at = hook(() => typeof initial === 'function' ? initial() : initial);
      return [owner.hooks[at], next => { writes++; owner.hooks[at] = typeof next === 'function' ? next(owner.hooks[at]) : next; dirty = true; }];
    },
    useCallback(callback, deps) {
      const at = hook(() => ({ callback, deps })), old = frame.hooks[at];
      if (deps.some((dep, i) => !Object.is(dep, old.deps[i]))) frame.hooks[at] = { callback, deps };
      return frame.hooks[at].callback;
    },
    useEffect(callback, deps) {
      const at = hook(() => ({})), owner = frame, old = owner.hooks[at];
      if (!old.deps || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        owner.hooks[at] = { deps, cleanup: old.cleanup };
        effects.push(() => { old.cleanup?.(); owner.hooks[at].cleanup = callback(); });
      }
    },
  };
  const useIntl = () => ({ formatMessage: descriptor => descriptor.defaultMessage });
  const dependencies = {
    'react': { default: React }, './rea-services.mjs': { services: production.services },
    './rea/app-shared-2f2228189a8d.js': { lS: useIntl, SHe: noop, r5: 'button', t5: noop, n5: noop, f$: '', p$: noop },
    './rea/computer-use-app-approval-request-card-82a4252ecef7.js': { w: '', T: noop },
    './rea/settings-plugin-controls-aa3e0c89c71f.js': { xt: noop, Ot: noop },
    './rea/computer-use-settings-615f56c63d73.js': { Vr: noop, ti: noop, Xr: noop, tr: noop, xi: noop },
    './rea/app-initial-c468e3fd7f91.js': { V2s: noop, W2s: noop },
    './settings-page.jsx': { ReaComputerSettingsPage: noop },
    './rea/browser-use-settings-61138c2e595e.js': { vn: noop, J: noop, it: noop, Ee: noop, fe: () => noop },
    './rea/browser-extension-connection-status-description-fb2767d472db.js': { c: noop, f: noop },
  };
  const focusListeners = new Set();
  const context = vm.createContext({ ...globals, window: { addEventListener: (name, callback) => { if (name === 'focus') focusListeners.add(callback); }, removeEventListener: (name, callback) => { if (name === 'focus') focusListeners.delete(callback); } }, document: { addEventListener: noop, removeEventListener: noop }, setTimeout: () => 1, clearTimeout: noop });
  const { code } = await transform(await readFile(new URL('../../src/client/capability-settings.jsx', import.meta.url), 'utf8'), { loader: 'jsx', format: 'esm' });
  const module = new vm.SourceTextModule(code, { context });
  await module.link(name => {
    const values = dependencies[name]; assert(values, name);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [name, item] of Object.entries(values)) this.setExport(name, item); }, { context });
  });
  await module.evaluate();
  let tree;
  const render = (flushEffects = true) => {
    let passes = 0;
    do {
      dirty = false; frame = frames[0]; cursor = 0;
      value = module.namespace.CapabilityProvider({ children: null }).props.value;
      frame = frames[1]; cursor = 0;
      tree = frames[1].alive ? module.namespace.ConnectionInstallButton() : null;
      if (flushEffects) while (effects.length) effects.shift()();
      assert(++passes < 10, 'Synthetic hook render did not settle');
    } while (flushEffects && dirty);
    return tree;
  };
  function nodes(node, result = []) {
    if (Array.isArray(node)) { for (const child of node) nodes(child, result); return result; }
    if (node && typeof node === 'object') { result.push(node); nodes(node.props?.children, result); }
    return result;
  }
  const controls = () => nodes(render()).filter(node => node.type === 'button');
  const unmount = (which = [0, 1]) => { for (const index of which) { frames[index].alive = false; for (const hook of frames[index].hooks) hook?.cleanup?.(); } };
  render(); await tick(); render();
  return { requests, copied, production, render, nodes: () => nodes(render()),
    show: () => controls()[0].props.onClick(),
    copy: () => { const buttons = controls(); assert(buttons[1], 'Copy button must be visible'); return buttons[1].props.onClick(); },
    value: () => { render(); return value; },
    text: () => JSON.stringify(render()),
    beforeEffects: () => JSON.stringify(render(false)),
    path: next => { path = next; }, failReads: message => { readFailure = message; },
    focus: async () => { for (const callback of focusListeners) callback(); await tick(); },
    unmount, writes: () => writes,
  };
}
