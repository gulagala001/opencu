import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// The actual slot module has no JSX syntax. Keep production bytes intact and
// isolate React/DOM/REA dependencies; this is not a real-browser UI test.
async function fixture() {
  const source = await readFile(new URL('../src/client/browser-slot.jsx', import.meta.url), 'utf8');
  const context = vm.createContext({});
  const NativeBrowserSlot = () => {};
  const createElement = (type, props, ...children) => ({ type, props, children });
  const dependencies = {
    'react-host': { createElement }, 'react': { default: { createElement } },
    'react-dom/client': { createRoot: () => { throw new Error('Unexpected REA root'); } },
    './rea-root.jsx': { ReaRoot: () => {} }, './rea-styles.css': { default: '' },
    './portal-host.mjs': { createReaPortal: () => { throw new Error('Unexpected portal'); } },
    './native-browser-slot.jsx': { NativeBrowserSlot },
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => {
    const values = dependencies[specifier];
    assert.ok(values, `Unexpected dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return { BrowserSlot: module.namespace.BrowserSlot, NativeBrowserSlot };
}

test('unavailable browser renders the supplied localized status without mounting a guest', async () => {
  const { BrowserSlot } = await fixture();
  const message = '当前网页没有内嵌浏览器所需的桌面适配。';
  const result = BrowserSlot({ browserAvailable: false, browserUnavailableMessage: message,
    mountTab() { throw new Error('Must not mount unavailable guest'); } });
  assert.equal(result.type, 'div');
  assert.equal(result.props.role, 'status');
  assert.equal(result.children[0], message);
});

test('available native surface retains the native component and exact props', async () => {
  const { BrowserSlot, NativeBrowserSlot } = await fixture();
  const props = { browserAvailable: true, updateBounds() {}, sessionId: 'session' };
  const result = BrowserSlot(props);
  assert.equal(result.type, NativeBrowserSlot);
  assert.equal(result.props, props);
});

test('available embedded surface retains its component and exact props', async () => {
  const { BrowserSlot } = await fixture();
  const props = { browserAvailable: true, sessionId: 'session' };
  const result = BrowserSlot(props);
  assert.equal(result.type.name, 'EmbeddedBrowserSlot');
  assert.equal(result.props, props);
});

test('legacy callers retain their previous selection and availability changes are not sticky', async () => {
  const { BrowserSlot, NativeBrowserSlot } = await fixture();
  assert.equal(BrowserSlot({}).type.name, 'EmbeddedBrowserSlot');
  const props = { updateBounds() {} };
  assert.equal(BrowserSlot(props).type, NativeBrowserSlot);
  assert.equal(BrowserSlot({ ...props, browserAvailable: false, browserUnavailableMessage: 'Unavailable' }).type, 'div');
  assert.equal(BrowserSlot({ ...props, browserAvailable: true }).type, NativeBrowserSlot);
});

test('entry wiring passes the capability and both locales provide configuration guidance', async () => {
  const source = await readFile(new URL('../src/client/index.jsx', import.meta.url), 'utf8');
  assert.match(source, /browserAvailable: host\.service\.available/);
  assert.match(source, /browserUnavailableMessage: browserCopy\('unavailable'\)/);
  assert.match(source, /设置 → 电脑与浏览器/);
  assert.match(source, /Settings → Computer and browsers/);
});
