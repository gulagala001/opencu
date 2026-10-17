import React from 'react';
import { r5 as Button, _p as WindowIcon, lS as useIntl } from './rea/app-shared-2f2228189a8d.js';
import { services } from './rea-services.mjs';

/** Adds the native hosting action to the original navigation toolbar. */
export function BrowserWindowAction({ conversationId, browserTabId, children }) {
  const intl = useIntl(), service = services.browserHost;
  const placement = service.windowPlacement;
  const detached = React.useSyncExternalStore(placement?.subscribe ?? idleSubscribe, placement?.getSnapshot ?? attached, attached);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState(null);
  const label = detached ? intl.formatMessage({ id: 'opencu.browser.dock', defaultMessage: 'Return to sidebar' })
    : intl.formatMessage({ id: 'externalLink.contextMenu.openInNewWindow', defaultMessage: 'Open in new window' });
  return <>{children}{service.detachTab && <Button color="ghostActive" size="sm" uniform aria-label={label} title={error ?? label} disabled={busy}
    onClick={() => { setBusy(true); setError(null); void service.detachTab({ conversationId, browserTabId }).catch(error => {
      setError(error.message); services.notify?.('error', error.message);
    }).finally(() => setBusy(false)); }}><WindowIcon /></Button>}</>;
}
const idleSubscribe = () => () => {};
const attached = () => false;
