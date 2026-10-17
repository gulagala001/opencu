/** Display sent response annotations without changing the persisted/model-visible message. */
export function annotationMessageText(text) {
  const open = '<text-annotations>', close = '</text-annotations>';
  let cursor = 0, result = '', changed = false;
  while (cursor < text.length) {
    const start = text.indexOf(open, cursor);
    if (start < 0) break;
    let end = text.indexOf(close, start + open.length), payload;
    while (end >= 0) {
      try { payload = JSON.parse(text.slice(start + open.length, end)); break; }
      catch { end = text.indexOf(close, end + close.length); }
    }
    if (end < 0) break;
    if (typeof payload?.selectedText !== 'string' || !Array.isArray(payload.comments)
      || !payload.comments.every(comment => typeof comment?.body === 'string')) {
      result += text.slice(cursor, end + close.length); cursor = end + close.length; continue;
    }
    const comments = payload.comments.map(comment => comment.body).filter(body => body.trim());
    result += text.slice(cursor, start) + [`「${payload.selectedText}」`, ...comments].join('\n\n');
    cursor = end + close.length; changed = true;
  }
  return changed ? result + text.slice(cursor) : text;
}

export function annotationMessageContent(content) {
  let changed = false;
  const next = content.map(block => {
    if (block?.type !== 'text' || typeof block.text !== 'string') return block;
    const text = annotationMessageText(block.text);
    if (text === block.text) return block;
    changed = true; return { ...block, text };
  });
  return changed ? next : content;
}
