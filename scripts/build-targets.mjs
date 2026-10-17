import { readFile, writeFile, mkdir, cp, symlink, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hostTargets } from '../host/compatibility.mjs';
import { nativePackageModes } from './native-package-modes.mjs';
import { checkMacHelperDistribution } from '../src/native/macos-identity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const workspace = resolve(root, '..');
const node = process.execPath;
if (process.platform === 'darwin') await checkMacHelperDistribution(root);
const pnpm = process.env.OPENCU_PNPM;
if (!pnpm) throw new Error('Set OPENCU_PNPM to the bundled pnpm.mjs entry (no global installation)');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const run = (cwd, args) => {
  const result = spawnSync(node, args, { cwd, stdio: 'inherit', env: { ...process.env, PATH: `${resolve(node, '..')}:${process.env.PATH}` } });
  if (result.status !== 0) throw new Error(`OpenCU command failed (${result.status}): ${args.join(' ')}`);
};
const frontend = join(root, '.local/frontend-deps');
await access(join(frontend, 'node_modules/react-compiler-runtime'));
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(hostTargets)) {
  const target = hostTargets[id];
  if (!target) throw new Error(`Unknown target ${id}`);
  const output = join(workspace, 'builds/opencu', id);
  const stage = join(workspace, '.local/host-compat-20261015', `opencu-build-${id}`);
  const sdk = join(workspace, '.local/host-compat-20261015', `opencu-sdk-${id}`);
  await mkdir(output, { recursive: true });
  await mkdir(stage, { recursive: true });
  await mkdir(sdk, { recursive: true });
  const peers = Object.fromEntries(Object.keys(manifest.peerDependencies).map(name => [name,
    name === '@deepseek-ai/cordis' ? target.cordis : name === '@deepseek-ai/schemastery' ? target.schema : target.version]));
  const sdkManifest = { name: `opencu-sdk-${id}`, private: true, type: 'module', packageManager: 'pnpm@11.28.5', dependencies: {
    ...peers, ...manifest.dependencies, '@deepseek-ai/dsh-system-prompt': target.version, '@deepseek-ai/dsh-attachment-local': target.version, 'typescript': '6.0.3', '@types/node': '22.20.1', 'electron': target.electron ?? '44.0.0', 'electron-chrome-extensions': '4.9.0',
  } };
  const sdkText = JSON.stringify(sdkManifest, null, 2) + '\n';
  let previousSdk;
  try { previousSdk = await readFile(join(sdk, 'package.json'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(join(sdk, 'package.json'), sdkText);
  let locked = false;
  try { await access(join(sdk, 'pnpm-lock.yaml')); locked = previousSdk === sdkText; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  run(sdk, [pnpm, 'install', ...(locked ? ['--frozen-lockfile'] : []), '--ignore-scripts']);
  for (const file of ['src', 'host', 'scripts', 'vendor', 'native/macos', 'native/windows', 'native/linux', 'native/bin', 'extension', 'cordis.patch.yml', 'README.md', 'README_EN.md', 'DEVELOPMENT.md', 'docs', 'THIRD_PARTY_NOTICES.md']) {
    await cp(join(root, file), join(stage, file), { recursive: true });
  }
  await mkdir(join(stage, '.local'), { recursive: true });
  for (const [path, destination] of [[join(stage, '.local/frontend-deps'), frontend], [join(stage, 'node_modules'), join(sdk, 'node_modules')]]) {
    try { await access(path); } catch (error) { if (error.code !== 'ENOENT') throw error; await symlink(destination, path, 'dir'); }
  }
  const pkg = { ...manifest, version: `2.0.0-dsh.${target.version}`, engines: { ...manifest.engines, dsh: target.version }, peerDependencies: peers, opencu: { host: target.version, sourceCommit: target.commit, adapterRevision: 2 } };
  await writeFile(join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  await writeFile(join(stage, 'src/client/host-target.mjs'), `export default ${JSON.stringify({ version: target.version, cordis: target.cordis, schema: target.schema })};\n`);
  // Copy the already signed host-independent helper unchanged into every host variant.
  if (process.platform === 'darwin') await checkMacHelperDistribution(stage);
  run(stage, ['scripts/build.mjs']);
  run(stage, ['scripts/check-sdk.mjs', sdk]);
  await writeFile(join(stage, 'lib/host-build.json'), JSON.stringify({ ...target, peers, sdk, lock: join(sdk, 'pnpm-lock.yaml'), frontendLock: join(frontend, 'pnpm-lock.yaml') }, null, 2) + '\n');
  run(stage, [pnpm, 'pack', '--pack-destination', output]);
  await nativePackageModes(join(output, `opencu-${pkg.version}.tgz`));
  await writeFile(join(output, 'build.json'), JSON.stringify({ target, stage, sdk, lock: join(sdk, 'pnpm-lock.yaml'), package: join(output, `opencu-${pkg.version}.tgz`) }, null, 2) + '\n');
}
