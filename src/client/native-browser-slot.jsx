import * as React from 'react-host';

/** The sidebar owns geometry; the native surface owns the unchanged REA page and guest. */
export function NativeBrowserSlot(props) {
  const { tab } = props.useTabInfo(), container = React.useRef(null);
  const [error, setError] = React.useState(null);
  React.useLayoutEffect(() => {
    props.mountTab({ sessionId: props.sessionId, tabId: tab.id, initialUrl: tab.navigation.params?.url, signal: tab.signal });
  }, [props.sessionId, tab.id, tab.navigation.revision, tab.signal, props.mountTab]);
  React.useLayoutEffect(() => {
    let frame, previous, latest, pending = false, disposed = false;
    const flush = async () => {
      if (pending) return;
      pending = true;
      try {
        while (latest) {
          const args = latest; latest = null;
          await props.updateBounds(args); if (!disposed) setError(null);
        }
      } catch (error) { if (!disposed) setError(error.message); }
      finally { pending = false; }
    };
    const update = () => {
      if (disposed) return;
      const rect = container.current.getBoundingClientRect();
      const selector = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';
      const overlays = [...document.querySelectorAll(selector), ...[...document.querySelectorAll('[data-opencu-portal]')].flatMap(host => [...host.shadowRoot?.querySelectorAll(selector) ?? []])];
      const occluded = overlays.some(element => element.checkVisibility() && (() => {
        const overlay = element.getBoundingClientRect();
        return overlay.width > 0 && overlay.height > 0 && overlay.right > rect.left && overlay.left < rect.right && overlay.bottom > rect.top && overlay.top < rect.bottom;
      })());
      const visible = tab.visible && !occluded && rect.width > 0 && rect.height > 0 && container.current.checkVisibility();
      const bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      const signature = JSON.stringify([visible, bounds]);
      if (signature !== previous) {
        previous = signature; latest = { sessionId: props.sessionId, tabId: tab.id, bounds, visible }; void flush();
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      latest = { sessionId: props.sessionId, tabId: tab.id, visible: false, bounds: { x: 0, y: 0, width: 1, height: 1 } };
      void flush();
    };
  }, [props.sessionId, tab.id, tab.visible, props.updateBounds]);
  return React.createElement('div', { ref: container, style: { width: '100%', height: '100%', minHeight: 0 } },
    error ? React.createElement('div', { role: 'alert' }, error) : null);
}
