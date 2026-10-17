function Mj(e) {
  let t = (0, Fj.c)(5),
    {
      display: n,
      onRetry: r
    } = e;
  if (!n.shouldShow) return null;
  let i;
  t[0] === Symbol.for(`react.memo_cache_sentinel`) ? (i = {
    width: 300
  }, t[0] = i) : i = t[0];
  let a;
  t[1] === Symbol.for(`react.memo_cache_sentinel`) ? (a = (0, $.jsx)(`div`, {
    className: `mb-2 font-medium text-default`,
    children: (0, $.jsx)(Z, {
      id: `localConversation.summaryPanelRenderError.title`,
      defaultMessage: `Summary panel couldn't render`,
      description: `Error message shown when the conversation summary panel fails to render`
    })
  }), t[1] = a) : a = t[1];
  let o;
  t[2] === Symbol.for(`react.memo_cache_sentinel`) ? (o = (0, $.jsx)(Z, {
    id: `localConversation.summaryPanelRenderError.retry`,
    defaultMessage: `Try again`,
    description: `Button label to retry rendering the conversation summary panel`
  }), t[2] = o) : o = t[2];
  let s;
  return t[3] === r ? s = t[4] : (s = (0, $.jsx)(`div`, {
    className: `pointer-events-none absolute top-(--thread-floating-content-top-inset) right-0 bottom-(--thread-floating-content-bottom-inset) z-40`,
    children: (0, $.jsx)(`div`, {
      className: `relative flex max-h-full`,
      children: (0, $.jsx)(`div`, {
        className: `max-h-full min-h-0 pe-3`,
        children: (0, $.jsxs)(`div`, {
          "data-pip-home-surface": `thread-summary-panel`,
          "data-pip-obstacle": `thread-summary-panel`,
          className: `pointer-events-auto rounded-lg border border-default bg-surface px-4 py-3 text-sm text-secondary shadow-lg`,
          style: i,
          children: [a, (0, $.jsx)(I, {
            color: `secondary`,
            size: `default`,
            onClick: r,
            children: o
          })]
        })
      })
    })
  }), t[3] = r, t[4] = s), s;
}
