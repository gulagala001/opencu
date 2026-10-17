import { dependencyRequire } from './dependencies.mjs';

const require = dependencyRequire(), { parse } = require('@babel/parser'), traverse = require('@babel/traverse').default;

/** Keep the original REA files intact; change only their exact byte decoder idiom. */
export function optimizeBase64(source, expected) {
  const ast = parse(source, { sourceType: 'module' }), edits = [], identifiers = new Set();
  traverse(ast, {
    Identifier(path) { identifiers.add(path.node.name); },
    CallExpression(path) {
      const node = path.node, callee = node.callee, [decode, callback] = node.arguments;
      if (node.arguments.length !== 2 || callee.type !== 'MemberExpression' || callee.computed
        || callee.object.type !== 'Identifier' || callee.object.name !== 'Uint8Array' || callee.property.name !== 'from'
        || path.scope.getBinding('Uint8Array') || decode?.type !== 'CallExpression' || decode.arguments.length !== 1
        || decode.callee.type !== 'Identifier' || decode.callee.name !== 'atob' || path.scope.getBinding('atob')
        || decode.arguments[0].type === 'SpreadElement' || callback?.type !== 'ArrowFunctionExpression' || callback.async
        || callback.params.length !== 1 || callback.params[0].type !== 'Identifier') return;
      const body = callback.body, member = body.callee;
      if (body.type !== 'CallExpression' || body.arguments.length !== 1 || body.arguments[0].type !== 'NumericLiteral'
        || body.arguments[0].value !== 0 || member.type !== 'MemberExpression' || member.computed
        || member.object.type !== 'Identifier' || member.object.name !== callback.params[0].name || member.property.name !== 'charCodeAt') return;
      edits.push([node.start, node.end, source.slice(decode.arguments[0].start, decode.arguments[0].end)]);
      path.traverse({ Identifier(path) { identifiers.add(path.node.name); } });
      path.skip();
    },
  });
  if (expected !== undefined && edits.length !== expected) throw new Error(`REA Base64 decoder changed: expected ${expected}, found ${edits.length}`);
  if (!edits.length) return source;
  let helper = '_opencuDecodeBase64';
  while (identifiers.has(helper)) helper += '_';
  for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + `${helper}(${value})` + source.slice(end);
  return `import { decodeBase64 as ${helper} } from '../base64.mjs';\n` + source;
}
