import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { prepareLazyGrammars } from './lazy-grammars.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'vendor/build-inputs/rea/manifest.json'), 'utf8'));
const sources = new Map(manifest.records.map(record => [basename(record.source), record]));
const originalRoot = dirname(manifest.records[0].source);
const vendor = resolve(root, 'vendor/build-inputs/rea/assets'), output = resolve(root, 'lib/rea-assets');
await mkdir(output, { recursive: true });
const entries = new Map(), fingerprints = new Map(), assets = new Map();
let asar;
async function original(file) {
  if (fingerprints.has(file)) return original(fingerprints.get(file));
  const record = sources.get(file);
  if (record) return { bytes: await readFile(resolve(root, record.vendor)), source: record.source, expected: record.sha256 };
  try { return { bytes: await readFile(resolve(originalRoot, file)), source: `webview/assets/${file}` }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { return { bytes: await readFile(resolve(vendor, file)), source: `vendor/build-inputs/rea/assets/${file}` }; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const archive = process.env.OPENCU_REA_ARCHIVE;
  if (!archive) throw new Error(`Missing original REA resource ${file}; set OPENCU_REA_ARCHIVE to the matching original archive`);
  asar ??= createRequire(import.meta.url)(process.env.OPENCU_ASAR_MODULE || '@electron/asar');
  return { bytes: asar.extractFile(archive, `webview/assets/${file}`), source: `webview/assets/${file}` };
}
async function collect(file, expected) {
  if (file.includes('/') || file.includes('\\') || file.includes('..')) throw new Error(`Unexpected REA resource path ${file}`);
  if (entries.has(file)) {
    if (expected && Buffer.from(entries.get(file).sha256, 'hex').toString('base64') !== expected) throw new Error(`REA resource hash mismatch: ${file}`);
    return;
  }
  const item = await original(file), sha256 = createHash('sha256').update(item.bytes).digest('hex');
  if (item.expected && sha256 !== item.expected || expected && createHash('sha256').update(item.bytes).digest('base64') !== expected) throw new Error(`REA resource hash mismatch: ${file}`);
  const asset = assets.get(sha256) ?? file;
  assets.set(sha256, asset);
  entries.set(file, { file, sha256, source: item.source, ...(asset === file ? {} : { asset }) });
  const cached = resolve(vendor, file);
  try { await access(cached); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await writeFile(cached, item.bytes); }
  if (asset === file) await writeFile(resolve(output, file), item.bytes);
  if (!/\.m?js$/.test(file)) return;
  const source = item.bytes.toString('utf8');
  for (const match of source.matchAll(/["`]([^"`]+\.(?:wasm|js))["`]\s*:\s*["`]([^"`]+\.(?:wasm|js))["`]/g)) {
    if (match[1] !== match[2]) fingerprints.set(match[2], match[1]);
  }
  const dependencies = new Set([...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)[`"']\.\/([^`"']+)[`"']/g)].map(match => match[1]));
  for (const match of source.matchAll(/new URL\([`"'](?:\.\/)?([^`"']+)[`"']\s*,\s*import\.meta\.url/g)) dependencies.add(match[1]);
  for (const dependency of dependencies) if (!dependency.includes('${') && dependency !== './' && !/^[a-z][a-z0-9+.-]*:/i.test(dependency)) await collect(dependency);
  for (const match of source.matchAll(/["`]([^"`]+\.(?:wasm|js))["`]\s*:\s*["`]sha256-([^"`]+)["`]/g)) await collect(match[1], match[2]);
}
// Workers and data-only grammars share the existing resource route.
export const lazyGrammars = await prepareLazyGrammars(root);
for (const file of lazyGrammars) await collect(file);
for (const file of ['runtime.worker-430bca8c9c7b.js', 'runtime.worker-e6675a4130c8.js', 'pdf.worker.min-46513d3652c6.mjs', 'shape-8f8944fcc9a5.svg']) await collect(file);
const redundant = [];
for (const { file, asset, sha256 } of entries.values()) {
  if (!asset) continue;
  try {
    const previous = await readFile(resolve(output, file));
    if (createHash('sha256').update(previous).digest('hex') !== sha256) throw new Error(`Generated REA resource changed: ${file}`);
  } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  redundant.push(resolve(output, file));
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify([...entries.values()], null, 2) + '\n');
await writeFile(resolve(vendor, 'office-resources.json'), JSON.stringify([...entries.values()], null, 2) + '\n');
for (const file of redundant) await unlink(file);
console.log(`REA Office resources: ${entries.size} original files`);
