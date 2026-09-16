import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_DOCUMENTATION, documentationTopic } from '../src/computer-use/api-docs.mjs';
import { ComputerRuntime } from '../src/computer-use/runtime.mjs';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { NativeHost, defaultNativeBinary } from '../src/computer-use/native.mjs';

const assertNeutral = text => assert.doesNotMatch(text.replaceAll('dsh-preview', ''), /DeepSeek Harness|\bDSH\b|Codex capabilities|TriSoulX/);

test('all reread topics are neutral without changing the return enum or backend limits', () => {
  for (const topic of ['core', 'browser', 'app', 'recovery', 'files', 'screenshots', 'webmcp', 'network']) assertNeutral(documentationTopic(topic));
  for (const exact of ["surface: 'dsh-preview'", "not the user's native Chrome windows", 'without that client it reports a timeout', 'external-Chrome support remains incomplete', 'Created temporary tabs are closed', 'not a backup of script execution']) assert.ok(BROWSER_DOCUMENTATION.includes(exact), exact);
});

test('actual first-use output and capability descriptions are neutral; observed content is untouched', async t => {
  const manager = Object.create(ComputerUseManager.prototype); manager.browser = {};
  const info = manager.browserInfo(manager.browser);
  assert.deepEqual(info, { id: 'browser', name: 'Managed Browser', type: 'managed', profile: 'Computer Use' });
  const source = 'User page: DeepSeek Harness / DSH / Need / dsh web';
  const runtime = new ComputerRuntime(async (method, args) => {
    if (method === 'getBrowser') return info;
    if (method === 'getTab') return { id: 'tab', kind: 'tab', browserId: 'browser' };
    if (method === 'target' && args[1] === 'getAXState') return { state: source };
    return [];
  });
  t.after(() => runtime.reset());
  const initial = await runtime.execute("const browser = await cua.getBrowser({id:'browser'}); nodeRepl.write(await browser.capabilities.list());");
  assert.equal(initial.error, undefined); assertNeutral(initial.blocks.map(b => b.text ?? '').join('\n'));
  assert.match(initial.blocks.at(-1).text, /current conversation/);
  const observed = await runtime.execute("const tab = await cua.getTab('tab',{browser:'browser'});");
  assert.equal(observed.error, undefined); assert.equal(observed.blocks.at(-1).text, source);
});

test('native missing-runtime message is neutral but the installed application path is unchanged', async () => {
  await assert.rejects(NativeHost.prototype.launch.call({ available: () => false }), error => {
    assertNeutral(error.message); assert.match(error.message, /application settings/); return true;
  });
  assert.ok(defaultNativeBinary('/fixture/apps').endsWith('/Oh My DSH Computer Use.app/Contents/MacOS/trisoul-computer-use'));
});
