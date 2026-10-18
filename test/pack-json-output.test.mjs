import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Exercise the real public-file guard through npm's lifecycle in an isolated,
// synthetic Git repository. No dependency install, network or browser is used.
async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'opencu-pack-json-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, 'repo'); await mkdir(root);
  await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'scripts/check-public-files.mjs'), await readFile(new URL('../scripts/check-public-files.mjs', import.meta.url)));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'opencu-pack-fixture', version: '0.0.0', type: 'module', files: ['index.mjs'], scripts: { prepack: 'node scripts/check-public-files.mjs' } }));
  await writeFile(join(root, 'index.mjs'), 'export {};\n');
  const git = args => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']); git(['add', '.']);
  git(['-c', 'user.name=Package test', '-c', 'user.email=package-test@example.invalid', 'commit', '--quiet', '-m', 'Synthetic fixture']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  return root;
}

test('public-file prepack status does not corrupt npm pack JSON stdout', async t => {
  const root = await fixture(t);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, npm_config_cache: join(root, '../npm-cache') } });
  assert.equal(result.status, 0, result.stderr);
  const packed = JSON.parse(result.stdout);
  assert.equal(packed.length, 1); assert.equal(packed[0].filename, 'opencu-pack-fixture-0.0.0.tgz');
  assert.match(result.stderr, /Public files\/history\/package passed/);
});

test('public-file prepack still blocks forbidden files instead of producing a package', async t => {
  const root = await fixture(t); await mkdir(join(root, 'data')); await writeFile(join(root, 'data/example.json'), '{}');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, npm_config_cache: join(root, '../npm-cache') } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Git public files: data\/example.json/);
});
