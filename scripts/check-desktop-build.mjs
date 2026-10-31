import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { dependencyRequire } from './dependencies.mjs';
import { targetFor } from '../host/compatibility.mjs';
import { prepareNativeRuntime } from '../host/native-runtime.mjs';

/** Check actual bundled preloads against the same validator the client runs. */
export async function checkDesktopBuild(directory) {
  const root = resolve(directory);
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  targetFor(version);
  if (version === '0.2.1-rc.5') await prepareNativeRuntime(join(root, 'dsh'), { check: true });
  const { parse } = dependencyRequire()('acorn');
  const unwrap = (await readFile(new URL('../src/client/ipc-result.mjs', import.meta.url), 'utf8')).replace('export function', 'function');
  const client = (await readFile(new URL('../src/client/host-compat.mjs', import.meta.url), 'utf8'))
    .replace("import { unwrapOpenCU } from './ipc-result.mjs';", unwrap)
    .replace("import build from './host-target.mjs';", `const build = ${JSON.stringify({ version })};`)
    .replace(/^export (?=(?:class|function|const)\b)/gm, '');
  for (const name of ['preload-app', 'preload-opencu-surface']) {
    const preload = await readFile(join(root, 'lib', name + '.cjs'), 'utf8');
    const ast = parse(preload, { ecmaVersion: 'latest', sourceType: 'script' });
    const factory = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'createDesktopBrowserBridge');
    assert(factory, `Missing bundled browser bridge: ${name}`);
    const ipcRenderer = { on() {}, invoke() {}, removeListener() {} };
    const sandbox = { ipcRenderer, electron: { ipcRenderer }, DESKTOP_IPC: {}, URL, Set };
    for (const alias of preload.match(/\bimport_electron\d*\b/g) ?? []) sandbox[alias] = { ipcRenderer };
    const bridge = vm.runInNewContext(preload.slice(factory.start, factory.end) + ';createDesktopBrowserBridge()', sandbox, { timeout: 1000 });
    try {
      vm.runInNewContext(client + ';desktopBrowserHost()', { dshDesktop: { browser: bridge } }, { timeout: 1000 });
    } catch (cause) {
      throw new Error(`${name}: ${cause.message}`, { cause });
    }
  }
  return { host: version, preloads: ['preload-app', 'preload-opencu-surface'] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv[2], 'Usage: node scripts/check-desktop-build.mjs /absolute/extracted/app');
  console.log('PASS OpenCU compiled desktop bridges', await checkDesktopBuild(process.argv[2]));
}
