import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { dependencyRequire } from './dependencies.mjs';

const require = dependencyRequire();
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/** Keep host-bound modules bundled; only original data-only grammar closures are served lazily. */
export async function prepareLazyGrammars(root) {
  const files = JSON.parse(await readFile(new URL('./lazy-grammars.json', import.meta.url), 'utf8'));
  const lazy = new Set(JSON.parse(await readFile(resolve(root, 'src/client/rea/lazy-modules.json'), 'utf8')));
  const manifest = JSON.parse(await readFile(resolve(root, 'vendor/build-inputs/rea/manifest.json'), 'utf8'));
  const originals = new Map(manifest.records.map(record => [basename(record.source), record]));
  const pending = new Set(), checked = new Map();
  async function inspect(file) {
    if (!/^[\w-]+\.js$/.test(file)) throw new Error(`Unexpected grammar resource: ${file}`);
    if (checked.has(file)) return checked.get(file);
    if (pending.has(file)) throw new Error(`Cyclic grammar dependency: ${file}`);
    const record = originals.get(file);
    if (!record) throw new Error(`Missing original grammar: ${file}`);
    const source = await readFile(resolve(root, record.vendor), 'utf8');
    if (createHash('sha256').update(source).digest('hex') !== record.sha256) throw new Error(`REA grammar changed: ${file}`);
    if (file === 'rolldown-runtime-2d059c5e81f4.js') { checked.set(file, []); return []; }
    const ast = parse(source, { sourceType: 'module' }), dependencies = [], exports = [];
    for (const node of ast.program.body) {
      if (node.type === 'ImportDeclaration') {
        if (!/^\.\/[\w-]+\.js$/.test(node.source.value)) throw new Error(`Unexpected grammar import: ${file}`);
        dependencies.push(node.source.value.slice(2));
      } else if (node.type === 'ExportNamedDeclaration' && !node.source && !node.declaration) {
        exports.push(...node.specifiers.map(specifier => specifier.exported.name));
      } else if (!['VariableDeclaration', 'FunctionDeclaration', 'ExpressionStatement'].includes(node.type)) {
        throw new Error(`Unexpected grammar declaration: ${file}:${node.type}`);
      }
    }
    const grammar = source.includes('Object.freeze(JSON.parse(') && source.includes('scopeName');
    if (!grammar && ast.program.body.some(node => !['ImportDeclaration', 'ExportNamedDeclaration'].includes(node.type)
      && !(node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' && node.expression.callee.type === 'Identifier'))) {
      throw new Error(`Not a pure grammar wrapper: ${file}`);
    }
    traverse(ast, { ReferencedIdentifier(path) {
      if (!path.scope.getBinding(path.node.name) && !['Object', 'JSON'].includes(path.node.name)) throw new Error(`Unexpected grammar global: ${file}:${path.node.name}`);
    } });
    pending.add(file);
    for (const dependency of dependencies) await inspect(dependency);
    pending.delete(file); checked.set(file, exports);
    return exports;
  }
  if (!Array.isArray(files) || new Set(files).size !== files.length) throw new Error('Invalid lazy grammar manifest');
  for (const file of files) {
    if (!lazy.has(file)) throw new Error(`Grammar is no longer dynamically loaded: ${file}`);
    const exports = await inspect(file);
    if (exports.length !== 1 || exports[0] !== 'default') throw new Error(`Grammar default export changed: ${file}`);
  }
  return new Set(files);
}
