function Ui(e) {
  let t = (0, Wi.c)(20),
    {
      callback: n,
      editorState: r,
      rect: i
    } = e,
    a,
    o,
    s;
  if (t[0] !== n || t[1] !== r.annotationControlChanges || t[2] !== r.annotationControls?.controls) {
    s = Symbol.for(`react.early_return_sentinel`);
    bb0: {
      if (a = r.annotationControls?.controls.find(e => e.callback === n), a?.type !== `range`) {
        s = null;
        break bb0;
      }
      o = r.annotationControlChanges?.find(e => e.callback === n)?.value ?? a.currentValue ?? K(a);
    }
    t[0] = n, t[1] = r.annotationControlChanges, t[2] = r.annotationControls?.controls, t[3] = a, t[4] = o, t[5] = s;
  } else a = t[3], o = t[4], s = t[5];
  if (s !== Symbol.for(`react.early_return_sentinel`)) return s;
  let c = o;
  if (typeof c != `number`) return null;
  let l;
  t[6] === Symbol.for(`react.memo_cache_sentinel`) ? (l = (0, Gi.jsx)(`span`, {
    className: `absolute -top-2 -right-3 -bottom-2 -left-3 rounded-xl bg-surface-elevated-secondary shadow-md ring-1 ring-border-subtle`
  }), t[6] = l) : l = t[6];
  let u;
  t[7] !== a.max || t[8] !== a.min || t[9] !== a.step || t[10] !== c ? (u = (0, Gi.jsx)(nn, {
    min: a.min,
    max: a.max,
    step: a.step,
    value: c,
    readOnly: !0,
    tabIndex: -1
  }), t[7] = a.max, t[8] = a.min, t[9] = a.step, t[10] = c, t[11] = u) : u = t[11];
  let d;
  t[12] === c ? d = t[13] : (d = (0, Gi.jsx)(`span`, {
    className: `min-w-6 shrink-0 text-end font-mono text-xs text-secondary tabular-nums`,
    children: c
  }), t[12] = c, t[13] = d);
  let f;
  t[14] !== u || t[15] !== d ? (f = (0, Gi.jsxs)(`span`, {
    className: `relative flex h-full w-full min-w-0 items-center gap-2`,
    children: [u, d]
  }), t[14] = u, t[15] = d, t[16] = f) : f = t[16];
  let p;
  return t[17] !== i || t[18] !== f ? (p = (0, Gi.jsxs)(`div`, {
    "aria-hidden": `true`,
    className: `pointer-events-none absolute z-20`,
    style: i,
    children: [l, f]
  }), t[17] = i, t[18] = f, t[19] = p) : p = t[19], p;
}
