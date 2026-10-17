import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const roots = [resolve(root, 'package.json'), resolve(root, '.local/frontend-deps/package.json')];
export function dependencyRequire() {
  for (const path of roots) {
    const require = createRequire(path);
    try {
      if (Object.entries(pkg.devDependencies).every(([name, version]) => require(`${name}/package.json`).version === version)) return require;
    } catch { /* A workspace checkout can use its isolated, version-matched build dependencies. */ }
  }
  throw new Error('OpenCU build dependencies are missing or mismatched. Run npm ci in this repository.');
}
