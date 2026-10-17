function zc(e) {
  let t = (0, Kc.c)(213),
    {
      annotationToolbar: n,
      browserState: r,
      browserTabId: i,
      browserWebviewInitialUrl: a,
      conversationId: s,
      cwd: c,
      dispatchZoomCommandRef: l,
      emptyState: u,
      hasBrowserPage: d,
      hasSnapshot: f,
      isAnnotationModeEnabled: p,
      isBrowserProfileImportNuxModalVisible: h,
      isBrowserUseActive: g,
      isDeviceToolbarEnabled: _,
      isExiting: v,
      isFloatingComposerToggleVisible: y,
      isVisible: b,
      panelTarget: x,
      pendingAdoptedWebContentsId: S,
      pendingWebviewAdoptionLease: w,
      profileImportNux: T,
      renderSlots: ee,
      rootRef: E,
      sendBrowserCommand: D,
      shouldBootstrapHiddenWebview: O,
      shouldPaintWebContents: k,
      shouldPrewarmEmptyBrowserTab: A,
      shouldRenderWebContents: j,
      toolbar: M,
      viewportRef: N,
      webContentsRef: P
    } = e,
    F = C(pe),
    te = ue(`3528415127`),
    I = o(),
    L = (0, qc.useId)(),
    R = Xe(),
    z = st(),
    re = qn(),
    ie = pn(re),
    ae;
  t[0] !== R.defaultLocale || t[1] !== R.locale || t[2] !== R.messages ? (ae = Object.keys(R.messages).length > 0 ? R.locale : R.defaultLocale, t[0] = R.defaultLocale, t[1] = R.locale, t[2] = R.messages, t[3] = ae) : ae = t[3];
  let oe = ae,
    se;
  t[4] === R.messages ? se = t[5] : (se = Object.fromEntries(Object.entries(R.messages).filter(Vc)), t[4] = R.messages, t[5] = se);
  let ce = se,
    {
      rightPanelLayoutTick: B
    } = jn(),
    le = m(er),
    V = (0, qc.useRef)(null),
    de = (0, qc.useRef)(null),
    [H, fe] = (0, qc.useState)(null),
    [me, he] = (0, qc.useState)(null),
    ge;
  t[6] !== i || t[7] !== s ? (ge = {
    browserTabId: i,
    conversationId: s,
    scale: null
  }, t[6] = i, t[7] = s, t[8] = ge) : ge = t[8];
  let [_e, ve] = (0, qc.useState)(ge);
  (_e.browserTabId !== i || _e.conversationId !== s) && ve({
    browserTabId: i,
    conversationId: s,
    scale: null
  });
  let ye = m(x === `right` && Br),
    be = m(ye ? qr : 0),
    xe;
  t[9] !== i || t[10] !== s ? (xe = () => q.getDeviceToolbarTabState(s, i), t[9] = i, t[10] = s, t[11] = xe) : xe = t[11];
  let Se = xe,
    Ce = (0, qc.useSyncExternalStore)(q.subscribe, Se, Se).toolbarState,
    U,
    we,
    Te,
    De,
    Oe,
    ke,
    Ae,
    Me,
    Ne,
    Pe,
    Fe,
    Le,
    Re;
  if (t[12] !== be || t[13] !== H || t[14] !== r.zoomPercent || t[15] !== i || t[16] !== s || t[17] !== Ce || t[18] !== _e.scale || t[19] !== d || t[20] !== _ || t[21] !== y || t[22] !== b || t[23] !== x || t[24] !== O || t[25] !== j || t[26] !== z) {
    U = _ && Ce.isEnabled && d ? Ce : {
      ...Ce,
      isEnabled: !1
    };
    let e = H == null || U.isEnabled || y || be === 0 ? H : {
      ...H,
      height: H.height > 0 ? Math.max(1, H.height - be) : 0
    };
    Ne = Ie(H, U), ke = Ne?.webviewBounds ?? e;
    let n = Ne?.visualBounds ?? e;
    Ae = Ne?.scale ?? 1, Te = Gc(n, z), De = Ae * z, Le = j && (Te != null || O), Pe = Le ? `${s}\0${i}` : null, Me = _e.scale ?? Ae, Oe = Qi(r.zoomPercent, Me), we = U.isEnabled ? je : void 0, Fe = x === `bottom` ? `bottom-panel` : `right-panel`, Re = b && U.isEnabled && Ne != null ? W({
      fitHeight: Ne.fitHeight,
      height: U.height,
      width: U.width
    }) : null, t[12] = be, t[13] = H, t[14] = r.zoomPercent, t[15] = i, t[16] = s, t[17] = Ce, t[18] = _e.scale, t[19] = d, t[20] = _, t[21] = y, t[22] = b, t[23] = x, t[24] = O, t[25] = j, t[26] = z, t[27] = U, t[28] = we, t[29] = Te, t[30] = De, t[31] = Oe, t[32] = ke, t[33] = Ae, t[34] = Me, t[35] = Ne, t[36] = Pe, t[37] = Fe, t[38] = Le, t[39] = Re;
  } else U = t[27], we = t[28], Te = t[29], De = t[30], Oe = t[31], ke = t[32], Ae = t[33], Me = t[34], Ne = t[35], Pe = t[36], Fe = t[37], Le = t[38], Re = t[39];
  let ze = Re,
    Be;
  t[40] !== U.height || t[41] !== U.isEnabled || t[42] !== U.width || t[43] !== ie || t[44] !== Te || t[45] !== De || t[46] !== i || t[47] !== s || t[48] !== c || t[49] !== R.defaultLocale || t[50] !== p || t[51] !== g || t[52] !== b || t[53] !== Fe || t[54] !== ce || t[55] !== oe || t[56] !== j ? (Be = e => {
    let t = e === void 0 ? {} : e,
      n = t.visible ?? b,
      r = t.bounds ?? Te,
      a = n && j && r != null,
      o = V.current;
    if (o?.browserTabId === i && o.conversationId === s && q.pages.getHost(s, i) == null && q.getExistingBrowserStorageId(s, i) == null) return;
    let l = q.consumePendingElectronTransfer(s, i),
      u = q.pages.getMountGeneration(s, i),
      d = q.getPagePersistence(s, i);
    ne.dispatchMessage(`browser-sidebar-sync`, {
      payload: {
        conversationId: s,
        pagePersistence: d,
        browserTabId: i,
        hostKind: Fe,
        cwd: c,
        transferSourceBrowserTabId: l?.sourceBrowserTabId,
        transferSourceConversationId: l?.sourceConversationId,
        mountGeneration: u,
        presented: a,
        visible: n,
        bounds: n ? r : null,
        ...(p ? {} : {
          annotationModeEnabled: !1
        }),
        emulatedViewportSize: U.isEnabled ? {
          width: U.width,
          height: U.height
        } : null,
        viewportScale: De,
        topContentInset: 0,
        themeVariant: ie,
        isAgentControllingBrowser: g,
        runtimeIntlConfig: {
          defaultLocale: R.defaultLocale,
          locale: oe,
          messages: ce
        }
      }
    }), V.current = {
      browserTabId: i,
      conversationId: s
    };
  }, t[40] = U.height, t[41] = U.isEnabled, t[42] = U.width, t[43] = ie, t[44] = Te, t[45] = De, t[46] = i, t[47] = s, t[48] = c, t[49] = R.defaultLocale, t[50] = p, t[51] = g, t[52] = b, t[53] = Fe, t[54] = ce, t[55] = oe, t[56] = j, t[57] = Be) : Be = t[57];
  let Ve = (0, qc.useEffectEvent)(Be),
    He;
  t[58] !== U.isEnabled || t[59] !== i || t[60] !== s || t[61] !== v || t[62] !== x || t[63] !== N || t[64] !== z ? (He = () => {
    let e = N.current;
    if (!e) return;
    let t = e.closest(`[data-app-shell-pane-content-viewport]`),
      n = e.closest(`[data-app-shell-focus-area="${x}-panel"]`),
      r = e.getBoundingClientRect(),
      a = {
        x: r.x / z,
        y: r.y / z,
        width: r.width / z,
        height: r.height / z
      };
    if (U.isEnabled && !v && q.initializeDeviceToolbarViewportSize(s, i, a), t == null) he(null);else {
      let e = t.getBoundingClientRect(),
        i = n?.getBoundingClientRect() ?? e,
        a = Math.max(r.left, e.left, i.left),
        o = Math.max(r.top, e.top, i.top),
        s = {
          x: a / z,
          y: o / z,
          width: Math.max(0, Math.min(r.right, e.right, i.right) - a) / z,
          height: Math.max(0, Math.min(r.bottom, e.bottom, i.bottom) - o) / z
        },
        c = n == null ? 1 : Number(window.getComputedStyle(n).opacity);
      he(e => e != null && e.clipBounds.x === s.x && e.clipBounds.y === s.y && e.clipBounds.width === s.width && e.clipBounds.height === s.height && e.opacity === c ? e : {
        clipBounds: s,
        opacity: c
      });
    }
    fe(e => v && e != null ? e.x === a.x && e.y === a.y ? e : {
      ...e,
      x: a.x,
      y: a.y
    } : e != null && e.x === a.x && e.y === a.y && e.width === a.width && e.height === a.height ? e : a);
  }, t[58] = U.isEnabled, t[59] = i, t[60] = s, t[61] = v, t[62] = x, t[63] = N, t[64] = z, t[65] = He) : He = t[65];
  let Ue = Ke(He),
    We;
  t[66] !== i || t[67] !== s || t[68] !== d || t[69] !== v || t[70] !== b || t[71] !== Fe || t[72] !== k || t[73] !== j || t[74] !== Ue ? (We = async e => {
    if (e.aborted) return !1;
    if (!b || v || !d || !j || !k) return !0;
    de.current?.abort();
    let t = new AbortController();
    de.current = t;
    let n = AbortSignal.any([e, t.signal]);
    return Promise.resolve().then(async () => {
      if (n.aborted || ((0, Jc.flushSync)(Ue), q.pages.hasPendingPresentationHandoff(Fe))) return !1;
      let e = q.pages.getHost(s, i),
        t = e?.getPresentedViewportSize();
      if (n.aborted || e == null || t == null) return !1;
      let r = await e.waitForPresentedViewportSize(t, n),
        a = e.getPresentedViewportSize();
      return r === !0 && !n.aborted && !q.pages.hasPendingPresentationHandoff(Fe) && a?.width === t.width && a.height === t.height && q.pages.getHost(s, i) === e;
    }).finally(() => {
      de.current === t && (de.current = null);
    });
  }, t[66] = i, t[67] = s, t[68] = d, t[69] = v, t[70] = b, t[71] = Fe, t[72] = k, t[73] = j, t[74] = Ue, t[75] = We) : We = t[75];
  let Ge = Ke(We),
    qe;
  t[76] === Symbol.for(`react.memo_cache_sentinel`) ? (qe = () => () => de.current?.abort(), t[76] = qe) : qe = t[76];
  let Je;
  t[77] !== i || t[78] !== s ? (Je = [i, s], t[77] = i, t[78] = s, t[79] = Je) : Je = t[79], (0, qc.useLayoutEffect)(qe, Je);
  let Ye;
  t[80] !== le || t[81] !== b || t[82] !== x || t[83] !== B || t[84] !== Ue || t[85] !== N ? (Ye = () => {
    let e = N.current;
    if (e == null) return;
    let t = e.closest(`[data-app-shell-pane-content-viewport]`),
      n = () => {
        (0, Jc.flushSync)(Ue);
      },
      r = wi({
        update: n,
        motionValues: [x === `bottom` ? le : B]
      }),
      i = new ResizeObserver(n);
    return i.observe(e), t != null && i.observe(t), Ue(), b && r.scheduleUpdate(), window.addEventListener(`resize`, n), () => {
      r.disconnect(), i.disconnect(), window.removeEventListener(`resize`, n);
    };
  }, t[80] = le, t[81] = b, t[82] = x, t[83] = B, t[84] = Ue, t[85] = N, t[86] = Ye) : Ye = t[86];
  let Ze;
  t[87] !== le || t[88] !== v || t[89] !== b || t[90] !== x || t[91] !== B || t[92] !== Ue || t[93] !== N || t[94] !== z ? (Ze = [le, v, b, x, B, Ue, N, z], t[87] = le, t[88] = v, t[89] = b, t[90] = x, t[91] = B, t[92] = Ue, t[93] = N, t[94] = z, t[95] = Ze) : Ze = t[95], (0, qc.useLayoutEffect)(Ye, Ze);
  let Qe, $e;
  t[96] !== x || t[97] !== ze || t[98] !== F ? (Qe = () => {
    if (x === `right`) return F.set(nr, ze), () => {
      F.set(nr, null);
    };
  }, $e = [x, ze, F], t[96] = x, t[97] = ze, t[98] = F, t[99] = Qe, t[100] = $e) : (Qe = t[99], $e = t[100]), (0, qc.useLayoutEffect)(Qe, $e);
  let et;
  t[101] === Ve ? et = t[102] : (et = () => {
    Ve();
  }, t[101] = Ve, t[102] = et);
  let tt = Te?.height,
    nt = Te?.width,
    rt = Te?.x,
    it = Te?.y,
    at;
  t[103] !== U.height || t[104] !== U.isEnabled || t[105] !== U.width || t[106] !== ie || t[107] !== De || t[108] !== r.tabType || t[109] !== r.url || t[110] !== i || t[111] !== s || t[112] !== c || t[113] !== d || t[114] !== f || t[115] !== Pe || t[116] !== R.defaultLocale || t[117] !== p || t[118] !== g || t[119] !== b || t[120] !== Fe || t[121] !== oe || t[122] !== tt || t[123] !== nt || t[124] !== rt || t[125] !== it ? (at = [U.height, U.isEnabled, U.width, p, tt, nt, rt, it, i, r.tabType, De, r.url, ie, s, c, d, f, Pe, R.defaultLocale, g, b, Fe, oe], t[103] = U.height, t[104] = U.isEnabled, t[105] = U.width, t[106] = ie, t[107] = De, t[108] = r.tabType, t[109] = r.url, t[110] = i, t[111] = s, t[112] = c, t[113] = d, t[114] = f, t[115] = Pe, t[116] = R.defaultLocale, t[117] = p, t[118] = g, t[119] = b, t[120] = Fe, t[121] = oe, t[122] = tt, t[123] = nt, t[124] = rt, t[125] = it, t[126] = at) : at = t[126], (0, qc.useEffect)(et, at);
  let ot;
  t[127] === Ve ? ot = t[128] : (ot = () => () => {
    Ve({
      visible: !1,
      bounds: null
    });
  }, t[127] = Ve, t[128] = ot);
  let ct;
  t[129] !== i || t[130] !== s ? (ct = [i, s], t[129] = i, t[130] = s, t[131] = ct) : ct = t[131], (0, qc.useEffect)(ot, ct);
  let lt;
  t[132] !== i || t[133] !== s ? (lt = e => {
    q.setDeviceToolbarTabState(s, i, t => ({
      ...e(t),
      isAutomatic: void 0
    }));
  }, t[132] = i, t[133] = s, t[134] = lt) : lt = t[134];
  let ut = lt,
    dt;
  t[135] !== D || t[136] !== ut ? (dt = (e, t) => {
    let n = t === void 0 ? {} : t;
    ut(t => e.presetId === `responsive` ? {
      responsiveViewportSize: {
        height: e.height,
        width: e.width
      },
      toolbarState: e
    } : {
      ...t,
      toolbarState: e
    }), n.shouldResetPageZoom === !0 && D({
      type: `set-zoom-percent`,
      zoomPercent: 100
    });
  }, t[135] = D, t[136] = ut, t[137] = dt) : dt = t[137];
  let ft = dt,
    pt;
  t[138] === ut ? pt = t[139] : (pt = () => {
    ut(Bc);
  }, t[138] = ut, t[139] = pt);
  let mt = pt,
    ht;
  t[140] !== U.isEnabled || t[141] !== H || t[142] !== Oe || t[143] !== i || t[144] !== s || t[145] !== L ? (ht = {
    viewportId: L,
    conversationId: s,
    browserTabId: i,
    currentZoomPercent: Oe,
    isDeviceToolbarVisible: U.isEnabled,
    contentBounds: H
  }, t[140] = U.isEnabled, t[141] = H, t[142] = Oe, t[143] = i, t[144] = s, t[145] = L, t[146] = ht) : ht = t[146];
  let gt = ht,
    _t = me?.clipBounds.width ?? H?.width ?? null,
    vt;
  t[147] === gt ? vt = t[148] : (vt = () => Wc(gt), t[147] = gt, t[148] = vt);
  let bt;
  t[149] === F ? bt = t[150] : (bt = e => yt(F, Ut, {
    action: e
  }), t[149] = F, t[150] = bt);
  let xt;
  t[151] !== i || t[152] !== Ae || t[153] !== s ? (xt = e => {
    ve({
      browserTabId: i,
      conversationId: s,
      scale: e ? Ae : null
    });
  }, t[151] = i, t[152] = Ae, t[153] = s, t[154] = xt) : xt = t[154];
  let St;
  t[155] === l ? St = t[156] : (St = e => {
    l.current?.({
      type: `set-zoom-percent`,
      zoomPercent: e
    }, {
      showBanner: !1
    });
  }, t[155] = l, t[156] = St);
  let Ct;
  t[157] !== n || t[158] !== be || t[159] !== H || t[160] !== we || t[161] !== Oe || t[162] !== r.siteToolsAvailability?.webMcp || t[163] !== i || t[164] !== ke || t[165] !== a || t[166] !== Ae || t[167] !== Me || t[168] !== s || t[169] !== l || t[170] !== u || t[171] !== te || t[172] !== d || t[173] !== h || t[174] !== g || t[175] !== v || t[176] !== b || t[177] !== me?.clipBounds || t[178] !== me?.opacity || t[179] !== Fe || t[180] !== S || t[181] !== w || t[182] !== Ge || t[183] !== T || t[184] !== ee || t[185] !== E || t[186] !== Le || t[187] !== O || t[188] !== k || t[189] !== A || t[190] !== j || t[191] !== M || t[192] !== N || t[193] !== P || t[194] !== z ? (Ct = e => {
    let {
      toolbar: t,
      resizeHandles: o
    } = e;
    return ee({
      prepareContentLayout: Ge,
      headerRows: [{
        id: `browser-navigation`,
        height: te ? `content` : void 0,
        content: te ? (0, Yc.jsx)(Hi, {
          inert: v || h,
          children: M
        }) : M
      }, ...(t == null ? [] : [{
        id: `browser-device-controls`,
        content: (0, Yc.jsx)(`div`, {
          className: `h-full min-w-0`,
          "aria-hidden": h,
          inert: h,
          children: t
        })
      }]), {
        id: `browser-profile-import`,
        content: T,
        height: `content`
      }],
      content: (0, Yc.jsx)(`div`, {
        "aria-hidden": h,
        className: `relative flex h-full min-h-0 min-w-0 flex-col`,
        inert: h,
        children: (0, Yc.jsxs)(`div`, {
          ref: N,
          className: `relative min-h-0 min-w-0 flex-1 overflow-hidden`,
          style: {
            backgroundColor: we
          },
          children: [n == null ? null : (0, Yc.jsx)(Yi, {
            bounds: b && !v ? H : null,
            bottomInset: be,
            clipBounds: me?.clipBounds,
            inert: h,
            opacity: me?.opacity,
            windowZoom: z,
            children: n
          }), o, b && d ? (0, Yc.jsx)(Oc, {
            browserTabId: i,
            conversationId: s,
            currentRenderedZoomPercent: Oe,
            dispatchZoomCommandRef: l,
            rootRef: E,
            viewportScale: Me
          }) : null, u, j ? (0, Yc.jsx)(Yc.Fragment, {
            children: (0, Yc.jsx)(za, {
              adoptionLease: w,
              adoptedWebContentsId: S,
              bounds: ke,
              browserTabId: i,
              clipBounds: me?.clipBounds,
              conversationId: s,
              hostKind: Fe,
              initialUrl: a,
              isPrewarmedEmptyTab: A,
              isExiting: v,
              isVisible: Le && b && !A,
              opacity: me?.opacity,
              scale: Ae,
              shouldBootstrapWhenHidden: O,
              shouldPaint: k,
              webviewRef: P,
              windowZoom: z,
              children: (0, Yc.jsx)(Hc, {
                browserTabId: i,
                conversationId: s,
                hasWebMcpTools: r.siteToolsAvailability?.webMcp === `available`,
                isBrowserUseActive: g,
                viewportSize: ke
              })
            })
          }) : null]
        })
      })
    });
  }, t[157] = n, t[158] = be, t[159] = H, t[160] = we, t[161] = Oe, t[162] = r.siteToolsAvailability?.webMcp, t[163] = i, t[164] = ke, t[165] = a, t[166] = Ae, t[167] = Me, t[168] = s, t[169] = l, t[170] = u, t[171] = te, t[172] = d, t[173] = h, t[174] = g, t[175] = v, t[176] = b, t[177] = me?.clipBounds, t[178] = me?.opacity, t[179] = Fe, t[180] = S, t[181] = w, t[182] = Ge, t[183] = T, t[184] = ee, t[185] = E, t[186] = Le, t[187] = O, t[188] = k, t[189] = A, t[190] = j, t[191] = M, t[192] = N, t[193] = P, t[194] = z, t[195] = Ct) : Ct = t[195];
  let wt;
  t[196] !== U || t[197] !== H || t[198] !== Oe || t[199] !== Ne || t[200] !== I || t[201] !== mt || t[202] !== ft || t[203] !== _t || t[204] !== vt || t[205] !== bt || t[206] !== xt || t[207] !== St || t[208] !== Ct ? (wt = (0, Yc.jsx)(Zi, {
    currentZoomPercent: Oe,
    layout: Ne,
    panelBounds: H,
    state: U,
    toolbarWidth: _t,
    onClose: vt,
    onRotate: mt,
    onStateChange: ft,
    onToolbarAction: bt,
    reducedMotion: I,
    onViewportResizeActiveChange: xt,
    onZoomPercentChange: St,
    render: Ct
  }), t[196] = U, t[197] = H, t[198] = Oe, t[199] = Ne, t[200] = I, t[201] = mt, t[202] = ft, t[203] = _t, t[204] = vt, t[205] = bt, t[206] = xt, t[207] = St, t[208] = Ct, t[209] = wt) : wt = t[209];
  let Tt;
  return t[210] !== gt || t[211] !== wt ? (Tt = (0, Yc.jsx)(Ee, {
    scope: Xc,
    value: gt,
    children: wt
  }), t[210] = gt, t[211] = wt, t[212] = Tt) : Tt = t[212], Tt;
}
