import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {nativePackageModes} from './native-package-modes.mjs';

const cwd = fileURLToPath(new URL('..', import.meta.url));
// `npm run pack` has already run prepack. Run it explicitly for direct calls
// so lifecycle stdout cannot corrupt npm's machine-readable pack response.
const checked = process.env.npm_lifecycle_event === 'pack';
const args = process.argv.slice(2);
let destination = process.env.npm_config_pack_destination ?? process.env.NPM_CONFIG_PACK_DESTINATION ?? cwd;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--pack-destination') destination = args[++index];
  else if (args[index].startsWith('--pack-destination=')) destination = args[index].slice('--pack-destination='.length);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!checked) {
  const validation = spawnSync(npm, ['run', 'prepack'], {cwd, stdio: 'inherit'});
  if (validation.status !== 0) process.exit(validation.status ?? 1);
}
const pack = spawnSync(npm, ['pack', '--json', '--ignore-scripts', ...args], {cwd, encoding: 'utf8'});
if (pack.stderr) process.stderr.write(pack.stderr);
if (pack.status !== 0) process.exit(pack.status ?? 1);
for (const item of JSON.parse(pack.stdout)) await nativePackageModes(resolve(cwd, destination, item.filename));
