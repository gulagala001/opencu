function $i({
  enableRichText: e,
  enableSuggestions: t,
  dictationProductSurface: r,
  autoFocus: i,
  session: a,
  isVisible: l,
  browserTabId: u,
  annotationSelectionAnchors: f,
  windowHeight: p,
  windowWidth: h,
  maxSurfaceHeight: g,
  maxSurfaceWidth: _,
  metadataAnchor: v,
  reservedTrayHeight: y,
  defaultDesignEditorOpen: x = !1,
  defaultExpandedSpacingGroups: S,
  showAdjustEntry: C = !0,
  keyboardEventTarget: w,
  onSubmit: E,
  onDirectSubmit: D,
  onDesignChangeDelete: O,
  onDesignChangeUpdate: k,
  onDesignControlInteractionChange: j,
  onAnnotationSelectionHoverChange: N,
  onAnnotationSelectionRemove: te,
  onTweaksEditorOpenChange: ne,
  onDelete: re,
  onCancel: P,
  onEscape: oe,
  onMounted: F,
  onBodyChange: se,
  onAttachmentPreviewOpenChange: I,
  onDictationBusyChange: ce,
  onLightDismissibilityChange: le,
  onRepositionInteractionChange: L,
  allowImageAttachments: R = !0,
  allowDirectSubmit: de,
  allowDirectSubmitOnEdit: fe,
  allowEmptySubmit: me,
  defaultCreateSubmitMode: he,
  createSubmitButtonSize: ge,
  inputAriaLabel: z,
  placeholder: _e
}) {
  let ve = d(m),
    B = ye(),
    be = n(),
    xe = M(`2460218704`),
    Se = s(we),
    Ce = s(pe),
    Te = a.siteAnnotationFeaturesEnabled !== !1,
    Ee = aa(a),
    De = a.draftBody ?? Ee,
    V = Te && u != null && a.pageInitialComment?.text.length ? a.pageInitialComment : void 0,
    [ke, Ae] = (0, Q.useState)(() => a.target.mode !== `create` || V?.shouldReveal !== !0 || be),
    H = V != null && !ke,
    U = a.target.mode === `create` && V != null,
    [je, Me] = (0, Q.useState)(() => U ? `pending` : `complete`),
    Pe = f != null && f.length > 1,
    Le = C && !Pe,
    Re = C ? sa(a) : null,
    [{
      commentEditor: K,
      pageCommentHandoff: ze
    }] = (0, Q.useState)(() => {
      let n = qe({
        enableRichText: e,
        enableSuggestions: t
      });
      return H ? (n.setText(Ee), {
        commentEditor: n,
        pageCommentHandoff: Mi(n.view, () => Ae(!0))
      }) : {
        commentEditor: n,
        pageCommentHandoff: null
      };
    }),
    Be = (0, Q.useCallback)(() => {
      K.view.isDestroyed || K.destroy();
    }, [K]);
  vt(Be, K);
  let [Ve, He] = (0, Q.useState)(De),
    [Ue, Ge] = (0, Q.useState)(() => a.attachedImages ?? []),
    [Ke, Je] = (0, Q.useState)(() => C ? a.designEditorState ?? Re ?? null : null),
    [Ye] = (0, Q.useState)(() => ({
      withSiteControls: Re,
      withoutSiteControls: Re == null ? null : {
        ...Re,
        annotationControls: void 0,
        annotationControlChanges: void 0
      }
    })),
    Xe = Te ? Ye.withSiteControls : Ye.withoutSiteControls,
    [$e, et] = (0, Q.useState)(() => Ke != null && (x || a.target.mode === `design` || Re != null)),
    rt = f?.[0],
    ot = Ke?.anchor,
    ct = f == null || rt?.kind === `virtual` && ot?.kind === `virtual` && Fe(rt, ot) || rt?.kind === `element` && ot?.kind === `element` && rt.pageUrl === ot.pageUrl && rt.frameUrl === ot.frameUrl && rt.framePath.length === ot.framePath.length && rt.framePath.every((e, t) => e === ot.framePath[t]) && (rt.runtimeElementId != null || ot.runtimeElementId != null ? rt.runtimeElementId === ot.runtimeElementId : (rt.selector ?? rt.elementPath) === (ot.selector ?? ot.elementPath)) && (rt.documentContext?.documentId ?? null) === (ot.documentContext?.documentId ?? null) && (rt.documentContext?.tabId ?? null) === (ot.documentContext?.tabId ?? null),
    lt = Le && Ke != null && ct ? Ke : null,
    ft = oa(lt, Te),
    pt = !Ce && !Se || ot != null && ue(ot.pageUrl),
    mt = hn({
      canEditDesign: ft != null,
      showAdjustEntry: Le && pt
    }),
    q = ft != null && (pt && $e || !pt && (a.target.mode === `edit` && Re != null || Te && a.pageRequestedDesignEditor === !0 || ft.annotationControls?.controlsMode === `extend` || (ft.annotationControls?.controls.length ?? 0) > 0)),
    yt = Te && (xe || V != null) && a.anchorState != null ? ei(a.anchorState) : void 0,
    St = yt != null && yt.length > 0,
    Et = (0, Q.useRef)(null),
    [Dt, Ot] = (0, Q.useState)(() => U ? `pending` : `complete`),
    At = U && je === `required`,
    jt = U && St && Dt === `required`,
    Mt = At || jt,
    Nt = U && (je === `pending` || St && Dt === `pending`),
    Ft = H || Nt || Mt,
    [zt, Bt] = (0, Q.useState)(),
    [Ut, Gt] = (0, Q.useState)(!1),
    [Kt, qt] = (0, Q.useState)(),
    [Jt, Yt] = (0, Q.useState)(),
    [Xt, Zt] = (0, Q.useState)(!1),
    [Qt, $t] = (0, Q.useState)(!1),
    [en, tn] = (0, Q.useState)(!1),
    [nn, rn] = (0, Q.useState)(!1),
    [an, on] = (0, Q.useState)(null),
    [sn, ln] = (0, Q.useState)(null),
    [un, dn] = (0, Q.useState)(!1),
    [fn, pn] = (0, Q.useState)(null),
    mn = (0, Q.useRef)({
      property: null,
      hasFocusedInput: !1,
      isControlEditing: !1,
      isDragging: !1
    }),
    [gn, _n] = (0, Q.useState)(!1),
    [vn, yn] = (0, Q.useState)({
      x: 0,
      y: 0
    }),
    bn = e => {
      _n(e), I?.(e);
    },
    xn = e => {
      e.preventDefault(), K.focus();
    },
    [Sn, Cn] = (0, Q.useState)(!1),
    [wn, En] = (0, Q.useState)(!1),
    Dn = s(Ct),
    On = (0, Q.useRef)(De),
    kn = (0, Q.useRef)(a.attachedImages ?? []),
    An = (0, Q.useRef)(null),
    jn = (0, Q.useRef)(null),
    Mn = (0, Q.useRef)(lt);
  Mn.current = lt;
  let Nn = (0, Q.useRef)(null),
    Pn = (0, Q.useRef)(null),
    Fn = (0, Q.useRef)(null),
    In = (0, Q.useRef)(null),
    Ln = (0, Q.useRef)(null),
    Rn = (0, Q.useRef)(null),
    zn = (0, Q.useRef)(null),
    Bn = (0, Q.useRef)(null),
    Vn = (0, Q.useRef)(0),
    Hn = (0, Q.useRef)(null),
    Un = (0, Q.useRef)(null),
    Wn = (0, Q.useRef)(!1),
    Gn = (0, Q.useRef)(null),
    {
      data: Kn
    } = b(`workspace-root-options`, {
      params: {
        hostId: A
      }
    }),
    qn = (0, Q.useMemo)(() => {
      if (Kn?.roots.length) return Kn.roots;
      if (a.cwd != null) return [a.cwd];
    }, [a.cwd, Kn?.roots]),
    Jn = Tt(K),
    Yn = bt(K),
    Xn = null;
  !H && Jn.ui?.active === !0 ? Xn = `at` : !H && Yn.ui?.active === !0 && (Xn = `skill`);
  let Zn = q,
    Qn = U && en || a.target.mode === `edit` && V != null,
    $n = q || St || Qn,
    er = V != null || a.target.mode === `edit` || en || q,
    tr = Pe && (a.target.mode === `edit` || a.target.mode === `create` && te != null),
    {
      hasCommentText: nr
    } = Jr({
      baselineDesignGroup: Xe,
      commentText: Ve,
      designEditorState: ft,
      isDesignSubmissionMode: Zn
    }),
    {
      designDraft: rr
    } = Jr({
      baselineDesignGroup: Xe,
      commentText: Ve,
      designEditorState: ft,
      isDesignSubmissionMode: ft != null
    }),
    ir = pa({
      baselineDesignGroup: Xe,
      designDraft: rr,
      designEditorState: ft,
      isDesignEditorOpen: q
    }),
    ar = Ze(),
    or = ar === !0,
    {
      getIsDictationStarting: sr,
      isDictationStarting: cr,
      isDictating: lr,
      isTranscribing: ur,
      canRetryDictation: dr,
      retryDictation: fr,
      waveformCanvasRef: pr,
      startDictation: mr,
      stopDictation: hr,
      transcriptionAction: gr
    } = tt({
      productSurface: r,
      enabled: or && !H,
      getSurroundingText: () => K.getText(),
      onTranscriptInsert: e => {
        K.view.isDestroyed || K.appendText(e);
      },
      onTranscriptSend: e => {
        if (K.view.isDestroyed) return;
        K.appendText(e);
        let t = K.getText().trim();
        if (t.length === 0 || Ft) return;
        let n = {
          body: t,
          submitSource: `dictation`,
          ...(kn.current.length === 0 ? {} : {
            attachedImages: kn.current
          })
        };
        if (a.target.mode === `create` && he === `direct`) {
          D(n);
          return;
        }
        gi(`dictation`);
      },
      onStartError: () => {
        ve.get(ie).danger(B.formatMessage({
          id: `composer.dictation.startError`,
          defaultMessage: `Unable to start dictation`,
          description: `Toast text shown when dictation could not be started`
        }), {
          errorAnalytics: {
            toastId: `composer.dictation.startError`
          }
        });
      },
      onTranscribeError: () => {
        ve.get(ie).danger(B.formatMessage({
          id: `composer.dictation.transcribeError`,
          defaultMessage: `Unable to transcribe audio`,
          description: `Toast text shown when dictation audio transcription fails`
        }), {
          errorAnalytics: {
            toastId: `composer.dictation.transcribeError`
          }
        });
      },
      onUnsupported: () => {
        ve.get(ie).danger(B.formatMessage({
          id: `composer.dictation.unsupported`,
          defaultMessage: `Dictation is not available on this device`,
          description: `Toast text shown when dictation is not supported on the current device`
        }), {
          errorAnalytics: {
            toastId: `composer.dictation.unsupported`
          }
        });
      }
    }),
    _r = lr || ur,
    vr = R && Ue.length > 0,
    yr = er || vr,
    br = V == null && a.target.mode !== `edit` && !en && !vr,
    xr = !q && (yr || tr),
    Sr = xr && !er,
    Cr = yr && !_r ? 120 : 44,
    wr = y ?? Math.min(Math.max(p - 120, 0), 88),
    Tr = St ? v : void 0,
    Er = g ?? Math.max(1, p - wr),
    Dr;
  _r ? Dr = Jt : Tr == null && !q && !xr && (Dr = 120);
  let Or;
  Tr != null && (Er = Math.min(Er, Math.max(1, Tr.maxBottom - Tr.minTop)), Or = Math.min(Er, Math.max(0, Tr.bodyTop - Tr.minTop + (Kt ?? Cr))));
  let kr = U ? Math.ceil(Er) : Er,
    Ar = (St || U || g != null) && an != null && an > kr,
    jr = at(),
    {
      skills: Mr
    } = st(qn),
    Nr = (0, Q.useCallback)((e, t, n = Mn.current) => {
      ce?.(cr || lr || ur), le(!cr && !lr && !ur && da(a.target.mode, Ee, e, V?.text, a.attachedImages ?? [], t, Xe, oa(n, Te)));
    }, [Te, Xe, ce, le, cr, lr, ur, V?.text, a.attachedImages, Ee, a.target.mode]);
  (0, Q.useEffect)(() => {
    Nr(On.current, kn.current);
  }, [Nr]);
  let Pr = (0, Q.useCallback)((e, t = In.current) => {
      let n = q && ga(e, Ln.current, t, U);
      rn(e => e === n ? e : n);
    }, [U, q]),
    Fr = (0, Q.useCallback)(e => {
      if (In.current = e, e == null) {
        rn(!1);
        return;
      }
      Pr(On.current, e);
    }, [Pr]),
    J = (0, Q.useCallback)(() => {
      let e = K.getText();
      if (On.current === e) return;
      On.current = e, He(e), se?.(e), tn(a.target.mode !== `edit` && ha(e, K.view.state.doc.childCount > 1, Ln.current, Nn.current, U)), Pr(e), Nr(e, kn.current);
      let t = oa(Mn.current, Te);
      Zn && t != null && k?.(Yr(t, Xe, e.trim()));
    }, [Te, Xe, K, U, Zn, se, k, a.target.mode, Pr, Nr]);
  (0, Q.useEffect)(() => U ? ht(K.view, e => {
    e && (ze == null || ze.isComplete()) && queueMicrotask(() => {
      K.view.dom.isConnected && (0, Sa.flushSync)(J);
    });
  }) : ht(K.view, J), [K, J, U, ze]), (0, Q.useEffect)(() => {
    K.syncMentionMetadata({
      skills: Mr,
      apps: jr
    });
  }, [jr, Mr, K]), (0, Q.useLayoutEffect)(() => {
    if (Rn.current === a.sessionId) return;
    Rn.current = a.sessionId;
    let e = a.attachedImages ?? [];
    (ze == null || ze.isComplete()) && (U ? K.setText(De) : K.setPromptText(De)), On.current = De, kn.current = e, se?.(De), He(De), Ge(e), $t(!1), Zt(!1), Bn.current = null, tn(a.target.mode !== `edit` && ha(De, (ze?.originalDocument ?? K.view.state.doc).childCount > 1, Ln.current, Nn.current, U)), Nr(De, e);
  }, [K, U, ze, a.attachedImages, De, a.sessionId, a.target.mode, se, Nr]), ee(`browser-sidebar-comment-overlay-insert-text`, e => {
    if (u == null || a.conversationId == null || e.browserTabId !== u || e.conversationId !== a.conversationId || e.sessionId !== a.sessionId) return;
    let t = zn.current;
    t?.sessionId === e.sessionId && t.sequence >= e.sequence || (zn.current = {
      sequence: e.sequence,
      sessionId: e.sessionId
    }, ze?.finish(), K.focus(), K.insertTextAtSelection(e.text));
  }, [u, K, ze, a.conversationId, a.sessionId]), (0, Q.useEffect)(() => {
    !U || be ? ze?.finish() : l && ze?.start();
  }, [U, l, ze, be]), (0, Q.useLayoutEffect)(() => {
    if (_r) return;
    let e = Nn.current,
      t = Pn.current,
      n = Fn.current,
      r = An.current;
    if (e == null || t == null || n == null || r == null) return;
    let i = () => {
      if (U && !e.contains(K.view.dom)) return;
      let i = e.getBoundingClientRect(),
        o = n.getBoundingClientRect(),
        s = t.getBoundingClientRect(),
        c = i.bottom - s.top;
      qt(c), Yt(n.offsetHeight);
      let l = zt != null && (U ? Math.abs(zt.width - i.width) <= 1 : zt.width === Math.ceil(i.width)),
        u = St && zt != null && (Ut || l) ? zt.height + s.height : i.height,
        d = Math.max(0, u - c),
        f = {
          width: Math.ceil(o.width),
          height: Math.ceil(u)
        };
      on(f.height);
      let p = _ ?? r.getBoundingClientRect().width,
        m = Math.ceil(Math.max(1, Math.min(Oe.width, p) - (n.offsetWidth - n.clientWidth))),
        h = !St || Ut || (U ? i.width > 0 && Math.abs(i.width - m) <= 1 && zt != null && Math.abs(zt.width - m) <= 1 && Math.abs(i.height - u) <= 1 && Ar === f.height > kr : Math.ceil(i.width) === m && zt?.width === m && Math.ceil(i.height) === f.height && Ar === f.height > kr);
      St && h && Gt(!0);
      let g = [a.sessionId, f, $n ? {
        width: Oe.width,
        height: q ? Math.max(Oe.height, f.height) : f.height
      } : void 0, d, h];
      (0, xa.default)(Bn.current, g) || (Bn.current = g, F(...g));
    };
    i();
    let o = new (e.ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver)(() => {
      St || U ? (0, Sa.flushSync)(i) : i();
    });
    return o.observe(e), o.observe(t), o.observe(n), () => o.disconnect();
  }, [K, zt, U, St, Ut, q, _r, Ar, $n, _, F, a.sessionId, kr, h]), (0, Q.useEffect)(() => {
    if (!un) return;
    let e = Fn.current;
    if (e == null) return;
    let t = e => {
      e.preventDefault();
    };
    return e.addEventListener(`wheel`, t, {
      capture: !0,
      passive: !1
    }), () => {
      e.removeEventListener(`wheel`, t, !0);
    };
  }, [un]);
  let Ir = (0, Q.useEffectEvent)(() => {
    mn.current = {
      property: null,
      hasFocusedInput: !1,
      isControlEditing: !1,
      isDragging: !1
    }, j?.({
      property: null,
      isEditingControl: !1
    });
  });
  (0, Q.useEffect)(() => () => {
    Ir(), Hn.current != null && globalThis.clearTimeout(Hn.current), Un.current != null && globalThis.clearTimeout(Un.current);
  }, []);
  let Y = (0, Q.useEffectEvent)(e => {
    if (gn) return;
    let t = K.view.dom,
      n = t.ownerDocument.activeElement;
    (!e || n == null || jn.current !== n || t.contains(n)) && (H ? t.focus({
      preventScroll: !0
    }) : K.focus());
  });
  (0, Q.useEffect)(() => {
    let e = w ?? K.view.dom.ownerDocument.defaultView;
    if (!i || e == null) return;
    let t = t => {
        e.requestAnimationFrame(() => {
          Y(t);
        });
      },
      n = e.document.hasFocus(),
      r = () => {
        t(n), n = !0;
      };
    return w?.addEventListener(`focus`, r), t(!1), () => {
      w?.removeEventListener(`focus`, r);
    };
  }, [i, K, w]);
  let Lr = B.formatMessage({
      id: `browserSidebarCommentOverlay.comment`,
      defaultMessage: `Comment`,
      description: `Primary action for creating a new browser comment`
    }),
    Rr = B.formatMessage({
      id: `browserSidebarCommentOverlay.scrollToBottom`,
      defaultMessage: `Scroll to bottom`,
      description: `Action replacing submit until the user has scrolled to the bottom of the initial annotation prompt provided by a webpage`
    }),
    zr = B.formatMessage({
      id: `browserSidebarCommentOverlay.addTweaks`,
      defaultMessage: `Add`,
      description: `Primary action for adding browser tweaks`
    }),
    Br = B.formatMessage({
      id: `browserSidebarCommentOverlay.send.tooltip`,
      defaultMessage: `Send`,
      description: `Action label shown in the browser comment submit tooltip for sending a comment`
    }),
    Vr = B.formatMessage({
      id: `browserSidebarCommentOverlay.delete`,
      defaultMessage: `Delete`,
      description: `Delete action for the browser comment overlay`
    }),
    Hr = B.formatMessage({
      id: `browserSidebarCommentOverlay.tweak`,
      defaultMessage: `Adjust`,
      description: `Accessible label for opening browser design adjustment controls from the comment editor`
    }),
    Ur = _e ?? (Zn && (ft?.annotationControls?.controlsMode !== `replace` || ft.annotationControls.controls.length === 0) ? B.formatMessage({
      id: `browserSidebarCommentOverlay.tweaksPlaceholder`,
      defaultMessage: `Describe these changes...`,
      description: `Placeholder text for the browser tweaks editor comment field`
    }) : B.formatMessage({
      id: `browserSidebarCommentOverlay.placeholder`,
      defaultMessage: `Add a comment…`,
      description: `Placeholder text for the browser comment editor`
    })),
    X = a.target.mode === `edit` ? a.target.commentId : null,
    Wr = ar == null || ar,
    Gr = X == null && !er && !nr && !Mt && ar == null,
    Kr = !lr && Wr && (cr || er || !nr && !Mt),
    qr = !Gr && !cr && !lr && (Mt || er || nr || !or),
    Zr = ir ? Xe == null ? rr != null || nr : !Xr(rr, Xe) : me || nr,
    Qr = H || Nt || !Mt && !Zr,
    $r = Ie(),
    ti = w?.document.body === document.body ? null : w?.document.body ?? null,
    ni = X == null && de && wn && Dn,
    ri = $r ? `⏎` : `Enter`,
    ii = $r ? `⌘⏎` : `Ctrl+Enter`,
    ai = de ? he : `saved`,
    oi = ai === `direct` ? !ni : ni,
    ci = oi ? (0, $.jsx)(ae, {}) : (0, $.jsx)(T, {});
  Zn && (Lr = oi ? Br : zr), Mt && (Lr = Rr, ci = (0, $.jsx)(We, {}));
  let li;
  At && jt ? li = (0, $.jsx)(W, {
    id: `browserSidebarCommentOverlay.reviewPromptAndMetadataBeforeSubmitting`,
    defaultMessage: `Review the full prompt and metadata before submitting`,
    description: `Tooltip for the scroll-to-bottom action when both the webpage-supplied annotation prompt and metadata still need review`
  }) : jt ? li = (0, $.jsx)(W, {
    id: `browserSidebarCommentOverlay.reviewMetadataBeforeSubmitting`,
    defaultMessage: `Review all metadata before submitting`,
    description: `Tooltip for the scroll-to-bottom action when only the webpage-supplied annotation metadata still needs review`
  }) : At && (li = (0, $.jsx)(W, {
    id: `browserSidebarCommentOverlay.reviewPromptBeforeSubmitting`,
    defaultMessage: `Review the full prompt before submitting`,
    description: `Tooltip for the scroll-to-bottom action when only the webpage-supplied annotation prompt still needs review`
  }));
  let ui = Xe?.status === `queued` ? Xe : null,
    di = X != null || q || ui != null,
    fi = er && !lr && (di || V != null),
    pi = di ? (0, $.jsx)(c, {
      color: `outline`,
      size: `composer`,
      tabIndex: fi ? void 0 : -1,
      onClick: () => {
        P();
      },
      children: (0, $.jsx)(W, {
        id: `browserSidebarCommentOverlay.cancel`,
        defaultMessage: `Cancel`,
        description: `Cancel action for the browser comment overlay`
      })
    }) : null,
    mi = sn == null || Ke == null ? null : sn.rows.flatMap(e => {
      let t = ea(Ke.declarations, e.property);
      return t == null ? [] : [{
        row: e,
        value: t
      }];
    }),
    Z = (0, Q.useCallback)(e => new Promise(t => {
      let n = new FileReader(),
        r = e.name.trim().length > 0 ? e.name : void 0,
        i = Qe(e, window.electronBridge?.getPathForFile) ?? void 0;
      n.onload = e => {
        let n = e.target?.result;
        if (typeof n != `string`) {
          t(null);
          return;
        }
        t({
          dataUrl: n,
          filename: r,
          localPath: i
        });
      }, n.onerror = () => {
        t(null);
      }, n.readAsDataURL(e);
    }), []),
    hi = (0, Q.useCallback)(e => {
      R && !H && Promise.all(e.map(e => Z(e))).then(e => {
        let t = e.filter(e => e != null);
        if (t.length === 0) return;
        let n = [...kn.current, ...t];
        kn.current = n, Ge(n), Nr(On.current, n);
      });
    }, [R, H, Z, Nr]);
  function gi(e = `button`) {
    if (Ft) return;
    let t = oa(Mn.current, Te),
      n = Jr({
        baselineDesignGroup: Xe,
        commentText: K.getText(),
        designEditorState: t,
        isDesignSubmissionMode: t != null
      }),
      r = pa({
        baselineDesignGroup: Xe,
        designDraft: n.designDraft,
        designEditorState: t,
        isDesignEditorOpen: q
      });
    if (!me && n.designDraft == null && !n.hasCommentText) {
      r && Xe != null && O?.(Xe.id);
      return;
    }
    E({
      body: n.trimmedCommentText,
      submitSource: e,
      ...(!R || kn.current.length === 0 ? {} : {
        attachedImages: kn.current
      }),
      ...(r ? {
        designChange: n.designDraft
      } : {})
    });
  }
  let _i = (e = `button`) => {
      if (Ft) return;
      let t = K.getText(),
        n = oa(Mn.current, Te),
        r = Jr({
          baselineDesignGroup: Xe,
          commentText: t,
          designEditorState: n,
          isDesignSubmissionMode: n != null
        }),
        i = pa({
          baselineDesignGroup: Xe,
          designDraft: r.designDraft,
          designEditorState: n,
          isDesignEditorOpen: q
        });
      (r.hasCommentText || i && r.designDraft != null) && D({
        body: r.trimmedCommentText,
        submitSource: e,
        ...(!R || kn.current.length === 0 ? {} : {
          attachedImages: kn.current
        }),
        ...(i ? {
          designChange: r.designDraft
        } : {})
      });
    },
    vi = ai === `direct` ? _i : gi,
    yi = ai === `direct` ? gi : _i,
    xi = () => {
      if (Mt) {
        for (let e of [At ? K.view.dom.parentElement : null, jt ? Et.current : null]) e?.scrollTo({
          top: e.scrollHeight,
          behavior: be ? `instant` : `smooth`
        });
        return;
      }
      ni ? yi(`button`) : vi(`button`);
    };
  (0, Q.useEffect)(() => {
    if (!R) return;
    let e = e => {
      hi(e);
    };
    return K.addPastedImagesHandler(e), () => {
      K.removePastedImagesHandler(e);
    };
  }, [hi, R, K]), it({
    enabled: or && !H,
    getIsDictationStarting: sr,
    isDictating: lr,
    isTranscribing: ur,
    startDictation: mr,
    stopDictation: hr,
    keyboardEventTarget: w,
    shouldHandleDictation: () => K.view.dom.contains(K.view.dom.ownerDocument.activeElement)
  }), (0, Q.useEffect)(() => {
    if (w == null || X != null) return;
    let e = () => {
        let e = w.document.activeElement;
        En(e != null && K.view.dom.contains(e));
      },
      t = () => {
        w.requestAnimationFrame(e);
      },
      n = () => {
        En(!1);
      };
    return e(), w.document.addEventListener(`focusin`, t), w.document.addEventListener(`focusout`, t), w.addEventListener(`blur`, n), () => {
      w.document.removeEventListener(`focusin`, t), w.document.removeEventListener(`focusout`, t), w.removeEventListener(`blur`, n);
    };
  }, [K, X, w]);
  let Si = e => {
      if (e.defaultPrevented || e.nativeEvent.isComposing) return;
      let t = e.currentTarget.ownerDocument.defaultView,
        n = t != null && (e.target instanceof t.HTMLInputElement || e.target instanceof t.HTMLTextAreaElement) && e.target.dataset.browserSidebarDesignContentInput === `true` ? e.target : null;
      if (e.key === `Escape`) {
        if (t != null && e.target instanceof t.Node && !e.currentTarget.contains(e.target)) return;
        if (Array.from(e.currentTarget.querySelectorAll(`[aria-describedby]`)).some(t => t.getAttribute(`aria-describedby`)?.split(/\s+/).some(t => e.currentTarget.ownerDocument.getElementById(t)?.getAttribute(`role`) === `tooltip`))) {
          t != null && t !== window && Ne();
          return;
        }
        if (e.nativeEvent.composedPath().includes(K.view.dom) && K.view.someProp(`handleKeyDown`, t => t(K.view, e.nativeEvent))) {
          e.preventDefault(), e.stopPropagation();
          return;
        }
        if (e.preventDefault(), e.stopPropagation(), n) {
          n.blur();
          return;
        }
        oe();
        return;
      }
      let r = e.nativeEvent.composedPath();
      if (e.key === `Enter` && !e.altKey && !e.shiftKey && (e.metaKey || e.ctrlKey) && r.includes(e.currentTarget) && (Zn || wn || r.includes(K.view.dom))) {
        if (e.preventDefault(), e.stopPropagation(), e.repeat) return;
        X != null && de && fe ? _i(`keyboard`) : X != null || !de ? gi(`keyboard`) : yi(`keyboard`);
        return;
      }
      if (Zn && e.key === `Enter` && t != null && e.target instanceof t.HTMLInputElement && e.target.type === `text` && e.currentTarget.contains(e.target)) {
        e.preventDefault();
        return;
      }
    },
    Ci = e => {
      if (H) return;
      let t = K.view.dom,
        n = t.ownerDocument.defaultView;
      n != null && e.target instanceof n.Node && (t.contains(e.target) || (e.preventDefault(), t.focus()));
    },
    wi = () => {
      Vn.current = 0, Cn(!1);
    },
    Ti = () => {
      Hn.current != null && (globalThis.clearTimeout(Hn.current), Hn.current = null);
    },
    Ei = () => {
      Un.current != null && (globalThis.clearTimeout(Un.current), Un.current = null);
    },
    Oi = () => {
      ft != null && (Ti(), $t(!1), yn({
        x: 0,
        y: 0
      }), et(!0), ne?.(!0));
    },
    ki = () => {
      if (Ti(), et(!1), rn(!1), ne?.(!1), Zt(!1), !br) {
        $t(!1);
        return;
      }
      $t(!0), Hn.current = globalThis.setTimeout(() => {
        $t(!1), Hn.current = null;
      }, qa);
    },
    Ai = e => {
      if (q) {
        ki();
        return;
      }
      if (Xt || Qt) return;
      Ti(), $t(!1);
      let t = e.currentTarget.ownerDocument.defaultView;
      if (typeof t?.matchMedia == `function` && t.matchMedia(`(prefers-reduced-motion: reduce)`).matches) {
        Oi();
        return;
      }
      Zt(!0), Oi(), globalThis.setTimeout(() => {
        Zt(!1);
      }, qa);
    },
    ji = e => {
      let t = Yr(e, Xe, On.current.trim());
      Mn.current = e, Je(e), Nr(On.current, kn.current, e), k?.(t);
    },
    Ni = () => {
      let e = mn.current;
      j?.({
        property: e.property,
        isEditingControl: e.hasFocusedInput || e.isControlEditing || e.isDragging || e.property != null
      });
    },
    Pi = e => {
      mn.current.isDragging = e, dn(e), Ni();
    },
    Fi = e => {
      mn.current.isControlEditing = e, Ni();
    },
    Ii = (e, t) => {
      mn.current.property = t?.type === `range` ? null : e, mn.current.isDragging = e != null, Ni();
      let n = An.current?.getBoundingClientRect();
      if (e == null) {
        Ei(), dn(!1), Un.current = globalThis.setTimeout(() => {
          ln(null), pn(null), Un.current = null;
        }, Ja);
        return;
      }
      if (Ei(), t == null || n == null) {
        dn(!1), ln(null);
        return;
      }
      if (t.type === `range`) {
        let r = t.parentElement?.getBoundingClientRect();
        r != null && (ln(null), pn({
          callback: e,
          rect: {
            height: r.height,
            left: r.left - n.left,
            top: r.top - n.top,
            width: r.width
          }
        }), dn(!0));
        return;
      }
      pn(null);
      let r = t.closest(`[data-browser-sidebar-design-scrub-value-cell]`);
      if (r == null) {
        dn(!1), ln(null);
        return;
      }
      let i = r.dataset.browserSidebarDesignScrubPeerProperty,
        a = i == null ? null : Array.from(Nn.current?.querySelectorAll(`[data-browser-sidebar-design-scrub-property]`) ?? []).find(e => e.dataset.browserSidebarDesignScrubProperty === i) ?? null,
        o = a == null || a === r ? [r] : [r, a],
        s = o.flatMap(n => {
          let i = n.parentElement?.querySelector(`[data-browser-sidebar-design-scrub-label]`) ?? null,
            a = n.querySelector(`input`)?.parentElement ?? null,
            o = n.querySelector(`button`),
            s = n.dataset.browserSidebarDesignScrubProperty ?? e,
            c = i?.getBoundingClientRect(),
            l = a?.getBoundingClientRect(),
            u = o?.getBoundingClientRect(),
            d = n.getBoundingClientRect(),
            f = (n === r ? t.getAttribute(`aria-label`)?.trim() : null) ?? i?.dataset.browserSidebarDesignScrubCloneLabel ?? i?.textContent?.trim();
          return c == null || l == null || f == null || f.length === 0 ? [] : [{
            controlRect: l,
            label: f,
            labelRect: c,
            property: s,
            resetRect: u,
            rowBottom: Math.max(c.bottom, d.bottom, u?.bottom ?? -1 / 0),
            rowLeft: Math.min(c.left, d.left, u?.left ?? 1 / 0),
            rowRight: Math.max(c.right, d.right, u?.right ?? -1 / 0),
            rowTop: Math.min(c.top, d.top, u?.top ?? 1 / 0)
          }];
        });
      if (s.length !== o.length) {
        dn(!1), ln(null);
        return;
      }
      let c = Math.min(...s.map(e => e.rowLeft)),
        l = Math.max(...s.map(e => e.rowRight)),
        u = Math.min(...s.map(e => e.rowTop)),
        d = Math.max(...s.map(e => e.rowBottom));
      dn(!0), ln({
        rect: {
          height: d - u,
          left: c - n.left,
          top: u - n.top,
          width: l - c
        },
        rows: s.map(e => ({
          controlRect: {
            height: e.controlRect.height,
            left: e.controlRect.left - c,
            top: e.controlRect.top - u,
            width: e.controlRect.width
          },
          label: e.label,
          labelRect: {
            height: e.labelRect.height,
            left: e.labelRect.left - c,
            top: e.labelRect.top - u,
            width: e.labelRect.width
          },
          property: e.property,
          resetRect: e.resetRect == null ? void 0 : {
            height: e.resetRect.height,
            left: e.resetRect.left - c,
            top: e.resetRect.top - u,
            width: e.resetRect.width
          }
        }))
      });
    },
    Li = mt,
    Ri = e => {
      kt(e, {
        onAtMention: Jn.handleMentionEvent,
        onSkillMention: Yn.handleMentionEvent
      });
    },
    Bi = u != null && !q,
    Vi = e => {
      Wn.current = !1;
      let t = ta(e);
      if (!q && !Bi || !e.isPrimary || e.button !== 0 || Fn.current == null || t == null) return;
      let n = Fn.current.getBoundingClientRect(),
        r = _r ? An.current?.getBoundingClientRect().height ?? n.height : n.height,
        i = e.currentTarget.ownerDocument.defaultView,
        a = q ? 0 : wr;
      Gn.current = {
        baseLeft: n.left - vn.x,
        baseTop: n.bottom - r - a - vn.y,
        captureTarget: t,
        cardHeight: r + a,
        cardWidth: n.width,
        dragged: !1,
        offsetX: vn.x,
        offsetY: vn.y,
        pointerId: e.pointerId,
        reportsRepositionInteraction: u != null,
        startClientX: e.clientX,
        startClientY: e.clientY,
        viewportHeight: i?.innerHeight ?? 1 / 0,
        viewportWidth: i?.innerWidth ?? 1 / 0
      }, u != null && L?.(!0), t.setPointerCapture(e.pointerId);
    },
    Hi = e => {
      let t = Gn.current;
      if (t == null || t.pointerId !== e.pointerId) return;
      let n = e.clientX - t.startClientX,
        r = e.clientY - t.startClientY;
      if (!t.dragged && Math.hypot(n, r) <= Ka) return;
      t.dragged = !0, Wn.current = !0;
      let i = t.offsetX + n,
        a = t.offsetY + r,
        o = Ga - t.baseLeft,
        s = t.viewportWidth - t.cardWidth - Ga - t.baseLeft,
        c = Ga - t.baseTop,
        l = t.viewportHeight - t.cardHeight - Ga - t.baseTop;
      e.preventDefault(), yn({
        x: s < o ? i : Math.min(Math.max(i, o), s),
        y: l < c ? a : Math.min(Math.max(a, c), l)
      });
    },
    Wi = e => {
      let t = Gn.current;
      t?.pointerId === e.pointerId && (Gn.current = null, t.reportsRepositionInteraction && L?.(!1), t.captureTarget.hasPointerCapture(e.pointerId) && t.captureTarget.releasePointerCapture(e.pointerId));
    },
    Gi = `translate3d(${vn.x}px, ${vn.y}px, 0px)`;
  return (0, $.jsx)(`form`, {
    className: `pointer-events-none relative flex h-full w-full flex-col overflow-visible bg-transparent text-default`,
    "aria-busy": H,
    style: {
      ...It,
      transform: q ? void 0 : Gi,
      top: Tr?.minTop,
      height: Or
    },
    onFocusCapture: e => {
      jn.current = e.target;
    },
    onKeyDownCapture: Si,
    onSubmit: e => {
      if (e.preventDefault(), X == null) {
        vi(`button`);
        return;
      }
      gi(`button`);
    },
    children: (0, $.jsxs)(`div`, {
      ref: An,
      className: G(wa, Tr == null ? `absolute` : `relative mt-auto shrink-0`, _r && `justify-end`),
      style: {
        top: Tr == null ? wr : void 0,
        height: Dr
      },
      children: [(0, $.jsx)(`div`, {
        className: Ca,
        style: {
          height: wr
        },
        children: Xn != null && wr > 0 ? (0, $.jsxs)(`div`, {
          "data-browser-comment-editor-tray-surface": !0,
          className: `pointer-events-auto max-h-full w-full`,
          children: [Xn === `at` ? (0, $.jsx)(nt, {
            className: `max-h-full w-full`,
            chromeVariant: `default`,
            hostId: A,
            keyboardEventTarget: w,
            onAddContext: Jn.addMention,
            onRequestClose: Jn.closeAutocomplete,
            onUpdateSelectedMention: Jn.setSelectedMention,
            query: Jn.ui?.query ?? ``,
            fileSearchRootPaths: qn ?? [],
            skillRoots: qn,
            source: Jn.ui?.source ?? null
          }) : null, Xn === `skill` ? (0, $.jsx)(ut, {
            className: `max-h-full w-full`,
            query: Yn.ui?.query ?? ``,
            keyboardEventTarget: w,
            onUpdateSelectedMention: Yn.setSelectedMention,
            onAddMention: Yn.addMention,
            onRequestClose: Yn.closeAutocomplete,
            cwd: a.cwd ?? void 0,
            roots: qn,
            chromeVariant: `default`
          }) : null]
        }) : null
      }), (0, $.jsxs)(bi, {
        ref: Nn,
        className: G(`relative max-w-full shrink-0`, {
          "w-[344px]": $n,
          "w-[294px]": !$n
        }, Sn && `bg-surface-elevated ring-ring`, un ? `opacity-0 duration-relaxed` : `duration-basic`),
        bodyRef: Pn,
        bodyHeight: _r || !q && !xr ? Cr : void 0,
        metadataHeader: St ? (0, $.jsx)(si, {
          isSurfaceOverflowing: Ar,
          isVisible: l && !H && Ut,
          maxHeight: U ? (Or ?? Er) - (Kt ?? Cr) : void 0,
          metadataGroups: yt,
          onExpandedSizeChange: Bt,
          onScrollReviewStateChange: Ot,
          onToggle: () => K.focus(),
          scrollReviewState: U ? Dt : `complete`,
          tooltipPortalContainer: ti,
          viewportRef: Et,
          windowWidth: h
        }, a.sessionId) : null,
        viewportRef: Fn,
        viewportMaxHeight: Ar ? Er : void 0,
        viewportTransform: q ? Gi : void 0,
        isRevealingPageComment: H,
        style: {
          transition: be || St && !Ut ? `none` : void 0
        },
        onDragEnter: e => {
          R && _t(e.dataTransfer) && (e.preventDefault(), e.stopPropagation(), e.dataTransfer.dropEffect = `copy`, Vn.current += 1, Cn(!0));
        },
        onDragOver: e => {
          R && _t(e.dataTransfer) && (e.preventDefault(), e.stopPropagation(), e.dataTransfer.dropEffect = `copy`, Sn || Cn(!0));
        },
        onDragLeave: e => {
          R && _t(e.dataTransfer) && (e.preventDefault(), e.stopPropagation(), Vn.current = Math.max(0, Vn.current - 1), Vn.current === 0 && Cn(!1));
        },
        onDrop: e => {
          if (!R || !_t(e.dataTransfer)) return;
          e.preventDefault(), e.stopPropagation();
          let t = gt(e.dataTransfer);
          t.length > 0 && hi(t), wi();
        },
        onClickCapture: e => {
          Wn.current && e.detail > 0 && (Wn.current = !1, e.preventDefault(), e.stopPropagation());
        },
        onLostPointerCapture: Wi,
        onPointerCancel: Wi,
        onPointerDown: Vi,
        onPointerMove: Hi,
        onPointerUp: Wi,
        children: [Li ? (0, $.jsx)(c, {
          "aria-label": Hr,
          "data-browser-sidebar-design-editor-toggle": !0,
          className: `absolute top-2 left-3 z-10`,
          color: q ? `secondary` : `ghost`,
          size: `composer`,
          disabled: H,
          title: Hr,
          type: `button`,
          uniform: !0,
          onClick: Ai,
          children: (0, $.jsx)(`span`, {
            className: Yi.DesignEditorEntry,
            "data-animation-state": q ? void 0 : Qt ? `entering` : Xt ? `exiting` : `visible`,
            "data-browser-sidebar-design-editor-entry-enter": !q && Qt ? `` : void 0,
            children: (0, $.jsx)(Ht, {
              className: `icon-sm origin-center`
            })
          })
        }) : null, vr ? (0, $.jsx)(`div`, {
          "data-browser-comment-editor-attachment-row": !0,
          className: G(`absolute right-3 flex gap-1.5 overflow-x-auto pb-1`, Ra, mt ? `left-12` : `left-3`),
          children: Ue.map((e, t) => (0, $.jsx)(xt, {
            src: e.dataUrl,
            filename: e.filename,
            previewPortalContainer: w?.document.body ?? null,
            onPreviewCloseAutoFocus: xn,
            onPreviewOpenChange: bn,
            onRemove: () => {
              let e = kn.current.filter((e, n) => n !== t);
              kn.current = e, Ge(e), Nr(On.current, e);
            }
          }, `${e.filename ?? `image`}-${t}`))
        }) : null, tr ? (0, $.jsx)(`div`, {
          className: G(`min-w-0 pe-3`, mt ? `ps-12` : `ps-3`, vr ? `pt-24` : `pt-2`),
          children: (0, $.jsx)(cn, {
            anchors: f,
            onSelectionHoverChange: N,
            onRemove: a.target.mode === `create` ? te : void 0
          })
        }) : null, q && ft != null ? (0, $.jsxs)(`div`, {
          "data-browser-comment-design-editor-stack": !0,
          className: G(Wa, vr ? Ba : `pt-2`, nn ? `gap-0` : `gap-2`),
          children: [(0, $.jsx)(`div`, {
            ref: Fr,
            "data-browser-comment-design-prompt-shell": !0,
            className: G(`translate-y-0.5 transition-[height,min-height,max-height] duration-[140ms] ease-enter-snappy motion-reduce:transition-none`, H && `transition-none`, Li && `ms-8`, nn ? G(Ha, !xe && `max-h-[84px]`) : `h-7 min-h-0 overflow-hidden`),
            children: (0, $.jsx)(`div`, {
              className: G(`min-h-0`, !nn && `h-full`),
              children: (0, $.jsx)(Di, {
                className: G(Rt, nn && (xe ? Ua : `!h-auto !max-h-[84px] overflow-y-auto pb-2`), !nn && `!overflow-hidden [&_.ProseMirror]:h-6 [&_.ProseMirror]:!overflow-hidden [&_.ProseMirror]:whitespace-nowrap`),
                composerController: K,
                handoff: ze,
                isRevealing: H,
                isVisible: l,
                scrollReviewState: U ? je : `complete`,
                onScrollReviewStateChange: Me,
                disableAutoFocus: !i,
                ariaLabel: z,
                minHeight: `1.5rem`,
                placeholder: Ur,
                onSuggestionHandler: Ri,
                onSubmit: () => vi(`keyboard`)
              })
            })
          }), (0, $.jsx)(`div`, {
            className: `contents`,
            inert: H,
            onFocusCapture: e => {
              mn.current.hasFocusedInput = e.target.matches(`input:not([type='range']), textarea, select`), Ni();
            },
            onBlurCapture: () => {
              mn.current.hasFocusedInput = !1, Ni();
            },
            children: (0, $.jsx)(Tn, {
              canEditAnnotationControls: xe && Te,
              defaultExpandedSpacingGroups: S,
              dropdownPortalContainer: w?.document.body ?? null,
              editorState: ft,
              isEditable: !0,
              onControlDragActiveChange: Pi,
              onControlEditingActiveChange: Fi,
              onScrubActiveChange: Ii,
              onUpdate: ji
            }, ft.id)
          })]
        }) : (0, $.jsx)($.Fragment, {
          children: (0, $.jsx)(`div`, {
            "data-browser-comment-editor-input-shell": !0,
            inert: lr || ur,
            role: `presentation`,
            className: G((lr || ur) && `invisible`, xr ? G(`min-w-0`, er ? `pb-[52px]` : `pb-2`, mt && !Xt ? Sr ? G(`ps-12`, Va) : `ps-12 pe-4` : Sr ? G(`ps-4`, Va) : `px-4`, vr && !tr ? Ba : `pt-2`) : G(Lt, H && `transition-none`, mt && !Xt ? `left-12` : `left-4`, vr ? za : `top-2`, yr ? mt && !Xt ? `bottom-[52px] w-[calc(100%-64px)]` : `bottom-[52px] w-[calc(100%-32px)]` : mt && !Xt ? `bottom-2 w-[calc(100%-92px)]` : `bottom-2 w-[calc(100%-60px)]`)),
            onMouseDown: Ci,
            children: (0, $.jsx)(`div`, {
              className: G(xr ? G(`min-h-0`, tr && Sr ? `-translate-y-0.5` : `translate-y-0.5`) : `h-full min-h-0 translate-y-0.5`),
              children: (0, $.jsx)(Di, {
                className: G(Rt, xr && (xe ? La : `!max-h-[180px] overflow-y-auto`), !er && !vr && `!overflow-hidden [&_.ProseMirror]:h-6 [&_.ProseMirror]:!overflow-hidden [&_.ProseMirror]:whitespace-nowrap`),
                composerController: K,
                handoff: ze,
                isRevealing: H,
                isVisible: l,
                scrollReviewState: U ? je : `complete`,
                onScrollReviewStateChange: Me,
                disableAutoFocus: !i,
                ariaLabel: z,
                minHeight: `1.5rem`,
                placeholder: Ur,
                onSuggestionHandler: Ri,
                onSubmit: X == null ? () => vi(`keyboard`) : () => gi(`keyboard`)
              })
            })
          })
        }), (0, $.jsx)(`span`, {
          ref: e => {
            Ln.current = e, e != null && U && Pr(On.current);
          },
          "aria-hidden": `true`,
          className: Ta,
          style: {
            fontSize: `var(--codex-chat-font-size)`
          },
          children: Ve
        }), q ? (0, $.jsx)(`div`, {
          "data-browser-sidebar-design-footer-divider": !0,
          className: `pointer-events-none absolute inset-x-0 bottom-12 border-t border-border/60`
        }) : null, (0, $.jsxs)(`div`, {
          "data-browser-comment-editor-footer-actions": !0,
          "aria-hidden": !fi,
          className: G(Vt, `justify-between gap-1.5`, fi ? `scale-100 opacity-100` : `invisible pointer-events-none scale-95 opacity-0`),
          children: [(0, $.jsxs)(`div`, {
            className: G(`flex min-w-0 items-center gap-1.5`, X == null && (Kr ? `me-16` : `me-7`)),
            children: [X != null && re != null ? (0, $.jsx)(c, {
              "aria-label": Vr,
              color: `ghostMuted`,
              size: `composer`,
              onClick: () => {
                re(X);
              },
              uniform: !0,
              children: (0, $.jsx)(Pt, {
                className: `icon-sm`
              })
            }) : X == null && ui != null && O != null ? (0, $.jsx)(c, {
              "aria-label": Vr,
              color: `ghostMuted`,
              size: `composer`,
              onClick: () => {
                O(ui.id);
              },
              uniform: !0,
              children: (0, $.jsx)(Pt, {
                className: `icon-sm`
              })
            }) : null, X == null ? pi : null, V == null ? null : (0, $.jsx)(zi, {
              originalText: V.text,
              isRevealing: H,
              tooltipPortalContainer: ti
            })]
          }), X == null ? null : (0, $.jsxs)(`div`, {
            className: `flex shrink-0 items-center gap-1.5`,
            children: [Kr ? (0, $.jsx)(wt, {
              isVisible: Wr,
              isStarting: cr,
              isTranscribing: ur,
              canRetryDictation: dr,
              disabled: ar == null,
              retryDictation: fr,
              startDictation: mr,
              stopDictation: hr,
              tooltipPortalContainer: ti
            }) : null, pi, (0, $.jsx)(c, {
              color: `primary`,
              disabled: Ft || !Zr,
              size: `composer`,
              type: `submit`,
              children: (0, $.jsx)(W, {
                id: `browserSidebarCommentOverlay.save`,
                defaultMessage: `Save`,
                description: `Primary action for editing an existing browser comment`
              })
            })]
          })]
        }), _r ? (0, $.jsx)(`div`, {
          "data-browser-comment-editor-dictation-overlay": !0,
          className: `absolute inset-0 z-20 flex flex-col justify-center bg-surface-elevated-secondary`,
          children: (0, $.jsx)(dt, {
            transcriptionAction: gr,
            waveformCanvasRef: pr,
            stopDictation: hr,
            noBottomMargin: !0,
            tooltipPortalContainer: ti
          })
        }) : null, X == null ? (0, $.jsxs)(`div`, {
          className: `absolute right-2 bottom-2 flex items-center gap-2`,
          children: [Kr ? (0, $.jsx)(wt, {
            isVisible: Wr,
            isStarting: cr,
            isTranscribing: ur,
            canRetryDictation: dr,
            disabled: H || Gr,
            retryDictation: fr,
            startDictation: mr,
            stopDictation: hr,
            tooltipPortalContainer: ti
          }) : null, qr ? (0, $.jsx)(o, {
            cloneCustomTrigger: U,
            delayOpen: Mt,
            side: U ? `right` : `top`,
            sideOffset: 4,
            portalContainer: ti,
            open: Zn && !Mt ? !1 : void 0,
            tooltipContent: li ?? (0, $.jsxs)(`div`, {
              className: `space-y-1`,
              children: [(0, $.jsx)(ia, {
                keysLabel: ri,
                children: ai === `direct` ? (0, $.jsx)(ra, {}) : (0, $.jsx)(na, {})
              }), de ? (0, $.jsx)(ia, {
                keysLabel: ii,
                children: ai === `direct` ? (0, $.jsx)(na, {}) : (0, $.jsx)(ra, {})
              }) : null]
            }),
            children: (0, $.jsx)(c, {
              "aria-label": Lr,
              color: Mt ? `secondary` : `primary`,
              "data-browser-comment-submit": !0,
              radius: `full`,
              size: ge,
              disabled: Qr,
              type: `button`,
              uniform: !0,
              onMouseDown: e => {
                e.preventDefault();
              },
              onClick: xi,
              children: ci
            })
          }) : null]
        }) : null]
      }), fn != null && ft != null ? (0, $.jsx)(Ui, {
        ...fn,
        editorState: ft
      }) : null, sn != null && mi != null && mi.length === sn.rows.length ? (0, $.jsxs)(`div`, {
        "aria-hidden": `true`,
        className: `pointer-events-none absolute z-20`,
        "data-browser-comment-design-scrub-clone": !0,
        style: {
          height: sn.rect.height,
          left: sn.rect.left,
          top: sn.rect.top,
          width: sn.rect.width
        },
        children: [(0, $.jsx)(`span`, {
          className: `absolute -top-2 -right-3 -bottom-2 -left-3 rounded-xl bg-surface-elevated-secondary shadow-md ring-1 ring-border-subtle`
        }), mi.map(({
          row: e,
          value: t
        }) => (0, $.jsxs)(Q.Fragment, {
          children: [(0, $.jsx)(`span`, {
            className: `absolute flex min-w-0 items-center text-sm text-secondary`,
            style: {
              height: e.labelRect.height,
              left: e.labelRect.left,
              top: e.labelRect.top,
              width: e.labelRect.width
            },
            children: (0, $.jsx)(`span`, {
              className: `min-w-0 truncate`,
              children: e.label
            })
          }), e.resetRect == null ? null : (0, $.jsx)(`span`, {
            className: `absolute flex items-center justify-center text-secondary`,
            style: {
              height: e.resetRect.height,
              left: e.resetRect.left,
              top: e.resetRect.top,
              width: e.resetRect.width
            },
            children: (0, $.jsx)(Wt, {
              className: `icon-2xs`
            })
          }), (0, $.jsxs)(`span`, {
            className: `absolute flex min-w-0 items-center gap-1 rounded-lg border border-ring bg-primary-soft px-3 text-default shadow-sm ring-1 ring-ring`,
            style: {
              height: e.controlRect.height,
              left: e.controlRect.left,
              top: e.controlRect.top,
              width: e.controlRect.width
            },
            children: [(0, $.jsx)(`span`, {
              className: `min-w-0 flex-1 truncate text-start font-mono text-xs text-default`,
              dir: `ltr`,
              children: t.value
            }), t.unit == null ? null : (0, $.jsx)(`span`, {
              className: `shrink-0 font-mono text-xs text-tertiary`,
              children: t.unit
            })]
          })]
        }, e.property))]
      }) : null]
    })
  });
}
