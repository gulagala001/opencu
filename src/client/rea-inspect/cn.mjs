function cn(e) {
  let t = (0, dn.c)(10),
    {
      anchors: n,
      onSelectionHoverChange: r,
      onRemove: i
    } = e,
    a = ye(),
    o;
  t[0] === a ? o = t[1] : (o = a.formatMessage({
    id: `browserSidebarCommentOverlay.selectedItems`,
    defaultMessage: `Selected items`,
    description: `Accessible label for the elements and areas included in a browser annotation`
  }), t[0] = a, t[1] = o);
  let s;
  t[2] !== n || t[3] !== a || t[4] !== i || t[5] !== r ? (s = n.map((e, t) => {
    let o = e.kind === `element` ? P(e.role, e.elementPath) : null,
      s = e.kind === `region` ? a.formatMessage({
        id: `browserSidebarCommentOverlay.selectedAreaLabel`,
        defaultMessage: `Area {number}`,
        description: `Short label for a selected rectangular page area in a browser annotation`
      }, {
        number: n.slice(0, t + 1).filter(un).length
      }) : e.immediateText?.trim() || e.title;
    return (0, fn.jsxs)(`span`, {
      className: G(on.selectionChip, `composer-attachment-surface flex h-6 min-w-0 shrink-0 items-center gap-1 rounded-lg border py-0.5 pe-0.5 text-xs text-default select-none`, n.length > 1 ? `max-w-[calc(100%_-_3rem)]` : `max-w-full`, e.kind === `region` || o != null ? `ps-0.5` : `ps-1`),
      "data-browser-comment-annotation-selection": !0,
      role: `listitem`,
      title: s,
      onMouseEnter: () => {
        r?.(t);
      },
      onMouseLeave: () => {
        r?.(null);
      },
      children: [e.kind === `region` ? (0, fn.jsx)(`span`, {
        className: G(on.regionSelectionLabel, `min-w-0 truncate rounded-md border border-dotted px-1.5 py-px text-[11px] leading-[14px] font-medium text-secondary`),
        children: s
      }) : o == null ? null : (0, fn.jsx)(`span`, {
        className: `inline-flex shrink-0 items-center rounded-md border border-default bg-text/5 px-1.5 py-px font-mono text-[11px] leading-[14px] font-medium text-secondary`,
        children: o
      }), e.kind === `region` || s === o ? null : (0, fn.jsx)(`span`, {
        className: `min-w-0 truncate text-secondary`,
        children: s
      }), i == null ? null : (0, fn.jsx)(`button`, {
        "aria-label": a.formatMessage({
          id: `browserSidebarCommentOverlay.removeAnnotationSelection`,
          defaultMessage: `Remove {label} from annotation`,
          description: `Accessible label for removing an element or area from a browser annotation`
        }, {
          label: s
        }),
        className: `flex size-5 shrink-0 cursor-interaction items-center justify-center rounded-md text-tertiary outline-none hover:bg-primary-ghost-hover hover:text-default focus-visible:ring-2 focus-visible:ring-ring`,
        type: `button`,
        onMouseDown: ln,
        onClick: () => {
          i(t);
        },
        children: (0, fn.jsx)(R, {
          "aria-hidden": !0,
          className: `icon-2xs`
        })
      })]
    }, `${e.kind}:${e.selector ?? e.elementPath}:${e.rect.x}:${e.rect.y}:${t}`);
  }), t[2] = n, t[3] = a, t[4] = i, t[5] = r, t[6] = s) : s = t[6];
  let c;
  return t[7] !== o || t[8] !== s ? (c = (0, fn.jsx)(`div`, {
    "aria-label": o,
    className: `horizontal-scroll-fade-mask hide-scrollbar flex min-w-0 flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain pe-1 pb-1 [--edge-fade-distance:2rem]`,
    "data-browser-comment-annotation-selections": !0,
    role: `list`,
    style: pn,
    children: s
  }), t[7] = o, t[8] = s, t[9] = c) : c = t[9], c;
}
