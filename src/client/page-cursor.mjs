import { c as createCursor, $ as initializeAsset, Ne as initializeCursor, Pe as assetUrl } from './rea/cursor-chat-2be21330f98f.js';
import styles from './cursor-styles.css';

initializeAsset(); initializeCursor();
let host, renderer, sequence = 0, pending, hiding, lastCursor;
function settleHide(result) {
  if (!hiding) return;
  const current = hiding; hiding = undefined; clearTimeout(current.timer); current.resolve(result);
}
function finishHide() {
  if (!hiding) return;
  renderer?.destroy(); host?.remove(); renderer = host = lastCursor = undefined;
  settleHide({ visible: false });
}
function hide() {
  settle(Object.assign(new Error('Cursor movement was cancelled'), { code: 'CONTROL_STOPPED' }));
  if (hiding) return hiding.promise;
  if (!renderer) return { visible: false };
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  hiding = { promise, resolve, timer: setTimeout(finishHide, 1500) };
  renderer.setState({ cursor: { ...lastCursor, visible: false }, isVisible: false,
    turnKey: 'opencu', viewportSize: { width: innerWidth, height: innerHeight } });
  return promise;
}
function settle(error, result) {
  if (!pending) return;
  const current = pending; pending = undefined; clearTimeout(current.timer);
  error ? current.reject(error) : current.resolve(result ?? { visible: true, arrived: true, moveSequence: current.sequence });
}
function dispose() {
  settle(Object.assign(new Error('Cursor movement was cancelled'), { code: 'CONTROL_STOPPED' }));
  renderer?.destroy(); host?.remove(); renderer = host = lastCursor = undefined;
  settleHide({ visible: false });
}
function update(cursor) {
  if (cursor.visible === false) return hide();
  settleHide({ visible: true, superseded: true });
  if (!host?.isConnected) {
    dispose();
    host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true'); host.dataset.opencuCursor = '';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:strict';
    const shadow = host.attachShadow({ mode: 'closed' }), style = document.createElement('style'), mount = document.createElement('div');
    style.textContent = styles; mount.dataset.reaRoot = ''; mount.dataset.theme = 'light';
    mount.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    shadow.append(style, mount); document.documentElement.append(host);
    renderer = createCursor(mount, { assetUrl, glowColor: cursor.glowColor ?? 'var(--app-color-accent-blue)',
      onArrived: value => { if (pending?.sequence === value) settle(); }, onHidden: finishHide });
  }
  settle(Object.assign(new Error('Cursor movement was superseded'), { code: 'CONTROL_STOPPED' }));
  const current = ++sequence;
  const arrival = cursor.waitForArrival && !document.hidden ? new Promise((resolve, reject) => {
    const timer = setTimeout(() => settle(Object.assign(new Error('The original cursor did not acknowledge arrival'), { code: 'CURSOR_TIMEOUT' })), 2000);
    pending = { sequence: current, timer, resolve, reject };
  }) : null;
  lastCursor = { ...cursor, moveSequence: current, animateMovement: !document.hidden && cursor.animateMovement !== false };
  renderer.setState({ cursor: lastCursor, isVisible: true,
    turnKey: 'opencu', viewportSize: { width: innerWidth, height: innerHeight } });
  return arrival ?? { visible: true, visualDeferred: document.hidden, x: cursor.x, y: cursor.y };
}
function settled(point) {
  // A sampled drag skips positional springs. Resume the original REA idle
  // motion once its last button is released, without replaying any input.
  if (!renderer || !lastCursor || hiding || pending || lastCursor.animateMovement !== false
    || point.x !== lastCursor.x || point.y !== lastCursor.y) return { visible: !!renderer };
  return update({ ...lastCursor, animateMovement: true, waitForArrival: false });
}
if (!globalThis.__opencuCursor) {
  globalThis.__opencuCursor = { update, settled, dispose };
  addEventListener('pagehide', dispose);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(undefined, { visible: true, visualDeferred: true }); });
  const unsubscribe = globalThis.opencuCursorHost?.subscribe(cursor => {
    Promise.resolve(update(cursor)).then(result => {
      if (cursor.visible === false && result.visible === false) globalThis.opencuCursorHost.hidden(cursor.revision);
    }).catch(error => console.error('OpenCU cursor', error));
  });
  if (unsubscribe) addEventListener('pagehide', unsubscribe, { once: true });
}
