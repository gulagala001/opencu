import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createNativeBackend, mapScreenshotPoint, normalizeAction} from '../src/native/backend.mjs';
import {buildMacHelper} from '../src/native/build.mjs';
import {createHelperTransport} from '../src/native/transport.mjs';

const exec = promisify(execFile);
const directory = new URL('../native/.build/', import.meta.url).pathname;

test('physical screenshot points and public native action aliases', () => {
  assert.deepEqual(mapScreenshotPoint([400, 200], {width: 1000, height: 800,
    bounds: {x: 100, y: 80, width: 500, height: 400}}), {x: 300, y: 180});
  assert.throws(() => mapScreenshotPoint([1000, 0], {width: 1000, height: 800,
    bounds: {x: 0, y: 0, width: 500, height: 400}}), {code: 'INVALID_COORDINATES'});
  assert.equal(normalizeAction({type: 'press', key: 'escape'}).type, 'press_key');
  assert.equal(normalizeAction({type: 'fill', element: 3, value: 'text'}).elementId, 3);
});

test('real macOS helper build, identity, capture and permission outcomes', {skip: process.platform !== 'darwin'}, async () => {
  await mkdir(directory, {recursive: true});
  const dataDir = await mkdtemp(join(directory, 'native-smoke-'));
  const command = await buildMacHelper(join(dataDir, 'native'));
  const {stdout} = await exec(command, ['--self-test']);
  assert.equal(JSON.parse(stdout).ok, true);
  const backend = await createNativeBackend({dataDir});
  try {
    assert.deepEqual(Object.keys(backend).sort(), ['act', 'close', 'listTargets', 'observe', 'release', 'select', 'verify']);
    const targets = await backend.listTargets();
    assert.ok(targets.length > 0, 'real running applications must be enumerated');
    await assert.rejects(createNativeBackend({dataDir}), {code: 'NATIVE_DATA_LOCKED'});
    const target = targets.find(t => t.targetType === 'window') ?? targets[0];
    assert.equal((await backend.verify(target, {cold: true})).valid, true);
    const changed = {...target, identity: {...target.identity, processStart: '0:0'}};
    assert.equal((await backend.verify(changed, {cold: true})).valid, false);
    const bundleChanged = {...target, identity: {...target.identity, bundleId: 'not.the.real.bundle'}};
    assert.equal((await backend.verify(bundleChanged, {cold: true})).valid, false);
    if (target.windowId) {
      assert.equal((await backend.verify({...target, identity: {...target.identity, windowId: -1}}, {cold: true})).valid, false);
    }
    for (const format of ['ax', 'screenshot']) {
      try {
        const observation = await backend.observe(target, {format});
        if (format === 'ax') assert.ok(observation.ax.nodes.length > 0);
        else {
          const image = observation.screenshot;
          assert.ok(image.width > 0 && image.height > 0 && image.scale > 0);
          assert.equal(image.scaleX, image.width / image.bounds.width);
          assert.equal((await readFile(image.path)).subarray(1, 4).toString(), 'PNG');
        }
      } catch (error) {
        assert.ok(['ACCESSIBILITY_PERMISSION_REQUIRED', 'SCREEN_CAPTURE_PERMISSION_REQUIRED'].includes(error.code), JSON.stringify(error));
        assert.equal(error.details.permissions.prompted, false);
      }
    }
    assert.equal((await backend.release({targets})).released, true);
  } finally {await backend.close();}
});

test('real permission-denied release retains durable held keys/buttons across helper restart', {skip: process.platform !== 'darwin'}, async t => {
  await mkdir(directory, {recursive: true});
  const dataDir = await mkdtemp(join(directory, 'release-regression-'));
  const command = await buildMacHelper(dataDir);
  const diagnostic = JSON.parse((await exec(command, ['--self-test'])).stdout);
  if (diagnostic.permissions.postEvents) {t.skip('Do not seed held input on a machine allowed to post real events'); return;}
  const journal = join(dataDir, 'input-journal.json');
  const held = {version: 1, keys: [55], buttons: [0]};
  await writeFile(journal, JSON.stringify(held));
  const transport = createHelperTransport(command, ['--data-dir', dataDir]);
  const hello = await transport.request('hello');
  assert.equal(hello.recoveryRequired, true);
  const result = await transport.request('release');
  assert.equal(result.released, false);
  assert.deepEqual(result.heldKeys, held.keys);
  assert.deepEqual(result.heldButtons, held.buttons);
  assert.ok(result.failures.every(error => error.code === 'INPUT_PERMISSION_REQUIRED'));
  await assert.rejects(transport.close(), {code: 'RELEASE_FAILED'});
  assert.deepEqual(JSON.parse(await readFile(journal, 'utf8')), held);
  // EOF exits nonzero after a real failed release, but never deletes/clears the journal.
  await transport.disconnect();
  const restarted = createHelperTransport(command, ['--data-dir', dataDir]);
  try {
    const recovery = await restarted.request('hello');
    assert.deepEqual(recovery.input.heldKeys, held.keys);
    assert.deepEqual(recovery.input.heldButtons, held.buttons);
  } finally {await restarted.disconnect();}
  assert.deepEqual(JSON.parse(await readFile(journal, 'utf8')), held);
});
