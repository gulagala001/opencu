export function createBrowserHistoryHost(client, desktop) {
  const requests = new Map();
  const durations = { lastHour: 3600000, lastDay: 86400000, lastWeek: 604800000, lastMonth: 2419200000, allTime: Infinity };
  let profile, closed = false;
  async function profileOperation(operation, args = {}) {
    if (closed || !desktop?.profile || !desktop?.acquireOpenCU) throw new Error('The browser profile host is unavailable');
    profile ??= desktop.acquireOpenCU().catch(error => { profile = undefined; throw error; });
    const lease = await profile;
    if (closed) throw new Error('The browser profile host is closing');
    return desktop.profile(lease.lease, operation, args);
  }
  function retained(promise) { promise[Symbol.dispose] = () => { promise.catch(error => console.error('OpenCU browsing data', error)); }; return promise; }
  function since(timeRange) {
    if (!Object.hasOwn(durations, timeRange)) throw new Error('Unknown browsing data time range');
    return Math.max(0, Date.now() - durations[timeRange]);
  }
  function request(method, args) {
    const abort = new AbortController();
    const result = client.request(`history/${method}`, args, abort.signal).then(response => response.value);
    result[Symbol.dispose] = () => abort.abort();
    return result;
  }
  const browsingHistory = {
    searchHistory: args => request('search', args),
    removeEntries: entries => request('remove', { entries }),
    getBrowsingDataSettings() {
      const result = Promise.resolve({ dataRemovalPermitted: { history: true, downloads: true, siteData: !!desktop?.profile, cache: !!desktop?.profile, formData: false, siteSettings: false } });
      result[Symbol.dispose] = () => {};
      return result;
    },
    getBrowsingDataSummary: timeRange => retained(Promise.all([request('summary', { timeRange }),
      desktop?.profile ? profileOperation('summary') : {}, client.request('downloads/history', { maxResults: 1000 }),
    ]).then(([history, profile, { value }]) => ({ ...history, ...profile,
      downloads: { count: value.downloads.filter(item => item.startedAtMs >= since(timeRange) && !['started', 'in_progress', 'paused'].includes(item.status)).length } }))),
    clearBrowsingData: ({ dataTypes, timeRange }) => retained((async () => {
      const start = since(timeRange);
      if (!Array.isArray(dataTypes) || dataTypes.some(type => !['history', 'downloads', 'siteData', 'cache'].includes(type))) throw new Error('Unsupported browsing data category');
      const native = dataTypes.filter(type => ['siteData', 'cache'].includes(type));
      if (native.length) await profileOperation('clear', { dataTypes: native, timeRange });
      if (dataTypes.includes('history')) await request('clear', { dataTypes: ['history'], timeRange });
      if (dataTypes.includes('downloads')) await client.request('downloads/remove', { since: start });
      return { cleared: true };
    })()),
  };
  async function suggestions(args, callback, signal) {
    const text = args.input.text.trim();
    const { value: entries } = await client.request('history/search', { text, maxResults: 30 }, signal);
    if (signal.aborted) return;
    const unique = [...new Map(entries.map(entry => [entry.url, entry])).values()].slice(0, 8);
    const matches = unique.map(entry => ({ type: 'history-url', destinationURL: entry.url, fillIntoEdit: entry.url,
      contents: entry.url, description: entry.title, contentsClass: [], descriptionClass: [],
      inlineAutocompletion: '', isSearch: false, deletable: true, deleteToken: JSON.stringify({ url: entry.url, visitTime: entry.visitTime }) }));
    callback({ ...args, result: { matches, defaultMatch: null, done: true } });
  }
  const browserAutocomplete = {
    start(args, callback) {
      browserAutocomplete.stop(args);
      const abort = new AbortController();
      const key = args.requestId;
      requests.set(key, { abort, args, callback });
      const result = suggestions(args, callback, abort.signal);
      // REA disposes the request handle after dispatch; stop owns the subscription.
      result[Symbol.dispose] = () => { result.catch(error => { if (!abort.signal.aborted) console.error('OpenCU address suggestions', error); }); };
      return result;
    },
    stop({ requestId }) { requests.get(requestId)?.abort.abort(); requests.delete(requestId); },
    deleteMatch({ requestId, deleteToken }) {
      const active = requests.get(requestId);
      const result = request('remove', { entries: [JSON.parse(deleteToken)] });
      result.then(() => { if (active && !active.abort.signal.aborted) return suggestions(active.args, active.callback, active.abort.signal); }).catch(error => console.error('OpenCU remove address suggestion', error));
      // The command is already dispatched; REA's using block must not abort it.
      result[Symbol.dispose] = () => {};
      return result;
    },
    recordNavigation() { /* Committed guest navigation records the actual URL and page title. */ },
  };
  return { browsingHistory, browserAutocomplete, record: args => request('record', args),
    async dispose() { closed = true; for (const { abort } of requests.values()) abort.abort(); requests.clear(); if (profile) await desktop.release((await profile).lease); } };
}
