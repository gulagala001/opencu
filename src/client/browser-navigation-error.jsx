import React from 'react';

// Page load failures remain separate from guest/IPC initialization failures.
export function BrowserNavigationError({ failure, locale, onRetry, onError }) {
  const [busy, setBusy] = React.useState(false);
  if (!failure) return null;
  const zh = locale?.startsWith('zh');
  return <section role="alert" style={{ position: 'absolute', left: 16, right: 16, bottom: 16,
    zIndex: 100, padding: 16, borderRadius: 8, background: 'Canvas', color: 'CanvasText',
    border: '1px solid GrayText', maxHeight: '65%', overflow: 'auto' }}>
    <strong>{zh ? '页面连接被拒绝' : 'Page connection refused'}</strong>
    <p>{zh ? '请检查目标地址和该地址上的服务是否可访问，然后手动重试。' : 'Check the destination address and whether its service is reachable, then retry.'}</p>
    <p style={{ overflowWrap: 'anywhere' }}>{failure.url}</p>
    <details><summary>{zh ? '原始错误' : 'Original error'}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{failure.message}</pre></details>
    <button type="button" disabled={busy} onClick={async () => {
      if (busy) return;
      setBusy(true);
      try { await onRetry(); } catch (error) { onError(error); } finally { setBusy(false); }
    }}>{zh ? '重试' : 'Retry'}</button>
  </section>;
}
