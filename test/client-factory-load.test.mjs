import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import test, { after } from 'node:test';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const checkout = fileURLToPath(new URL('../', import.meta.url));
const evidence = await mkdtemp(resolve(tmpdir(), 'opencu-client-smoke-'));
after(() => rm(evidence, { recursive: true, force: true }));
// Vendored official source: immutable upstream commit plus every transitive file hash.
// No network, desktop or external server is required by this smoke.
const pinned = JSON.parse(await readFile(new URL('./fixtures/dsh-client-modules.json', import.meta.url), 'utf8'));
assert.equal(pinned.repository, 'deepseek-ai/deepseek-harness');
assert.equal(pinned.commit, '687f282e8625c6b8d11ff58211a90524be2e4317');
assert.equal(pinned.directory, 'packages/client/modules/src/client');
await Promise.all(Object.entries(pinned.files).map(async ([file, expected]) => {
  assert(/^[a-z-]+\.ts$/.test(file));
  const bytes = await readFile(new URL('./fixtures/dsh-client-modules/' + file, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Official SDK source hash mismatch: ${file}`);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), pinned.gitBlobs[file], `Official SDK Git blob mismatch: ${file}`);
  await writeFile(resolve(evidence, file), bytes);
}));
const require = createRequire(resolve(checkout, 'package.json'));
const React = require('react');
assert.equal(require('@deepseek-ai/cordis/package.json').version, '4.0.5');
assert.equal(require('react/package.json').version, '19.2.7');
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
await require('esbuild').build({
  entryPoints: [resolve(evidence, 'system.ts')],
  outfile: resolve(evidence, 'dsh-system.mjs'), bundle: true, format: 'esm',
  platform: 'node', target: 'es2022', sourcemap: true,
});
const { ClientModuleSystem } = await import(pathToFileURL(resolve(evidence, 'dsh-system.mjs')));
const results = [];
const restored = ["TOe", "TMe", "PPe", "FFe", "aIe", "sIe", "Yb", "kIe", "MIe", "NIe", "IIe", "LIe", "YIe", "DJe", "qoi", "zyt", "Byt", "Vyt", "Hyt", "Uyt", "Wyt", "Gyt", "INt", "LNt", "RNt", "zNt", "BNt", "VNt", "HNt", "UNt", "WNt", "GNt", "KNt", "Tco", "Eco", "Dco", "Oco"];
for (const kind of ['classic-module-loader', 'esm-createOpenCU']) await test(kind, { timeout: 60000 }, async () => {
  const requests = [], domCalls = [], networkCalls = [];
  const document = {
    baseURI: 'https://synthetic.invalid/',
    querySelectorAll: () => [],
    createElement(tag) { domCalls.push(['createElement', tag]); return { style: {}, setAttribute() {}, remove() {} }; },
    head: { append() {}, appendChild() {} },
    body: {}, documentElement: { lang: 'en', style: {}, dataset: { platform: 'linux' } }, addEventListener() {}, removeEventListener() {},
  };
  const browser = {
    document, console, URL, URLSearchParams, TextEncoder, TextDecoder,
    AbortController, AbortSignal, DOMException, Blob, File, atob, btoa, Event, EventTarget, CustomEvent, crypto,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, queueMicrotask,
    performance, navigator: { userAgent: 'Isolated Node VM (no browser)' },
    fetch(url, options) {
      const { method } = JSON.parse(options.body);
      networkCalls.push({ url, method });
      if (method === 'events') return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
      return Promise.resolve({ ok: true, json: async () => ({ connections: [], settings: { values: {}, configuredValues: {} } }) });
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {},
    MutationObserver: class { observe() {} disconnect() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    dshDesktop: { browser: { acquire() { throw new Error('Unexpected desktop operation'); }, release() {}, onOpenRequested() {} } },
  };
  browser.window = browser;
  browser.self = browser;
  const context = vm.createContext(browser);
  vm.runInContext('Error.stackTraceLimit = 200', context);
  const originalGlobals = new Set(Object.getOwnPropertyNames(browser));
  const result = { kind, stage: 'registration', requests, domCalls, networkCalls, applyReached: false, slotRegistrations: [] };
  try {
    let plugin, instantiate;
    if (kind === 'classic-module-loader') {
      const target = { mode: 'queue', pendingQueue: [], load(registration) { this.pendingQueue.push(registration); } };
      browser.__ModuleLoader__ = target;
      const source = await readFile(resolve(checkout, 'lib/client.js'), 'utf8');
      new vm.Script(source, { filename: resolve(checkout, 'lib/client.js') }).runInContext(context, { timeout: 20000 });
      result.registrations = target.pendingQueue.map(({ id }) => id);
      const loader = new ClientModuleSystem({
        manifest: { release: { version: '0.2.1-rc.2', commit: '687f282e8625c6b8d11ff58211a90524be2e4317' }, modules: [], plugins: [] },
        staticModules: { react: React },
        bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: {} },
        registrationTarget: target,
        loadBundle() { throw new Error('No bundle transport allowed'); },
      });
      result.stage = 'factory-materialization';
      try { plugin = await loader.import('opencu/client'); }
      finally { result.loadCache = [...loader.loadCache.keys()]; }
      instantiate = () => loader.import('opencu/client');
    } else {
      // Bundling hosts derive this ES factory from the shipped classic client.
      const head = 'window.__ModuleLoader__.load({id:"opencu",factory:(require)=>{var module={exports:{}};var exports=module.exports;', tail = 'return module.exports;}});';
      const client = (await readFile(resolve(checkout, 'lib/client.js'), 'utf8')).trimEnd();
      assert(client.startsWith(head) && client.endsWith(tail), 'Unexpected OpenCU client wrapper');
      const source = `export function createOpenCU(require) {\nvar module={exports:{}};var exports=module.exports;\n${client.slice(head.length, -tail.length)}\nreturn module.exports;\n}\n`;
      const module = new vm.SourceTextModule(source, { context, identifier: resolve(checkout, 'lib/client.factory.mjs') });
      await module.link(specifier => { throw new Error('Unexpected factory import: ' + specifier); });
      await module.evaluate({ timeout: 20000 });
      result.stage = 'factory-materialization';
      const hostRequire = specifier => {
        requests.push(specifier);
        if (specifier !== 'react') throw new Error('Unexpected host require: ' + specifier);
        return React;
      };
      instantiate = () => module.namespace.createOpenCU(hostRequire);
      plugin = await instantiate();
    }
    result.exports = Object.keys(plugin);
    result.stage = 'apply-ready';
    const noop = () => {};
    const observable = value => ({ getSnapshot: () => value, subscribe: () => noop });
    const root = new Context();
    const activeSlots = new Set();
    const injections = {
      connection: {},
      slots: {
        inject(name, callback) { result.slotRegistrations.push({ phase: 'inject', name }); return callback(); },
        register(slot, component) {
          if (slot.name === 'tool.call.toolview') assert.equal(component.name, 'ToolSlot');
          if (slot.id === 'opencu-capabilities') assert.equal(component.name, 'SettingsSlot');
          const registration = { phase: 'register', name: slot.name, id: slot.id, key: slot.key, component: component?.name };
          result.slotRegistrations.push(registration); activeSlots.add(registration);
          return () => activeSlots.delete(registration);
        },
        entries: () => [], subscribe: () => noop,
      },
      sidebarRight: { mounted: observable(null), openTabs: observable([]), tabsIn: () => [] },
      sidebarRightTabs: { register: () => noop },
      locale: { register: () => noop, bind: () => key => key },
      conversation: {}, sessions: {}, inputTriggers: { registerSource: () => noop },
      configForms: { describe: () => observable({ view: { namespaces: [] } }), get: () => observable({ value: {} }) },
      uiWorkspace: {},
      uiSession: { registerPendingInteraction: () => () => noop },
    };
    for (const [name, service] of Object.entries(injections)) root.provide(name, service);
    result.stage = 'real-cordis-apply';
    result.applyReached = true;
    result.lifecycle = [];
    const checkpoint = step => {
      const leaked = restored.filter(name => Object.hasOwn(browser, name));
      assert.deepEqual(leaked, [], 'Restored module names must stay local');
      result.lifecycle.push({ step, activeSlots: activeSlots.size, restoredGlobalLeaks: leaked });
    };
    try {
      const first = root.plugin(plugin); await first;
      assert.equal(activeSlots.size, 26); checkpoint('first-apply');
      const alternate = await instantiate();
      const second = root.plugin(alternate); await second;
      assert.equal(activeSlots.size, 26); checkpoint('second-owner');
      await first.dispose();
      assert.equal(activeSlots.size, 26); checkpoint('first-owner-disposed');
      await second.dispose();
      assert.equal(activeSlots.size, 0); checkpoint('all-owners-disposed');
      const remount = root.plugin(plugin); await remount;
      assert.equal(activeSlots.size, 26); checkpoint('remount');
      await remount.dispose();
      assert.equal(activeSlots.size, 0); checkpoint('remount-disposed');
      result.stage = 'slots-registered';
      assert(!networkCalls.some(call => call.method === 'appApprovals/respond'));
    }
    finally {
      result.addedGlobals = Object.getOwnPropertyNames(browser).filter(name => !originalGlobals.has(name));
      result.fiberStates = [...root.registry.values()].map(runtime => ({ name: runtime.name, fibers: [...runtime.fibers].map(fiber => ({ state: fiber.state })) }));
      await root.fiber.dispose();
    }
  } catch (error) {
    result.error = { name: error.name, message: error.message, stack: error.stack };
    const match = error.stack.match(/(lib\/client(?:\.factory\.mjs|\.js)):(\d+):(\d+)/);
    if (match) {
      const lines = (await readFile(resolve(checkout, match[1]), 'utf8')).split('\n');
      const line = lines[Number(match[2]) - 1], col = Number(match[3]) - 1;
      result.failureContext = { file: match[1], line: Number(match[2]), column: Number(match[3]), text: line.slice(Math.max(0, col - 180), col + 250) };
    }
  }
  results.push(result);
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.stage, 'slots-registered');
});
