import { readFile, writeFile, mkdir, cp, symlink, access, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hostTargets } from '../host/compatibility.mjs';
import { nativePackageModes } from './native-package-modes.mjs';
import { checkMacHelperDistribution } from '../src/native/macos-identity.mjs';
import { loadBuildInputs, installBuildInputs, checkInstalledSdk, installFrontendInputs, checkFrozenInputs } from './host-build-inputs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const workspace = resolve(root, '..');
const buildRoot = resolve(process.env.OPENCU_BUILD_ROOT || join(workspace, '.local/host-compat-20261015'));
const packageRoot = resolve(process.env.OPENCU_PACKAGE_OUT || join(workspace, 'builds/opencu'));
const node = process.execPath;
if (process.platform === 'darwin') await checkMacHelperDistribution(root);
const pnpm = process.env.OPENCU_PNPM;
if (!pnpm) throw new Error('Set OPENCU_PNPM to the bundled pnpm.mjs entry (no global installation)');
const pnpmVersion = spawnSync(node, [pnpm, '--version'], { cwd: root, encoding: 'utf8' });
if (pnpmVersion.status !== 0 || pnpmVersion.stdout.trim() !== '11.28.5') throw new Error('OpenCU fixed builds require pnpm 11.28.5');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const run = (cwd, args, env = {}) => {
  const result = spawnSync(node, args, { cwd, stdio: 'inherit', env: { ...process.env, PATH: `${resolve(node, '..')}:${process.env.PATH}`, ...env } });
  if (result.status !== 0) throw new Error(`OpenCU command failed (${result.status}): ${args.join(' ')}`);
};
const frontend = join(buildRoot, 'opencu-frontend');
const frontendInputs = await installFrontendInputs(frontend, manifest);
run(frontend, [pnpm, 'install', '--frozen-lockfile', '--ignore-scripts']);
await checkFrozenInputs(frontend, frontendInputs.files, ['package.json', 'pnpm-lock.yaml']);
await access(join(frontend, 'node_modules/react-compiler-runtime'));
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['rc1', '021rc2']) {
  const target = hostTargets[id];
  if (!target) throw new Error(`Unknown target ${id}`);
  const output = join(packageRoot, id);
  const stage = join(buildRoot, `opencu-build-${id}`);
  const sdk = join(buildRoot, `opencu-sdk-${id}`);
  await mkdir(output, { recursive: true });
  await mkdir(stage, { recursive: true });
  await mkdir(sdk, { recursive: true });
  const { files, hashes, pkg } = await loadBuildInputs(id, manifest);
  const peers = pkg.peerDependencies;
  await installBuildInputs(sdk, files);
  run(sdk, [pnpm, 'install', '--frozen-lockfile', '--ignore-scripts']);
  const installed = await checkInstalledSdk(sdk, id, files);
  for (const file of ['src', 'host', 'scripts', 'vendor', 'native/macos', 'native/windows', 'native/linux', 'native/bin', 'extension', 'cordis.patch.yml', 'README.md', 'README_EN.md', 'CHANGELOG.md', 'DEVELOPMENT.md', 'docs', 'THIRD_PARTY_NOTICES.md']) {
    await cp(join(root, file), join(stage, file), { recursive: true });
  }
  await mkdir(join(stage, '.local'), { recursive: true });
  for (const [path, destination] of [[join(stage, '.local/frontend-deps'), frontend], [join(stage, 'node_modules'), join(sdk, 'node_modules')]]) {
    // A reused staging directory must not retain another host's dependency link.
    await rm(path, { recursive: true, force: true });
    await symlink(destination, path, 'dir');
  }
  await writeFile(join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  if (files['package-lock.json']) await writeFile(join(stage, 'package-lock.json'), files['package-lock.json']);
  else await rm(join(stage, 'package-lock.json'), { force: true });
  const distributionPath = join(stage, 'src/extension/distribution.json');
  const distribution = JSON.parse(await readFile(distributionPath, 'utf8'));
  distribution.packageVersion = pkg.version;
  await writeFile(distributionPath, JSON.stringify(distribution, null, 2) + '\n');
  await writeFile(join(stage, 'src/client/host-target.mjs'), `export default ${JSON.stringify({ version: target.version, cordis: target.cordis, schema: target.schema })};\n`);
  // Copy the already signed host-independent helper unchanged into every host variant.
  if (process.platform === 'darwin') await checkMacHelperDistribution(stage);
  run(stage, ['scripts/build.mjs']);
  run(stage, ['scripts/check-sdk.mjs', sdk]);
  const buildInputs = { packageManager: 'pnpm@11.28.5', sha256: hashes, frontendSha256: frontendInputs.hashes, ...installed };
  await writeFile(join(stage, 'lib/host-build.json'), JSON.stringify({ ...target, peers, buildInputs }, null, 2) + '\n');
  run(stage, [pnpm, 'pack', '--pack-destination', output], {OPENCU_SOURCE_ROOT: root});
  await nativePackageModes(join(output, `opencu-${pkg.version}.tgz`));
  await writeFile(join(output, 'build.json'), JSON.stringify({ target, stage, sdk, lock: join(sdk, 'pnpm-lock.yaml'), buildInputs, package: join(output, `opencu-${pkg.version}.tgz`) }, null, 2) + '\n');
}
