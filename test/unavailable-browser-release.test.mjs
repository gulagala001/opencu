import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRuntime} from '../src/runtime.mjs';
import {createCompositeBrowserBackend} from '../src/integration/browser.mjs';

const old = {id: 'old-tab', backend: 'browser', provider: 'browser', kind: 'tab', title: 'Old', url: 'about:blank',
  identity: {browserId: 'browser:local', connectionId: 'owned:previous', targetId: 'old'}};
function backend() {
  const target = {id: 'current', backend: 'browser', kind: 'tab', title: 'Current', url: 'about:blank', identity: {guestId: 'current'}};
  return { releases: 0, listTargets: async () => [target], select: async () => target, observe: async () => ({}), act: async () => ({}),
    verify: async () => ({valid: true, target}), async release() { this.releases++; return {released: true}; }, close: async () => {} };
}

test('retired browser targets recover without launching Chromium or deleting history; pending input still blocks', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-retired-'));
  await mkdir(join(dataDir, 'browser'));
  const journal = join(dataDir, 'browser/browser-inputs.json');
  await writeFile(journal, '[]');
  await writeFile(join(dataDir, 'controller.json'), JSON.stringify({version: 1, targets: [old], mode: 'release_failed', releasePending: true}));
  const dsh = backend();
  const runtime = await createRuntime({dataDir, dshBrowser: dsh, nativeEnabled: false, extensionEnabled: false});
  t.after(async () => { await writeFile(journal, '[]'); await runtime.close(); await rm(dataDir, {recursive: true, force: true}); });
  assert.equal(runtime.runtimeInfo.backends.browser, false);
  assert.equal((await runtime.stop()).ok, true);
  assert.equal((await runtime.selectTarget('current')).ok, true);
  assert.equal((await runtime.resume({targetId: 'current'})).ok, true);
  assert.equal((await runtime.getState()).state.targets.some(value => value.id === old.id), true);
  assert.equal(await readFile(journal, 'utf8'), '[]');
  for (const content of [JSON.stringify([{id: old.id, identity: old.identity, keys: ['Shift'], buttons: []}]), '{broken', '[{}]']) {
    await writeFile(journal, content);
    const before = dsh.releases;
    const stopped = await runtime.stop();
    assert.equal(stopped.ok, false);
    assert.equal(stopped.error.code, 'RELEASE_FAILED');
    assert.equal(dsh.releases, before + 1, 'unavailable provider must not prevent live provider cleanup');
    assert.equal(await readFile(journal, 'utf8'), content, 'keep journal evidence');
    assert.equal((await runtime.resume({targetId: 'current'})).ok, false);
  }
  await writeFile(journal, '[]');
  assert.equal((await runtime.resume({targetId: 'current'})).ok, true);
});

test('unknown unavailable provider remains blocked while all available providers are released', async () => {
  const dsh = backend(), extension = backend();
  const composite = createCompositeBrowserBackend({dsh, extension});
  const result = await composite.release({targets: [old]});
  assert.equal(result.released, false);
  assert.equal(result.failures[0].code, 'BACKEND_UNAVAILABLE');
  assert.equal(dsh.releases, 1);
  assert.equal(extension.releases, 1);
});
