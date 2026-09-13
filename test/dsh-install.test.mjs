import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { stopFixtureProcess } from './fixtures/process.mjs';
const repo = fileURLToPath(new URL('../', import.meta.url));
const cli = join(repo, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const cuSource = process.env.OPENCU_SOURCE || `file:${repo}`;
const ohmySource = process.env.OPENCU_OHMY_SOURCE;
async function until(fn, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timed out waiting for installed OpenCU');
}
const scenarios = ohmySource ? [['opencu', 'trisoul_x'], ['trisoul_x', 'opencu']] : [['opencu']];
for (const order of scenarios) test('stock DSH install, restart and uninstall: ' + order.join(' → '), { timeout: 240000 }, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'opencu-install-')), home = join(temp, 'home'), workspace = join(temp, 'workspace');
  await mkdir(home); await mkdir(workspace);
  const env = { ...process.env, DSH_HOME: home }; delete env.DSH_PERMISSION_MODE;
  const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: workspace, env, encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
  const payloads = [];
  const provider = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const p = JSON.parse(body); payloads.push(p);
    const done = p.messages.at(-1).role === 'tool' || !p.tools?.some(t => t.function.name === 'computer_use');
    const delta = done ? { content: 'OpenCU installation verified' } : { tool_calls: [{ index: 0, id: 'install-' + payloads.length, type: 'function', function: { name: 'computer_use', arguments: JSON.stringify({ title: '检查已安装的 OpenCU', code: "const installedTab = await cua.createBrowserTab('browser', 'data:text/html,<title>OpenCU installation</title><h1>OpenCU installed</h1>');" }) } }] };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', ...delta }, finish_reason: done ? 'stop' : 'tool_calls' }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise(r => provider.listen(0, '127.0.0.1', r));
  const testBrowser = await testBrowserExecutable(temp);
  const settings = { 'agent-default-model': { provider: 'fixture', model: 'fixture' }, 'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'OPENCU_FIXTURE', models: [{ id: 'fixture', name: 'fixture', contextWindow: 1000000, maxTokens: 1024, input: ['text'] }] } } }, opencu: { computerUseBrowserExecutable: testBrowser, computerUseNativeBinary: join(temp, 'missing-native') }, 'trisoul-x': { stateEnabled: false, probeEnabled: false, flushIdleMs: 3600000 } };
  await writeFile(join(home, 'settings.yaml'), JSON.stringify(settings));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { OPENCU_FIXTURE: 'test-only' } }), { mode: 0o600 });
  let child, log = '', origin, cookie, browser, workspaceId;
  const stop = async () => { if (child?.exitCode === null) await stopFixtureProcess(child); };
  t.after(async () => { await browser?.close(); await stop(); provider.closeAllConnections(); await new Promise(r => provider.close(r)); await rm(temp, { recursive: true, force: true }); });
  const boot = async () => {
    log = ''; child = spawn(process.execPath, [cli, 'web', '--no-open', '--port', '0'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
    const url = await until(() => {
      if (child.exitCode !== null) throw Error(log.replace(/token=\S+/g, 'token=[redacted]'));
      return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0];
    }, 60000);
    origin = new URL(url).origin;
    const response = await fetch(url, { redirect: 'manual' }); cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  };
  const rpc = async (method, args) => {
    const body = await (await fetch(origin + '/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } }) })).json();
    assert.equal(body.result?.ok, true, JSON.stringify(body)); return body.result.value;
  };
  const exercise = async (preset = 'standard', existing) => {
    const before = payloads.length;
    const { sessionId } = await rpc('session/create', { request: { workspaceId, agentPreset: preset, sessionId: existing } });
    await rpc('session/prompt', { request: { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'OpenCU installation verified' }] } });
    await until(() => payloads.slice(before).some(p => p.messages.at(-1).role === 'tool'));
    const p = payloads.slice(before).find(p => p.tools);
    assert.equal(p.tools.filter(t => t.function.name === 'computer_use').length, 1);
    assert.equal(p.tools.filter(t => t.function.name === 'computer_use_reset').length, 1);
    assert.ok(p.tools.some(t => ['bash', 'pwsh'].includes(t.function.name)), 'host tools remain available');
    const result = payloads.slice(before).find(p => p.messages.at(-1).role === 'tool').messages.at(-1);
    assert.doesNotMatch(JSON.stringify(result), /Execution failed:/, 'browser startup cannot pass as an inventory error');
    assert.match(JSON.stringify(result), /OpenCU installed/, 'the installed tool opens and reads an actual browser page');
    const state = await fetch(origin + '/trisoul-x/computer-use/state?session=' + sessionId, { headers: { cookie } });
    assert.equal(state.status, 200);
    assert.equal((await state.json()).enabled, true);
    return sessionId;
  };
  for (const name of order) run(['plugin', '--profile', 'web', 'add', name === 'opencu' ? cuSource : ohmySource]);
  assert.deepEqual(JSON.parse(await readFile(join(home, 'settings.yaml'))), settings, 'installation does not rewrite user settings');
  await boot();
  workspaceId = (await rpc('workspace/create', { request: { path: workspace } })).workspace.workspaceId;
  const id = await exercise();
  if (ohmySource) await exercise('trisoul-x');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: 'zh-CN' }); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.context().addCookies(cookie.split('; ').map(value => { const at = value.indexOf('='); return { name: value.slice(0, at), value: value.slice(at + 1), url: origin }; }));
  await page.goto(origin);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByText('OpenCU installation verified', { exact: true }).first().click();
  const entry = page.getByRole('button', { name: '打开 Computer Use', exact: true });
  await entry.waitFor(); assert.equal(await entry.count(), 1, 'one composer entry');
  await entry.click(); await page.locator('.tx-cu-pane').waitFor();
  assert.equal(await page.locator('.tx-cu-pane').count(), 1, 'one computer pane');
  assert.equal(await page.locator('style[data-plugin="trisoul-x-computer-use"]').count(), 1, 'one CU stylesheet');
  if (ohmySource) assert.equal(await page.getByRole('navigation', { name: '工作台导航' }).count(), 1, 'integrates into Oh My workbench');
  assert.deepEqual(errors, []);
  await browser.close(); browser = undefined;
  await stop(); await boot(); await exercise('standard', id);
  await stop();
  run(['plugin', '--profile', 'web', 'remove', order[0]]);
  await boot();
  if (order.length > 1) {
    await exercise(); await stop();
    run(['plugin', '--profile', 'web', 'remove', order[1]]);
    await boot();
  }
  assert.equal((await fetch(origin + '/trisoul-x/computer-use/state?session=' + id, { headers: { cookie } })).status, 404, 'last uninstall removes the API');
  const before = payloads.length;
  const { sessionId } = await rpc('session/create', { request: { cwd: workspace, agentPreset: 'standard' } });
  await rpc('session/prompt', { request: { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'After uninstall' }] } });
  const finalRequest = await until(() => payloads.slice(before).find(p => p.tools));
  assert.ok(!finalRequest.tools.some(t => t.function.name.startsWith('computer_use')));
});
