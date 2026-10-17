function ta(e) {
  let t = e.target,
    n = e.currentTarget.ownerDocument.defaultView;
  return e.defaultPrevented || n == null || !(t instanceof n.Element) || !e.currentTarget.contains(t) || e.pointerType === `touch` && t.closest(`[data-browser-comment-metadata], [data-browser-sidebar-design-scroll-container], [data-browser-comment-annotation-selections], [data-browser-comment-editor-attachment-row]`) != null || t.closest([`a`, `button:not([data-browser-sidebar-design-drag-handle])`, `input`, `select`, `textarea`, `[contenteditable='true']`, `[data-browser-comment-annotation-selection]`, `[data-browser-sidebar-design-no-drag]`, `[role='button']`, `[role='combobox']`, `[role='menuitem']`].join(`,`)) != null ? null : t.closest(`button[data-browser-sidebar-design-drag-handle]`) ?? e.currentTarget;
}
