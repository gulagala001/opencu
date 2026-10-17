export function createCoreClient() {
  const listeners = new Set();
  let state = { revision: 0, sessions: [], connected: false, error: null };
  let aborter = new AbortController(), running;
  const publish = value => {
    state = value;
    for (const listener of listeners) {
      try { listener(); } catch (error) { console.error('OpenCU event subscriber failed', error); }
    }
  };
  async function request(method, args = {}, signal = aborter.signal) {
    signal = AbortSignal.any([aborter.signal, signal]);
    signal.throwIfAborted();
    const response = await fetch('/api/opencu', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args }), signal,
    });
    if (!response.ok) throw new Error(`OpenCU request failed: HTTP ${response.status}`);
    const result = await response.json();
    signal.throwIfAborted();
    if (result.ok === false) throw Object.assign(new Error(result.error?.message ?? 'OpenCU request failed'), result.error);
    return result;
  }
  async function receive(signal) {
    let initialized = false;
    while (!signal.aborted) {
      try {
        const result = await request('events', { after: initialized ? state.revision : null, heartbeat: true, compact: true }, signal);
        if (result.unchanged !== true) {
          initialized = true;
          publish({ ...result, connected: true, error: null });
        } else if (!state.connected || state.error) publish({ ...state, connected: true, error: null });
      } catch (error) {
        if (signal.aborted) break;
        initialized = false;
        publish({ ...state, connected: false, error: error.message });
        await new Promise(resolve => {
          const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
          const timer = setTimeout(done, 1000);
          signal.addEventListener('abort', done, { once: true });
        });
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    request,
    start() {
      if (running) return running;
      if (aborter.signal.aborted) aborter = new AbortController();
      running = receive(aborter.signal).finally(() => { running = undefined; });
      return running;
    },
    dispose() { aborter?.abort(); listeners.clear(); },
  };
}
