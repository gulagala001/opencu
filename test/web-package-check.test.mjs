import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyWebPackage } from '../scripts/check-web-package.mjs';

const runtime = 'lib/rea-assets/opencu-client-AAAAAAAA.js';
const chunk = 'lib/rea-assets/opencu-chunk-BBBBBBBB.js';
const manifest = files => JSON.stringify([runtime, chunk].map(file => ({
  file: file.split('/').at(-1), sha256: createHash('sha256').update(files[file]).digest('hex'), source: 'opencu-client-build',
})));

async function fixture(t, mutate = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-package-check-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source'), staging = join(directory, 'staging');
  const files = {
    'package.json': JSON.stringify({ name: 'opencu', version: 'test', exports: { './client': './lib/client.js' } }),
    'lib/client.js': 'import("/api/opencu/rea-assets/opencu-client-AAAAAAAA.js")',
    [runtime]: 'import "./opencu-chunk-BBBBBBBB.js"; // managedHeadless browserUnavailableMessage',
    [chunk]: 'This web page has no desktop adapter for the embedded browser Start a separate headless browser on the DSH server machine',
    ...Object.fromEntries(['src/runtime.mjs', 'src/dsh/runtime.mjs', 'src/dsh/browser-host.mjs', 'src/dsh/config.mjs', 'src/dsh/index.mjs'].map(file => [file, 'export {};\n'])),
  };
  files['lib/rea-assets/manifest.json'] = manifest(files);
  const packed = { ...files }; mutate(packed, files);
  for (const [root, values] of [[source, files], [join(staging, 'package'), packed]]) {
    for (const [file, bytes] of Object.entries(values)) {
      const path = join(root, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
    }
  }
  const archive = join(directory, 'fixture.tgz');
  execFileSync('tar', ['-czf', archive, '-C', staging, 'package']);
  return { source, archive };
}

test('package checker accepts matching synthetic rebuilt files and returns hashes only', async t => {
  const f = await fixture(t); const result = await verifyWebPackage(f.archive, f.source);
  assert.equal(result.frontend.length, 3); assert.match(result.frontend[0].sha256, /^[a-f0-9]{64}$/);
});
test('package checker rejects stale packed client bytes', async t => {
  const f = await fixture(t, packed => { packed['lib/client.js'] += 'old'; });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /differs from rebuilt/);
});
test('package checker rejects matching bundles lacking the web fix', async t => {
  const f = await fixture(t, (packed, source) => {
    packed[chunk] = source[chunk] = 'old bundle';
    packed['lib/rea-assets/manifest.json'] = source['lib/rea-assets/manifest.json'] = manifest(source);
  });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /missing web fix marker/);
});
test('package checker rejects a missing lazy chunk', async t => {
  const f = await fixture(t, packed => { delete packed[chunk]; });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /Missing package member/);
});
test('package checker rejects a stale lazy chunk', async t => {
  const f = await fixture(t, packed => { packed[chunk] += 'old'; });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /differs from rebuilt/);
});
test('package checker rejects a loader pointing outside the packaged runtime', async t => {
  const f = await fixture(t, (packed, source) => { packed['lib/client.js'] = source['lib/client.js'] = 'import("/other.js")'; });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /must reference the packaged runtime/);
});
test('package checker rejects a manifest that disagrees with matching chunk bytes', async t => {
  const f = await fixture(t, (packed, source) => { packed[chunk] = source[chunk] = 'changed'; });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /hash differs from manifest/);
});
test('package checker rejects private package content', async t => {
  const f = await fixture(t, packed => { packed['data/example.json'] = '{}'; });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /Private or development file/);
});
test('package checker rejects stale packed server bytes', async t => {
  const f = await fixture(t, packed => { packed['src/dsh/config.mjs'] = '// old config'; });
  await assert.rejects(verifyWebPackage(f.archive, f.source), /Packed server differs/);
});
