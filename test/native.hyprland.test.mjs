import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {createNativeBackend, linuxHelper} from '../src/native/backend.mjs';

// Hyprland exposes no RemoteDesktop portal, so this backend runs only on a live
// Hyprland session. It never injects input: the checks stay read-only.
const live = process.platform === 'linux' && linuxHelper() === 'hyprland.py';

test('real Hyprland backend enumerates windows and captures the foreground one', {skip: !live}, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-hyprland-'));
  const backend = await createNativeBackend({dataDir});
  try {
    const targets = await backend.listTargets();
    assert.ok(Array.isArray(targets), 'listTargets must return an array');
    for (const target of targets) {
      assert.equal(target.backend, 'native');
      assert.equal(target.targetType, 'window');
      assert.ok(target.pid > 0, 'every window needs a process identity');
      assert.match(target.windowId, /^0x[0-9a-f]+$/);
      assert.ok(target.bounds.width > 0 && target.bounds.height > 0, 'layout-pixel bounds are required');
      // Reachability is per window: installing pyatspi must not make a terminal claim
      // accessibility input that it can never honour.
      assert.ok(['application', 'not-exposed', 'client-unavailable'].includes(target.a11y), 'every window reports its accessibility reach');
      const reachable = target.a11y === 'application';
      assert.equal(target.input, reachable ? 'accessibility-only' : 'posted-events-foreground');
      assert.deepEqual(target.backgroundActions, reachable ? ['set_value', 'ax_press', 'click', 'scroll', 'hitTest'] : []);
    }
    // A window without a tree must refuse background input before dispatching anything.
    const plain = targets.find(target => target.a11y !== 'application');
    if (plain) {
      await assert.rejects(backend.act(plain, {type: 'click', x: 10, y: 10}), error => {
        assert.equal(error.code, 'FOREGROUND_REQUIRED');
        assert.equal(error.details?.inputDispatched, false);
        return true;
      });
    }
    const permissions = await backend.permissions();
    assert.equal(permissions.sessionType, 'wayland');
    assert.equal(permissions.compositor, 'hyprland');
    const active = targets.find(target => target.active === true);
    if (active) {
      // The compositor reports layout pixels while the frame is physical pixels of a
      // scaled monitor; the reported scale has to match the captured ratio.
      const observed = await backend.observe(active, {format: 'screenshot'});
      const shot = observed.screenshot;
      assert.ok(shot.width > 0 && shot.height > 0);
      assert.ok(Math.abs(shot.width / shot.bounds.width - shot.scale) < 0.01, 'capture scale must match the monitor scale');
      const preview = await backend.preview(active);
      assert.match(preview.dataUrl, /^data:image\/png;base64,/);
      assert.equal((await backend.verify(active)).valid, true);
      await backend.release();
    }
  } finally {
    await backend.close();
  }
});

test('the helper gives up its session when its peer disappears', {skip: !live}, async () => {
  // A driver that crashes must not leave the controlled window parked in the
  // isolation workspace: the helper has to notice the closed pipe, release held
  // input and restore the desktop on its own.
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-hyprland-exit-'));
  const directory = join(dataDir, 'native');
  await mkdir(directory, {recursive: true});
  const helperPath = fileURLToPath(new URL('../native/linux/hyprland.py', import.meta.url));
  const child = spawn('/usr/bin/python3', [helperPath, '--data-dir', directory], {stdio: ['pipe', 'pipe', 'pipe']});
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
  try {
    const greeting = await new Promise((resolve, reject) => {
      const lines = createInterface({input: child.stdout});
      const timer = setTimeout(() => reject(new Error('helper never answered hello')), 15000);
      lines.once('line', line => { clearTimeout(timer); resolve(JSON.parse(line)); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdin.write(JSON.stringify({id: 1, method: 'hello', params: {}}) + '\n');
    });
    assert.equal(greeting.result.protocol, 1);
    // Vanish the way a killed driver does: no close request, both pipes gone.
    child.stdin.destroy();
    child.stdout.destroy();
    const outcome = await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error('helper still holds the session after its peer disappeared')), 6000)),
    ]);
    assert.equal(outcome.signal, null);
    assert.equal(outcome.code, 0);
  } finally {
    child.kill('SIGKILL');
  }
});
