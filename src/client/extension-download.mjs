// Document-relative, like the official DSH browser download routes: preserve
// the application's <base> and reverse-proxy mount, without changing API trust.
const route = 'api/opencu/extension.zip';
export async function downloadExtensionZip(signal) {
  signal.throwIfAborted();
  const options = { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal };
  const head = await fetch(route, { ...options, method: 'HEAD' });
  signal.throwIfAborted();
  if (!head.ok) throw new Error(`Extension download failed: HTTP ${head.status}`);
  const length = Number(head.headers.get('content-length')), etag = head.headers.get('etag');
  if (head.headers.get('content-type') !== 'application/zip' || !Number.isSafeInteger(length) || length <= 0 || length > 8 * 1024 * 1024 || !/^"[a-f0-9]{64}"$/.test(etag ?? '')) throw new Error('The extension download response is invalid.');
  const response = await fetch(route, { ...options, method: 'GET' });
  if (!response.ok) throw new Error(`Extension download failed: HTTP ${response.status}`);
  if (response.headers.get('content-type') !== 'application/zip' || response.headers.get('etag') !== etag || Number(response.headers.get('content-length')) !== length) throw new Error('The extension download changed. Please retry.');
  const blob = await response.blob();
  signal.throwIfAborted();
  if (blob.size !== length) throw new Error('The extension download was incomplete. Please retry.');
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'opencu-extension.zip';
    signal.throwIfAborted(); anchor.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
