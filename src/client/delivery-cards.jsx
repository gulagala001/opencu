import React from 'react';
import { services } from './rea-services.mjs';
import { lS as useIntl } from './rea/app-shared-2f2228189a8d.js';
import { nxn as ResourceCard, rxn as ResourceButton, oxn as ResourceBody, ixn as ResourceIcon, pxn } from './rea/app-initial-c468e3fd7f91.js';
import { Ze as FileActions, U } from './rea/artifact-preview-header-464ed5168662.js';
import { de as SourcesContent, $ as initializeSources } from './rea/local-conversation-sources-side-panel-tab-ced36bc5770b.js';
import { x as SourceDisclosure } from './rea/mcp-tool-call-approval-b02f87023626.js';

export function initializeDeliveryCards() { pxn(); U(); initializeSources(); }

function DeliveryCard({ file, sessionId }) {
  const intl = useIntl();
  const [error, setError] = React.useState(null), [icon, setIcon] = React.useState(null);
  const path = services.files.address(file);
  React.useEffect(() => {
    let active = true;
    const request = services.openIn.getTargets({ hostId: 'local', path });
    request.then(result => { if (active) setIcon(result.targets[0]?.icon); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; request[Symbol.dispose](); };
  }, [path]);
  const preview = () => { void services.files.preview(file, sessionId).catch(error => setError(error.message)); };
  return <ResourceCard variant="artifact-list">
    <div className="group/resource-card relative">
      <ResourceButton aria-label={intl.formatMessage({ id: 'localConversation.endResource.openPreview', defaultMessage: 'Open preview' })} onClick={preview} />
      <ResourceBody variant="artifact-list" className="pointer-events-none"
        icon={icon ? <ResourceIcon><img alt="" src={icon} className="size-5" /></ResourceIcon> : null}
        title={file.name} titleTooltip={file.name} subtitle={`${intl.formatNumber(file.bytes)} B`}
        trailing={<span className="pointer-events-auto relative"><FileActions hostId="local" path={path} title={file.name} variant="compact" showLabel
          onDownload={() => services.workspaceFiles.saveCopy({ hostId: 'local', path })} /></span>} />
    </div>
    {error && <div role="alert" className="p-3 text-sm text-danger">{error}</div>}
  </ResourceCard>;
}

export function DeliveryCards({ files, sessionId }) {
  const intl = useIntl();
  const [error, setError] = React.useState(null);
  const sources = React.useMemo(() => files.map(file => ({ label: file.name, path: services.files.address(file), file })), [files]);
  React.useEffect(() => services.sources.retainFiles(sessionId, files), [sessionId, files]);
  return <>
    {files.map(file => <DeliveryCard key={`${file.attachmentId}:${file.name}`} file={file} sessionId={sessionId} />)}
    {!!sources.length && <SourceDisclosure status="completed" icon={null} indentContent={false}
      summary={intl.formatMessage({ id: 'codex.localConversation.sources.panel.listLabel', defaultMessage: 'Sources' })}>
      <SourcesContent conversationId={sessionId} hostId="local" fileSources={sources} externalSources={[]} toolSources={[]} webMcpCalls={[]} webSearchSource={null}
        onOpenFile={source => { void services.files.preview(source.file, sessionId).catch(error => setError(error.message)); }} />
    </SourceDisclosure>}
    {error && <div role="alert" className="p-3 text-sm text-danger">{error}</div>}
  </>;
}
