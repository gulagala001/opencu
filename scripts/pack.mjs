import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {nativePackageModes} from './native-package-modes.mjs';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const build = spawnSync(process.execPath, ['scripts/build.mjs'], {cwd, stdio: 'inherit'});
if (build.status !== 0) process.exit(build.status ?? 1);
const pack = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', ...process.argv.slice(2)], {cwd, encoding: 'utf8'});
if (pack.stderr) process.stderr.write(pack.stderr);
if (pack.status !== 0) process.exit(pack.status ?? 1);
for (const item of JSON.parse(pack.stdout)) await nativePackageModes(resolve(cwd, item.filename));
