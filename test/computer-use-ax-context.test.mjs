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
  assert.match(row('Save'), /\[ctx: Project Alpha\]/, state);
  assert.match(state.split('\n').filter(line => line.includes('button "Save"')).join('\n'), /\[ctx: Project Beta\]/, state);
  assert.match(row('批准'), /\[ctx: 张三 · 请假三天\]/, state);
  assert.match(state.split('\n').filter(line => line.includes('button "批准"')).join('\n'), /\[ctx: 李四 · 报销一千二\]/, state);
  assert.doesNotMatch(row('唯一动作'), /\[ctx:/, 'a name that occurs once must not pay for context');
  const saves = state.split('\n').filter(line => line.includes('button "Save"')).map(line => line.replace(/^\s*\d+\s*/, ''));
  assert.equal(new Set(saves).size, 2, 'the two repeated rows must no longer read identically');

  const record = await manager.browser.target('context', manager.status('context').target.id);
  await record.page.locator('button', { hasText: '批准' }).nth(1).evaluate(button => { button.disabled = true; });
  const diff = await run('await tab.getAXState();');
  assert.match(diff, /~ .* button "批准" \[ctx: 李四 · 报销一千二\] \[disabled=true\]/, diff);
});
