import React from 'react';
import { Aml as RequestCard, Mml } from './rea/app-initial-c468e3fd7f91.js';
import { w as computerIcon, T, E as AppApprovalCard, A as initializeAppApproval } from './rea/computer-use-app-approval-request-card-82a4252ecef7.js';
import { lS as useIntl } from './rea/app-shared-2f2228189a8d.js';
import { services } from './rea-services.mjs';

export function initializePermissionNotice() { Mml(); T(); initializeAppApproval(); }

/** Mounted once by the resident conversation dock, independently of tool-card expansion. */
export function ApplicationPermissionNotice({ sessionId }) {
  return sessionId ? <ApplicationPermissionRequests key={sessionId} sessionId={sessionId} /> : null;
}

function ApplicationPermissionRequests({ sessionId }) {
  const [requests, setRequests] = React.useState([]), [error, setError] = React.useState(null);
  const settled = React.useRef(new Set());
  React.useEffect(() => {
    let disposed = false, timer;
    const poll = async () => {
      try {
        const next = await services.computerUseSettings.getPendingAppApprovals(sessionId);
        if (!disposed) { setRequests(next.filter(value => !settled.current.has(value.id))); setError(null); }
      }
      catch (error) { if (!disposed) setError(error.message); }
      if (!disposed) timer = setTimeout(poll, 500);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId]);
  return <div className="flex flex-col gap-3">{error && <div role="alert" className="text-sm text-danger">{error}</div>}
    {requests.map(value => <AppApprovalCard key={value.id} ApprovalCard={RequestCard} conversationId={sessionId} hostId="local"
      request={value.request} requestId={value.id} onRequestSettled={() => {
        settled.current.add(value.id);
        setRequests(current => current.filter(request => request.id !== value.id));
      }} />)}
  </div>;
}

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
