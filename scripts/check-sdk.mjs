import { createRequire } from 'node:module';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(resolve(process.argv[2], 'package.json'));
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
for (const [name, version] of Object.entries(manifest.peerDependencies)) {
  const actual = require(`${name}/package.json`).version;
  if (actual !== version) throw new Error(`SDK mismatch: ${name}: expected ${version}, got ${actual}`);
}
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const { createScope, scopeOf } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-scope')));
const plugin = await import('../src/dsh/index.mjs');
const { installToolDefinitions, TOOLS } = await import('../src/dsh/tools.mjs');
if (typeof plugin.Config !== 'function' || typeof plugin.apply !== 'function' || typeof plugin.acquireOpenCU !== 'function' || typeof installToolDefinitions !== 'function') throw new Error('OpenCU Host SDK exports are unavailable');
const ctx = new Context();
const key = { type: 'session', id: 'opencu-sdk-check' };
const scope = createScope(ctx, key);
if (scopeOf(scope.ctx) !== key) throw new Error('DSH scope identity was not retained');
await scope.dispose();
const { default: ToolRuntime } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-tools')));
const { default: SystemPrompt } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-system-prompt')));
const runtime = new Context();
let owner;
try {
  await runtime.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
  await runtime.plugin(ToolRuntime, { mode: 'native' });
  const dataDir = await mkdtemp(join(resolve(process.argv[2]), 'opencu-runtime-'));
  const { default: LocalAttachmentStore } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-attachment-local')));
  await runtime.plugin(LocalAttachmentStore, { dshHome: dataDir });
  // Verify registration/execution/disposal in the actual matching ToolRuntime, without GUI or system input.
  owner = await runtime.plugin(plugin, { dataDir, browserEnabled: false, nativeEnabled: false, extensionEnabled: false });
  const tools = runtime.get('tools');
  for (const definition of TOOLS) if (!tools.get(definition.name)) throw new Error(`Tool was not registered: ${definition.name}`);
  const result = await tools.execute({ callId: 'opencu-sdk-state', name: 'opencu_state', arguments: {}, signal: new AbortController().signal });
  if (result.isError) throw new Error(JSON.stringify(result));
  const state = JSON.parse(result.content.find(block => block.type === 'text').text);
  if (!state.ok || state.state.releasePending) throw new Error('OpenCU state did not execute through matching ToolRuntime');
  await owner.dispose(); owner = undefined;
  for (const definition of TOOLS) if (tools.get(definition.name)) throw new Error(`Tool was not removed: ${definition.name}`);
  const retained = JSON.parse(await readFile(join(dataDir, 'controller.json'), 'utf8'));
  if (!retained.closed || retained.releasePending) throw new Error('OpenCU unload did not retain successful release state');
} finally { if (owner) await owner.dispose(); await runtime.fiber.dispose(); }
console.log(`OpenCU matching Host SDK loaded; scope retained; ${TOOLS.length} real ToolRuntime registrations executed and disposed; core close state retained`);
