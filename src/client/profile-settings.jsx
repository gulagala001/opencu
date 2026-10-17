import React from 'react';
import { services } from './rea-services.mjs';
import { lS as useIntl, r5 as Button } from './rea/app-shared-2f2228189a8d.js';
import { vn as SettingsPage, J as Section, it as Group, Ee as SettingsRow, T as Menu, $t as MenuButton, _t as MenuItems, fe as useNavigate } from './rea/browser-use-settings-61138c2e595e.js';

export function BrowserSettingsSubpage({ kind }) {
  if (kind === 'siteSettings') return <SiteSettings />;
  if (kind === 'extensions') return <ExtensionSettings />;
  return <ConnectedProfileSettings section={kind} />;
}

function ExtensionSettings() {
  const intl = useIntl();
  const [error, setError] = React.useState(null), [pending, setPending] = React.useState(false);
  const title = intl.formatMessage({ id: 'settings.browserUse.extensions.label', defaultMessage: 'Extension manager' });
  return <SettingsPage title={title} backSlot={<Back />}><Section><Section.Content><Group>
    {error && <SettingsRow label={<span role="alert">{error}</span>} />}
    <SettingsRow label={title} description={intl.formatMessage({ id: 'settings.browserUse.extensions.description', defaultMessage: 'Install, remove, and configure browser extensions' })}
      control={<Button color="secondary" size="toolbar" loading={pending} disabled={pending} onClick={async () => {
        setPending(true); setError(null);
        try { await services.browserHost.manageExtensions(); } catch (error) { setError(error.message); } finally { setPending(false); }
      }}>{intl.formatMessage({ id: 'settings.browserUse.browserSettings.manage', defaultMessage: 'Manage' })}</Button>} />
  </Group></Section.Content></Section></SettingsPage>;
}

function Back() {
  const intl = useIntl(), navigate = useNavigate();
  return <Button color="secondary" size="toolbar" onClick={() => navigate('/settings/browser-use')}>
    {intl.formatMessage({ id: 'settings.browserUse.browserSettings.navigation.back', defaultMessage: 'Back' })}
  </Button>;
}

export function ConnectedProfileSettings({ section }) {
  const intl = useIntl();
  const state = React.useSyncExternalStore(services.browserSettings.subscribe, services.browserSettings.getSnapshot, services.browserSettings.getSnapshot);
  const [error, setError] = React.useState(null), [pending, setPending] = React.useState(null);
  const label = intl.formatMessage({ id: section === 'passwordManager' ? 'settings.browserUse.passwordManager.label' : 'settings.browserUse.contactInfo.label',
    defaultMessage: section === 'passwordManager' ? 'Password manager' : 'Contact info' });
  return <SettingsPage title={label} backSlot={<Back />} subtitle={intl.formatMessage({ id: 'opencu.settings.externalProfile', defaultMessage: 'Choose the connected browser profile. These settings open in that browser; the built-in browser has no password or contact database. OpenCU does not read or copy this data.' })}><Section><Section.Content><Group>
    {(error || state.error) && <SettingsRow label={<span role="alert">{error || state.error}</span>} />}
    {state.loading && <SettingsRow label={intl.formatMessage({ id: 'opencu.capabilities.loading', defaultMessage: 'Loading computer capabilities…' })} />}
    {!state.loading && !state.connections.length && <SettingsRow label={label} description={intl.formatMessage({ id: 'opencu.capabilities.disconnected', defaultMessage: 'No authorized browser extension is connected' })}
      control={<Button color="secondary" size="toolbar" onClick={() => services.openSettings('/settings/computer-use')}>{intl.formatMessage({ id: 'opencu.settings.connections', defaultMessage: 'Browser connections' })}</Button>} />}
    {state.connections.map(connection => <SettingsRow key={connection.instanceId} label={connection.label}
      description={`${label} · ${connection.browserInstanceId}`} control={<Button color="secondary" size="toolbar" loading={pending === connection.instanceId}
        onClick={async () => {
          setPending(connection.instanceId); setError(null);
          try { await services.browserSettings.open(connection.instanceId, section); }
          catch (error) { setError(error.message); }
          finally { setPending(null); }
        }}>{intl.formatMessage({ id: 'settings.browserUse.browserSettings.manage', defaultMessage: 'Manage' })}</Button>} />)}
  </Group></Section.Content></Section></SettingsPage>;
}

export function SiteSettings() {
  const intl = useIntl();
  const [sites, setSites] = React.useState(null), [error, setError] = React.useState(null), [pending, setPending] = React.useState(null);
  const refresh = React.useCallback(async () => setSites(await services.browserHost.siteSettings()), []);
  React.useEffect(() => {
    let closed = false, timer;
    const poll = async () => {
      try { const value = await services.browserHost.siteSettings(); if (!closed) { setSites(value); setError(null); } }
      catch (error) { if (!closed) setError(error.message); }
      if (!closed) timer = setTimeout(poll, 2000);
    };
    void poll(); return () => { closed = true; clearTimeout(timer); };
  }, []);
  const choices = [
    { value: null, label: intl.formatMessage({ id: 'opencu.settings.ask', defaultMessage: 'Ask' }) },
    { value: true, label: intl.formatMessage({ id: 'opencu.settings.allowVisit', defaultMessage: 'Allow for this visit' }) },
    { value: false, label: intl.formatMessage({ id: 'opencu.settings.blockVisit', defaultMessage: 'Block for this visit' }) },
  ];
  const unique = sites && [...new Map(sites.map(site => [site.origin, site])).values()];
  return <SettingsPage title={intl.formatMessage({ id: 'settings.browserUse.siteSettings.label', defaultMessage: 'Site settings' })} backSlot={<Back />}
    subtitle={intl.formatMessage({ id: 'opencu.settings.visitPermissions', defaultMessage: 'Permissions apply to currently open websites in this window and reset on navigation or close. System permissions still apply.' })}>
    {error && <Group><SettingsRow label={<span role="alert">{error}</span>} /></Group>}
    {!sites && !error && <Group><SettingsRow label={intl.formatMessage({ id: 'opencu.capabilities.loading', defaultMessage: 'Loading computer capabilities…' })} /></Group>}
    {unique?.length === 0 && <Group><SettingsRow label={intl.formatMessage({ id: 'opencu.settings.noSites', defaultMessage: 'No websites are open in this window.' })} /></Group>}
    {unique?.map(site => <Section key={site.origin}><Section.Header title={site.origin} /><Section.Content><Group>
      {site.permissions.map(permission => <SettingsRow key={permission.name} label={intl.formatMessage({ id: `opencu.permission.${permission.name}`, defaultMessage: permission.name })}
        control={<Menu contentWidth="menuWide" align="end" triggerButton={<MenuButton disabled={pending === `${site.origin}:${permission.name}`}>{choices.find(choice => choice.value === permission.value).label}</MenuButton>}>
          {choices.map(choice => <MenuItems.Item key={String(choice.value)} onSelect={async () => {
            setPending(`${site.origin}:${permission.name}`); setError(null);
            try { await services.browserHost.siteSettings('setSitePermission', { origin: site.origin, permission: permission.name, value: choice.value }); await refresh(); }
            catch (error) { setError(error.message); }
            finally { setPending(null); }
          }}>{choice.label}</MenuItems.Item>)}
        </Menu>} />)}
    </Group></Section.Content></Section>)}
  </SettingsPage>;
}
