import * as HostReact from 'react-host';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReaProviders } from './rea-root.jsx';
import { adoptReaStyles, createReaPortal } from './portal-host.mjs';
import { services } from './rea-services.mjs';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { xjs as FileIcon, Vjs as UrlIcon, Tjs as initializeFileIcon, Wjs as initializeUrlIcon } from './rea/app-initial-c468e3fd7f91.js';
import { Dt as Panel, kt as initializePanel } from './rea/thread-summary-panel-components-3aba951edec7.js';
import { de as SourcesContent, $ as initializeSources } from './rea/local-conversation-sources-side-panel-tab-ced36bc5770b.js';
import styles from './rea-styles.css';

const COPY = {
  running: ['运行中', 'Running'], provisioning: ['创建中', 'Starting'], completed: ['已完成', 'Completed'], idle: ['空闲', 'Idle'],
  failed: ['失败', 'Failed'], interrupted: ['已中断', 'Interrupted'], cancelled: ['已取消', 'Cancelled'], external: ['外部任务', 'External task'],
  stopping: ['正在停止', 'Stopping'], seconds: ['{s}秒', '{s}s'], minutes: ['{m}分 {s}秒', '{m}m {s}s'],
  viewAll: ['查看全部', 'View all'], back: ['返回子智能体', 'Back to subagents'], openMain: ['在主视图打开', 'Open in main view'],
  outputs: ['输出内容', 'Outputs'], agents: ['子智能体', 'Subagents'], expandActive: ['展开所有活跃子智能体', 'Show all active subagents'],
  active: ['{count} 个活跃中', '{count} active'], completedCount: ['{count} 完成', '{count} completed'], openAgents: ['打开子智能体总页', 'Open subagents'],
  noActive: ['暂无活跃子智能体', 'No active subagents'], ordinary: ['普通子代理', 'Subagents'], noAgents: ['暂无子智能体', 'No subagents'],
  jobs: ['后台进程', 'Background processes'], sources: ['来源', 'Sources'], noSources: ['暂无来源', 'No sources'], addSources: ['添加来源', 'Add sources'],
};
/** Overview copy follows the REA locale; the ids leave room for translated catalogs. */
function useCopy() {
  const intl = Shared.lS(), zh = intl.locale.startsWith('zh');
  return (key, values) => intl.formatMessage({ id: `opencu.overview.${key}`, defaultMessage: COPY[key][zh ? 0 : 1] }, values);
}
const emptySources = { subscribe: () => () => {}, getSnapshot: () => null };
export function initializeOverview() { initializePanel(); initializeFileIcon(); initializeUrlIcon(); initializeSources(); }
export function Whale({ row, path, size = 22 }) {
  return <svg viewBox="0 0 24 18" width={size} height={size} style={{ flexShrink: 0, color: row.color }} aria-hidden="true"><path fill="currentColor" d={path}/></svg>;
}
/** Only a running row's own text ticks each second; the panel does not re-render. */
function Elapsed({ row }) {
  const t = useCopy(), timing = row.timing, ticking = row.status === 'running' && !!timing?.active;
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => { if (!ticking) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [ticking]);
  if (!timing) return COPY[row.status] ? t(row.status) : null;
  const seconds = Math.floor((timing.settledMs + (timing.active ? Math.max(0, (ticking ? now : timing.active.through) - timing.active.since) : 0)) / 1000);
  return seconds < 60 ? t('seconds', { s: seconds }) : t('minutes', { m: Math.floor(seconds / 60), s: seconds % 60 });
}
const statusOf = (t, status) => COPY[status] ? t(status) : status;
function AgentRows({ rows, overview }) {
  const t = useCopy();
  return <Panel.List items={rows} getKey={row => row.id} visibleItemLimit={rows.length || 1}>
    {row => <Panel.ItemButton onClick={() => overview.openAgent(row)} disabled={!row.available || row.mode === 'external'} title={row.error || row.label}>
      <Panel.ItemLeading variant="custom"><Whale row={row} path={overview.whalePath}/></Panel.ItemLeading>
      <Panel.ItemLabel description={[statusOf(t, row.status), row.group?.kind !== 'ordinary' && row.group?.label, row.group?.phase, row.preview !== row.label && row.preview].filter(Boolean).join(' · ')}>{row.label}</Panel.ItemLabel>
      <Panel.ItemMeta><Elapsed row={row}/></Panel.ItemMeta>
    </Panel.ItemButton>}
  </Panel.List>;
}
function SourceIcon({ row, loadImage }) {
  const [url, setUrl] = React.useState(row.thumbnail);
  React.useEffect(() => {
    if (row.kind !== 'image' || !loadImage) return;
    let current = true;
    // A failed preview falls back to the file-type icon.
    Promise.resolve(loadImage(row.attachment)).then(value => { if (current && value) setUrl(value); })
      .catch(error => { if (current) setUrl(undefined); console.debug('OpenCU source preview', error); });
    return () => { current = false; };
  }, [row.attachment, loadImage]);
  return <Panel.ItemLeading variant="custom">{row.url ? <UrlIcon href={row.url} loadRemote={false} className="size-5"/> : <FileIcon path={row.path || row.label} getImagePreviewSrc={() => url} iconClassName="icon-sm" imageClassName="size-[18px] rounded-[3px] border border-default"/>}</Panel.ItemLeading>;
}
function ResourceRows({ items, open, loadImage, limit = 3 }) {
  return <Panel.List items={items} getKey={row => row.id} visibleItemLimit={limit}>
    {row => <Panel.ItemButton onClick={() => open(row)} title={row.path || row.url || row.label}>
      <SourceIcon row={row} loadImage={loadImage}/>
      <Panel.ItemLabel>{row.label}</Panel.ItemLabel>
    </Panel.ItemButton>}
  </Panel.List>;
}
export function OverviewContent({ sessionId, overview, variant = 'summary', panels = [], close = () => {} }) {
  const t = useCopy();
  const [expanded, setExpanded] = React.useState(false), [error, setError] = React.useState(null);
  const sourceHost = services.sources ?? emptySources;
  const saved = React.useSyncExternalStore(sourceHost.subscribe, sourceHost.getSnapshot, sourceHost.getSnapshot)?.[sessionId];
  const run = action => { setError(null); Promise.resolve().then(action).catch(reason => setError(reason.message || String(reason))); };
  const navigate = kind => { overview.openPage(kind); close(); };
  const openAgent = row => { run(() => overview.openAgent(row)); close(); };
  const adapted = { ...overview, openAgent };
  const deliveries = (saved?.files ?? []).map(file => ({ id: `delivery:${file.attachmentId}:${file.name}`, label: file.name, file }));
  const outputs = [...new Map([...(overview.outputs ?? []), ...deliveries].map(item => [item.path || item.id, item])).values()];
  // The same page can be both an overview source and a saved page; list each address once.
  const unique = rows => [...new Map(rows.map(row => [row.url || row.path || row.id, row])).values()];
  const listed = unique(overview.sources ?? []);
  const sources = unique([...listed, ...(saved?.pages ?? []).map(page => ({ ...page, id: `page:${page.url}`, label: page.title }))]);
  const openResource = row => run(async () => {
    if (row.kind === 'image' || row.kind === 'file') await services.files.previewSource(row, sessionId);
    else if (row.file) await services.files.preview(row.file, sessionId);
    else await overview.openResource(row);
    close();
  });
  const section = (key, title, children, action) => <Panel.Section key={key} sectionKey={`omd-${key}`} mode="heading" title={title} after={action && <Panel.SectionActions>{action}</Panel.SectionActions>} persistExpansion={false}>{children}</Panel.Section>;
  const more = kind => <Panel.ItemActionButton label={t('viewAll')} onClick={() => navigate(kind)}><span style={{ transform: 'rotate(-90deg)' }}><Panel.ItemChevron/></span></Panel.ItemActionButton>;
  const detail = overview.detail;
  return <>{error && <div role="alert" className="px-5 py-2 text-sm text-danger">{error}</div>}
    {variant === 'detail' && detail && <div className="flex items-center gap-3 border-b border-default px-4 py-3">
      <Shared.r5 color="ghost" size="toolbar" onClick={() => navigate('agents')} aria-label={t('back')}>←</Shared.r5>
      <Whale row={detail} path={overview.whalePath}/><span className="min-w-0 flex-1 truncate">{detail.label}</span>
      <span className="text-sm text-tertiary">{[detail.model?.model, detail.model?.reasoningEffort].filter(Boolean).join(' · ')}{(detail.model?.model || detail.model?.reasoningEffort) && ' · '}<Elapsed row={detail}/></span>
      <Shared.r5 color="ghost" size="toolbar" onClick={() => overview.openMainAgent(detail)} aria-label={t('openMain')} title={t('openMain')}>↗</Shared.r5>
    </div>}
    {(variant === 'summary' || variant === 'outputs') && section('outputs', t('outputs'), <ResourceRows items={outputs} open={openResource} limit={variant === 'outputs' ? outputs.length || 1 : 3}/>, variant === 'summary' ? more('outputs') : null)}
    {variant === 'summary' && section('agents', <button type="button" onClick={() => navigate('agents')} className="cursor-interaction text-start">{t('agents')}</button>, <>
      <Panel.Item>
        <Panel.ItemTrigger style={{ flex: '0 1 auto' }} onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-label={t('expandActive')}>
          <span className="flex shrink-0 items-center gap-1">{overview.active.slice(0, 3).map(row => <Whale key={row.id} row={row} path={overview.whalePath} size={18}/>)}</span>
          <Panel.ItemLabel style={{ flex: '0 1 auto' }}>{t('active', { count: overview.active.length })}</Panel.ItemLabel><span style={{ transform: expanded ? 'rotate(180deg)' : undefined }}><Panel.ItemChevron/></span>
        </Panel.ItemTrigger>
        <Shared.r5 color="ghost" size="toolbar" style={{ marginInlineStart: 'auto' }} onClick={() => navigate('agents')} aria-label={t('openAgents')}>{t('completedCount', { count: overview.completed })}</Shared.r5>
      </Panel.Item>
      {expanded && (overview.active.length ? <AgentRows rows={overview.active} overview={adapted}/> : <p className="py-2 text-sm text-tertiary">{t('noActive')}</p>)}
    </>, more('agents'))}
    {variant === 'agents' && <>
      {panels.map(panel => section(panel.id, panel.title, <><slot name={panel.id}/><AgentRows rows={overview.rows.filter(row => row.group.id === panel.groupId && !panel.memberIds?.includes(row.id))} overview={adapted}/></>))}
      {overview.rows.some(row => row.group.kind === 'ordinary') && section('ordinary', t('ordinary'), <AgentRows rows={overview.rows.filter(row => row.group.kind === 'ordinary')} overview={adapted}/>)}
      {overview.rows.length === 0 && !panels.length && <p className="px-5 py-3 text-sm text-tertiary">{t('noAgents')}</p>}
    </>}
    {variant === 'summary' && section('jobs', t('jobs'), <Panel.List items={overview.jobs ?? []} getKey={row => row.id} visibleItemLimit={3}>
      {job => <Panel.ItemButton onClick={() => { overview.openJob(job.id); close(); }}><Panel.ItemLeading variant="custom"><span aria-hidden="true">›_</span></Panel.ItemLeading><Panel.ItemLabel description={job.progress || job.detail || statusOf(t, job.status)}>{job.label || job.id}</Panel.ItemLabel></Panel.ItemButton>}
    </Panel.List>, more('jobs'))}
    {(variant === 'summary' || variant === 'sources') && section('sources', t('sources'), <>
      <ResourceRows items={variant === 'sources' ? listed : sources} open={openResource} loadImage={overview.loadImage} limit={variant === 'sources' ? listed.length || 1 : 3}/>
      {variant === 'sources' && <SourcesContent conversationId={sessionId} hostId="local" fileSources={deliveries.map(row => ({ label: row.label, path: services.files.address(row.file), row }))}
        externalSources={saved?.pages ?? []} toolSources={[]} webMcpCalls={saved?.webMcpCalls ?? []} webSearchSource={null} onOpenFile={source => openResource(source.row)}/>}
      {variant === 'summary' && <Panel.ItemButton onClick={() => navigate('sources')} tone="muted"><Panel.ItemLabel>{t('viewAll')}</Panel.ItemLabel></Panel.ItemButton>}
      {variant === 'sources' && !sources.length && <p className="py-2 text-sm text-tertiary">{t('noSources')}</p>}
    </>, overview.addSources && <Panel.ItemActionButton onClick={() => { try { overview.addSources(); } catch (reason) { setError(reason.message); } }} label={t('addSources')}>＋</Panel.ItemActionButton>)}
  </>;
}

/** REA owns its renderer; native DSH panels stay in light-DOM slots so their
 * original styles, React context, task cards and input services remain intact. */
export function OverviewSlot(props) {
  const host = HostReact.useRef(null), mounted = HostReact.useRef(null);
  const [renderError, setRenderError] = HostReact.useState(null);
  HostReact.useLayoutEffect(() => {
    initializeOverview();
    const shadow = host.current.shadowRoot ?? host.current.attachShadow({ mode: 'open' });
    shadow.replaceChildren();
    const container = document.createElement('div'); container.dataset.reaRoot = ''; container.dataset.codexWindowType = 'electron';
    adoptReaStyles(shadow, styles); shadow.append(container);
    const { portal, dispose } = createReaPortal(styles, container, 70);
    const root = createRoot(container, { onUncaughtError: error => setRenderError(error?.message || String(error)) });
    mounted.current = { root, portal };
    return () => { mounted.current = null; root.unmount(); dispose(); };
  }, []);
  HostReact.useLayoutEffect(() => {
    if (!mounted.current) return;
    const { root, portal } = mounted.current, { sessionId } = props;
    root.render(<ReaProviders portal={portal} path={`/ca/${sessionId}`}>
      <Shared._lt scope={Shared.jX} value={{ clientThreadId: `local:${sessionId}`, routeConversationId: sessionId }}>
        <Shared._lt scope={Shared.h1} value={{ routeKind: 'local-thread', pathname: `/ca/${sessionId}`, conversationId: sessionId, hostId: 'local' }}>
          <OverviewContent key={`${sessionId}:${props.variant}`} {...props}/>
        </Shared._lt>
      </Shared._lt>
    </ReaProviders>);
  }, [props]);
  return HostReact.createElement(HostReact.Fragment, null,
    renderError && HostReact.createElement('div', { role: 'alert', style: { padding: 16 } }, `${document.documentElement.lang?.startsWith('zh') ? '会话总览加载失败：' : 'Session overview failed to load: '}${renderError}`),
    HostReact.createElement('div', { ref: host, style: { minWidth: 0, width: '100%' } },
      (props.panels ?? []).map(panel => HostReact.createElement('div', { key: panel.id, slot: panel.id }, panel.content))));
}
