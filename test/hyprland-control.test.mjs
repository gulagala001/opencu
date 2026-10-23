import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Hyprland input cancellation, passive capture and desktop hand-back', t => {
  const result = spawnSync('python3', ['-B', fileURLToPath(new URL('./fixtures/hyprland-control.py', import.meta.url))], {encoding: 'utf8', timeout: 15000});
  if (result.error?.code === 'ENOENT') { t.skip('Python 3 is unavailable'); return; }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
