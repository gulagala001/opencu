import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {nativePackageModes} from './native-package-modes.mjs';

const cwd = fileURLToPath(new URL('..', import.meta.url));
// `npm run pack` has already run prepack. A direct invocation lets npm pack
// build and validate through that same lifecycle, once in either case.
const checked = process.env.npm_lifecycle_event === 'pack';
const args = process.argv.slice(2);
let destination = process.env.npm_config_pack_destination ?? process.env.NPM_CONFIG_PACK_DESTINATION ?? cwd;
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--pack-destination') destination = args[++index];
  else if (args[index].startsWith('--pack-destination=')) destination = args[index].slice('--pack-destination='.length);
}
const pack = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', ...(checked ? ['--ignore-scripts'] : []), ...args], {cwd, encoding: 'utf8'});
if (pack.stderr) process.stderr.write(pack.stderr);
if (pack.status !== 0) process.exit(pack.status ?? 1);
for (const item of JSON.parse(pack.stdout)) await nativePackageModes(resolve(cwd, destination, item.filename));
