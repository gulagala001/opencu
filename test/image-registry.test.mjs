import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImageRegistry } from '../src/dsh/image-registry.mjs';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

const image = index => ({ attachmentId: 'sha256:' + createHash('sha256').update(String(index)).digest('hex'), mediaType: 'image/png', bytes: 12, width: 2, height: 2, name: `image-${index}.png` });
const bucket = ref => createHash('sha256').update(ref.attachmentId).digest('hex')[0];

async function directory(t) {
  const path = await fs.mkdtemp(join(tmpdir(), 'opencu-images-'));
  t.after(() => fs.rm(path, { recursive: true, force: true })); return path;
}

test('image registry keeps legacy bytes and cold-restores queued unique references and snapshots', async t => {
  const root = await directory(t), old = image(0), legacy = JSON.stringify({ [old.attachmentId]: old });
  await fs.writeFile(join(root, 'images.json'), legacy);
  const registry = createImageRegistry(() => root), refs = Array.from({ length: 40 }, (_, i) => image(i + 1));
  const mutable = image(100), snapshot = structuredClone(mutable), pending = registry.retain(mutable);
  mutable.attachmentId = 'changed'; mutable.width = 999;
  await Promise.all([pending, ...refs.flatMap(ref => [registry.retain(ref), registry.retain(ref)]), registry.retain(old)]);
  await registry.close();
  assert.equal(await fs.readFile(join(root, 'images.json'), 'utf8'), legacy);
  assert.deepEqual(registry.get(snapshot.attachmentId), snapshot);
  const files = await fs.readdir(join(root, 'image-registry'));
  assert.ok(files.length <= 16); assert.ok(files.every(name => /^[a-f0-9][.]json$/.test(name)));
  const reopened = createImageRegistry(() => root); await reopened.ready();
  for (const ref of [old, snapshot, ...refs]) assert.deepEqual(reopened.get(ref.attachmentId), ref);
  assert.equal(reopened.get('toString'), undefined); await reopened.close();
});

for (const phase of ['write', 'rename']) test('image registry ' + phase + ' failure is uncommitted and retryable after cold reopen', async t => {
  const root = await directory(t), original = image(1), added = image(2), registry = createImageRegistry(() => root);
  await registry.retain(original);
  const path = join(root, 'image-registry', bucket(added) + '.json'), write = fs.writeFile, rename = fs.rename;
  try {
    let injected = false;
    fs.writeFile = async (target, data, ...options) => {
      if (phase === 'write' && String(target) === path + '.pending' && !injected) {
        injected = true; await write(target, String(data).slice(0, 12), ...options);
        throw Object.assign(Error('partial registry write'), { code: 'ENOSPC' });
      }
      return write(target, data, ...options);
    };
    fs.rename = async (from, to) => {
      if (phase === 'rename' && String(to) === path && !injected) { injected = true; throw Object.assign(Error('registry rename'), { code: 'EACCES' }); }
      return rename(from, to);
    }; syncBuiltinESMExports();
    await assert.rejects(registry.retain(added), { code: phase === 'write' ? 'ENOSPC' : 'EACCES' });
    assert.equal(injected, true); assert.equal(registry.get(added.attachmentId), undefined);
    assert.equal((await fs.readdir(join(root, 'image-registry'))).some(name => name.endsWith('.pending')), false);
  } finally { fs.writeFile = write; fs.rename = rename; syncBuiltinESMExports(); await registry.close(); }
  const reopened = createImageRegistry(() => root); await reopened.ready();
  assert.deepEqual(reopened.get(original.attachmentId), original); assert.equal(reopened.get(added.attachmentId), undefined);
  await reopened.retain(added); await reopened.close();
  const final = createImageRegistry(() => root); await final.ready(); assert.deepEqual(final.get(added.attachmentId), added); await final.close();
});

test('plugin image endpoints read legacy and sharded references after restart without changing image bytes', async t => {
  const root = await directory(t), old = image(0), added = image(1), data = Buffer.from('exact-image-bytes');
  await fs.writeFile(join(root, 'images.json'), JSON.stringify({ [old.attachmentId]: old }));
  const config = { dataDir: root, browserEnabled: false, nativeEnabled: false, extensionEnabled: false };
  let runtime = createPluginRuntime(config);
  const seen = [], attachments = { async saveImage() { return added; }, async readImage(ref) { seen.push(ref); return { data }; } };
  try {
    assert.deepEqual((await runtime.request('image/save', { data: data.toString('base64'), mediaType: 'image/png' }, { attachments })).image, added);
    await runtime.close(); runtime = createPluginRuntime(config);
    for (const ref of [old, added]) assert.deepEqual(await runtime.request('image', { attachmentId: ref.attachmentId }, { attachments }), { ok: true, mediaType: 'image/png', data: data.toString('base64') });
    assert.deepEqual(seen, [old, added]);
    await assert.rejects(runtime.request('image', { attachmentId: image(2).attachmentId }, { attachments }), { code: 'IMAGE_NOT_FOUND' });
  } finally { await runtime.close(); }
});
