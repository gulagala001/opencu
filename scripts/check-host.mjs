import { readFile, writeFile, symlink, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const root = resolve(process.argv[2]);
const sdk = resolve(process.argv[3]);
const require = createRequire(join(sdk, 'package.json'));
const ts = require('typescript');
try { await access(join(root, 'node_modules')); } catch (error) { if (error.code !== 'ENOENT') throw error; await symlink(join(sdk, 'node_modules'), join(root, 'node_modules'), 'dir'); }
const config = {
  compilerOptions: {
    target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true,
    allowImportingTsExtensions: true, skipLibCheck: true, types: ['node'],
    paths: {
      '@deepseek-ai/dsh-client-ui-sidebar-browser/types': ['./packages/client/ui-sidebar-browser/src/types.ts'],
      '@deepseek-ai/dsh-brand': ['./packages/util/brand/src/index.ts'],
      '@deepseek-ai/dsh-client-shortcuts/protocol': ['./packages/client/shortcuts/src/protocol.ts'],
      '@deepseek-ai/dsh-util-values': ['./packages/util/values/src/index.ts'],
      '@deepseek-ai/dsh-util-crypto': ['./packages/util/crypto/src/index.ts'],
    },
  },
  include: ['apps/desktop/src/browser-guests.ts', 'apps/desktop/src/preload-browser.ts', 'apps/desktop/src/opencu-*.ts', 'apps/desktop/src/preload-opencu-*.ts'],
};
await writeFile(join(root, 'opencu-check.json'), JSON.stringify(config, null, 2) + '\n');
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', join(root, 'opencu-check.json')], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
for (const file of ['apps/desktop/src/main.ts', 'apps/desktop/tsdown.config.ts', 'packages/client/ui-sidebar-right/src/client/contract/slots.ts', 'packages/client/ui-sidebar-right/src/client/tab-domain.ts', 'packages/client/ui-sidebar-right/src/client/service.ts', 'packages/client/ui-sidebar-right/src/client/stores.ts', 'packages/client/ui-sidebar-right/src/client/tab-close-guards.ts', 'packages/client/ui-sidebar-right/src/client/index.ts', 'packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx']) {
  const value = await readFile(join(root, file), 'utf8');
  const syntax = ts.transpileModule(value, { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
  const errors = syntax.diagnostics?.filter(value => value.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, { getCurrentDirectory: () => root, getCanonicalFileName: value => value, getNewLine: () => '\n' }));
}
console.log('OpenCU host guest + all adapters + preloads: strict matching Electron/SDK typecheck passed; main/sidebar patch syntax passed (full host build remains integration-owned)');
