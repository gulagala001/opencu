function Lw(e) {
  let t = (0, Hw.c)(18),
    {
      maxDisplaySize: n,
      pendingFrames: r,
      presentationID: i,
      shouldUseReducedMotion: a,
      videoStreams: o,
      onError: s,
      onLoadedData: c
    } = e,
    l = Ai(),
    u;
  t[0] !== r || t[1] !== i || t[2] !== o ? (u = e => Rw(e, i, r, o), t[0] = r, t[1] = i, t[2] = o, t[3] = u) : u = t[3];
  let d = u,
    f;
  t[4] === n ? f = t[5] : (f = {
    maxWidth: n,
    maxHeight: n
  }, t[4] = n, t[5] = f);
  let p;
  t[6] === l ? p = t[7] : (p = l.formatMessage({
    id: `codex.remoteHostedPip.computerUsePreview`,
    defaultMessage: `Computer Use preview`,
    description: `Accessible label for a live Computer Use video shown inside the Picture in Picture sidebar section`
  }), t[6] = l, t[7] = p);
  let m;
  t[8] === a ? m = t[9] : (m = a ? {
    duration: 0
  } : Ga, t[8] = a, t[9] = m);
  let h;
  return t[10] !== d || t[11] !== s || t[12] !== c || t[13] !== i || t[14] !== f || t[15] !== p || t[16] !== m ? (h = (0, Ww.jsx)(Or.video, {
    ref: d,
    animate: f,
    "aria-label": p,
    className: `ms-auto block h-auto w-auto object-contain drop-shadow-md select-none group-hover/pip:brightness-95 group-focus-visible/pip:brightness-95`,
    "data-pip-native-video-presentation": i,
    initial: !1,
    transition: m,
    autoPlay: !0,
    disablePictureInPicture: !0,
    muted: !0,
    playsInline: !0,
    onError: s,
    onLoadedData: c
  }), t[10] = d, t[11] = s, t[12] = c, t[13] = i, t[14] = f, t[15] = p, t[16] = m, t[17] = h) : h = t[17], h;
}
