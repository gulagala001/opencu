function Tn(e) {
  let t = (0, J.c)(131),
    {
      canEditAnnotationControls: n,
      dropdownPortalContainer: r,
      editorState: i,
      defaultExpandedSpacingGroups: a,
      isEditable: l,
      onControlDragActiveChange: u,
      onControlEditingActiveChange: d,
      onScrubActiveChange: f,
      onUpdate: p
    } = e,
    m = ye(),
    h = s(me),
    g;
  t[0] === Symbol.for(`react.memo_cache_sentinel`) ? (g = new Set(), t[0] = g) : g = t[0];
  let _;
  t[1] === i.id ? _ = t[2] : (_ = {
    editorId: i.id,
    callbacks: g
  }, t[1] = i.id, t[2] = _);
  let v = (0, Ir.useRef)(_),
    y;
  t[3] === m ? y = t[4] : (y = m.formatMessage({
    id: `browserSidebarDesignEditor.dragStylingControls`,
    defaultMessage: `Move styling controls`,
    description: `Accessible label for the browser design styling controls drag handle`
  }), t[3] = m, t[4] = y);
  let b = y,
    x;
  t[5] === i.annotationControls?.controlsHeading ? x = t[6] : (x = i.annotationControls?.controlsHeading ?? (0, Y.jsx)(W, {
    id: `browserSidebarDesignEditor.annotationControls.heading`,
    defaultMessage: `Webpage controls`,
    description: `Fallback heading for annotation controls supplied by the webpage, shown in the grip bar when replacing built-in controls or above the webpage section when extending them`
  }), t[5] = i.annotationControls?.controlsHeading, t[6] = x);
  let S = x,
    w = (0, Ir.useId)(),
    T;
  t[7] === i.anchor.frameUrl ? T = t[8] : (T = URL.parse(i.anchor.frameUrl ?? ``), t[7] = i.anchor.frameUrl, t[8] = T);
  let E = T,
    D;
  t[9] !== i.anchor.pageUrl || t[10] !== E ? (D = E?.hostname ? E : URL.parse(i.anchor.pageUrl), t[9] = i.anchor.pageUrl, t[10] = E, t[11] = D) : D = t[11];
  let k = D,
    A = k?.hostname === `localhost` ? k.host : k?.hostname || i.anchor.pageUrl,
    j;
  t[12] !== i.anchor.kind || t[13] !== i.elementTagName || t[14] !== i.targetLabel ? (j = i.elementTagName ?? (i.anchor.kind === `element` ? i.targetLabel.split(`:`, 1)[0]?.trim() : void 0), t[12] = i.anchor.kind, t[13] = i.elementTagName, t[14] = i.targetLabel, t[15] = j) : j = t[15];
  let M = j,
    N;
  t[16] !== a?.margin || t[17] !== a?.padding ? (N = () => ({
    margin: a?.margin === !0,
    padding: a?.padding === !0
  }), t[16] = a?.margin, t[17] = a?.padding, t[18] = N) : N = t[18];
  let [ee, te] = (0, Ir.useState)(N),
    [ne, re] = (0, Ir.useState)(!1),
    ie;
  t[19] === i ? ie = t[20] : (ie = () => hr(i), t[19] = i, t[20] = ie);
  let [P, ae] = (0, Ir.useState)(ie),
    oe;
  t[21] !== i.annotationControlChanges || t[22] !== i.annotationControls || t[23] !== i.id || t[24] !== i.targetLabel ? (oe = i.annotationControls == null ? null : {
    id: i.id,
    targetLabel: i.targetLabel,
    annotationControls: i.annotationControls,
    annotationControlChanges: i.annotationControlChanges
  }, t[21] = i.annotationControlChanges, t[22] = i.annotationControls, t[23] = i.id, t[24] = i.targetLabel, t[25] = oe) : oe = t[25];
  let F = oe,
    se = F != null && F.annotationControls.controls.length > 0,
    I = se && i.annotationControls?.controlsMode === `replace`,
    ce = i.anchor.kind !== `virtual` && !I,
    le;
  t[26] !== i || t[27] !== ce ? (le = ce ? ir(i) : null, t[26] = i, t[27] = ce, t[28] = le) : le = t[28];
  let L = le,
    R,
    ue,
    de,
    fe,
    pe,
    he,
    ge,
    z,
    _e;
  if (t[29] !== F || t[30] !== n || t[31] !== S || t[32] !== w || t[33] !== b || t[34] !== r || t[35] !== i || t[36] !== M || t[37] !== ee || t[38] !== se || t[39] !== m || t[40] !== l || t[41] !== ne || t[42] !== P || t[43] !== u || t[44] !== d || t[45] !== f || t[46] !== p || t[47] !== h || t[48] !== I || t[49] !== ce || t[50] !== L || t[51] !== A) {
    let e = cr(ar(ce ? i.declarations : [])),
      a;
    t[61] !== i || t[62] !== p ? (a = e => {
      p(e(i));
    }, t[61] = i, t[62] = p, t[63] = a) : a = t[63];
    let s = a,
      g;
    t[64] !== F || t[65] !== n || t[66] !== i || t[67] !== l || t[68] !== p || t[69] !== h ? (g = (e, t) => {
      if (!l || !n || F == null) return;
      let r = Xt(F, e, t);
      p({
        ...i,
        annotationControlChanges: r.annotationControlChanges
      });
      let a = F.annotationControls.controls.find(t => t.callback === e),
        o = F.annotationControlChanges?.find(t => t.callback === e)?.value ?? (a == null ? void 0 : a.currentValue ?? K(a)),
        s = r.annotationControlChanges?.find(t => t.callback === e)?.value;
      v.current.editorId !== i.id && (v.current = {
        editorId: i.id,
        callbacks: new Set()
      }), a != null && s !== o && !v.current.callbacks.has(e) && (v.current.callbacks.add(e), h.logProductEvent(ve, {
        feature: `custom-controls`,
        interactionType: `edited`,
        controlType: a.type
      }));
    }, t[64] = F, t[65] = n, t[66] = i, t[67] = l, t[68] = p, t[69] = h, t[70] = g) : g = t[70];
    let _ = g;
    z = `-mx-4 flex min-w-0 flex-col`;
    let y = I ? w : void 0,
      x;
    t[71] !== S || t[72] !== M || t[73] !== I ? (x = I ? S : M != null && (0, Y.jsx)(W, {
      id: `browserSidebarDesignEditor.targetTag`,
      defaultMessage: `<{tag}>`,
      description: `The annotated element's HTML tag name enclosed in angle brackets, shown in the annotation editor's drag bar`,
      values: {
        tag: M
      }
    }), t[71] = S, t[72] = M, t[73] = I, t[74] = x) : x = t[74];
    let T;
    t[75] === x ? T = t[76] : (T = (0, Y.jsx)(`bdi`, {
      children: x
    }), t[75] = x, t[76] = T);
    let E;
    t[77] !== y || t[78] !== T ? (E = (0, Y.jsx)($e, {
      id: y,
      className: `font-medium text-secondary`,
      animateOnGroupHover: !0,
      children: T
    }), t[77] = y, t[78] = T, t[79] = E) : E = t[79];
    let D;
    t[80] === b ? D = t[81] : (D = (0, Y.jsx)(C, {
      "aria-label": b,
      className: `rotate-90 text-tertiary`
    }), t[80] = b, t[81] = D), t[82] !== b || t[83] !== E || t[84] !== D ? (_e = (0, Y.jsxs)(`div`, {
      className: `group flex min-w-0 cursor-grab touch-none items-center justify-between gap-3 bg-text/5 px-4 py-1.5 text-xs select-none active:cursor-grabbing`,
      "data-browser-sidebar-design-drag-handle": !0,
      title: b,
      children: [E, D]
    }), t[82] = b, t[83] = E, t[84] = D, t[85] = _e) : _e = t[85], he = `max-h-[216px] min-w-0 overflow-y-auto`, ge = !0, R = $t, t[86] !== F || t[87] !== n || t[88] !== S || t[89] !== w || t[90] !== r || t[91] !== _ || t[92] !== se || t[93] !== m || t[94] !== l || t[95] !== u || t[96] !== d || t[97] !== f || t[98] !== I || t[99] !== A ? (ue = se ? (0, Y.jsxs)(`section`, {
      className: `col-span-2 grid min-w-0 grid-cols-subgrid gap-x-3 gap-y-1.5`,
      "aria-labelledby": w,
      children: [(0, Y.jsxs)(`div`, {
        className: G(`col-span-2 flex min-w-0 flex-col gap-1 pt-0.5 select-none`, I ? `pb-1.5` : `pb-1`),
        children: [I ? null : (0, Y.jsx)(`h3`, {
          id: w,
          className: `text-sm font-medium wrap-anywhere text-default`,
          children: (0, Y.jsx)(`bdi`, {
            children: S
          })
        }), (0, Y.jsxs)(`div`, {
          className: `flex min-w-0 items-center gap-1 text-xs text-secondary`,
          children: [(0, Y.jsx)(`p`, {
            children: (0, Y.jsx)(W, {
              id: `browserSidebarDesignEditor.annotationControls.websiteDomainAttribution`,
              defaultMessage: `Controls provided by {websiteDomain}`,
              description: `Disclosure above annotation controls supplied by a website. websiteDomain is the domain of the website providing these controls, such as example.com, or the host including the port for localhost, such as localhost:3000`,
              values: {
                websiteDomain: A
              }
            })
          }), (0, Y.jsx)(o, {
            cloneCustomTrigger: !0,
            portalContainer: r,
            side: `top`,
            variant: `rich`,
            tooltipContent: (0, Y.jsx)(`p`, {
              className: `p-3 text-xs`,
              children: (0, Y.jsx)(W, {
                id: `browserSidebarDesignEditor.annotationControls.previewSharingWithWebsiteDomain`,
                defaultMessage: `Your selections are shared with {websiteDomain} as you adjust these controls, before you send.`,
                description: `Tooltip explaining that the website receives annotation control selections as the user adjusts them, before sending the annotation to ChatGPT. websiteDomain is the receiving website's domain, such as example.com, or the host including the port for localhost, such as localhost:3000. This refers only to control values, not annotation text or attachments`,
                values: {
                  websiteDomain: A
                }
              })
            }),
            children: (0, Y.jsx)(c, {
              "aria-label": m.formatMessage({
                id: `browserSidebarDesignEditor.annotationControls.previewSharingLabel`,
                defaultMessage: `How control values are shared`,
                description: `Accessible label for the info icon showing a tooltip about sharing webpage annotation control values during preview`
              }),
              color: `ghostTertiary`,
              size: `inline`,
              children: (0, Y.jsx)(`span`, {
                className: `inline-flex`,
                children: (0, Y.jsx)(Ce, {
                  asset: O
                })
              })
            })
          })]
        })]
      }), (0, Y.jsx)(Qt, {
        dropdownPortalContainer: r,
        editorState: F,
        isEditable: l && n,
        onControlDragActiveChange: u,
        onControlEditingActiveChange: d,
        onReset: _,
        onScrubActiveChange: f,
        onValueChange: _
      })]
    }) : null, t[86] = F, t[87] = n, t[88] = S, t[89] = w, t[90] = r, t[91] = _, t[92] = se, t[93] = m, t[94] = l, t[95] = u, t[96] = d, t[97] = f, t[98] = I, t[99] = A, t[100] = ue) : ue = t[100], de = se && (L != null || e.length > 0) ? (0, Y.jsx)(An, {
      variant: `section`
    }) : null, t[101] !== r || t[102] !== l || t[103] !== L || t[104] !== s ? (fe = L == null ? null : (0, Y.jsx)(On, {
      dropdownPortalContainer: r,
      isEditable: l,
      isEdited: L.value !== L.previousValue,
      value: L.value,
      onReset: () => {
        s(tr);
      },
      onValueChange: e => {
        s(t => er(t, e));
      }
    }), t[101] = r, t[102] = l, t[103] = L, t[104] = s, t[105] = fe) : fe = t[105];
    let k;
    t[106] !== r || t[107] !== ee || t[108] !== l || t[109] !== ne || t[110] !== P || t[111] !== u || t[112] !== d || t[113] !== f || t[114] !== L || t[115] !== s ? (k = (e, t) => (0, Y.jsx)(kn, {
      dropdownPortalContainer: r,
      expandedSpacingGroups: ee,
      isFlexSpacingExpanded: ne,
      isEditable: l,
      lockedRelationships: P,
      sectionGroup: e,
      showDivider: t > 0 || L != null,
      onControlDragActiveChange: u,
      onControlEditingActiveChange: d,
      onDimensionLockToggle: () => {
        ae(Dn);
      },
      onDimensionValueChange: (e, t) => {
        s(n => P.dimensions ? $n(n, e, t) : Yn(n, e, {
          value: t
        }));
      },
      onSpacingExpandToggle: e => {
        te(t => ({
          ...t,
          [e]: !t[e]
        }));
      },
      onFlexSpacingExpandToggle: () => {
        re(En);
      },
      onSpacingLockToggle: (e, t) => {
        let n = mr(e, t),
          r = !P[n];
        ae(e => ({
          ...e,
          [n]: r
        })), r && s(n => Zn(n, e, t));
      },
      onSpacingValueChange: (e, t, n) => {
        s(r => vr(P, e, t) ? Qn(r, e, t, n) : Yn(r, t, {
          value: n
        }));
      },
      onDeclarationValueChange: (e, t) => {
        s(n => Yn(n, e, {
          value: t
        }));
      },
      onScrubActiveChange: f,
      onDeclarationReset: e => {
        let t = fr(e);
        s(n => t != null && vr(P, t, e) ? rr(n, t, e) : nr(n, e));
      }
    }, e.id), t[106] = r, t[107] = ee, t[108] = l, t[109] = ne, t[110] = P, t[111] = u, t[112] = d, t[113] = f, t[114] = L, t[115] = s, t[116] = k) : k = t[116], pe = e.map(k), t[29] = F, t[30] = n, t[31] = S, t[32] = w, t[33] = b, t[34] = r, t[35] = i, t[36] = M, t[37] = ee, t[38] = se, t[39] = m, t[40] = l, t[41] = ne, t[42] = P, t[43] = u, t[44] = d, t[45] = f, t[46] = p, t[47] = h, t[48] = I, t[49] = ce, t[50] = L, t[51] = A, t[52] = R, t[53] = ue, t[54] = de, t[55] = fe, t[56] = pe, t[57] = he, t[58] = ge, t[59] = z, t[60] = _e;
  } else R = t[52], ue = t[53], de = t[54], fe = t[55], pe = t[56], he = t[57], ge = t[58], z = t[59], _e = t[60];
  let B;
  t[117] !== R || t[118] !== ue || t[119] !== de || t[120] !== fe || t[121] !== pe ? (B = (0, Y.jsxs)(R, {
    children: [ue, de, fe, pe]
  }), t[117] = R, t[118] = ue, t[119] = de, t[120] = fe, t[121] = pe, t[122] = B) : B = t[122];
  let be;
  t[123] !== he || t[124] !== ge || t[125] !== B ? (be = (0, Y.jsx)(`div`, {
    className: he,
    "data-browser-sidebar-design-scroll-container": ge,
    children: B
  }), t[123] = he, t[124] = ge, t[125] = B, t[126] = be) : be = t[126];
  let xe;
  return t[127] !== z || t[128] !== _e || t[129] !== be ? (xe = (0, Y.jsxs)(`div`, {
    className: z,
    children: [_e, be]
  }), t[127] = z, t[128] = _e, t[129] = be, t[130] = xe) : xe = t[130], xe;
}
