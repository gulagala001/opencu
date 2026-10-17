function tT() {
  let e = (0, nT.c)(24),
    t = he(nn),
    n = Ai(),
    r;
  e[0] === t.value ? r = e[1] : (r = vi(t.value), e[0] = t.value, e[1] = r);
  let i = r,
    a;
  e[2] === t ? a = e[3] : (a = nr(t), e[2] = t, e[3] = a);
  let o = a,
    s = X(kw, i),
    c = X(Hl, i),
    l = S(Dh),
    u = S(Nf),
    d = X(Ih, o),
    f;
  e[4] !== o || e[5] !== d || e[6] !== l ? (f = () => l && o != null && d != null && Du.isBrowserUseTab(o, d), e[4] = o, e[5] = d, e[6] = l, e[7] = f) : f = e[7];
  let p = f,
    m = (0, rT.useSyncExternalStore)(Du.subscribe, p, p),
    h = Jt(`188145323`),
    g = Jt(`228020933`),
    {
      platform: _
    } = Da(),
    v;
  e[8] === i ? v = e[9] : (v = e => {
    i != null && Di.remoteHostedPIP?.setPlacement(i, e);
  }, e[8] = i, e[9] = v);
  let y = v;
  if (!h || !g || !s || m) return null;
  let b;
  e[10] === Symbol.for(`react.memo_cache_sentinel`) ? (b = (0, iT.jsx)(Z, {
    id: `codex.localConversation.remoteHostedPip.computerUse`,
    defaultMessage: `Computer Use`,
    description: `Section title for Computer Use controls in the thread summary side panel`
  }), e[10] = b) : b = e[10];
  let x;
  e[11] === Symbol.for(`react.memo_cache_sentinel`) ? (x = (0, iT.jsx)(Q.ItemLeading, {
    children: (0, iT.jsx)(Dw, {})
  }), e[11] = x) : x = e[11];
  let C;
  e[12] === Symbol.for(`react.memo_cache_sentinel`) ? (C = (0, iT.jsx)(Q.ItemLabel, {
    children: (0, iT.jsx)(Z, {
      id: `codex.localConversation.remoteHostedPip.pictureInPicture`,
      defaultMessage: `Picture in Picture`,
      description: `Label for the Computer Use PiP visibility control in the thread summary side panel`
    })
  }), e[12] = C) : C = e[12];
  let w;
  e[13] !== u || e[14] !== i || e[15] !== n || e[16] !== c || e[17] !== _ || e[18] !== t || e[19] !== y ? (w = (0, iT.jsxs)(Q.Item, {
    children: [x, C, (0, iT.jsx)(Q.ItemMeta, {
      variant: `text`,
      children: c ? (0, iT.jsxs)(Te, {
        align: `end`,
        contentWidth: `icon`,
        triggerButton: (0, iT.jsx)(`button`, {
          "aria-label": n.formatMessage({
            id: `codex.localConversation.remoteHostedPip.hidePictureInPicture`,
            defaultMessage: `Hide Picture in Picture`,
            description: `Accessible label for the Computer Use PiP hide menu`
          }),
          className: `cursor-interaction rounded-md border-0 bg-transparent p-0 text-tertiary select-none hover:text-default focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring`,
          type: `button`,
          children: (0, iT.jsx)(Z, {
            id: `codex.localConversation.remoteHostedPip.hide`,
            defaultMessage: `Hide`,
            description: `Label for hiding the Computer Use PiP stream`
          })
        }),
        children: [(0, iT.jsx)(mr, {
          onSelect: () => {
            bu(t, i);
          },
          children: (0, iT.jsx)(Z, {
            id: `codex.localConversation.remoteHostedPip.hideForTask`,
            defaultMessage: `Hide for this task`,
            description: `Menu item for hiding the Computer Use PiP stream for the current task`
          })
        }), (0, iT.jsx)(mr, {
          onSelect: () => {
            xm(t);
          },
          children: (0, iT.jsx)(Z, {
            id: `codex.localConversation.remoteHostedPip.hideForAllActiveTasks`,
            defaultMessage: `Hide for all active tasks`,
            description: `Menu item for hiding all active Computer Use PiP task streams`
          })
        }), _ === `macOS` && u?.activeThreadID === i && u.placement != null ? (0, iT.jsxs)(iT.Fragment, {
          children: [u.placement === `home` ? null : (0, iT.jsx)(mr, {
            onSelect: () => y(`home`),
            children: (0, iT.jsx)(Z, {
              id: `codex.localConversation.remoteHostedPip.moveToSidebar`,
              defaultMessage: `Move to sidebar`,
              description: `Menu item for moving a floating Computer Use video back into the task sidebar`
            })
          }), u.placement === `pinned` ? null : (0, iT.jsx)(mr, {
            onSelect: () => y(`pinned`),
            children: (0, iT.jsx)(Z, {
              id: `codex.localConversation.remoteHostedPip.moveToFloatingWindow`,
              defaultMessage: `Move to floating window`,
              description: `Menu item for moving a Computer Use video from the sidebar to a floating Picture in Picture window`
            })
          }), u.placement === `pet` ? null : (0, iT.jsx)(mr, {
            onSelect: () => y(`pet`),
            children: (0, iT.jsx)(Z, {
              id: `codex.localConversation.remoteHostedPip.sendToPet`,
              defaultMessage: `Send to Pet`,
              description: `Menu item for moving a Computer Use video from the sidebar to the Codex desktop pet`
            })
          })]
        }) : null]
      }) : (0, iT.jsx)(`button`, {
        "aria-label": n.formatMessage({
          id: `codex.localConversation.remoteHostedPip.showPictureInPicture`,
          defaultMessage: `Show Picture in Picture`,
          description: `Accessible label for showing the Computer Use PiP stream`
        }),
        className: `cursor-interaction rounded-md border-0 bg-transparent p-0 text-tertiary select-none hover:text-default focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring`,
        onClick: () => {
          Uf(t, i);
        },
        type: `button`,
        children: (0, iT.jsx)(Z, {
          id: `codex.localConversation.remoteHostedPip.show`,
          defaultMessage: `Show`,
          description: `Label for showing the Computer Use PiP stream`
        })
      })
    })]
  }), e[13] = u, e[14] = i, e[15] = n, e[16] = c, e[17] = _, e[18] = t, e[19] = y, e[20] = w) : w = e[20];
  let T;
  e[21] === Symbol.for(`react.memo_cache_sentinel`) ? (T = (0, iT.jsx)(Yw, {}), e[21] = T) : T = e[21];
  let E;
  return e[22] === w ? E = e[23] : (E = (0, iT.jsxs)(Q.Section, {
    sectionKey: `computer-use-pip`,
    title: b,
    children: [w, T]
  }), e[22] = w, e[23] = E), E;
}
