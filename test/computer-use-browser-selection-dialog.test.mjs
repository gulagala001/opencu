import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

test('browser text selection and delayed modal answers', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-selection-dialog-'));
  const host = new BrowserHost(join(directory, 'profile'), { executablePath: await testBrowserExecutable(directory) });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  const tab = await host.create('test'), record = await host.target('test', tab.id);
  const call = (method, ...args) => host.invoke('test', tab.id, method, args);
  await record.page.setContent(`<textarea aria-label="文本">甲乙甲乙，尾声</textarea><div role="textbox" aria-label="富文本" contenteditable="true">前<span>中文</span><b>跨节点</b>后</div><iframe title="框架" srcdoc='<textarea aria-label="框架文本">框架中文</textarea>'></iframe><button onclick="window.answer=prompt('中文提示','默认')">提示</button><button onclick="window.answer=confirm('确认')">确认</button>`);
  const state = (await call('getAXState')).state;
  const element = name => { const line = state.split('\n').find(line => line.includes(JSON.stringify(name))); assert.ok(line, state); return Number(line.trim().split(' ')[0]); };
  await t.test('repeated Chinese text refuses ambiguity and selects the contextual occurrence', async () => {
    await assert.rejects(call('selectText', element('文本'), '甲乙'), /exactly once/);
    await call('selectText', element('文本'), '甲乙', { prefix: '甲乙', suffix: '，' });
    await call('typeText', '替换');
    assert.equal(await record.page.locator('textarea').inputValue(), '甲乙替换，尾声');
    await call('selectText', element('文本'), '替换', { selectionType: 'before' }); await call('typeText', '前');
    await call('selectText', element('文本'), '替换', { selectionType: 'after' }); await call('typeText', '后');
    assert.equal(await record.page.locator('textarea').inputValue(), '甲乙前替换后，尾声');
    await assert.rejects(call('selectText', element('文本'), ''), /non-empty/);
    await assert.rejects(call('selectText', element('文本'), '缺失'), /exactly once/);
    await assert.rejects(call('selectText', element('文本'), '替换', { selectionType: 'wrong' }), /selectionType/);
  });
  await t.test('selection spans rich text nodes and uses the element frame', async () => {
    await call('selectText', element('富文本'), '中文跨节点'); await call('typeText', '替代');
    assert.equal(await record.page.getByRole('textbox', { name: '富文本' }).textContent(), '前替代后');
    await call('selectText', element('框架文本'), '中文'); await call('typeText', '替代');
    assert.equal(await record.page.frameLocator('iframe').locator('textarea').inputValue(), '框架替代');
    for (const html of ['前<br>后', '<div>前</div><div>后</div>']) {
      await record.page.getByRole('textbox', { name: '富文本' }).evaluate((element, html) => element.innerHTML = html, html);
      await call('selectText', element('富文本'), '前\n后'); await call('typeText', '完整替换');
      assert.equal(await record.page.getByRole('textbox', { name: '富文本' }).textContent(), '完整替换');
    }
    await record.page.locator('textarea').evaluate(element => element.disabled = true);
    await assert.rejects(call('selectText', element('文本'), '替换'), /disabled input/);
    await record.page.locator('textarea').evaluate(element => element.disabled = false);
    await call('selectText', element('文本'), '替换');
    const previousValue = await record.page.locator('textarea').inputValue();
    await record.page.getByRole('textbox', { name: '富文本' }).evaluate(element => element.contentEditable = 'false');
    await call('selectText', element('富文本'), '完整'); await call('typeText', '不应写入旧字段');
    assert.equal(await record.page.locator('textarea').inputValue(), previousValue);
    await record.page.getByRole('textbox', { name: '富文本' }).evaluate(element => { element.contentEditable = 'true'; element.innerHTML = '<p>第一段</p><p>第二段</p>'; });
    await assert.rejects(call('selectText', element('富文本'), '第一段'), /cannot be mapped exactly/);
  });
  await t.test('prompt accept and confirm dismiss survive the triggering click deadline', async () => {
    record.page.setDefaultTimeout(300);
    for (const [name, action, value, expected] of [['提示', 'dialog.accept', '回答中文', '回答中文'], ['确认', 'dialog.dismiss', undefined, false]]) {
      assert.ok((await call('click', element(name))).dialog);
      await delay(600);
      assert.ok(await call('dialog.get'));
      const answer = await call(action, value);
      assert.equal(answer.dialogHandled, true); assert.equal(answer.triggeringActionError.name, 'TimeoutError');
      assert.equal(await record.page.evaluate(() => window.answer), expected);
      assert.equal(await call('dialog.get'), null);
    }
    await record.page.evaluate(() => { document.querySelector('button').onclick = () => { window.firstAnswer = prompt('第一问'); window.answer = prompt('第二问'); }; });
    assert.ok((await call('click', element('提示'))).dialog);
    await delay(600);
    await call('dialog.accept', '第一答');
    let second; for (let i = 0; i < 20 && !second; i++) { second = await call('dialog.get'); if (!second) await delay(20); }
    assert.equal(second?.message, '第二问');
    await delay(600);
    await call('dialog.accept', '第二答');
    assert.deepEqual(await record.page.evaluate(() => [window.firstAnswer, window.answer]), ['第一答', '第二答']);
    await record.page.evaluate(() => { const button = document.createElement('button'); button.textContent = '禁用目标'; button.disabled = true; button.onclick = () => window.clicked = true; document.body.append(button); window.clicked = false; setTimeout(() => prompt('无关定时弹窗'), 50); });
    assert.ok((await call('locator', [{ method: 'getByRole', args: ['button', { name: '禁用目标' }] }], 'click', [])).dialog);
    await delay(600);
    const unrelatedAnswer = await call('dialog.accept', '回答');
    assert.equal(unrelatedAnswer.dialogHandled, true); assert.match(unrelatedAnswer.triggeringActionError.message, /Timeout/);
    assert.equal(await record.page.evaluate(() => window.clicked), false);
    await record.page.evaluate(() => { const button = document.createElement('button'); button.textContent = '按下目标'; button.onmousedown = () => window.answer = prompt('按下提示'); button.onclick = () => window.clicked = true; document.body.append(button); window.clicked = false; });
    assert.ok((await call('locator', [{ method: 'getByRole', args: ['button', { name: '按下目标' }] }], 'click', [{timeout:300,delay:1000}])).dialog);
    await delay(600);
    const heldAnswer = await call('dialog.accept', '按下回答');
    assert.equal(heldAnswer.dialogHandled, true); assert.match(heldAnswer.triggeringActionError.message, /Timeout/);
    assert.deepEqual(await record.page.evaluate(() => [window.clicked,window.answer]), [false,'按下回答']);
    await assert.rejects(call('locator', [{ method: 'getByRole', args: ['button', { name: '不存在' }] }], 'click', []), /Timeout/);
  });
});
