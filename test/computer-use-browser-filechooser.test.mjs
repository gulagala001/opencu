import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserHost } from '../src/computer-use/browser.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

test('file chooser accepts an in-flight event and remains cancellable', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-filechooser-'));
  const host = new BrowserHost(join(directory, 'profile'), { executablePath: await testBrowserExecutable(directory) });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  const tab = await host.create('test'), record = await host.target('test', tab.id);
  const call = (method, ...args) => host.invoke('test', tab.id, method, args);
  const file = join(directory, '中文文件.txt'); await writeFile(file, '中文内容');
  await record.page.setContent('<input type="file" aria-label="上传" multiple>');
  const click = () => call('locator', [{ method: 'getByLabel', args: ['上传'] }], 'click', []);
  await t.test('direct click and setFiles complete with the real file bytes', async () => {
    for (let i = 0; i < 3; i++) {
      await click(); await call('filechooser.setFiles', [file]);
      assert.deepEqual(await record.page.locator('input').evaluate(input => Array.from(input.files, file => ({name:file.name,size:file.size}))), [{name:'中文文件.txt',size:12}]);
    }
  });
  await t.test('a chooser event dispatched after click completion does not require a retry', async () => {
    const emit = record.page.emit;
    record.page.emit = function(event, ...args) { if (event === 'filechooser') { setTimeout(() => emit.call(this, event, ...args), 100); return true; } return emit.call(this, event, ...args); };
    try { await click(); assert.equal(record.filechooser, null); await call('filechooser.setFiles', [file]); }
    finally { record.page.emit = emit; }
    assert.equal(await record.page.locator('input').evaluate(input => input.files[0].name), '中文文件.txt');
    assert.equal(record.filechooser, null);
  });
  await t.test('no chooser still reports an explicit error and cancellation stops waiting', async () => {
    await assert.rejects(call('filechooser.setFiles', [file]), /No file chooser is open/);
    const controller = new AbortController();
    const pending = host.invoke('test', tab.id, 'filechooser.setFiles', [[file]], controller.signal);
    const rejected = assert.rejects(pending, /User stopped/);
    await delay(30); controller.abort(new Error('User stopped'));
    await rejected;
  });
});
