import * as React from 'react-host';
import { observeLayoutTargets } from './layout-targets.mjs';

const overlays = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

/** The sidebar owns geometry; the native surface owns the unchanged REA page and guest. */
export function NativeBrowserSlot(props) {
  const { tab } = props.useTabInfo(), container = React.useRef(null);
  const [error, setError] = React.useState(null);
  React.useLayoutEffect(() => {
    props.mountTab({ sessionId: props.sessionId, tabId: tab.id, initialUrl: tab.navigation.params?.url, signal: tab.signal });
  }, [props.sessionId, tab.id, tab.navigation.revision, tab.signal, props.mountTab]);
  React.useLayoutEffect(() => () => {
    // Enqueue the final hide immediately in the record's ordered IPC queue.
    // A delayed reply from this mount must not hide a newer mount of the tab.
    void props.updateBounds({ sessionId: props.sessionId, tabId: tab.id, visible: false,
      bounds: { x: 0, y: 0, width: 1, height: 1 } }).catch(() => {});
  }, [props.sessionId, tab.id, props.updateBounds]);
  React.useLayoutEffect(() => {
    let frame, previous, latest, pending = false, disposed = false;
    const flush = async () => {
      if (pending) return;
      pending = true;
      while (!disposed && latest) {
        const args = latest; latest = undefined;
        try { await props.updateBounds(args); if (!disposed) setError(null); }
        catch (failure) { if (!disposed) setError(failure.message); }
      }
      pending = false;
    };
    const targets = tab.visible ? observeLayoutTargets(overlays, { shadowHosts: '[data-opencu-portal]',
      attributes: ['role', 'data-radix-popper-content-wrapper', 'data-opencu-portal'] }) : null;
    const update = () => {
      if (disposed) return;
      const rect = container.current.getBoundingClientRect();
      const visible = tab.visible && rect.width > 0 && rect.height > 0 && container.current.checkVisibility()
        && !targets.elements().some(element => {
          if (!element.checkVisibility()) return false;
          const overlay = element.getBoundingClientRect();
          return overlay.width > 0 && overlay.height > 0 && overlay.right > rect.left && overlay.left < rect.right
            && overlay.bottom > rect.top && overlay.top < rect.bottom;
        });
      if (!previous || previous.visible !== visible || previous.x !== rect.x || previous.y !== rect.y
        || previous.width !== rect.width || previous.height !== rect.height) {
        const bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        previous = { ...bounds, visible };
        latest = { sessionId: props.sessionId, tabId: tab.id, bounds, visible }; void flush();
      }
      // Only a visible tab can follow transforms/dragging that change position
      // without a resize. Hidden tabs retain the last viewport for automation.
      if (tab.visible && !document.hidden) frame = requestAnimationFrame(update);
    };
    // A parked viewport can still resize with its panel. Resize notifications
    // keep background captures at the new size without a per-frame callback.
    const resize = new ResizeObserver(() => { if (!tab.visible || document.hidden) update(); });
    const visibility = () => { cancelAnimationFrame(frame); update(); };
    resize.observe(container.current);
    if (tab.visible) document.addEventListener('visibilitychange', visibility);
    update();
    return () => {
      disposed = true; latest = undefined; cancelAnimationFrame(frame);
      resize.disconnect(); targets?.dispose(); document.removeEventListener('visibilitychange', visibility);
    };
  }, [props.sessionId, tab.id, tab.visible, props.updateBounds]);
  return React.createElement('div', { ref: container, style: { width: '100%', height: '100%', minHeight: 0 } },
    error ? React.createElement('div', { role: 'alert' }, error) : null);
}
