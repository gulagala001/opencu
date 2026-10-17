import { services } from './rea-services.mjs';

function addressUrl(value) {
  const text = value.trim();
  if (!text || /[\s\uFFFC]/u.test(text)) return null;
  const scheme = /^https?:\/\//iu.test(text);
  if (!scheme && !/^(?:localhost(?=[:/]|$)|(?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+|\[[0-9a-f:]+\])(?::\d+)?(?:[/?#]|$)/iu.test(text)) return null;
  try {
    const url = new URL(scheme ? text : `https://${text}`);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch (error) { return null; }
}

function detectText(state) {
  let text = state.draft;
  for (const item of [...state.occurrences].reverse()) text = text.slice(0, item.offset) + '\uFFFC' + text.slice(item.offset + item.length);
  return text;
}

function suggestion(state, selection) {
  if (state.phase !== 'plain' || selection.draftRev !== state.draftRev || selection.start !== selection.end) return null;
  const text = detectText(state), end = selection.end;
  if (end < 0 || end > text.length || /[^\s\uFFFC]/u.test(text.slice(end, end + 1))) return null;
  const token = text.slice(0, end).match(/(?:^|[\s\uFFFC])(>?[^\s\uFFFC]+)$/u)?.[1];
  if (!token) return null;
  const explicit = token.startsWith('>'), query = explicit ? token.slice(1) : token;
  if (!query || !explicit && !addressUrl(query)) return null;
  const start = end - token.length;
  return { active: true, kind: 'browser-autocomplete', activation: 'typed', trigger: explicit ? '>' : '',
    query, range: { from: start, to: end }, anchorPos: start, span: { start, end, draftRev: state.draftRev } };
}

/** Add the typed URL to the existing history service; REA still owns ranking, rows and selection. */
export function createBrowserAddressAutocomplete(autocomplete, report) {
  const active = new Map();
  return {
    start(args, callback) {
      const entry = { args }; active.set(args.requestId, entry);
      const url = addressUrl(args.input.text);
      const typed = url ? { type: 'url-what-you-typed', destinationURL: url, fillIntoEdit: args.input.text,
        contents: args.input.text, description: '', contentsClass: [], descriptionClass: [],
        inlineAutocompletion: '', isSearch: false, deletable: false } : null;
      const publish = response => {
        if (active.get(args.requestId) !== entry) return;
        const matches = response.result.matches;
        callback({ ...response, result: { ...response.result,
          matches: typed ? [typed, ...matches.filter(match => match.destinationURL !== url)] : matches,
          defaultMatch: typed ?? response.result.defaultMatch } });
      };
      if (typed) publish({ ...args, result: { matches: [], defaultMatch: null, done: false } });
      let request;
      try { request = autocomplete.start(args, publish); } catch (error) { request = Promise.reject(error); }
      const result = Promise.resolve(request).catch(error => {
        if (active.get(args.requestId) !== entry) return;
        publish({ ...args, result: { matches: [], defaultMatch: null, done: true } });
        report(args.conversationId, error.message);
      });
      result[Symbol.dispose] = () => request?.[Symbol.dispose]?.();
      return result;
    },
    stop(args) { active.delete(args.requestId); return autocomplete.stop(args); },
    dispose() { for (const { args } of active.values()) autocomplete.stop(args); active.clear(); },
  };
}

/** The REA ge → pe selection boundary returns a DSH operation, never a synthetic browser identity. */
export function prepareBrowserAddressReference(_scope, args) {
  return args.composerController.prepareBrowserTabMention(args);
}

/** Per-composer adapter. replaceReference(next, {source, ref, occurrenceId, span, selection}) synchronously
 * CASes the occurrence, draftRev and caret, preserving selection/focus; never replace the whole draft. */
export function createBrowserAddress({ sessionId, readInput, subscribeInput, captureInsertion, insertReference,
  replaceReference, chip, focusReference, notify, getTabSnapshot, subscribeTabs }) {
  const listeners = new Set(), events = new Map(), cleanups = new Set();
  let current = null, dom = null, portal = null, composing = false, dismissed = null, pending = null, connection = null;
  const key = value => value && `${value.span.draftRev}:${value.span.start}:${value.span.end}`;
  const publish = value => {
    if (key(current) === key(value)) return;
    queued = null; current = value;
    for (const listener of listeners) listener();
  };
  const emit = (name, value) => { for (const listener of events.get(name) ?? []) listener(value); };
  const hasFocus = () => dom?.getRootNode().activeElement === dom;
  function refresh() {
    const value = dom && hasFocus() && !composing && !pending ? suggestion(readInput(), captureInsertion()) : null;
    publish(key(value) === dismissed ? null : value);
  }
  function locate(reference, occurrenceId) {
    const state = readInput();
    const occurrence = state.occurrences.find(item => item.source === reference.source && item.ref === reference.ref &&
      (occurrenceId == null || item.occurrenceId === occurrenceId));
    if (state.phase !== 'plain' || !occurrence) return null;
    const start = occurrence.offset - state.occurrences.filter(item => item.offset < occurrence.offset).reduce((size, item) => size + item.length - 1, 0);
    return { occurrence, span: { start, end: start + 1, draftRev: state.draftRev } };
  }
  function watchMetadata(result, reference, initial, owner) {
    const found = locate(reference);
    if (!found) return;
    const revision = found.span.draftRev, occurrenceId = found.occurrence.occurrenceId, selection = captureInsertion();
    let stopTabs, stopInput, timer, stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true; clearTimeout(timer); stopTabs?.(); stopInput?.(); cleanups.delete(stop);
    };
    const update = () => {
      if (stopped) return;
      const live = locate(reference, occurrenceId), caret = captureInsertion();
      if (connection !== owner || !live || live.span.draftRev !== revision ||
        caret.start !== selection.start || caret.end !== selection.end) { stop(); return; }
      const page = getTabSnapshot(result.conversationId, result.browserTabId);
      if (!page) { stop(); return; }
      if (page.isLoading || page.isWaitingForResponse) return;
      if (page.tabType !== 'web' || !addressUrl(page.url) || !page.title?.trim()) return;
      if (page.title === 'New tab' && initial.title !== 'New tab') return;
      const value = { ...result.target, sessionId: result.sessionId, tabId: result.tabId,
        conversationId: result.conversationId, browserTabId: result.browserTabId, title: page.title, url: page.url,
        faviconUrl: page.faviconUrl || initial.faviconUrl };
      stop();
      try {
        const next = chip({ kind: 'target', payload: value }, value.title);
        replaceReference(next, { source: reference.source, ref: reference.ref, occurrenceId, span: live.span, selection });
      } catch (error) { notify(error.message); }
    };
    cleanups.add(stop);
    stopTabs = subscribeTabs(update); stopInput = subscribeInput(update);
    timer = setTimeout(stop, 30000);
    queueMicrotask(update);
  }
  async function open(operation) {
    const { state, match, owner } = operation;
    try {
      const result = await services.browserHost.newTab({ conversationId: sessionId, url: match.destinationURL });
      if (connection !== owner) return;
      const input = readInput(), selection = captureInsertion();
      if (input.phase !== 'plain' || input.draftRev !== state.span.draftRev || selection.start !== operation.selection.start ||
        selection.end !== operation.selection.end || selection.draftRev !== state.span.draftRev) return;
      if (!result.target || result.conversationId !== sessionId || !result.browserTabId || !result.sessionId || !result.tabId) {
        throw new Error('The browser did not return the created tab identity');
      }
      const initial = { title: match.description || match.contents || match.destinationURL, url: match.destinationURL, faviconUrl: match.faviconDataURL };
      const value = { ...result.target, sessionId: result.sessionId, tabId: result.tabId,
        conversationId: result.conversationId, browserTabId: result.browserTabId, ...initial };
      const reference = chip({ kind: 'target', payload: value }, initial.title);
      if (!insertReference(reference, state.span)) return;
      watchMetadata(result, reference, initial, owner);
      // A later metadata notification must never refocus a tab or the composer.
      await focusReference(value);
    } catch (error) { if (connection === owner) { dismissed = null; notify(error.message); } }
    finally { if (pending === operation) { pending = null; refresh(); } }
  }
  const controller = {
    anchorRef: { current: null },
    view: { get dom() { return dom; }, get state() { return { browserAddressSuggestion: current }; },
      get isDestroyed() { return !connection; }, hasFocus, subscribe(listener) {
        const changed = () => listener(true); listeners.add(changed); return () => listeners.delete(changed);
      } },
    eventEmitter: {
      addListener(name, listener) { let set = events.get(name); if (!set) events.set(name, set = new Set()); set.add(listener); },
      removeListener(name, listener) { events.get(name)?.delete(listener); },
    },
    getBrowserAutocompleteRuntime: () => controller,
    findBrowserAddressSuggestion: id => portal?.getRootNode().getElementById(id),
    prepareBrowserTabMention({ conversationId, match }) {
      if (!connection || pending || conversationId !== sessionId || !current || !addressUrl(match.destinationURL)) return null;
      const input = readInput(), selection = captureInsertion();
      if (input.phase !== 'plain' || input.draftRev !== current.span.draftRev || selection.draftRev !== current.span.draftRev ||
        selection.start !== current.span.end || selection.end !== current.span.end) return null;
      return { owner: connection, state: current, selection, match };
    },
    insertBrowserTabMention(operation, state) {
      if (!operation || pending || state !== current || operation.state !== state || operation.owner !== connection) return false;
      pending = operation; dismissed = key(state); publish(null);
      void open(operation); return true;
    },
    queueBrowserAutocompleteSubmission(event) {
      queued = current ? { event, key: key(current) } : null;
      emit('composer-suggestion-ui-event', event);
    },
    consumeBrowserAutocompleteSubmission() {
      const value = queued; queued = null;
      return value?.key === key(current) ? value.event : null;
    },
  };
  let queued = null;
  return {
    state: { getSnapshot: () => current, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    connect(host, root, overlay) {
      connection?.dispose();
      dom = host.closest('[data-composer-card]')?.querySelector('[data-composer-input]');
      if (!dom) throw new Error('The conversation input is not mounted');
      root.style.width = '100%';
      controller.anchorRef.current = root; portal = overlay;
      const element = dom, owner = { dispose }; connection = owner;
      const keydown = event => {
        if (event.isComposing || composing || !current) return;
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); dismissed = key(current); queued = null; publish(null); return;
        }
        if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || element.getAttribute('aria-expanded') !== 'true') return;
        event.preventDefault(); event.stopPropagation();
        controller.queueBrowserAutocompleteSubmission({ action: 'insert-mention', kind: 'browser-autocomplete', type: 'submit' });
      };
      const blur = () => { queued = null; publish(null); };
      const compositionStart = () => { composing = true; blur(); };
      const compositionEnd = () => { composing = false; refresh(); };
      const changes = ['focus', 'input', 'keyup', 'pointerup'];
      for (const name of changes) element.addEventListener(name, refresh);
      element.addEventListener('blur', blur); element.addEventListener('keydown', keydown, true);
      element.addEventListener('compositionstart', compositionStart); element.addEventListener('compositionend', compositionEnd);
      element.ownerDocument.addEventListener('selectionchange', refresh);
      const unsubscribe = subscribeInput(refresh); refresh();
      function dispose() {
        if (connection !== owner) return;
        for (const stop of [...cleanups]) stop();
        unsubscribe();
        for (const name of changes) element.removeEventListener(name, refresh);
        element.removeEventListener('blur', blur); element.removeEventListener('keydown', keydown, true);
        element.removeEventListener('compositionstart', compositionStart); element.removeEventListener('compositionend', compositionEnd);
        element.ownerDocument.removeEventListener('selectionchange', refresh);
        connection = null; dom = null; portal = null; controller.anchorRef.current = null; pending = null; queued = null;
        composing = false; dismissed = null; publish(null);
      }
      return { controller, dispose };
    },
    dispose() { connection?.dispose(); listeners.clear(); events.clear(); },
  };
}
