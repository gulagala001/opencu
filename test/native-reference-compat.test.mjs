import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { frontendFixture } from './fixtures/frontend.mjs';

test('native user references survive bundled renderer names on the matching host', { timeout: 60000 }, async t => {
  const require = createRequire(new URL('../package.json', import.meta.url));
  const pkg = require('./package.json');
  const chat = JSON.parse(await readFile(new URL('../vendor/dsh-chat.json', import.meta.url)));
  for (const name of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-llm', '@deepseek-ai/cordis', '@deepseek-ai/schemastery']) assert.equal(require(name + '/package.json').version, pkg.devDependencies[name], 'the actual installed SDK matches this host variant');
  assert.equal(chat.version, pkg.devDependencies['@deepseek-ai/dsh'], 'the native Chat snapshot belongs to the actual SDK host');
  const { page, rpc, sessionId, errors } = await frontendFixture(t);
  const marker = '<computer-use-target>' + JSON.stringify({ kind: 'browser', id: 'browser', label: 'Bound browser' }) + '</computer-use-target>';
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'Continue with ' + marker }] });
  const bubble = page.locator('.tx-cu-user-bubble').filter({ hasText: 'Continue with' });
  await bubble.locator('[data-computer-use-reference="browser"]').waitFor();
  assert.equal(await bubble.locator('[data-computer-use-reference]').count(), 1);
  assert.equal((await bubble.innerText()).replace(/\s+/g, ' ').trim(), 'Continue with Bound browser');
  assert.doesNotMatch(await bubble.innerText(), /computer-use-target/);
  assert.deepEqual(errors, [], 'the native Chat and computer client initialize without browser errors');
  if (process.env.OPENCU_REFERENCE_ARTIFACTS) {
    const directory = resolve(process.env.OPENCU_REFERENCE_ARTIFACTS);
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, 'reference.png') });
    await writeFile(join(directory, 'reference.html'), await page.content());
  }
});
