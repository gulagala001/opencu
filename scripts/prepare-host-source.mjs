import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { loadBuildInputs } from './host-build-inputs.mjs';

const [id, destination] = process.argv.slice(2);
if (!id || !destination) throw new Error('Usage: node scripts/prepare-host-source.mjs <rc1|021rc2|021rc3> <checkout-directory>');
const directory = resolve(destination);
const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
const { files, pkg } = await loadBuildInputs(id, manifest);
if (!files['package-lock.json']) throw new Error(`No fixed root npm lock for ${id}; use build-targets.mjs for legacy host builds`);
const distributionPath = join(directory, 'src/extension/distribution.json');
const distribution = JSON.parse(await readFile(distributionPath, 'utf8'));
distribution.packageVersion = pkg.version;
// Resolve and validate both complete graphs before changing the source variant.
await writeFile(join(directory, 'package-lock.json'), files['package-lock.json']);
await writeFile(join(directory, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
await writeFile(join(directory, 'src/client/host-target.mjs'), `export default ${JSON.stringify({ version: pkg.engines.dsh, cordis: pkg.peerDependencies['@deepseek-ai/cordis'], schema: pkg.peerDependencies['@deepseek-ai/schemastery'] })};\n`);
await writeFile(distributionPath, JSON.stringify(distribution, null, 2) + '\n');
console.log(`Prepared ${pkg.version} with its complete npm lock; run npm ci in ${directory}`);
