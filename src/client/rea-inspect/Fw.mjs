function Fw(e) {
  let t = (0, Hw.c)(17),
    {
      browserFrames: n,
      nativeConversationId: r,
      nativeSurfaceHeight: i
    } = e,
    a = Ai(),
    o = S(Nf),
    s = r != null && o?.activeThreadID === r && o.placement === `pinned` && o.isMovingToAnchor;
  if (n.length === 0 && i == null) return null;
  let c = n.length === 0 && r == null,
    l = s ? `hidden` : `grid`,
    u;
  t[0] === l ? u = t[1] : (u = Go(`pointer-events-auto relative mb-2 shrink-0 grid-cols-1 grid-rows-1`, l), t[0] = l, t[1] = u);
  let d = r == null ? `thread-summary-panel-pip` : void 0,
    f;
  t[2] !== r || t[3] !== i ? (f = r == null || i == null ? null : (0, Ww.jsx)(Iw, {
    conversationId: r,
    nativeSurfaceHeight: i
  }, r), t[2] = r, t[3] = i, t[4] = f) : f = t[4];
  let p;
  if (t[5] !== n || t[6] !== a) {
    let e;
    t[8] !== n.length || t[9] !== a ? (e = (e, t) => (0, Ww.jsx)(Bw, {
      index: t,
      nativeLayout: null,
      presentationCount: n.length,
      presentationID: e.presentationID,
      children: (0, Ww.jsx)(`img`, {
        alt: a.formatMessage({
          id: `codex.remoteHostedPip.browserUsePreview`,
          defaultMessage: `Browser Use preview`,
          description: `Accessible label for a Browser Use screenshot shown in the Picture in Picture surface`
        }),
        className: `block h-auto max-h-full w-full object-contain select-none`,
        draggable: !1,
        src: e.imageDataURL
      })
    }, e.presentationID), t[8] = n.length, t[9] = a, t[10] = e) : e = t[10], p = n.map(e), t[5] = n, t[6] = a, t[7] = p;
  } else p = t[7];
  let m;
  return t[11] !== c || t[12] !== u || t[13] !== d || t[14] !== f || t[15] !== p ? (m = (0, Ww.jsxs)(`div`, {
    "aria-hidden": c,
    className: u,
    "data-pip-home-surface": d,
    children: [f, p]
  }), t[11] = c, t[12] = u, t[13] = d, t[14] = f, t[15] = p, t[16] = m) : m = t[16], m;
}
