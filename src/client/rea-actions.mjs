import { services } from './rea-services.mjs';

export function reportActionError(error) {
  if (services.notify) services.notify('error', error?.message || String(error));
  else console.error('OpenCU action', error);
}

/** REA's synchronous boolean means the URL was handled, not that navigation completed. */
export function openBrowserLink(args) {
  let url;
  try { url = new URL(args.href ?? args.url); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const navigation = services.navigation;
  const { conversationId, disposition, openTarget, presentationIntent, useExternalBrowser } = args;
  // The detached page crosses Electron IPC; never forward DOM events or callbacks.
  void Promise.resolve().then(() => navigation.open({ href: url.href,
    conversationId, disposition, openTarget, presentationIntent, useExternalBrowser }))
    .catch(reportActionError);
  return true;
}

export async function copyFileContents(args) {
  try {
    const { text } = await services.workspaceFiles.read({ ...args, representation: 'text' });
    if (typeof text !== 'string') throw new Error('The file host did not return text');
    await services.clipboard.writeText(text);
    return true;
  } catch (error) { reportActionError(error); return false; }
}

export async function readFileBytes(path, hostId, signal) {
  signal?.throwIfAborted();
  const request = services.workspaceFiles.read({ path, hostId: hostId ?? 'local', representation: 'blob' });
  const cancel = () => request[Symbol.dispose]?.();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    const value = await request;
    signal?.throwIfAborted();
    if (typeof value.blob !== 'string') throw new Error('The file host did not return file bytes');
    return { contentsBase64: value.blob };
  } finally { signal?.removeEventListener('abort', cancel); }
}

/** A failed or explicitly blocked preparation must never fall through to the file action. */
export async function runFileAction(before, action, onError = reportActionError) {
  try {
    if (await before?.() === false) return false;
    return await action();
  } catch (error) { onError(error); return false; }
}
