import { dependencyRequire } from './dependencies.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = dependencyRequire();
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const manifestPath = resolve(root, 'vendor/build-inputs/rea/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sourcePath = resolve(dirname(manifest.records[0].source), '../../.vite/build/browser-page-preload.js');
const previous = manifest.records.find(record => record.source === sourcePath);
const source = await readFile(previous ? resolve(root, previous.vendor) : sourcePath, 'utf8');
const sha256 = createHash('sha256').update(source).digest('hex');
const vendor = `vendor/build-inputs/rea/${sha256}-browser-page-preload.js`;
if (previous && previous.sha256 !== sha256) throw new Error('REA browser page original changed');
if (!previous) {
  await writeFile(resolve(root, vendor), source);
  manifest.records.push({ source: sourcePath, sha256, vendor, symbols: ['jx', 'lS'] });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
const ast = parse(source, { sourceType: 'unambiguous' });
const definitions = new Map(), selected = new Set(), owners = new Map();
traverse(ast, { Program(path) {
  for (const [name, binding] of Object.entries(path.scope.bindings)) definitions.set(name, binding.path.node);
  path.traverse({ AssignmentExpression(p) {
    let target = p.node.left;
    while (t.isMemberExpression(target)) target = target.object;
    if (!t.isIdentifier(target) || !p.scope.getBinding(target.name)?.scope.path.isProgram()) return;
    const owner = p.findParent(parent => parent.isVariableDeclarator() &&
      t.isIdentifier(parent.node.id) && parent.scope.getBinding(parent.node.id.name)?.scope.path.isProgram());
    if (!owner || !t.isCallExpression(owner.node.init) ||
      !owner.node.init.arguments.some(arg => t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg))) return;
    const names = owners.get(target.name) ?? new Set();
    names.add(owner.node.id.name); owners.set(target.name, names);
  } });
  path.stop();
} });
function select(name) {
  if (selected.has(name) || !definitions.has(name)) return;
  selected.add(name);
  for (const owner of owners.get(name) ?? []) select(owner);
  const node = definitions.get(name);
  const wrapper = t.file(t.program([t.isStatement(node) ? t.cloneNode(node, true) : t.variableDeclaration('var', [t.cloneNode(node, true)])]));
  traverse(wrapper, {
    ReferencedIdentifier(path) {
      if (path.node.name === 'd' && path.parentPath.isMemberExpression() && path.parent.property.name === 'contextBridge') return;
      if (!path.scope.hasBinding(path.node.name)) select(path.node.name);
    },
    AssignmentExpression(path) { if (t.isIdentifier(path.node.left) && !path.scope.hasBinding(path.node.left.name)) select(path.node.left.name); },
  });
}
for (const name of ['jx', 'lS', 'hf', '_d', 'Of', 'Gd']) select(name);
if (selected.has('d')) throw new Error('Page component closure unexpectedly reaches Electron IPC');
const startup = ast.program.body.flatMap(node => t.isExpressionStatement(node) ?
  (t.isSequenceExpression(node.expression) ? node.expression.expressions : [node.expression]).filter(expression =>
    t.isCallExpression(expression) && t.isIdentifier(expression.callee) && selected.has(expression.callee.name) && expression.arguments.length === 0) : []);
const body = [...[...selected].map(name => definitions.get(name)), ...startup].sort((a, b) => a.start - b.start).map(node => {
  // This closure runs in the guest's main world already; retain the real site API
  // and replace only Electron's cross-world call, never expose its IPC object.
  const text = source.slice(node.start, node.end).replaceAll('d.contextBridge.executeInMainWorld', 'executeInPage');
  return t.isVariableDeclarator(node) ? `var ${text};` : `${text}${t.isCallExpression(node) ? ';' : ''}`;
});
body.unshift('const executeInPage = ({ func, args }) => func(...args);');
body.push('lS();', 'export { jx as mountBrowserCommentRuntime, hf as createAnnotationControls, _d as createAnnotationRequests, Of as observeAnnotationFeatures, Gd as installSiteAnnotationApi };');
await writeFile(resolve(root, 'src/client/rea-page-runtime.js'), body.join('\n') + '\n');
console.log(`REA page runtime: ${selected.size} original symbols, ${sha256}`);
