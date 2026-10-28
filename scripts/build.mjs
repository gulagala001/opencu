import { writeFile, rm } from 'node:fs/promises';
import { buildExtensionZip } from '../src/extension/distribution.mjs';
import {readdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {checkMacHelperDistribution} from '../src/native/macos-identity.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
// A standard source build does not verify a separate installed host SDK graph.
// Never inherit an older build's claim; build-targets writes its verified record
// only after the complete build and prepack lifecycle have succeeded.
await rm(join(root, 'lib/host-build.json'), { force: true });
if (process.platform === 'darwin') await checkMacHelperDistribution(root);
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.name.endsWith('.mjs')) files.push(path);
  }
  return files;
}
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (pkg.exports['./client']) {
  const client = spawnSync(process.execPath, ['scripts/build-client.mjs'], {cwd: root, stdio: 'inherit'});
  if (client.status !== 0) process.exit(client.status ?? 1);
}
for (const entry of Object.values(pkg.exports)) await readFile(join(root, entry));
const files = await walk(join(root, 'src'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`OpenCU ESM build: ${files.length} source modules checked; no transpilation required`);

await writeFile(join(root, 'lib/extension.zip'), await buildExtensionZip(root));
