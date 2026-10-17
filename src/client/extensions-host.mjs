/** Supplies REA extension menus with the actual DSH guest profile and actions. */
import { l as profileState, u as initializeProfileState } from './rea/profile-e207056acbc4.js';
import { services } from './rea-services.mjs';
export function createExtensionsHost({ desktop, waitForGuest, records, createTab, focus, close }) {
  const profileListeners = new Set(), actionListeners = new Map();
  let timer, disposed = false, refreshing = false, refreshRequested = false, signature, snapshot;
  const recordFor = async args => args?.conversationId
    ? waitForGuest(args)
    : [...records.values()].find(record => record.element.isConnected);
  async function operate(args, operation, payload = args ?? {}) {
    if (disposed) throw new Error('OpenCU extension host is closed');
    if (!desktop?.extensions) throw new Error('This DSH host needs the browser extension adapter');
    const record = await recordFor(args);
    if (!record) throw new Error('Open a browser tab before managing its extensions');
    await record.ready;
    if (disposed) throw new Error('OpenCU extension host is closed');
    return desktop.extensions(record.lease.lease, operation, payload);
  }
  async function refresh() {
    if (disposed || refreshing || !profileListeners.size && !actionListeners.size) return;
    clearTimeout(timer); refreshing = true; refreshRequested = false;
    try {
      const state = await operate(null, 'state'), next = JSON.stringify(state);
      if (disposed || refreshRequested) return;
      snapshot = state.profile;
      if (signature !== next) {
        signature = next;
        for (const listener of profileListeners) listener(snapshot);
        for (const listeners of actionListeners.values()) for (const listener of listeners) listener({ type: 'changed' });
      }
    } catch (error) { if (!disposed) console.error('OpenCU extensions', error); }
    finally {
      refreshing = false;
      if (!disposed && (profileListeners.size || actionListeners.size)) timer = setTimeout(refresh, refreshRequested ? 0 : 750);
    }
  }
  function schedule() {
    if (disposed) return;
    refreshRequested = true; clearTimeout(timer);
    if (!refreshing) timer = setTimeout(refresh, 0);
  }
  const unsubscribe = desktop?.onExtensionEvent?.(event => {
    if (disposed) return;
    if (event.type === 'create-tab') {
      void (async () => {
        const record = await createTab(event.url);
        if (disposed) return;
        if (record.webContentsId) {
          const source = await recordFor(null);
          if (disposed) return;
          if (!source) throw new Error('The extension source tab closed before the new tab was ready');
          await desktop.extensions(source.lease.lease, 'created', { requestId: event.requestId, webContentsId: record.webContentsId });
        } else await desktop.extensions(record.lease.lease, 'created', { requestId: event.requestId });
      })().catch(error => console.error('OpenCU extension tab', error));
    } else if (event.type === 'select-tab' || event.type === 'close-tab') {
      const record = [...records.values()].find(record => record.element.getWebContentsId() === event.webContentsId);
      if (record) void (event.type === 'select-tab' ? focus(record.ids) : close(record.ids)).catch(error => console.error('OpenCU extension target', error));
    } else {
      for (const listeners of actionListeners.values()) for (const listener of listeners) listener(event);
      schedule();
    }
  });
  const resource = cleanup => ({ unsubscribe: cleanup, [Symbol.dispose]: cleanup });
  return {
    service: {
      get extensionsAvailable() { return typeof desktop?.extensions === 'function'; },
      async getExtensionActions(args) { return (await operate(args, 'state')).actions; },
      async subscribeExtensionProfile(listener) {
        if (disposed) return resource(() => {});
        const state = await operate(null, 'state');
        if (disposed) return resource(() => {});
        snapshot = state.profile;
        profileListeners.add(listener); listener(snapshot); schedule();
        return resource(() => profileListeners.delete(listener));
      },
      async subscribeExtensionActionEvents(args, listener) {
        if (disposed) return resource(() => {});
        await waitForGuest(args);
        if (disposed) return resource(() => {});
        initializeProfileState(); await profileState.initialize(services.browserHost);
        if (disposed) return resource(() => {});
        const key = JSON.stringify(args), listeners = actionListeners.get(key) ?? new Set();
        listeners.add(listener); actionListeners.set(key, listeners); schedule();
        return resource(() => { listeners.delete(listener); if (!listeners.size) actionListeners.delete(key); });
      },
      triggerExtensionAction: args => operate(args, 'trigger'),
      async setExtensionPinned(args) { const result = await operate(args, 'pin'); schedule(); return result; },
      showExtensionActionContextMenu: args => operate(args, 'contextMenu'),
      beginExtensionActionMenu: args => operate(args, 'beginMenu'),
      executeExtensionActionMenuCommand: args => operate(args, 'executeMenu'),
      closeExtensionActionMenu: args => operate(args, 'closeMenu'),
      async manageExtensions() {
        const current = await recordFor(null);
        if (disposed) throw new Error('OpenCU extension host is closed');
        const record = current ?? await createTab('about:blank');
        return operate(record.ids, 'manage');
      },
    },
    dispose() { disposed = true; clearTimeout(timer); unsubscribe?.(); profileListeners.clear(); actionListeners.clear(); },
  };
}
