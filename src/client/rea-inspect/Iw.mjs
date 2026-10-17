function Iw(e) {
  let t = (0, Hw.c)(21),
    {
      conversationId: n,
      nativeSurfaceHeight: r
    } = e,
    i = he(q),
    a = S(kl),
    o = S(Zt),
    s = S(Lc),
    c = S(Nf),
    l;
  t[0] === Symbol.for(`react.memo_cache_sentinel`) ? (l = new Map(), t[0] = l) : l = t[0];
  let u = (0, Uw.useRef)(l),
    d;
  t[1] === Symbol.for(`react.memo_cache_sentinel`) ? (d = new Map(), t[1] = d) : d = t[1];
  let f = (0, Uw.useRef)(d),
    p;
  t[2] === Symbol.for(`react.memo_cache_sentinel`) ? (p = [], t[2] = p) : p = t[2];
  let [m, h] = (0, Uw.useState)(p),
    g;
  t[3] === Symbol.for(`react.memo_cache_sentinel`) ? (g = [], t[3] = g) : g = t[3];
  let [_, v] = (0, Uw.useState)(g),
    y;
  t[4] === Symbol.for(`react.memo_cache_sentinel`) ? (y = [], t[4] = y) : y = t[4];
  let [b, x] = (0, Uw.useState)(y),
    [C, w] = Hi(),
    T,
    E;
  t[5] === n ? (T = t[6], E = t[7]) : (T = () => {
    let e = Di.remoteHostedPIP;
    if (e == null) return;
    let t = f.current,
      r = u.current,
      i = jw(n, i => {
        if (i.type === `remote-hosted-pip-video-error`) {
          x(e => e.includes(i.presentationID) ? e : [...e, i.presentationID]), e.setNativeVideoReady(n, !1);
          let {
            presentationID: r
          } = i;
          t.get(r)?.close(), t.delete(r), h(e => e.filter(e => e !== r)), v(e => e.filter(e => e !== r));
          return;
        }
        let {
            frame: a,
            presentationID: o
          } = i,
          s = r.get(o);
        if (s != null) {
          Vw(s, a);
          return;
        }
        t.get(o)?.close(), t.set(o, a), h(e => e.includes(o) ? e : [...e, o]);
      });
    return e.startNativeVideo(n), () => {
      i();
      for (let e of t.values()) e.close();
      t.clear();
      for (let e of r.values()) zw(e);
      r.clear(), e.stopNativeVideo(n);
    };
  }, E = [n], t[5] = n, t[6] = T, t[7] = E), (0, Uw.useEffect)(T, E);
  let D = c?.activeThreadID === n ? c.orderedPresentationIDs : null,
    O = D?.slice(0, qw),
    k = c?.isMovingToAnchor !== !0 && O != null && O.length > 0 && O.every(e => _.includes(e)),
    A = c?.isMovingToAnchor === !0 && c.placement === `pinned`;
  (0, Uw.useEffect)(() => {
    if (!k && !A) return;
    let e = requestAnimationFrame(() => {
      e = requestAnimationFrame(() => {
        Di.remoteHostedPIP?.setNativeVideoReady(n, k);
      });
    });
    return () => cancelAnimationFrame(e);
  }, [n, A, k]);
  let j = (D ?? m).slice(0, qw),
    M = w == null ? null : Math.min(400, Math.max(1, w * s - Math.max(0, j.length - 1) * Gw)) / s,
    N = !k && !O?.some(e => a.includes(e)),
    P;
  k || (P = N && !c?.isMovingToAnchor ? 0 : r);
  let F = (c?.isMovingToAnchor || N || O?.some(e => b.includes(e))) && `invisible`,
    I;
  t[8] === F ? I = t[9] : (I = Go(`relative grid grid-cols-1 grid-rows-1`, F), t[8] = F, t[9] = I);
  let L;
  t[10] === P ? L = t[11] : (L = {
    height: P
  }, t[10] = P, t[11] = L);
  let R;
  t[12] !== M || t[13] !== w ? (R = w == null || M == null ? null : (0, Ww.jsx)(`div`, {
    "aria-hidden": !0,
    className: `pointer-events-none visible absolute inset-y-0`,
    "data-pip-home-surface": `thread-summary-panel-pip`,
    style: {
      insetInline: (w - M) / 2
    }
  }), t[12] = M, t[13] = w, t[14] = R) : R = t[14];
  let z = w == null || M == null ? null : m.filter(e => j.includes(e)).map(e => {
      let t = j.indexOf(e);
      return (0, Ww.jsx)(Bw, {
        index: t,
        isEntering: a.includes(e),
        isReady: _.includes(e),
        nativeLayout: {
          maxDisplaySize: w,
          stackWidth: (c?.stackDisplayWidth ?? 0) / s
        },
        presentationCount: j.length,
        presentationID: e,
        shouldUseReducedMotion: o,
        onEntranceComplete: () => {
          i.set(kl, t => t.filter(t => t !== e));
        },
        onClick: () => {
          Di.remoteHostedPIP?.interactWithPresentation(n, e, t === 0);
        },
        children: (0, Ww.jsx)(Lw, {
          maxDisplaySize: M,
          pendingFrames: f,
          presentationID: e,
          shouldUseReducedMotion: o,
          videoStreams: u,
          onError: () => {
            x(t => t.includes(e) ? t : [...t, e]), Di.remoteHostedPIP?.setNativeVideoReady(n, !1);
          },
          onLoadedData: () => {
            x(t => t.includes(e) ? t.filter(t => t !== e) : t), v(t => t.includes(e) ? t : [...t, e]);
          }
        })
      }, e);
    }),
    B;
  return t[15] !== C || t[16] !== L || t[17] !== R || t[18] !== z || t[19] !== I ? (B = (0, Ww.jsxs)(`div`, {
    ref: C,
    className: I,
    style: L,
    children: [R, z]
  }), t[15] = C, t[16] = L, t[17] = R, t[18] = z, t[19] = I, t[20] = B) : B = t[20], B;
}
