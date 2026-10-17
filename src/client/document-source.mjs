const sources = new WeakMap();
let nextSource = 0;

export function createDocumentSource(bytes) {
  const identity = `opencu:document:${++nextSource}`;
  const source = Object.freeze({ toString: () => identity });
  sources.set(source, new Uint8Array(bytes));
  return source;
}

export function documentSourceBytes(source) {
  const bytes = sources.get(source);
  // Viewers may transfer their buffer; each read owns an independent snapshot.
  return bytes === undefined ? undefined : new Uint8Array(bytes);
}
