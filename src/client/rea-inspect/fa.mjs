function fa(e, t, n) {
  if (n == null) return t == null;
  let r = Yr(n, t, e);
  return t == null ? r == null || r.declarations.length === 0 && r.text == null && r.annotationControlChanges?.every(e => {
    let t = n.annotationControls?.controls.find(t => t.callback === e.callback);
    return e.previousValue == null && t != null && e.value === K(t);
  }) === !0 : Xr(r, t);
}
