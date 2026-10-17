import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { access, chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMacHelperIdentity } from '../src/native/macos-identity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim();

export async function macSigningIdentity({ initialize = false } = {}) {
  if (process.env.OPENCU_SIGN_IDENTITY) {
    if (process.env.OPENCU_SIGN_IDENTITY === '-') throw new Error('Ad-hoc signing invalidates macOS permissions after updates. Use the persistent OpenCU signing identity.');
    return { identity: process.env.OPENCU_SIGN_IDENTITY, keychain: process.env.OPENCU_SIGN_KEYCHAIN };
  }
  const directory = resolve(process.env.OPENCU_SIGN_DIRECTORY || join(root, '.local/macos-signing'));
  const manifest = join(directory, 'identity.json');
  try { await access(manifest); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!initialize) throw new Error('A persistent macOS signing identity is required. Set OPENCU_SIGN_IDENTITY (and optionally OPENCU_SIGN_KEYCHAIN), or run node scripts/macos-signing.mjs --init-local once. Never regenerate the identity for an update.');
    await mkdir(directory, { mode: 0o700 });
    try {
      const key = join(directory, 'key.pem'), certificate = join(directory, 'certificate.pem');
      run('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '3650', '-subj', '/CN=OpenCU Local Development/', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,digitalSignature,keyCertSign', '-addext', 'extendedKeyUsage=critical,codeSigning', '-keyout', key, '-out', certificate]);
      await chmod(key, 0o600);
      run('/usr/bin/openssl', ['rsa', '-in', key, '-outform', 'DER', '-out', join(directory, 'key.der')]);
      await chmod(join(directory, 'key.der'), 0o600);
      run('/usr/bin/openssl', ['x509', '-in', certificate, '-outform', 'DER', '-out', join(directory, 'certificate.der')]);
      const identity = run('/usr/bin/openssl', ['x509', '-in', certificate, '-noout', '-fingerprint', '-sha1']).split('=').at(-1).replaceAll(':', '');
      await writeFile(manifest, JSON.stringify({ identity, kind: 'local-development-memory', certificate: 'certificate.der' }, null, 2) + '\n', { mode: 0o600 });
      await rm(key);
    } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  }
  const { identity, kind } = JSON.parse(await readFile(manifest, 'utf8'));
  if (!/^[A-Fa-f0-9]{40}$/.test(identity) || kind !== 'local-development-memory') throw new Error('Invalid persistent macOS signing identity; restore its original key/certificate, do not regenerate it for an update.');
  await access(join(directory, 'key.der'));
  return { identity, directory };
}

export async function signMacHelper(bundle, { identity, keychain, directory }) {
  if (directory) {
    const source = join(root, 'scripts/macos-sign-local.c');
    const digest = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 16);
    const command = join(directory, `sign-${process.arch}-${digest}`);
    try { await access(command); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const temporary = command + '-' + randomBytes(8).toString('hex');
      try {
        run('/usr/bin/xcrun', ['clang', '-Wno-deprecated-declarations', source, '-framework', 'Security', '-framework', 'CoreFoundation', '-o', temporary]);
        await rename(temporary, command);
      } finally { await rm(temporary, { force: true }); }
    }
    run(command, [join(directory, 'key.der'), join(directory, 'certificate.der'), bundle]);
  } else {
    run('/usr/bin/codesign', ['--force', '--sign', identity, ...(keychain ? ['--keychain', keychain] : []), '--timestamp=none', bundle]);
  }
  run('/usr/bin/codesign', ['--verify', '--strict', bundle]);
  const displayed = spawnSync('/usr/bin/codesign', ['-dr', '-', bundle], { encoding: 'utf8', timeout: 10000 });
  if (displayed.status !== 0) throw new Error(displayed.stderr || 'Could not read the helper signing requirement');
  const requirement = (displayed.stdout + displayed.stderr).split('\n').find(line => line.startsWith('designated => '))?.slice('designated => '.length);
  if (!requirement || /cdhash\b/.test(requirement) || !/certificate|anchor/.test(requirement)) throw new Error('macOS helper signing must use a persistent certificate, not a build-specific code hash');
  // This public pin is retained across all builds, hosts and distribution variants.
  const pin = join(root, 'native/macos/signing-identity.json');
  let previous;
  try { previous = JSON.parse(await readFile(pin, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && previous.requirement !== requirement) throw new Error('OpenCU signing identity changed. Restore the original signer; replacing this pin would invalidate existing macOS authorizations.');
  if (!previous) await writeFile(pin, JSON.stringify({ version: 1, bundleIdentifier: 'ai.opencu.native-helper', requirement }, null, 2) + '\n');
  await checkMacHelperIdentity(bundle, previous ?? { version: 1, bundleIdentifier: 'ai.opencu.native-helper', requirement });
  return `designated => ${requirement}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--init-local')) throw new Error('Use --init-local to create a persistent workspace-only development signing identity');
  const signer = await macSigningIdentity({ initialize: true });
  console.log(`Persistent macOS signing identity: ${signer.identity}\nDirectory: ${signer.directory ?? signer.keychain}`);
}
