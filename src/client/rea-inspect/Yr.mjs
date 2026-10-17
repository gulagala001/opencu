function Yr(e, t, n) {
  let r = new Map((t?.declarations ?? []).map(e => [e.property, e])),
    i = e.declarations.flatMap(e => {
      let t = r.get(e.property);
      return t == null ? e.value === e.previousValue ? [] : [e] : e.value === t.previousValue ? [] : [{
        ...t,
        value: e.value
      }];
    }),
    a = new Map((t?.annotationControlChanges ?? []).map(e => [e.callback, e])),
    o = (e.annotationControlChanges ?? []).flatMap(e => {
      let t = a.get(e.callback),
        n = t == null ? e.previousValue : t.previousValue;
      return e.value === n ? [] : [{
        callback: e.callback,
        previousValue: n,
        value: e.value
      }];
    }),
    s = Qr(e.text, t?.text);
  if (i.length === 0 && o.length === 0 && s == null) return null;
  let c = new Date().toISOString(),
    l = {
      ...e.anchor
    };
  return t?.annotationControls != null && t.anchor.kind === `element` && l.kind === `element` && (l.runtimeElementId = t.anchor.runtimeElementId), {
    id: e.id,
    anchor: l,
    annotationControls: e.annotationControls,
    annotationControlChanges: o.length === 0 ? void 0 : o,
    ...(n.length === 0 ? {} : {
      comment: n
    }),
    text: s,
    declarations: i,
    draftAttribute: e.draftAttribute,
    markerViewportPoint: e.markerViewportPoint,
    provenance: $r(i, e.provenance, t?.provenance ?? []),
    selector: e.selector,
    targetLabel: e.targetLabel,
    elementTagName: e.elementTagName,
    themeVariant: e.themeVariant,
    viewportSize: e.viewportSize,
    createdAt: t?.createdAt ?? c,
    updatedAt: c,
    status: t?.status ?? `current`
  };
}
