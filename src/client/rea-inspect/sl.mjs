function sl(e) {
  let n = (0, kl.c)(867),
    {
      autoFocusOnOpen: r,
      conversationId: s,
      browserTabId: c,
      cwd: l,
      isExiting: u,
      isVisible: d,
      isAnnotationModeEnabled: p,
      isDeviceToolbarEnabled: h,
      isScreenshotCaptureEnabled: g,
      isFloatingComposerToggleVisible: _,
      isFloatingComposerVisible: v,
      onToggleFloatingComposer: y,
      panelTarget: b,
      renderSlots: S
    } = e,
    w = r !== void 0 && r,
    T = u !== void 0 && u,
    ee = p === void 0 || p,
    E = h === void 0 || h,
    D = g === void 0 || g,
    O = _ !== void 0 && _,
    k = v === void 0 || v,
    A = y === void 0 ? Sl : y,
    j = b === void 0 ? `right` : b,
    N = C(pe),
    P = m(Cr) && ee,
    te = _e(ke, `is_default_browser`) === !0,
    L = pt(Be.showFullUrl),
    R = pt(Be.annotationMarkersVisible),
    z = m(Sn),
    re;
  n[0] !== s || n[1] !== N.value ? (re = Pt(N.value) ?? s, n[0] = s, n[1] = N.value, n[2] = re) : re = n[2];
  let ie = re,
    ae;
  n[3] === s ? ae = n[4] : (ae = Mt(s), n[3] = s, n[4] = ae);
  let oe;
  n[5] !== z.id || n[6] !== ae ? (oe = {
    conversationId: ae,
    hostId: z.id
  }, n[5] = z.id, n[6] = ae, n[7] = oe) : oe = n[7];
  let se = _e(gn, oe),
    ce = m(ni) === `available`,
    B = Xe(),
    {
      comments: le,
      setComments: V
    } = Ei(ie),
    de = o(),
    {
      leftPanelAnimatedWidth: H,
      rightPanelLayoutTick: me
    } = jn(),
    he = m(er),
    ge = (0, Q.useRef)(null),
    [ve, xe] = (0, Q.useState)(null),
    Se;
  n[8] === Symbol.for(`react.memo_cache_sentinel`) ? (Se = e => {
    ge.current = e, xe(e);
  }, n[8] = Se) : Se = n[8];
  let Ce = Se,
    U = (0, Q.useRef)(null),
    we = (0, Q.useRef)(null),
    Te = (0, Q.useRef)(null),
    Ee = (0, Q.useRef)(null),
    De = (0, Q.useRef)(null),
    Oe = (0, Q.useRef)(!1),
    Ae = (0, Q.useRef)(null),
    je = (0, Q.useRef)(null),
    Me = (0, Q.useRef)(null),
    Ne = (0, Q.useRef)(null),
    Pe = (0, Q.useRef)(null),
    Fe = (0, Q.useRef)(null),
    Ie = (0, Q.useRef)(null),
    Re = (0, Q.useRef)(!1),
    ze = (0, Q.useRef)(!1),
    Ve = (0, Q.useRef)(!1),
    He = (0, Q.useRef)(!1),
    Ge = (0, Q.useRef)(!1),
    Ke = (0, Q.useRef)(d),
    Ye = (0, Q.useRef)(!1),
    Ze = (0, Q.useRef)(!1),
    Qe = (0, Q.useRef)(!1),
    $e = (0, Q.useRef)(oi.BROWSE),
    et;
  n[9] !== c || n[10] !== s ? (et = {
    browserTabId: c,
    conversationId: s,
    url: ``
  }, n[9] = c, n[10] = s, n[11] = et) : et = n[11];
  let tt = (0, Q.useRef)(et),
    nt;
  n[12] !== c || n[13] !== s ? (nt = {
    browserTabId: c,
    conversationId: s,
    interactionMode: oi.BROWSE,
    isAnnotationToolbarVisible: !1,
    isVisible: !1
  }, n[12] = c, n[13] = s, n[14] = nt) : nt = n[14];
  let rt = (0, Q.useRef)(nt),
    it = (0, Q.useRef)(null),
    st = (0, Q.useRef)(null),
    ct = (0, Q.useRef)(!1),
    lt = (0, Q.useRef)(null),
    ut = (0, Q.useRef)(null),
    dt;
  n[15] === s ? dt = n[16] : (dt = () => Dl(s), n[15] = s, n[16] = dt);
  let [ft, mt] = (0, Q.useState)(dt),
    ht = m(Tn),
    gt = m(Ur),
    vt = _e(fi, s),
    xt = m(vr),
    {
      data: St
    } = m(Fa),
    Ct = Je?.browserHost?.getWebMcpInspectorData,
    wt = ue(`2849306825`) && P,
    Tt = ue(`3646210497`),
    Et;
  n[17] === Tt ? Et = n[18] : (Et = {
    openAIGoLinksEnabled: Tt
  }, n[17] = Tt, n[18] = Et);
  let Ot = Et,
    kt;
  n[19] !== c || n[20] !== s ? (kt = () => q.getSnapshot(s, c), n[19] = c, n[20] = s, n[21] = kt) : kt = n[21];
  let Nt = kt,
    W = (0, Q.useSyncExternalStore)(q.subscribe, Nt, Nt),
    G = W ?? jl,
    It;
  n[22] !== G.url || n[23] !== St || n[24] !== xt ? (It = xt && Ct != null && St != null && x(G.url, St) === `allowed`, n[22] = G.url, n[23] = St, n[24] = xt, n[25] = It) : It = n[25];
  let Lt = It,
    Rt = G.siteAnnotationPermissionRequest,
    zt = Je?.browserHost?.respondToSiteAnnotationPermission,
    Gt = W != null,
    Kt,
    qt;
  n[26] !== R || n[27] !== c || n[28] !== s || n[29] !== Gt ? (Kt = () => {
    Gt && Je?.browserHost?.setAnnotationPresentation({
      browserTabId: c,
      conversationId: s,
      markersVisible: R
    });
  }, qt = [R, c, s, Gt], n[26] = R, n[27] = c, n[28] = s, n[29] = Gt, n[30] = Kt, n[31] = qt) : (Kt = n[30], qt = n[31]), (0, Q.useEffect)(Kt, qt);
  let Yt, Xt;
  n[32] !== G.interactionMode || n[33] !== c || n[34] !== s || n[35] !== d ? (Yt = () => {
    if (G.interactionMode !== `comment` || !d) return;
    let e = Je?.browserHost;
    if (e == null) return;
    let t = !1,
      n = n => {
        let r = t || q.getSnapshot(s, c)?.isAnnotationSuspended === !0;
        if (!r && (n.type !== `keydown` || n.repeat || ge.current?.contains(document.activeElement) !== !0 && Te.current?.contains(document.activeElement) !== !0 && Ee.current?.contains(document.activeElement) !== !0)) return;
        let i = ji(n, r, {
          preserveTyping: !0
        });
        i != null && (t = i, e.setAnnotationPresentation({
          browserTabId: c,
          conversationId: s,
          suspended: i
        }));
      },
      r = () => {
        t = !1;
      };
    return window.addEventListener(`keydown`, n, !0), window.addEventListener(`keyup`, n, !0), window.addEventListener(`blur`, r), () => {
      window.removeEventListener(`keydown`, n, !0), window.removeEventListener(`keyup`, n, !0), window.removeEventListener(`blur`, r), e.setAnnotationPresentation({
        browserTabId: c,
        conversationId: s,
        suspended: !1
      });
    };
  }, Xt = [G.interactionMode, c, s, d], n[32] = G.interactionMode, n[33] = c, n[34] = s, n[35] = d, n[36] = Yt, n[37] = Xt) : (Yt = n[36], Xt = n[37]), (0, Q.useEffect)(Yt, Xt);
  let Zt = G.tabType === F.WEB,
    Qt;
  n[38] !== G.url || n[39] !== Zt ? (Qt = Zt && G.url.trim().length > 0, n[38] = G.url, n[39] = Zt, n[40] = Qt) : Qt = n[40];
  let K = Qt,
    en;
  n[41] !== G.isLoading || n[42] !== G.url || n[43] !== K ? (en = K && !G.url.startsWith(`about:blank`) && !G.isLoading, n[41] = G.isLoading, n[42] = G.url, n[43] = K, n[44] = en) : en = n[44];
  let rn = en,
    an;
  n[45] !== c || n[46] !== s ? (an = () => q.isBrowserUseActive(s, c), n[45] = c, n[46] = s, n[47] = an) : an = n[47];
  let on = an,
    sn = (0, Q.useSyncExternalStore)(q.subscribe, on, on),
    ln;
  n[48] !== c || n[49] !== s ? (ln = () => q.isBrowserUseTab(s, c), n[48] = c, n[49] = s, n[50] = ln) : ln = n[50];
  let un = ln,
    fn = (0, Q.useSyncExternalStore)(q.subscribe, un, un),
    pn;
  n[51] !== c || n[52] !== s ? (pn = () => Jr(s, c), n[51] = c, n[52] = s, n[53] = pn) : pn = n[53];
  let hn = (0, Q.useSyncExternalStore)(Sr, pn, xl),
    _n;
  n[54] !== c || n[55] !== s ? (_n = () => Pr(s, c), n[54] = c, n[55] = s, n[56] = _n) : _n = n[56];
  let bn = (0, Q.useSyncExternalStore)(Sr, _n, bl),
    xn = hn != null && bn != null,
    Cn = m(gr),
    wn = m(xr),
    Dn = m(Rr),
    On = m(wr),
    An = m(pr),
    Nn = An && On === `browser` && Dn?.conversationId === s && Dn.browserTabId === c,
    [Pn, In] = (0, Q.useState)(!1);
  Pn && !d ? In(!1) : !Pn && d && de && In(!0);
  let [Ln, zn] = (0, Q.useState)(!1),
    Bn = Je?.downloads,
    Hn = Je?.browserProfileImport,
    [Un, Wn] = (0, Q.useState)(!1),
    [Gn, Kn] = (0, Q.useState)(null),
    qn;
  n[57] !== G.url || n[58] !== se || n[59] !== K || n[60] !== ce ? (qn = K && ce ? xi(se, G.url) : null, n[57] = G.url, n[58] = se, n[59] = K, n[60] = ce, n[61] = qn) : qn = n[61];
  let Jn = qn,
    Yn;
  n[62] !== s || n[63] !== ft ? (Yn = ft.conversationId === s ? ft : Dl(s), n[62] = s, n[63] = ft, n[64] = Yn) : Yn = n[64];
  let Zn = Yn,
    Qn = G.commentModeDisabledReason === `site-blocked`,
    tr = Gn?.fromSnapshot === G ? Gn.to : G.interactionMode,
    nr = P && tr === oi.COMMENT,
    ir;
  n[65] === G.annotationFlow ? ir = n[66] : (ir = Le(G.annotationFlow), n[65] = G.annotationFlow, n[66] = ir);
  let ar = ir,
    or = nr && ar.persistent,
    ur;
  n[67] !== c || n[68] !== s ? (ur = () => sr(s, c), n[67] = c, n[68] = s, n[69] = ur) : ur = n[69];
  let dr = (0, Q.useSyncExternalStore)(Sr, ur, yl),
    fr = dr ?? ``,
    mr;
  n[70] === fr ? mr = n[71] : (mr = M(fr), n[70] = fr, n[71] = mr);
  let hr = mr.length > 0,
    _r = d && (vt == null || vt === c) && Gt && G.tabType === F.NEW_TAB_PAGE && G.url.length === 0 && !hr && !xn && !fn,
    br = Gt && Zt || _r || xn || sn,
    Tr = br && (K || xn),
    kr = ue(`3528415127`),
    jr = m(Qr),
    Mr = jr != null && G.tabType === F.NEW_TAB_PAGE && !xn,
    Nr = jr != null && !K && !xn ? jr.newTab.AddressInput : mo,
    Fr = ue(G.url.length === 0 || G.url.startsWith(`about:blank`) ? `2002769348` : !1),
    Ir;
  n[72] === G.comments ? Ir = n[73] : (Ir = We(G.comments), n[72] = G.comments, n[73] = Ir);
  let Lr = Ir,
    zr;
  if (n[74] !== c || n[75] !== le) {
    let e;
    n[77] === c ? e = n[78] : (e = e => ii(e, c), n[77] = c, n[78] = e), zr = le.filter(e), n[74] = c, n[75] = le, n[76] = zr;
  } else zr = n[76];
  let Br = zr.length,
    Hr;
  n[79] !== Br || n[80] !== W ? (Hr = W != null && (Vt(W.comments) || Br > 0), n[79] = Br, n[80] = W, n[81] = Hr) : Hr = n[81];
  let Wr = Hr,
    qr = G.annotationEditorMode ?? `comment`,
    Yr = G.isTweaksEditorOpen === !0,
    Xr = qr === `design` || Yr,
    Zr = nr && Xr,
    $r = Xr ? `design` : `comment`,
    ri = or && (Xr || Wr),
    ai = d && !Ln,
    si;
  n[82] === G.url ? si = n[83] : (si = M(G.url).length === 0 ? `` : G.url, n[82] = G.url, n[83] = si);
  let J = si,
    li;
  n[84] !== J || n[85] !== c || n[86] !== s ? (li = () => Cl(s, c, J)?.value ?? J, n[84] = J, n[85] = c, n[86] = s, n[87] = li) : li = n[87];
  let [di, pi] = (0, Q.useState)(li),
    [Y, hi] = (0, Q.useState)(!1),
    gi;
  n[88] !== J || n[89] !== c || n[90] !== s ? (gi = () => ({
    browserUrl: J,
    hasEdited: Cl(s, c, J) != null,
    isFocused: !1,
    wasCanceledByNavigation: !1
  }), n[88] = J, n[89] = c, n[90] = s, n[91] = gi) : gi = n[91];
  let [_i, vi] = (0, Q.useState)(gi),
    [yi, bi] = (0, Q.useState)(!1),
    [Si, Ci] = (0, Q.useState)(!1),
    [wi, Ti] = (0, Q.useState)(),
    [Di, Oi] = (0, Q.useState)(!1),
    [ki, Ai] = (0, Q.useState)(!1),
    [Mi, Ni] = (0, Q.useState)(!1),
    [Fi, Ii] = (0, Q.useState)(!1),
    [Li, Ri] = (0, Q.useState)(!1),
    zi;
  n[92] !== G.url || n[93] !== c || n[94] !== s || n[95] !== d ? (zi = {
    browserTabId: c,
    conversationId: s,
    isVisible: d,
    url: G.url
  }, n[92] = G.url, n[93] = c, n[94] = s, n[95] = d, n[96] = zi) : zi = n[96];
  let [Bi, Vi] = (0, Q.useState)(zi);
  if (Bi.browserTabId !== c || Bi.conversationId !== s || Bi.isVisible !== d || Bi.url !== G.url) {
    if (Vi({
      browserTabId: c,
      conversationId: s,
      isVisible: d,
      url: G.url
    }), Bi.browserTabId !== c || Bi.conversationId !== s) {
      let e = Cl(s, c, J);
      pi(e?.value ?? J), Ti(void 0), hi(!1), vi({
        browserUrl: J,
        hasEdited: e != null,
        isFocused: !1,
        wasCanceledByNavigation: !1
      }), Oi(!1), Ni(!1), Ii(!1), Ri(!1), Wn(!1), Kn(null), bi(!1), Ci(!1);
    } else d || (bi(!1), hi(!1), Ii(!1));
  }
  let Hi = wi !== void 0 && W === wi,
    Ui = Y && _i.hasEdited ? W : null,
    Wi;
  n[97] !== wi || n[98] !== J || n[99] !== c || n[100] !== s || n[101] !== Ui || n[102] !== Y || n[103] !== Hi ? (Wi = {
    addressSubmittedAtSnapshot: wi,
    browserAddressValue: J,
    browserTabId: c,
    conversationId: s,
    editedAddressSnapshot: Ui,
    isAddressEditing: Y,
    pendingAddressSnapshot: Hi
  }, n[97] = wi, n[98] = J, n[99] = c, n[100] = s, n[101] = Ui, n[102] = Y, n[103] = Hi, n[104] = Wi) : Wi = n[104];
  let [Ki, qi] = (0, Q.useState)(Wi);
  if ((Ki.addressSubmittedAtSnapshot !== wi || Ki.browserAddressValue !== J || Ki.browserTabId !== c || Ki.conversationId !== s || Ki.editedAddressSnapshot !== Ui || Ki.isAddressEditing !== Y || Ki.pendingAddressSnapshot !== Hi) && (qi({
    addressSubmittedAtSnapshot: wi,
    browserAddressValue: J,
    browserTabId: c,
    conversationId: s,
    editedAddressSnapshot: Ui,
    isAddressEditing: Y,
    pendingAddressSnapshot: Hi
  }), Ki.browserTabId === c && Ki.conversationId === s)) {
    if (Y && _i.isFocused && _i.hasEdited) J !== _i.browserUrl && (pi(G.url), hi(!1), vi({
      ..._i,
      hasEdited: !1,
      wasCanceledByNavigation: !0
    }));else if (!Hi) {
      wi !== void 0 && Ti(void 0);
      let e = Cl(s, c, J);
      vi({
        ..._i,
        browserUrl: J,
        hasEdited: e != null
      }), e ?? pi(J);
    }
  }
  let Ji = Y || Di || Fi,
    Yi = j === `bottom` ? `bottom-panel` : `right-panel`,
    Xi = xn && dr != null ? dr : G.url.length === 0 ? `about:blank` : G.url,
    Zi = _r || sn || xn,
    Qi = !P || !K || Qn,
    $i = _e(Dr, `browser.toggleAnnotationMode`),
    ea,
    na;
  n[105] === d ? (ea = n[106], na = n[107]) : (ea = () => {
    Ke.current = d;
  }, na = [d], n[105] = d, n[106] = ea, n[107] = na), (0, Q.useLayoutEffect)(ea, na);
  let ra;
  n[108] !== c || n[109] !== s ? (ra = e => {
    let {
      command: t,
      targetBrowserTabId: n,
      targetConversationId: r
    } = e;
    return {
      browserTabId: n === void 0 ? c : n,
      conversationId: r === void 0 ? s : r,
      command: t
    };
  }, n[108] = c, n[109] = s, n[110] = ra) : ra = n[110];
  let aa = ra,
    oa;
  n[111] !== aa || n[112] !== z.id ? (oa = e => {
    ne.dispatchMessage(`browser-sidebar-command`, aa({
      command: e.type === `navigate` ? {
        ...e,
        hostId: e.hostId ?? z.id
      } : e
    }));
  }, n[111] = aa, n[112] = z.id, n[113] = oa) : oa = n[113];
  let X = oa,
    sa = (0, Q.useEffectEvent)(X),
    ca;
  n[114] !== c || n[115] !== s || n[116] !== X ? (ca = async (e, t) => {
    let n = Je?.browserHost;
    if (a(e) && n != null) {
      await n.cloneTab({
        active: e.shiftKey,
        browserTabId: c,
        conversationId: s,
        navigation: t
      }).catch(vl);
      return;
    }
    X({
      type: t === `back` ? `go-back` : `go-forward`
    });
  }, n[114] = c, n[115] = s, n[116] = X, n[117] = ca) : ca = n[117];
  let la = ca,
    ua;
  n[118] === Symbol.for(`react.memo_cache_sentinel`) ? (ua = () => {
    let e = Ne.current;
    Ke.current && e != null && (e.scrollLeft = 0);
  }, n[118] = ua) : ua = n[118];
  let da = ua,
    fa;
  n[119] === Symbol.for(`react.memo_cache_sentinel`) ? (fa = () => {
    let e = Ne.current;
    Ke.current && e != null && !ze.current && Ve.current && (e.setSelectionRange(0, e.value.length, `forward`), da());
  }, n[119] = fa) : fa = n[119];
  let pa = fa,
    ma;
  n[120] === Symbol.for(`react.memo_cache_sentinel`) ? (ma = e => {
    let {
        shouldSelectAddress: t
      } = e,
      n = Ne.current;
    t && (Ve.current = !0), n?.focus(), da(), t && (pa(), requestAnimationFrame(() => {
      da(), pa();
    }));
  }, n[120] = ma) : ma = n[120];
  let ha = ma,
    ga;
  n[121] !== J || n[122] !== G.url || n[123] !== c || n[124] !== s || n[125] !== Pn || n[126] !== Y ? (ga = e => {
    let {
      shouldSelectAddress: t
    } = e;
    if (He.current = !1, !Y) {
      let e = Cl(s, c, J);
      ze.current = e != null, (0, Al.flushSync)(() => {
        pi(e?.value ?? G.url), vi(t => ({
          ...t,
          browserUrl: J,
          hasEdited: e != null,
          wasCanceledByNavigation: !1
        })), bi(Pn), hi(!0);
      });
    }
    ha({
      shouldSelectAddress: t
    });
  }, n[121] = J, n[122] = G.url, n[123] = c, n[124] = s, n[125] = Pn, n[126] = Y, n[127] = ga) : ga = n[127];
  let _a = ga,
    va;
  n[128] === _a ? va = n[129] : (va = () => {
    _a({
      shouldSelectAddress: !0
    }), Pe.current?.();
  }, n[128] = _a, n[129] = va);
  let ya = va,
    ba;
  n[130] !== c || n[131] !== s ? (ba = () => {
    q.setAddressInputDraft(s, c, null), ze.current = !1, Ve.current = !1, vi(_l), hi(!1);
  }, n[130] = c, n[131] = s, n[132] = ba) : ba = n[132];
  let Sa = ba,
    Ca;
  n[133] !== J || n[134] !== G.url || n[135] !== c || n[136] !== s || n[137] !== Sa ? (Ca = e => {
    let t = e === void 0 ? null : e;
    if (Cl(s, c, J) != null && t instanceof Element && t.closest(`[data-app-shell-workspace-layout-toggle]`) != null) {
      Ve.current = !1, hi(!1);
      return;
    }
    Sa(), pi(G.url);
  }, n[133] = J, n[134] = G.url, n[135] = c, n[136] = s, n[137] = Sa, n[138] = Ca) : Ca = n[138];
  let wa = Ca,
    Ta;
  n[139] === wa ? Ta = n[140] : (Ta = () => {
    if (He.current) return;
    He.current = !0, wa();
    let e = Ne.current;
    e != null && e === document.activeElement && e.blur();
  }, n[139] = wa, n[140] = Ta);
  let Ea = Ta,
    Da = (0, Q.useEffectEvent)(Ea),
    Oa;
  n[141] !== J || n[142] !== G.url || n[143] !== c || n[144] !== s || n[145] !== Pn || n[146] !== Y ? (Oa = () => {
    if (Y) return;
    He.current = !1;
    let e = Cl(s, c, J);
    ze.current = e != null, G.url.length > 0 && (Ve.current = !0), pi(e?.value ?? G.url), vi(t => ({
      ...t,
      browserUrl: J,
      hasEdited: e != null,
      wasCanceledByNavigation: !1
    })), bi(Pn), hi(!0), requestAnimationFrame(() => {
      da(), pa();
    });
  }, n[141] = J, n[142] = G.url, n[143] = c, n[144] = s, n[145] = Pn, n[146] = Y, n[147] = Oa) : Oa = n[147];
  let ka = Oa,
    ja;
  n[148] === N ? ja = n[149] : (ja = () => {
    let e = N.get(ei);
    window.requestAnimationFrame(() => {
      let t = document.getElementById(e);
      t instanceof HTMLInputElement && (t.focus(), t.select());
    });
  }, n[148] = N, n[149] = ja);
  let Ma = ja,
    Na = (0, Q.useEffectEvent)(Ma),
    Pa;
  n[150] === X ? Pa = n[151] : (Pa = () => {
    window.requestAnimationFrame(() => {
      if (Ke.current && document.hasFocus()) {
        if (we.current?.focus(), document.activeElement === we.current) {
          X({
            type: `refresh-cursor`
          });
          return;
        }
        ge.current?.focus();
      }
    });
  }, n[150] = X, n[151] = Pa);
  let Ia = Pa,
    La = (0, Q.useEffectEvent)(Ia),
    Ra;
  n[152] !== c || n[153] !== wn || n[154] !== s || n[155] !== La || n[156] !== N ? (Ra = () => {
    wn?.conversationId === s && wn.browserTabId === c && (La(), Or(N));
  }, n[152] = c, n[153] = wn, n[154] = s, n[155] = La, n[156] = N, n[157] = Ra) : Ra = n[157];
  let za = wn?.browserTabId,
    Ba = wn?.conversationId,
    Va;
  n[158] !== c || n[159] !== s || n[160] !== N || n[161] !== za || n[162] !== Ba ? (Va = [c, za, Ba, s, N], n[158] = c, n[159] = s, n[160] = N, n[161] = za, n[162] = Ba, n[163] = Va) : Va = n[163], (0, Q.useEffect)(Ra, Va);
  let Ha;
  n[164] !== c || n[165] !== Dn || n[166] !== On || n[167] !== s || n[168] !== Ia || n[169] !== An || n[170] !== N ? (Ha = e => {
    let {
        targetBrowserTabId: t,
        shouldRestoreFocus: n,
        targetConversationId: r
      } = e === void 0 ? {} : e,
      i = t === void 0 ? c : t,
      a = n === void 0 || n,
      o = r === void 0 ? s : r;
    Dn?.conversationId === o && Dn.browserTabId === i && (An && On === `browser` && lr(N), Vn(N, Kr)), jt({
      browserTabId: i,
      conversationId: o,
      command: {
        type: `close-find`
      }
    }, ui), a && Ia();
  }, n[164] = c, n[165] = Dn, n[166] = On, n[167] = s, n[168] = Ia, n[169] = An, n[170] = N, n[171] = Ha) : Ha = n[171];
  let Ua = (0, Q.useEffectEvent)(Ha),
    Wa;
  n[172] !== c || n[173] !== s || n[174] !== Ma || n[175] !== N ? (Wa = () => {
    kn(N, {
      browserTabId: c,
      conversationId: s
    }), Fn(N, `browser`), cn(N), Ma();
  }, n[172] = c, n[173] = s, n[174] = Ma, n[175] = N, n[176] = Wa) : Wa = n[176];
  let Ga = Wa,
    Ka,
    qa;
  n[177] !== Si || n[178] !== Tr ? (Ka = () => {
    if (!Si || !Tr) return;
    let e = requestAnimationFrame(() => {
      we.current?.focus(), Ci(!1);
    });
    return () => {
      cancelAnimationFrame(e);
    };
  }, qa = [Si, Tr], n[177] = Si, n[178] = Tr, n[179] = Ka, n[180] = qa) : (Ka = n[179], qa = n[180]), (0, Q.useEffect)(Ka, qa);
  let Ja, Ya;
  n[181] !== _i.wasCanceledByNavigation || n[182] !== c || n[183] !== s ? (Ja = () => {
    if (!_i.wasCanceledByNavigation) return;
    q.setAddressInputDraft(s, c, null), ze.current = !1, Ve.current = !1;
    let e = Ne.current;
    e != null && e === document.activeElement && (He.current = !0, e.blur());
  }, Ya = [_i.wasCanceledByNavigation, c, s], n[181] = _i.wasCanceledByNavigation, n[182] = c, n[183] = s, n[184] = Ja, n[185] = Ya) : (Ja = n[184], Ya = n[185]), (0, Q.useLayoutEffect)(Ja, Ya);
  let Xa, Za;
  n[186] !== wi || n[187] !== J || n[188] !== c || n[189] !== s || n[190] !== Y || n[191] !== W ? (Xa = () => {
    let e = Cl(s, c, J),
      t = Y && Ne.current === document.activeElement && !ze.current && J.length > 0;
    if (!(Y && Ne.current === document.activeElement && ze.current) && (wi === void 0 || W !== wi)) {
      if (e != null) {
        ze.current = !0;
        return;
      }
      q.getAddressInputDraft(s, c) != null && q.setAddressInputDraft(s, c, null), ze.current = !1, t && (Ve.current = !0);
    }
  }, Za = [wi, J, c, s, Y, W], n[186] = wi, n[187] = J, n[188] = c, n[189] = s, n[190] = Y, n[191] = W, n[192] = Xa, n[193] = Za) : (Xa = n[192], Za = n[193]), (0, Q.useLayoutEffect)(Xa, Za);
  let Qa;
  n[194] !== J || n[195] !== G.interactionMode || n[196] !== c || n[197] !== s ? (Qa = () => {
    let e = tt.current;
    if (e.browserTabId === c && e.conversationId === s) return;
    $n(e.conversationId, e.browserTabId), Vr(e.conversationId, e.browserTabId);
    let t = Ne.current;
    t != null && t === document.activeElement && t.blur();
    let n = Cl(s, c, J);
    ze.current = n != null, Ve.current = !1, He.current = !1, Ge.current = !1, $e.current = G.interactionMode, it.current = null, st.current = null, Qe.current = !1, lt.current = null, ut.current = null;
  }, n[194] = J, n[195] = G.interactionMode, n[196] = c, n[197] = s, n[198] = Qa) : Qa = n[198];
  let $a;
  n[199] !== J || n[200] !== G.interactionMode || n[201] !== G.url || n[202] !== c || n[203] !== s ? ($a = [J, G.interactionMode, G.url, c, s], n[199] = J, n[200] = G.interactionMode, n[201] = G.url, n[202] = c, n[203] = s, n[204] = $a) : $a = n[204], (0, Q.useLayoutEffect)(Qa, $a);
  let eo;
  n[205] !== G.url.length || n[206] !== c || n[207] !== s || n[208] !== d ? (eo = () => {
    !d && Ze.current && rr(s, c), d || (Ve.current = !1, He.current = !1), d && G.url.length > 0 && (rr(s, c), $n(s, c), Vr(s, c)), Ze.current = d;
  }, n[205] = G.url.length, n[206] = c, n[207] = s, n[208] = d, n[209] = eo) : eo = n[209];
  let to;
  n[210] !== G.url || n[211] !== c || n[212] !== s || n[213] !== d ? (to = [G.url, c, s, d], n[210] = G.url, n[211] = c, n[212] = s, n[213] = d, n[214] = to) : to = n[214], (0, Q.useEffect)(eo, to);
  let no;
  n[215] !== G.url || n[216] !== c || n[217] !== Ua || n[218] !== Cn.query.length || n[219] !== Dn || n[220] !== On || n[221] !== s || n[222] !== K || n[223] !== An || n[224] !== d ? (no = () => {
    let e = tt.current;
    if (tt.current = {
      browserTabId: c,
      conversationId: s,
      url: G.url
    }, d && K && e.browserTabId === c && e.conversationId === s && e.url === G.url) return;
    let t = Dn?.conversationId === e.conversationId && Dn.browserTabId === e.browserTabId,
      n = An && On === `browser` && t,
      r = Cn.query.length > 0 || n;
    t && r && Ua({
      shouldRestoreFocus: !1,
      targetBrowserTabId: e.browserTabId,
      targetConversationId: e.conversationId
    });
  }, n[215] = G.url, n[216] = c, n[217] = Ua, n[218] = Cn.query.length, n[219] = Dn, n[220] = On, n[221] = s, n[222] = K, n[223] = An, n[224] = d, n[225] = no) : no = n[225];
  let ro = Dn?.browserTabId,
    io = Dn?.conversationId,
    ao;
  n[226] !== G.url || n[227] !== c || n[228] !== Cn.query.length || n[229] !== On || n[230] !== s || n[231] !== K || n[232] !== Nn || n[233] !== An || n[234] !== d || n[235] !== ro || n[236] !== io ? (ao = [c, G.url, s, Cn.query.length, ro, io, K, An, Nn, On, d], n[226] = G.url, n[227] = c, n[228] = Cn.query.length, n[229] = On, n[230] = s, n[231] = K, n[232] = Nn, n[233] = An, n[234] = d, n[235] = ro, n[236] = io, n[237] = ao) : ao = n[237], (0, Q.useEffect)(no, ao);
  let oo, so;
  n[238] !== G.interactionMode || n[239] !== c || n[240] !== s || n[241] !== ri || n[242] !== d ? (oo = () => {
    let e = rt.current;
    rt.current = {
      browserTabId: c,
      conversationId: s,
      interactionMode: G.interactionMode,
      isAnnotationToolbarVisible: ri,
      isVisible: d
    }, !(!e.isVisible || e.interactionMode !== oi.COMMENT || e.isAnnotationToolbarVisible || d && e.browserTabId === c && e.conversationId === s) && wl(Ie.current) && ne.dispatchMessage(`browser-sidebar-command`, {
      browserTabId: e.browserTabId,
      conversationId: e.conversationId,
      command: {
        type: `set-interaction-mode`,
        interactionMode: oi.BROWSE
      }
    });
  }, so = [G.interactionMode, c, s, ri, d], n[238] = G.interactionMode, n[239] = c, n[240] = s, n[241] = ri, n[242] = d, n[243] = oo, n[244] = so) : (oo = n[243], so = n[244]), (0, Q.useEffect)(oo, so);
  let co;
  n[245] !== Y || n[246] !== Fi || n[247] !== d || n[248] !== Da ? (co = () => {
    if (!d || !Y && !Fi) return;
    let e = e => {
        let t = e.target;
        Ii(!1), !(!Y || !(t instanceof Node) || je.current?.contains(t) || t instanceof Element && (t.closest(`[data-browser-sidebar-skip-address-commit='true']`) != null || t.closest(`[data-app-shell-workspace-layout-toggle]`) != null)) && Da();
      },
      t = () => {
        Ii(!1), Y && Da();
      },
      n = () => {
        Ii(!1);
      },
      r = U.current,
      i = we.current;
    return window.addEventListener(`pointerdown`, e, !0), r?.addEventListener(`pointerdown`, t), i?.addEventListener(`pointerdown`, t), i?.addEventListener(`focus`, t), window.addEventListener(`focus`, n), () => {
      window.removeEventListener(`pointerdown`, e, !0), r?.removeEventListener(`pointerdown`, t), i?.removeEventListener(`pointerdown`, t), i?.removeEventListener(`focus`, t), window.removeEventListener(`focus`, n);
    };
  }, n[245] = Y, n[246] = Fi, n[247] = d, n[248] = Da, n[249] = co) : co = n[249];
  let lo;
  n[250] !== Y || n[251] !== Fi || n[252] !== d ? (lo = [Y, Fi, d], n[250] = Y, n[251] = Fi, n[252] = d, n[253] = lo) : lo = n[253], (0, Q.useEffect)(co, lo);
  let uo;
  n[254] !== $r || n[255] !== G.annotationFlow || n[256] !== G.annotationModeEntrySource || n[257] !== G.interactionMode || n[258] !== G.siteAnnotationFeatures?.length || n[259] !== Wr || n[260] !== Lr || n[261] !== d || n[262] !== N || n[263] !== W ? (uo = () => {
    if (W == null) {
      lt.current = null;
      return;
    }
    let e = `${G.interactionMode}:${G.annotationFlow ?? i.BATCH}`,
      t = lt.current;
    if (lt.current = e, !d || t == null || t === e) return;
    let n = G.interactionMode === oi.COMMENT && G.annotationModeEntrySource != null ? Fl[G.annotationModeEntrySource] : void 0;
    yt(N, Ft, {
      isDetached: !1,
      hasAnnotationFeatures: (G.siteAnnotationFeatures?.length ?? 0) > 0,
      enabled: G.interactionMode === oi.COMMENT,
      hasPendingAnnotations: Wr,
      hasQueuedDesignTweaks: Lr,
      annotationEditorMode: $r,
      entrySource: n
    });
  }, n[254] = $r, n[255] = G.annotationFlow, n[256] = G.annotationModeEntrySource, n[257] = G.interactionMode, n[258] = G.siteAnnotationFeatures?.length, n[259] = Wr, n[260] = Lr, n[261] = d, n[262] = N, n[263] = W, n[264] = uo) : uo = n[264];
  let fo;
  n[265] !== $r || n[266] !== G.annotationFlow || n[267] !== G.annotationModeEntrySource || n[268] !== G.interactionMode || n[269] !== G.siteAnnotationFeatures || n[270] !== Wr || n[271] !== Lr || n[272] !== d || n[273] !== N || n[274] !== W ? (fo = [$r, G.annotationFlow, G.siteAnnotationFeatures, G.annotationModeEntrySource, G.interactionMode, Wr, Lr, d, N, W], n[265] = $r, n[266] = G.annotationFlow, n[267] = G.annotationModeEntrySource, n[268] = G.interactionMode, n[269] = G.siteAnnotationFeatures, n[270] = Wr, n[271] = Lr, n[272] = d, n[273] = N, n[274] = W, n[275] = fo) : fo = n[275], (0, Q.useEffect)(uo, fo);
  let po, go;
  n[276] !== Wr || n[277] !== Lr || n[278] !== Zr || n[279] !== d || n[280] !== N || n[281] !== W ? (po = () => {
    if (W == null) {
      ut.current = null;
      return;
    }
    let e = ut.current;
    ut.current = Zr, d && e != null && e !== Zr && yt(N, _t, {
      enabled: Zr,
      hasPendingAnnotations: Wr,
      hasQueuedDesignTweaks: Lr
    });
  }, go = [Wr, Lr, Zr, d, N, W], n[276] = Wr, n[277] = Lr, n[278] = Zr, n[279] = d, n[280] = N, n[281] = W, n[282] = po, n[283] = go) : (po = n[282], go = n[283]), (0, Q.useEffect)(po, go);
  let _o;
  n[284] !== G.interactionMode || n[285] !== Na || n[286] !== Nn || n[287] !== d ? (_o = () => {
    let e = $e.current;
    $e.current = G.interactionMode, d && Nn && e === oi.COMMENT && G.interactionMode === oi.BROWSE && Na();
  }, n[284] = G.interactionMode, n[285] = Na, n[286] = Nn, n[287] = d, n[288] = _o) : _o = n[288];
  let vo;
  n[289] !== G.interactionMode || n[290] !== Nn || n[291] !== d ? (vo = [G.interactionMode, Nn, d], n[289] = G.interactionMode, n[290] = Nn, n[291] = d, n[292] = vo) : vo = n[292], (0, Q.useEffect)(_o, vo);
  let yo;
  n[293] === Symbol.for(`react.memo_cache_sentinel`) ? (yo = () => {
    pa();
  }, n[293] = yo) : yo = n[293];
  let bo;
  n[294] !== di || n[295] !== Y ? (bo = [di, Y], n[294] = di, n[295] = Y, n[296] = bo) : bo = n[296], (0, Q.useLayoutEffect)(yo, bo);
  let xo, So;
  n[297] !== w || n[298] !== c || n[299] !== s || n[300] !== d || n[301] !== j || n[302] !== Yi || n[303] !== N ? (xo = () => {
    let e = Ye.current,
      t = d && !e;
    if (Ye.current = d, !w || !t || N.get(cr(j).activeTab$)?.tabId === c && N.get(yn) !== Yi) return;
    let n = Er(s, c),
      r = Gr(s, c),
      i = n === `browser_use` || r === `browser_use`,
      a = n === `manual` || r === `side_panel_menu` || r === `toggle_browser_command`,
      o = sr(s, c),
      l = q.getSnapshot(s, c),
      u = o ?? ``;
    l != null && (u = M(l.url).length === 0 ? o ?? l.url : l.url);
    let f = !i && M(u).length === 0;
    if (!f && (!a || f)) return;
    let p = M(l?.url ?? ``).length === 0 ? `` : l?.url ?? ``,
      m = Cl(s, c, p);
    ze.current = m != null, Ve.current = !1, f && ((0, Al.flushSync)(() => {
      pi(m?.value ?? ``), vi(e => ({
        ...e,
        browserUrl: p,
        hasEdited: m != null,
        wasCanceledByNavigation: !1
      })), bi(!1), hi(!0);
    }), Ne.current?.focus());
    let h = requestAnimationFrame(() => {
      if (Ke.current) {
        if (f) {
          Ne.current?.focus();
          return;
        }
        we.current?.focus();
      }
    });
    return () => {
      cancelAnimationFrame(h);
    };
  }, So = [w, c, s, d, j, Yi, N], n[297] = w, n[298] = c, n[299] = s, n[300] = d, n[301] = j, n[302] = Yi, n[303] = N, n[304] = xo, n[305] = So) : (xo = n[304], So = n[305]), (0, Q.useLayoutEffect)(xo, So);
  let Co = j === `right` ? `normal` : `fallback`,
    To;
  n[306] !== c || n[307] !== s || n[308] !== j ? (To = e => {
    if (e?.originBrowserTab != null) return e.originBrowserTab.conversationId === s && e.originBrowserTab.browserTabId === c;
    if (e?.originPanel != null) return e.originPanel === j;
    if (Te.current?.contains(document.activeElement) || Ee.current?.contains(document.activeElement)) return !0;
    let t = document.activeElement?.closest(`[data-browser-sidebar-primary-focus-target]`);
    return t == null ? Ss(ge.current) || document.activeElement?.closest(`[data-app-shell-focus-area="main"], [data-codex-composer]`) != null : t === ge.current;
  }, n[306] = c, n[307] = s, n[308] = j, n[309] = To) : To = n[309];
  let Eo;
  n[310] !== ai || n[311] !== Co || n[312] !== To ? (Eo = {
    enabled: ai,
    priority: Co,
    isActive: To,
    keyboardHandler: gl
  }, n[310] = ai, n[311] = Co, n[312] = To, n[313] = Eo) : Eo = n[313], vn(`focusBrowserAddressBar`, ya, Eo);
  let Do = hl,
    ko;
  n[314] === X ? ko = n[315] : (ko = () => {
    X({
      type: `go-back`
    });
  }, n[314] = X, n[315] = ko);
  let Ao;
  n[316] === ai ? Ao = n[317] : (Ao = {
    enabled: ai,
    keyboardHandler: Do
  }, n[316] = ai, n[317] = Ao), vn(`navigateBrowserBack`, ko, Ao);
  let jo;
  n[318] === X ? jo = n[319] : (jo = () => {
    X({
      type: `go-forward`
    });
  }, n[318] = X, n[319] = jo);
  let No;
  n[320] === ai ? No = n[321] : (No = {
    enabled: ai,
    keyboardHandler: Do
  }, n[320] = ai, n[321] = No), vn(`navigateBrowserForward`, jo, No);
  let Po;
  n[322] !== c || n[323] !== s ? (Po = (e, t) => {
    let n = e === oi.COMMENT ? null : {
      fromSnapshot: q.getSnapshot(s, c) ?? jl,
      to: e
    };
    (0, Al.flushSync)(() => {
      Kn(n), Wn(e === `comment`);
    }), t === Ml.FOCUS && window.requestAnimationFrame(() => {
      we.current?.focus();
    });
  }, n[322] = c, n[323] = s, n[324] = Po) : Po = n[324];
  let Fo = Po,
    Io;
  n[325] === X ? Io = n[326] : (Io = () => {
    X({
      type: `add-annotations-to-composer`
    });
  }, n[325] = X, n[326] = Io);
  let Lo = Io,
    Ro;
  n[327] !== Lo || n[328] !== ar || n[329] !== Fo || n[330] !== X ? (Ro = () => {
    wl(Ie.current) && (ar.persistent ? Lo() : (Fo(oi.BROWSE, Ml.NONE), X({
      type: `set-interaction-mode`,
      interactionMode: oi.BROWSE
    })));
  }, n[327] = Lo, n[328] = ar, n[329] = Fo, n[330] = X, n[331] = Ro) : Ro = n[331];
  let zo = Ro,
    Bo;
  n[332] !== Fo || n[333] !== zo || n[334] !== P || n[335] !== X ? (Bo = (e, t, n) => {
    if (P || e !== oi.COMMENT) {
      if (e === oi.BROWSE) {
        zo();
        return;
      }
      Fo(e, t), X({
        type: `set-interaction-mode`,
        interactionMode: e,
        annotationModeEntrySource: n
      });
    }
  }, n[332] = Fo, n[333] = zo, n[334] = P, n[335] = X, n[336] = Bo) : Bo = n[336];
  let Vo = Bo,
    Ho;
  n[337] !== Fo || n[338] !== P ? (Ho = (e, t) => {
    (P || e !== oi.COMMENT) && Fo(e, t);
  }, n[337] = Fo, n[338] = P, n[339] = Ho) : Ho = n[339];
  let Uo = Ho,
    Wo;
  n[340] !== nr || n[341] !== Vo ? (Wo = e => {
    Vo(nr ? oi.BROWSE : oi.COMMENT, nr ? Ml.NONE : Ml.FOCUS, !nr && e === `keyboard_shortcut` ? `keyboard-shortcut` : void 0);
  }, n[340] = nr, n[341] = Vo, n[342] = Wo) : Wo = n[342];
  let Go = ai && !Qi,
    Ko;
  n[343] === Go ? Ko = n[344] : (Ko = {
    enabled: Go,
    keyboardHandler: ml
  }, n[343] = Go, n[344] = Ko), vn(`browser.toggleAnnotationMode`, Wo, Ko);
  let Jo;
  n[345] !== zo || n[346] !== Y || n[347] !== nr ? (Jo = e => {
    if (Y) return;
    let t = document.activeElement,
      n = t instanceof HTMLElement && (ge.current?.contains(t) === !0 || Te.current?.contains(t) === !0 || Ee.current?.contains(t) === !0);
    if ((Ge.current || n) && nr) {
      e.preventDefault(), e.stopPropagation(), zo();
      return;
    }
  }, n[345] = zo, n[346] = Y, n[347] = nr, n[348] = Jo) : Jo = n[348];
  let Yo;
  n[349] !== ai || n[350] !== Jo ? (Yo = {
    accelerator: `Escape`,
    enabled: ai,
    onKeyDown: Jo
  }, n[349] = ai, n[350] = Jo, n[351] = Yo) : Yo = n[351], Ar(Yo);
  let Xo;
  n[352] !== G.url || n[353] !== c || n[354] !== s || n[355] !== d || n[356] !== N ? (Xo = e => {
    mi(N, s, c, {
      isOpen: e === void 0 ? d : e,
      url: G.url
    });
  }, n[352] = G.url, n[353] = c, n[354] = s, n[355] = d, n[356] = N, n[357] = Xo) : Xo = n[357];
  let Zo = (0, Q.useEffectEvent)(Xo),
    $o,
    es;
  n[358] !== d || n[359] !== de ? ($o = () => {
    if (!d || de) return;
    let e = window.setTimeout(() => {
      In(!0);
    }, Mn.duration * 1e3);
    return () => {
      window.clearTimeout(e);
    };
  }, es = [d, de], n[358] = d, n[359] = de, n[360] = $o, n[361] = es) : ($o = n[360], es = n[361]), (0, Q.useEffect)($o, es);
  let ts;
  n[362] !== d || n[363] !== Yi || n[364] !== N || n[365] !== Tr ? (ts = () => {
    if (!d) {
      Ge.current = !1;
      return;
    }
    let e = U.current,
      t = Tr ? we.current : null,
      n = () => {
        Ge.current = !0;
      },
      r = () => {
        Ge.current = !1;
      },
      i = () => {
        Oi(!1), Oe.current = !0, Ai(!1), Ni(!1);
      },
      a = () => {
        i(), Xn(N), tn(N, Yi), yr(N, !1);
      };
    return e?.addEventListener(`pointerenter`, n), e?.addEventListener(`pointerleave`, r), t?.addEventListener(`pointerenter`, n), t?.addEventListener(`pointerleave`, r), t?.addEventListener(`focus`, a), t?.addEventListener(`pointerdown`, i), document.activeElement === t && a(), window.addEventListener(`blur`, r), () => {
      e?.removeEventListener(`pointerenter`, n), e?.removeEventListener(`pointerleave`, r), t?.removeEventListener(`pointerenter`, n), t?.removeEventListener(`pointerleave`, r), t?.removeEventListener(`focus`, a), t?.removeEventListener(`pointerdown`, i), window.removeEventListener(`blur`, r), Ge.current = !1;
    };
  }, n[362] = d, n[363] = Yi, n[364] = N, n[365] = Tr, n[366] = ts) : ts = n[366];
  let ns;
  n[367] !== s || n[368] !== d || n[369] !== Yi || n[370] !== N || n[371] !== Tr ? (ns = [s, d, Yi, N, Tr], n[367] = s, n[368] = d, n[369] = Yi, n[370] = N, n[371] = Tr, n[372] = ns) : ns = n[372], (0, Q.useEffect)(ts, ns);
  let rs;
  n[373] === Zo ? rs = n[374] : (rs = () => {
    Zo();
  }, n[373] = Zo, n[374] = rs);
  let is;
  n[375] !== G.url || n[376] !== c || n[377] !== s || n[378] !== d ? (is = [G.url, c, s, d], n[375] = G.url, n[376] = c, n[377] = s, n[378] = d, n[379] = is) : is = n[379], (0, Q.useEffect)(rs, is);
  let as, os;
  n[380] !== c || n[381] !== s || n[382] !== K || n[383] !== nr || n[384] !== ht || n[385] !== d ? (as = () => {
    let e = K && d && nr && ht;
    ne.dispatchMessage(`browser-sidebar-command`, {
      browserTabId: c,
      conversationId: s,
      command: {
        type: `set-design-modifier-pressed`,
        pressed: e
      }
    });
  }, os = [c, s, K, nr, ht, d], n[380] = c, n[381] = s, n[382] = K, n[383] = nr, n[384] = ht, n[385] = d, n[386] = as, n[387] = os) : (as = n[386], os = n[387]), (0, Q.useEffect)(as, os);
  let cs;
  n[388] === Zo ? cs = n[389] : (cs = () => () => {
    Zo(!1);
  }, n[388] = Zo, n[389] = cs);
  let ls;
  n[390] !== c || n[391] !== s ? (ls = [c, s], n[390] = c, n[391] = s, n[392] = ls) : ls = n[392], (0, Q.useEffect)(cs, ls);
  let us, ds;
  n[393] !== c || n[394] !== s || n[395] !== Mr || n[396] !== d || n[397] !== j || n[398] !== N ? (us = () => {
    if (!d) {
      Qe.current = !1;
      return;
    }
    if (Qe.current) return;
    Qe.current = !0;
    let e = nn(s, c),
      t = Rn(s, c),
      n = st.current ?? e ?? `manual`,
      r = it.current ?? t ?? `panel_visibility_effect`;
    it.current = null, st.current = null, !(Mr && sr(s, c) == null) && yt(N, bt, {
      initiator: r === `os_open` ? `external_link` : r,
      panelTarget: j,
      source: n
    });
  }, ds = [c, s, Mr, d, j, N], n[393] = c, n[394] = s, n[395] = Mr, n[396] = d, n[397] = j, n[398] = N, n[399] = us, n[400] = ds) : (us = n[399], ds = n[400]), (0, Q.useEffect)(us, ds);
  let fs, ps;
  n[401] !== c || n[402] !== Lt || n[403] !== s ? (fs = e => {
    let t = xa(e.snapshot.siteToolsAvailability, Lt);
    e.conversationId === s && e.browserTabId === c && t !== `available` && t !== `pending-available` && Ni(!1);
  }, ps = [c, s, Lt], n[401] = c, n[402] = Lt, n[403] = s, n[404] = fs, n[405] = ps) : (fs = n[404], ps = n[405]), fe(`browser-sidebar-state`, fs, ps);
  let hs, gs;
  n[406] !== c || n[407] !== s || n[408] !== d || n[409] !== Yi || n[410] !== N ? (hs = e => {
    d && e.conversationId === s && e.browserTabId === c && (Oe.current = !0, Ni(!1), tn(N, Yi), yr(N, !1));
  }, gs = [c, s, d, Yi, N], n[406] = c, n[407] = s, n[408] = d, n[409] = Yi, n[410] = N, n[411] = hs, n[412] = gs) : (hs = n[411], gs = n[412]), fe(`browser-sidebar-web-contents-pointer-down`, hs, gs);
  let _s;
  n[413] !== c || n[414] !== s || n[415] !== ya || n[416] !== Uo || n[417] !== Ga ? (_s = e => {
    if (e.conversationId === s && e.browserTabId === c) bb1647: switch (e.command.type) {
      case `open-find`:
        Ga();
        break bb1647;
      case `focus-address`:
        ya();
        break bb1647;
      case `step-zoom`:
      case `set-zoom-percent`:
      case `reset-zoom`:
        Fe.current?.(e.command);
        break bb1647;
      case `set-interaction-mode`:
        Uo(e.command.interactionMode, e.command.interactionMode === oi.COMMENT ? Ml.FOCUS : Ml.NONE);
        break bb1647;
    }
  }, n[413] = c, n[414] = s, n[415] = ya, n[416] = Uo, n[417] = Ga, n[418] = _s) : _s = n[418];
  let vs;
  n[419] !== vt || n[420] !== c || n[421] !== s ? (vs = [vt, c, s], n[419] = vt, n[420] = c, n[421] = s, n[422] = vs) : vs = n[422], fe(`browser-sidebar-command`, _s, vs);
  let ys;
  n[423] !== K || n[424] !== nr || n[425] !== d || n[426] !== X ? (ys = e => {
    if (!e.isFocused) {
      Ge.current = !1;
      return;
    }
    d && nr && K && (Ge.current = U.current?.matches(`:hover`) === !0 || we.current?.matches(`:hover`) === !0, X({
      type: `refresh-cursor`
    }));
  }, n[423] = K, n[424] = nr, n[425] = d, n[426] = X, n[427] = ys) : ys = n[427];
  let bs;
  n[428] !== c || n[429] !== s || n[430] !== K || n[431] !== nr || n[432] !== d ? (bs = [c, s, K, nr, d], n[428] = c, n[429] = s, n[430] = K, n[431] = nr, n[432] = d, n[433] = bs) : bs = n[433], fe(`electron-window-focus-changed`, ys, bs);
  let xs, Cs;
  n[434] !== vt || n[435] !== c || n[436] !== s || n[437] !== Mr || n[438] !== d || n[439] !== j || n[440] !== N ? (xs = e => {
    if (!(e.conversationId != null && e.conversationId !== s || !Tl(e.browserTabId, vt, c)) && e.source != null) {
      if (e.open === !1) {
        it.current = null, st.current = null;
        return;
      }
      if (d && (e.open === !0 || e.url != null)) {
        let t = e.initiator ?? `panel_visibility_effect`;
        if (it.current = null, st.current = null, Mr && e.url == null) return;
        yt(N, bt, {
          initiator: t === `os_open` ? `external_link` : t,
          panelTarget: j,
          source: e.source,
          hasUrl: e.url != null || void 0,
          panelWasAlreadyVisible: !0
        });
        return;
      }
      it.current = e.initiator ?? null, st.current = e.source;
    }
  }, Cs = [vt, c, s, Mr, d, j, N], n[434] = vt, n[435] = c, n[436] = s, n[437] = Mr, n[438] = d, n[439] = j, n[440] = N, n[441] = xs, n[442] = Cs) : (xs = n[441], Cs = n[442]), fe(`toggle-browser-panel`, xs, Cs);
  let ws, Ts;
  n[443] !== c || n[444] !== s || n[445] !== j || n[446] !== N ? (ws = e => {
    e.conversationId === s && e.browserTabId === c && (e.kind === `navigated` ? (Ni(!1), yt(N, At, {
      initiator: e.initiator === `os_open` ? `external_link` : e.initiator,
      panelTarget: j,
      source: e.source,
      urlKind: e.urlKind
    })) : yt(N, e.kind === `annotation-feature-detected` ? t : qe, e.usage));
  }, Ts = [c, s, j, N], n[443] = c, n[444] = s, n[445] = j, n[446] = N, n[447] = ws, n[448] = Ts) : (ws = n[447], Ts = n[448]), fe(`browser-sidebar-usage`, ws, Ts);
  let Es, Os;
  n[449] !== c || n[450] !== s || n[451] !== B || n[452] !== N ? (Es = e => {
    e.conversationId === s && e.browserTabId === c && N.get(be).success(B.formatMessage({
      id: `thread.browser.screenshot.copied`,
      defaultMessage: `Screenshot saved to clipboard`,
      description: `Success toast shown after capturing the visible browser viewport to the clipboard`
    }));
  }, Os = [c, s, B, N], n[449] = c, n[450] = s, n[451] = B, n[452] = N, n[453] = Es, n[454] = Os) : (Es = n[453], Os = n[454]), fe(`browser-sidebar-screenshot-copied`, Es, Os);
  let ks, As;
  n[455] !== c || n[456] !== s || n[457] !== B || n[458] !== N ? (ks = e => {
    e.conversationId === s && e.browserTabId === c && N.get(be).success(B.formatMessage(I.urlCopied));
  }, As = [c, s, B, N], n[455] = c, n[456] = s, n[457] = B, n[458] = N, n[459] = ks, n[460] = As) : (ks = n[459], As = n[460]), fe(`browser-sidebar-url-copied`, ks, As);
  let js, Ms;
  n[461] !== c || n[462] !== s || n[463] !== B || n[464] !== N ? (js = e => {
    e.conversationId === s && e.browserTabId === c && N.get(be).danger(B.formatMessage({
      id: `thread.browser.screenshot.copyFailed`,
      defaultMessage: `Unable to capture screenshot`,
      description: `Error toast shown when capturing the visible browser viewport fails`
    }), {
      errorAnalytics: {
        toastId: `thread.browser.screenshot.copyFailed`
      }
    });
  }, Ms = [c, s, B, N], n[461] = c, n[462] = s, n[463] = B, n[464] = N, n[465] = js, n[466] = Ms) : (js = n[465], Ms = n[466]), fe(`browser-sidebar-screenshot-copy-failed`, js, Ms);
  let Ns, Ps;
  n[467] !== c || n[468] !== wt || n[469] !== V || n[470] !== W ? (Ns = () => {
    if (W == null) return;
    let e = Dt(W.comments, wt);
    Re.current = !0, V(t => [...t.filter(e => !ii(e, c)), ...e.map((e, t) => Ue(e, t + 1, c))]);
  }, Ps = [c, wt, V, W], n[467] = c, n[468] = wt, n[469] = V, n[470] = W, n[471] = Ns, n[472] = Ps) : (Ns = n[471], Ps = n[472]), (0, Q.useEffect)(Ns, Ps);
  let Fs;
  n[473] !== Br || n[474] !== wt || n[475] !== sa || n[476] !== W ? (Fs = () => {
    let e = W == null ? [] : Dt(W.comments, wt);
    if (Re.current) {
      Re.current = !1;
      return;
    }
    W != null && e.length > 0 && Br === 0 && sa({
      type: `clear-comments`
    });
  }, n[473] = Br, n[474] = wt, n[475] = sa, n[476] = W, n[477] = Fs) : Fs = n[477];
  let Is;
  n[478] !== Br || n[479] !== s || n[480] !== wt || n[481] !== W ? (Is = [Br, s, wt, W], n[478] = Br, n[479] = s, n[480] = wt, n[481] = W, n[482] = Is) : Is = n[482], (0, Q.useEffect)(Fs, Is);
  let Ls, Rs;
  n[483] !== c || n[484] !== s ? (Ls = () => () => {
    ct.current &&= (ne.dispatchMessage(`browser-sidebar-command`, {
      browserTabId: c,
      conversationId: s,
      command: {
        type: `set-original-view-enabled`,
        enabled: !1
      }
    }), !1);
  }, Rs = [c, s], n[483] = c, n[484] = s, n[485] = Ls, n[486] = Rs) : (Ls = n[485], Rs = n[486]), (0, Q.useEffect)(Ls, Rs);
  let zs;
  n[487] !== Ot || n[488] !== G.url || n[489] !== c || n[490] !== s || n[491] !== X ? (zs = (e, t) => {
    let n = Jt(e, Ot),
      r = Jt(G.url, Ot),
      i = M(n) === M(r);
    if (q.setAddressInputDraft(s, c, null), ze.current = !1, Ve.current = !1, pi(n), vi(pl), n.length === 0) return;
    Ti(q.getSnapshot(s, c)), Ci(!0);
    let a = `manual`;
    if (t ? a = `typeahead` : Wt(e, Ot) && (a = `search`), i) {
      mn(s, c), X({
        type: `reload`
      });
      return;
    }
    X({
      type: `navigate`,
      url: n,
      source: a,
      initiator: `address_bar`
    });
  }, n[487] = Ot, n[488] = G.url, n[489] = c, n[490] = s, n[491] = X, n[492] = zs) : zs = n[492];
  let Bs = zs,
    Z;
  n[493] === B ? Z = n[494] : (Z = B.formatMessage({
    id: `thread.browser.back`,
    defaultMessage: `Back`,
    description: `Button label for moving to the previous page in the inline browser's navigation history`
  }), n[493] = B, n[494] = Z);
  let Vs = Z,
    Us;
  n[495] === B ? Us = n[496] : (Us = B.formatMessage({
    id: `thread.browser.next`,
    defaultMessage: `Next`,
    description: `Button label for moving forward to the next page in the inline browser's navigation history; paired with the Back button`
  }), n[495] = B, n[496] = Us);
  let Ws = Us,
    Gs;
  n[497] === B ? Gs = n[498] : (Gs = B.formatMessage({
    id: `thread.browser.reload`,
    defaultMessage: `Reload page`,
    description: `Tooltip text for reloading the browser page`
  }), n[497] = B, n[498] = Gs);
  let Ks = Gs,
    Ys;
  n[499] === B ? Ys = n[500] : (Ys = B.formatMessage({
    id: `thread.browser.addressPlaceholder`,
    defaultMessage: `Search or enter a URL`,
    description: `Placeholder text for the browser address bar`
  }), n[499] = B, n[500] = Ys);
  let Xs = Ys,
    Zs;
  n[501] === B ? Zs = n[502] : (Zs = B.formatMessage({
    id: `thread.browser.openExternalBrowser`,
    defaultMessage: `Open in external browser`,
    description: `Tooltip text for opening the current inline browser URL outside the app`
  }), n[501] = B, n[502] = Zs);
  let Qs = Zs,
    $s;
  n[503] === B ? $s = n[504] : ($s = B.formatMessage({
    id: `thread.browser.commentModeUnavailableForSite`,
    defaultMessage: `Annotating is disabled for this website`,
    description: `Tooltip shown when annotating is disabled for the current website`
  }), n[503] = B, n[504] = $s);
  let ec = $s,
    tc;
  n[505] === B ? tc = n[506] : (tc = B.formatMessage(I.captureScreenshot), n[505] = B, n[506] = tc);
  let nc = tc,
    ic;
  n[507] !== di || n[508] !== G.securityState || n[509] !== Y ? (ic = !Y && G.securityState === `certificate-error` ? El(di) : null, n[507] = di, n[508] = G.securityState, n[509] = Y, n[510] = ic) : ic = n[510];
  let ac = ic,
    oc;
  n[511] !== di || n[512] !== ac || n[513] !== Y || n[514] !== L ? (oc = L || Y || ac != null ? di : ye(di), n[511] = di, n[512] = ac, n[513] = Y, n[514] = L, n[515] = oc) : oc = n[515];
  let sc = oc,
    cc;
  n[516] === sc ? cc = n[517] : (cc = sc.trim(), n[516] = sc, n[517] = cc);
  let lc = cc.length > 0;
  ft.conversationId === s && ft.isHeld && (!ri || !Lr) && mt(Dl(s));
  let uc = ri && Lr && Zn.isHeld,
    dc,
    fc;
  n[518] !== c || n[519] !== s || n[520] !== uc ? (dc = () => {
    ct.current !== uc && (ct.current = uc, ne.dispatchMessage(`browser-sidebar-command`, {
      browserTabId: c,
      conversationId: s,
      command: {
        type: `set-original-view-enabled`,
        enabled: uc
      }
    }));
  }, fc = [c, s, uc], n[518] = c, n[519] = s, n[520] = uc, n[521] = dc, n[522] = fc) : (dc = n[521], fc = n[522]), (0, Q.useEffect)(dc, fc);
  let pc;
  n[523] === X ? pc = n[524] : (pc = () => {
    X({
      type: `discard-pending-annotations`
    });
  }, n[523] = X, n[524] = pc);
  let mc = pc,
    hc;
  n[525] === Symbol.for(`react.memo_cache_sentinel`) ? (hc = e => {
    Ie.current = e;
  }, n[525] = hc) : hc = n[525];
  let gc = hc,
    _c;
  n[526] !== mc || n[527] !== Ia || n[528] !== N ? (_c = () => {
    ot(N, Pi, {
      onCloseAutoFocus: Ia,
      onConfirm: mc
    });
  }, n[526] = mc, n[527] = Ia, n[528] = N, n[529] = _c) : _c = n[529];
  let vc = _c,
    yc;
  n[530] === s ? yc = n[531] : (yc = () => {
    mt({
      conversationId: s,
      isHeld: !0
    });
  }, n[530] = s, n[531] = yc);
  let bc = yc,
    xc;
  n[532] === s ? xc = n[533] : (xc = () => {
    mt(e => e.conversationId === s && e.isHeld ? {
      ...e,
      isHeld: !1
    } : e);
  }, n[532] = s, n[533] = xc);
  let Sc = xc,
    Cc;
  n[534] === bc ? Cc = n[535] : (Cc = e => {
    e.currentTarget.setPointerCapture?.(e.pointerId), bc();
  }, n[534] = bc, n[535] = Cc);
  let wc = Cc,
    Tc;
  n[536] === bc ? Tc = n[537] : (Tc = e => {
    Ol(e.key) && !e.repeat && (e.preventDefault(), bc());
  }, n[536] = bc, n[537] = Tc);
  let Ec = Tc,
    Dc;
  n[538] === Sc ? Dc = n[539] : (Dc = e => {
    e.currentTarget.hasPointerCapture?.(e.pointerId) === !0 && e.currentTarget.releasePointerCapture(e.pointerId), Sc();
  }, n[538] = Sc, n[539] = Dc);
  let Oc = Dc,
    kc;
  n[540] === Sc ? kc = n[541] : (kc = e => {
    Ol(e.key) && (e.preventDefault(), Sc());
  }, n[540] = Sc, n[541] = kc);
  let Ac = kc,
    jc;
  n[542] === s ? jc = n[543] : (jc = e => {
    e.currentTarget.hasPointerCapture?.(e.pointerId) === !0 && e.currentTarget.releasePointerCapture(e.pointerId), mt(Dl(s));
  }, n[542] = s, n[543] = jc);
  let Mc = jc,
    Nc;
  n[544] !== Ot || n[545] !== N ? (Nc = e => {
    e.trim().length !== 0 && (yt(N, at, {}), yt(N, Ut, {
      action: $t.CODEX_IN_APP_BROWSER_TOOLBAR_ACTION_TYPE_OPENED_IN_EXTERNAL_BROWSER
    }), dn({
      href: Jt(e, Ot),
      initiator: `open_in_browser_bridge`,
      openTarget: `external-browser`
    }));
  }, n[544] = Ot, n[545] = N, n[546] = Nc) : Nc = n[546];
  let Pc = Nc,
    Fc = fl,
    {
      lastWebMcpToolCall: Ic,
      siteAnnotationFeatures: Lc,
      url: Rc,
      siteToolsAvailability: Bc,
      webMcpToolsRevision: Vc
    } = G,
    Hc;
  n[547] !== G.committedUrl || n[548] !== G.url || n[549] !== c || n[550] !== s || n[551] !== B || n[552] !== N ? (Hc = async e => {
    let t = Je?.browserHost;
    t != null && (await t.setSiteAnnotationFeaturesEnabled({
      browserTabId: c,
      conversationId: s,
      siteUrl: G.committedUrl ?? G.url,
      enabled: e
    }).catch(dl)) ? yt(N, Bt, {
      enabled: e
    }) : N.get(be).danger(B.formatMessage({
      id: `thread.browser.siteTools.annotationFeaturesUpdateFailed`,
      defaultMessage: `Unable to change custom annotation features`,
      description: `Error toast shown when a website's custom annotation setting cannot be updated, including when the browser navigated to another site`
    }), {
      errorAnalytics: {
        toastId: `thread.browser.siteTools.annotationFeaturesUpdateFailed`
      }
    });
  }, n[547] = G.committedUrl, n[548] = G.url, n[549] = c, n[550] = s, n[551] = B, n[552] = N, n[553] = Hc) : Hc = n[553];
  let Wc = Hc,
    Gc = N.value.routeKind === `local-thread` ? N.value.conversationId : void 0,
    Kc;
  n[554] !== c || n[555] !== z.id || n[556] !== B || n[557] !== N || n[558] !== Gc ? (Kc = () => {
    if (Gc == null) return;
    let e = B.formatMessage({
      id: `codex.localConversation.sources.title`,
      defaultMessage: `Sources`,
      description: `Title for the section and tab containing sources of information used by the conversation`
    });
    ho(N, {
      conversationId: Gc,
      hostId: z.id
    }, e, c);
  }, n[554] = c, n[555] = z.id, n[556] = B, n[557] = N, n[558] = Gc, n[559] = Kc) : Kc = n[559];
  let qc = Gc == null ? void 0 : Kc,
    Jc;
  n[560] !== ec || n[561] !== c || n[562] !== $i || n[563] !== s || n[564] !== kr || n[565] !== K || n[566] !== Pn || n[567] !== P || n[568] !== nr || n[569] !== Un || n[570] !== Qn || n[571] !== Qi || n[572] !== d || n[573] !== Vo ? (Jc = P ? (0, $.jsx)(`div`, {
    "aria-hidden": !K,
    className: kr ? Ht(`min-w-0`, {
      flex: K,
      hidden: !K
    }) : Ht(`ease-basic flex origin-right justify-end transition-[max-width,margin-inline-start,opacity,scale] duration-basic motion-reduce:transition-none`, K ? `ms-0 max-w-40 scale-100 overflow-visible opacity-100` : `pointer-events-none -ms-1.5 max-w-0 scale-0 overflow-hidden opacity-0`),
    children: (0, $.jsx)(Oo, {
      annotationTarget: {
        browserTabId: c,
        conversationId: s
      },
      floating: kr,
      activeHoverSuppressed: Un,
      disabled: Qi,
      disabledTooltipContent: Qn ? ec : void 0,
      onActiveHoverSuppressedChange: Wn,
      onInteractionModeChange: (e, t) => {
        Vo(e, e === oi.COMMENT && !t ? Ml.FOCUS : Ml.NONE, e === oi.COMMENT ? `toolbar-button` : void 0);
      },
      interactionMode: nr ? oi.COMMENT : oi.BROWSE,
      shortcutLabel: $i,
      shouldShowCoachmark: K && d && Pn
    })
  }) : null, n[560] = ec, n[561] = c, n[562] = $i, n[563] = s, n[564] = kr, n[565] = K, n[566] = Pn, n[567] = P, n[568] = nr, n[569] = Un, n[570] = Qn, n[571] = Qi, n[572] = d, n[573] = Vo, n[574] = Jc) : Jc = n[574];
  let Yc = Jc,
    Xc;
  n[575] !== Lo || n[576] !== G.isAnnotationAddModifierPressed || n[577] !== G.isAnnotationSuspended || n[578] !== Br || n[579] !== c || n[580] !== nc || n[581] !== s || n[582] !== sc || n[583] !== zo || n[584] !== kr || n[585] !== Ec || n[586] !== Ac || n[587] !== Mc || n[588] !== wc || n[589] !== Oc || n[590] !== vc || n[591] !== Wr || n[592] !== Lr || n[593] !== ri || n[594] !== gt || n[595] !== uc || n[596] !== D || n[597] !== Sc ? (Xc = ri ? (0, $.jsx)(rc, {
    floating: kr,
    displayUrl: sc,
    browserTabId: c,
    captureScreenshotLabel: nc,
    conversationId: s,
    toolbarRef: Ee,
    hasPendingAnnotations: Wr,
    hasQueuedTweaks: Lr,
    isAddModifierPressed: gt || G.isAnnotationAddModifierPressed === !0,
    isOriginalViewEnabled: uc,
    isSuspended: G.isAnnotationSuspended === !0,
    isScreenshotCaptureEnabled: D,
    onAddToComposer: Lo,
    onDiscard: vc,
    onExit: zo,
    onOriginalViewBlur: Sc,
    onOriginalViewKeyDown: Ec,
    onOriginalViewKeyUp: Ac,
    onOriginalViewPointerCancel: Mc,
    onOriginalViewPointerDown: wc,
    onOriginalViewPointerUp: Oc,
    onSubmit: () => ci(s),
    pendingAnnotationCount: Br
  }, c) : null, n[575] = Lo, n[576] = G.isAnnotationAddModifierPressed, n[577] = G.isAnnotationSuspended, n[578] = Br, n[579] = c, n[580] = nc, n[581] = s, n[582] = sc, n[583] = zo, n[584] = kr, n[585] = Ec, n[586] = Ac, n[587] = Mc, n[588] = wc, n[589] = Oc, n[590] = vc, n[591] = Wr, n[592] = Lr, n[593] = ri, n[594] = gt, n[595] = uc, n[596] = D, n[597] = Sc, n[598] = Xc) : Xc = n[598];
  let Zc = Xc,
    Qc = T || void 0,
    $c = K ? `webview` : `address`,
    el;
  n[599] !== c || n[600] !== s || n[601] !== Ia || n[602] !== T || n[603] !== d || n[604] !== Rt ? (el = d && !T && Rt != null && zt != null ? (0, $.jsx)(Pl, {
    hostname: Rt.hostname,
    isExitingAnnotationMode: Rt.requestedInteractionMode === `browse`,
    onCloseAutoFocus: Ia,
    onRespond: e => zt({
      browserTabId: c,
      conversationId: s,
      requestId: Rt.id,
      allow: e
    })
  }, Rt.id) : null, n[599] = c, n[600] = s, n[601] = Ia, n[602] = T, n[603] = d, n[604] = Rt, n[605] = el) : el = n[605];
  let nl;
  n[606] !== c || n[607] !== s || n[608] !== Bs || n[609] !== K || n[610] !== hr || n[611] !== xn || n[612] !== j || n[613] !== W ? (nl = !hr && (W == null || !K && !xn) ? (0, $.jsx)(Qo, {
    onNavigate: e => Bs(e, !1),
    browserConversationId: s,
    browserTabId: c,
    target: j
  }) : null, n[606] = c, n[607] = s, n[608] = Bs, n[609] = K, n[610] = hr, n[611] = xn, n[612] = j, n[613] = W, n[614] = nl) : nl = n[614];
  let rl = d && !T,
    il = j === `bottom` ? he : me,
    al;
  n[615] !== ve || n[616] !== G.url || n[617] !== rn || n[618] !== Pn || n[619] !== T || n[620] !== d || n[621] !== H || n[622] !== il ? (al = (0, $.jsx)(Hs, {
    hasLoadedBrowserPage: rn,
    isExiting: T,
    isPanelSettled: Pn,
    isVisible: d,
    layoutMotion: il,
    portalContainer: ve,
    service: Hn,
    sidebarMotion: H,
    url: G.url,
    onModalVisibilityChange: zn
  }), n[615] = ve, n[616] = G.url, n[617] = rn, n[618] = Pn, n[619] = T, n[620] = d, n[621] = H, n[622] = il, n[623] = al) : al = n[623];
  let ol;
  n[624] !== G.committedUrl || n[625] !== G.title || n[626] !== c || n[627] !== rl || n[628] !== al ? (ol = (0, $.jsx)(Mo, {
    browserTabId: c,
    committedUrl: G.committedUrl,
    isVisible: rl,
    service: Hn,
    title: G.title,
    children: al
  }), n[624] = G.committedUrl, n[625] = G.title, n[626] = c, n[627] = rl, n[628] = al, n[629] = ol) : ol = n[629];
  let sl = kr ? Zc : null,
    Il = !kr && Zc,
    Ll = Ji ? `no-drag` : `draggable`,
    Rl = !kr && ri && `hidden`,
    zl;
  n[630] !== Ll || n[631] !== Rl ? (zl = Ht(Ll, Rl), n[630] = Ll, n[631] = Rl, n[632] = zl) : zl = n[632];
  let Bl = !kr && ri,
    Vl;
  n[633] !== Y || n[634] !== Ea ? (Vl = e => {
    let t = e.target;
    !(t instanceof Node) || !e.currentTarget.contains(t) || je.current?.contains(t) || t instanceof Element && t.closest(`[data-browser-sidebar-skip-address-commit='true']`) != null || (Oi(!1), Ii(!1), Y && Ea());
  }, n[633] = Y, n[634] = Ea, n[635] = Vl) : Vl = n[635];
  let Hl = G.canGoBack,
    Ul = G.canGoForward,
    Wl = G.isLoading,
    Gl,
    Kl;
  n[636] === la ? (Gl = n[637], Kl = n[638]) : (Gl = e => void la(e, `back`), Kl = e => void la(e, `forward`), n[636] = la, n[637] = Gl, n[638] = Kl);
  let ql;
  n[639] === X ? ql = n[640] : (ql = () => X({
    type: `reload`
  }), n[639] = X, n[640] = ql);
  let Jl = W == null,
    Yl,
    Xl;
  n[641] === Symbol.for(`react.memo_cache_sentinel`) ? (Yl = e => {
    e.target === Ne.current && vi(ul);
  }, Xl = e => {
    e.target === Ne.current && vi(ll);
  }, n[641] = Yl, n[642] = Xl) : (Yl = n[641], Xl = n[642]);
  let Zl;
  n[643] !== Y || n[644] !== _a ? (Zl = () => {
    _a({
      shouldSelectAddress: !Y
    });
  }, n[643] = Y, n[644] = _a, n[645] = Zl) : Zl = n[645];
  let Ql;
  n[646] === _a ? Ql = n[647] : (Ql = () => {
    _a({
      shouldSelectAddress: !1
    });
  }, n[646] = _a, n[647] = Ql);
  let $l = G.securityState,
    eu;
  n[648] !== G.siteAnnotationFeaturesEnabled || n[649] !== c || n[650] !== Lt || n[651] !== s || n[652] !== Rc || n[653] !== sc || n[654] !== Wc || n[655] !== Y || n[656] !== sn || n[657] !== Mi || n[658] !== d || n[659] !== Ic || n[660] !== qc || n[661] !== Lc || n[662] !== Bc || n[663] !== Gc || n[664] !== Vc ? (eu = Y ? null : (0, $.jsxs)(`div`, {
    className: `peer pointer-events-none absolute inset-0 z-10 flex min-w-0 items-center justify-center`,
    children: [(0, $.jsx)(`div`, {
      className: `pointer-events-auto shrink-0`,
      role: `presentation`,
      onClick: cl,
      children: (0, $.jsx)(tl, {
        browserTabId: c,
        conversationId: s,
        currentUrl: Rc,
        getWebMcpInspectorData: Ct,
        isBrowserPanelVisible: d,
        isBrowserUseActive: sn,
        canUseWebMcp: Lt,
        lastToolCall: Ic,
        onOpenChange: Ni,
        onOpenSources: qc,
        onSiteAnnotationFeaturesEnabledChange: e => {
          Wc(e);
        },
        open: Mi,
        setSiteAnnotationFeaturePreview: Je?.browserHost?.setSiteAnnotationFeaturePreview,
        siteAnnotationFeatures: Lc,
        siteAnnotationFeaturesEnabled: G.siteAnnotationFeaturesEnabled !== !1,
        sourcesConversationId: Gc,
        siteToolsAvailability: Bc,
        toolsRevision: Vc
      })
    }), (0, $.jsx)(`span`, {
      "aria-hidden": !0,
      className: `invisible min-w-0 truncate text-sm leading-[18px]`,
      children: sc
    }), (0, $.jsx)(`span`, {
      "aria-hidden": !0,
      className: `w-7 shrink-0`
    })]
  }), n[648] = G.siteAnnotationFeaturesEnabled, n[649] = c, n[650] = Lt, n[651] = s, n[652] = Rc, n[653] = sc, n[654] = Wc, n[655] = Y, n[656] = sn, n[657] = Mi, n[658] = d, n[659] = Ic, n[660] = qc, n[661] = Lc, n[662] = Bc, n[663] = Gc, n[664] = Vc, n[665] = eu) : eu = n[665];
  let tu;
  n[666] === eu ? tu = n[667] : (tu = (0, $.jsx)($.Fragment, {
    children: eu
  }), n[666] = eu, n[667] = tu);
  let nu;
  n[668] !== c || n[669] !== s || n[670] !== d ? (nu = d ? e => (0, $.jsx)(Ds, {
    browserTabId: c,
    conversationId: s,
    children: e
  }) : void 0, n[668] = c, n[669] = s, n[670] = d, n[671] = nu) : nu = n[671];
  let ru = kr && `placeholder:text-center placeholder-shown:px-2`,
    iu = !Y && lc && Nl,
    au = ac != null && `text-transparent caret-transparent`,
    ou;
  n[672] !== ru || n[673] !== iu || n[674] !== au ? (ou = Ht(ru, `peer-has-[button]:px-7`, iu, au), n[672] = ru, n[673] = iu, n[674] = au, n[675] = ou) : ou = n[675];
  let su = G.url,
    cu;
  n[676] === Symbol.for(`react.memo_cache_sentinel`) ? (cu = [En], n[676] = cu) : cu = n[676];
  let lu;
  n[677] === s ? lu = n[678] : (lu = Mt(s), n[677] = s, n[678] = lu);
  let uu;
  n[679] !== J || n[680] !== c || n[681] !== s || n[682] !== Mr ? (uu = e => {
    pi(e), vi(e => ({
      ...e,
      browserUrl: J,
      hasEdited: !0,
      wasCanceledByNavigation: !1
    })), Mr && q.setAddressInputDraft(s, c, {
      browserUrl: J,
      value: e
    });
  }, n[679] = J, n[680] = c, n[681] = s, n[682] = Mr, n[683] = uu) : uu = n[683];
  let du;
  n[684] !== G.url || n[685] !== Sa ? (du = () => {
    ze.current && pi(G.url), Sa(), He.current = !1, Ne.current?.blur();
  }, n[684] = G.url, n[685] = Sa, n[686] = du) : du = n[686];
  let fu;
  n[687] === Symbol.for(`react.memo_cache_sentinel`) ? (fu = () => hi(!1), n[687] = fu) : fu = n[687];
  let pu;
  n[688] === _a ? pu = n[689] : (pu = () => {
    _a({
      shouldSelectAddress: !0
    });
  }, n[688] = _a, n[689] = pu);
  let mu = wi !== void 0 && W === wi,
    hu;
  n[690] !== Nr || n[691] !== Xs || n[692] !== Fr || n[693] !== he || n[694] !== G.url || n[695] !== c || n[696] !== wa || n[697] !== sc || n[698] !== ka || n[699] !== Bs || n[700] !== Y || n[701] !== d || n[702] !== Ga || n[703] !== j || n[704] !== me || n[705] !== Ea || n[706] !== ou || n[707] !== lu || n[708] !== uu || n[709] !== du || n[710] !== pu || n[711] !== mu ? (hu = (0, $.jsx)(Nr, {
    addressBarRef: je,
    addressInputRef: Ne,
    className: ou,
    addressValue: sc,
    bottomPanelAnimation: he,
    currentAddress: su,
    id: c,
    allowEmptySuggestions: Fr,
    providers: cu,
    conversationId: lu,
    hasEditedAddressRef: ze,
    isAddressEditing: Y,
    isStoppingAddressEditingRef: He,
    isVisible: d,
    onAddressValueChange: uu,
    onAcceptAddressEditing: du,
    onCancelAddressEditing: wa,
    onNavigate: Bs,
    onEnsureAddressEditing: ka,
    onFinishAddressEditing: fu,
    onFind: Ga,
    onStartAddressEditing: pu,
    onStopAddressEditing: Ea,
    panelTarget: j,
    placeholder: Xs,
    rightPanelLayoutTick: me,
    showAddressSuggestionsRef: Pe,
    shouldKeepAddressSelectedRef: Ve,
    submittedAddressStillPending: mu
  }), n[690] = Nr, n[691] = Xs, n[692] = Fr, n[693] = he, n[694] = G.url, n[695] = c, n[696] = wa, n[697] = sc, n[698] = ka, n[699] = Bs, n[700] = Y, n[701] = d, n[702] = Ga, n[703] = j, n[704] = me, n[705] = Ea, n[706] = ou, n[707] = lu, n[708] = uu, n[709] = du, n[710] = pu, n[711] = mu, n[712] = hu) : hu = n[712];
  let gu;
  n[713] !== di || n[714] !== kr || n[715] !== lc || n[716] !== Y || n[717] !== te || n[718] !== Pc || n[719] !== Qs ? (gu = !te && (0, $.jsx)(f, {
    tooltipContent: Qs,
    disabled: !lc,
    children: (0, $.jsx)(`button`, {
      type: `button`,
      "data-browser-sidebar-open-external": `true`,
      "aria-label": Qs,
      disabled: !lc,
      onPointerDown: Fc,
      onMouseDown: Fc,
      onClick: e => {
        e.stopPropagation(), Pc(Y ? Ne.current?.value ?? di : di);
      },
      className: Ht(`flex h-[28px] w-7 shrink-0 items-center justify-center text-default outline-none transition-[background-color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`, kr ? `rounded-full` : `rounded-l-none rounded-r-[10px]`, Y ? `opacity-100` : `opacity-0 group-hover/address-bar:opacity-100 group-focus-within/address-bar:opacity-100`, lc ? `cursor-interaction hover:bg-text/5 focus-visible:bg-text/5` : `cursor-default opacity-0`),
      children: (0, $.jsx)(ti, {
        className: `icon-xs`
      })
    })
  }), n[713] = di, n[714] = kr, n[715] = lc, n[716] = Y, n[717] = te, n[718] = Pc, n[719] = Qs, n[720] = gu) : gu = n[720];
  let _u;
  n[721] !== G.securityState || n[722] !== c || n[723] !== ac || n[724] !== s || n[725] !== Rc || n[726] !== kr || n[727] !== lc || n[728] !== Y || n[729] !== Fi || n[730] !== yi || n[731] !== Zl || n[732] !== Ql || n[733] !== tu || n[734] !== nu || n[735] !== hu || n[736] !== gu ? (_u = (0, $.jsx)(ta, {
    floating: kr,
    addressBarRef: je,
    addressContainerRef: Ae,
    addressContentsRef: Me,
    browserTabId: c,
    certificateErrorAddressParts: ac,
    conversationId: s,
    currentUrl: Rc,
    hasAddress: lc,
    isAddressEditing: Y,
    isSiteInfoOpen: Fi,
    onAddressFocusCapture: Yl,
    onAddressBlurCapture: Xl,
    onAddressClick: Zl,
    onAddressContextMenu: Ql,
    onSiteInfoOpenChange: Ii,
    openSiteInfo: Je?.browserHost?.openSiteInfo,
    securityState: $l,
    shouldAnimateAddressExpansion: yi,
    siteTools: tu,
    renderPermissionPrompt: nu,
    input: hu,
    externalOpen: gu
  }), n[721] = G.securityState, n[722] = c, n[723] = ac, n[724] = s, n[725] = Rc, n[726] = kr, n[727] = lc, n[728] = Y, n[729] = Fi, n[730] = yi, n[731] = Zl, n[732] = Ql, n[733] = tu, n[734] = nu, n[735] = hu, n[736] = gu, n[737] = _u) : _u = n[737];
  let vu = kr ? Yc : null,
    yu;
  n[738] === Jn ? yu = n[739] : (yu = Jn == null ? null : (0, $.jsx)(qs, {
    projectId: Jn.projectId
  }), n[738] = Jn, n[739] = yu);
  let bu, xu;
  n[740] === Symbol.for(`react.memo_cache_sentinel`) ? (bu = e => {
    e && (Oe.current = !1), Ai(e);
  }, xu = e => {
    Oe.current && e.preventDefault(), Oe.current = !1;
  }, n[740] = bu, n[741] = xu) : (bu = n[740], xu = n[741]);
  let Su;
  n[742] === Symbol.for(`react.memo_cache_sentinel`) ? (Su = {
    toolbarRef: Te,
    addressContainerRef: Ae,
    addressContentsRef: Me,
    addressInputRef: Ne
  }, n[742] = Su) : Su = n[742];
  let Cu;
  n[743] !== c || n[744] !== s || n[745] !== ki || n[746] !== d ? (Cu = (0, $.jsx)($.Fragment, {
    children: (0, $.jsx)(ms, {
      browserTabId: c,
      conversationId: s,
      isVisible: d,
      open: ki,
      onOpenChange: bu,
      onCloseAutoFocus: xu,
      overflowAnchorRef: De,
      layout: Su
    })
  }), n[743] = c, n[744] = s, n[745] = ki, n[746] = d, n[747] = Cu) : Cu = n[747];
  let wu = !kr && Yc,
    Tu;
  n[748] !== c || n[749] !== s || n[750] !== Li || n[751] !== d ? (Tu = Bn == null ? null : (0, $.jsx)(wo, {
    browserTabId: c,
    conversationId: s,
    downloadsService: Bn,
    isVisible: d,
    open: Li,
    onOpenChange: Ri
  }), n[748] = c, n[749] = s, n[750] = Li, n[751] = d, n[752] = Tu) : Tu = n[752];
  let Eu;
  n[753] === Tu ? Eu = n[754] : (Eu = (0, $.jsx)($.Fragment, {
    children: Tu
  }), n[753] = Tu, n[754] = Eu);
  let Du;
  n[755] !== G.url || n[756] !== c || n[757] !== s || n[758] !== l || n[759] !== K || n[760] !== z.id ? (Du = K ? (0, $.jsx)(qo, {
    browserTabId: c,
    conversationId: s,
    cwd: l,
    hostId: z.id,
    url: G.url
  }) : null, n[755] = G.url, n[756] = c, n[757] = s, n[758] = l, n[759] = K, n[760] = z.id, n[761] = Du) : Du = n[761];
  let Ou;
  n[762] === Du ? Ou = n[763] : (Ou = (0, $.jsx)($.Fragment, {
    children: Du
  }), n[762] = Du, n[763] = Ou);
  let ku;
  n[764] !== kr || n[765] !== yu || n[766] !== Cu || n[767] !== wu || n[768] !== Eu || n[769] !== Ou ? (ku = (0, $.jsxs)(ia, {
    floating: kr,
    children: [yu, Cu, wu, Eu, Ou]
  }), n[764] = kr, n[765] = yu, n[766] = Cu, n[767] = wu, n[768] = Eu, n[769] = Ou, n[770] = ku) : ku = n[770];
  let Au = O && K,
    ju;
  n[771] === X ? ju = n[772] : (ju = () => {
    X({
      type: `capture-screenshot`
    });
  }, n[771] = X, n[772] = ju);
  let Mu;
  n[773] !== c || n[774] !== s || n[775] !== N.query ? (Mu = () => {
    N.query.invalidate(ss, {
      browserTabId: c,
      conversationId: s
    }), Oe.current = !1, Ai(!0);
  }, n[773] = c, n[774] = s, n[775] = N.query, n[776] = Mu) : Mu = n[776];
  let Nu;
  n[777] === X ? Nu = n[778] : (Nu = () => {
    X({
      type: `print`
    });
  }, n[777] = X, n[778] = Nu);
  let Pu;
  n[779] !== G.url || n[780] !== K ? (Pu = !K || G.url.trim().length === 0, n[779] = G.url, n[780] = K, n[781] = Pu) : Pu = n[781];
  let Fu;
  n[782] === Symbol.for(`react.memo_cache_sentinel`) ? (Fu = () => {
    Fe.current?.({
      type: `reset-zoom`
    });
  }, n[782] = Fu) : Fu = n[782];
  let Iu, Lu;
  n[783] === Symbol.for(`react.memo_cache_sentinel`) ? (Iu = () => {
    Fe.current?.({
      type: `step-zoom`,
      delta: 1
    });
  }, Lu = () => {
    Fe.current?.({
      type: `step-zoom`,
      delta: -1
    });
  }, n[783] = Iu, n[784] = Lu) : (Iu = n[783], Lu = n[784]);
  let Ru;
  n[785] !== Di || n[786] !== E || n[787] !== k || n[788] !== D || n[789] !== A || n[790] !== Ga || n[791] !== Au || n[792] !== ju || n[793] !== Mu || n[794] !== Nu || n[795] !== Pu ? (Ru = (0, $.jsx)($.Fragment, {
    children: (0, $.jsx)(`div`, {
      className: `max-w-8 origin-right scale-100 overflow-visible opacity-100 transition-[max-width,opacity,transform] duration-basic ease-basic motion-reduce:transition-none`,
      children: (0, $.jsx)(Uc, {
        triggerRef: De,
        browserProfileImportService: Hn,
        isDeviceToolbarEnabled: E,
        isFloatingComposerMenuItemVisible: Au,
        isFloatingComposerVisible: k,
        isPrintMenuItemVisible: !0,
        isScreenshotCaptureEnabled: D,
        onCaptureScreenshot: ju,
        onOpenFindInPage: Ga,
        onOpenChange: Oi,
        onOpenExtensions: Mu,
        onPrint: Nu,
        pageActionsDisabled: Pu,
        onResetZoom: Fu,
        onToggleFloatingComposer: A,
        onZoomIn: Iu,
        onZoomOut: Lu,
        open: Di
      })
    })
  }), n[785] = Di, n[786] = E, n[787] = k, n[788] = D, n[789] = A, n[790] = Ga, n[791] = Au, n[792] = ju, n[793] = Mu, n[794] = Nu, n[795] = Pu, n[796] = Ru) : Ru = n[796];
  let zu;
  n[797] !== Jn || n[798] !== kr ? (zu = Jn == null ? null : (0, $.jsx)(ia, {
    floating: kr,
    children: (0, $.jsx)(Js, {
      projectId: Jn.projectId
    })
  }), n[797] = Jn, n[798] = kr, n[799] = zu) : zu = n[799];
  let Bu;
  n[800] !== ku || n[801] !== Ru || n[802] !== zu ? (Bu = (0, $.jsxs)($.Fragment, {
    children: [ku, Ru, zu]
  }), n[800] = ku, n[801] = Ru, n[802] = zu, n[803] = Bu) : Bu = n[803];
  let Vu;
  n[804] !== Vs || n[805] !== G.canGoBack || n[806] !== G.canGoForward || n[807] !== G.isLoading || n[808] !== kr || n[809] !== Ws || n[810] !== Ks || n[811] !== zl || n[812] !== Bl || n[813] !== Vl || n[814] !== Gl || n[815] !== Kl || n[816] !== ql || n[817] !== Jl || n[818] !== _u || n[819] !== vu || n[820] !== Bu ? (Vu = (0, $.jsx)(Gi, {
    floating: kr,
    toolbarRef: Te,
    toolbarClassName: zl,
    toolbarAriaHidden: Bl,
    onToolbarPointerDown: Vl,
    backLabel: Vs,
    canGoBack: Hl,
    canGoForward: Ul,
    forwardLabel: Ws,
    isLoading: Wl,
    onBack: Gl,
    onForward: Kl,
    onReload: ql,
    reloadDisabled: Jl,
    reloadLabel: Ks,
    address: _u,
    annotationButton: vu,
    trailing: Bu
  }), n[804] = Vs, n[805] = G.canGoBack, n[806] = G.canGoForward, n[807] = G.isLoading, n[808] = kr, n[809] = Ws, n[810] = Ks, n[811] = zl, n[812] = Bl, n[813] = Vl, n[814] = Gl, n[815] = Kl, n[816] = ql, n[817] = Jl, n[818] = _u, n[819] = vu, n[820] = Bu, n[821] = Vu) : Vu = n[821];
  let Hu;
  n[822] !== Ln || n[823] !== Il || n[824] !== Vu ? (Hu = (0, $.jsxs)(`div`, {
    className: `relative h-full min-w-0`,
    "aria-hidden": Ln,
    inert: Ln,
    children: [Il, Vu]
  }), n[822] = Ln, n[823] = Il, n[824] = Vu, n[825] = Hu) : Hu = n[825];
  let Uu;
  n[826] !== G || n[827] !== c || n[828] !== Xi || n[829] !== s || n[830] !== l || n[831] !== K || n[832] !== Gt || n[833] !== P || n[834] !== Ln || n[835] !== sn || n[836] !== E || n[837] !== T || n[838] !== O || n[839] !== d || n[840] !== j || n[841] !== bn || n[842] !== hn || n[843] !== S || n[844] !== X || n[845] !== Zi || n[846] !== Tr || n[847] !== _r || n[848] !== br || n[849] !== nl || n[850] !== ol || n[851] !== sl || n[852] !== Hu ? (Uu = (0, $.jsx)(zc, {
    browserState: G,
    browserTabId: c,
    browserWebviewInitialUrl: Xi,
    conversationId: s,
    cwd: l,
    dispatchZoomCommandRef: Fe,
    emptyState: nl,
    hasBrowserPage: K,
    hasSnapshot: Gt,
    isAnnotationModeEnabled: P,
    isBrowserProfileImportNuxModalVisible: Ln,
    isBrowserUseActive: sn,
    isDeviceToolbarEnabled: E,
    isExiting: T,
    isFloatingComposerToggleVisible: O,
    isVisible: d,
    panelTarget: j,
    pendingAdoptedWebContentsId: bn,
    pendingWebviewAdoptionLease: hn,
    profileImportNux: ol,
    rootRef: ge,
    renderSlots: S,
    sendBrowserCommand: X,
    shouldBootstrapHiddenWebview: Zi,
    shouldPaintWebContents: Tr,
    shouldPrewarmEmptyBrowserTab: _r,
    shouldRenderWebContents: br,
    annotationToolbar: sl,
    toolbar: Hu,
    viewportRef: U,
    webContentsRef: we
  }), n[826] = G, n[827] = c, n[828] = Xi, n[829] = s, n[830] = l, n[831] = K, n[832] = Gt, n[833] = P, n[834] = Ln, n[835] = sn, n[836] = E, n[837] = T, n[838] = O, n[839] = d, n[840] = j, n[841] = bn, n[842] = hn, n[843] = S, n[844] = X, n[845] = Zi, n[846] = Tr, n[847] = _r, n[848] = br, n[849] = nl, n[850] = ol, n[851] = sl, n[852] = Hu, n[853] = Uu) : Uu = n[853];
  let Wu;
  n[854] !== ar || n[855] !== c || n[856] !== s || n[857] !== P ? (Wu = P ? (0, $.jsx)(Aa, {
    browserTabId: c,
    conversationId: s,
    defaultCreateSubmitMode: ar.defaultSubmitMode,
    onActiveEditorDismissRequestChange: gc
  }) : null, n[854] = ar, n[855] = c, n[856] = s, n[857] = P, n[858] = Wu) : Wu = n[858];
  let Gu;
  return n[859] !== Ji || n[860] !== T || n[861] !== Qc || n[862] !== $c || n[863] !== el || n[864] !== Uu || n[865] !== Wu ? (Gu = (0, $.jsxs)(`div`, {
    ref: Ce,
    className: `relative h-full min-h-0 w-full min-w-0`,
    "aria-hidden": Qc,
    "data-browser-sidebar-chrome-expanded": Ji,
    "data-browser-sidebar-primary-focus-target": $c,
    inert: T,
    tabIndex: -1,
    children: [el, Uu, Wu]
  }), n[859] = Ji, n[860] = T, n[861] = Qc, n[862] = $c, n[863] = el, n[864] = Uu, n[865] = Wu, n[866] = Gu) : Gu = n[866], Gu;
}
