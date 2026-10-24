import React from 'react';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { PresentationCompletion } from './presentation-completion.jsx';
import { Bw as PresentationFrame, Lw as NativeVideo, Vw as writeVideoFrame, zw as closeVideoStream } from './rea/local-conversation-thread-6508b6dc26ad.js';

// This component also mounts in the standalone presentation window, where
// the main browser root has not initialized REA's button runtime.
Shared.a5();

const MAX_DECODE_RETRIES = 4;

/** The existing REA close asset and monitor control style, bound to this exact frame. */
export function MonitorCloseButton({ frame, close, above }) {
  Shared.n5(); Shared.gMi();
  const intl = Shared.lS();
  const label = intl.formatMessage({ id: 'codex.localConversation.remoteHostedPip.hidePictureInPicture', defaultMessage: 'Hide picture in picture' });
  return <button data-pip-close="" data-pip-close-target={frame.presentationID} type="button"
    aria-label={`${label}: ${frame.title}`} title={`${label}: ${frame.title}`} style={{ left: 0, top: above ? -28 : 0 }}
    onClick={event => { event.stopPropagation(); close(frame); }}><Shared.t5 asset={Shared.hMi} /></button>;
}

/** Media lifetime follows the exact occurrence, not only its reusable display ID. */
export function MonitorFrame(props) {
  const frame = props.frame;
  return <MonitorFrameContent key={JSON.stringify([frame.threadID, frame.presentationID, frame.visibilityKey, frame.mediaGeneration])} {...props} />;
}

/** Shares the original REA image/video frame between the real window and its dock. */
function MonitorFrameContent({ frame, index, count, focus, report, positioned = false, displaySize, reducedMotion = false, transferring = false }) {
  const intl = Shared.lS();
  const pendingFrames = React.useRef(new Map()), videoStreams = React.useRef(new Map());
  const lastImage = React.useRef(null), submitted = React.useRef(null);
  const [ready, setReady] = React.useState(false), [entering, setEntering] = React.useState(true);
  const [displayedImage, setDisplayedImage] = React.useState(null);
  const [reportedFailure, setFailure] = React.useState(null), [videoFallback, setVideoFallback] = React.useState(false), [retry, setRetry] = React.useState(0);
  const failure = reportedFailure?.imageDataURL === frame.imageDataURL && reportedFailure?.timestamp === frame.timestamp ? reportedFailure : null;
  const native = frame.kind === 'native-video';
  const invalidated = frame.cacheInvalidated || !!frame.error && !frame.stale || !frame.imageDataURL;
  const content = React.useRef(null), attempts = React.useRef(0);
  const signal = (type, extra = {}) => report({ type, targetId: frame.presentationID, sessionId: frame.threadID,
    visibilityKey: frame.visibilityKey, mediaGeneration: frame.mediaGeneration, ...extra });
  const fail = (code, message) => { setFailure({ code, message, at: Date.now(), imageDataURL: frame.imageDataURL, timestamp: frame.timestamp }); signal('error', { code, message }); };
  React.useLayoutEffect(() => {
    const element = content.current?.closest('[data-pip-presentation-frame]');
    if (element) element.dataset.monitorReady = String(ready || !!frame.error || !!failure);
  }, [ready, frame.error, failure]);
  React.useEffect(() => {
    if (!native || videoFallback || invalidated) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(frame.imageDataURL), bitmap = await createImageBitmap(await response.blob());
      let videoFrame;
      try {
        if (cancelled) return;
        videoFrame = new VideoFrame(bitmap, { timestamp: Math.round(frame.timestamp ?? performance.now() * 1000) });
        const stream = videoStreams.current.get(frame.presentationID);
        submitted.current = frame;
        if (stream?.closed) throw Object.assign(new Error('The monitor video stream has closed'), { code: 'PREVIEW_VIDEO_FAILED' });
        else if (stream) writeVideoFrame(stream, videoFrame);
        else { pendingFrames.current.get(frame.presentationID)?.close(); pendingFrames.current.set(frame.presentationID, videoFrame); }
        setFailure(null);
        if (ready) signal('rendered');
      } catch (error) { videoFrame?.close(); throw error; }
      finally { bitmap.close(); }
    })().catch(error => {
      if (cancelled) return;
      // Before any video has displayed there is no last-good video to retain.
      // The captured image can still use the existing image adapter.
      if (!ready || error.code === 'PREVIEW_VIDEO_FAILED') setVideoFallback(true);
      fail(error.code === 'PREVIEW_VIDEO_FAILED' ? error.code : 'PREVIEW_BITMAP_DECODE_FAILED', error.message);
    });
    return () => { cancelled = true; };
  }, [native, videoFallback, invalidated, frame.imageDataURL, frame.timestamp, frame.presentationID, report, retry]);
  React.useEffect(() => () => {
    for (const value of pendingFrames.current.values()) value.close(); pendingFrames.current.clear();
    for (const stream of videoStreams.current.values()) closeVideoStream(stream); videoStreams.current.clear();
  }, []);
  // Decode failures retry with backoff a few times, then wait for an explicit retry.
  React.useEffect(() => { if (!failure) attempts.current = 0; }, [failure]);
  React.useEffect(() => {
    if (!failure || invalidated || failure.code === 'PREVIEW_VIDEO_FAILED' || attempts.current >= MAX_DECODE_RETRIES) return;
    const timer = setTimeout(() => { attempts.current++; setRetry(value => value + 1); }, 1500 * 2 ** attempts.current);
    return () => clearTimeout(timer);
  }, [failure, invalidated, retry]);
  const retryNow = event => {
    event.stopPropagation();
    attempts.current = 0;
    if (invalidated) signal('retry'); else setRetry(value => value + 1);
  };
  // Decode candidates independently. A retry must never replace or unmount the
  // already displayed image until the new candidate has loaded successfully.
  React.useEffect(() => {
    if (native && !videoFallback || invalidated) return;
    let cancelled = false;
    const candidate = new Image();
    candidate.onload = () => {
      void (async () => {
        try {
          await candidate.decode();
          if (cancelled) return;
          setDisplayedImage(frame);
          setFailure(null);
          // An unchanged static image does not fire another visible onLoad.
          if (lastImage.current?.imageDataURL === frame.imageDataURL) {
            setReady(true); signal('rendered', { degraded: videoFallback });
          }
        } catch (error) { if (!cancelled) fail('PREVIEW_IMAGE_DECODE_FAILED', error.message); }
      })();
    };
    candidate.onerror = () => { if (!cancelled) fail('PREVIEW_IMAGE_DECODE_FAILED', 'Cannot decode the captured monitor image'); };
    candidate.src = frame.imageDataURL;
    return () => { cancelled = true; candidate.onload = candidate.onerror = null; };
  }, [native, videoFallback, invalidated, frame.imageDataURL, retry]);
  const loaded = event => {
    // Loading the fallback is not proof that the failed candidate/video recovered.
    if (event?.currentTarget?.tagName === 'IMG' && event.currentTarget.getAttribute('src') !== frame.imageDataURL) return;
    const image = native && !videoFallback ? submitted.current : displayedImage;
    if (image?.imageDataURL) lastImage.current = { ...image, lastSuccessfulAt: image.lastSuccessfulAt ?? Date.now() };
    setReady(true); setFailure(null); signal('rendered', { degraded: videoFallback });
  };
  const failedImage = () => {
    if (lastImage.current) setDisplayedImage(lastImage.current);
    fail('PREVIEW_IMAGE_DECODE_FAILED', 'Cannot decode the captured monitor image');
  };
  const failedVideo = () => {
    setVideoFallback(true);
    fail('PREVIEW_VIDEO_FAILED', 'The monitor video pipeline is unavailable');
  };
  const errorMessage = intl.formatMessage(frame.errorCode === 'WINDOW_REQUIRED'
    ? { id: 'opencu.monitor.windowRequired', defaultMessage: 'Select a specific application window to show its preview.' }
    : frame.errorCode === 'SCREEN_CAPTURE_PERMISSION_REQUIRED'
      ? { id: 'opencu.monitor.screenPermission', defaultMessage: 'Screen Recording permission is required to show the preview.' }
      : frame.errorCode === 'TARGET_IDENTITY_CHANGED' || frame.errorCode === 'TARGET_NOT_FOUND'
        ? { id: 'opencu.monitor.targetUnavailable', defaultMessage: 'The application window is no longer available. Select it again.' }
        : { id: 'opencu.monitor.unavailable', defaultMessage: 'Preview is temporarily unavailable. The task can continue.' });
  const unavailable = invalidated || failure?.code === 'PREVIEW_IMAGE_DECODE_FAILED' && !displayedImage;
  const canRetry = invalidated ? !!frame.error : !!failure && attempts.current >= MAX_DECODE_RETRIES;
  const lastSuccessfulAt = frame.stale ? frame.lastSuccessfulAt : failure && lastImage.current?.lastSuccessfulAt;
  const status = lastSuccessfulAt ? intl.formatMessage({ id: 'opencu.monitor.lastFrame',
    defaultMessage: 'Showing the last available frame ({time}). Preview updates are temporarily unavailable.' },
    { time: intl.formatTime(lastSuccessfulAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })
    : videoFallback ? intl.formatMessage({ id: 'opencu.monitor.capturedImages', defaultMessage: 'Video preview is unavailable. Showing captured images.' }) : null;
  return <PresentationFrame index={index} presentationCount={count} presentationID={frame.presentationID}
    nativeLayout={null} shouldUseReducedMotion={reducedMotion || transferring} isEntering={entering && !transferring} isReady={ready || !!frame.error || !!failure}
    onEntranceComplete={() => setEntering(false)} onClick={() => focus(frame.presentationID)}>
    <div ref={content} style={{ position: 'relative', width: '100%', height: positioned ? '100%' : undefined }}>
    {unavailable ? <div role="status" className="m-0 flex min-h-20 flex-col items-center justify-center gap-2 bg-surface-elevated-secondary p-3 text-center text-xs text-token-text-secondary"
      style={{ margin: 0, minHeight: 80, maxHeight: 208, overflow: 'hidden', overflowWrap: 'anywhere', padding: 12, fontSize: 12, lineHeight: '18px', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-surface-elevated-secondary)' }}>
      <span>{errorMessage}</span>
      {canRetry && <Shared.r5 color="secondary" size="toolbar" onClick={retryNow}>{intl.formatMessage({ id: 'opencu.monitor.retry', defaultMessage: intl.locale.startsWith('zh') ? '重试' : 'Retry' })}</Shared.r5>}
    </div> : native && !videoFallback
      ? <NativeVideo presentationID={frame.presentationID} maxDisplaySize={displaySize ? Math.max(displaySize.width, displaySize.height) : Math.max(frame.width, frame.height) * Math.min(300 / frame.width, 210 / frame.height, 1)} pendingFrames={pendingFrames} videoStreams={videoStreams}
          shouldUseReducedMotion={reducedMotion || positioned} onError={failedVideo} onLoadedData={loaded} />
      : displayedImage && <img className="block h-auto max-h-full w-full object-contain select-none" onLoad={loaded} onError={failedImage}
          alt={frame.title} title={frame.title} draggable={false} src={displayedImage.imageDataURL} style={{ backgroundColor: '#fff', height: '100%', maxHeight: positioned ? '100%' : 208, objectFit: 'contain' }} />}
    {!unavailable && status && <p role="status" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, margin: 0, padding: '4px 6px',
      background: '#111c', color: '#fff', fontSize: 11, lineHeight: '15px', pointerEvents: 'none' }}>{status}</p>}
    {frame.completion && <PresentationCompletion key={frame.completion.id} completion={frame.completion} icon={frame.iconDataURL} reduced={reducedMotion} />}
    </div>
  </PresentationFrame>;
}
