const source = 'opencu';
const prefix = 'opencu:reference:';

/** Draft chips retain the complete target or annotation payload across reloads. */
export function createReferences({ client, focus, edit, notify, translate }) {
  function read(ref) {
    const value = localStorage.getItem(prefix + ref);
    if (!value) throw new Error('The computer-use reference is no longer available');
    return JSON.parse(value);
  }
  function chip(value, label) {
    const ref = crypto.randomUUID();
    localStorage.setItem(prefix + ref, JSON.stringify(value));
    return { source, ref, label, clipboardText: `@${label}`, appearance: 'session' };
  }
  function serialize(ref, signal) {
    signal?.throwIfAborted();
    const value = read(ref);
    const tag = value.kind === 'annotations' ? 'computer-use-annotations' : value.kind === 'image-annotations' ? 'image-annotations' : value.kind === 'document-annotations' ? 'document-annotations' : value.kind === 'text-annotations' ? 'text-annotations' : 'computer-use-target';
    const payload = value.kind === 'annotations' ? { ...value.payload, comments: value.payload.comments.map(comment => ({
      ...comment, attachedImages: comment.attachedImages?.map(({ dataUrl, ...image }) => image),
    })) } : value.payload;
    return `<${tag}>\n${JSON.stringify(payload)}\n</${tag}>`;
  }
  return {
    chip, read, serialize,
    source: {
      trigger: '@', name: source, order: 20, showGroupTitle: false,
      async candidates(_session, { query, signal }) {
        const { targets = [] } = await client.request('targets', {}, signal);
        const needle = query.toLocaleLowerCase();
        return targets.filter(target => [target.title, target.name, target.url, target.app, target.browserId].some(value => String(value ?? '').toLocaleLowerCase().includes(needle))).map(target => ({
          name: target.id, label: target.title || target.name || target.app || target.id,
          description: [target.url, target.browserId ?? target.bundleId].filter(Boolean).join(' · '),
          section: translate(target.backend === 'native' ? 'applications' : 'tabs'),
          value: JSON.stringify(target), icon: 'session',
        }));
      },
      onPick({ candidate }) {
        const target = JSON.parse(candidate.value);
        return { insert: chip({ kind: 'target', payload: target }, candidate.label) };
      },
      openReference(session, { ref }) {
        try {
          const value = read(ref);
          if (['annotations', 'text-annotations'].includes(value.kind) && edit?.(session.sessionId, ref)) return true;
          void Promise.resolve(focus(value.payload)).catch(error => notify(error.message));
          return true;
        } catch (error) { notify(error.message); return false; }
      },
      codec: {
        clipboardText(ref) {
          const value = read(ref).payload;
          return `@${value.title || value.name || value.app || value.id || translate('annotations')}`;
        },
        serialize,
      },
    },
  };
}
