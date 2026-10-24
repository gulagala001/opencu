/** One native monitor owner per guest; only selected targets keep a polling loop. */
export function createFrameInputMonitoring({ invoke, userActivity, changed, interval = 250 }) {
  const owner = crypto.randomUUID();
  let epoch = 0, enabled = false, disposed = false, timer, flight, installed;
  let queue = Promise.resolve(), lastStatus;
  const enqueue = task => queue = queue.catch(() => {}).then(task);
  const publish = value => {
    const serialized = JSON.stringify(value);
    if (serialized === lastStatus) return;
    lastStatus = serialized; changed({ userActivityMonitoring: value });
  };
  const current = version => !disposed && enabled && epoch === version;
  function read(version) {
    if (flight?.epoch === version) return flight.promise;
    clearTimeout(timer);
    const promise = enqueue(async () => {
      if (!current(version)) return;
      try {
        const result = await invoke({ method: installed === version ? 'read' : 'install', owner, epoch: version });
        if (!current(version)) return;
        if (result?.available !== true || result.scope !== 'all-frames') throw new Error('Native frame input monitoring is unavailable');
        installed = version;
        publish({ available: true, scope: result.scope, frameCount: result.frameCount });
        for (const event of result.events ?? []) {
          if (!current(version)) return;
          await userActivity(event.kind);
        }
      } catch (error) {
        if (current(version)) publish({ available: false, error: error.message });
        throw error;
      }
    });
    flight = { epoch: version, promise };
    const finish = () => {
      if (flight?.promise === promise) flight = undefined;
      if (current(version)) timer = setTimeout(() => { void read(version).catch(() => {}); }, interval);
    };
    void promise.then(finish, finish);
    return promise;
  }
  function restart(next) {
    const previous = epoch++;
    enabled = next;
    clearTimeout(timer);
    // A queued old install must settle before its matching disposal. A newer
    // generation cannot be disposed accidentally by this old request.
    if (previous) void enqueue(() => invoke({ method: 'dispose', owner, epoch: previous })).catch(error => {
      if (!disposed && !enabled) publish({ available: false, error: error.message });
    });
    publish({ available: false, ...(next ? { pending: true } : { disabled: true }) });
    if (next) void read(epoch).catch(() => {});
  }
  return {
    setEnabled(value) { if (!disposed && enabled !== !!value) restart(!!value); },
    invalidate() { if (!disposed && enabled) restart(true); },
    async ensure() {
      if (disposed) throw new Error('The frame input monitor was disposed');
      if (!enabled) restart(true);
      const version = epoch;
      await read(version);
      if (!current(version)) return this.ensure();
    },
    async dispose() {
      if (disposed) return queue;
      const previous = epoch;
      disposed = true; enabled = false; epoch++; clearTimeout(timer);
      return enqueue(() => previous ? invoke({ method: 'dispose', owner, epoch: previous }) : undefined);
    },
  };
}
