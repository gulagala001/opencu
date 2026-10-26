import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';

test('private screenshot bytes reach attachments without file or transport fields', async t => {
  const parent = resolve('.local'); await mkdir(parent, { recursive: true });
  const dataDir = await mkdtemp(join(parent, 'screenshot-transport-'));
  const target = { id: 'tab:transport', kind: 'tab', backend: 'browser', identity: { occurrence: 'one' }, title: 'Fixture' };
  const bytes = Buffer.from('encoded fixture bytes'), saved = [];
  let spoof = false, bridge = false;
  const runtime = createPluginRuntime({ dataDir, nativeEnabled: false, extensionEnabled: false, browser: {
    listTargets: async () => [target], select: async () => target, verify: async () => ({ valid: true, target }),
    observe: async (_target, options) => ({ observationId: 'observation:one', coordinateSpace: 'viewport-css-pixels',
      screenshot: { ...(bridge ? {data:bytes.toString('base64'),base64:bytes.toString('base64')} : {captureId: spoof ? 'unowned-capture' : options.captureImage(bytes)}), mediaType: 'image/png', width: 10, height: 10 } }),
    act: async () => ({}), release: async () => ({ released: true }), close: async () => {},
  } });
  t.after(async () => { await runtime.close(); await rm(dataDir, { recursive: true, force: true }); });
  const attachment = { attachmentId: 'image:owned', mediaType: 'image/png', bytes: bytes.length, width: 10, height: 10 };
  const attachments = { saveImage: async input => { saved.push(input.data); return attachment; } };
  await runtime.request('select', { reference: target.id });
  const first = await runtime.request('observe', { targetId: target.id, format: 'screenshot' }, { attachments });
  assert.deepEqual(saved, [bytes]); assert.deepEqual(first.image, attachment);
  assert.equal(first.observation.screenshot.captureId, undefined);
  assert.equal(first.observation.screenshot.path, undefined);
  assert.equal(first.observation.screenshot.base64, undefined);
  await runtime.request('observe', { targetId: target.id, format: 'screenshot' }, { attachments });
  assert.equal(saved.length, 1, 'existing content-based attachment reuse is preserved');
  bridge = true;
  assert.deepEqual(await runtime.request('observe', { targetId: target.id, format: 'screenshot' }, { attachments }), first, 'sidebar base64 and local buffer produce identical public results');
  bridge = false;
  assert.equal(createHash('sha256').update(saved[0]).digest('hex'), createHash('sha256').update(bytes).digest('hex'));
  const files = await readdir(dataDir, { recursive: true }); assert.ok(!files.some(path => path.endsWith('.png')));
  spoof = true;
  await assert.rejects(runtime.request('observe', { targetId: target.id, format: 'screenshot' }, { attachments }), { code: 'INVALID_SCREENSHOT' });
});
