import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildMacHelper } from '../src/native/build.mjs';
import { macSigningIdentity, signMacHelper } from './macos-signing.mjs';

if (process.platform !== 'darwin') throw new Error('Build the macOS helper on macOS');
const signer = await macSigningIdentity();
const native = fileURLToPath(new URL('../native/', import.meta.url));
const binary = await buildMacHelper(join(native, '.build'), { compile: true });
const bundle = join(native, 'bin', `darwin-${process.arch}`, 'OpenCU Helper.app');
await mkdir(join(bundle, 'Contents', 'MacOS'), { recursive: true });
await copyFile(binary, join(bundle, 'Contents', 'MacOS', 'opencu-native'));
await copyFile(join(native, 'macos', 'Info.plist'), join(bundle, 'Contents', 'Info.plist'));
console.log(await signMacHelper(bundle, signer));
console.log(bundle);
