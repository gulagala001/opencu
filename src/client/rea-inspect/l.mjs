function l(e, t, n, r) {
  let i = document.createElement(`div`);
  i.setAttribute(`aria-hidden`, `true`), i.style.inset = `0`, i.style.overflow = `hidden`, i.style.pointerEvents = `none`, i.style.position = `absolute`, i.style.zIndex = `20`;
  let a = document.createElement(`div`);
  a.dataset.testid = n, a.style.height = `${I}px`, a.style.left = `0`, a.style.position = `absolute`, a.style.top = `0`, a.style.transformOrigin = `${L}px ${L}px`, a.style.willChange = `transform`, a.style.width = `${I}px`;
  let o = document.createElement(`div`);
  o.style.transform = `translate3d(${B}px, ${V}px, 0)`;
  let s = document.createElement(`img`);
  return s.alt = ``, s.dataset.browserAgentCursorAsset = ``, s.dataset.testid = `${n}-asset`, s.draggable = !1, s.height = z, s.src = t, s.style.display = `block`, s.style.setProperty(U, r), s.style.filter = W, s.style.transform = `rotate(${H}deg) scale(1)`, s.style.transformOrigin = `0 0`, s.width = R, o.appendChild(s), a.appendChild(o), i.appendChild(a), e.appendChild(i), {
    cursor: a,
    layer: i
  };
}
