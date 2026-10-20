const MAX_SESSIONS = 100, MAX_PAGES = 200, MAX_CALLS = 100, MAX_FILES = 200;

/** Keep the most recently updated sessions and their newest records within browser storage. */
function bounded(value, sessions = MAX_SESSIONS) {
  return Object.fromEntries(Object.entries(value).slice(-sessions).map(([id, source]) => [id, { ...source,
    files: (source.files ?? []).slice(-MAX_FILES), pages: (source.pages ?? []).slice(-MAX_PAGES),
    ...source.webMcpCalls ? { webMcpCalls: source.webMcpCalls.slice(-MAX_CALLS) } : {} }]));
}

/** Retains actual tool-observed pages and delivered files for the existing sources tab. */
export function createSourcesHost({ client, sidebar, openSession }) {
  const key = 'opencu:sources:v1', listeners = new Set();
  let saved = bounded(JSON.parse(localStorage.getItem(key) || '{}'));
  const publish = next => {
    next = bounded(next);
    // A full quota drops the older half of the sessions rather than failing the update.
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { next = bounded(next, Math.max(1, Math.floor(Object.keys(next).length / 2))); try { localStorage.setItem(key, JSON.stringify(next)); } catch {} }
    saved = next; for (const listener of listeners) listener();
  };
  // Re-insert an updated session so the newest sessions are the ones retained.
  const update = (value, sessionId, source) => { const { [sessionId]: _, ...rest } = value; return { ...rest, [sessionId]: source }; };
  const unsubscribe = client.subscribe(() => {
    let next = saved;
    for (const session of client.getSnapshot().sessions) {
      const source = next[session.sessionId] ?? { files: [], pages: [] };
      let sessionChanged = false;
      const pages = new Map(source.pages.map(page => [page.url, page]));
      for (const target of session.targets) {
        const observation = target.observation;
        if (!observation || !/^https?:/.test(observation.url)) continue;
        const url = observation.url, previous = pages.get(url);
        const page = { key: url, url, title: observation.title || url, activities: ['read'], openInitiator: 'browser_use' };
        if (JSON.stringify(previous) !== JSON.stringify(page)) { pages.set(url, page); sessionChanged = true; }
      }
      const calls = new Map((source.webMcpCalls ?? []).map(call => [call.id, call]));
      for (const call of session.webMcpCalls ?? []) if (!calls.has(call.id)) { calls.set(call.id, call); sessionChanged = true; }
      if (sessionChanged) next = update(next, session.sessionId, { ...source, pages: [...pages.values()], webMcpCalls: [...calls.values()] });
    }
    if (next !== saved) publish(next);
  });
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => saved,
    retainFiles(sessionId, files) {
      if (!files.length) return;
      const source = saved[sessionId] ?? { files: [], pages: [] };
      const next = [...new Map([...source.files, ...files].map(file => [`${file.attachmentId}:${file.name}`, file])).values()];
      if (JSON.stringify(source.files) === JSON.stringify(next)) return;
      publish(update(saved, sessionId, { ...source, files: next }));
    },
    async open({ conversationId, sessionId = conversationId }) {
      if (!sessionId) throw new Error('The source conversation is unavailable');
      if (sidebar.mounted.getSnapshot() !== sessionId) await openSession(sessionId);
      sidebar.openTabIn(sessionId, 'opencu-sources', { revealIfOpened: true });
    },
    dispose() { unsubscribe(); listeners.clear(); },
  };
}
