import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, symlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const project = new URL('../', import.meta.url);
const original = 'import {o as lazy} from "./runtime.js"; var state, request=Object.freeze({seed:7}), calls=0; function make(){calls++;return {state:1,request:2};} function boot(){return(boot=lazy(()=>{({state,request}=make());}))();} export {state,request,calls,boot};';
const extracted = 'import * as Host from "../host-boundaries.mjs"; import {o as lazy} from "./runtime.js"; var state; var calls=0; function make(){calls++;return {state:1,request:2};} function boot(){return(boot=lazy(()=>{({state,request}=make());}))();} export {lazy,state,calls,make,boot};';
const lazyRuntime = 'var o=(e,t,n)=>()=>{if(n)throw n[0];try{return e&&(t=e(e=0)),t}catch(e){throw n=[e],e}}; export {o};';
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function fixture(t, source = original) {
  const root = await mkdtemp(join(tmpdir(), 'rea-extraction-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'src/client/rea', 'vendor/build-inputs/rea']) await mkdir(join(root, directory), { recursive: true });
  for (const file of ['extract-rea.mjs', 'rea-index.mjs', 'dependencies.mjs', 'lazy-grammars.json']) await cp(new URL('scripts/' + file, project), join(root, 'scripts', file));
  await cp(new URL('package.json', project), join(root, 'package.json'));
  await symlink(new URL('node_modules', project).pathname, join(root, 'node_modules'), 'dir');
  const record = { source: 'webview/assets/fixture.js', vendor: 'vendor/build-inputs/rea/original.js', sha256: sha256(source) };
  await writeFile(join(root, record.vendor), source);
  await writeFile(join(root, 'vendor/build-inputs/rea/manifest.json'), JSON.stringify({ records: [record] }));
  await writeFile(join(root, 'src/client/rea-boundaries.json'), '{}');
  await writeFile(join(root, 'src/client/rea/lazy-modules.json'), '[]');
  await writeFile(join(root, 'src/client/rea/fixture.js'), extracted);
  await writeFile(join(root, 'src/client/rea/provenance.json'), JSON.stringify([
    { file: 'fixture.js', source: record.vendor, sha256: record.sha256, symbols: ['lazy', 'state', 'calls', 'make', 'boot'], lazyInitializers: ['boot'], hostBoundaries: [] },
    { file: 'untouched.js', symbols: ['retained'] },
  ]));
  return { root, record, run(...args) {
    return spawnSync(process.execPath, ['scripts/extract-rea.mjs', '--rebuild-existing', ...args], { cwd: root, encoding: 'utf8' });
  } };
}

async function load(source) {
  const context = vm.createContext({});
  const runtime = new vm.SourceTextModule(lazyRuntime, { context });
  const host = new vm.SyntheticModule([], () => {}, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(name => name === './runtime.js' ? runtime : host);
  await module.evaluate();
  return { module, context };
}

test('bounded extraction restores the original declaration value and lazy live binding without globals', async t => {
  const f = await fixture(t);
  const broken = await load(extracted);
  assert.throws(() => broken.module.namespace.boot(), /request is not defined/);
  const result = f.run('fixture.js');
  assert.equal(result.status, 0, result.stderr);
  const generated = await readFile(join(f.root, 'src/client/rea/fixture.js'), 'utf8');
  assert.match(generated, /var request=Object\.freeze\(\{seed:7\}\);/);
  const expected = await load(original), actual = await load(generated);
  for (const value of [expected, actual]) {
    assert.equal(value.module.namespace.request.seed, 7);
    assert.equal(value.module.namespace.calls, 0);
    value.module.namespace.boot();
    const initialize = value.module.namespace.boot;
    assert.equal(value.module.namespace.state, 1);
    assert.equal(value.module.namespace.request, 2);
    value.module.namespace.boot();
    assert.equal(value.module.namespace.calls, 1);
    assert.equal(value.module.namespace.boot, initialize);
    assert.equal(Object.hasOwn(value.context, 'request'), false);
  }
  const provenance = JSON.parse(await readFile(join(f.root, 'src/client/rea/provenance.json'), 'utf8'));
  assert(provenance[0].symbols.includes('request'));
  assert.deepEqual(provenance[1], { file: 'untouched.js', symbols: ['retained'] });
  const before = await readFile(join(f.root, 'src/client/rea/provenance.json'), 'utf8');
  assert.equal(f.run('fixture.js').status, 0);
  assert.equal(await readFile(join(f.root, 'src/client/rea/fixture.js'), 'utf8'), generated);
  assert.equal(await readFile(join(f.root, 'src/client/rea/provenance.json'), 'utf8'), before);
});

test('bounded extraction rejects changed original bytes before writing output', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, f.record.vendor), original + '\n');
  const result = f.run('fixture.js');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REA original changed/);
  assert.equal(await readFile(join(f.root, 'src/client/rea/fixture.js'), 'utf8'), extracted);
});

test('bounded extraction requires the same original hash as the existing closure', async t => {
  const f = await fixture(t);
  const path = join(f.root, 'src/client/rea/provenance.json');
  const records = JSON.parse(await readFile(path, 'utf8'));
  records[0].sha256 = '0'.repeat(64);
  await writeFile(path, JSON.stringify(records));
  const result = f.run('fixture.js');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REA original\/provenance mismatch/);
  assert.equal(await readFile(join(f.root, 'src/client/rea/fixture.js'), 'utf8'), extracted);
});

test('bounded extraction rejects a new imported dependency rather than expanding the closure', async t => {
  const f = await fixture(t, original.replace('import {o as lazy}', 'import {seed} from "./external.js"; import {o as lazy}').replace('request=Object.freeze({seed:7})', 'request=seed'));
  const result = f.run('fixture.js');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Bounded REA rebuild needs a new import/);
  assert.equal(await readFile(join(f.root, 'src/client/rea/fixture.js'), 'utf8'), extracted);
});

test('bounded extraction rejects multiple AST-heavy modules in one process', async t => {
  const f = await fixture(t);
  const result = f.run('fixture.js', 'other.js');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /one module per process/);
  assert.equal(await readFile(join(f.root, 'src/client/rea/fixture.js'), 'utf8'), extracted);
});
