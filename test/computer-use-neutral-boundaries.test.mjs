import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerRuntime } from '../src/computer-use/runtime.mjs';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { NativeHost } from '../src/computer-use/native.mjs';
import { documentationTopic } from '../src/computer-use/api-docs.mjs';
const branding = /\bDSH\b|DeepSeek Harness|TriSoulX|Claude Code|Codex/;
const prose = text => text.replaceAll("'dsh-preview'", "'<protocol-literal>'");

test('all emitted documentation topics are neutral while the return contract is exact', () => {
  for (const topic of ['core', 'browser', 'app', 'recovery', 'files', 'screenshots', 'webmcp', 'network']) {
    assert.doesNotMatch(prose(documentationTopic(topic)), branding, topic);
  }
  const browser = documentationTopic('browser');
  assert.match(browser, /surface: 'dsh-preview'/);
  assert.match(browser, /not the user's native Chrome windows/);
  assert.match(browser, /without that client it reports a timeout/);
  assert.match(browser, /external-Chrome support remains incomplete/);
});
test('actual first-use output and capability listings are neutral, but task data is not rewritten', async t => {
  const backend = {};
  const info = ComputerUseManager.prototype.browserInfo.call({ browser: backend }, backend);
  assert.deepEqual(info, { id: 'browser', name: 'Managed Browser', type: 'managed', profile: 'Computer Use' });
  const runtime = new ComputerRuntime(async method => method === 'getBrowser' ? info : []);
  t.after(() => runtime.reset());
  const selected = await runtime.execute("const browser = await cua.getBrowser({id:'browser'}); nodeRepl.write(await browser.capabilities.list());");
  assert.equal(selected.error, undefined);
  assert.doesNotMatch(prose(selected.blocks.map(b => b.text || '').join('\n')), branding);
  assert.match(selected.blocks.map(b => b.text || '').join('\n'), /current conversation/);
  const data = await runtime.execute("nodeRepl.write('DSH is user task data; keep it exact.');");
  assert.equal(data.blocks[0].text, 'DSH is user task data; keep it exact.');
});
test('unavailable native runtime reports neutral guidance without installing or launching anything', async () => {
  await assert.rejects(NativeHost.prototype.launch.call({ available: () => false }), error => {
    assert.doesNotMatch(error.message, branding);
    assert.match(error.message, /not installed/);
    return true;
  });
});
test('preview precondition errors use neutral wording and still reject invalid actions', async () => {
  const manager = { session: () => ({ target: null }), browserFor: () => ({}) };
  await assert.rejects(ComputerUseManager.prototype.presentBrowser.call(manager, 'test', 'browser', true), error => {
    assert.match(error.message, /Select a tab/);
    assert.doesNotMatch(error.message, branding);
    return true;
  });
});
