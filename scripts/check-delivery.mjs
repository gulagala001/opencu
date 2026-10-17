import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hostTargets } from '../host/compatibility.mjs';
const workspace = resolve(new URL('../..', import.meta.url).pathname);
const local = join(workspace, '.local/host-compat-20261015');
const out = join(workspace, 'builds/opencu');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reports = {};
async function inventory(directory, prefix = '') {
  const values = {};
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(values, await inventory(directory, path));
    else if (entry.isFile()) values[path] = hash(await readFile(join(directory, path)));
  }
  return values;
}
let previousCore;
for (const [id, target] of Object.entries(hostTargets)) {
  const stage = join(local, `opencu-build-${id}`), sdk = join(local, `opencu-sdk-${id}`);
  const host = join(local, `opencu-host-final-${id}`);
  const tarball = join(out, id, 'opencu-0.1.1.tgz');
  const unpacked = join(local, `opencu-packed-${id}`);
  await mkdir(unpacked, { recursive: true });
  const extract = spawnSync('tar', ['-xzf', tarball, '-C', unpacked], { stdio: 'inherit' });
  assert.equal(extract.status, 0);
  const pkg = JSON.parse(await readFile(join(unpacked, 'package/package.json'), 'utf8'));
  assert.equal(pkg.opencu.host, target.version);
  assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], target.cordis);
  assert.equal(pkg.peerDependencies['@deepseek-ai/schemastery'], target.schema);
  for (const file of ['lib/client.js', 'lib/client.factory.mjs', 'lib/presentation.js', 'lib/page-cursor.js', 'host/apply.mjs', 'host/permissions.ts', 'native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native']) {
    assert.equal(hash(await readFile(join(unpacked, 'package', file))), hash(await readFile(join(stage, file))), `${id} packed artifact differs: ${file}`);
  }
  const core = {};
  for (const group of ['src/core', 'src/native', 'src/browser', 'src/extension']) Object.assign(core, Object.fromEntries(Object.entries(await inventory(join(stage, group))).map(([name, sha]) => [group + '/' + name, sha])));
  if (previousCore) assert.deepEqual(core, previousCore, 'Host target must not fork core or backends');
  previousCore = core;
  const apply = JSON.parse(await readFile(join(local, `opencu-apply-final-${id}.json`), 'utf8'));
  const before = Object.fromEntries(await Promise.all(apply.files.map(async file => [file, hash(await readFile(join(host, file)))])));
  const repeat = spawnSync(process.execPath, [join(workspace, 'opencu/host/apply.mjs'), host], { encoding: 'utf8' });
  assert.equal(repeat.status, 0, repeat.stderr);
  const after = Object.fromEntries(await Promise.all(apply.files.map(async file => [file, hash(await readFile(join(host, file)))])));
  assert.deepEqual(after, before, 'Repeat apply must be byte-identical');
  reports[id] = { target, package: tarball, sha256: hash(await readFile(tarball)), stage, sdk, sdkLock: join(sdk, 'pnpm-lock.yaml'), sdkLockSha256: hash(await readFile(join(sdk, 'pnpm-lock.yaml'))), patch: { root: host, files: after, repeatApply: 'byte-identical' }, core, clientSha256: hash(await readFile(join(stage, 'lib/client.js'))), nativeHelperSha256: hash(await readFile(join(stage, 'native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native'))) };
}
assert.notEqual(reports.rc2.clientSha256, reports.alpha3.clientSha256, 'Both builds must target their actual desktop ABI');
const frontend = join(workspace, 'opencu/.local/frontend-deps/node_modules');
for (const [name, version] of [['react', '19.2.7'], ['react-dom', '19.2.7'], ['react-compiler-runtime', '1.0.0']]) assert.equal(JSON.parse(await readFile(join(frontend, name, 'package.json'), 'utf8')).version, version);
await writeFile(join(local, 'opencu-delivery.json'), JSON.stringify(reports, null, 2) + '\n');
console.log(JSON.stringify({ packages: Object.fromEntries(Object.entries(reports).map(([id, entry]) => [id, { package: entry.package, sha256: entry.sha256, clientSha256: entry.clientSha256, nativeHelperSha256: entry.nativeHelperSha256, repeatApply: entry.patch.repeatApply }])), core: 'byte-identical across both targets', reaRuntime: 'real React19 + compiler versions retained', packed: 'exact client/helper/host source retained', report: join(local, 'opencu-delivery.json') }, null, 2));
