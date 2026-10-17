const prefix = 'opencu:text-annotation:';

/** Captures response selections without replacing the host's message renderer or changing tool execution. */
export function createTextAnnotations({ submit, notify }) {
  const listeners = new Set();
  let current = null, selectedRow = null, selectedRange = null, disposed = false;
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
  const close = () => { selectedRow = null; selectedRange = null; publish(null); };
  const capture = event => {
    if (disposed || current?.pending) return;
    if (event?.type === 'keyup' && event.key === 'Escape') { close(); return; }
    if (event?.type === 'keyup' && !['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (event?.button != null && event.button !== 0) return;
    if (event?.composedPath().some(node => node?.matches?.('[data-rea-root]'))) return;
    if (event?.composedPath().some(node => node?.matches?.('input,textarea,[contenteditable="true"],button'))) { close(); return; }
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1 || !selection.toString().trim()) { close(); return; }
    const range = selection.getRangeAt(0), row = locate(range.startContainer);
    if (!row || locate(range.endContainer) !== row || row.dataset.chatGroupPart === 'reasoning') { close(); return; }
    if ([range.startContainer, range.endContainer].some(node => elementOf(node)?.closest('input,textarea,[contenteditable="true"],button'))) { close(); return; }
    const sessionId = row.closest('[data-conversation-session]')?.dataset.conversationSession;
    if (!sessionId) { close(); return; }
    const preceding = range.cloneRange(); preceding.selectNodeContents(row); preceding.setEnd(range.startContainer, range.startOffset);
    const bounds = range.getBoundingClientRect();
    const value = { sessionId, nodeKey: row.dataset.chatNodeKey, turn: row.dataset.chatTurn,
      text: selection.toString(), start: preceding.toString().length,
      rect: { left: bounds.left, top: bounds.top, bottom: bounds.bottom }, editing: false, pending: false, error: null };
    if (current && key(value) === key(current)) return;
    try { value.body = localStorage.getItem(key(value)) || ''; }
    catch (error) { close(); notify(sessionId, error.message); return; }
    selectedRow = row; selectedRange = range.cloneRange(); publish(value);
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
    body: saveDraft, close,
    edit() { if (current && !current.pending) publish({ ...current, editing: true }); },
    async copy() {
      const value = current;
      if (!value || value.pending) return false;
      try { await navigator.clipboard.writeText(value.text); return true; }
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
        await submit({ ...value, body }, directly);
        try { localStorage.removeItem(key(value)); }
        catch (error) { notify(value.sessionId, error.message); }
        if (current && key(current) === key(value)) close();
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
