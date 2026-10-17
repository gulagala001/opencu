function Oo(e) {
  let t = (0, ko.c)(18),
    {
      floating: n,
      activeHoverSuppressed: r,
      direction: i,
      disabled: a,
      disabledTooltipContent: o,
      onActiveHoverSuppressedChange: s,
      onInteractionModeChange: c,
      annotationTarget: l,
      interactionMode: u,
      shortcutLabel: d,
      shouldShowCoachmark: f
    } = e,
    p = n !== void 0 && n,
    h = Xe(),
    g = m(Da),
    _ = u === oi.COMMENT,
    v;
  t[0] !== i || t[1] !== h ? (v = i ?? Xt(h.locale), t[0] = i, t[1] = h, t[2] = v) : v = t[2];
  let y;
  t[3] !== _ || t[4] !== c ? (y = e => c(_ ? oi.BROWSE : oi.COMMENT, e), t[3] = _, t[4] = c, t[5] = y) : y = t[5];
  let b = f && !a && g,
    x;
  return t[6] !== r || t[7] !== l || t[8] !== a || t[9] !== o || t[10] !== p || t[11] !== _ || t[12] !== s || t[13] !== d || t[14] !== v || t[15] !== y || t[16] !== b ? (x = (0, Ao.jsx)(Fi, {
    floating: p,
    activeHoverSuppressed: r,
    direction: v,
    disabled: a,
    disabledTooltipContent: o,
    isCommentMode: _,
    onActiveHoverSuppressedChange: s,
    annotationTarget: l,
    onDismissCoachmark: Oa,
    onToggle: y,
    shortcutLabel: d,
    showCoachmark: b
  }), t[6] = r, t[7] = l, t[8] = a, t[9] = o, t[10] = p, t[11] = _, t[12] = s, t[13] = d, t[14] = v, t[15] = y, t[16] = b, t[17] = x) : x = t[17], x;
}
