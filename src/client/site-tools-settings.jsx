import React from 'react';
import { services } from './rea-services.mjs';
import { Zt as SitePermissions, wn } from './rea/browser-use-policy-site-permissions-2bd40069d7f2.js';
import { Ee as Row, it as Group } from './rea/browser-use-settings-61138c2e595e.js';
import { siteToolsPolicyKey, defaultSiteToolsPolicy, parseSitePattern } from '../site-tools-policy.mjs';

export function useSiteToolsPreference() {
  const snapshot = React.useSyncExternalStore(services.settings.subscribeSnapshot, services.settings.getSnapshot, services.settings.getSnapshot);
  const [isLoading, setLoading] = React.useState(true), [isPending, setPending] = React.useState(false), [error, setError] = React.useState(null);
  React.useEffect(() => {
    let disposed = false;
    services.settings.readAll().then(() => { if (!disposed) setLoading(false); }, error => { if (!disposed) { setLoading(false); setError(error.message); } });
    return () => { disposed = true; };
  }, []);
  const policy = snapshot.values[siteToolsPolicyKey] ?? defaultSiteToolsPolicy;
  const update = async change => {
    setPending(true); setError(null);
    try {
      const current = (await services.settings.readAll()).values[siteToolsPolicyKey] ?? defaultSiteToolsPolicy;
      await services.settings.write(siteToolsPolicyKey, change(current));
    } catch (error) { setError(error.message); throw error; }
    finally { setPending(false); }
  };
  const mutateAsync = enabled => update(policy => ({ ...policy, enabled }));
  return { available: services.browserHost?.siteToolsAvailable === true, isLoading, error, policy, update,
    data: { webMcpEnabled: policy.enabled }, mutation: { isPending, mutateAsync, mutate: enabled => { void mutateAsync(enabled).catch(error => services.notify?.('error', error.message)); } } };
}

export function SiteToolsRules() {
  wn();
  const state = useSiteToolsPreference();
  const origins = { webMcpEnabled: state.policy.enabled, approvalMode: 'neverAsk', downloadApprovalMode: 'neverAsk', uploadApprovalMode: 'neverAsk',
    allowedOrigins: [], deniedOrigins: [], allowedDownloadOrigins: [], deniedDownloadOrigins: [], allowedUploadOrigins: [], deniedUploadOrigins: [],
    allowedFullCdpOrigins: [], deniedFullCdpOrigins: [],
    allowedWebMcpOrigins: Object.keys(state.policy.rules).filter(origin => state.policy.rules[origin]),
    deniedWebMcpOrigins: Object.keys(state.policy.rules).filter(origin => !state.policy.rules[origin]) };
  return <>
    {state.error && <Group><Row label={<span role="alert">{state.error}</span>} /></Group>}
    <SitePermissions backend="iab" resources={['webMcp']} webMcpAvailable={state.available} disabled={state.mutation.isPending}
      isLoading={state.isLoading} isError={!!state.error} isFullCdpAccessEnabled={false} showWebMcp={state.available}
      originsConfig={origins} parseOrigin={parseSitePattern} supportsRequiresApproval={false} supportsClearingDefaultsOnAdd
      onWebMcpEnabledChange={state.mutation.mutateAsync}
      onSitePermissionsChange={({ origin, nextValues, operation }) => state.update(policy => {
        const pattern = parseSitePattern(origin);
        if (!pattern) throw new Error('Invalid site origin');
        const rules = { ...policy.rules }, value = nextValues?.webMcp;
        if (operation === 'remove' || operation === 'reset' || value === 'default' || value == null) delete rules[pattern];
        else if (['allowed', 'denied'].includes(value)) rules[pattern] = value === 'allowed';
        else throw new Error('Unsupported site tools permission');
        return { ...policy, rules };
      })} />
  </>;
}
