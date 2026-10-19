/** Adapt REA's exact-file workbook sessions to the desktop's durable journal. */
export function createArtifactDocumentsHost(desktop) {
  const bindings = new Map(), pending = new Set(), editors = new Set();
  let disposed = false, closing = false, disposal;
  const retained = promise => {
    pending.add(promise);
    void promise.finally(() => pending.delete(promise)).catch(() => undefined);
    promise[Symbol.dispose] = () => {};
    return promise;
  };
  return {
    registerEditor(editor) {
      if (closing) { editor.stop(); return () => {}; }
      editors.add(editor);
      return () => editors.delete(editor);
    },
    bindToExactFile({ publicFilePath, onError }) {
      if (closing || disposed || !desktop?.files) throw new Error('The workbook persistence host is unavailable');
      let closed = false;
      let finish;
      const drained = new Promise(resolve => { finish = resolve; });
      const subscriptions = new Set();
      const operate = (command, args) => retained(Promise.resolve().then(() => {
        if (closed || disposed) throw new Error('The workbook file binding is closed');
        if (args.publicFilePath !== publicFilePath) throw new Error('The workbook request targets a different file');
        return desktop.files('artifactDocument', { path: publicFilePath, command, request: args });
      }));
      const binding = {
        find: args => operate('find', args), read: args => operate('read', args),
        adopt: args => operate('adopt', args), append: args => operate('append', args),
        materialize: args => operate('materialize', args), refreshCleanSession: args => operate('refreshCleanSession', args),
        subscribe(args, listener) {
          return retained((async () => {
            const initial = await operate('read', args);
            if (initial.status !== 'ok') return initial;
            if (closed) throw new Error('The workbook subscription closed');
            let version = initial.value.stateVersion, stopped = false, timer, reported = false;
            const stop = () => { stopped = true; clearTimeout(timer); subscriptions.delete(stop); };
            subscriptions.add(stop);
            const poll = async () => {
              try {
                const result = await operate('read', args);
                if (stopped) return;
                if (result.status !== 'ok') throw new Error('The workbook persistence record changed; reopen this file');
                for (const update of result.value.updates) if (update.stateVersion > version) {
                  if (stopped) return;
                  listener({ documentId: result.value.documentId, stateVersion: update.stateVersion,
                    materializedStateVersion: result.value.materializedStateVersion, committedUpdate: update });
                  version = update.stateVersion;
                }
                reported = false;
              } catch (error) { if (!stopped && !reported) { reported = true; if (onError) onError(error.message); else console.error('OpenCU workbook persistence', error); } }
              if (!stopped) timer = setTimeout(poll, 500);
            };
            timer = setTimeout(poll, 500);
            return { status: 'ok', value: { record: initial.value, subscription: {
              unsubscribe() { stop(); return retained(Promise.resolve()); },
            } }, [Symbol.dispose]: stop };
          })());
        },
        [Symbol.dispose]() { closed = true; for (const stop of subscriptions) stop(); bindings.delete(binding); finish(); },
      };
      bindings.set(binding, drained);
      return retained(Promise.resolve(binding));
    },
    dispose() {
      if (disposal) return disposal;
      closing = true;
      const currentEditors = [...editors];
      disposal = (async () => {
        for (const editor of currentEditors) editor.quiesce();
        // Flush while mounted so a save failure can preserve the editor for retry.
        await Promise.all(currentEditors.map(editor => editor.flush()));
        // Unmount while both persistence and file services still work.
        // REA releases its binding only after worker drain, append and flush.
        for (const editor of currentEditors) editor.stop();
        editors.clear();
        while (bindings.size) await Promise.all([...bindings.values()]);
        while (pending.size) await Promise.allSettled([...pending]);
        disposed = true;
      })().catch(error => {
        closing = false; disposal = undefined;
        for (const editor of currentEditors) editor.resume();
        throw error;
      });
      return disposal;
    },
  };
}
