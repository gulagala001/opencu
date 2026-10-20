import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {nativePackageModes} from './native-package-modes.mjs';

const cwd = fileURLToPath(new URL('..', import.meta.url));
// `npm run pack` has already run prepack. A direct invocation lets npm pack
// build and validate through that same lifecycle, once in either case.
const checked = process.env.npm_lifecycle_event === 'pack';
const pack = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', ...(checked ? ['--ignore-scripts'] : []), ...process.argv.slice(2)], {cwd, encoding: 'utf8'});
if (pack.stderr) process.stderr.write(pack.stderr);
if (pack.status !== 0) process.exit(pack.status ?? 1);
for (const item of JSON.parse(pack.stdout)) await nativePackageModes(resolve(cwd, item.filename));
