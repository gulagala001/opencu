import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dependencyRequire } from '../scripts/dependencies.mjs';
import { indexReaModule } from '../scripts/rea-index.mjs';

const require = dependencyRequire(), { parse } = require('@babel/parser'), traverse = require('@babel/traverse').default;
const t = createRequire(require.resolve('@babel/traverse'))('@babel/types');
const initBody = node => node.body.body.find(t.isReturnStatement)?.argument?.callee?.right?.arguments?.find(value => t.isArrowFunctionExpression(value) || t.isFunctionExpression(value))?.body;
const summary = mod => ({
  definitions: [...mod.defs].map(([name, node]) => [name, node.type, node.start, node.end]),
  owners: [...mod.owners].map(([name, owners]) => [name, [...owners]]), initializers: [...mod.init],
});
function index(source) {
  const mod = { ast: parse(source, { sourceType: 'module' }), defs: new Map(), owners: new Map(), init: new Set() };
  indexReaModule(mod, { traverse, t, initBody });
  return summary(mod);
}

test('per-declaration indexing matches the whole-module fallback for binding and owner edges', () => {
  for (const source of [
    'import {x as imported} from "./m.js"; var state, other; function boot(){return (boot=lazy(()=>{state=1;other.foo=2;}))();} export {state};',
    'var one, two; const load=lazy(()=>{one=1;two=2;}); function scoped(one){one=3;two=4;} one=5;',
    'var state; function init(){return(init=lazy(()=>{function nested(state){state=9;}const shadow=()=>{let state=0;state=1;};state=2;}))();}',
    'var a=1; var a; function helper(){a=3;global.foo=1;}',
    'var {x:a,y:[b]}=value; class C{method(a){a=1;b=2;}}',
    'var [a=missing,...rest]=value; function boot(){return(boot=lazy(()=>{a=rest;}))();}',
    'var state; const boot=lazy(()=>{try{throw 1;}catch(state){state=2;}state=3;});',
  ]) assert.deepEqual(index(source), index(source + '{}'));
});

test('nonflat declarations keep module-level bindings and exclude inner shadows', () => {
  for (const source of [
    'export let state=1; function init(){return(init=lazy(()=>{state=2;}))();}',
    'for(var counter=0;counter<3;counter++){} function init(){counter=4;}',
    'var A; {let A;A=2;} function init(){return(init=lazy(()=>{A=1;}))();}',
  ]) assert.deepEqual(index(source), index(source + '{}'));
  const result = index('var A; {let A;A=2;} function init(){return(init=lazy(()=>{A=1;}))();}');
  assert.deepEqual(result.owners, [['init', ['init']], ['A', ['init']]]);
  assert.deepEqual(result.initializers, ['init']);
});

test('destructuring writes retain every module binding and lazy initializer owner', () => {
  const source = 'var state, other, rest; function boot(){return(boot=lazy(()=>{({value:state,nested:[other=1],...rest}=next());}))();}';
  const result = index(source);
  assert.deepEqual(result.owners, [['boot', ['boot']], ['state', ['boot']], ['other', ['boot']], ['rest', ['boot']]]);
  assert.deepEqual(result.initializers, ['boot']);
  assert.deepEqual(result, index(source + '{}'));
});

test('destructuring distinguishes module targets, member roots, defaults and local shadows', () => {
  const source = 'var state, object; const boot=lazy(()=>{let shadow; [state,{value:shadow},object.value]=next();}); function local(state){({state}=next());}';
  const result = index(source);
  assert.deepEqual(result.owners, [['state', ['boot']], ['object', ['boot']]]);
  assert.deepEqual(result, index(source + '{}'));
});
