import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { dependencyRequire } from './dependencies.mjs';

const require = dependencyRequire();
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/** Keep the original cursor and motion closure without the settings/React barrel's side effects. */
export async function cursorModules(root) {
  const directory = resolve(root, 'src/client/rea'), modules = new Map();
  const allowed = new Set(['cursor-chat-2be21330f98f.js', 'app-shared-2f2228189a8d.js', 'rolldown-runtime-2d059c5e81f4.js']);
  async function select(file, name) {
    if (dirname(file) !== directory || !allowed.has(basename(file))) throw new Error(`Unexpected cursor dependency: ${file}:${name}`);
    let module = modules.get(file);
    if (!module) {
      const source = await readFile(file, 'utf8'), ast = parse(source, { sourceType: 'module' });
      let program; traverse(ast, { Program(path) { program = path; path.stop(); } });
      module = { source, program, selected: new Set(), declarations: new Set(), imports: new Map() };
      modules.set(file, module);
    }
    if (module.selected.has(name)) return;
    module.selected.add(name);
    const binding = module.program.scope.getBinding(name);
    if (!binding) throw new Error(`Missing original cursor binding: ${file}:${name}`);
    if (binding.path.isImportSpecifier()) {
      const declaration = binding.path.parentPath.node;
      let names = module.imports.get(declaration);
      if (!names) module.imports.set(declaration, names = new Set());
      names.add(binding.path.node.local.name);
      await select(resolve(dirname(file), declaration.source.value), binding.path.node.imported.name);
      return;
    }
    const statement = binding.path.isVariableDeclarator() ? binding.path.parentPath : binding.path;
    if (!statement.isFunctionDeclaration() && !statement.isVariableDeclaration()) throw new Error(`Unsupported original cursor declaration: ${file}:${name}`);
    if (module.declarations.has(statement.node)) return;
    module.declarations.add(statement.node);
    const dependencies = new Set();
    statement.traverse({ ReferencedIdentifier(path) {
      const dependency = path.scope.getBinding(path.node.name);
      if (dependency?.scope === module.program.scope) dependencies.add(path.node.name);
    } });
    for (const dependency of dependencies) await select(file, dependency);
  }
  const entry = resolve(directory, 'cursor-chat-2be21330f98f.js');
  for (const name of ['c', '$', 'Ne', 'Pe']) await select(entry, name);
  const contents = new Map();
  for (const [file, module] of modules) {
    const imports = [...module.imports].map(([node, names]) => `import { ${node.specifiers.filter(specifier => names.has(specifier.local.name)).map(specifier => `${specifier.imported.name} as ${specifier.local.name}`).join(', ')} } from ${JSON.stringify(node.source.value)};`);
    const declarations = [...module.declarations].sort((a, b) => a.start - b.start).map(node => module.source.slice(node.start, node.end));
    contents.set(file, [...imports, ...declarations, `export { ${[...module.selected].join(', ')} };`].join('\n'));
  }
  return { name: 'rea-cursor-closure', setup(build) {
    build.onLoad({ filter: /\/src\/client\/rea\/.*\.js$/ }, args => contents.has(args.path) ? { contents: contents.get(args.path), loader: 'js' } : undefined);
  } };
}
