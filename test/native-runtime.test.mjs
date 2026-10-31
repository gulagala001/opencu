import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { prepareNativeRuntime } from '../host/native-runtime.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'native-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const koffi = join(root, 'node_modules/koffi'), pty = join(root, 'node_modules/node-pty');
  await mkdir(join(koffi, 'src/koffi'), { recursive: true });
  await mkdir(join(pty, 'lib'), { recursive: true });
  await writeFile(join(koffi, 'package.json'), JSON.stringify({ name: 'koffi', version: '3.1.1' }));
  await writeFile(join(pty, 'package.json'), JSON.stringify({ name: 'node-pty', version: '1.2.0-beta.15' }));
  for (const name of ['index.js', 'index.cjs', 'indirect.js', 'indirect.cjs']) await writeFile(join(koffi, 'src/koffi', name),
    `function loadDynamic(name) { let native2; native2 = require2(name); return native2; }\n` +
    (name.startsWith('index.') ? 'var native = loadStatic(pkg);\n' : ''));
  await writeFile(join(pty, 'lib/unixTerminal.js'), `
    helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');
    helperPath = helperPath.replace('node_modules.asar', 'node_modules.asar.unpacked');
    var term = pty.fork();
  `);
  const helpers = [];
  for (const path of ['prebuilds/darwin-arm64', 'prebuilds/darwin-x64', 'build/Release']) {
    await mkdir(join(pty, path), { recursive: true });
    const file = join(pty, path, 'spawn-helper'); await writeFile(file, 'synthetic helper'); await chmod(file, 0o644); helpers.push(file);
  }
  return { root, koffi, pty, helpers };
}

test('native preparation fixes every helper and loader variant, then verifies without writes', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareNativeRuntime(f.root, { platform: 'darwin', check: true }), /Unsafe native runtime/);
  const result = await prepareNativeRuntime(f.root, { platform: 'darwin' });
  assert.equal(result.changed, 8);
  for (const helper of f.helpers) assert.equal((await stat(helper)).mode & 0o111, 0o111);
  assert.equal((await prepareNativeRuntime(f.root, { platform: 'darwin', check: true })).changed, 0);
  assert.equal((await prepareNativeRuntime(f.root, { platform: 'darwin' })).changed, 0);
  const source = await readFile(join(f.pty, 'lib/unixTerminal.js'), 'utf8');
  for (const path of ['/a/app.asar/pty/spawn-helper', '/a/app.asar.unpacked/pty/spawn-helper', '/a/node_modules.asar/pty/spawn-helper']) {
    const accessed = [], context = { helperPath: path, process: { platform: 'darwin' }, fs: { constants: { X_OK: 1 }, accessSync: path => accessed.push(path) }, pty: { fork: () => 1 } };
    vm.runInNewContext(source, context);
    assert.equal(accessed.length, 1);
    assert.equal(accessed[0], path.replace(/\.asar\//, '.asar.unpacked/'));
    assert(!accessed[0].includes('.unpacked.unpacked'));
  }
});

test('all native inputs are validated before changing code or permissions', async t => {
  const f = await fixture(t);
  const file = join(f.koffi, 'src/koffi/index.js'), before = await readFile(file, 'utf8');
  await writeFile(join(f.pty, 'lib/unixTerminal.js'), 'incompatible package layout');
  await assert.rejects(prepareNativeRuntime(f.root, { platform: 'darwin' }), /Native runtime input changed/);
  assert.equal(await readFile(file, 'utf8'), before);
  for (const helper of f.helpers) assert.equal((await stat(helper)).mode & 0o111, 0);
});

test('Mach-O executables retain execute permission without changing addon libraries', async t => {
  const f = await fixture(t);
  const binary = (type, fat = false) => {
    const thin = Buffer.alloc(32); thin.writeUInt32BE(0xcffaedfe); thin.writeUInt32LE(type, 12);
    if (!fat) return thin;
    const header = Buffer.alloc(28); header.writeUInt32BE(0xcafebabe); header.writeUInt32BE(1, 4); header.writeUInt32BE(28, 16);
    return Buffer.concat([header, thin]);
  };
  for (const [name, type, fat] of [['rg', 2, false], ['office', 2, true], ['addon.node', 8, false]]) {
    const path = join(f.root, 'node_modules', name); await writeFile(path, binary(type, fat)); await chmod(path, 0o644);
  }
  await prepareNativeRuntime(f.root, { platform: 'darwin' });
  for (const name of ['rg', 'office']) assert.equal((await stat(join(f.root, 'node_modules', name))).mode & 0o111, 0o111);
  assert.equal((await stat(join(f.root, 'node_modules/addon.node'))).mode & 0o111, 0);
});

test('native preparation rejects unreviewed packages and escaped staging paths', async t => {
  const f = await fixture(t);
  await writeFile(join(f.koffi, 'package.json'), JSON.stringify({ name: 'koffi', version: '99.0.0' }));
  await assert.rejects(prepareNativeRuntime(f.root, { platform: 'darwin' }), /Unreviewed native runtime version/);
  await symlink(tmpdir(), join(f.root, 'node_modules/outside'));
  await assert.rejects(prepareNativeRuntime(f.root, { platform: 'darwin' }), /escapes staging/);
});

test('Koffi symbol isolation covers static and dynamic loads and restores on failure', async t => {
  const f = await fixture(t);
  await prepareNativeRuntime(f.root, { platform: 'darwin' });
  const source = await readFile(join(f.koffi, 'src/koffi/index.js'), 'utf8');
  const flags = [], error = new Error('native load failure');
  const process = { platform: 'darwin', dlopen(_module, _path, mode) { flags.push(mode); } };
  const original = process.dlopen;
  const require2 = name => {
    if (name === 'node:os') return { constants: { dlopen: { RTLD_NOW: 2, RTLD_LOCAL: 4 } } };
    process.dlopen({}, '/package/koffi.node');
    if (name === 'broken') throw error;
    return name;
  };
  const context = { process, require2, pkg: 'darwin-arm64', loadStatic: () => require2('static') };
  vm.runInNewContext(source, context);
  assert.equal(context.native, 'static');
  assert.equal(context.loadDynamic('dynamic'), 'dynamic');
  assert.throws(() => context.loadDynamic('broken'), value => value === error);
  assert.deepEqual(flags, [6, 6, 6]);
  assert.equal(process.dlopen, original);
});
