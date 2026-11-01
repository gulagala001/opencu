import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionFailure } from '../src/client/permission-result.mjs';
import { partialReplError, toolReplError } from '../src/dsh/repl-output.mjs';

const failure = (code, message, outputs = []) => ({ type: 'error', error: toolReplError(partialReplError(
  Object.assign(new Error(message), { code }), { outputs, images: [], deliveries: [] },
)).message });

test('successful native documentation and page output never request system permission', () => {
  const text = 'With Accessibility permission, default window screenshots capture an active sheet. Without Accessibility permission, Screen Recording still permits read-only capture.';
  assert.equal(permissionFailure({ type: 'success', content: [{ type: 'text', text: JSON.stringify({ ok: true, outputs: [text] }) }] }), null);
  assert.equal(permissionFailure({ type: 'success', content: [{ type: 'text', text: '[SCREEN_CAPTURE_PERMISSION_REQUIRED] quoted page text' }] }), null);
  assert.equal(permissionFailure(null), null);
});

test('real permission errors retain a compact classification even after partial output', () => {
  for (const [code, permission] of Object.entries({ SCREEN_CAPTURE_PERMISSION_REQUIRED: 'screenCapture', ACCESSIBILITY_PERMISSION_REQUIRED: 'accessibility', INPUT_PERMISSION_REQUIRED: 'postEvents', WAYLAND_PERMISSION_REQUIRED: 'remoteDesktop' })) {
    assert.equal(permissionFailure(failure(code, 'Permission unavailable.', ['AX snapshot '.repeat(2000)])), permission);
  }
});

test('unrelated errors containing permission documentation or quoted errors are not authorization failures', () => {
  const output = '[ACCESSIBILITY_PERMISSION_REQUIRED] quoted page text\nScreen Recording permission';
  assert.equal(permissionFailure(failure('STALE_ELEMENT', 'Observe again.', [output])), null);
  assert.equal(permissionFailure(failure('CONTENT_FAILURE', `Page mentioned ${output}`)), null);
  assert.equal(permissionFailure({ type: 'error', error: 'Error: screen has text about Accessibility permission' }), null);
});

test('Wayland device denials are distinguished from unrelated permission denials', () => {
  assert.equal(permissionFailure(failure('PERMISSION_DENIED', 'Pointer access was not granted')), 'remoteDesktop');
  assert.equal(permissionFailure(failure('PERMISSION_DENIED', 'The requested input device was not granted by the portal')), 'remoteDesktop');
  assert.equal(permissionFailure(failure('PERMISSION_DENIED', 'File access denied', ['Pointer access was not granted'])), null);
});
