import test from 'node:test';
import assert from 'node:assert/strict';
import { annotationMessageRule as rule } from '../src/client/annotation-message.mjs';
import { createReferences } from '../src/client/references.mjs';

const wire = (kind, payload) => `<${kind}>\n${JSON.stringify(payload)}\n</${kind}>`;
function display(text) {
  let result = '', cursor = 0, node;
  while ((node = rule.match(text, cursor))) {
    assert.equal(node.id, 'text');
    assert.equal(node.data.text, text.slice(node.start, node.end), 'native rule must retain the exact source span');
    result += text.slice(cursor, node.start) + node.data.display;
    cursor = node.end;
  }
  return result + text.slice(cursor);
}

test('image markup, point comments, mask edits and drawing-only annotations display readable text', () => {
  const payload = { resourceAddress: 'dsh-resource://file/session/example/view.png', sessionId: 'example', title: 'view.png',
    comments: [], prompt: '1. (x: 44.0%, y: 77.2%) Remove the pole',
    markupDocument: { schemaVersion: 1, objects: [{ kind: 'arrow', x: 30, y: 40 }] }, imageOrder: ['original', 'markup'] };
  assert.equal(display(wire('image-annotations', payload)), 'view.png\n\n1. (x: 44.0%, y: 77.2%) Remove the pole');
  assert.equal(display(wire('image-annotations', { ...payload, prompt: '', comments: [{ id: 'point', text: 'Change this\nKeep the edge', x: 0.44, y: 0.772 }] })),
    'view.png\n\n1. (x: 44.0%, y: 77.2%) Change this\nKeep the edge');
  assert.equal(display(wire('image-annotations', { ...payload, prompt: 'Remove the area marked in the mask image.' })),
    'view.png\n\nRemove the area marked in the mask image.');
  assert.equal(display(wire('image-annotations', { ...payload, prompt: '' })), 'view.png');
});

test('browser comments and design-only annotations retain requested changes without internal JSON', () => {
  const payload = { title: 'Example page', url: 'https://example.test', browserTabId: 'hidden-id', comments: [
    { body: 'Move the button', anchor: { textLocator: { exact: 'Continue' } } },
    { body: '', designChange: { text: { previousValue: 'Old', value: 'New' },
      declarations: [{ property: 'color', previousValue: 'red', value: 'blue' }],
      annotationControls: { controls: [{ callback: 'theme', type: 'select', label: 'Theme', options: [{ value: 'a', label: 'Light' }, { value: 'b', label: 'Dark' }] }] },
      annotationControlChanges: [{ callback: 'theme', previousValue: 'a', value: 'b' }] } },
  ] };
  assert.equal(display(wire('computer-use-annotations', payload)),
    'Example page\n\n1. 「Continue」\nMove the button\n\n2. Old → New\ncolor: red → blue\nTheme: Light → Dark');
});

test('PDF, document, spreadsheet and presentation comments preserve their content and location', () => {
  const content = [{ content_type: 'text', text: 'Please ' }, { content_type: 'text', text: 'revise' }];
  const comments = [
    { content, localPdfContext: { pageNumber: 3 }, localPdfCommentMetadata: { kind: 'region', selectedText: 'PDF passage' } },
    { content, localArtifactAnnotationContext: { artifactKind: 'document' }, localArtifactAnnotationMetadata: { target: { type: 'document-element-selection', pageNumber: 2, selectedText: 'Document passage' } } },
    { content, localArtifactAnnotationMetadata: { target: { type: 'workbook-range', sheetName: 'Revenue', rangeAddress: 'B2:C4' } } },
    { content, localArtifactAnnotationContext: { artifactKind: 'presentation', label: 'Slide 4' } },
  ];
  assert.equal(display(wire('document-annotations', { title: 'Report', comments })),
    'Report\n\n1. p. 3\n「PDF passage」\nPlease revise\n\n2. p. 2\n「Document passage」\nPlease revise\n\n3. Revenue!B2:C4\nPlease revise\n\n4. Slide 4\nPlease revise');
});

test('selected response text, mixed tags and tag-shaped user text retain exact boundaries', () => {
  const first = wire('text-annotations', { selectedText: 'Quote </text-annotations> <image-annotations>', comments: [{ body: 'Keep\nthis' }] });
  const second = wire('image-annotations', { title: 'view.png', comments: [], prompt: '<script>alert(1)</script>' });
  assert.equal(display(`Before 😀\n${first}\nBetween\n${second}\nAfter`),
    'Before 😀\n「Quote </text-annotations> <image-annotations>」\n\nKeep\nthis\nBetween\nview.png\n\n<script>alert(1)</script>\nAfter');
});

test('malformed, unknown and unsupported payloads remain visible without hiding later valid annotations', () => {
  const valid = wire('text-annotations', { selectedText: 'Selected', comments: [{ body: '' }] });
  for (const raw of ['plain text', '<image-annotations>broken', wire('image-annotations', null),
    wire('document-annotations', { title: 'Report', comments: [{ content: [{ content_type: 'unknown', value: 'Keep this' }] }] }),
    wire('unknown-annotations', { comments: [] }), wire('image-annotations', { title: 'view.png', comments: [null], prompt: '' })]) {
    assert.equal(display(raw), raw);
    assert.equal(display(`${raw}\n${valid}`), `${raw}\n「Selected」`);
  }
});

test('display leaves serialized references, persistent content and both image attachments byte-for-byte intact', t => {
  const saved = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value),
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; });
  const references = createReferences({});
  for (const value of [
    { kind: 'image-annotations', payload: { title: 'view.png', comments: [], prompt: 'Remove the pole', markupDocument: { objects: [{ kind: 'arrow' }] }, imageOrder: ['original', 'markup'] } },
    { kind: 'annotations', payload: { title: 'Example page', comments: [{ body: 'Move this', attachedImages: [{ filename: 'example.png', dataUrl: 'data:image/png;base64,aW1hZ2U=' }] }] } },
    { kind: 'document-annotations', payload: { title: 'report.pdf', comments: [{ content: [{ content_type: 'text', text: 'Revise' }], localPdfContext: { pageNumber: 2 } }] } },
    { kind: 'text-annotations', payload: { selectedText: 'Quote', comments: [{ body: 'Explain' }] } },
  ]) {
    const reference = references.chip(value, 'Annotation'), serialized = references.serialize(reference.ref);
    const content = Object.freeze([
      Object.freeze({ type: 'image', attachment: Object.freeze({ id: 'original', mediaType: 'image/png' }) }),
      Object.freeze({ type: 'image', attachment: Object.freeze({ id: 'markup', mediaType: 'image/png' }) }),
      Object.freeze({ type: 'text', text: serialized }),
    ]);
    const before = JSON.stringify(content), stored = JSON.stringify([...saved]);
    assert.notEqual(display(content[2].text), serialized);
    assert.equal(JSON.stringify(content), before);
    assert.equal(JSON.stringify([...saved]), stored);
    assert.equal(references.serialize(reference.ref), serialized);
    assert.deepEqual(references.read(reference.ref), value);
  }
});
