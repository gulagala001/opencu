import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, cp, mkdtemp, rm, symlink, unlink, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildExtensionZip, validateExtensionNames } from '../src/extension/distribution.mjs';
import distribution from '../src/extension/distribution.json' with { type: 'json' };
const root = new URL('../', import.meta.url);
async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'opencu-static-zip-'))); t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL('extension/', root), join(directory, 'extension'), { recursive: true });
  await cp(new URL('package.json', root), join(directory, 'package.json'));
  return directory;
}
test('deterministic ZIP independently extracts the exact pinned static files at its root', async t => {
  const directory = await fixture(t), first = await buildExtensionZip(directory), second = await buildExtensionZip(directory);
  assert(first.equals(second));
  await writeFile(join(directory, 'extension.zip'), first);
  const listing = JSON.parse(execFileSync('python3', ['-c', `import zipfile,json,sys,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert all(x.date_time==(1980,1,1,0,0,0) and x.compress_type==0 and x.external_attr>>16==0o100644 for x in z.infolist())
 print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))`, join(directory, 'extension.zip')], { encoding: 'utf8' }));
  assert.deepEqual(listing, distribution.files); assert.equal(Object.keys(listing).length, Object.keys(distribution.files).length); assert(listing['manifest.json']);
  assert.equal(JSON.parse(await readFile(join(directory, 'extension/manifest.json'))).key, JSON.parse(await readFile(new URL('extension/manifest.json', root))).key);
  assert(Number(JSON.parse(await readFile(join(directory, 'extension/manifest.json'))).minimum_chrome_version) >= 125, 'Flat debugger child sessions require Chromium 125 or newer');
});
test('synthetic dataDir, profile and pairing secrets cannot enter the archive', async t => {
  const directory = await fixture(t); const before = await buildExtensionZip(directory);
  for (const name of ['dataDir/extension/token.json', 'profile/cookies', 'pairing/secret']) { const path = join(directory, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, 'SYNTHETIC_NEVER_PACKAGE_SECRET'); }
  const after = await buildExtensionZip(directory); assert(before.equals(after)); assert(!after.includes(Buffer.from('SYNTHETIC_NEVER_PACKAGE_SECRET')));
});
for (const name of ['../escape', '/absolute', 'C:drive', 'a\\b', 'a/b', 'CON', 'nul.txt', 'COM1.txt', 'trailing.', 'space ', 'manifest.JSON', 'a..b']) test(`portable names reject ${JSON.stringify(name)}`, () => {
  const names = Object.keys(distribution.files); names[0] = name; assert.throws(() => validateExtensionNames(names));
});
for (const change of ['missing', 'hash', 'version', 'extension-version', 'key', 'link', 'directory-link', 'extra']) test(`distribution fails closed on ${change}`, async t => {
  const directory = await fixture(t), file = join(directory, 'extension/manifest.json');
  if (change === 'missing') await unlink(file);
  if (change === 'hash') await writeFile(file, (await readFile(file)) + ' ');
  if (change === 'version') { const p = JSON.parse(await readFile(join(directory, 'package.json'))); p.version = 'wrong'; await writeFile(join(directory, 'package.json'), JSON.stringify(p)); }
  if (['extension-version', 'key'].includes(change)) { const p = JSON.parse(await readFile(file)); p[change === 'key' ? 'key' : 'version'] = 'wrong'; await writeFile(file, JSON.stringify(p)); }
  if (change === 'link') { await cp(file, join(directory, 'elsewhere')); await unlink(file); await symlink(join(directory, 'elsewhere'), file); }
  if (change === 'directory-link') { await cp(join(directory, 'extension'), join(directory, 'elsewhere'), { recursive: true }); await rm(join(directory, 'extension'), { recursive: true }); await symlink(join(directory, 'elsewhere'), join(directory, 'extension')); }
  if (change === 'extra') await writeFile(join(directory, 'extension/pairing-secret.json'), 'SYNTHETIC_SECRET');
  await assert.rejects(buildExtensionZip(directory));
});
test('cancelled archive validation aborts', async t => { const directory = await fixture(t); await assert.rejects(buildExtensionZip(directory, AbortSignal.abort())); });
test('direct prepack gate rejects a stale ZIP rather than silently shipping it', async t => {
  const directory = await fixture(t); await mkdir(join(directory, 'src/extension'), { recursive: true }); await mkdir(join(directory, 'lib'));
  for (const file of ['distribution.mjs', 'distribution.json']) await cp(new URL(`src/extension/${file}`, root), join(directory, 'src/extension', file));
  await mkdir(join(directory, 'scripts')); await cp(new URL('scripts/check-extension-distribution.mjs', root), join(directory, 'scripts/check-extension-distribution.mjs'));
  await writeFile(join(directory, 'lib/extension.zip'), 'STALE');
  assert.throws(() => execFileSync(process.execPath, ['scripts/check-extension-distribution.mjs'], { cwd: directory, stdio: 'pipe' }), /Command failed/);
  await writeFile(join(directory, 'lib/extension.zip'), await buildExtensionZip(directory));
  execFileSync(process.execPath, ['scripts/check-extension-distribution.mjs'], { cwd: directory, stdio: 'pipe' });
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'))); pkg.scripts = { prepack: 'node scripts/check-extension-distribution.mjs' }; await writeFile(join(directory, 'package.json'), JSON.stringify(pkg));
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json'], { cwd: directory, encoding: 'utf8', env: { ...process.env, npm_config_cache: join(directory, 'npm-cache') }, stdio: ['ignore', 'pipe', 'pipe'] }));
  assert.equal(packed.length, 1, 'prepack status must not corrupt normal npm pack JSON');
});

for (const change of ['missing zip', 'stale zip', 'missing extension', 'changed extension', 'package version']) test(`actual installed production route returns503 for ${change}`, async t => {
  const directory = await fixture(t); await mkdir(join(directory, 'src/extension'), { recursive: true }); await mkdir(join(directory, 'lib'));
  for (const file of ['distribution.mjs', 'distribution.json']) await cp(new URL(`src/extension/${file}`, root), join(directory, 'src/extension', file));
  await writeFile(join(directory, 'lib/extension.zip'), await buildExtensionZip(directory));
  if (change === 'missing zip') await unlink(join(directory, 'lib/extension.zip'));
  if (change === 'stale zip') await writeFile(join(directory, 'lib/extension.zip'), 'stale');
  if (change === 'missing extension') await unlink(join(directory, 'extension/manifest.json'));
  if (change === 'changed extension') await writeFile(join(directory, 'extension/options.js'), 'stale');
  if (change === 'package version') { const p = JSON.parse(await readFile(join(directory, 'package.json'))); p.version = 'wrong'; await writeFile(join(directory, 'package.json'), JSON.stringify(p)); }
  const production = await import(pathToFileURL(join(directory, 'src/extension/distribution.mjs'))); let route;
  production.registerExtensionDownload({ connection: { fetch: { register(value) { route = value; } } } });
  for (const method of ['GET', 'HEAD']) { const response = await route.fetch(new Request('http://synthetic.invalid/api/opencu/extension.zip', { method })); assert.equal(response.status, 503); assert.equal((await response.arrayBuffer()).byteLength, 0); assert(!response.headers.has('content-disposition')); }
});
