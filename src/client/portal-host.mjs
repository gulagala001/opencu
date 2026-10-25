import { subscribeReaTheme } from './rea-theme.mjs';
import { adoptReaStyles } from './rea-sheets.mjs';

export { adoptReaStyles };
const noDrag = '[data-rea-root] * { -webkit-app-region: no-drag; }';

const portals = new Map();

/** Transparent carriers must stay click-through even under host !important rules. */
export function protectReaCarrier(element) {
  element?.style.setProperty('pointer-events', 'none', 'important');
}

/** Native guests live in the host document, outside the styled shadow portals. */
export function prepareReaGuestRoot(element, browser = false) {
  Object.assign(element.style, { position: 'fixed', inset: '0', overflow: 'visible' });
  protectReaCarrier(element);
  if (browser) element.style.contain = 'paint';
  else {
    element.style.zIndex = 'calc(var(--dsh-dockkit-dock-layer,10) + 1)';
    element.style.setProperty('-webkit-app-region', 'initial', 'important');
  }
}

/** Keep body-positioned overlays in their owning component's styled portal. */
export function reaPortalContainer(container, anchor) {
  if (container !== document.body || !anchor) return container;
  const root = anchor.getRootNode();
  return [...portals].find(([body, portal]) => body.getRootNode() === root || portal.getRootNode() === root)?.[1] ?? container;
}

/** Find an original component's element across its body and owned shadow portal. */
export function findReaElement(id, anchor) {
  const root = anchor?.getRootNode(), portal = reaPortalContainer(document.body, anchor);
  return root?.getElementById?.(id) ?? portal.getRootNode().getElementById(id) ?? document.getElementById(id);
}

/** Keep the transparent carrier out of Electron's drag-region subtraction. */
export function createReaPortal(styles, source, zIndex = 50) {
  const body = source instanceof HTMLElement ? source : null, dataset = body?.dataset ?? source;
  const host = document.createElement('div');
  host.dataset.opencuPortal = '';
  host.style.cssText = `position:fixed;inset:0;z-index:${zIndex};pointer-events:none;-webkit-app-region:initial`;
  protectReaCarrier(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const portal = document.createElement('div');
  Object.assign(portal.dataset, dataset);
  portal.style.cssText = 'display:contents;pointer-events:auto';
  const unsubscribeTheme = subscribeReaTheme(theme => {
    if (dataset.theme !== theme) dataset.theme = theme;
    if (portal.dataset.theme !== theme) portal.dataset.theme = theme;
  });
  adoptReaStyles(shadow, styles, noDrag);
  shadow.append(portal);
  document.body.append(host);
  if (body) portals.set(body, portal);
  return { host, portal, dispose() { if (body) portals.delete(body); unsubscribeTheme(); host.remove(); } };
}

export const guestPortalStyles = `
[data-browser-sidebar-webview]>webview{display:flex;width:100%;height:100%}
`;

/** Preserve visible render failures without writing into an already disposed root. */
export function createReaRenderFallback(container, label) {
  let active = true;
  return {
    onUncaughtError(error) {
      if (!active) return;
      console.error(label, error);
      const alert = document.createElement('pre'); alert.setAttribute('role', 'alert');
      alert.style.whiteSpace = 'pre-wrap'; alert.textContent = error.stack || error.message;
      queueMicrotask(() => { if (active) container.replaceChildren(alert); });
    },
    dispose() { active = false; },
  };
}
