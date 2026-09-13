import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

test('AX identities survive unrelated frame navigation while navigated subtrees and whole-page observations expire', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-frame-ax-'));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url.startsWith('/grandchild')) res.end('<input aria-label="Grandchild note">');
    else if (req.url.startsWith('/child')) res.end('<input aria-label="Child note"><iframe src="/grandchild"></iframe>');
    else res.end('<!doctype html><title>Frame identity fixture</title><input aria-label="Main note"><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Main save</button><output>not saved</output><iframe src="/child"></iframe>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  t.after(async () => { await manager.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const run = async code => {
    const result = await manager.execute('frames', code);
    assert.equal(result.error, undefined, JSON.stringify({ error: result.error, operations: manager.status('frames').history.slice(-4) }));
    return result.blocks.filter(block => block.type === 'text' && block.text.startsWith('Tab ')).at(-1)?.text;
  };
  const read = () => run('await tab.getAXState({disableDiffing:true});');
  const ids = state => {
    const find = (role, name) => {
      const line = state.split('\n').find(line => line.includes(`${role} ${JSON.stringify(name)}`));
      assert.ok(line, `${role} ${name}\n${state}`); return Number(line.trim().split(' ')[0]);
    };
    return { main: find('textbox', 'Main note'), save: find('button', 'Main save'), child: find('textbox', 'Child note'), grandchild: find('textbox', 'Grandchild note') };
  };
  const rejects = async (id, action = 'setValue') => {
    const result = await manager.execute('frames', `await tab.${action}(${id}${action === 'setValue' ? ", 'must not write'" : ''});`);
    assert.match(result.error?.message, /old or detached page/, 'an observation from the changed document must not act on its replacement');
  };
  await run(`const tab=await cua.createBrowserTab('browser', ${JSON.stringify(url)}); await tab.playwright.waitForLoadState('load');`);
  const record = await manager.browser.target('frames', manager.status('frames').target.id);
  const original = ids(await read()), main = record.page.mainFrame(), mainUrl = main.url();
  const child = record.page.frames().find(frame => frame.url() === url + '/child');
  const oldGrandchild = record.page.frames().find(frame => frame.url() === url + '/grandchild');
  const generation = record.generation;
  const navigated = new Promise(resolve => record.page.on('framenavigated', frame => { if (frame === child && frame.url() === url + '/child-next') resolve(); }));
  await child.evaluate(() => setTimeout(() => { location.href = '/child-next'; }, 50));
  await navigated;
  assert.ok(record.generation > generation, 'child navigation still invalidates whole-page snapshots and screenshot geometry');
  assert.equal(main.url(), mainUrl);
  assert.equal(oldGrandchild.isDetached(), true, 'the ancestor navigation actually replaced the nested frame');
  await run(`await tab.setValue(${original.main}, '主文档仍可操作'); await tab.click(${original.save});`);
  assert.equal(await record.page.locator('output').textContent(), '主文档仍可操作');
  await rejects(original.child); await rejects(original.grandchild);
  await child.waitForLoadState('load');
  const afterChild = ids(await read());
  assert.equal(afterChild.main, original.main); assert.equal(afterChild.save, original.save);
  assert.notEqual(afterChild.child, original.child); assert.notEqual(afterChild.grandchild, original.grandchild);

  const grandchild = record.page.frames().find(frame => frame.url() === url + '/grandchild');
  const beforeNested = record.generation;
  await grandchild.goto(url + '/grandchild-next');
  assert.ok(record.generation > beforeNested);
  await run(`await tab.setValue(${afterChild.main}, '主文档保留'); await tab.setValue(${afterChild.child}, '父框架保留');`);
  await rejects(afterChild.grandchild);
  const afterGrandchild = ids(await read());
  assert.equal(afterGrandchild.main, original.main); assert.equal(afterGrandchild.save, original.save); assert.equal(afterGrandchild.child, afterChild.child);
  assert.notEqual(afterGrandchild.grandchild, afterChild.grandchild);

  const beforeMain = record.generation;
  await run(`await tab.goto(${JSON.stringify(url + '/?new-main=1')});`);
  assert.ok(record.generation > beforeMain);
  for (const id of [afterGrandchild.main, afterGrandchild.child, afterGrandchild.grandchild]) await rejects(id);
  await rejects(afterGrandchild.save, 'click');
});
