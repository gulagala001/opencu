/** Browser-profile settings stay with the connected browser; no password data crosses this bridge. */
export function createBrowserSettings(client) {
  const listeners = new Set();
  let snapshot = { connections: [], error: null, loading: true }, timer, disposed = false;
  async function refresh() {
    try {
      const state = await client.request('browserSettings/status');
      if (!disposed) snapshot = { connections: state.connections, error: null, loading: false };
    } catch (error) {
      if (!disposed) snapshot = { ...snapshot, error: error.message, loading: false };
    }
    if (disposed) return;
    for (const listener of listeners) listener();
    timer = setTimeout(refresh, 3000);
  }
  void refresh();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    open: (instanceId, section) => client.request('browserSettings/open', { instanceId, section }),
    dispose() { disposed = true; clearTimeout(timer); listeners.clear(); },
  };
}
