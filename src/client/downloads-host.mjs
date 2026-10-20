import * as Shared from './rea/app-shared-2f2228189a8d.js';

/** REA download commands operate on the current DSH window's owned desktop leases. */
export function createDownloadsHost({ desktop, client, settings, downloadUrl }) {
  if (typeof desktop?.downloads !== 'function') return { service: undefined, attach: async () => {}, dispose: async () => {} };
  let owner, timer, pending, disposed = false, configuring = Promise.resolve(), lastError, historyRevision, transferring = false;
  const report = error => {
    if (!disposed && lastError !== error.message) { lastError = error.message; Shared.WFt().danger(error.message); }
  };
  const leases = new Set(), signatures = new Map();
  const subscriptions = [];
  async function configuration() {
    const [{ directory }, { values }] = await Promise.all([client.request('downloads/configure'), settings.readAll()]);
    return { directory, exportDirectory: values['browser-download-directory'] ?? null, prompt: values['browser-download-prompt-enabled'] ?? false };
  }
  async function control() {
    owner ??= desktop.acquireOpenCU().then(async lease => {
      try {
        await desktop.downloads(lease.lease, 'configure', await configuration());
        return lease;
      } catch (error) { await desktop.release(lease.lease); throw error; }
    }).catch(error => { owner = undefined; throw error; });
    return owner;
  }
  async function sync() {
    pending ??= (async () => {
      const lease = await control();
      const live = await desktop.downloads(lease.lease, 'list', {});
      transferring = live.some(download => download.status === 'in_progress');
      for (const download of live) {
        const signature = JSON.stringify(download);
        if (signatures.get(download.id) === signature) continue;
        await client.request('downloads/update', { download });
        signatures.set(download.id, signature);
        if (download.exportError) report(new Error(download.exportError));
      }
      const result = await client.request('downloads/history', { maxResults: 1000, conditional: true, after: historyRevision });
      if (!disposed && !result.unchanged) { historyRevision = result.revision; Shared.e1t(); Shared.$$t.stateChanged(result.value); }
      return result.value;
    })().catch(error => { historyRevision = undefined; throw error; }).finally(() => { pending = undefined; });
    return pending;
  }
  async function poll() {
    try { await sync(); lastError = undefined; } catch (error) { report(error); }
    // Live progress needs a fast cadence; idle or hidden windows only pick up new downloads.
    if (!disposed) timer = setTimeout(poll, document.hidden ? 5000 : transferring ? 1000 : 2500);
  }
  function retained(promise) {
    promise[Symbol.dispose] = () => { promise.catch(error => console.error('OpenCU download command', error)); };
    return promise;
  }
  async function action(operation, args = {}) {
    const lease = await control();
    if (args.id) {
      const { value } = await client.request('downloads/history', { maxResults: 1000 });
      const record = value.downloads.find(item => item.id === args.id);
      if (!record) throw new Error('The download is no longer in history');
      args = { ...args, filename: record.filename };
    }
    const result = await desktop.downloads(lease.lease, operation, args);
    await sync();
    return result;
  }
  const service = {
    downloadUrl: url => retained(downloadUrl(url)),
    searchHistory(args) { return retained(sync().then(() => client.request('downloads/history', args)).then(result => result.value)); },
    chooseDownloadDirectory: () => retained(action('chooseDownloadDirectory')),
    removeFromHistory: args => retained(client.request('downloads/remove', args).then(async result => { await sync(); return result; })),
    clearHistory: () => retained(client.request('downloads/remove').then(async result => { await sync(); return result; })),
  };
  for (const operation of ['pause', 'resume', 'cancel', 'open', 'showInFolder', 'showDownloadsFolder']) service[operation] = args => retained(action(operation, args));
  const starting = (async () => {
    try {
      for (const key of ['browser-download-directory', 'browser-download-prompt-enabled']) {
        if (disposed) break;
        subscriptions.push(await settings.subscribe(key, () => {
          configuring = configuring.catch(() => undefined).then(async () => {
            if (disposed) return;
            const config = await configuration(), lease = await control();
            if (disposed) return;
            await Promise.all([lease.lease, ...leases].map(id => desktop.downloads(id, 'configure', config)));
          });
          void configuring.catch(report);
        }));
      }
    } finally { if (!disposed) void poll(); }
  })();
  starting.catch(report);
  return {
    service,
    async attach(lease) {
      await desktop.downloads(lease, 'configure', await configuration());
      leases.add(lease);
      return () => leases.delete(lease);
    },
    async dispose() {
      disposed = true; clearTimeout(timer);
      await starting.catch(() => undefined);
      for (const subscription of subscriptions) subscription[Symbol.dispose]();
      await Promise.allSettled([pending, configuring]);
      if (owner) {
        try { await sync(); } finally { await desktop.release((await owner).lease); }
      }
      leases.clear();
    },
  };
}
