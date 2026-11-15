const prefix = 'opencu:text-annotation:';
export const textInteraction = 'conversation.chat.text-interaction';

/** Extend only the native Quote surface; leave its gesture and fallback registered. */
export function installQuoteCompanion(slots, inject, wrap) {
  let installed, original, disposed = false;
  const failed = new WeakSet();
  function reconcile() {
    if (disposed || slots.ctx?.fiber?.uid === null) return;
    const winner = slots.entriesOfSlot(textInteraction).find(entry => entry.options.key === 'quote');
    // A retired wrapper stays on the ledger. Leave the native fallback alone
    // until the original registration is replaced instead of retrying its crash.
    if (installed && winner === original) failed.add(original);
    const quote = installed && winner?.component === installed.component
      ? slots.entries(textInteraction).find(entry => entry.options.key === 'quote' && entry.component !== installed.component)
      : winner;
    const next = quote?.locale === 'messageQuotes' && !quote.inject && !quote.store && !quote.children && !failed.has(quote) ? quote : undefined;
    if (next === original) return;
    original = next;
    const previous = installed; installed = undefined;
    previous?.dispose();
    if (!next) return;
    const component = wrap(next.component);
    installed = { component };
    try {
      installed.dispose = slots.register({ name: textInteraction, key: 'quote',
        priority: (next.options.priority ?? 0) - 1, locale: next.locale, inject }, component);
    } catch (error) { installed = original = undefined; throw error; }
  }
  const unsubscribe = slots.subscribe(textInteraction, reconcile);
  try { reconcile(); } catch (error) { unsubscribe(); throw error; }
  return () => { disposed = true; unsubscribe(); installed?.dispose(); };
}

/** Captures response selections without replacing the host's message renderer or changing tool execution. */
export function createTextAnnotations({ submit, insertQuote, notify }) {
  const listeners = new Set(), quoteSurfaces = new Map();
  let current = null, selectedRow = null, selectedRange = null, clearHostSelection = null, disposed = false;
  const publish = value => { current = value; for (const listener of listeners) listener(); };
  const elementOf = node => node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const locate = node => elementOf(node)?.closest('[data-chat-node-key][data-chat-flow-kind="assistant"],[data-chat-node-key][data-chat-flow-kind="assistant-step"]');
  const key = value => prefix + JSON.stringify([value.sessionId, value.nodeKey, value.start, value.text]);
  const saveDraft = body => {
    if (!current) return;
    if (current.body !== body) publish({ ...current, body });
    try { localStorage.setItem(key(current), body); }
    catch (error) { notify(current.sessionId, error.message); }
  };
  const close = () => { if (current?.editing) clearMatchedSelection(); selectedRow = null; selectedRange = null; clearHostSelection = null; if (current !== null) publish(null); };
  function clearMatchedSelection() {
    const selection = document.getSelection();
    if (selectedRange && selection?.rangeCount === 1) {
      const range = selection.getRangeAt(0);
      if (range.compareBoundaryPoints(Range.START_TO_START, selectedRange) === 0 &&
          range.compareBoundaryPoints(Range.END_TO_END, selectedRange) === 0) {
        if (clearHostSelection) clearHostSelection(); else selection.removeAllRanges();
      }
    }
  }
  function readSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1 || !selection.toString().trim()) return null;
    const range = selection.getRangeAt(0), row = locate(range.startContainer);
    if (!row || locate(range.endContainer) !== row || row.dataset.chatGroupPart === 'reasoning') return null;
    if ([range.startContainer, range.endContainer].some(node => elementOf(node)?.closest('input,textarea,[contenteditable="true"],button'))) return null;
    const sessionId = row.closest('[data-conversation-session]')?.dataset.conversationSession;
    if (!sessionId) return null;
    const preceding = range.cloneRange(); preceding.selectNodeContents(row); preceding.setEnd(range.startContainer, range.startOffset);
    const bounds = range.getBoundingClientRect();
    return { row, range, value: { sessionId, nodeKey: row.dataset.chatNodeKey, turn: row.dataset.chatTurn,
      text: selection.toString(), start: preceding.toString().length,
      rect: { left: bounds.left, top: bounds.top, bottom: bounds.bottom }, editing: false, pending: false, error: null } };
  }
  function adopt({ row, range, value }) {
    for (const [id, surface] of quoteSurfaces) {
      if (!surface.area.contains(row)) continue;
      const text = surface.readText();
      if (typeof text === 'string' && text.trim()) { value.quoteSurface = id; value.quoteText = text; break; }
    }
    if (current && row === selectedRow && key(value) === key(current)) {
      selectedRange = range.cloneRange();
      if (!current.editing && (value.quoteSurface !== current.quoteSurface || value.quoteText !== current.quoteText)) {
        publish({ ...value, body: current.body });
      }
      return;
    }
    try { value.body = localStorage.getItem(key(value)) || ''; }
    catch { value.body = ''; }
    selectedRow = row; selectedRange = range.cloneRange(); publish(value);
  }
  const capture = event => {
    if (disposed || current?.pending) return;
    if (event?.type === 'keyup' && event.key === 'Escape') { close(); return; }
    if (event?.type === 'keyup' && !['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (event?.button != null && event.button !== 0) return;
    if (event?.composedPath().some(node => node?.matches?.('[data-rea-root], [data-opencu-text-quote]'))) return;
    if (event?.composedPath().some(node => node?.matches?.('input,textarea,[contenteditable="true"],button'))) { close(); return; }
    const selection = readSelection();
    if (selection) adopt(selection); else close();
  };
  const reposition = () => {
    if (!current || !selectedRange || !selectedRow?.isConnected) return;
    const bounds = selectedRange.getBoundingClientRect();
    if (bounds.left !== current.rect.left || bounds.top !== current.rect.top || bounds.bottom !== current.rect.bottom) {
      publish({ ...current, rect: { left: bounds.left, top: bounds.top, bottom: bounds.bottom } });
    }
  };
  const check = () => {
    if (!current || current.pending) return;
    if (!selectedRow?.isConnected || selectedRow.dataset.chatNodeKey !== current.nodeKey || selectedRow.closest('[data-conversation-session]')?.dataset.conversationSession !== current.sessionId) close();
  };
  let observer;
  return {
    state: { getSnapshot: () => current, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    start() {
      document.addEventListener('pointerup', capture); document.addEventListener('keyup', capture);
      document.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition);
      observer = new MutationObserver(check); observer.observe(document.body, { childList: true, subtree: true });
    },
    attachQuote(id, toolbar, readText, dismiss, clearSelection) {
      const area = toolbar?.closest('[data-text-interaction-surface]')?.parentElement;
      if (!area) return;
      quoteSurfaces.set(id, { area, readText, dismiss, clearSelection });
      const selection = readSelection();
      if (selection && !current?.editing && !current?.pending && area.contains(selection.row)) adopt(selection);
      return () => {
        quoteSurfaces.delete(id);
        if (current?.quoteSurface === id && !current.editing) close();
      };
    },
    body: saveDraft, close,
    edit(id) {
      if (!current || current.pending || current.quoteSurface !== id) return;
      const surface = quoteSurfaces.get(id);
      if (id && !surface?.readText()) { close(); return; }
      clearHostSelection = surface?.clearSelection;
      publish({ ...current, editing: true });
      surface?.dismiss();
    },
    async copy(id) {
      const value = current;
      if (!value || value.pending || value.quoteSurface !== id) return false;
      try { await navigator.clipboard.writeText(value.quoteText ?? value.text); return true; }
      catch (error) { notify(value.sessionId, error.message); return false; }
    },
    focus({ conversationId, nodeKey }) {
      const row = [...document.querySelectorAll('[data-chat-node-key]')].find(element => element.dataset.chatNodeKey === nodeKey && element.closest('[data-conversation-session]')?.dataset.conversationSession === conversationId);
      if (!row) throw new Error('The annotated message is not currently loaded; open its conversation history');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const focusable = row.querySelector('button,a,[tabindex]');
      focusable?.focus({ preventScroll: true });
    },
    async submit(body, directly = false) {
      const value = current;
      if (disposed || !value || value.pending) return;
      publish({ ...value, body, pending: true, error: null }); saveDraft(body);
      try {
        if (!directly && !body.trim()) {
          if (insertQuote({ ...value, quoteText: value.quoteText ?? value.text }) === false) throw Error('The message draft could not accept the quote; try again');
        } else await submit({ ...value, body }, directly);
        try { localStorage.removeItem(key(value)); }
        catch (error) { notify(value.sessionId, error.message); }
        if (current && key(current) === key(value)) { clearMatchedSelection(); close(); }
      } catch (error) { if (current && key(current) === key(value)) publish({ ...value, body, error: error.message, pending: false }); }
    },
    dispose() {
      disposed = true;
      document.removeEventListener('pointerup', capture); document.removeEventListener('keyup', capture);
      document.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition);
      observer?.disconnect(); close(); listeners.clear();
    },
  };
}
