import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initializeRea, ReaProviders } from '../../src/client/rea-root.jsx';
import { HiddenBrowserSlot } from '../../src/client/hidden-browser-slot.jsx';
import { createReaPortal } from '../../src/client/portal-host.mjs';
import styles from '../../src/client/rea-styles.css';
import * as Shared from '../../src/client/rea/app-shared-2f2228189a8d.js';

initializeRea();
const roots = new Map();
window.portalFixture = {
  mount(id, hidden = false) {
    const mount = document.createElement('div'); document.body.append(mount);
    const root = createRoot(mount);
    const owned = hidden ? null : createReaPortal(styles, { reaRoot: '', codexWindowType: 'electron' }, 60);
    if (owned) owned.host.dataset.testPortal = id;
    roots.set(id, { root, mount, owned });
    flushSync(() => root.render(hidden ? <HiddenBrowserSlot usePages={() => []} />
      : <ReaProviders portal={owned.portal} path="/portal-test" />));
  },
  move(id) {
    const entry = roots.get(id), previous = entry.owned;
    const owned = createReaPortal(styles, { reaRoot: '', codexWindowType: 'electron' }, 60);
    owned.host.dataset.testPortal = id;
    flushSync(() => entry.root.render(<ReaProviders portal={owned.portal} path="/portal-test" />));
    entry.owned = owned; previous.dispose();
  },
  unmount(id) {
    const entry = roots.get(id);
    entry.root.unmount(); entry.owned?.dispose(); entry.mount.remove(); roots.delete(id);
  },
  notify: message => Shared.WFt().danger(message),
  guestRoots() {
    const root = Shared.MRi(), browser = Shared.zRi();
    const button = document.createElement('button'); button.textContent = 'Guest control';
    button.style.cssText = 'position:fixed;left:100px;top:100px;width:120px;height:40px;pointer-events:auto';
    button.onclick = () => { window.guestClicks = (window.guestClicks ?? 0) + 1; };
    browser.append(button);
    return { reused: Shared.MRi() === root && Shared.zRi() === browser };
  },
};
