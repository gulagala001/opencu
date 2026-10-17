import build from './host-target.mjs';
import { unwrapOpenCU } from './ipc-result.mjs';

/** All REA services use the same verified desktop adapter, never an alpha.2 fallback. */
export function desktopBrowserHost() {
  const desktop = globalThis.dshDesktop?.browser;
  if (!desktop) return undefined;
  if (desktop.openCU?.revision !== 2 || desktop.openCU.hostVersion !== build.version) {
    throw new Error(`OpenCU ${build.version} requires the matching desktop host adapter (revision 2)`);
  }
  for (const name of ['artifactDocuments', 'tabCloseGuards', 'browserSurfaces', 'presentationSessions', 'presentationHitRegions', 'backgroundInput', 'structuredErrors', 'initialNavigation']) {
    if (!desktop.openCU.capabilities?.includes(name)) throw new Error(`OpenCU requires the updated matching desktop adapter: ${name}`);
  }
  for (const name of ['acquireOpenCU', 'release', 'onOpenRequested', 'downloads', 'permissions', 'automation', 'extensions', 'profile', 'presentation', 'files', 'onPresentationEvent', 'onExtensionEvent', 'surface', 'onSurfaceEvent']) {
    if (typeof desktop[name] !== 'function') throw new Error(`OpenCU desktop capability is missing: ${name}`);
  }
  return { ...desktop,
    automation: (...args) => desktop.automation(...args).then(unwrapOpenCU),
    surface: (...args) => desktop.surface(...args).then(unwrapOpenCU),
  };
}
