export function createSettingsHost(client, chatSettings) {
  const listeners = new Map();
  const linkKey = 'open-link-in-target-preference';
  const chatDestination = () => chatSettings.getSnapshot().value?.linkOpening === 'new-tab' ? 'external-browser' : 'in-app-browser';
  const withChat = next => ({ values: { ...next.values, [linkKey]: chatDestination() }, configuredValues: { ...next.configuredValues, [linkKey]: chatDestination() } });
  let snapshot = { values: {}, configuredValues: {} }, timer, pending, disposed = false;
  const subscribers = new Set();
  function publish(next) {
    const previous = snapshot;
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    snapshot = next;
    for (const listener of subscribers) listener();
    for (const [key, callbacks] of listeners) {
      if (JSON.stringify(previous.values[key]) === JSON.stringify(next.values[key])) continue;
      for (const callback of callbacks) callback({ effective: next.values[key], configured: next.configuredValues[key] });
    }
  }
  let generation = 0, writes = Promise.resolve();
  async function refresh() {
    await writes;
    if (disposed) throw new Error('OpenCU preferences are closed');
    const expected = generation;
    pending ??= client.request('settings/read').then(result => {
      if (!disposed && expected === generation) publish(withChat(result.settings));
      return snapshot;
    }).finally(() => { pending = undefined; });
    const result = await pending;
    return !disposed && expected !== generation ? refresh() : result;
  }
  function schedule() { if (!disposed && !timer && (listeners.size || subscribers.size)) timer = setTimeout(poll, 2000); }
  function unschedule() { if (!listeners.size && !subscribers.size) { clearTimeout(timer); timer = undefined; } }
  async function poll() {
    timer = undefined;
    try { await refresh(); } catch (error) { if (!disposed) console.error('OpenCU preferences', error); }
    schedule();
  }
  const unsubscribeChat = chatSettings.subscribe(() => publish(withChat(snapshot)));
  return {
    readAll: refresh,
    async read(key) { const state = await refresh(); return { effective: state.values[key], configured: state.configuredValues[key] }; },
    getSnapshot: () => snapshot,
    subscribeSnapshot(listener) { subscribers.add(listener); schedule(); return () => { subscribers.delete(listener); unschedule(); }; },
    write(key, value) {
      const work = writes.then(async () => {
        if (disposed) throw new Error('OpenCU preferences are closed');
        generation++;
        try {
          if (key === linkKey) {
            if (!['in-app-browser', 'external-browser'].includes(value)) throw new Error('Invalid link destination');
            if (!await chatSettings.set('linkOpening', value === 'in-app-browser' ? 'sidebar' : 'new-tab')) throw new Error('The host did not accept the link destination setting');
            if (!disposed) publish(withChat(snapshot));
          } else {
            const result = await client.request('settings/write', { key, value });
            if (!disposed) publish(withChat(result.settings));
          }
        } finally { generation++; }
      });
      writes = work.catch(() => undefined);
      return work;
    },
    async subscribe(key, callback) {
      await refresh();
      if (disposed) throw new Error('OpenCU preferences are closed');
      let callbacks = listeners.get(key);
      if (!callbacks) listeners.set(key, callbacks = new Set());
      callbacks.add(callback);
      callback({ effective: snapshot.values[key], configured: snapshot.configuredValues[key] });
      schedule();
      return { [Symbol.dispose]() {
        callbacks.delete(callback);
        if (!callbacks.size) listeners.delete(key);
        unschedule();
      } };
    },
    dispose() { disposed = true; clearTimeout(timer); unsubscribeChat(); listeners.clear(); subscribers.clear(); },
  };
}
