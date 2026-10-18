import React from 'react';
import { services } from './rea-services.mjs';
import { lS as useIntl, SHe as IntlProvider, r5 as Button, t5 as Icon, n5 as initializeIcon, f$ as browserAsset, p$ as initializeBrowserAsset } from './rea/app-shared-2f2228189a8d.js';
import { w as computerIcon, T as initializeComputerIcon } from './rea/computer-use-app-approval-request-card-82a4252ecef7.js';
import { xt as ControlList, Ot } from './rea/settings-plugin-controls-aa3e0c89c71f.js';
import { Vr as ComputerSettings, ti as BrowserConnectionSettings, Xr as browserIcon, tr as ComputerBreadcrumb, xi } from './rea/computer-use-settings-615f56c63d73.js';
import { V2s as PermissionCard, W2s as initializePermissionCard } from './rea/app-initial-c468e3fd7f91.js';
import { ReaComputerSettingsPage } from './settings-page.jsx';
import { vn as SettingsPage, J as Section, it as Group, Ee as Row, fe as useNavigate } from './rea/browser-use-settings-61138c2e595e.js';
import { c as ExtensionStatus, f as initializeExtensionStatus } from './rea/browser-extension-connection-status-description-fb2767d472db.js';

const Capabilities = React.createContext(null);
export function initializeCapabilities() { Ot(); xi(); initializeExtensionStatus(); initializeIcon(); initializeComputerIcon(); initializeBrowserAsset(); initializePermissionCard(); }

export function CapabilityProvider({ children }) {
  const [state, setState] = React.useState(null), [error, setError] = React.useState(null), [readError, setReadError] = React.useState(null), [pending, setPending] = React.useState(null);
  const revision = React.useRef(0), mounted = React.useRef(true), busy = React.useRef(false);
  const operation = React.useRef(0), folder = React.useRef(null);
  const [extensionFolder, setExtensionFolder] = React.useState(null);
  const refresh = React.useCallback(async () => {
    const expected = ++revision.current, next = await services.capabilities.read();
    if (mounted.current && expected === revision.current) { setState(next); setReadError(null); }
    return next;
  }, []);
  React.useEffect(() => {
    let disposed = false, timer;
    mounted.current = true;
    const poll = async () => {
      const expected = revision.current;
      if (!busy.current) {
        try { const next = await services.capabilities.read(); if (!disposed && expected === revision.current) { setState(next); setReadError(null); } }
        catch (error) { if (!disposed && expected === revision.current) setReadError(error.message); }
      }
      if (!disposed) timer = setTimeout(poll, 2000);
    };
    const onFocus = () => { if (!busy.current) void refresh().catch(error => { if (!disposed) setReadError(error.message); }); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisibility);
    void poll();
    return () => {
      disposed = true; mounted.current = false; revision.current++; operation.current++; busy.current = false; folder.current = null; clearTimeout(timer);
      window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);
  const run = async (id, action) => {
    if (busy.current || !mounted.current) return;
    const expected = ++operation.current, current = () => mounted.current && expected === operation.current;
    busy.current = true; revision.current++; setPending(id); setError(null);
    if (id === 'extensionFiles') { folder.current = null; setExtensionFolder(null); }
    try {
      const result = await action();
      if (!current()) return;
      if (id === 'extensionFiles') {
        folder.current = result; setExtensionFolder(result);
        if (result.revealError) setError(result.revealError);
        // This read-only action does not change capabilities. Its receipt must
        // not wait for an unrelated capability refresh before copy is usable.
        return result;
      }
      try { await refresh(); }
      catch (error) { if (current()) setReadError(error.message); }
      return result;
    } catch (error) { if (current()) setError(error.message); }
    finally { if (current()) { busy.current = false; setPending(null); } }
  };
  return <Capabilities.Provider value={{ state, error: error || readError, pending, run, refresh, extensionFolder,
    isCurrentFolder: value => mounted.current && folder.current === value,
    retry: () => run('refresh', refresh) }}>{children}</Capabilities.Provider>;
}

export function useComputerSettingsInputs() {
  const { state } = React.useContext(Capabilities);
  return { availability: { available: state?.backends.native === true, isLoading: state == null },
    platform: state?.platform === 'darwin' ? 'macOS' : state?.platform === 'win32' ? 'windows' : 'linux',
    lockedUse: false, allowedApps: true, sounds: false };
}

export function useSettingsPluginActions() {
  const { pending, run } = React.useContext(Capabilities);
  return { pendingPluginId: pending,
    openDetails: plugin => services.openSettings(plugin.settingsPath),
    installPlugin: plugin => run(plugin.plugin.id, () => services.capabilities.installBrowser()),
    setPluginEnabled: ({ pluginId, enabled }) => run(pluginId, () => services.capabilities.configure(pluginId, enabled)),
    uninstallPlugin: () => { throw new Error('OpenCU components are managed by the host plugin manager'); },
  };
}

function Controls({ browser = false }) {
  const intl = useIntl(), navigate = useNavigate();
  const { state, error, pending, run, retry } = React.useContext(Capabilities);
  const text = (key, fallback, values) => intl.formatMessage({ id: `opencu.capabilities.${key}`, defaultMessage: fallback }, values);
  const manage = path => <Button color="secondary" size="toolbar" onClick={() => navigate(path)}>{text('manage', 'Manage')}</Button>;
  const items = [];
  if (state) {
    if (browser) {
      items.push({ kind: 'app', id: 'in-app-browser', title: text('inApp', 'Built-in browser'), showEnableToggle: false, icon: <Icon asset={browserAsset} className="icon-md text-secondary" />,
        description: state.inAppBrowser ? text('inAppReady', 'Uses the real browser tabs in this DSH window') : state.desktopAdapterError || text('desktopRequired', 'The desktop browser host is unavailable in this window') });
      items.push({ kind: 'app', id: 'browserEnabled', title: text('managedBrowser', 'Managed browser'), icon: <Icon asset={browserAsset} className="icon-md text-secondary" />,
        enabled: state.config.browserEnabled, isPending: pending != null, onToggleEnabled: enabled => run('browserEnabled', () => services.capabilities.configure('browserEnabled', enabled)),
        toggleAriaLabel: text('managedBrowserToggle', 'Enable managed browser'),
        description: state.browserResources.error || (state.browserResources.installed ? text('browserInstalled', 'Matching browser resources are installed') : text('browserMissing', 'Install the matching browser resources once; DSH manages the browser process')),
        action: manage('/settings/browser-use/managed') });
      items.push({ kind: 'app', id: 'managedHeadless', title: text('managedHeadless', 'Start a separate headless browser on the DSH server machine'),
        icon: <Icon asset={browserAsset} className="icon-md text-secondary" />,
        enabled: state.config.managedHeadless === true, isPending: pending != null,
        onToggleEnabled: enabled => run('managedHeadless', () => services.capabilities.configure('managedHeadless', enabled)),
        toggleAriaLabel: text('managedHeadlessToggle', 'Enable the separate headless browser on the DSH server machine'),
        description: text('managedHeadlessHelp', 'Off by default. Requires the browser capability and matching browser resources. When enabled, tools can use an independent browser on the machine running DSH; it does not use your current browser or provide an embedded page preview here. The setting alone does not confirm that the browser started.') });
    } else {
      const title = intl.formatMessage({ id: 'settings.computerUse.anyApp.title', defaultMessage: 'Any App' });
      items.push({ id: 'nativeEnabled', title, displayName: title,
        plugin: { plugin: { id: 'nativeEnabled', name: 'nativeEnabled', installed: true, enabled: state.config.nativeEnabled }, settingsPath: '/settings/computer-use/applications' },
        icon: <img alt="" className="h-full w-full object-contain" src={computerIcon} />, showIconBorder: false,
        description: state.warnings.find(warning => warning.backend === 'native')?.message || intl.formatMessage({ id: 'settings.computerUse.anyApp.description', defaultMessage: 'Let ChatGPT control apps on your computer' }) });
      const connected = state.connections.length > 0;
      items.push({ kind: 'app', id: 'extensionEnabled', title: text('extensions', 'Chrome / Edge connection'), icon: browserIcon('chrome'),
        description: <ConnectionStatus connected={connected} />,
        enabled: state.config.extensionEnabled, showEnableToggle: connected || !state.config.extensionEnabled, isPending: pending != null,
        onToggleEnabled: enabled => run('extensionEnabled', () => services.capabilities.configure('extensionEnabled', enabled)),
        toggleAriaLabel: text('extensionToggle', 'Enable browser connections'),
        action: connected ? manage('/settings/computer-use/connections') : <Button color="secondary" size="toolbar" onClick={() => navigate('/settings/computer-use/connections')}>{text('connect', 'Connect')}</Button> });
    }
  }
  return <ControlList items={items} selectedHostId="local" pluginsQuery={{ isLoading: !state && !error, errorMessage: error, retry, reload: retry }}
    emptyStateTitle={text('loading', 'Loading computer capabilities…')} />;
}
export function ComputerControls() { return <Controls />; }
export function BrowserControls() { return <Controls browser />; }
export function CapabilitySettings() { return <ComputerSettings />; }

export function useBrowserConnectionInputs() {
  const { state, error } = React.useContext(Capabilities), intl = useIntl();
  const connection = state?.connections[0], isLoading = !state && !error;
  return { isLoading, connected: !!connection,
    status: { isLoading, isInstalled: !!connection, installedExtensionId: connection?.instanceId ?? null },
    title: intl.formatMessage({ id: 'opencu.capabilities.extensions', defaultMessage: 'Chrome / Edge connection' }),
    service: { openExtensionSettings: ({ extensionId }) => services.browserSettings.open(extensionId, 'extensions') } };
}

export function ConnectionInstallButton() {
  const intl = useIntl(), { pending, run, error, extensionFolder, isCurrentFolder } = React.useContext(Capabilities);
  const [downloadState, setDownloadState] = React.useState(null), download = React.useRef(null);
  const [copyState, setCopyState] = React.useState(null);
  const copyStatus = copyState && copyState.folder === extensionFolder ? copyState.status : null;
  const [copyPending, setCopyPending] = React.useState(false);
  const alive = React.useRef(true), copying = React.useRef(false), sequence = React.useRef(0), write = React.useRef(0);
  React.useEffect(() => {
    alive.current = true; copying.current = false; setCopyPending(false);
    return () => { download.current?.abort(); download.current = null; alive.current = false; sequence.current++; write.current++; copying.current = false; };
  }, []);
  React.useEffect(() => { sequence.current++; setCopyState(null); }, [extensionFolder]);
  const text = (key, fallback) => intl.formatMessage({ id: `opencu.capabilities.${key}`, defaultMessage: fallback });
  const copy = async () => {
    if (!alive.current || copying.current || pending != null || !extensionFolder || !isCurrentFolder(extensionFolder)) return;
    const expected = ++sequence.current, writing = ++write.current;
    const current = () => alive.current && sequence.current === expected && isCurrentFolder(extensionFolder);
    copying.current = true; setCopyPending(true); setCopyState({ folder: extensionFolder, status: 'pending' });
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      const confirmation = clipboard.writeText(extensionFolder.path);
      if (!confirmation || typeof confirmation.then !== 'function') throw new Error('Clipboard confirmation unavailable');
      if (await confirmation !== undefined) throw new Error('Clipboard write was not confirmed');
      if (current()) setCopyState({ folder: extensionFolder, status: 'copied' });
    } catch { if (current()) setCopyState({ folder: extensionFolder, status: 'failed' }); }
    finally { if (write.current === writing) { copying.current = false; if (alive.current) setCopyPending(false); } }
  };
  const startDownload = async () => {
    if (!alive.current || download.current) return;
    const controller = new AbortController(); download.current = controller; setDownloadState({ status: 'pending' });
    try {
      await services.capabilities.downloadExtension(controller.signal);
      if (alive.current && !controller.signal.aborted && download.current === controller) setDownloadState({ status: 'started' });
    } catch (error) {
      if (alive.current && download.current === controller) setDownloadState(controller.signal.aborted ? { status: 'cancelled' } : { status: 'failed', error: error.message });
    } finally { if (download.current === controller) download.current = null; }
  };
  const cancelDownload = () => { download.current?.abort(); if (alive.current) setDownloadState({ status: 'cancelled' }); };
  return <div className="flex min-w-0 flex-col gap-2">
    <Button color="secondary" size="toolbar" disabled={pending != null} loading={pending === 'extensionFiles'}
      onClick={() => alive.current && run('extensionFiles', () => services.capabilities.showExtensionFiles())}>
      {text('showExtensionFiles', 'Show extension folder')}
    </Button>
    {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
    {extensionFolder && <div className="flex min-w-0 flex-col gap-2">
      <label className="text-sm">{text('extensionHostPath', 'Extension folder on the DSH host')}
        <textarea readOnly rows={3} value={extensionFolder.path} className="block w-full select-text break-all"
          aria-label={text('extensionHostPath', 'Extension folder on the DSH host')} onFocus={event => event.currentTarget.select()} />
      </label>
      <p className="m-0 text-sm text-secondary">{text('extensionHostHelp', 'This path is on the machine running DSH. If your browser is on another machine, first copy the extension files to a local folder on that machine. This action does not export the files.')}</p>
      {extensionFolder.revealed && <p role="status" className="m-0 text-sm">{text('extensionRevealed', 'Desktop adapter revealed the extension folder.')}</p>}
      <Button color="secondary" size="toolbar" disabled={pending != null || copyPending} loading={copyPending} onClick={copy}>
        {text('copyExtensionPath', 'Copy host path')}
      </Button>
      <p role={copyStatus === 'failed' ? 'alert' : 'status'} className="m-0 text-sm">
        {copyStatus === 'copied' ? text('extensionPathCopied', 'Path copied.') : text('extensionPathManual', 'Select the path and copy it manually if the clipboard is unavailable or denied.')}
      </p>
    </div>}
    <Button color="secondary" size="toolbar" disabled={downloadState?.status === 'pending'} loading={downloadState?.status === 'pending'} onClick={startDownload}>
      {text('downloadExtension', 'Download extension ZIP')}
    </Button>
    {downloadState?.status === 'pending' && <Button color="secondary" size="toolbar" onClick={cancelDownload}>{text('cancelExtensionDownload', 'Cancel download')}</Button>}
    <p className="m-0 text-sm text-secondary">{text('extensionDownloadHelp', 'Download to this browser’s computer. Extract the ZIP into a permanent local folder, then use Load unpacked in Chrome or Edge and select the folder containing manifest.json. Downloading across machines does not make loopback pairing reachable; existing connection restrictions still apply.')}</p>
    {downloadState && <p role={downloadState.status === 'failed' ? 'alert' : 'status'} className="m-0 text-sm">
      {downloadState.status === 'started' ? text('extensionDownloadStarted', 'Extension ZIP download started. Check your browser downloads.') : downloadState.status === 'cancelled' ? text('extensionDownloadCancelled', 'Download cancelled.') : downloadState.status === 'failed' ? downloadState.error : text('extensionDownloadPending', 'Preparing extension ZIP…')}
    </p>}
  </div>;
}

export function ConnectionStatus({ connected }) {
  const intl = useIntl(), { state } = React.useContext(Capabilities);
  const message = intl.formatMessage(connected
    ? { id: 'opencu.capabilities.connected', defaultMessage: '{count} browser connections' }
    : { id: 'opencu.capabilities.disconnected', defaultMessage: 'Not connected' }, { count: state?.connections.length ?? 0 });
  // Connection presence is known; an offline extension's installation state is not.
  return <IntlProvider locale={intl.locale} messages={{ ...intl.messages,
    'plugins.browserExtension.installed': message, 'plugins.browserExtension.notInstalled': message }}>
    <ExtensionStatus status={{ isLoading: false, isInstalled: connected }} />
  </IntlProvider>;
}

export function BrowserConnectionControls() {
  const intl = useIntl(), { state, error, pending, run, refresh } = React.useContext(Capabilities);
  const [choices, setChoices] = React.useState([]), [pairingStatus, setPairingStatus] = React.useState(null);
  const pairing = React.useRef(null), mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pairing.current?.abort(); };
  }, []);
  const text = (key, fallback) => intl.formatMessage({ id: `opencu.capabilities.${key}`, defaultMessage: fallback });
  const action = (id, label, callback) => <Button color="secondary" size="toolbar" disabled={pending != null || !state && id !== 'refresh'} loading={pending === id} onClick={() => run(id, callback)}>{label}</Button>;
  const connect = async browser => {
    const controller = new AbortController(); pairing.current = controller;
    setChoices([]); setPairingStatus(text('pairWaiting', 'Waiting for approval in your browser…'));
    try {
      const result = await services.capabilities.connectBrowser(browser, controller.signal);
      if (!mounted.current) return;
      if (result.browsers?.length && !result.connected) { setChoices(result.browsers); setPairingStatus(text('pairChoose', 'Choose the browser profile to connect')); }
      else setPairingStatus(text('pairConnected', 'Browser connected. Pairing is saved.'));
    } catch (error) {
      if (!mounted.current) return;
      if (controller.signal.aborted) { setPairingStatus(text('pairCancelled', 'Connection request cancelled.')); return; }
      if (error.code === 'BROWSER_CHOICE_REQUIRED') { setChoices(error.details?.browsers ?? []); setPairingStatus(text('pairChoose', 'Choose the browser profile to connect')); return; }
      setPairingStatus(null);
      const messages = {
        BROWSER_EXTENSION_UNAVAILABLE: text('pairUnavailable', 'Open Chrome / Edge with the OpenCU extension enabled, then try again.'),
        PAIRING_TIMEOUT: text('pairTimeout', 'Approval timed out. Click Connect browser to try again.'),
        PAIRING_DECLINED: text('pairDeclined', 'Connection was declined in the browser. You can try again.'),
        PAIRING_IN_PROGRESS: text('pairInProgress', 'A connection request is already waiting. Complete it in your browser, then retry.'),
      };
      throw new Error(messages[error.code] || error.message);
    } finally { if (pairing.current === controller) pairing.current = null; }
  };
  const steps = <Group>
    <Row variant="stacked" label={text('installStep', '1 · Install the extension (first time only)')}
      description={text('installStepHelp', 'Open chrome://extensions or edge://extensions, enable Developer mode, then choose Load unpacked and select the extension folder shown by this button. Already installed? Skip this step.')}
      control={<ConnectionInstallButton />} />
    <Row variant="stacked" label={text('pairStep', '2 · Allow once, keep paired')}
      description={<>{text('pairStepHelp', 'Click Connect browser to open the approval window now, then click Allow and remember. AI can also request it automatically. No copying or pasting is needed.')}{pairingStatus && <span className="mt-2 block" role="status">{pairingStatus}</span>}</>}
      control={state && !state.config.extensionEnabled ? action('enableExtension', text('enableExtension', 'Enable browser connections'), () => services.capabilities.configure('extensionEnabled', true))
        : <div className="flex flex-wrap items-center gap-2">{action('connectBrowser', text('pairNow', 'Connect browser'), () => connect('external'))}
          {pending === 'connectBrowser' && <Button color="secondary" size="toolbar" onClick={() => pairing.current?.abort()}>{text('pairCancel', 'Cancel')}</Button>}</div>} />
    {choices.length > 0 && <Row variant="stacked" label={text('pairChoose', 'Choose the browser profile to connect')}
      control={<div className="flex flex-wrap items-center gap-2">{choices.map(browser => <React.Fragment key={browser.id}>{action('connectBrowser', `${browser.name} · ${browser.id.slice(-8)}`, () => connect(browser.id))}</React.Fragment>)}</div>} />}
  </Group>;
  const connected = state?.connections.length > 0;
  return <>
    {error && <Group><Row label={<span role="alert">{error}</span>} control={action('refresh', text('retry', 'Retry'), refresh)} /></Group>}
    {connected ? <Section><Section.Content><Group>
      {state.connections.map(connection => <Row key={connection.instanceId} variant="stacked" label={connection.label}
        description={text('connectionReady', 'Ready. Return to your conversation and ask AI to use a webpage in this browser.')}
        control={<div className="flex flex-wrap items-center gap-2">{action(connection.instanceId, text('manageConnection', 'Connection settings'), () => services.capabilities.manageConnection(connection.instanceId))}{action(`disconnect:${connection.instanceId}`, text('disconnect', 'Disconnect'), () => services.capabilities.disconnectBrowser(connection.instanceId))}{action(`forget:${connection.instanceId}`, text('forgetPairing', 'Revoke pairing'), () => services.capabilities.forgetBrowser(connection.instanceId))}</div>} />)}
    </Group></Section.Content></Section> : <Section><Section.Content>{steps}</Section.Content></Section>}
    {state?.pairings?.filter(pair => !state.connections.some(connection => connection.instanceId === pair.instanceId)).map(pair => <Group key={pair.instanceId}><Row label={pair.label}
      description={text('pairedOffline', 'Paired · reconnects automatically when this browser is available')}
      control={action(`forget:${pair.instanceId}`, text('forgetPairing', 'Revoke pairing'), () => services.capabilities.forgetBrowser(pair.instanceId))} /></Group>)}
    <details><summary className="cursor-pointer text-sm text-secondary">{text(connected ? 'connectAnother' : 'connectionHelp', connected ? 'Connect another browser' : 'More help')}</summary>
      {connected && steps}
      <Group>
        <Row label={text('openExtensionHelp', 'Cannot find the extension?')} description={text('openExtensionHelpText', 'On the browser extensions page, choose OpenCU → Details → Extension options. The blue enable switch only enables the extension; it does not connect to DSH.')} />
        <Row label={text('reconnectHelp', 'After restarting your browser')} description={text('reconnectHelpText', 'Pairing survives normal browser, DSH and computer restarts and updates. Reconnect creates a new control session; old input is never replayed. Revoking pairing or clearing extension data requires a new approval.')} />
        <Row label={text('builtInHelp', 'Only using the DSH built-in browser?')} description={text('builtInHelpText', 'No connector extension is needed. This setup is only for your own Chrome / Edge.')} />
      </Group>
    </details>
  </>;
}

export function CapabilityDetails({ section }) {
  return section === 'connections' ? <BrowserConnectionSettings /> : section === 'applications' ? <ApplicationSettings /> : <CapabilityDetailRows section={section} />;
}

function ApplicationSettings() {
  const intl = useIntl(), { state, error, pending, run, refresh } = React.useContext(Capabilities);
  const [requested, setRequested] = React.useState([]);
  const text = (key, fallback, values) => intl.formatMessage({ id: `opencu.capabilities.${key}`, defaultMessage: fallback }, values);
  const permissions = state?.native?.permissions;
  const title = intl.formatMessage({ id: 'settings.computerUse.anyApp.title', defaultMessage: 'Any App' });
  const action = (id, label, callback, color = 'secondary') => <Button color={color} size="medium" disabled={pending != null} loading={pending === id} onClick={() => run(id, callback)}>{label}</Button>;
  const permissionCard = (permission, label, description, granted) => {
    const waiting = requested.includes(permission) && granted !== true;
    const status = granted === true ? text('granted', 'Granted by macOS') : waiting ? text('waiting', 'Waiting for system authorization') : granted === false ? text('needsAccess', 'Not authorized') : text('unknownPermission', 'Unable to read permission status');
    return <div key={permission} className="flex flex-col gap-2">
      <PermissionCard title={label} subtitle={status} icon={<img alt="" className="size-6" draggable={false} src={computerIcon} />}
        actions={granted === true ? action(`settings:${permission}`, text('viewPermission', 'View in settings'), () => services.capabilities.openPermissionSettings(permission))
          : action(permission, waiting ? text('openSystemSettings', 'Open System Settings') : text('allowAccess', 'Allow access'), async () => {
            if (waiting) return services.capabilities.openPermissionSettings(permission);
            const result = await services.capabilities.requestPermission(permission);
            setRequested(current => current.includes(permission) ? current : [...current, permission]);
            return result;
          }, 'primary')} />
      <p className="m-0 px-1 text-sm leading-5 text-secondary">{description}</p>
      {waiting && <p role="status" className="m-0 px-1 text-sm leading-5 text-secondary">{text('permissionWaiting', 'Turn on OpenCU Helper in the system dialog or privacy pane. Opening settings does not grant access; this page checks again when you return.')}</p>}
    </div>;
  };
  const warning = state?.warnings.find(warning => warning.backend === 'native')?.message;
  return <ReaComputerSettingsPage title={title} backSlot={<ComputerBreadcrumb current={title} />}
    subtitle={text('applicationPermissions', 'Allow OpenCU to see and operate applications on this computer. macOS permissions are separate from the app access you approve in a conversation.')}
    action={action('refresh', text('checkPermissions', 'Check permissions'), refresh)}>
    {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
    {!state && !error && <Group><Row label={text('loading', 'Loading computer capabilities…')} /></Group>}
    {state && !state.config.nativeEnabled && <Group><Row label={text('nativeDisabled', 'Application control is turned off')}
      description={text('enableBeforePermissions', 'Enable Any App to start its helper and check system permissions. This does not grant macOS access.')}
      control={action('nativeEnabled', text('enableNative', 'Enable Any App'), () => services.capabilities.configure('nativeEnabled', true))} /></Group>}
    {state?.config.nativeEnabled && !permissions && <Group><Row label={text('nativeUnavailable', 'Native application control is unavailable')} description={warning || text('permissionUnavailable', 'Could not read the helper permissions. Check the plugin status and retry.')} control={action('refresh', text('retry', 'Retry'), refresh)} /></Group>}
    {permissions && state.platform === 'darwin' && <>
      <Section><Section.Header title={text('requiredPermissions', 'Required permissions')} /><Section.Content>
        <div className="flex flex-col gap-5">
          {permissionCard('screenCapture', text('screenCapture', 'Screen recording'), text('screenPurpose', 'Lets OpenCU see the target application and show its live preview. In System Settings → Privacy & Security → Screen & System Audio Recording (Screen Recording on older macOS), turn on OpenCU Helper.'), permissions.screenCapture)}
          {permissionCard('accessibility', text('accessibilityControl', 'Accessibility · keyboard and mouse'), text('accessibilityPurpose', 'Lets OpenCU read interface elements, click, and type. In System Settings → Privacy & Security → Accessibility, turn on OpenCU Helper. Keyboard and mouse input use this same permission, not a separate switch.'), typeof permissions.accessibility === 'boolean' && typeof permissions.postEvents === 'boolean' ? permissions.accessibility && permissions.postEvents : undefined)}
        </div>
      </Section.Content></Section>
      <Section><Section.Header title={text('optionalPermissions', 'Optional permission')} /><Section.Content>
        {permissionCard('listenEvents', text('inputMonitoring', 'Input Monitoring'), text('inputPurpose', 'Lets OpenCU notice when you use the keyboard or mouse in a target app. It does not record what you type, send notifications, stop the task, or take control. Basic computer actions still work without it. Enable OpenCU Helper under Privacy & Security → Input Monitoring if you want this information.'), permissions.listenEvents)}
      </Section.Content></Section>
      <Section><Section.Header title={text('permissionHelp', 'Cannot find the app?')} /><Section.Content><Group>
        <Row label={text('permissionApp', 'Authorize OpenCU Helper')} description={text('helperInstructions', 'OpenCU Helper owns its macOS permissions independently of DSH. Authorize the helper shown below, not DSH or the target app. If it is missing, click + and select it from Finder. Only macOS can grant access.')} />
        <Row label="OpenCU Helper" description={permissions.helperBundlePath && <span className="break-all select-text">{permissions.helperBundlePath}</span>}
          control={action('revealHelper', text('showHelper', 'Show in Finder'), () => services.capabilities.revealPermissionHelper())} />
        <Row label={text('afterPermission', 'After authorizing')} description={text('afterPermissionHelp', 'Return here to check the real status. If macOS asks to reopen the helper, follow its prompt. Updates signed by the same identity keep this authorization. When migrating from an older ad-hoc build, macOS may require one new approval: if an enabled entry still does not work, remove only the old OpenCU Helper entry and add the exact helper shown above. OpenCU does not reset permissions or restart DSH.')} />
      </Group></Section.Content></Section>
    </>}
    {permissions?.sessionType === 'wayland' && <Group><Row label={text('wayland', 'Wayland desktop sharing')}
      description={permissions.screenCapture ? text('waylandGranted', 'The selected monitor is shared for this session; keyboard and pointer access follow the system grant.') : text('waylandRequired', 'Choose a monitor and approve keyboard and pointer access in the system dialog. No permanent permission is requested.')}
      control={action('wayland', text('authorizeDesktop', 'Choose shared desktop'), () => services.capabilities.openPermissionSettings('remoteDesktop'))} /></Group>}
    {permissions && state.platform !== 'darwin' && permissions.sessionType !== 'wayland' && <Group><Row label={text('nativeControl', 'Operate applications on this computer')}
      description={warning || text('nativeSystemAccess', 'Application access follows the current desktop session and operating system policy. macOS permission switches do not apply on this platform.')} /></Group>}
  </ReaComputerSettingsPage>;
}

function CapabilityDetailRows({ section }) {
  const intl = useIntl(), navigate = useNavigate();
  const { state, error, pending, run, refresh } = React.useContext(Capabilities);
  const text = (key, fallback, values) => intl.formatMessage({ id: `opencu.capabilities.${key}`, defaultMessage: fallback }, values);
  const back = section === 'managed' ? '/settings/browser-use' : '/settings/computer-use';
  const title = text('managedBrowser', 'Managed browser');
  const action = (id, label, callback) => <Button color="secondary" size="toolbar" disabled={pending != null} loading={pending === id} onClick={() => run(id, callback)}>{label}</Button>;
  return <SettingsPage title={title} backSlot={<Button color="ghost" size="toolbar" onClick={() => navigate(back)}>{intl.formatMessage({ id: 'settings.browserUse.browserSettings.navigation.back', defaultMessage: 'Back' })}</Button>}>
    {error && <Group><Row label={<span role="alert">{error}</span>} control={action('refresh', text('retry', 'Retry'), refresh)} /></Group>}
    {!state && !error && <Group><Row label={text('loading', 'Loading computer capabilities…')} /></Group>}
    {state && section === 'managed' && <Section><Section.Content><Group>
      <Row label={text('browserResources', 'Chromium resources')} description={state.browserResources.error || (state.browserResources.installed ? text('browserInstalled', 'Matching browser resources are installed') : text('browserMissing', 'Install the matching browser resources once; DSH manages the browser process'))}
        control={!state.browserResources.installed && action('browserResources', text('installBrowser', 'Install browser resources'), () => services.capabilities.installBrowser())} />
    </Group></Section.Content></Section>}
  </SettingsPage>;
}
