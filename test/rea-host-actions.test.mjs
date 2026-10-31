import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createNavigationHost } from '../src/client/navigation-host.mjs';
import { openBrowserLink, copyFileContents, runFileAction } from '../src/client/rea-actions.mjs';
import { installReaServices } from '../src/client/rea-services.mjs';
import { decodeBase64 } from '../src/client/base64.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));

test('links retain their chat, honor local/external preferences and expose real failures', async () => {
  const calls = [], gate = Promise.withResolvers(); let session = 'original';
  const host = createNavigationHost({ settings: { readAll: () => gate.promise }, currentSession: () => session,
    browser: { available: true, newTab: async args => { calls.push(['tab', args]); return { ...args, browserTabId: 'tab' }; },
      detachTab: async args => { calls.push(['detach', args.browserTabId]); } },
    openExternal: async url => { calls.push(['external', url]); },
  });
  const pending = host.open({ href: 'https://example.test/', presentationIntent: 'new-window' });
  session = 'other'; gate.resolve({ values: { 'open-link-in-target-preference': 'in-app-browser', 'open-local-url-in-target-preference': 'external-browser' } });
  await pending;
  assert.equal(calls[0][1].conversationId, 'original'); assert.deepEqual(calls[1], ['detach', 'tab']);
  await host.open({ href: 'http://localhost:1234/' }); assert.deepEqual(calls[2], ['external', 'http://localhost:1234/']);
  await host.open({ href: 'https://example.test/', useExternalBrowser: true }); assert.equal(calls[3][0], 'external');
  await assert.rejects(host.open({ href: 'javascript:alert(1)' }), /Unsupported/);
  host.dispose(); await assert.rejects(host.open({ href: 'https://example.test/' }), /closed/);
  const unavailable = createNavigationHost({ settings: { readAll: async () => ({ values: {} }) }, currentSession: () => 's',
    browser: { available: false }, openExternal: async () => { throw Error('open failed'); } });
  await assert.rejects(unavailable.open({ href: 'https://example.test/' }), /open failed/);
});

test('a disposed navigation cannot open a tab after settings finish loading', async () => {
  const wait = Promise.withResolvers(); let opened = false;
  const host = createNavigationHost({ settings: { readAll: () => wait.promise }, currentSession: () => 's',
    browser: { available: true, newTab: async () => { opened = true; } }, openExternal: async () => { opened = true; } });
  const pending = host.open({ href: 'https://example.test/' }); host.dispose(); wait.resolve({ values: {} });
  await assert.rejects(pending, /closed/); assert.equal(opened, false);
});

test('REA boundaries return actual copy results and surface asynchronous link failures', async t => {
  const calls = [], notices = [], write = Promise.withResolvers();
  const uninstall = installReaServices({ navigation: { open: async args => { calls.push(args); throw Error('navigation denied'); } },
    workspaceFiles: { read: async args => { calls.push(args); return { text: 'fresh file contents' }; } },
    clipboard: { writeText: text => { calls.push(text); return write.promise; } }, notify: (_tone, error) => notices.push(error) });
  t.after(uninstall);
  assert.equal(openBrowserLink({ href: 'javascript:alert(1)' }), false);
  assert.equal(openBrowserLink({ href: 'https://example.test/', event: { callback() {} } }), true); await tick();
  assert.equal(Object.hasOwn(calls[0], 'event'), false);
  assert.deepEqual(notices, ['navigation denied']);
  let settled = false;
  const pending = copyFileContents({ hostId: 'local', path: '/fixture.txt' }).then(value => { settled = true; return value; });
  await tick(); assert.equal(settled, false);
  assert.deepEqual(calls[1], { hostId: 'local', path: '/fixture.txt', representation: 'text' });
  assert.equal(calls[2], 'fresh file contents');
  write.reject(Error('clipboard denied')); assert.equal(await pending, false); assert.equal(notices.at(-1), 'clipboard denied');
});

test('file actions stop on blocked, rejected and synchronously failed preparation', async () => {
  const notices = []; let actions = 0;
  for (const before of [() => false, async () => false, () => { throw Error('sync failure'); }, async () => { throw Error('save failure'); }]) {
    assert.equal(await runFileAction(before, () => { actions++; }, error => notices.push(error.message)), false);
  }
  assert.equal(actions, 0); assert.deepEqual(notices, ['sync failure', 'save failure']);
  const wait = Promise.withResolvers();
  const pending = runFileAction(() => wait.promise, () => ++actions, error => notices.push(error.message));
  await tick(); assert.equal(actions, 0); wait.resolve(); assert.equal(await pending, 1);
  assert.equal(await runFileAction(undefined, () => { throw Error('action failed'); }, error => notices.push(error.message)), false);
  assert.equal(notices.at(-1), 'action failed');
});

test('DSH file actions resolve delivery and relative paths and do not continue cancelled reads', async () => {
  const calls = [], wait = Promise.withResolvers();
  const context = vm.createContext({ AbortController, URL, TextDecoder });
  const module = new vm.SourceTextModule(await readFile(new URL('../src/client/files-host.mjs', import.meta.url), 'utf8'), { context });
  await module.link(name => {
    const values = name === './rea-locale.mjs' ? { reaIntl: () => ({ locale: 'en' }) } : { decodeBase64 };
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const files = module.namespace.createFilesHost({ client: { request: async () => ({ path: '/delivery/file.txt' }) },
    desktop: { files: async (operation, args) => { calls.push([operation, args]); return operation === 'read' ? wait.promise : { success: true }; } } });
  await files.openIn.open({ path: 'file.txt', cwd: '/workspace', hostId: 'local' });
  assert.equal(calls[0][1].path, '/workspace/file.txt'); assert.equal(calls[0][1].target, 'systemDefault');
  await files.openIn.open({ path: 'opencu-file:delivery?id=fixture', hostId: 'local', target: 'fileManager' });
  assert.equal(calls[1][1].path, '/delivery/file.txt'); assert.equal(calls[1][1].target, 'fileManager');
  const pending = files.workspaceFiles.read({ path: '/fixture.txt', representation: 'text' }); await tick(); files.dispose();
  wait.resolve({ contentsBase64: Buffer.from('late content').toString('base64') });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls.length, 3);
});
