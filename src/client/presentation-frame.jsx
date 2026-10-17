import React from 'react';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { PresentationCompletion } from './presentation-completion.jsx';
import { Bw as PresentationFrame, Lw as NativeVideo, Vw as writeVideoFrame, zw as closeVideoStream } from './rea/local-conversation-thread-6508b6dc26ad.js';

/** Shares the original REA image/video frame between the real window and its dock. */
export function MonitorFrame({ frame, index, count, focus, report, positioned = false, displaySize, reducedMotion = false, transferring = false }) {
  const intl = Shared.lS();
  const pendingFrames = React.useRef(new Map()), videoStreams = React.useRef(new Map());
  const [ready, setReady] = React.useState(false), [entering, setEntering] = React.useState(true);
  const [failure, setFailure] = React.useState(null);
  const native = frame.kind === 'native-video';
  const content = React.useRef(null);
  React.useLayoutEffect(() => {
    const element = content.current?.closest('[data-pip-presentation-frame]');
    if (element) element.dataset.monitorReady = String(ready || !!frame.error || !!failure);
  }, [ready, frame.error, failure]);
  React.useEffect(() => {
    if (!native || !frame.imageDataURL) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(frame.imageDataURL), bitmap = await createImageBitmap(await response.blob());
      try {
        if (cancelled) return;
        const videoFrame = new VideoFrame(bitmap, { timestamp: Math.round(frame.timestamp ?? performance.now() * 1000) });
        const stream = videoStreams.current.get(frame.presentationID);
        if (stream?.closed) videoFrame.close();
        else if (stream) writeVideoFrame(stream, videoFrame);
        else { pendingFrames.current.get(frame.presentationID)?.close(); pendingFrames.current.set(frame.presentationID, videoFrame); }
        setFailure(null);
      } finally { bitmap.close(); }
    })().catch(error => { if (!cancelled) { setFailure(error.message); report({ type: 'error', message: error.message }); } });
    return () => { cancelled = true; };
  }, [native, frame.imageDataURL, frame.timestamp, frame.presentationID, report]);
  React.useEffect(() => () => {
    for (const value of pendingFrames.current.values()) value.close(); pendingFrames.current.clear();
    for (const stream of videoStreams.current.values()) closeVideoStream(stream); videoStreams.current.clear();
  }, []);
  React.useEffect(() => { if (!native) setFailure(null); }, [native, frame.imageDataURL]);
  const loaded = () => { setReady(true); setFailure(null); report({ type: 'rendered', targetId: frame.presentationID }); };
  const failed = () => { const message = `Cannot display the monitor frame for ${frame.title}`; setFailure(message); report({ type: 'error', message }); };
  const errorMessage = intl.formatMessage(frame.errorCode === 'WINDOW_REQUIRED'
    ? { id: 'opencu.monitor.windowRequired', defaultMessage: 'Select a specific application window to show its preview.' }
    : frame.errorCode === 'SCREEN_CAPTURE_PERMISSION_REQUIRED'
      ? { id: 'opencu.monitor.screenPermission', defaultMessage: 'Screen Recording permission is required to show the preview.' }
      : frame.errorCode === 'TARGET_IDENTITY_CHANGED' || frame.errorCode === 'TARGET_NOT_FOUND'
        ? { id: 'opencu.monitor.targetUnavailable', defaultMessage: 'The application window is no longer available. Select it again.' }
        : { id: 'opencu.monitor.unavailable', defaultMessage: 'Preview is temporarily unavailable. The task can continue.' });
  return <PresentationFrame index={index} presentationCount={count} presentationID={frame.presentationID}
    nativeLayout={null} shouldUseReducedMotion={reducedMotion || transferring} isEntering={entering && !transferring} isReady={ready || !!frame.error || !!failure}
    onEntranceComplete={() => setEntering(false)} onClick={() => focus(frame.presentationID)}>
    <div ref={content} style={{ position: 'relative', width: '100%', height: positioned ? '100%' : undefined }}>
    {frame.error || failure ? <p role="status" className="m-0 flex min-h-20 items-center justify-center bg-surface-elevated-secondary p-3 text-center text-xs text-token-text-secondary"
      style={{ margin: 0, minHeight: 80, maxHeight: 208, overflow: 'hidden', overflowWrap: 'anywhere', padding: 12, fontSize: 12, lineHeight: '18px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-elevated-secondary)' }}>{errorMessage}</p> : native
      ? <NativeVideo presentationID={frame.presentationID} maxDisplaySize={displaySize ? Math.max(displaySize.width, displaySize.height) : Math.max(frame.width, frame.height) * Math.min(300 / frame.width, 210 / frame.height, 1)} pendingFrames={pendingFrames} videoStreams={videoStreams}
          shouldUseReducedMotion={reducedMotion || positioned} onError={failed} onLoadedData={loaded} />
      : <img className="block h-auto max-h-full w-full object-contain select-none" onLoad={loaded} onError={failed}
          alt={frame.title} title={frame.title} draggable={false} src={frame.imageDataURL} style={{ backgroundColor: '#fff', height: '100%', maxHeight: positioned ? '100%' : 208, objectFit: 'contain' }} />}
    {frame.completion && <PresentationCompletion key={frame.completion.id} completion={frame.completion} icon={frame.iconDataURL} reduced={reducedMotion} />}
    </div>
  </PresentationFrame>;
}
