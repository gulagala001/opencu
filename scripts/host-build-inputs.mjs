import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostTargets } from '../host/compatibility.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const inputs = join(root, 'host/build-inputs');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const sdkFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];

export function hostManifest(manifest, id) {
  const target = hostTargets[id];
  if (!target) throw new Error(`Unknown target ${id}`);
  const pluginVersion = manifest.version.match(/^(\d+\.\d+\.\d+)-dsh\./)?.[1];
  if (!pluginVersion) throw new Error('Expected an OpenCU version with an explicit DSH suffix');
  const peers = Object.fromEntries(Object.keys(manifest.peerDependencies).map(name => [name,
    name === '@deepseek-ai/cordis' ? target.cordis : name === '@deepseek-ai/schemastery' ? target.schema : target.version]));
  return { ...manifest, version: `${pluginVersion}-dsh.${target.version}`, engines: { ...manifest.engines, dsh: target.version }, peerDependencies: peers,
    opencu: { host: target.version, sourceCommit: target.commit, adapterRevision: 2 } };
}

export function checkRootLock(manifest, lock) {
  const entry = lock.packages?.[''];
  if (lock.version !== manifest.version || entry?.version !== manifest.version) throw new Error('Root npm lock version mismatch');
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'engines']) {
    const sorted = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    if (sorted(entry[field]) !== sorted(manifest[field])) throw new Error(`Root npm lock ${field} mismatch`);
  }
  const dsh = Object.entries(lock.packages).filter(([path]) => /(?:^|\/)node_modules\/@deepseek-ai\/dsh-/.test(path));
  if (!dsh.length) throw new Error('Root npm lock contains no DSH resolution graph');
  for (const [path, pkg] of dsh) if (pkg.version !== manifest.engines.dsh) throw new Error(`Root npm lock SDK mismatch: ${path}@${pkg.version}`);
}

export async function loadBuildInputs(id, manifest) {
  const record = JSON.parse(await readFile(join(inputs, 'manifest.json'), 'utf8')).targets[id];
  if (!record) throw new Error(`No fixed build inputs for ${id}`);
  const files = {};
  for (const [file, hash] of Object.entries(record.sha256)) {
    files[file] = await readFile(join(inputs, id, file));
    if (sha256(files[file]) !== hash) throw new Error(`Build input hash mismatch: ${id}/${file}`);
  }
  const sdk = JSON.parse(files['package.json']);
  const target = hostTargets[id];
  const pkg = hostManifest(manifest, id);
  const expected = { ...pkg.peerDependencies, ...pkg.dependencies, '@deepseek-ai/dsh-system-prompt': target.version,
    '@deepseek-ai/dsh-attachment-local': target.version, typescript: '6.0.3', '@types/node': '22.20.1', electron: target.electron, 'electron-chrome-extensions': '4.9.0' };
  if (JSON.stringify(sdk.dependencies) !== JSON.stringify(expected)) throw new Error(`Fixed SDK manifest does not match source dependencies: ${id}`);
  // Check every package and peer context, including transitive DSH packages.
  const lock = files['pnpm-lock.yaml'].toString();
  const versions = [...lock.matchAll(/@deepseek-ai\/dsh-[\w-]+@([^\s'"():]+)/g)];
  if (!versions.length || versions.some(([, version]) => version !== target.version)) throw new Error(`Mixed host resolution graph: ${id}`);
  if (files['package-lock.json']) checkRootLock(pkg, JSON.parse(files['package-lock.json']));
  return { files, hashes: record.sha256, pkg };
}

export async function installBuildInputs(destination, files, names = sdkFiles) {
  await mkdir(destination, { recursive: true });
  for (const name of names) {
    if (files[name]) await writeFile(join(destination, name), files[name]);
    else await rm(join(destination, name), { force: true });
  }
}

export async function checkInstalledSdk(directory, id, files) {
  await checkFrozenInputs(directory, files);
  const lock = await readFile(join(directory, 'node_modules/.pnpm/lock.yaml'));
  if (sha256(lock) !== sha256(files['pnpm-lock.yaml'])) throw new Error(`Installed SDK graph differs from fixed lock: ${id}`);
  const sdk = JSON.parse(files['package.json']);
  for (const [name, version] of Object.entries(sdk.dependencies)) {
    const installed = JSON.parse(await readFile(join(directory, 'node_modules', name, 'package.json')));
    if (installed.name !== name || installed.version !== version) throw new Error(`Installed SDK dependency mismatch: ${name}`);
  }
  const expected = new Set([...files['pnpm-lock.yaml'].toString().matchAll(/^  '(@deepseek-ai\/dsh-[\w-]+@[^'()]+)':/gm)].map(([, key]) => key));
  const found = new Set();
  for (const directoryName of await readdir(join(directory, 'node_modules/.pnpm'))) {
    if (!directoryName.startsWith('@deepseek-ai+dsh-')) continue;
    const name = directoryName.match(/^(@deepseek-ai\+dsh-[\w-]+)@/)?.[1]?.replace('+', '/');
    if (!name) throw new Error(`Unrecognized installed SDK path: ${directoryName}`);
    const pkg = JSON.parse(await readFile(join(directory, 'node_modules/.pnpm', directoryName, 'node_modules', name, 'package.json')));
    const key = `${pkg.name}@${pkg.version}`;
    if (pkg.version !== hostTargets[id].version || !expected.has(key)) throw new Error(`Unexpected installed DSH package: ${key}`);
    found.add(key);
  }
  for (const key of expected) if (!found.has(key)) throw new Error(`Missing installed DSH package: ${key}`);
  return { dshPackages: [...found].sort(), installedLockSha256: sha256(lock) };
}

export async function checkFrozenInputs(directory, files, names = sdkFiles) {
  for (const name of names) if (files[name] && sha256(await readFile(join(directory, name))) !== sha256(files[name])) throw new Error(`Frozen install changed input: ${name}`);
}

export async function installFrontendInputs(destination, manifest) {
  const record = JSON.parse(await readFile(join(inputs, 'manifest.json'), 'utf8')).frontend;
  const files = {};
  for (const [file, hash] of Object.entries(record.sha256)) {
    files[file] = await readFile(join(inputs, 'frontend', file));
    if (sha256(files[file]) !== hash) throw new Error(`Frontend input hash mismatch: ${file}`);
  }
  const frontend = JSON.parse(files['package.json']);
  for (const [name, version] of Object.entries(manifest.devDependencies)) if (frontend.dependencies[name] !== version) throw new Error(`Frontend dependency mismatch: ${name}`);
  await installBuildInputs(destination, files, ['package.json', 'pnpm-lock.yaml']);
  return { files, hashes: record.sha256 };
}
