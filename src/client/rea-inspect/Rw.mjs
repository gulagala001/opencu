function Rw(e, t, n, r) {
  if (e == null) {
    let e = r.current.get(t);
    e != null && (zw(e), r.current.delete(t));
    return;
  }
  let i = new MediaStreamTrackGenerator({
      kind: `video`
    }),
    a = {
      closed: !1,
      filter: new Worker(new URL(`` + new URL(`remote-hosted-pip-frame-filter.worker-4b82a84542ac.js`, import.meta.url).href, `` + import.meta.url), {
        type: `module`
      }),
      filtering: !1,
      track: i,
      video: e,
      writer: i.writable.getWriter()
    };
  a.filter.onmessage = ({
    data: e
  }) => {
    if (a.filtering = !1, a.closed) {
      e?.close(), a.filter.terminate();
      return;
    }
    e != null && ((a.video.width !== e.displayWidth || a.video.height !== e.displayHeight) && (a.video.width = e.displayWidth, a.video.height = e.displayHeight), a.writer.write(e).catch(() => e.close()));
  }, a.filter.onerror = t => {
    t.preventDefault(), a.filter.terminate(), a.closed || e.dispatchEvent(new Event(`error`));
  }, e.srcObject = new MediaStream([i]), e.play().catch(() => {}), r.current.set(t, a);
  let o = n.current.get(t);
  o != null && (n.current.delete(t), Vw(a, o));
}
