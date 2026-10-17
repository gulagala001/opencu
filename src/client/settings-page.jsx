import React from 'react';
import { qMs as SettingsPage, QJa as PageHeader, eYa as HeaderActions } from './rea/app-initial-c468e3fd7f91.js';

/** DSH owns the settings scroll container; retain REA's embedded page layout. */
export function ReaSettingsPage(props) {
  return <SettingsPage {...props} embedded />;
}

/** Keep the desktop settings header/spacing while DSH owns scrolling and navigation. */
export function ReaComputerSettingsPage({ title, subtitle, subtitleClassName, action, backSlot, children, ...props }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col" style={{ '--padding-panel': 'calc(var(--spacing) * 5)', '--color-background-panel': 'var(--color-surface)' }}>
    {backSlot && <div className="pb-panel">{backSlot}</div>}
    <PageHeader horizontalPaddingClassName="px-0" showDivider={false} sticky={false}
      actions={action == null ? null : <HeaderActions search={null} actions={action} />}
      title={<><h1 className="heading-xl text-default">{title}</h1>{subtitle && <div className={`text-base leading-6 text-balance text-secondary ${subtitleClassName ?? ''}`}>{subtitle}</div>}</>} />
    <SettingsPage {...props} embedded fullWidth contentClassName="pt-panel" style={{ '--settings-section-gap': 'calc(var(--spacing) * 10)' }}>{children}</SettingsPage>
  </div>;
}
