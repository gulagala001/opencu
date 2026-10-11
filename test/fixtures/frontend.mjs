import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, rmdir, readdir, readFile, lstat, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { browserExecutablePath } from '../../src/computer-use/browser.mjs';
import { isolateTestDownloads, testBrowserExecutable } from './computer-use/test-browser.mjs';
import { stopFixtureProcess, cleanupFixture, closeFixtureServer } from './process.mjs';

export async function until(fn, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await delay(50); }
  throw new Error('Frontend fixture timed out');
}

export async function frontendFixture(t, { clientProbe, stockChat = false, toolMode = 'native' } = {}) {
  const trace = phase => { if (process.env.OPENCU_FIXTURE_TRACE === '1') console.error('frontend-fixture:', phase); };
  trace('start');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'trisoul-frontend-'))), home = join(root, 'home'), workspace = join(root, 'workspace'), userHome=join(root,'user-home');
  await mkdir(home); await mkdir(workspace);
  await Promise.all(['user-home','tmp','cache','config','share','npm-cache','pnpm-store','pi-agent','client-profile'].map(name=>mkdir(join(root,name),{recursive:true})));
  const npmrc=join(root,'public.npmrc');
  const store=process.env.OPENCU_FRONTEND_PUBLIC_STORE||execFileSync(process.platform==='win32'?'pnpm.cmd':'pnpm',['store','path'],{cwd:new URL('../../',import.meta.url),encoding:'utf8',shell:process.platform==='win32'}).trim();
  await mkdir(store,{recursive:true});
  await writeFile(npmrc,'registry=https://registry.npmjs.org/\nstore-dir='+store+'\nprefer-offline=true\n',{mode:0o600});
  // No inherited account, provider, proxy or npm authentication environment.
  const env={};for(const key of ['PATH','LANG','LC_ALL','TZ','TERM','SystemRoot','WINDIR','ComSpec','PATHEXT'])if(process.env[key])env[key]=process.env[key];
  Object.assign(env,{COREPACK_ENABLE_DOWNLOAD_PROMPT:'0',OPENCU_SOURCE_ONLY:'1',HOME:userHome,USERPROFILE:userHome,DSH_HOME:home,PI_CODING_AGENT_DIR:join(root,'pi-agent'),XDG_CACHE_HOME:join(root,'cache'),XDG_CONFIG_HOME:join(root,'config'),XDG_DATA_HOME:join(root,'share'),TMPDIR:join(root,'tmp'),TMP:join(root,'tmp'),TEMP:join(root,'tmp'),npm_config_userconfig:npmrc,NPM_CONFIG_USERCONFIG:npmrc,npm_config_registry:'https://registry.npmjs.org/',NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/',npm_config_cache:join(root,'npm-cache'),NPM_CONFIG_CACHE:join(root,'npm-cache'),npm_config_store_dir:store,COREPACK_HOME:process.env.OPENCU_FRONTEND_COREPACK_HOME||join(homedir(),'.cache/node/corepack'),CI:'true',PLAYWRIGHT_BROWSERS_PATH:process.env.PLAYWRIGHT_BROWSERS_PATH||join(root,'browser-cache')});
  const registrationPaths=process.platform==='darwin'?[join(homedir(),'Library/Application Support/Google/Chrome/NativeMessagingHosts/ai.trisoul.computer_use.json'),'/Library/Google/Chrome/NativeMessagingHosts/ai.trisoul.computer_use.json']:process.platform==='linux'?[join(homedir(),'.config/google-chrome/NativeMessagingHosts/ai.trisoul.computer_use.json'),'/etc/opt/chrome/native-messaging-hosts/ai.trisoul.computer_use.json']:[];
  const snapshot=async path=>{try{const info=await lstat(path);return{exists:true,mode:info.mode,realpath:await realpath(path),sha256:createHash('sha256').update(await readFile(path)).digest('hex')};}catch(error){if(error.code==='ENOENT')return{exists:false};throw error;}};
  const registrationBefore=await Promise.all(registrationPaths.map(snapshot));
  const evidence=process.env.OPENCU_FRONTEND_EVIDENCE;
  const output=evidence&&join(evidence,t.name.replace(/[^a-z0-9]+/gi,'-').slice(0,90));
  if(output)await mkdir(output,{recursive:true});
  const registrationGuard=async()=>{const after=await Promise.all(registrationPaths.map(snapshot));assert.deepEqual(after,registrationBefore,'frontend fixture must not change global CU native messaging registration');return{before:registrationBefore,after,paths:registrationPaths,passed:true,platform:process.platform};};
  trace('before-browser-executable');
  const cft=process.env.TRISOUL_CU_TEST_BROWSER_EXECUTABLE||browserExecutablePath();
  const executablePath=await testBrowserExecutable(root,cft);
  trace('browser-executable-ready');
  await isolateTestDownloads(root, join(home, 'trisoul-x/computer-use/browser-profile'));
  await isolateTestDownloads(root, join(root, 'chrome-profile'));
  let nextReply, releaseReply, replyFactory;
  let log = '', browser, page, child, effectiveSetup; const errors = [];
  const provider = createServer(async (req, res) => {
    let request = ''; for await (const chunk of req) request += chunk; const payload = JSON.parse(request);
    if (payload.tools?.length && nextReply) { const waiting = nextReply; nextReply = null; await waiting; }
    const custom=payload.tools?.length&&await replyFactory?.(payload);
    if(custom){res.writeHead(200,{'Content-Type':'text/event-stream'});const chunks=custom[Symbol.asyncIterator]?custom:Array.isArray(custom)?custom:[custom];for await(const chunk of chunks)res.write('data: '+JSON.stringify({id:'ui',object:'chat.completion.chunk',model:'fixture',choices:[{index:0,...chunk}]})+'\n\n');res.end('data: [DONE]\n\n');return;}
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: ' + JSON.stringify({ id: 'ui', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content: !payload.tools?.length ? '整理工作台和对话界面' : '已经梳理好今天的工作。\n\n我们会先整理对话与侧栏，再完善电脑操控的实时预览。所有进展都可以在右侧工作台查看。\n\n- 任务：查看当前进展和验证结果\n- 记忆：保留项目约定与重要决定\n- 电脑：查看网页和应用的实时画面\n\n接下来可以继续处理具体页面。' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  });
  t.after(async () => {
    releaseReply?.();
    let guard;
    await cleanupFixture([
      async () => { if(page&&!page.isClosed()){if(process.env.TRISOUL_UI_ARTIFACTS)await page.screenshot({path:join(root,'final-state.png')});if(output){await page.screenshot({path:join(output,'final-state.png')});await writeFile(join(output,'final-state.html'),await page.content());}}if(output)await writeFile(join(output,'host-log.txt'),log.replace(/token=\S+/g,'token=[redacted]')); },
      () => browser?.close(),
      async () => {if(child){await stopFixtureProcess(child);assert.notEqual(child.signalCode,'SIGKILL','fixture host requires graceful cleanup');}},
      () => provider.listening ? closeFixtureServer(provider) : undefined,
      async () => {guard=await registrationGuard();const file=join(root,'chrome-profile/NativeMessagingHosts/ai.trisoul.computer_use.json');try{const registration=JSON.parse(await readFile(file,'utf8'));assert.ok(resolve(registration.path).startsWith(resolve(root)+sep),'fixture native messaging launcher must be owned');guard.ownedRegistration={...await snapshot(file),path:file,launcher:registration.path};}catch(error){if(error.code!=='ENOENT')throw error;}},
      async () => {const extensionPath=effectiveSetup?.extension?.installation?.extensionPath;if(extensionPath){const ownedDirectory=dirname(dirname(extensionPath));assert.ok(ownedDirectory.startsWith(resolve(root)+sep));const bridge=join(process.platform==='darwin'?'/private/tmp':tmpdir(),'trisoul-cu-'+createHash('sha256').update(resolve(ownedDirectory)).digest('hex').slice(0,24));let existed=false;try{const info=await lstat(bridge);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===process.getuid());assert.deepEqual(await readdir(bridge),[],'bridge socket must close gracefully before owned directory cleanup');existed=true;await rmdir(bridge);}catch(error){if(error.code!=='ENOENT')throw error;}guard.ownedBridge={path:bridge,existed,removed:true};}},
      async () => {if(output)await writeFile(join(output,'fixture-isolation.json'),JSON.stringify({scope:'isolated official Web frontend fixture; OS desktop binary absent',root,home:userHome,workspace,cft,executablePath,publicNpmrc:npmrc,publicStore:store,piDirectory:env.PI_CODING_AGENT_DIR,corepackHome:env.COREPACK_HOME,effectiveSetup,globalRegistration:guard,errors},null,2));},
      async () => { if (!process.env.TRISOUL_UI_ARTIFACTS) await rm(root, { recursive: true, force: true });if(output)await writeFile(join(output,'cleanup.json'),JSON.stringify({rootRemoved:!process.env.TRISOUL_UI_ARTIFACTS,retainedForArtifacts:!!process.env.TRISOUL_UI_ARTIFACTS,errors},null,2)); },
    ]);
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  await writeFile(join(home, 'settings.yaml'), JSON.stringify({
    'llm-pi-ai': { providers: { fixture: { api: 'openai-completions', baseURL: `http://127.0.0.1:${provider.address().port}/v1`, apiKeyEnv: 'FRONTEND_FIXTURE', models: [{ id: 'fixture', name: '界面预览模型', contextWindow: 1000000, maxTokens: 8192, input: ['text', 'image'], ...clientProbe ? { reasoningEfforts: { high: 'high' } } : {} }] } } },
    'agent-default-model': { provider: 'fixture', model: 'fixture' },
    'opencu': { computerUseBrowserExecutable: executablePath, computerUseNativeBinary: join(root, 'missing-native'), computerUseChromeUserDataDir: join(root, 'chrome-profile') },
  }));
  await writeFile(join(home, '.credentials.yaml'), JSON.stringify({ version: 1, refs: { FRONTEND_FIXTURE: 'local-test-only' } }), { mode: 0o600 });
  if (clientProbe) {
    const repo = new URL('../../', import.meta.url), probe = join(root, 'chat-probe');
    await mkdir(probe);
    await writeFile(join(probe, 'package.json'), JSON.stringify({ name: 'opencu-chat-probe', version: '0.0.0', type: 'module', main: 'index.mjs', exports: { '.': './index.mjs', './client': './client.js', './package.json': './package.json' }, dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-renderer'] } } }));
    await writeFile(join(probe, 'index.mjs'), 'export function apply() {}\n');
    await writeFile(join(probe, 'client.js'), clientProbe);
    await writeFile(join(probe, 'cordis.patch.yml'), '- insert:\n  - id: opencu-chat-probe\n    name: opencu-chat-probe\n');
    const cli = await realpath(process.env.OMD_DSH_CLI || new URL('node_modules/@deepseek-ai/dsh/lib/bin.js', repo).pathname);
    for (const source of [...stockChat ? [] : [process.env.OPENCU_SOURCE || 'link:' + repo.pathname], 'link:' + probe]) execFileSync(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', source], { cwd: workspace, env, stdio: 'pipe' });
  }
  const cli = await realpath(process.env.OMD_DSH_CLI || new URL('../../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url).pathname);
  trace('before-plugin-install');
  if (!stockChat && !clientProbe) execFileSync(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', process.env.OPENCU_SOURCE || 'link:' + new URL('../../', import.meta.url).pathname], { cwd: workspace, env, stdio: 'pipe' });
  trace('plugin-installed');
  const startHost = () => {
    const child = spawn(process.execPath, [cli, 'web', '--no-open', '--port', '0'], { cwd: workspace, env: { ...env, OMD_DSH_CLI:cli, PORT: '0', DSH_TOOLS_MODE: toolMode }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { log = (log + data).slice(-15000); });
    child.stderr.on('data', data => { log = (log + data).slice(-15000); });
    return child;
  };
  child = startHost();
  let origin, cookie;
  const connectHost = async () => {
    const bootstrap = await until(() => { if (child.exitCode !== null) throw new Error(log.replace(/token=\S+/g, 'token=[redacted]')); return log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)?.[0]; }, 45000).catch(error => { throw new Error(error.message + '\n' + log.replace(/token=\S+/g, 'token=[redacted]')); });
    origin = new URL(bootstrap).origin;
    const login = await fetch(bootstrap, { redirect: 'manual' });
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  };
  await connectHost();
  trace('host-connected');
  const rpc = async (method, request) => {
    const response = await fetch(origin + '/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args: request === undefined ? {} : { request } } }) });
    const value = await response.json(); if (!value.result?.ok) throw new Error(JSON.stringify(value)); return value.result.value;
  };
  await until(async () => (await rpc('llm/listProviders')).some(provider => provider.id === 'fixture'));
  const registered = await rpc('workspace/create', { path: workspace });
  const { sessionId } = await rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'standard' });
  if(!stockChat){const response=await fetch(origin+'/trisoul-x/computer-use/setup?session='+encodeURIComponent(sessionId),{headers:{cookie}});assert.equal(response.status,200);effectiveSetup=await response.json();const path=effectiveSetup.extension?.installation?.registrationPath;if(path)assert.ok(resolve(path).startsWith(resolve(root)+sep),'actual CU extension registration must resolve inside the fixture');assert.equal(effectiveSetup.native?.installed,false,'frontend fixture OS desktop binary must be absent');await registrationGuard();}
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '整理工作台和对话界面' }] });
  await isolateTestDownloads(root,join(root,'client-profile'));
  browser = await chromium.launchPersistentContext(join(root,'client-profile'),{headless:true,executablePath,env,args:process.platform==='darwin'?['--use-mock-keychain','--password-store=basic']:[],downloadsPath:join(root,'client-profile/fixture-downloads'),viewport:{width:1440,height:1000},colorScheme:'light',locale:'zh-CN'});
  const context = browser;
  await context.addCookies(cookie.split('; ').map(value => { const index = value.indexOf('='); return { name: value.slice(0, index), value: value.slice(index + 1), url: origin }; }));
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  trace('browser-client-ready');
  await page.goto(origin); await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByText('整理工作台和对话界面', { exact: true }).first().click();
  if (!stockChat) await page.locator('style[data-plugin="trisoul-x-computer-use"]').waitFor({ state: 'attached' });
  trace('client-loaded');
  return { root, home, page, context, rpc, sessionId, errors, async restartHost() {
    await stopFixtureProcess(child); log = ''; child = startHost(); await connectHost();
    await until(async () => (await rpc('llm/listProviders')).some(provider => provider.id === 'fixture'));
    await context.addCookies(cookie.split('; ').map(value => { const index = value.indexOf('='); return { name: value.slice(0, index), value: value.slice(index + 1), url: origin }; }));
    await page.goto(origin);
    const proceed = page.getByRole('button', { name: '继续', exact: true });
    const session = page.getByText('整理工作台和对话界面', { exact: true }).first();
    await until(async () => await proceed.isVisible() || await session.isVisible());
    if (await proceed.isVisible()) await proceed.click();
    await session.click();
    if (!stockChat) await page.locator('style[data-plugin="trisoul-x-computer-use"]').waitFor({ state: 'attached' });
  }, replyWith(factory){replyFactory=factory;}, holdNextReply() {
    nextReply = new Promise(resolve => { releaseReply = resolve; });
    return () => releaseReply?.();
  } };
}
