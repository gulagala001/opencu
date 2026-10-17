function Xr(e, t) {
  return e == null || t == null ? e === t : (e.comment ?? ``) !== (t.comment ?? ``) || !Zr(e.text, t.text) || e.declarations.length !== t.declarations.length || e.annotationControlChanges?.length !== t.annotationControlChanges?.length ? !1 : e.declarations.every((e, n) => {
    let r = t.declarations[n];
    return r != null && e.property === r.property && e.previousValue === r.previousValue && e.value === r.value;
  }) && (e.annotationControlChanges?.every((e, n) => {
    let r = t.annotationControlChanges?.[n];
    return r != null && e.callback === r.callback && e.previousValue === r.previousValue && e.value === r.value;
  }) ?? !0);
}
