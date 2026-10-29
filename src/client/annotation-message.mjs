const string = value => typeof value === 'string' ? value : '';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const lines = values => values.filter(nonempty).join('\n');
const quote = value => nonempty(value) ? `「${value}」` : '';
const numbered = (value, index) => `${index + 1}. ${value}`;

function imageComment(comment) {
  if (typeof comment?.text !== 'string') return undefined;
  const point = Number.isFinite(comment.x) && Number.isFinite(comment.y)
    ? `(x: ${(comment.x * 100).toFixed(1)}%, y: ${(comment.y * 100).toFixed(1)}%)` : '';
  return [point, comment.text].filter(nonempty).join(' ');
}

function browserComment(comment) {
  if (typeof comment?.body !== 'string') return undefined;
  const selections = [comment.anchor, ...(Array.isArray(comment.additionalAnchors) ? comment.additionalAnchors : [])];
  const selected = selections.map(anchor => quote(anchor?.textQuote ?? anchor?.textLocator?.exact ?? anchor?.text));
  const change = comment.designChange;
  const edits = [];
  if (typeof change?.text?.value === 'string' && change.text.value !== change.text.previousValue) {
    edits.push(`${string(change.text.previousValue)} → ${change.text.value}`);
  }
  for (const declaration of Array.isArray(change?.declarations) ? change.declarations : []) {
    if (typeof declaration?.property === 'string' && typeof declaration.value === 'string'
      && declaration.value !== declaration.previousValue) {
      edits.push(`${declaration.property}: ${string(declaration.previousValue)} → ${declaration.value}`);
    }
  }
  for (const edit of Array.isArray(change?.annotationControlChanges) ? change.annotationControlChanges : []) {
    if (!edit || edit.value === edit.previousValue) continue;
    const controls = change.annotationControls?.controls;
    const control = Array.isArray(controls) ? controls.find(control => control?.callback === edit.callback) : undefined;
    if (typeof control?.label !== 'string') continue;
    const options = Array.isArray(control.options) ? control.options : [];
    const label = value => control.type === 'select'
      ? string(options.find(option => option?.value === value)?.label)
      : ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '';
    edits.push(`${control.label}: ${label(edit.previousValue)} → ${label(edit.value)}`);
  }
  return lines([...selected, comment.body, ...edits]);
}

function documentComment(comment) {
  // REA document/PDF comments use content blocks, not the browser's body field.
  if (!Array.isArray(comment?.content) || !comment.content.every(block => block?.content_type === 'text' && typeof block.text === 'string')) return undefined;
  const context = comment.localArtifactAnnotationContext;
  const metadata = comment.localArtifactAnnotationMetadata;
  const target = metadata?.target;
  const pdf = comment.localPdfContext;
  const page = pdf?.pageNumber ?? target?.pageNumber;
  const location = target?.type === 'workbook-range'
    ? lines([target.sheetName, target.rangeAddress]).replace('\n', '!')
    : string(context?.label) || (Number.isSafeInteger(page) && page > 0 ? `p. ${page}` : '');
  const preview = metadata?.contentPreview?.type === 'text' ? metadata.contentPreview.text
    : target?.selectedText ?? target?.nearbyText ?? comment.localPdfCommentMetadata?.selectedText ?? comment.localPdfCommentMetadata?.nearbyText;
  return lines([location, quote(preview), comment.content.map(block => block.text).join('')]);
}

function annotationDisplay(tag, payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.comments)) return undefined;
  if (tag === 'text-annotations') {
    if (typeof payload.selectedText !== 'string' || !payload.comments.every(comment => typeof comment?.body === 'string')) return undefined;
    return [quote(payload.selectedText), ...payload.comments.map(comment => comment.body)].filter(nonempty).join('\n\n');
  }
  const title = string(payload.title) || (tag === 'computer-use-annotations' ? string(payload.url) : '');
  if (!title) return undefined;
  const format = tag === 'image-annotations' ? imageComment : tag === 'document-annotations' ? documentComment : browserComment;
  const comments = payload.comments.map(format);
  if (comments.some(comment => comment === undefined)) return undefined;
  if (tag === 'image-annotations' && typeof payload.prompt !== 'string') return undefined;
  return [title, tag === 'image-annotations' ? payload.prompt : '',
    ...comments.map(numbered)].filter(nonempty).join('\n\n');
}

/** Native display-only rule: original spans remain available to history, copy and send. */
export const annotationMessageRule = {
  id: 'opencu.annotations', order: 0,
  match(text, from) {
    const tags = /<(text-annotations|image-annotations|document-annotations|computer-use-annotations)>/g;
    tags.lastIndex = from;
    for (let match = tags.exec(text); match; match = tags.exec(text)) {
      const start = match.index, openEnd = tags.lastIndex, close = `</${match[1]}>`;
      let end = text.indexOf(close, openEnd), payload, parsed = false;
      // Closing-tag text may itself occur inside a quoted comment.
      while (end >= 0) {
        try { payload = JSON.parse(text.slice(openEnd, end)); parsed = true; break; }
        catch { end = text.indexOf(close, end + close.length); }
      }
      if (!parsed) continue;
      end += close.length;
      tags.lastIndex = end;
      const display = annotationDisplay(match[1], payload);
      if (display === undefined) continue;
      return { id: 'text', start, end, data: { text: text.slice(start, end), display } };
    }
    return undefined;
  },
};
