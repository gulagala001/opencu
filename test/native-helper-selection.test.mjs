import test from 'node:test';
import assert from 'node:assert/strict';
import {linuxHelper} from '../src/native/linux-helper.mjs';

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
