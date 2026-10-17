function Mw(e) {
  let t = e.data;
  if (e.source !== window || e.origin !== window.location.origin || t?.type !== `remote-hosted-pip-video-frame` && t?.type !== `remote-hosted-pip-video-error`) return;
  let n = Nw.get(t.threadID);
  t.type === `remote-hosted-pip-video-error` ? n?.forEach(e => e(t)) : n?.size === 1 ? n.forEach(e => e(t)) : (n?.forEach(e => e({
    ...t,
    frame: t.frame.clone()
  })), t.frame.close());
}
