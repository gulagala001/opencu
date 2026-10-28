import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {platformSkip} from '../scripts/liveness/scope.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

test('macOS normal clicks, modal scopes and visible AX geometry use the live interaction policies', {skip: platformSkip('test/macos-interaction.test.mjs','macOS normal clicks, modal scopes and visible AX geometry use the live interaction policies')}, async t => {
  const local = join(root, '.local');
  await mkdir(local, {recursive: true});
  const directory = await mkdtemp(join(local, 'macos-interaction-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const native = join(root, 'native/macos');
  const args = ['swiftc', '-parse-as-library', '-import-objc-header', join(native, 'System.h')];
  const {stdout: compiler} = await exec('/usr/bin/xcrun', ['--find', 'swiftc']);
  const include = resolve(compiler.trim(), '../../include/swift');
  // Use the same compilation-only workaround as the helper builder when CLT
  // exposes two SwiftBridging declarations. Never alter the installed SDK.
  const maps = await Promise.all(['module.modulemap', 'bridging.modulemap'].map(name => readFile(join(include, name), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; })));
  if (maps.every(map => /module SwiftBridging/.test(map))) {
    const empty = join(directory, 'empty.modulemap'), overlay = join(directory, 'overlay.json');
    await writeFile(empty, '// Compilation-only duplicate module map.\n');
    await writeFile(overlay, JSON.stringify({version: 0, roots: [{type: 'file', name: join(include, 'module.modulemap'), 'external-contents': empty}]}));
    args.push('-vfsoverlay', overlay, '-Xcc', '-ivfsoverlay', '-Xcc', overlay);
  }
  const binary = join(directory, 'interaction-checks');
  await exec('/usr/bin/xcrun', [...args, '-framework', 'AppKit', '-framework', 'ApplicationServices', '-framework', 'Carbon',
    ...['Protocol.swift', 'Targets.swift', 'Accessibility.swift', 'Capture.swift'].map(name => join(native, name)), join(root, 'test/fixtures/macos-interaction.swift'), '-o', binary], {timeout: 120000, maxBuffer: 4 * 1024 * 1024});
  const {stdout} = await exec(binary, [], {timeout: 10000});
  assert.match(stdout, /macOS interaction checks passed/);
});
