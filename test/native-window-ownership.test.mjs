import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('X11, Wayland and Hyprland enforce window ownership and bound tree/scroll traversal', t => {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./fixtures/native-window-ownership.py', import.meta.url))], {encoding: 'utf8', timeout: 10000});
  if (result.error?.code === 'ENOENT') { t.skip('Python 3 is unavailable'); return; }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
