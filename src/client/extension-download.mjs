// Document-relative, like the official DSH browser download routes: preserve
// the application's <base> and reverse-proxy mount, without changing API trust.
const route = 'api/opencu/extension.zip';
const maxBytes = 8 * 1024 * 1024;
const invalid = 'The extension download response is invalid.';
const changed = 'The extension download changed. Please retry.';
const incomplete = 'The extension download was incomplete. Please retry.';

function contentLength(response, message) {
  const value = response.headers.get('content-length');
  // Desktop protocol forwarding and chunked HTTP responses may omit this header.
  if (value === null) return null;
  const length = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(length) || length <= 0 || length > maxBytes) throw new Error(message);
  // Fetch decodes Content-Encoding, but retains the encoded Content-Length.
  const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
  return encoding && encoding !== 'identity' ? null : length;
}

export async function downloadExtensionZip(signal) {
  signal.throwIfAborted();
  const options = { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal };
  const head = await fetch(route, { ...options, method: 'HEAD' });
  signal.throwIfAborted();
  if (head.status !== 200) throw new Error(`Extension download failed: HTTP ${head.status}`);
  const length = contentLength(head, invalid), etag = head.headers.get('etag');
  if (head.headers.get('content-type') !== 'application/zip' || head.headers.has('content-range') || !/^"[a-f0-9]{64}"$/.test(etag ?? '')) throw new Error(invalid);
  const response = await fetch(route, { ...options, method: 'GET' });
  const reader = response.body?.getReader();
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let blob;
  try {
    signal.throwIfAborted();
    if (response.status !== 200) throw new Error(`Extension download failed: HTTP ${response.status}`);
    const receivedLength = contentLength(response, changed);
    if (response.headers.get('content-type') !== 'application/zip' || response.headers.has('content-range') || response.headers.get('etag') !== etag ||
        length !== null && receivedLength !== null && receivedLength !== length) throw new Error(changed);
    if (!reader) throw new Error(incomplete);
    const expectedLength = receivedLength ?? length, chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(invalid);
      if (expectedLength !== null && size > expectedLength) throw new Error(incomplete);
      chunks.push(value);
    }
    if (size === 0 || expectedLength !== null && size !== expectedLength) throw new Error(incomplete);
    blob = new Blob(chunks, { type: 'application/zip' });
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel(); reader?.releaseLock();
  }
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'opencu-extension.zip';
    signal.throwIfAborted(); anchor.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
