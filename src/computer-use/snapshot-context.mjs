// A row names a control; when several rows in one observation carry the same
// name, the name alone no longer identifies one of them. The diff form makes
// that acute: a lone `~ 12 button "Save" [disabled=true]` names no region, and
// the "observed evidence" the model is told to disambiguate with is not in the
// row. This module adds the smallest surrounding evidence that does identify it,
// following Tencent BrowserSkill's VOM handle context (render.ts
// needsHandleContext / collectSameContainerContext): only rows whose name
// repeats pay for context, a sibling label outranks an ancestor label, and at
// most one label is returned so rows stay short.
//
// Everything here is derived from the AX nodes already fetched for the
// observation. No page input, selector evaluation, DOM read or extra CDP call is
// involved, so an observation stays as cheap and as side-effect free as before.

// Labels that only restate an action carry no identity: `Save` beside three
// `Save` buttons disambiguates nothing. BrowserSkill keeps the list English;
// OpenCU's own surfaces are bilingual, so the Chinese forms are refused too.
const WEAK_ACTION_LABELS = new Set([
  'add','apply','back','cancel','close','confirm','continue','delete','done','edit','go',
  'more','next','no','ok','open','previous','remove','reset','save','select','submit',
  'suspend','view','yes',
  '保存','取消','删除','提交','编辑','确定','关闭','查看','打开','添加','移除','选择','应用',
  '重置','更多','继续','返回','下一步','上一步','是','否',
]);
// An ancestor only names its region when it is the kind of node that labels one.
const CONTEXT_LABEL_ROLES = new Set(['heading','article','section','group','region','row','form']);
const LOW_VALUE = [/^\d{5,}$/, /icp|备案/i, /联系方式|政府网站标识/, /^欢迎$/, /^section$/i];
const MARKUP = /<\/?[a-z][^>]*>/i;
const SCRIPT = /\$\(function|document\.|window\.|\.onclick\s*=|function\s*\(|var\s+\w+\s*=/;
const URLISH = /(https?:\/\/|encodeURIComponent|target="_blank")/i;
// Work stays bounded on pages with many repeated actions; identity evidence is
// local, so a cap costs nothing on real documents.
const MAX_LEVELS = 6, MAX_PRECEDING_SIBLINGS = 12, MAX_SUBTREE_NODES = 60;
// A pure text node repeats the control or label that already owns the context:
// `button "Save"` and its child `StaticText "Save"` name the same thing, and a
// table of repeated cells would put `[ctx: …]` on every one of them. Only a node
// a caller can act on is worth identifying, which is the reference-node rule
// BrowserSkill applies before it counts duplicates.
const TEXT_ONLY_ROLES = new Set(['StaticText', 'InlineTextBox', 'text']);

const compact = value => { const s = String(value ?? '').replace(/\s+/g, ' ').trim(); return s || undefined; };
const normalize = s => s.split(/\s+/).join(' ').toLowerCase();

// Page text reaches this module as untrusted data; a label that is markup, a
// script fragment or a URL is not identity evidence and would only mislead.
function cleanLabel(value, targetKey) {
  const clean = compact(value);
  if (!clean || clean.includes('<![endif]') || clean.includes('<!--') || clean.includes('-->')) return undefined;
  if (MARKUP.test(clean) || SCRIPT.test(clean) || URLISH.test(clean)) return undefined;
  const key = normalize(clean);
  if (!key || key === targetKey || key.startsWith('ctx_')) return undefined;
  if (WEAK_ACTION_LABELS.has(key) || LOW_VALUE.some(re => re.test(clean))) return undefined;
  return clean;
}

// The first non-action label inside a subtree, in document order.
function subtreeLabel(rows, childrenOf, start, targetKey) {
  const queue = [start]; let visited = 0;
  while (queue.length && visited < MAX_SUBTREE_NODES) {
    const index = queue.shift(); visited += 1;
    const label = cleanLabel(rows[index].name, targetKey);
    if (label) return label;
    queue.push(...(childrenOf.get(index) ?? []));
  }
  return undefined;
}

// Map of AX node id to the single context label a duplicated row needs. Rows
// with a name that occurs once are never annotated.
export function snapshotContexts(rows, byId) {
  if (rows.length < 2) return new Map();
  // A role and name pair is the identity a reader compares; `button "Save"` and
  // `link "Save"` never confuse each other, so they do not pay for context.
  const counts = new Map(), identityOf = rows.map(row => {
    const name = compact(row.name);
    if (!name || TEXT_ONLY_ROLES.has(row.role)) return undefined;
    const identity = `${normalize(row.role)}\u0000${normalize(name)}`;
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
    return identity;
  });
  // Reconstruct the printable tree so siblings follow document order even though
  // ignored and filtered nodes sit between them in the raw AX tree.
  const indexOf = new Map();
  rows.forEach((row, i) => { if (!indexOf.has(row.node.nodeId)) indexOf.set(row.node.nodeId, i); });
  const parentOf = new Array(rows.length).fill(-1), childrenOf = new Map();
  for (let i = 0; i < rows.length; i++) {
    let pointer = rows[i].node.parentId, parent = -1;
    while (pointer) { const found = indexOf.get(pointer); if (found !== undefined) { parent = found; break; } const node = byId.get(pointer); if (!node) break; pointer = node.parentId; }
    parentOf[i] = parent;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(i);
  }
  const contexts = new Map();
  for (let i = 0; i < rows.length; i++) {
    const identity = identityOf[i];
    if (!identity || counts.get(identity) < 2) continue;
    const targetKey = normalize(compact(rows[i].name));
    // Sibling labels first (BrowserSkill ranks `same` above `owned`), nearest
    // container first, stopping at the container that bounds the region.
    let label, child = i;
    for (let level = 0, parent = parentOf[i]; parent !== -1 && level < MAX_LEVELS; level++, child = parent, parent = parentOf[parent]) {
      // Nearest label first. The raw AX tree flattens role-less wrappers, so a
      // row's closest sibling is what actually names it: three buttons inside
      // three `div` cards arrive as three sibling `button "批准"` rows separated
      // by three sibling `StaticText` rows, and only the label just before a row
      // identifies it. Walking outward from the row, never accumulating from the
      // container start, is what keeps each of them apart.
      const siblings = childrenOf.get(parent) ?? [], end = siblings.indexOf(child);
      for (let offset = 1; offset <= MAX_PRECEDING_SIBLINGS && offset <= end; offset++) {
        label = subtreeLabel(rows, childrenOf, siblings[end - offset], targetKey);
        if (label) break;
      }
      if (label) break;
      // The node that bounds the region ends the walk, as in BrowserSkill.
      const role = normalize(rows[parent].role);
      if (['region','form','section','article','row','listitem','group'].includes(role)) break;
    }
    // Otherwise the innermost labelled ancestor.
    for (let ancestor = parentOf[i]; !label && ancestor !== -1; ancestor = parentOf[ancestor]) {
      if (CONTEXT_LABEL_ROLES.has(normalize(rows[ancestor].role))) label = cleanLabel(rows[ancestor].name, targetKey);
    }
    if (label) contexts.set(rows[i].node.nodeId, label);
  }
  return contexts;
}
