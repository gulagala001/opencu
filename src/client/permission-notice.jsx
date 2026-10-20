import React from 'react';
import { Aml as RequestCard, Mml } from './rea/app-initial-c468e3fd7f91.js';
import { w as computerIcon, T, A as initializeAppApproval } from './rea/computer-use-app-approval-request-card-82a4252ecef7.js';
import { lS as useIntl } from './rea/app-shared-2f2228189a8d.js';
import { services } from './rea-services.mjs';

export function initializePermissionNotice() { Mml(); T(); initializeAppApproval(); }

/** System permissions remain OS-owned; repairing a failure never replays the action. */
export function PermissionNotice({ item }) {
  const intl = useIntl(), [dismissed, setDismissed] = React.useState(null), [pending, setPending] = React.useState(false), [error, setError] = React.useState(null);
  const message = item.result?.type === 'error' ? item.result.error || '' : (item.result?.content ?? []).filter(value => value.type === 'text').map(value => value.text).join('\n');
  const permission = /SCREEN_CAPTURE_PERMISSION_REQUIRED|Screen Recording permission/.test(message) ? 'screenCapture'
    : /ACCESSIBILITY_PERMISSION_REQUIRED|Accessibility permission/.test(message) ? 'accessibility'
      : /INPUT_PERMISSION_REQUIRED|event posting permission/i.test(message) ? 'postEvents'
        : /WAYLAND_PERMISSION_REQUIRED|desktop-sharing permission|Pointer access was not granted/.test(message) ? 'remoteDesktop' : null;
  if (!permission || dismissed === item.id) return null;
  const text = (key, fallback) => intl.formatMessage({ id: `opencu.permission.${key}`, defaultMessage: fallback });
  return <RequestCard headerContent={<><img alt="" className="icon-sm" src={computerIcon} /><span>OpenCU</span></>}
    title={text('required', 'System permission is required for computer access')}
    subtitle={text('description', 'Open computer permission settings for the required access, the app to authorize, and step-by-step system instructions. The failed action will not be replayed.')}
    reason={error || message} actions={{ disableHotkeys: true, isLoading: pending,
      approveLabel: text('setup', 'Set up permissions'), denyLabel: text('dismiss', 'Not now'),
      onDeny: () => setDismissed(item.id), onApprove: async () => {
        if (pending) return;
        setPending(true); setError(null);
        try { await services.openSettings('/settings/computer-use/applications'); }
        catch (error) { setError(error.message); }
        finally { setPending(false); }
      },
    }} />;
}
