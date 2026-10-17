import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { Jw } from './rea/local-conversation-thread-6508b6dc26ad.js';
import { MonitorStack, useReducedMotion } from './presentation-stack.jsx';
import { reaIntl } from './rea-locale.mjs';
import styles from './rea-styles.css';
import presentationStyles from './presentation.css';
import { connectPresentationInteraction } from './presentation-interaction.mjs';

Jw(); Shared.CHe(); Shared.n5(); Shared.gMi();
const stored = JSON.parse(localStorage.getItem('opencu:presentation-state') || '{}');
Shared.MLt(stored, (key, value) => {
  if (value === undefined) delete stored[key]; else stored[key] = value;
  localStorage.setItem('opencu:presentation-state', JSON.stringify(stored));
});
const style = document.createElement('style'); style.textContent = styles + '\n' + presentationStyles;
document.head.append(style);
const mount = document.getElementById('root');
mount.dataset.reaRoot = ''; mount.dataset.codexWindowType = 'electron'; mount.dataset.theme = 'light';
mount.style.boxSizing = 'border-box';
document.documentElement.style.cssText = 'width:100%;height:100%';
document.body.style.cssText = 'width:100%;height:100%;margin:0';
const reportError = error => window.opencuPresentationHost.postMessage({ type: 'error', message: error?.stack || String(error) });
window.addEventListener('error', event => reportError(event.error || event.message));
window.addEventListener('unhandledrejection', event => reportError(event.reason));
const root = createRoot(mount, { onUncaughtError: reportError });

const report = event => window.opencuPresentationHost.postMessage(event);
const focus = targetId => report({ type: 'focus', targetId });
connectPresentationInteraction(mount, report);
function Surface({ frames, motion, exitGeneration, reset, transferId, controlWhite = 1 }) {
  const intl = Shared.lS(), reducedMotion = useReducedMotion();
  React.useEffect(() => { report({ type: 'motion-preference', reducedMotion }); }, [reducedMotion]);
  React.useEffect(() => {
    if (!transferId) return;
    let animation;
    const ready = () => {
      const elements = [...mount.querySelectorAll('[data-pip-presentation-frame]')];
      if (frames.every(frame => elements.some(element => element.dataset.pipPresentationFrame === frame.presentationID && element.dataset.monitorReady === 'true'))) {
        animation = requestAnimationFrame(() => report({ type: 'transfer-rendered', id: transferId }));
      } else animation = requestAnimationFrame(ready);
    };
    animation = requestAnimationFrame(ready);
    return () => cancelAnimationFrame(animation);
  }, [transferId]);
  const label = intl.formatMessage({ id: 'codex.localConversation.remoteHostedPip.hidePictureInPicture', defaultMessage: 'Hide picture in picture' });
  const front = motion?.items.find(item => frames.some(frame => frame.presentationID === item.id));
  return <div data-pip-surface="" inert={!!transferId} className="pointer-events-auto relative h-full" style={{ '--pip-control-color': controlWhite ? '#fff' : '#111', '--pip-control-halo': controlWhite ? '#0009' : '#fff9' }}>
    <MonitorStack key={reset ?? 0} frames={frames} motion={motion} transferring={!!transferId} focus={focus} report={report}
      onEmpty={() => report({ type: 'exit-complete', generation: exitGeneration, revision: motion?.exitRevision })} />
    {frames.length > 0 && <button data-pip-close="" type="button" aria-label={label} title={label}
      style={front ? { left: front.x, top: front.y - 28 } : undefined} onClick={() => report({ type: 'hidden' })}>
      <Shared.t5 asset={Shared.hMi} />
    </button>}
  </div>;
}
function Presentation(props) {
  return <Shared.SHe {...reaIntl()}>
    <Shared._lt scope={Shared.X} value={{ host: 'dsh-presentation' }}>
      <Surface {...props} />
    </Shared._lt>
  </Shared.SHe>;
}
let state = { frames: [], motion: null };
window.opencuPresentationHost.subscribe(payload => {
  if (payload.locale) document.documentElement.lang = payload.locale;
  if (payload.theme === 'dark' || payload.theme === 'light') mount.dataset.theme = payload.theme;
  state = { ...state, ...payload };
  mount.toggleAttribute('data-native-motion', !!state.motion);
  root.render(<Presentation {...state} />);
});
window.addEventListener('keydown', event => { if (event.key === 'Escape') window.opencuPresentationHost.postMessage({ type: 'hidden' }); });
window.addEventListener('contextmenu', event => { event.preventDefault(); window.opencuPresentationHost.postMessage({ type: 'hidden' }); });
