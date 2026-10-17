import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependencyRequire } from './dependencies.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = dependencyRequire();
const { parse } = require('@babel/parser');
const manifestPath = resolve(root, 'vendor/build-inputs/rea/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sourcePath = resolve(dirname(manifest.records[0].source), '../../.vite/build/main-39FdJ_vp.js');
const previous = manifest.records.find(record => record.source === sourcePath);
const source = await readFile(previous ? resolve(root, previous.vendor) : sourcePath, 'utf8');
const sha256 = createHash('sha256').update(source).digest('hex');
const vendor = `vendor/build-inputs/rea/${sha256}-main-39FdJ_vp.js`;
if (previous && previous.sha256 !== sha256) throw new Error('REA native browser source changed');
const ast = parse(source, { sourceType: 'unambiguous' });
const names = ['Lke', 'Wq', 'Hq', 'Bke', 'Vke', 'XR', 'lL'];
const nodes = names.map(name => ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name));
if (nodes.some(node => !node)) throw new Error('REA native browser menu declarations changed');
let menu = source.slice(nodes[0].start, nodes[0].end);
const replace = (before, after) => {
  if (!menu.includes(before)) throw new Error(`REA native menu adaptation changed: ${before}`);
  menu = menu.replace(before, after);
};
replace('function Lke({', 'export function browserContextMenu({');
replace('onReload:v}){let y=l.p(),b=[];', 'onReload:v,intl:y,canOpenWindow=false}){let b=[];');
replace('let x=Rke(o,s);', 'let x=[];');
replace('h(o.linkURL)}},{label:', 'h(o.linkURL)}},...canOpenWindow?[{label:');
replace('h(o.linkURL,`new-window`)}})', 'h(o.linkURL,`new-window`)}}]:[])');
replace('_.Menu.buildFromTemplate(b).popup({window:c})', 'b');
// The original builds a native menu. Returning the template keeps the host responsible for popup lifetime.
menu = menu.replace('}),b}', '});return b}');
parse(menu, { sourceType: 'module' });
const constants = {};
for (const node of ast.program.body) if (node.type === 'VariableDeclaration') for (const declaration of node.declarations) {
  if (['lz', 'uz', 'dz', 'fz', 'pz', 'mz', 'hz', 'gz', '_z', 'vz', 'yz'].includes(declaration.id.name)) constants[declaration.id.name] = source.slice(declaration.init.start, declaration.init.end);
}
const generated = [
  `// REA native browser menu: ${vendor}; SHA-256 ${sha256}.`,
  "import * as _ from 'electron';",
  'const r={uo:{WEB:`web`},vo:{QUICK:`quick`,BATCH:`batch`}};',
  'const Ge=lL;',
  ...Object.entries(constants).map(([name, value]) => `const ${name}=${value};`),
  ...nodes.slice(1).map(node => source.slice(node.start, node.end)), menu,
].join('\n') + '\n';
await writeFile(resolve(root, 'host/rea-context-menu.js'), generated);
if (!previous) { await writeFile(resolve(root, vendor), source); manifest.records.push({ source: sourcePath, sha256, vendor, symbols: names }); }
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`REA native context menu: ${names.join(', ')}; ${sha256}`);
