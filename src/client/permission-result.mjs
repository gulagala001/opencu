const permissions = {
  SCREEN_CAPTURE_PERMISSION_REQUIRED: 'screenCapture',
  ACCESSIBILITY_PERMISSION_REQUIRED: 'accessibility',
  INPUT_PERMISSION_REQUIRED: 'postEvents',
  WAYLAND_PERMISSION_REQUIRED: 'remoteDesktop',
};

/** Read the error channel's leading diagnostic, never documentation or page output. */
export function permissionFailure(result) {
  if (result?.type !== 'error' || typeof result.error !== 'string') return null;
  // toolReplError prefixes the code before any partial observations or diagnostics.
  const match = result.error.trimStart().match(/^(?:[A-Za-z]*Error: )?\[([A-Z_]+)\] ([^\r\n]*)/);
  if (!match) return null;
  const [, code, message] = match;
  if (Object.hasOwn(permissions, code)) return permissions[code];
  // The portal uses a shared code for device grants; other denials are unrelated.
  if (code === 'PERMISSION_DENIED' && /^(?:Pointer access was not granted|The requested input device was not granted by the portal|Desktop-sharing session ended)\.?$/.test(message)) return 'remoteDesktop';
  return null;
}
