/** Names written by an assignment, including nested patterns and member roots. */
export function assignmentTargets(node, t) {
  if (t.isIdentifier(node)) return [node.name];
  if (t.isMemberExpression(node)) return assignmentTargets(node.object, t);
  if (t.isAssignmentPattern(node)) return assignmentTargets(node.left, t);
  if (t.isRestElement(node)) return assignmentTargets(node.argument, t);
  if (t.isArrayPattern(node)) return node.elements.flatMap(element => assignmentTargets(element, t));
  if (t.isObjectPattern(node)) return node.properties.flatMap(property => assignmentTargets(t.isRestElement(property) ? property.argument : property.value, t));
  return [];
}

export function indexReaModule(mod, { traverse, t, initBody }) {
  const nodes = mod.ast.program.body;
  const flat = nodes.every(node => t.isImportDeclaration(node) || t.isVariableDeclaration(node)
    || (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) && node.id
    || t.isExportNamedDeclaration(node) && !node.declaration
    || t.isExportAllDeclaration(node) || t.isExpressionStatement(node) || t.isEmptyStatement(node));
  const owners = path => {
    const targets = assignmentTargets(path.node.left, t).filter(name => {
      const binding = path.scope.getBinding(name);
      return binding ? binding.scope.path.isProgram() : mod.defs.has(name);
    });
    if (!targets.length) return;
    let statement = path;
    while (statement.parentPath && !statement.parentPath.isProgram()) statement = statement.parentPath;
    const declarator = path.findParent(parent => parent.isVariableDeclarator() && t.isIdentifier(parent.node.id) && parent.scope.getBinding(parent.node.id.name)?.scope.path.isProgram());
    if (declarator && t.isCallExpression(declarator.node.init) && declarator.node.init.arguments.some(arg => t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg))) {
      for (const target of targets) {
        const names = mod.owners.get(target) ?? new Set();
        names.add(declarator.node.id.name); mod.owners.set(target, names);
      }
    }
    if (statement.isFunctionDeclaration() && t.isBlockStatement(initBody(statement.node))) {
      const owner = statement.node.id.name;
      for (const target of targets) {
        const names = mod.owners.get(target) ?? new Set();
        names.add(owner); mod.owners.set(target, names);
      }
      mod.init.add(owner);
    }
  };
  if (!flat) {
    traverse(mod.ast, { Program(path) {
      for (const [name, binding] of Object.entries(path.scope.bindings)) mod.defs.set(name, binding.path.node);
      path.traverse({ AssignmentExpression: owners }); path.stop();
    } });
    traverse.cache.clear(); return;
  }
  // Retain plain AST nodes, not a whole module's Babel paths and scope graph.
  const define = (name, node) => { if (!mod.defs.has(name)) mod.defs.set(name, node); };
  for (const node of nodes) {
    if (t.isImportDeclaration(node)) for (const specifier of node.specifiers) define(specifier.local.name, specifier);
    else if (t.isVariableDeclaration(node)) for (const declaration of node.declarations) for (const name of Object.keys(t.getBindingIdentifiers(declaration.id))) define(name, declaration);
    else if (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) define(node.id.name, node);
  }
  for (const node of nodes) {
    if (t.isImportDeclaration(node) || t.isExportNamedDeclaration(node) || t.isExportAllDeclaration(node)) continue;
    traverse(t.file(t.program([node])), { AssignmentExpression: owners });
    traverse.cache.clear();
  }
}
