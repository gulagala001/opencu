const portals = new Map();

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
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = document.createElement('style');
  sheet.textContent = `${styles}\n[data-rea-root] * { -webkit-app-region: no-drag; }`;
  const portal = document.createElement('div');
  Object.assign(portal.dataset, dataset);
  portal.style.cssText = 'display:contents;pointer-events:auto';
  shadow.append(sheet, portal);
  document.body.append(host);
  const syncTheme = () => {
    const theme = getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light';
    dataset.theme = theme; portal.dataset.theme = theme;
  };
  const theme = new MutationObserver(syncTheme), media = window.matchMedia('(prefers-color-scheme: dark)');
  theme.observe(document.documentElement, { attributes: true });
  media.addEventListener('change', syncTheme); syncTheme();
  if (body) portals.set(body, portal);
  return { host, portal, dispose() { if (body) portals.delete(body); theme.disconnect(); media.removeEventListener('change', syncTheme); host.remove(); } };
}

export const guestPortalStyles = `
[data-embedded-frame-host-root],[data-browser-host-root]{pointer-events:none;position:fixed;inset:0;overflow:visible}
[data-embedded-frame-host-root]{z-index:calc(var(--dsh-dockkit-dock-layer,10) + 1);-webkit-app-region:initial!important}
[data-browser-host-root]{contain:paint}
[data-browser-sidebar-webview]>webview{display:flex;width:100%;height:100%}
`;
