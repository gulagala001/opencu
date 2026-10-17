import React from 'react';
import { _ii as Expand, wii } from './rea/app-initial-c468e3fd7f91.js';
import { CRi as ControlGroup, kRi as Close, lS as useIntl } from './rea/app-shared-2f2228189a8d.js';
import { ReaPaneContext } from './host-boundaries.mjs';

export function initializeViewerControls() { wii(); }

/** Uses the original viewer controls with the current DSH pane's live state. */
export function ViewerControls({ pane }) {
  const intl = useIntl();
  return <ReaPaneContext.Provider value={pane}>
    <ControlGroup variant="window" label={intl.formatMessage({ id: 'imagePreview.windowControls', defaultMessage: 'Viewer controls' })}>
      <Expand appearance="viewer" />
      <Close onClick={pane.close} />
    </ControlGroup>
  </ReaPaneContext.Provider>;
}
