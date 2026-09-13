import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { ComputerRuntime } from '../src/computer-use/runtime.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

test('a handled dialog retains its triggering failure in real runtime output and session statistics', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-dialog-outcome-'));
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing') } });
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  const run = code => manager.execute('test', code, {});
  assert.equal((await run("let tab=await cua.createBrowserTab('iab','about:blank');")).error, undefined);
  const record = await manager.browser.target('test', manager.session('test').target.id);
  await record.page.setContent('<button onclick="window.answer=prompt(\'Answer\')">Open</button>');
  record.page.setDefaultTimeout(150);
  const unrelated = await run("await tab.playwright.evaluate(()=>({dialogHandled:true,triggeringActionError:{message:'ordinary page data'}}));");
  assert.equal(unrelated.error, undefined);
  assert.equal(unrelated.blocks.length, 0, 'page data cannot impersonate a dialog outcome');
  assert.equal(manager.status('test').operationStats.failed, 0);
  const observed = await run('await tab.getAXState({disableDiffing:true});');
  const state = observed.blocks.map(block => block.text ?? '').join('\n');
  const id = Number(state.match(/^\s*(\d+) button "Open"/m)?.[1]);
  assert.ok(id, state);
  assert.equal((await run(`await tab.click(${id});`)).error, undefined);
  await delay(350);
  const answered = await run("await tab.dialog.accept('中文');");
  assert.equal(answered.error, undefined, 'answering the dialog succeeded and must not request a retry');
  assert.match(answered.blocks.map(block => block.text ?? '').join('\n'), /Dialog handled successfully[\s\S]*triggering action failed[\s\S]*Timeout/);
  assert.equal(await record.page.evaluate(() => window.answer), '中文');
  const status = manager.status('test');
  assert.equal(status.operationStats.failed, 1);
  assert.equal(status.history.at(-1).dialogHandled, true);
  assert.equal(status.history.at(-1).ok, false);
  assert.match(status.lastError.message, /Dialog handled successfully; the triggering action failed/);
  for (let n = 0; n < 61; n++) await run('await tab.getAXState({emit:false});');
  assert.equal(manager.status('test').operationStats.failed, 1, 'failure evidence survives history trimming');
  assert.equal(manager.status('test').history.length, 60);
});

test('repeated triggering-action warnings share the runtime output limit', async t => {
  const runtime = new ComputerRuntime(async (method, args) => {
    if (method === 'createBrowserTab') return { id: 'tab', kind: 'tab', browserId: 'browser' };
    if (method === 'target' && args[1] === 'getAXState') return { state: '1 button Open' };
    return { dialogHandled: true, triggeringActionError: { name: 'TimeoutError', message: 'x'.repeat(9000) } };
  });
  t.after(() => runtime.reset());
  const result = await runtime.execute("let tab=await cua.createBrowserTab('iab'); for(let n=0;n<10;n++)await tab.dialog.accept('answer');");
  const output = result.blocks.filter(block => block.type === 'text').map(block => block.text).join('\n');
  assert.equal(result.error, undefined);
  assert.match(output, /Dialog handled successfully[\s\S]*triggering action failed/);
  assert.match(output, /Computer Use output truncated/);
  assert.ok(Buffer.byteLength(output) <= 48000, 'automatic warnings must not bypass the normal output budget');
});
