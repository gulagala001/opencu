import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const forbidden = path => /(?:^|\/)(?:AGENTS|CLAUDE|AI_README|PLAN|REFERENCE|COMPONENT-ALLOCATION|.*HANDOFF|PROMPT_(?:MAINTENANCE|CHANGES))\.md$/i.test(path)
  || /(?:^|\/)(?:\.local|\.codegraph|work|data|test-results|playwright-report|vendor\/rea)(?:\/|$)/.test(path)
  || /(?:^|\/)(?:codegraph\.json|\.env(?:\.[^/]*)?|[^/]+\.log)$/.test(path) && !path.endsWith('.env.example');

// Read members only. Never extract an archive into the checkout or execute its contents.
export async function verifyWebPackage(archive, directory = root) {
  const tar = args => execFileSync('tar', args, { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  archive = resolve(archive);
  const names = tar(['-tzf', archive]).toString('utf8').trimEnd().split('\n');
  assert.equal(new Set(names).size, names.length, 'Duplicate package members');
  for (const name of names) {
    assert(name.startsWith('package/') && !name.includes('\\') && !name.split('/').includes('..'), 'Invalid package member');
    assert(!forbidden(name), `Private or development file in package: ${name}`);
    assert(!name.startsWith('package/node_modules/'), 'Dependencies must not be bundled');
    assert(!name.startsWith('package/src/client/'), 'Unbundled client source must not replace the production client');
  }
  const read = member => {
    assert(names.includes('package/' + member), `Missing package member: ${member}`);
    return tar(['-xOzf', archive, '--', 'package/' + member]);
  };
  const metadata = JSON.parse(read('package.json'));
  const sourceMetadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  assert.equal(metadata.name, sourceMetadata.name);
  assert.equal(metadata.version, sourceMetadata.version);
  assert.equal(metadata.exports?.['./client'], './lib/client.js', 'Unexpected production client export');
  assert.equal(metadata.exports['./client'], sourceMetadata.exports?.['./client']);
  // The ES factory is derived by the bundling host at build time and never shipped.
  assert(!names.includes('package/lib/client.factory.mjs'), 'Build-time client factory must not be packed');
  const summaries = [];
  for (const file of ['lib/client.js']) {
    const packed = read(file), built = await readFile(resolve(directory, file));
    assert.equal(sha256(packed), sha256(built), `Packed frontend differs from rebuilt file: ${file}`);
    const source = packed.toString('utf8');
    for (const marker of ['managedHeadless', 'browserUnavailableMessage', 'This web page has no desktop adapter for the embedded browser', 'Start a separate headless browser on the DSH server machine']) {
      assert(source.includes(marker), `Packed frontend is missing web fix marker ${marker}: ${file}`);
    }
    summaries.push({ file, bytes: packed.length, sha256: sha256(packed) });
  }
  for (const file of ['src/runtime.mjs', 'src/dsh/runtime.mjs', 'src/dsh/browser-host.mjs', 'src/dsh/config.mjs', 'src/dsh/index.mjs']) {
    assert.equal(sha256(read(file)), sha256(await readFile(resolve(directory, file))), `Packed server differs from source: ${file}`);
  }
  return { package: `${metadata.name}@${metadata.version}`, members: names.length, frontend: summaries };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/check-web-package.mjs <one-built-package.tgz>');
  console.log(JSON.stringify(await verifyWebPackage(process.argv[2]), null, 2));
}
