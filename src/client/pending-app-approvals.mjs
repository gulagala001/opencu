export const appApprovalKind = 'opencu-app-approval';
export function selectAppApproval({sessionId, pendingInteraction}) {
  return sessionId && pendingInteraction?.kind === appApprovalKind && pendingInteraction.sessionId === sessionId ? pendingInteraction : null;
}
/** One FIFO projection per session; UUIDs belong exclusively to the server. */
export function createPendingAppApprovals({client, publish}) {
  const entries = new Map(), settled = new Map();
  let disposed = false, connected = false, revision = -1, generation = 0, sequence = 0, authoritative;
  const remove = sessionId => { const entry = entries.get(sessionId); if (entry) { entries.delete(sessionId); entry.remove(); } };
  const reconcile = (force = false) => {
    if (disposed) return;
    let snapshot = authoritative;
    if (!force) {
      snapshot = client.getSnapshot();
      if (!snapshot.connected) { connected = false; return; } // Cached state is not authoritative while disconnected.
      if (!Array.isArray(snapshot.appApprovals)) return;
      const baseline = !connected;
      if (!baseline && snapshot.revision <= revision) return;
      if (baseline) generation++;
      connected = true; revision = snapshot.revision; sequence++;
      authoritative = snapshot;
      const present = new Set(snapshot.appApprovals.map(value => value.id));
      for (const [id, marker] of settled) {
        if (!present.has(id) && (generation > marker.generation || revision > marker.revision)) settled.delete(id);
      }
    }
    // Local response projection never supplies evidence for tombstone collection.
    if (!snapshot) return;
    const wanted = new Map();
    for (const value of snapshot.appApprovals ?? []) {
      if (typeof value.conversationId !== 'string' || !value.conversationId || typeof value.id !== 'string' || !value.id || settled.has(value.id)) continue;
      const group = wanted.get(value.conversationId) ?? [];
      if (!group.some(item => item.id === value.id)) group.push(value);
      wanted.set(value.conversationId, group);
    }
    for (const sessionId of entries.keys()) if (!wanted.has(sessionId)) remove(sessionId);
    for (const [sessionId, group] of wanted) {
      const previous = entries.get(sessionId);
      const value = group.find(item => item.id === previous?.id) ?? group[0];
      if (previous?.id === value.id) continue;
      remove(sessionId);
      const interaction = {key:value.id, kind:appApprovalKind, sessionId, requestId:value.id, request:value.request};
      const entry = {id:value.id, remove:() => {}};
      entries.set(sessionId, entry);
      entry.remove = publish(interaction, async () => { if (entries.get(sessionId) === entry) remove(sessionId); });
    }
  };
  const off = client.subscribe(() => reconcile()); reconcile();
  return {
    async respond(response) {
      if (disposed) throw new Error('OpenCU approval manager is disposed');
      const started = sequence;
      const result = await client.request('appApprovals/respond', response);
      if (!disposed && result?.settled === true) {
        // A complete snapshot accepted since this request began may already prove deletion,
        // even when the response is delayed across a reconnect (revision resets there).
        const confirmedAbsent = sequence > started && !authoritative.appApprovals.some(value => value.id === response.requestId);
        if (!confirmedAbsent) settled.set(response.requestId, {generation, revision});
        if (entries.get(response.conversationId)?.id === response.requestId) remove(response.conversationId);
        // A newer authoritative snapshot may already contain another UUID.
        reconcile(true);
      }
      return result;
    },
    dispose() { disposed = true; off(); for (const sessionId of entries.keys()) remove(sessionId); settled.clear(); },
  };
}
