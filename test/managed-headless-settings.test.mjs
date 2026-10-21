import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { configureCapability, sharedConfigForm } from '../src/client/configuration.mjs';

async function controls(config = {}, pending = null) {
  const calls = [];
  const state = { config, inAppBrowser: false, browserResources: { installed: true } };
  const context = vm.createContext({});
  const createElement = (type, props, ...children) => ({ type, props, children });
  const value = { state, pending, run: async (id, callback) => { calls.push(['run', id]); return callback(); } };
  const React = { createElement, createContext: () => ({}), useContext: () => value };
  const services = { capabilities: { configure: async (...args) => calls.push(['configure', ...args]) } };
  const useIntl = () => ({ formatMessage: descriptor => descriptor.defaultMessage });
  const noop = () => {};
  const dependencies = {
    'react': { default: React }, './rea-services.mjs': { services },
    './rea/app-shared-2f2228189a8d.js': { lS: useIntl, SHe: noop, r5: noop, t5: noop, n5: noop, f$: '', p$: noop },
    './rea/computer-use-app-approval-request-card-82a4252ecef7.js': { w: '', T: noop },
    './rea/settings-plugin-controls-aa3e0c89c71f.js': { xt: noop, Ot: noop },
    './rea/computer-use-settings-615f56c63d73.js': { Vr: noop, ti: noop, Xr: noop, tr: noop, xi: noop },
    './rea/app-initial-c468e3fd7f91.js': { V2s: noop, W2s: noop },
    './settings-page.jsx': { ReaComputerSettingsPage: noop },
    './rea/browser-use-settings-61138c2e595e.js': { vn: noop, J: noop, it: noop, Ee: noop, fe: () => noop },
    './rea/browser-extension-connection-status-description-fb2767d472db.js': { c: noop, f: noop },
  };
  const source = await readFile(new URL('../src/client/capability-settings.jsx', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'jsx', format: 'esm' });
  const module = new vm.SourceTextModule(code, { context });
  await module.link(specifier => {
    const values = dependencies[specifier]; assert.ok(values, specifier);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, item] of Object.entries(values)) this.setExport(name, item);
    }, { context });
  });
  await module.evaluate();
  const wrapper = module.namespace.BrowserControls();
  return { items: wrapper.type(wrapper.props).props.items, calls };
}

test('headless option defaults off and rendering never writes configuration', async () => {
  const { items, calls } = await controls({ browserEnabled: true });
  const item = items.find(item => item.id === 'managedHeadless');
  assert.ok(item); assert.equal(item.enabled, false); assert.deepEqual(calls, []);
  assert.match(item.title, /DSH server machine/);
  assert.match(item.description, /does not.*embedded page preview/);
  assert.ok(items.find(item => item.id === 'browserEnabled'));
  assert.equal(items.find(item => item.id === 'in-app-browser').showEnableToggle, false);
});

test('only explicit toggle writes the selected boolean through the existing run path', async () => {
  const { items, calls } = await controls({ browserEnabled: true });
  const item = items.find(item => item.id === 'managedHeadless');
  await item.onToggleEnabled(true); await item.onToggleEnabled(false);
  assert.deepEqual(calls, [['run', 'managedHeadless'], ['configure', 'managedHeadless', true], ['run', 'managedHeadless'], ['configure', 'managedHeadless', false]]);
});

test('readback and pending state are honored without treating the configuration as readiness', async () => {
  const { items } = await controls({ browserEnabled: false, managedHeadless: true }, 'managedHeadless');
  const item = items.find(item => item.id === 'managedHeadless');
  assert.equal(item.enabled, true); assert.equal(item.isPending, true);
  assert.match(item.description, /setting alone does not confirm/);
  assert.equal(items.find(item => item.id === 'browserEnabled').enabled, false);
});

test('capability writer preserves existing flags, rejects invalid values, and surfaces write errors', async () => {
  const writes = [], form = { set: async (...args) => { writes.push(args); return true; } };
  for (const key of ['managedHeadless', 'browserEnabled', 'nativeEnabled', 'extensionEnabled']) await configureCapability(form, key, false);
  assert.equal(writes.length, 4);
  await assert.rejects(configureCapability(form, 'unknown', true), /Unknown/);
  await assert.rejects(configureCapability(form, 'managedHeadless', 'true'), /boolean/);
  assert.equal(writes.length, 4);
  await assert.rejects(configureCapability({ set: async () => false }, 'managedHeadless', true), /did not accept/);
  await assert.rejects(configureCapability({ set: async () => { throw new Error('reconfigure failed'); } }, 'managedHeadless', true), /reconfigure failed/);
});

test('settings owner routing saves and reads the opt-in from the active namespace', async () => {
  const stores = { opencu: {}, 'oh-my-dsh': {} };
  let active = 'opencu';
  const forms = { describe: () => ({ getSnapshot: () => ({ view: { namespaces: [{ ns: active }] } }), subscribe: () => () => {} }),
    get: name => ({ getSnapshot: () => stores[name], set: async (key, value) => { stores[name][key] = value; return true; }, subscribe: () => () => {} }) };
  const form = sharedConfigForm(forms, ['opencu', 'oh-my-dsh']);
  await configureCapability(form, 'managedHeadless', true);
  assert.equal(form.getSnapshot().managedHeadless, true);
  active = 'oh-my-dsh'; assert.equal(form.getSnapshot().managedHeadless, undefined);
  await configureCapability(form, 'managedHeadless', false);
  assert.equal(form.getSnapshot().managedHeadless, false); assert.equal(stores.opencu.managedHeadless, true);
});

test('both locale dictionaries define the headless option and its preview boundary', async () => {
  const source = await readFile(new URL('../src/client/rea-locale.mjs', import.meta.url), 'utf8');
  for (const key of ['managedHeadless', 'managedHeadlessToggle', 'managedHeadlessHelp']) {
    assert.equal(source.split(`'opencu.capabilities.${key}':`).length - 1, 2);
  }
  assert.match(source, /不会在此提供内嵌页面预览/);
});
