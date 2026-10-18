export const appApprovalKind = 'opencu-app-approval';
export function selectAppApproval({sessionId, pendingInteraction}) {
  return sessionId && pendingInteraction?.kind === appApprovalKind && pendingInteraction.sessionId === sessionId ? pendingInteraction : null;
}
/** One FIFO projection per session; UUIDs belong exclusively to the server. */
export function createPendingAppApprovals({client, publish}) {
  const entries = new Map(), settled = new Set();
  let disposed = false, connected = false, revision = -1;
  const remove = sessionId => { const entry = entries.get(sessionId); if (entry) { entries.delete(sessionId); entry.remove(); } };
  const reconcile = (force = false) => {
    if (disposed) return;
    const snapshot = client.getSnapshot();
    if (!snapshot.connected) { connected = false; return; } // Disconnection is not an empty authoritative snapshot.
    if (!Array.isArray(snapshot.appApprovals)) return;
    const baseline = !connected; connected = true;
    if (!baseline && (snapshot.revision < revision || (!force && snapshot.revision === revision))) return;
    revision = snapshot.revision;
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
      const result = await client.request('appApprovals/respond', response);
      if (result?.settled === true) {
        settled.add(response.requestId);
        if (entries.get(response.conversationId)?.id === response.requestId) remove(response.conversationId);
        // A newer authoritative snapshot may already contain another UUID.
        reconcile(true);
      }
      return result;
    },
    dispose() { disposed = true; off(); for (const sessionId of entries.keys()) remove(sessionId); settled.clear(); },
  };
}
