import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
