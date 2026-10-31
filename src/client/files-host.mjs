import { reaIntl } from './rea-locale.mjs';
import { decodeBase64 } from './base64.mjs';

/** Map REA's local file actions to real DSH deliveries and desktop operations. */
export function createFilesHost({ client, desktop, sidebar, openSession }) {
  const calls = new Set();
  let disposed = false;
  function request(work) {
    const abort = new AbortController(); calls.add(abort);
    const result = Promise.resolve().then(async () => {
      if (disposed) throw new Error('The file host has been disposed');
      abort.signal.throwIfAborted();
      const value = await work(abort.signal);
      abort.signal.throwIfAborted();
      return value;
    }).finally(() => calls.delete(abort));
    result[Symbol.dispose] = () => abort.abort();
    return result;
  }
  async function resolve(path, signal) {
    if (path.startsWith('opencu-file:')) {
      const value = new URL(path);
      const { path: local } = await client.request('files/resolve', { attachmentId: value.searchParams.get('id'), name: value.searchParams.get('name') }, signal);
      return local;
    }
    if (path.startsWith('file:')) {
      const url = new URL(path), local = decodeURIComponent(url.pathname);
      if (url.hostname && url.hostname !== 'localhost') return `//${url.hostname}${local}`;
      return /^\/[A-Za-z]:\//.test(local) ? local.slice(1) : local;
    }
    return path;
  }
  async function operate(operation, args, signal) {
    if (typeof desktop?.files !== 'function') throw new Error('This DSH desktop does not provide local file actions');
    if (args.hostId && args.hostId !== 'local') throw new Error('Only local files can be opened by this desktop');
    let path = await resolve(args.path, signal);
    if (!/^(?:[\\/]|[A-Za-z]:[\\/])/.test(path) && typeof args.cwd === 'string') path = `${args.cwd}/${path}`;
    signal.throwIfAborted();
    if (disposed) throw new Error('The file host has been disposed');
    return desktop.files(operation, { ...args, path });
  }
  const workspaceFiles = {
    saveCopy: args => request(signal => operate('saveCopy', args, signal)),
    getMetadata: args => request(signal => operate('metadata', args, signal)),
    write: args => request(signal => {
      if (args.path.startsWith('opencu-file:')) throw new Error('Save a local copy before editing a delivered attachment');
      return operate('write', args, signal);
    }),
    read: args => request(async signal => {
      const data = await operate('read', args, signal);
      const metadata = { sizeBytes: data.sizeBytes, etag: data.etag };
      return args.representation === 'text'
        ? { ...metadata, text: new TextDecoder().decode(decodeBase64(data.contentsBase64)) }
        : { ...metadata, blob: data.contentsBase64 };
    }),
  };
  async function show(path, sessionId, signal) {
    if (sidebar.mounted.getSnapshot() !== sessionId) await openSession(sessionId);
    signal.throwIfAborted();
    const encode = value => encodeURIComponent(value).replace(/%3A/gi, ':');
    sidebar.openResourceIn(sessionId, `dsh-resource://file/session/${encode(sessionId)}/${path.replace(/\\/g, '/').split('/').map(encode).join('/')}`);
  }
  const openIn = {
    getTargets: args => request(async signal => {
      const { icon } = await operate('targets', args, signal);
      const chinese = reaIntl().locale.startsWith('zh');
      return { mode: 'native', preferredTarget: 'systemDefault', availableTargets: ['systemDefault', 'fileManager'], targets: [
        { id: 'systemDefault', target: 'systemDefault', kind: 'native', label: chinese ? '默认应用' : 'Default application', icon, resolvedIcon: icon, available: true, default: true },
        { id: 'fileManager', target: 'fileManager', kind: 'native', label: chinese ? '在文件夹中显示' : 'Show in folder', icon, resolvedIcon: icon, available: true },
      ] };
    }),
    open: args => request(signal => operate('open', { ...args, target: args.target ?? 'systemDefault' }, signal)),
  };
  return {
    openIn, workspaceFiles,
    address: ref => `opencu-file:delivery?id=${encodeURIComponent(ref.attachmentId)}&name=${encodeURIComponent(ref.name)}`,
    saveImageCopy: ref => request(async signal => {
      const { path } = await client.request('image/resolve', { attachmentId: ref.attachmentId }, signal);
      signal.throwIfAborted();
      return operate('saveCopy', { path, hostId: 'local' }, signal);
    }),
    async previewSource(source, sessionId) {
      const abort = new AbortController(); calls.add(abort);
      try {
        if (disposed) throw new Error('The file host has been disposed');
        const { path } = await client.request('sources/resolve', {
          kind: source.kind, attachment: source.kind === 'image' ? source.attachment : source.file,
        }, abort.signal);
        if (disposed) throw new Error('The file host has been disposed');
        await show(path, sessionId, abort.signal);
      } finally { calls.delete(abort); }
    },
    async previewImage(ref, sessionId) {
      const abort = new AbortController(); calls.add(abort);
      try {
        const { path } = await client.request('image/resolve', { attachmentId: ref.attachmentId }, abort.signal);
        if (disposed) throw new Error('The image host has been disposed');
        await show(path, sessionId, abort.signal);
      } finally { calls.delete(abort); }
    },
    async preview(ref, sessionId) {
      const abort = new AbortController(); calls.add(abort);
      try {
        const { path } = await client.request('files/resolve', ref, abort.signal);
        if (disposed) throw new Error('The file host has been disposed');
        await show(path, sessionId, abort.signal);
      } finally { calls.delete(abort); }
    },
    dispose() { disposed = true; for (const abort of calls) abort.abort(); calls.clear(); },
  };
}
