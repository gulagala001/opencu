import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { createDirectSession } from '../scripts/cu-direct.mjs';

test('direct sessions require explicit isolated storage and reject backend injection', async () => {
  await assert.rejects(createDirectSession(), {code: 'ISOLATED_PATH_REQUIRED'});
  await assert.rejects(createDirectSession({dataDir: join(homedir(), '.opencu'), outputDir: '/tmp/direct-output'}), {code: 'ISOLATED_PATH_REQUIRED'});
  await assert.rejects(createDirectSession({dataDir: '/tmp/direct-data', outputDir: '/tmp/direct-output', config: {browser: {}}}), {code: 'INVALID_CONFIG'});
});

test('production direct Worker preserves errors, stores real attachments and cancels cleanly', async () => {
  const root = await mkdtemp(join(process.env.OPENCU_TEST_TEMP_DIR ?? tmpdir(), 'opencu-direct-'));
  const metricsOutput = join(root, 'metrics', 'calls.jsonl');
  const session = await createDirectSession({dataDir: join(root, 'data'), outputDir: join(root, 'output'),
    config: {browserEnabled: false}, metricsOutput});
  try {
    assert.equal(session.pid, process.pid);
    const result = await session.run({code: 'var privateSentinel = "private-content-sentinel"; 40+2', title: 'private-title-sentinel'});
    assert.equal(result.outputs.at(-1), '42');
    assert.ok(result.timing.totalMs >= 0);
    await assert.rejects(session.run({code: 'throw Object.assign(new Error("synthetic"), {code:"SYNTHETIC",details:{stage:"smoke"}})'}),
      error => error.code === 'SYNTHETIC' && error.details.stage === 'smoke');
    await assert.rejects(session.run({code: 'while(true) {}', timeoutMs: 20}),
      error => error.code === 'COMPUTER_TIMEOUT' && error.details.stage === 'javascript');
    assert.equal((await session.run({code: 'typeof privateSentinel'})).outputs.at(-1), 'undefined');
    const data = await sharp({create: {width: 2, height: 3, channels: 4, background: '#abcdef'}}).png().toBuffer();
    const saved = await session.request('image/save', {mediaType: 'image/png', data: data.toString('base64'), name: 'sample.png'});
    assert.equal(saved.image.width, 2); assert.equal(saved.image.height, 3);
    const image = await session.readImage(saved.image);
    assert.deepEqual(await readFile(image.path), data);
    assert.equal((await stat(image.path)).mode & 0o777, 0o600);
    const resolved = await session.request('image/resolve', {attachmentId: saved.image.attachmentId});
    assert.deepEqual(await readFile(resolved.path), data);
    const metrics = await readFile(metricsOutput, 'utf8');
    assert.ok(!metrics.includes('private-content-sentinel') && !metrics.includes('private-title-sentinel') && !metrics.includes('sample.png'));
    assert.equal((await stat(metricsOutput)).mode & 0o777, 0o600);
    const active = session.run({code: 'while(true) {}', timeoutMs: 10000});
    const cancelled = assert.rejects(active, /disposed/);
    await new Promise(resolve => setTimeout(resolve, 30));
    await session.close(); await cancelled;
    assert.deepEqual(await session.close(), {ok: true, closed: true});
    assert.throws(() => session.run({code: '1'}), {code: 'SESSION_CLOSED'});
  } finally { await session.close(); await rm(root, {recursive: true, force: true}); }
});
