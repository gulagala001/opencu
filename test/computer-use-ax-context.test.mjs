import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

test('a repeated AX name carries one disambiguating context while a unique name stays unchanged', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-ax-context-'));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><title>Context fixture</title>'
      + '<section aria-label="Project Alpha"><h2>Project Alpha</h2><button>Save</button></section>'
      + '<section aria-label="Project Beta"><h2>Project Beta</h2><button>Save</button></section>'
      + '<div><span>张三 · 请假三天</span><button>批准</button></div>'
      + '<div><span>李四 · 报销一千二</span><button>批准</button></div>'
      + '<button data-unique>唯一动作</button>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  t.after(async () => { await manager.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const run = async code => {
    const result = await manager.execute('context', code);
    assert.equal(result.error, undefined, JSON.stringify({ error: result.error, operations: manager.status('context').history.slice(-4) }));
    return result.blocks.filter(block => block.type === 'text' && block.text.startsWith('Tab ')).at(-1)?.text;
  };
  await run(`const tab=await cua.createBrowserTab('browser', ${JSON.stringify(url)}); await tab.playwright.waitForLoadState('load');`);
  const state = await run('await tab.getAXState({disableDiffing:true});');
  const row = name => state.split('\n').find(line => line.includes(`button ${JSON.stringify(name)}`));
  assert.match(row('Save'), /\[ctx: "Project Alpha"\]/, state);
  assert.match(state.split('\n').filter(line => line.includes('button "Save"')).join('\n'), /\[ctx: "Project Beta"\]/, state);
  assert.match(row('批准'), /\[ctx: "张三 · 请假三天"\]/, state);
  assert.match(state.split('\n').filter(line => line.includes('button "批准"')).join('\n'), /\[ctx: "李四 · 报销一千二"\]/, state);
  assert.doesNotMatch(row('唯一动作'), /\[ctx:/, 'a name that occurs once must not pay for context');
  const saves = state.split('\n').filter(line => line.includes('button "Save"')).map(line => line.replace(/^\s*\d+\s*/, ''));
  assert.equal(new Set(saves).size, 2, 'the two repeated rows must no longer read identically');

  const record = await manager.browser.target('context', manager.status('context').target.id);
  await record.page.locator('button', { hasText: '批准' }).nth(1).evaluate(button => { button.disabled = true; });
  const diff = await run('await tab.getAXState();');
  assert.match(diff, /~ .* button "批准" \[ctx: "李四 · 报销一千二"\] \[disabled=true\]/, diff);
});

test('context keeps ownership, quoted data, frame identity and complete budgeted observations', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-ax-context-regression-'));
  let origin;
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const route = new URL(req.url, origin).pathname;
    const cases = {
      '/scopes': '<section aria-label="Alpha"><button>Download</button><span id="status">Pending 0</span><button>Save</button></section><section aria-label="Beta] [disabled=true"><button>Save</button></section>',
      '/cards': '<div><h2>Read-only Alpha</h2></div><div><button>Save</button></div><div><h2>Beta</h2><button>Save</button></div>',
      '/child': '<section aria-label="Child"><button>Save</button></section>',
      '/frames': '<section aria-label="Main"><button>Save</button></section><iframe src="' + origin.replace('127.0.0.1', 'localhost') + '/child"></iframe>',
      '/budget': Array.from({ length: 150 }, (_, i) => `<div><span>Project ${String(i).padStart(3, '0')} ${'x'.repeat(208)}</span><button>Save</button></div>`).join('') + '<button>END_MARKER</button>',
    };
    res.end('<!doctype html><meta charset="utf-8"><title>Context regression</title>' + cases[route]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  t.after(async () => { await manager.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const run = async code => {
    const result = await manager.execute('regression', code);
    assert.equal(result.error, undefined, JSON.stringify(result.error));
    return result.blocks.filter(block => block.type === 'text').map(block => block.text).join('\n');
  };
  await run(`const tab=await cua.createBrowserTab('browser', ${JSON.stringify(origin + '/scopes')}); await tab.playwright.waitForLoadState('load');`);
  const record = await manager.browser.target('regression', manager.status('regression').target.id);
  const full = () => run('await tab.getAXState({disableDiffing:true});');
  const saves = state => state.split('\n').filter(line => line.includes('button "Save"'));
  const scopeState = await full();
  assert.match(saves(scopeState)[0], /\[ctx: "Alpha"\]/);
  assert.match(saves(scopeState)[1], /\[ctx: "Beta\] \[disabled=true"\]$/);
  assert.equal(await record.page.locator('button').last().isDisabled(), false);
  await record.page.locator('#status').evaluate(node => { node.textContent = 'Pending 1'; });
  assert.equal(saves(await run('await tab.getAXState();')).length, 0, 'nearby status must not re-report unchanged actions');
  await run(`await tab.goto(${JSON.stringify(origin + '/cards')}); await tab.playwright.waitForLoadState('load');`);
  const cards = saves(await full());
  assert.doesNotMatch(cards[0], /\[ctx:/, 'unlabeled card must not borrow the read-only card heading');
  assert.match(cards[1], /\[ctx: "Beta"\]/);
  await run(`await tab.goto(${JSON.stringify(origin + '/frames')}); await tab.playwright.waitForLoadState('load');`);
  const child = record.page.frames().find(frame => frame !== record.page.mainFrame());
  assert(child); await child.waitForLoadState('load');
  const before = saves(await full());
  assert.match(before[0], /\[ctx: "Main"\]/); assert.match(before[1], /\[ctx: "Child"\]/);
  await child.locator('button').evaluate(node => { node.disabled = true; });
  const changed = saves(await run('await tab.getAXState();'));
  assert.equal(changed.length, 1); assert.match(changed[0], /\[ctx: "Child"\] \[disabled=true\]/);
  assert.deepEqual(saves(await full()).map(line => line.trim().split(' ')[0]), before.map(line => line.trim().split(' ')[0]));
  await run(`await tab.goto(${JSON.stringify(origin + '/budget')}); await tab.playwright.waitForLoadState('load');`);
  const budget = await full();
  assert.equal(saves(budget).length, 150); assert.match(budget, /button "END_MARKER"/);
  assert.ok(Buffer.byteLength(budget) <= 48000); assert.doesNotMatch(budget, /Computer Use output truncated/);
  await record.page.locator('body').evaluate(node => { node.innerHTML = node.innerHTML; });
  const replacement = await run('await tab.getAXState();');
  assert.equal(saves(replacement).length, 150); assert.match(replacement, /button "END_MARKER"/);
  assert.ok(Buffer.byteLength(replacement) <= 48000); assert.doesNotMatch(replacement, /Computer Use output truncated/);
  assert.match(await run('await tab.getAXState();'), /No accessibility changes/);
});
