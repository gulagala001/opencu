function rc(e) {
  let t = (0, ac.c)(36),
    {
      browserTabId: n,
      captureScreenshotLabel: r,
      conversationId: i,
      toolbarRef: a,
      floating: o,
      displayUrl: s,
      hasPendingAnnotations: c,
      hasQueuedTweaks: l,
      isAddModifierPressed: u,
      isOriginalViewEnabled: d,
      isScreenshotCaptureEnabled: f,
      isSuspended: p,
      onAddToComposer: m,
      onDiscard: h,
      onExit: g,
      onOriginalViewBlur: _,
      onOriginalViewKeyDown: v,
      onOriginalViewKeyUp: y,
      onOriginalViewPointerCancel: b,
      onOriginalViewPointerDown: x,
      onOriginalViewPointerUp: S,
      onSubmit: w,
      pendingAnnotationCount: T
    } = e,
    ee = f === void 0 || f,
    D = C(E),
    O = pt(Be.annotationMarkersVisible),
    k;
  t[0] === i ? k = t[1] : (k = e => ai(i, e), t[0] = i, t[1] = k);
  let A = k,
    j;
  t[2] === i ? j = t[3] : (j = () => si(i), t[2] = i, t[3] = j);
  let M = (0, oc.useSyncExternalStore)(A, j, ic),
    N;
  t[4] !== O || t[5] !== D ? (N = () => {
    Kt(D, Be.annotationMarkersVisible, !O);
  }, t[4] = O, t[5] = D, t[6] = N) : N = t[6];
  let P;
  t[7] !== n || t[8] !== r || t[9] !== i || t[10] !== ee ? (P = ee ? (0, sc.jsx)($s, {
    browserTabId: n,
    captureScreenshotLabel: r,
    conversationId: i,
    hasBrowserPage: !0,
    isCommentMode: !1
  }) : null, t[7] = n, t[8] = r, t[9] = i, t[10] = ee, t[11] = P) : P = t[11];
  let F;
  return t[12] !== s || t[13] !== o || t[14] !== c || t[15] !== l || t[16] !== u || t[17] !== d || t[18] !== M || t[19] !== p || t[20] !== O || t[21] !== m || t[22] !== h || t[23] !== g || t[24] !== _ || t[25] !== v || t[26] !== y || t[27] !== b || t[28] !== x || t[29] !== S || t[30] !== w || t[31] !== T || t[32] !== N || t[33] !== P || t[34] !== a ? (F = (0, sc.jsx)(Ii, {
    toolbarRef: a,
    floating: o,
    displayUrl: s,
    hasPendingAnnotations: c,
    hasQueuedTweaks: l,
    isAddModifierPressed: u,
    isOriginalViewEnabled: d,
    isSuspended: p,
    isSubmitAvailable: M,
    markersVisible: O,
    onAddToComposer: m,
    onDiscard: h,
    onExit: g,
    onOriginalViewBlur: _,
    onOriginalViewKeyDown: v,
    onOriginalViewKeyUp: y,
    onOriginalViewPointerCancel: b,
    onOriginalViewPointerDown: x,
    onOriginalViewPointerUp: S,
    onSubmit: w,
    onToggleMarkers: N,
    pendingAnnotationCount: T,
    screenshotButton: P
  }), t[12] = s, t[13] = o, t[14] = c, t[15] = l, t[16] = u, t[17] = d, t[18] = M, t[19] = p, t[20] = O, t[21] = m, t[22] = h, t[23] = g, t[24] = _, t[25] = v, t[26] = y, t[27] = b, t[28] = x, t[29] = S, t[30] = w, t[31] = T, t[32] = N, t[33] = P, t[34] = a, t[35] = F) : F = t[35], F;
}
