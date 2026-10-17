import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';

async function fixture() {
  const states = [], React = {
    useState: () => [false, value => states.push(value)],
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const source = await readFile(new URL('../src/client/browser-navigation-error.jsx', import.meta.url), 'utf8');
  const { code } = await transform(source, { loader: 'jsx', format: 'esm' });
  const context = vm.createContext({}), module = new vm.SourceTextModule(code, { context });
  await module.link(name => {
    assert.equal(name, 'react');
    return new vm.SyntheticModule(['default'], function () { this.setExport('default', React); }, { context });
  });
  await module.evaluate();
  return { render: module.namespace.BrowserNavigationError, states };
}

test('no failure produces no overlay', async () => {
  const { render } = await fixture(); assert.equal(render({ failure: null }), null);
});

test('failed URL and original error are visible in both locales; render never retries', async () => {
  const { render } = await fixture(); let retries = 0;
  for (const locale of ['zh-CN', 'en']) {
    const tree = render({ failure: { url: 'http://127.0.0.1:5173/', message: 'ERR_CONNECTION_REFUSED (-102)' }, locale, onRetry: () => { retries++; } });
    assert.equal(tree.props.role, 'alert');
    assert.match(JSON.stringify(tree), /127.0.0.1:5173/);
    assert.match(JSON.stringify(tree), /ERR_CONNECTION_REFUSED/);
    assert.match(JSON.stringify(tree), locale === 'en' ? /Retry/ : /重试/);
  }
  assert.equal(retries, 0);
});

test('retry is explicit, reports failure and clears its busy state', async () => {
  const { render, states } = await fixture(); const errors = []; let retries = 0;
  const error = new Error('still refused');
  const tree = render({ failure: { url: 'http://127.0.0.1:5173/', message: error.message }, locale: 'en',
    onRetry: async () => { retries++; throw error; }, onError: value => errors.push(value) });
  await tree.children.find(child => child?.type === 'button').props.onClick();
  assert.equal(retries, 1); assert.deepEqual(errors, [error]); assert.deepEqual(states, [true, false]);
});
