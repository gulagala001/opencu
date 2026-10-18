/** Bridges the original monitoring menu to window-owned presentation state. */
export function createPresentationClient({ client, transport, desktop, dock, notify }) {
  const listeners = new Set();
  let snapshot = { activeTaskIds: [], taskVisibilities: {}, placements: {}, frames: [], revision: 0, error: null };
  const aborter = new AbortController();
  let disposed = false, timer, pending, generation = 0, changing = Promise.resolve();
  const homes = new Map();
  let handoff = null, imagesCurrent = false;
  let publishedSignature;
  const publish = value => {
    const next = { ...value, handoff };
    const signature = JSON.stringify(next, function (key, item) {
      if (key === 'revision' || key === 'imageDataURL' && this.imageRevision) return undefined;
      return item;
    });
    if (signature === publishedSignature) return;
    publishedSignature = signature;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const painted = () => new Promise(resolve => {
    let animation;
    const finish = () => { clearTimeout(timer); cancelAnimationFrame(animation); resolve(); };
    const timer = setTimeout(finish, 100);
    animation = requestAnimationFrame(() => { animation = requestAnimationFrame(finish); });
  });
  async function homeFor(id, frames) {
    const deadline = performance.now() + 2000;
    let mounted = false;
    do {
      await painted();
      aborter.signal.throwIfAborted();
      // The resident slot registers before it has frames. React replaces that
      // measure when the handoff mounts; never retain the empty render's closure.
      const measure = homes.get(id);
      if (measure) {
        mounted = true;
        const rects = measure();
        if (Array.isArray(rects) && frames.every(frame => rects.some(rect => rect.id === frame.presentationID
          && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0))) return rects;
      }
    } while (!disposed && performance.now() < deadline);
    aborter.signal.throwIfAborted();
    if (mounted && !homes.has(id)) throw new Error('The monitoring dock was unmounted during the handoff');
    throw new Error(mounted ? 'The monitoring dock frames did not become ready' : 'The monitoring dock did not mount');
  }
  async function refresh() {
    if (disposed || !transport.rendererId) return;
    const expected = generation;
    const knownImages = imagesCurrent ? Object.fromEntries(snapshot.frames.filter(frame => frame.imageDataURL && frame.imageRevision)
      .map(frame => [frame.presentationID, frame.imageRevision])) : {};
    pending ??= client.request('presentation/state', { rendererId: transport.rendererId, compactImages: true, knownImages }, aborter.signal)
      .then(result => {
        if (disposed || expected !== generation) return;
        const frames = result.state.frames.map(frame => {
          const { imageUnchanged, ...value } = frame;
          if (!imageUnchanged) return value;
          const previous = snapshot.frames.find(item => item.presentationID === frame.presentationID && item.threadID === frame.threadID
            && item.imageRevision === frame.imageRevision && item.imageDataURL);
          if (!previous) throw new Error('The monitoring image baseline is unavailable');
          return { ...value, imageDataURL: previous.imageDataURL };
        });
        publish({ ...result.state, frames }); imagesCurrent = true;
      }).catch(error => { imagesCurrent = false; throw error; })
      .finally(() => { pending = undefined; });
    return pending;
  }
  async function poll() {
    try { await refresh(); } catch (error) { if (!disposed) publish({ ...snapshot, error: error.message }); }
    if (!disposed) timer = setTimeout(poll, snapshot.frames.some(frame => frame.placement === 'home' && frame.kind === 'native-video') ? 100 : 750);
  }
  function run(operation, sessionId, args = {}) {
    generation++;
    changing = changing.then(async () => {
      if (disposed) return null;
      try {
        const result = await client.request(`presentation/${operation}`, { rendererId: transport.rendererId, sessionId, ...args }, aborter.signal);
        generation++;
        if (!disposed) publish(result.state);
        return result.state;
      } catch (error) { if (!disposed) notify(sessionId, error.message); return null; }
    });
    return changing;
  }
  return {
    state: { getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    start() { void poll(); },
    refresh,
    service: {
      platform: document.documentElement.dataset.platform === 'darwin' ? 'macOS' : document.documentElement.dataset.platform,
      supportsPlacement: true,
      hideTask: id => run('hideTask', id),
      hideForAllActiveTasks: () => run('hideAll'),
      showTask: id => run('showTask', id),
      async hideTarget(frame) {
        try {
          const result = await client.request('presentation/event', { rendererId: transport.rendererId, type: 'hide-target',
            sessionId: frame.threadID, targetId: frame.presentationID, visibilityKey: frame.visibilityKey }, aborter.signal);
          if (result.ok === false) throw new Error(result.error.message);
          generation++; await refresh();
        } catch (error) { if (!disposed) notify(frame.threadID, error.message); }
      },
      registerHome(id, measure) { homes.set(id, measure); return () => { if (homes.get(id) === measure) homes.delete(id); }; },
      setPlacement(id, placement) {
        generation++;
        changing = changing.then(async () => {
          if (disposed || snapshot.placements[id] === placement) return;
          const frames = snapshot.frames.filter(frame => frame.threadID === id);
          if (!desktop?.presentation || !frames.length) {
            if (placement === 'home') await dock(id);
            const result = await client.request('presentation/placement', { rendererId: transport.rendererId, sessionId: id, placement }, aborter.signal);
            publish(result.state); return;
          }
          const token = crypto.randomUUID(); let prepared = false, committed = false;
          handoff = { id: token, sessionId: id, placement, frames, moving: false, landed: false }; publish(snapshot);
          try {
            await dock(id);
            const rects = await homeFor(id, frames);
            aborter.signal.throwIfAborted();
            await desktop.presentation('transfer-prepare', { id: token, placement, frames, rects }); prepared = true;
            handoff = { ...handoff, moving: true }; publish(snapshot);
            await painted();
            aborter.signal.throwIfAborted();
            await desktop.presentation('transfer-run', { id: token });
            const result = await client.request('presentation/placement', { rendererId: transport.rendererId, sessionId: id, placement }, aborter.signal);
            committed = true; handoff = { ...handoff, landed: true }; publish(result.state);
            await painted();
            await desktop.presentation('transfer-finish', { id: token }); prepared = false;
          } catch (error) {
            if (prepared) await desktop.presentation(committed ? 'transfer-finish' : 'transfer-cancel', { id: token }).catch(() => {});
            if (!disposed) notify(id, error.message);
          } finally { handoff = null; generation++; if (!disposed) { publish(snapshot); void refresh(); } }
        }).catch(error => { if (!disposed) notify(id, error.message); });
        return changing;
      },
      async focus(targetId) {
        const sessionId = snapshot.frames.find(frame => frame.presentationID === targetId)?.threadID;
        try { await client.request('presentation/event', { rendererId: transport.rendererId, type: 'focus', targetId }); await refresh(); }
        catch (error) { notify(sessionId, error.message); }
      },
    },
    async dispose() { disposed = true; generation++; aborter.abort(); clearTimeout(timer); listeners.clear(); await Promise.allSettled([pending, changing]); },
  };
}
