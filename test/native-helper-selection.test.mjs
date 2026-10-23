import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {linuxHelper} from '../src/native/linux-helper.mjs';
import {createNativeBackend} from '../src/native/backend.mjs';

// Hyprland ships no RemoteDesktop portal, so the compositor backend has to win over the
// generic Wayland one even though both sessions report the same session type.
test('the linux helper prefers the Hyprland compositor backend', () => {
  assert.equal(linuxHelper({XDG_SESSION_TYPE: 'x11', DISPLAY: ':0'}), 'helper.py');
  assert.equal(linuxHelper({XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-1', XDG_CURRENT_DESKTOP: 'KDE'}), 'wayland.py');
  assert.equal(linuxHelper({XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'Hyprland'}), 'hyprland.py');
  // The instance signature is what hyprctl itself keys on, so it decides on its own.
  assert.equal(linuxHelper({WAYLAND_DISPLAY: 'wayland-1', HYPRLAND_INSTANCE_SIGNATURE: 'instance_1'}), 'hyprland.py');
  assert.equal(linuxHelper({XDG_SESSION_TYPE: 'wayland', HYPRLAND_INSTANCE_SIGNATURE: 'instance_1', XDG_CURRENT_DESKTOP: 'KDE'}), 'hyprland.py');
});

// A stub interpreter answers the opening handshake so the backend object can be inspected
// without a compositor. Its script argument is ignored: it is the interpreter, not the helper.
const stub = `
const readline = require('node:readline');
readline.createInterface({input: process.stdin}).on('line', line => {
  const request = JSON.parse(line);
  process.stdout.write(JSON.stringify({id: request.id, ok: true, result: request.method === 'hello' ? {protocol: 1} : {}}) + '\\n');
});
`;

// The hand-back is a Hyprland concept: only that helper moves the user's view, so every other
// session type has to keep its backend object exactly as it was.
test('only the Hyprland helper advertises the screen hand-back', {skip: process.platform !== 'linux'}, async t => {
  const awayFor = async env => {
    const dataDir = await mkdtemp(join(tmpdir(), 'opencu-handback-'));
    t.after(() => rm(dataDir, {recursive: true, force: true}));
    const script = join(dataDir, 'stub.cjs');
    await writeFile(script, stub);
    const interpreter = join(dataDir, 'stub.sh');
    await writeFile(interpreter, `#!/bin/sh\nexec "${process.execPath}" "${script}"\n`, {mode: 0o755});
    const saved = {...process.env};
    for (const key of ['XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'WAYLAND_DISPLAY', 'HYPRLAND_INSTANCE_SIGNATURE']) delete process.env[key];
    Object.assign(process.env, env);
    try {
      const backend = await createNativeBackend({dataDir, helperPath: interpreter});
      t.after(() => backend.close().catch(() => {}));
      return 'away' in backend;
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  };
  const session = {XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-1'};
  assert.equal(await awayFor({XDG_SESSION_TYPE: 'x11', DISPLAY: ':0'}), false, 'X11 keeps its backend shape');
  assert.equal(await awayFor({...session, XDG_CURRENT_DESKTOP: 'KDE'}), false, 'portal Wayland keeps its backend shape');
  assert.equal(await awayFor({...session, XDG_CURRENT_DESKTOP: 'GNOME'}), false, 'portal Wayland keeps its backend shape');
  assert.equal(await awayFor({...session, HYPRLAND_INSTANCE_SIGNATURE: 'instance_1'}), true, 'the Hyprland helper offers it');
});
