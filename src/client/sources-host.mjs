/** Retains actual tool-observed pages and delivered files for the existing sources tab. */
export function createSourcesHost({ client, sidebar, openSession }) {
  const key = 'opencu:sources:v1', listeners = new Set();
  let saved = JSON.parse(localStorage.getItem(key) || '{}');
  const publish = next => { localStorage.setItem(key, JSON.stringify(next)); saved = next; for (const listener of listeners) listener(); };
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
      if (sessionChanged) next = { ...next, [session.sessionId]: { ...source, pages: [...pages.values()], webMcpCalls: [...calls.values()] } };
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
      publish({ ...saved, [sessionId]: { ...source, files: next } });
    },
    async open({ conversationId, sessionId = conversationId }) {
      if (!sessionId) throw new Error('The source conversation is unavailable');
      if (sidebar.mounted.getSnapshot() !== sessionId) await openSession(sessionId);
      sidebar.openTabIn(sessionId, 'opencu-sources', { revealIfOpened: true });
    },
    dispose() { unsubscribe(); listeners.clear(); },
  };
}
