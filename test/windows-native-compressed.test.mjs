import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { unpackWindowsNativeExecutable, installPackagedWindowsNative } from '../src/computer-use/windows-native-prebuilt.mjs';
import { windowsNativeBuild } from '../src/computer-use/windows-native-build.mjs';
const hash = data => createHash('sha256').update(data).digest('hex');

for (const scenario of ['valid', 'changed archive', 'changed output', 'oversized output', 'existing destination']) {
  test('compressed Windows payload: ' + scenario, async t => {
    const root = await mkdtemp(join(tmpdir(), 'opencu-compressed-')); t.after(() => rm(root, { recursive: true, force: true }));
    const data = Buffer.from('MZ bounded synthetic payload'), packed = gzipSync(data);
    const source = join(root, 'program.gz'), destination = join(root, 'program.exe');
    await writeFile(source, packed);
    const archive = { format: 'gzip', size: packed.length, sha256: hash(packed) };
    const expected = { size: data.length, sha256: hash(data) };
    if (scenario === 'changed archive') archive.sha256 = '0'.repeat(64);
    if (scenario === 'changed output') expected.sha256 = '0'.repeat(64);
    if (scenario === 'oversized output') expected.size--;
    if (scenario === 'existing destination') await writeFile(destination, 'preserve');
    if (scenario === 'valid') {
      await unpackWindowsNativeExecutable(source, destination, expected, archive);
      assert.deepEqual(await readFile(destination), data);
    } else {
      await assert.rejects(unpackWindowsNativeExecutable(source, destination, expected, archive));
      if (scenario === 'existing destination') assert.equal(await readFile(destination, 'utf8'), 'preserve');
      else await assert.rejects(access(destination), { code: 'ENOENT' });
    }
  });
}

test('the actual compressed Windows runtime restores its exact PE and self-contained build receipt', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-windows-pe-')); t.after(() => rm(root, { recursive: true, force: true }));
  const expected = await windowsNativeBuild('x64');
  const result = await installPackagedWindowsNative(root, expected);
  assert.equal(result.provider, 'packaged-prebuilt');
  assert.equal(result.manifest.selfContained, true);
  assert.equal(result.manifest.archive.format, 'gzip');
});
