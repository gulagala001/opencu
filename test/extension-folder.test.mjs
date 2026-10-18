import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extensionFolderFixture, desktopBridge, deferred, tick } from './fixtures/extension-folder.mjs';

const response = path => ({ ok: true, json: async () => ({ ok: true, path }) });
const visiblePath = f => f.nodes().find(node => node.type === 'textarea')?.props.value;
const copied = f => f.text().includes('Path copied');

test('Web button displays selectable host path without a desktop or active conversation', async t => {
  const f = await extensionFolderFixture(); t.after(() => f.unmount());
  await f.show();
  assert.equal(visiblePath(f), '/srv/dsh/opencu/extension');
  assert.match(f.text(), /machine running DSH/);
  assert.match(f.text(), /If your browser is on another machine, first copy the extension files to a local folder on that machine/);
  assert.equal(f.nodes().find(node => node.type === 'textarea').props.readOnly, true);
  assert.equal(copied(f), false); assert.deepEqual(f.copied, []);
  assert.equal(f.production.activeReads, 0);
});

test('stock incompatible desktop bridge retains the PR20 diagnostic and uses host path fallback', async t => {
  let calls = 0;
  const f = await extensionFolderFixture({ browser: { acquire() { calls++; }, release() {}, onOpenRequested() {}, files() { calls++; } } });
  t.after(() => f.unmount()); await f.show();
  assert.equal(visiblePath(f), '/srv/dsh/opencu/extension'); assert.equal(calls, 0);
  assert.match(f.value().state.desktopAdapterError, /matching desktop host adapter/);
});

test('compatible desktop reveals the exact path and requires confirmed success', async t => {
  const calls = [];
  const f = await extensionFolderFixture({ browser: desktopBridge(async (...args) => { calls.push(args); return { success: true }; }) });
  t.after(() => f.unmount()); await f.show();
  assert.deepEqual(structuredClone(calls), [['reveal', { path: '/srv/dsh/opencu/extension' }]]);
  assert.equal(visiblePath(f), '/srv/dsh/opencu/extension');
  assert.match(f.text(), /Desktop adapter revealed/); assert.equal(copied(f), false);
});

for (const [label, files] of [
  ['rejection', async () => { throw new Error('reveal rejected'); }],
  ['synchronous failure', () => { throw new Error('reveal rejected'); }],
  ['false result', async () => ({ success: false })],
  ['missing confirmation', async () => undefined],
]) test(`desktop ${label} preserves path and displays failure without claiming reveal or copy`, async t => {
  const f = await extensionFolderFixture({ browser: desktopBridge(files) }); t.after(() => f.unmount());
  await f.show(); assert.equal(visiblePath(f), '/srv/dsh/opencu/extension');
  assert(f.nodes().some(node => node.props.role === 'alert'));
  assert.doesNotMatch(f.text(), /Desktop adapter revealed/); assert.equal(copied(f), false);
});

for (const path of [undefined, null, 3, '', 'relative/extension', 'C:relative', '/bad\npath', '/bad\0path']) test(`invalid host path ${JSON.stringify(path)} is not displayed or revealed`, async t => {
  let reveals = 0;
  const f = await extensionFolderFixture({ request: async () => response(path), browser: desktopBridge(async () => { reveals++; return { success: true }; }) });
  t.after(() => f.unmount()); await f.show();
  assert.equal(visiblePath(f), undefined); assert.equal(reveals, 0);
  assert.match(f.text(), /invalid extension folder path/); assert.equal(copied(f), false);
});

for (const [label, request] of [
  ['HTTP failure', async () => ({ ok: false, status: 503 })],
  ['server error', async () => ({ ok: true, json: async () => ({ ok: false, error: { message: 'Extension unavailable' } }) })],
  ['malformed response', async () => ({ ok: true, json: async () => { throw new Error('Malformed response'); } })],
]) test(`${label} is visible in the settings button without a session`, async t => {
  const f = await extensionFolderFixture({ request }); t.after(() => f.unmount()); await f.show();
  assert(f.nodes().some(node => node.props.role === 'alert')); assert.equal(visiblePath(f), undefined); assert.equal(copied(f), false);
});

test('a capabilities refresh failure does not discard the successful path result', async t => {
  const f = await extensionFolderFixture(); t.after(() => f.unmount()); f.failReads('refresh unavailable');
  const result = await f.show();
  assert.equal(result.path, '/srv/dsh/opencu/extension'); assert.equal(visiblePath(f), result.path);
  assert.equal(f.value().pending, null);
  await f.focus();
  assert.match(f.text(), /refresh unavailable/);
});

test('pending repeated show clicks share one request and unlock for explicit retry', async t => {
  const wait = deferred();
  const f = await extensionFolderFixture({ request: () => wait.promise }); t.after(() => f.unmount());
  const first = f.show(), second = f.show();
  assert.equal(f.requests.filter(row => row.method === 'extensionFiles').length, 1);
  assert.equal(f.nodes().find(node => node.type === 'button').props.disabled, true);
  wait.resolve(response('/one/extension')); await first; await second;
  assert.equal(visiblePath(f), '/one/extension'); assert.equal(f.value().pending, null);
});

test('late folder response after provider unmount writes no state and starts no refresh', async () => {
  const wait = deferred(), f = await extensionFolderFixture({ request: () => wait.promise });
  const pending = f.show(); f.unmount(); const before = f.writes(), reads = f.requests.length;
  wait.resolve(response('/late/extension')); await pending; await tick();
  assert.equal(f.writes(), before); assert.equal(f.requests.length, reads);
});

test('copy is an explicit independent action and claims success only after resolution', async t => {
  const wait = deferred(), calls = [];
  const f = await extensionFolderFixture({ clipboard: { writeText: path => { calls.push(path); return wait.promise; } } });
  t.after(() => f.unmount()); await f.show(); assert.deepEqual(calls, []);
  const first = f.copy(), second = f.copy(); assert.deepEqual(calls, ['/srv/dsh/opencu/extension']); assert.equal(copied(f), false);
  wait.resolve(); await first; await second; assert.equal(copied(f), true);
});

for (const [label, clipboard] of [
  ['missing API', null],
  ['missing method', {}],
  ['synchronous throw', { writeText() { throw new Error('clipboard denied'); } }],
  ['rejection', { writeText: async () => { throw new Error('clipboard denied'); } }],
  ['unconfirmed return', { writeText: () => undefined }],
  ['false resolution', { writeText: async () => false }],
]) test(`clipboard ${label} preserves the path and manual instructions`, async t => {
  const f = await extensionFolderFixture({ clipboard }); t.after(() => f.unmount());
  await f.show(); await f.copy(); assert.equal(visiblePath(f), '/srv/dsh/opencu/extension');
  assert.equal(copied(f), false); assert.match(f.text(), /Select the path and copy it manually/);
});

test('copy completion after button unmount produces no late state update', async () => {
  const wait = deferred(), f = await extensionFolderFixture({ clipboard: { writeText: () => wait.promise } });
  await f.show(); const pending = f.copy(); f.unmount([1]); const before = f.writes();
  wait.resolve(); await pending; assert.equal(f.writes(), before); f.unmount([0]);
});

test('copy of an old path cannot mark a new path copied, even before rerender', async t => {
  const wait = deferred(); let copies = 0;
  const f = await extensionFolderFixture({ clipboard: { writeText: () => ++copies === 1 ? wait.promise : Promise.resolve() } });
  t.after(() => f.unmount()); await f.show(); const pending = f.copy();
  f.path('/new/extension'); const showing = f.show();
  wait.resolve(); await pending; await showing;
  assert.equal(visiblePath(f), '/new/extension'); assert.equal(copied(f), false);
  await f.copy(); assert.equal(copied(f), true);
});

for (const path of ['C:\\DSH\\extension', '\\\\server\\share\\extension']) test(`absolute host path ${path} is preserved exactly`, async t => {
  const f = await extensionFolderFixture({ path }); t.after(() => f.unmount()); await f.show(); assert.equal(visiblePath(f), path);
});

test('unmounted button handlers cannot request a folder or write the clipboard', async () => {
  const f = await extensionFolderFixture(); await f.show();
  const buttons = f.nodes().filter(node => node.type === 'button');
  const show = buttons[0].props.onClick, copy = buttons[1].props.onClick;
  f.unmount([1]); const before = f.requests.length;
  await show(); await copy(); assert.equal(f.requests.length, before); assert.deepEqual(f.copied, []);
  f.unmount([0]);
});

test('folder receipt needs no unrelated refresh and remains copyable after a later read error', async t => {
  const f = await extensionFolderFixture(); t.after(() => f.unmount()); await f.show();
  assert.deepEqual(f.requests.map(row => row.method), ['capabilities', 'extensionFiles']);
  f.failReads('later capabilities failure'); await f.focus();
  await f.copy(); assert.equal(copied(f), true); assert.equal(visiblePath(f), '/srv/dsh/opencu/extension');
});

test('late folder rejection after unmount cannot publish an error', async () => {
  const wait = deferred(), f = await extensionFolderFixture({ request: () => wait.promise });
  const pending = f.show(); f.unmount(); const before = f.writes();
  wait.reject(new Error('late HTTP error')); await pending; assert.equal(f.writes(), before);
});

test('late clipboard rejection after provider unmount cannot publish an error', async () => {
  const wait = deferred(), f = await extensionFolderFixture({ clipboard: { writeText: () => wait.promise } });
  await f.show(); const pending = f.copy(); f.unmount(); const before = f.writes();
  wait.reject(new Error('late clipboard error')); await pending; assert.equal(f.writes(), before);
});

test('clipboard writes remain serialized across path changes and require another explicit copy', async t => {
  const old = deferred(), next = deferred(), calls = [];
  const f = await extensionFolderFixture({ clipboard: { writeText: path => { calls.push(path); return calls.length === 1 ? old.promise : next.promise; } } });
  t.after(() => f.unmount()); await f.show(); const previous = f.copy();
  f.path('/new/extension'); await f.show(); await f.copy();
  assert.deepEqual(calls, ['/srv/dsh/opencu/extension']);
  old.resolve(); await previous; assert.equal(copied(f), false);
  const current = f.copy(); await f.copy();
  assert.deepEqual(calls, ['/srv/dsh/opencu/extension', '/new/extension']); assert.equal(copied(f), false);
  next.resolve(); await current; assert.equal(copied(f), true);
});

test('spaces and Unicode in an absolute host path are preserved', async t => {
  const path = '/srv/宿主/extension folder', f = await extensionFolderFixture({ path });
  t.after(() => f.unmount()); await f.show(); await f.copy();
  assert.equal(visiblePath(f), path); assert.deepEqual(f.copied, [path]);
});

test('both locale dictionaries describe the host boundary and explicit copy outcome', async () => {
  const source = await readFile(new URL('../src/client/rea-locale.mjs', import.meta.url), 'utf8');
  for (const name of ['extensionHostPath', 'extensionHostHelp', 'extensionRevealed', 'copyExtensionPath', 'extensionPathCopied', 'extensionPathManual']) {
    assert.equal(source.split(`'opencu.capabilities.${name}':`).length - 1, 2, name);
  }
  assert.match(source, /如果浏览器在另一台机器上，请先将扩展文件复制到浏览器所在机器的本地目录/);
  assert.match(source, /If your browser is on another machine, first copy the extension files to a local folder on that machine/);
});

test('new path cannot inherit a copied receipt even in the render before effects', async t => {
  const f = await extensionFolderFixture(); t.after(() => f.unmount());
  await f.show(); await f.copy(); assert.equal(copied(f), true);
  f.path('/next/extension'); await f.show();
  const firstPaint = f.beforeEffects();
  assert.match(firstPaint, /\/next\/extension/); assert.doesNotMatch(firstPaint, /Path copied/);
});
