import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

test('uploaded image and file sources open from full DSH references without OpenCU registration', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-source-preview-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const objects = new Map();
  const save = (data, name) => {
    const ref = { attachmentId: 'sha256:' + createHash('sha256').update(data).digest('hex'), name, bytes: data.length };
    objects.set(ref.attachmentId, data); return ref;
  };
  const image = { ...save(Buffer.from('uploaded-image'), 'compare_v2.jpg'), mediaType: 'image/jpeg', width: 2, height: 2 };
  const file = save(Buffer.from('uploaded-document'), '来源 文件.pdf');
  const attachments = {
    async readImage(ref) { assert.deepEqual(ref, image); return { ref, data: objects.get(ref.attachmentId) }; },
    async saveFileStream({ data, name }) { const chunks = []; for await (const chunk of data) chunks.push(chunk); return save(Buffer.concat(chunks), name); },
    async *readFileStream(ref) { yield objects.get(ref.attachmentId); },
  };
  const config = { dataDir: directory, nativeEnabled: false, browserEnabled: false, extensionEnabled: false };
  for (let reopen = 0; reopen < 2; reopen++) {
    const runtime = createPluginRuntime(config);
    try {
      for (const [kind, ref] of [['image', image], ['file', file]]) {
        const { path } = await runtime.request('sources/resolve', { kind, attachment: ref }, { attachments });
        assert.equal(basename(path), ref.name);
        assert.deepEqual(await readFile(path), objects.get(ref.attachmentId));
      }
      await assert.rejects(runtime.request('sources/resolve', { kind: 'file', attachment: { ...file, name: '../escape.pdf' } }, { attachments }), /Invalid delivered file reference/);
      await assert.rejects(runtime.request('sources/resolve', { kind: 'file', attachment: { ...file, name: 'bad.pdf', bytes: file.bytes + 1 } }, { attachments }), /bytes changed/);
      // Registry-only APIs keep their original ownership boundaries.
      await assert.rejects(runtime.request('files/resolve', file, { attachments }), /not in this OpenCU delivery registry/);
      await assert.rejects(runtime.request('image/resolve', { attachmentId: image.attachmentId }, { attachments }), { code: 'IMAGE_NOT_FOUND' });
      const aborted = new AbortController(); aborted.abort();
      await assert.rejects(runtime.request('sources/resolve', { kind: 'file', attachment: file }, { attachments, signal: aborted.signal }), { name: 'AbortError' });
      assert.equal((await readdir(directory)).includes('images.json'), false);
    } finally { await runtime.close(); }
  }
});
