function Qi(e) {
  let t = (0, ba.c)(34),
    {
      session: n,
      showAdjustEntry: r,
      windowHeight: i,
      onMounted: a
    } = e,
    o = ye(),
    s = aa(n),
    c = r ? n.designChange : null,
    l = c != null,
    u = s.length > 0 ? s : l ? o.formatMessage({
      id: `browserSidebarCommentOverlay.previewTweaksCount`,
      defaultMessage: `{count, plural, one {# adjustment} other {# adjustments}}`,
      description: `Fallback preview text for a browser sidebar annotation that only includes design adjustments`
    }, {
      count: ca(c)
    }) : ``,
    d = /\r?\n/.test(u),
    f = (0, Q.useRef)(null),
    p = (0, Q.useRef)(null),
    m;
  t[0] !== a || t[1] !== n.sessionId ? (m = () => {
    let e = f.current;
    if (e == null) return;
    let t = e.getBoundingClientRect(),
      r = {
        width: Math.ceil(t.width),
        height: Math.ceil(t.height)
      },
      i = p.current;
    (i?.width !== r.width || i?.height !== r.height) && (p.current = r, a(n.sessionId, r));
  }, t[0] = a, t[1] = n.sessionId, t[2] = m) : m = t[2], (0, Q.useLayoutEffect)(m, [a, u, n.sessionId, l, i]);
  let h = It,
    g;
  t[3] === n.previewAlignment ? g = t[4] : (g = G(`flex h-full w-full`, ua(n.previewAlignment)), t[3] = n.previewAlignment, t[4] = g);
  let _ = d ? `items-start py-2` : `items-center`,
    v;
  t[5] === _ ? v = t[6] : (v = G(Ea, _), t[5] = _, t[6] = v);
  let y;
  t[7] === i ? y = t[8] : (y = {
    height: i
  }, t[7] = i, t[8] = y);
  let b = d ? `items-start` : `items-center`,
    x;
  t[9] === b ? x = t[10] : (x = G(`flex min-w-0 gap-2`, b), t[9] = b, t[10] = x);
  let S;
  t[11] === l ? S = t[12] : (S = l ? (0, $.jsx)(`span`, {
    "aria-hidden": `true`,
    "data-testid": `annotation-comment-preview-tweak-icon`,
    className: `flex shrink-0 items-center justify-center pt-0.5 text-codex-description`,
    children: (0, $.jsx)(Ht, {
      className: `icon-sm`
    })
  }) : null, t[11] = l, t[12] = S);
  let C = d ? `overflow-hidden whitespace-pre-wrap break-words` : `overflow-hidden text-ellipsis whitespace-nowrap`,
    w;
  t[13] === C ? w = t[14] : (w = G(Da, C), t[13] = C, t[14] = w);
  let T;
  t[15] === Symbol.for(`react.memo_cache_sentinel`) ? (T = {
    fontSize: `var(--codex-chat-font-size)`
  }, t[15] = T) : T = t[15];
  let E = s.length > 0 ? la(s) : u,
    D;
  t[16] !== w || t[17] !== T || t[18] !== E ? (D = (0, $.jsx)(`div`, {
    className: w,
    style: T,
    children: E
  }), t[16] = w, t[17] = T, t[18] = E, t[19] = D) : D = t[19];
  let O;
  t[20] !== S || t[21] !== D || t[22] !== x ? (O = (0, $.jsxs)(`div`, {
    className: x,
    children: [S, D]
  }), t[20] = S, t[21] = D, t[22] = x, t[23] = O) : O = t[23];
  let k;
  t[24] !== O || t[25] !== v || t[26] !== y ? (k = (0, $.jsx)(`div`, {
    ref: f,
    className: v,
    style: y,
    children: O
  }), t[24] = O, t[25] = v, t[26] = y, t[27] = k) : k = t[27];
  let A;
  t[28] !== k || t[29] !== g ? (A = (0, $.jsx)(`div`, {
    className: g,
    children: k
  }), t[28] = k, t[29] = g, t[30] = A) : A = t[30];
  let j;
  return t[31] !== A || t[32] !== h ? (j = (0, $.jsx)(`div`, {
    className: `pointer-events-none flex h-full w-full overflow-visible bg-transparent text-default`,
    style: h,
    children: A
  }), t[31] = A, t[32] = h, t[33] = j) : j = t[33], j;
}
