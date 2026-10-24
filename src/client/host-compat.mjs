import build from './host-target.mjs';
import { unwrapOpenCU } from './ipc-result.mjs';

export class DesktopBrowserCompatibilityError extends Error {
  name = 'DesktopBrowserCompatibilityError';
  code = 'DESKTOP_ADAPTER_INCOMPATIBLE';
}

/** Browser integration is optional; its validation must not hide native approvals or settings. */
export function resolveDesktopBrowserHost() {
  try { return { desktop: desktopBrowserHost(), error: null }; }
  catch (error) {
    if (!(error instanceof DesktopBrowserCompatibilityError)) throw error;
    // Never return the rejected bridge or invoke it as an older-protocol fallback.
    return { desktop: undefined, error: error.message };
  }
}

/** All REA services use the same verified desktop adapter, never an alpha.2 fallback. */
export function desktopBrowserHost() {
  const desktop = globalThis.dshDesktop?.browser;
  if (!desktop) return undefined;
  if (desktop.openCU?.revision !== 2 || desktop.openCU.hostVersion !== build.version) {
    throw new DesktopBrowserCompatibilityError(`OpenCU ${build.version} requires the matching desktop host adapter (revision 2)`);
  }
  for (const name of ['artifactDocuments', 'tabCloseGuards', 'browserSurfaces', 'presentationSessions', 'presentationHitRegions', 'backgroundInput', 'structuredErrors', 'initialNavigation', 'frameInputMonitoring']) {
    if (!desktop.openCU.capabilities?.includes(name)) throw new DesktopBrowserCompatibilityError(`OpenCU requires the updated matching desktop adapter: ${name}`);
  }
  for (const name of ['acquireOpenCU', 'release', 'onOpenRequested', 'downloads', 'permissions', 'automation', 'extensions', 'profile', 'presentation', 'files', 'onPresentationEvent', 'onExtensionEvent', 'surface', 'onSurfaceEvent']) {
    if (typeof desktop[name] !== 'function') throw new DesktopBrowserCompatibilityError(`OpenCU desktop capability is missing: ${name}`);
  }
  return { ...desktop,
    automation: (...args) => desktop.automation(...args).then(unwrapOpenCU),
    surface: (...args) => desktop.surface(...args).then(unwrapOpenCU),
  };
}
