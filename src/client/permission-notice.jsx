import React from 'react';
import { Aml as RequestCard, Mml } from './rea/app-initial-c468e3fd7f91.js';
import { w as computerIcon, T, A as initializeAppApproval } from './rea/computer-use-app-approval-request-card-82a4252ecef7.js';
import { lS as useIntl } from './rea/app-shared-2f2228189a8d.js';
import { services } from './rea-services.mjs';
import { permissionFailure } from './permission-result.mjs';

export function initializePermissionNotice() { Mml(); T(); initializeAppApproval(); }

/** System permissions remain OS-owned; repairing a failure never replays the action. */
export function PermissionNotice({ item }) {
  const intl = useIntl(), [dismissed, setDismissed] = React.useState(null), [pending, setPending] = React.useState(false), [error, setError] = React.useState(null);
  const permission = permissionFailure(item.result);
  if (!permission || dismissed === item.id) return null;
  const text = (key, fallback) => intl.formatMessage({ id: `opencu.permission.${key}`, defaultMessage: fallback });
  const reasons = {
    screenCapture: text('screenCapture', 'The system did not allow OpenCU Helper to capture the screen for this operation.'),
    accessibility: text('accessibility', 'The system did not allow OpenCU Helper to read or operate this app.'),
    postEvents: text('postEvents', 'The system did not allow OpenCU Helper to send keyboard or mouse input.'),
    remoteDesktop: text('remoteDesktop', 'Desktop sharing or input access was not available for this operation.'),
  };
  return <RequestCard headerContent={<><img alt="" className="icon-sm" src={computerIcon} /><span>OpenCU</span></>}
    title={text('required', 'This operation needs system permission')}
    subtitle={text('description', 'Check access in settings. Granting permission will not retry this operation automatically.')}
    reason={error ? text('openFailed', 'Could not open permission settings. Open Settings → Computer and browsers → Applications.') : reasons[permission]} actions={{ disableHotkeys: true, isLoading: pending,
      approveLabel: text('setup', 'Set up permissions'), denyLabel: text('dismiss', 'Not now'),
      onDeny: () => setDismissed(item.id), onApprove: async () => {
        if (pending) return;
        setPending(true); setError(null);
        try { await services.openSettings('/settings/computer-use/applications'); }
        catch { setError(true); }
        finally { setPending(false); }
      },
    }} />;
}
