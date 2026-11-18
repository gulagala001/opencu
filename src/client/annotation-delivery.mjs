// Keep the operation identity across a lost admission reply or a failed cache write.
// The journal holds only fingerprints and IDs, never annotation text or attachments.
const accepted = new Map();
export async function annotationFingerprint(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function resumeDraft(record) {
  if (record.phase !== 'editing') return;
  if (!globalThis.confirm?.('The previous draft insertion could not be confirmed. Check the conversation and draft. Add these annotations again?')) {
    throw Error('Draft insertion is unconfirmed. Pending annotations were kept.');
  }
}

export async function deliverAnnotation({ scope, intent, direct = true, versioned = false, send, commit }) {
  const signature = await annotationFingerprint([scope, intent]);
  const key = scope + ':delivery:' + signature;
  async function run() {
    const stored = localStorage.getItem(key);
    const versionId = [signature.slice(0, 8), signature.slice(8, 12), '8' + signature.slice(13, 16),
      '8' + signature.slice(17, 20), signature.slice(20, 32)].join('-');
    const record = accepted.get(key) ?? (stored ? JSON.parse(stored) : { id: versioned ? versionId : crypto.randomUUID(), phase: 'prepared' });
    if (!stored && !accepted.has(key)) localStorage.setItem(key, JSON.stringify(record));
    if (record.phase !== 'accepted') {
      if (!direct) {
        resumeDraft(record); record.phase = 'editing'; localStorage.setItem(key, JSON.stringify(record));
      }
      await send(record.id);
      record.phase = 'accepted';
      accepted.set(key, record);
      // Even if storage is full, finish the local transaction when possible.
      try { localStorage.setItem(key, JSON.stringify(record)); } catch {}
    }
    try { await commit(); }
    catch (error) {
      throw Object.assign(new Error((direct ? 'Annotation sent' : 'Annotation added to the draft') +
        '; local cleanup is pending: ' + error.message), { accepted: true, cause: error });
    }
    // Clearing the journal is housekeeping after the content itself was committed.
    try { localStorage.removeItem(key); accepted.delete(key); } catch {}
  }
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(key, run) : run();
}

// Browser selections can grow between retries. Finish the original batch under
// its original admission ID before creating an operation for the new members.
export async function deliverBrowserSelection({ scope, items, direct, current, deliver, mark }) {
  const key = scope + ':selection';
  const version = async item => [await annotationFingerprint(item), item];
  async function run() {
    const wanted = new Map(await Promise.all(items.map(version)));

    let batch = accepted.get(key) ?? JSON.parse(localStorage.getItem(key) || 'null');
    while (batch || wanted.size) {
      const live = new Map(await Promise.all(current().map(version)));
      for (const id of wanted.keys()) if (!live.has(id)) wanted.delete(id);
      if (!batch && !wanted.size) return;
      if (!batch) {
        batch = { id: crypto.randomUUID(), versions: [...wanted.keys()], direct, phase: 'prepared' };
        localStorage.setItem(key, JSON.stringify(batch));
      }
      const members = batch.versions.map(id => live.get(id)).filter(Boolean);
      if (members.length && batch.phase !== 'accepted') {
        if (members.length !== batch.versions.length || batch.direct !== direct || batch.versions.some(id => !wanted.has(id))) {
          throw Error('An earlier annotation delivery is unconfirmed. Retry its original selection or review it before editing or removing the pending comments.');
        }
        if (!batch.direct) {
          resumeDraft(batch); batch.phase = 'editing'; localStorage.setItem(key, JSON.stringify(batch));
        }
        await deliver(members, batch.direct, batch.id);
        batch.phase = 'accepted';
        accepted.set(key, batch);
        try { localStorage.setItem(key, JSON.stringify(batch)); } catch {}
      }
      try {
        if (members.length) mark(members, batch.direct);
        localStorage.removeItem(key);
      } catch (error) {
        throw Object.assign(Error('Annotation delivery completed; local cleanup is pending: ' + error.message), { accepted: true });
      }
      accepted.delete(key);
      for (const id of batch.versions) wanted.delete(id);
      batch = null;
    }
  }
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(key, run) : run();
}
