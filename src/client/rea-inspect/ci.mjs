function ci(e) {
  let t = (0, pi.c)(91),
    {
      isSurfaceOverflowing: r,
      isVisible: i,
      maxHeight: a,
      metadataGroups: s,
      onExpandedSizeChange: l,
      onScrollReviewStateChange: u,
      onToggle: d,
      scrollReviewState: f,
      tooltipPortalContainer: p,
      viewportRef: m,
      windowWidth: h
    } = e,
    g = ye(),
    _ = (0, mi.useId)(),
    v = n(),
    y = (0, mi.useRef)(null),
    b = (0, mi.useRef)(null),
    x = (0, mi.useRef)(null),
    S = (0, mi.useRef)(!1),
    C = a == null ? void 0 : Math.min(vi, Math.max(_i, a)),
    [w, T] = (0, mi.useState)(),
    [E, D] = (0, mi.useState)(!1),
    O;
  t[0] === Symbol.for(`react.memo_cache_sentinel`) ? (O = {
    isCollapsed: !1,
    toggleSource: null
  }, t[0] = O) : O = t[0];
  let [k, A] = (0, mi.useState)(O),
    {
      isCollapsed: j,
      toggleSource: M
    } = k,
    N = s.reduce(li, 0) >= 3,
    ee = N && (j || f === `complete` && !r && !E),
    te;
  t[1] !== j || t[2] !== l || t[3] !== C || t[4] !== m ? (te = () => {
    if (j) return;
    let e = y.current,
      t = b.current,
      n = m.current;
    if (e == null || t == null || n == null) return;
    let r,
      i = () => {
        D(C != null && n.scrollHeight > n.clientHeight + 1);
        let i = C == null ? t.offsetHeight : Math.min(t.offsetHeight, C);
        if (i > 0) {
          let t = {
            width: C == null ? Math.ceil(e.getBoundingClientRect().width) : e.offsetWidth,
            height: i + e.offsetHeight - e.clientHeight
          };
          (t.width !== r?.width || t.height !== r?.height) && (r = t, T(t.height), l?.(t));
        }
      };
    i();
    let a = new (t.ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver)(i);
    return a.observe(t), C != null && a.observe(n), () => a.disconnect();
  }, t[1] = j, t[2] = l, t[3] = C, t[4] = m, t[5] = te) : te = t[5];
  let ne;
  t[6] !== j || t[7] !== r || t[8] !== l || t[9] !== C || t[10] !== m || t[11] !== h ? (ne = [j, r, l, C, m, h], t[6] = j, t[7] = r, t[8] = l, t[9] = C, t[10] = m, t[11] = h, t[12] = ne) : ne = t[12], (0, mi.useLayoutEffect)(te, ne);
  let ie = (0, mi.useEffectEvent)(u),
    P;
  t[13] !== j || t[14] !== i || t[15] !== ie || t[16] !== f ? (P = () => {
    let e = b.current,
      t = x.current;
    if (i && !j && f !== `complete` && e != null && t != null) return ni(e, ie, t);
  }, t[13] = j, t[14] = i, t[15] = ie, t[16] = f, t[17] = P) : P = t[17];
  let ae;
  t[18] !== j || t[19] !== i || t[20] !== f ? (ae = [j, i, f], t[18] = j, t[19] = i, t[20] = f, t[21] = ae) : ae = t[21], (0, mi.useEffect)(P, ae);
  let oe;
  t[22] !== j || t[23] !== d || t[24] !== m ? (oe = (e, t) => {
    if (j === e) return !1;
    let n = m.current;
    return e && n != null && (n.scrollTop = 0), A({
      isCollapsed: e,
      toggleSource: t
    }), d(), !0;
  }, t[22] = j, t[23] = d, t[24] = m, t[25] = oe) : oe = t[25];
  let F = oe,
    se;
  t[26] !== ee || t[27] !== F ? (se = e => ee && F(e, `pointer`), t[26] = ee, t[27] = F, t[28] = se) : se = t[28];
  let I = (0, mi.useEffectEvent)(se),
    ce;
  t[29] !== N || t[30] !== I ? (ce = () => {
    let e = y.current;
    if (!N || e == null) return;
    let t = null,
      n = !1,
      r = new ai(),
      i = e => {
        if (!(e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX))) {
          if (!r.isContinuation(e)) {
            if (!I(e.deltaY < 0)) return;
            r.begin(e, gi);
          }
          e.preventDefault(), e.stopPropagation();
        }
      },
      a = e => {
        t = e.touches.length === 1 ? e.touches[0] ?? null : null, n = !1;
      },
      o = e => {
        let r = e.touches[0];
        if (t == null || e.touches.length !== 1 || r == null || r.identifier !== t.identifier) {
          t = null;
          return;
        }
        if (!n) {
          let e = r.clientX - t.clientX,
            i = r.clientY - t.clientY;
          if (Math.abs(i) < hi || Math.abs(i) <= Math.abs(e) || !I(i > 0)) return;
          n = !0, S.current = !0;
        }
        e.preventDefault(), e.stopPropagation();
      },
      s = () => {
        t = null;
      };
    return e.addEventListener(`wheel`, i, {
      passive: !1
    }), e.addEventListener(`touchstart`, a, {
      passive: !0
    }), e.addEventListener(`touchmove`, o, {
      passive: !1
    }), e.addEventListener(`touchend`, s), e.addEventListener(`touchcancel`, s), () => {
      e.removeEventListener(`wheel`, i), e.removeEventListener(`touchstart`, a), e.removeEventListener(`touchmove`, o), e.removeEventListener(`touchend`, s), e.removeEventListener(`touchcancel`, s);
    };
  }, t[29] = N, t[30] = I, t[31] = ce) : ce = t[31];
  let le;
  t[32] === N ? le = t[33] : (le = [N], t[32] = N, t[33] = le), (0, mi.useEffect)(ce, le);
  let L = ee && `touch-pan-x touch-pinch-zoom`,
    R;
  t[34] === L ? R = t[35] : (R = G(`relative overflow-clip bg-surface-secondary select-none`, L), t[34] = L, t[35] = R);
  let ue;
  t[36] !== w || t[37] !== j || t[38] !== M ? (ue = M == null ? {} : {
    height: j ? 50 : w ?? `auto`
  }, t[36] = w, t[37] = j, t[38] = M, t[39] = ue) : ue = t[39];
  let de, pe;
  t[40] === Symbol.for(`react.memo_cache_sentinel`) ? (de = e => {
    S.current && e.detail > 0 && (S.current = !1, e.preventDefault(), e.stopPropagation());
  }, pe = () => {
    S.current = !1;
  }, t[40] = de, t[41] = pe) : (de = t[40], pe = t[41]);
  let me = M == null ? `auto` : w ?? `auto`,
    he;
  t[42] === me ? he = t[43] : (he = {
    height: me
  }, t[42] = me, t[43] = he);
  let ge;
  t[44] !== v || t[45] !== M ? (ge = v || M !== `pointer` ? {
    duration: 0
  } : H, t[44] = v, t[45] = M, t[46] = ge) : ge = t[46];
  let z;
  t[47] !== j || t[48] !== M || t[49] !== C ? (z = G(C == null ? `contents` : [M != null && `h-full`, j ? `overflow-hidden` : `overflow-y-auto`]), t[47] = j, t[48] = M, t[49] = C, t[50] = z) : z = t[50];
  let _e;
  t[51] === g ? _e = t[52] : (_e = g.formatMessage({
    id: `annotationCommentEditor.metadata.label`,
    defaultMessage: `Annotation metadata`,
    description: `Accessible label for the read-only metadata included with the selected browser element's annotation`
  }), t[51] = g, t[52] = _e);
  let ve;
  t[53] === C ? ve = t[54] : (ve = C == null ? void 0 : {
    maxHeight: C
  }, t[53] = C, t[54] = ve);
  let B;
  t[55] === Symbol.for(`react.memo_cache_sentinel`) ? (B = (0, Z.jsx)(W, {
    id: `annotationCommentEditor.metadata.sourceTooltip`,
    defaultMessage: `This metadata is provided by the webpage and included with your annotation`,
    description: `Tooltip on the tag icon explaining where an annotation's extra metadata comes from and that it is included when the annotation is submitted`
  }), t[55] = B) : B = t[55];
  let be;
  t[56] === g ? be = t[57] : (be = g.formatMessage({
    id: `annotationCommentEditor.metadata.sourceLabel`,
    defaultMessage: `About annotation metadata`,
    description: `Accessible label for the tag icon that shows a tooltip about the source of an annotation's metadata`
  }), t[56] = g, t[57] = be);
  let Se;
  t[58] === Symbol.for(`react.memo_cache_sentinel`) ? (Se = (0, Z.jsx)(xe, {}), t[58] = Se) : Se = t[58];
  let Ce;
  t[59] === be ? Ce = t[60] : (Ce = (0, Z.jsx)(c, {
    className: `relative z-10 mt-0.5 shrink-0`,
    "aria-label": be,
    color: `ghostTertiary`,
    size: `inline`,
    children: Se
  }), t[59] = be, t[60] = Ce);
  let we;
  t[61] !== Ce || t[62] !== p ? (we = (0, Z.jsx)(o, {
    align: `start`,
    cloneCustomTrigger: !0,
    portalContainer: p,
    side: `top`,
    tooltipContent: B,
    children: Ce
  }), t[61] = Ce, t[62] = p, t[63] = we) : we = t[63];
  let Te;
  t[64] !== s || t[65] !== _ ? (Te = (0, Z.jsx)(ui, {
    id: _,
    ref: x,
    metadataGroups: s
  }), t[64] = s, t[65] = _, t[66] = Te) : Te = t[66];
  let Ee;
  t[67] !== N || t[68] !== j || t[69] !== _ || t[70] !== f || t[71] !== F ? (Ee = N ? (0, Z.jsxs)(c, {
    className: G(`text-xs`, j ? `absolute inset-0` : `mt-3`),
    "aria-controls": _,
    "aria-expanded": !j,
    "data-browser-sidebar-design-drag-handle": j ? `` : void 0,
    color: `ghostTertiary`,
    disabled: !j && f !== `complete`,
    focusRing: j ? `inset` : `default`,
    size: `inline`,
    onClick: e => {
      F(!j, e.detail === 0 ? `keyboard` : `pointer`);
    },
    children: [(0, Z.jsx)(`span`, {
      className: j ? `sr-only` : void 0,
      children: j ? (0, Z.jsx)(W, {
        id: `annotationCommentEditor.metadata.showMore`,
        defaultMessage: `Show more`,
        description: `Button label for expanding the annotation metadata list to show all fields`
      }) : (0, Z.jsx)(W, {
        id: `annotationCommentEditor.metadata.showLess`,
        defaultMessage: `Show less`,
        description: `Button label for collapsing the annotation metadata list to a compact preview`
      })
    }), j ? null : (0, Z.jsx)(re, {
      className: `rotate-180`
    })]
  }) : null, t[67] = N, t[68] = j, t[69] = _, t[70] = f, t[71] = F, t[72] = Ee) : Ee = t[72];
  let De;
  t[73] !== Te || t[74] !== Ee ? (De = (0, Z.jsxs)(`div`, {
    className: `flex min-w-0 flex-1 flex-col items-start`,
    children: [Te, Ee]
  }), t[73] = Te, t[74] = Ee, t[75] = De) : De = t[75];
  let V;
  t[76] !== we || t[77] !== De ? (V = (0, Z.jsxs)(`div`, {
    ref: b,
    className: `relative flex items-start gap-3 px-4 py-2.5`,
    children: [we, De]
  }), t[76] = we, t[77] = De, t[78] = V) : V = t[78];
  let Oe;
  t[79] !== z || t[80] !== _e || t[81] !== ve || t[82] !== V || t[83] !== m ? (Oe = (0, Z.jsx)(`div`, {
    ref: m,
    className: z,
    role: `region`,
    "aria-label": _e,
    style: ve,
    children: V
  }), t[79] = z, t[80] = _e, t[81] = ve, t[82] = V, t[83] = m, t[84] = Oe) : Oe = t[84];
  let ke;
  return t[85] !== R || t[86] !== ue || t[87] !== he || t[88] !== ge || t[89] !== Oe ? (ke = (0, Z.jsx)(fe.section, {
    ref: y,
    className: R,
    animate: ue,
    "data-browser-comment-metadata": !0,
    initial: !1,
    onClickCapture: de,
    onPointerDownCapture: pe,
    style: he,
    transition: ge,
    children: Oe
  }), t[85] = R, t[86] = ue, t[87] = he, t[88] = ge, t[89] = Oe, t[90] = ke) : ke = t[90], ke;
}
