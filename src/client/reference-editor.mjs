/** Edits one unsent annotation occurrence without changing other draft content or submitted references. */
export function createReferenceEditor({ references, inputFor, remove, notify }) {
  const listeners = new Set();
  let current = null;
  const publish = value => { current = value; for (const listener of listeners) listener(); };
  function locate(value) {
    const input = inputFor(value.sessionId), state = input.state.getSnapshot();
    const occurrence = state.occurrences.find(item => item.occurrenceId === value.occurrenceId && item.ref === value.ref && item.source === 'opencu');
    if (state.phase !== 'plain' || !occurrence) throw new Error('The annotation draft changed or was submitted; reopen the current reference to edit it');
    const start = occurrence.offset - state.occurrences.filter(item => item.offset < occurrence.offset).reduce((size, item) => size + item.length - 1, 0);
    return { input, occurrence, span: { start, end: start + 1, draftRev: state.draftRev } };
  }
  function close() {
    const value = current;
    publish(null);
    if (value) inputFor(value.sessionId).focus();
  }
  return {
    state: { getSnapshot: () => current, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    open(sessionId, ref) {
      const value = references.read(ref);
      if (!['annotations', 'text-annotations'].includes(value.kind) || value.payload.comments?.length !== 1) return false;
      const state = inputFor(sessionId).state.getSnapshot();
      const occurrence = state.occurrences.find(item => item.source === 'opencu' && item.ref === ref);
      if (!occurrence || state.phase !== 'plain') return false;
      publish({ sessionId, ref, occurrenceId: occurrence.occurrenceId, value });
      return true;
    },
    close,
    save(body) {
      const value = current;
      if (!value) return;
      try {
        const { input, occurrence, span } = locate(value);
        const comment = value.value.payload.comments[0];
        const updated = { ...comment, body, ...(comment.designChange ? { designChange: { ...comment.designChange, comment: body } } : {}) };
        const reference = references.chip({ ...value.value, payload: { ...value.value.payload, comments: [updated] } }, occurrence.label);
        if (!input.insertReference(reference, span)) throw new Error('The message draft changed; the annotation was not replaced');
        close();
      } catch (error) { notify(value.sessionId, error.message); }
    },
    async remove() {
      const value = current;
      if (!value) return;
      try {
        const { span } = locate(value);
        if (!await remove(value.sessionId, span)) throw new Error('The message draft changed; the annotation was not removed');
        if (current === value) close();
      } catch (error) { notify(value.sessionId, error.message); }
    },
    dispose() { publish(null); listeners.clear(); },
  };
}
