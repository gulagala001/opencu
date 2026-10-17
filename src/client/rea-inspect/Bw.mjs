function Bw(e) {
  let t = (0, Hw.c)(47),
    {
      children: n,
      index: r,
      isEntering: i,
      isReady: a,
      nativeLayout: o,
      presentationCount: s,
      presentationID: c,
      shouldUseReducedMotion: l,
      onEntranceComplete: u,
      onClick: d
    } = e,
    f = i !== void 0 && i,
    p = a === void 0 || a,
    m = S(Lc),
    h = s - 1,
    g = o == null ? 1 : m,
    _ = o == null ? (h / 2 - r) * Gw : (o.stackWidth - o.maxDisplaySize) / 2 - r * Gw / g,
    v = r * Kw / g,
    y,
    b,
    x;
  if (t[0] !== n || t[1] !== _ || t[2] !== r || t[3] !== f || t[4] !== p || t[5] !== o || t[6] !== d || t[7] !== u || t[8] !== s || t[9] !== c || t[10] !== l || t[11] !== h || t[12] !== v) {
    x = Symbol.for(`react.early_return_sentinel`);
    bb0: {
      y = Go(`col-start-1 row-start-1 self-start`, o == null ? `max-h-full w-full max-w-full justify-self-center overflow-hidden rounded-md bg-surface-elevated-secondary electron:elevation-prominent` : `w-fit origin-top-right justify-self-end`);
      let e = o == null ? `calc(100% - ${h * Gw}px)` : void 0,
        i = s - r,
        a;
      if (t[16] !== e || t[17] !== i || t[18] !== v ? (a = {
        marginTop: v,
        maxWidth: e,
        zIndex: i
      }, t[16] = e, t[17] = i, t[18] = v, t[19] = a) : a = t[19], b = a, d != null) {
        let e = f && !p ? .72 : 1,
          r = +!!p,
          i = f && !p ? `blur(18px)` : `blur(0px)`,
          a;
        t[20] !== _ || t[21] !== e || t[22] !== r || t[23] !== i || t[24] !== v ? (a = {
          x: _,
          marginTop: v,
          scale: e,
          opacity: r,
          filter: i
        }, t[20] = _, t[21] = e, t[22] = r, t[23] = i, t[24] = v, t[25] = a) : a = t[25];
        let o = f ? .72 : 1,
          s = +!!p,
          m = f ? `blur(18px)` : `blur(0px)`,
          h;
        t[26] !== _ || t[27] !== o || t[28] !== s || t[29] !== m || t[30] !== v ? (h = {
          x: _,
          marginTop: v,
          scale: o,
          opacity: s,
          filter: m
        }, t[26] = _, t[27] = o, t[28] = s, t[29] = m, t[30] = v, t[31] = h) : h = t[31];
        let g;
        t[32] !== f || t[33] !== l ? (g = l ? {
          duration: 0
        } : {
          ...Ga,
          scale: {
            type: `spring`,
            mass: 1,
            stiffness: 185,
            damping: 18
          },
          opacity: {
            duration: f ? .2 : 0,
            ease: `easeOut`
          },
          filter: {
            duration: f ? .28 : 0,
            ease: `easeOut`
          }
        }, t[32] = f, t[33] = l, t[34] = g) : g = t[34];
        let S;
        t[35] !== f || t[36] !== p || t[37] !== u ? (S = () => {
          f && p && u?.();
        }, t[35] = f, t[36] = p, t[37] = u, t[38] = S) : S = t[38], x = (0, Ww.jsx)(Or.button, {
          animate: a,
          className: Go(y, `group/pip cursor-interaction border-0 bg-transparent p-0 text-start focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring`),
          "data-pip-presentation-frame": c,
          initial: h,
          style: b,
          transition: g,
          type: `button`,
          onAnimationComplete: S,
          onClick: d,
          children: n
        });
        break bb0;
      }
    }
    t[0] = n, t[1] = _, t[2] = r, t[3] = f, t[4] = p, t[5] = o, t[6] = d, t[7] = u, t[8] = s, t[9] = c, t[10] = l, t[11] = h, t[12] = v, t[13] = y, t[14] = b, t[15] = x;
  } else y = t[13], b = t[14], x = t[15];
  if (x !== Symbol.for(`react.early_return_sentinel`)) return x;
  let C = `translateX(${_}px)`,
    w;
  t[39] !== b || t[40] !== C ? (w = {
    ...b,
    transform: C
  }, t[39] = b, t[40] = C, t[41] = w) : w = t[41];
  let T;
  return t[42] !== n || t[43] !== y || t[44] !== c || t[45] !== w ? (T = (0, Ww.jsx)(`div`, {
    className: y,
    "data-pip-presentation-frame": c,
    style: w,
    children: n
  }), t[42] = n, t[43] = y, t[44] = c, t[45] = w, t[46] = T) : T = t[46], T;
}
