import React from 'react';
import * as Shared from './rea/app-shared-2f2228189a8d.js';
import { MonitorFrame, MonitorCloseButton } from './presentation-frame.jsx';

Shared._1e(); Shared.gT();
const StackLayout = React.createContext(null);

function PositionedFrame({ frame, index, count, reduced, close, children }) {
  const { motion, layouts, ids } = React.useContext(StackLayout);
  const layout = layouts.get(frame.presentationID), active = ids.has(frame.presentationID);
  return <Shared.hT.div data-pip-position={frame.presentationID} initial={false} inert={!active}
    animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }} exit={{ scale: reduced ? 1 : .72, opacity: 0, filter: reduced ? 'blur(0px)' : 'blur(18px)' }}
    transition={reduced ? { duration: 0 } : { scale: { type: 'spring', mass: 1, stiffness: 185, damping: 18 },
      opacity: { duration: .22, ease: 'easeIn' }, filter: { duration: .24, ease: 'easeIn' } }}
    style={layout ? { position: 'absolute', left: layout.x, top: layout.y, width: layout.width, height: layout.height,
      pointerEvents: active ? undefined : 'none', display: 'grid',
      zIndex: motion.dragging && motion.leader === frame.presentationID ? count + 1 : count - index }
      : { position: 'relative', gridArea: '1 / 1', display: 'grid', alignSelf: 'start', zIndex: count - index, pointerEvents: active ? undefined : 'none' }}>
    {children}
    {active && index === 0 && close && <MonitorCloseButton frame={frame} close={close} above={!!layout} />}
  </Shared.hT.div>;
}

/** Geometry can change every paint without re-running REA's image/video content. */
const FrameContent = React.memo(function FrameContent({ frame,index,count,width,height,reduced,positioned,transferring,promotes,promote,focus,report }) {
  const displaySize = React.useMemo(() => width === undefined ? undefined : {width,height},[width,height]);
  const activate = React.useCallback(id => promotes ? promote(id) : focus(id),[promotes,promote,focus]);
  return <MonitorFrame frame={frame} index={index} count={count} displaySize={displaySize}
    reducedMotion={reduced} positioned={positioned} transferring={transferring} focus={activate} report={report} />;
});

export function useReducedMotion() {
  const [reduced, setReduced] = React.useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)'), changed = () => setReduced(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return reduced;
}

/** REA owns the frame and presence animation; the desktop host supplies per-card DIP geometry. */
export function MonitorStack({ frames, motion, focus, report, close, onEmpty, transferring = false }) {
  const reduced = useReducedMotion();
  const positioned = !!motion;
  const [order, setOrder] = React.useState([]);
  const ids = React.useMemo(() => frames.map(frame => frame.presentationID),[frames]);
  const layouts = React.useMemo(() => new Map(motion?.items.map(item => [item.id,item]) ?? []),[motion?.items]);
  const stackLayout = React.useMemo(() => ({motion,layouts,ids:new Set(ids)}),[motion,layouts,ids]);
  const ordered = [...order.filter(id => ids.includes(id)), ...ids.filter(id => !order.includes(id))];
  const promote = React.useCallback(id => {
    if (positioned) report({ type: 'promote', targetId: id });
    else setOrder(current => [id, ...current.filter(value => value !== id), ...ids.filter(value => value !== id && !current.includes(value))]);
  }, [positioned,report,ids]);
  const visible = motion ? [...frames].sort((a, b) => (layouts.get(a.presentationID)?.index ?? 0)
    - (layouts.get(b.presentationID)?.index ?? 0)) : ordered.map(id => frames.find(frame => frame.presentationID === id));
  const keyboard = event => {
    if (event.target.closest('[data-pip-close]') || !visible.length) return;
    const current = ids.indexOf(event.target.closest('[data-pip-presentation-frame]')?.dataset.pipPresentationFrame);
    let index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (Math.max(0, current) + 1) % visible.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (Math.max(0, current) + visible.length - 1) % visible.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = visible.length - 1;
    else return;
    event.preventDefault(); event.stopPropagation();
    const id = ids[index], root = event.currentTarget;
    promote(id);
    [...root.querySelectorAll('[data-pip-presentation-frame]')].find(element => element.dataset.pipPresentationFrame === id)?.focus({ preventScroll: true });
  };
  return <div data-pip-stack="" onKeyDown={keyboard} style={{ display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr', position: 'relative', width: '100%', height: '100%' }}>
    <StackLayout.Provider value={stackLayout}><Shared.g1e onExitComplete={onEmpty}>
      {visible.map((frame, index) => <PositionedFrame key={frame.presentationID} frame={frame} index={index} count={frames.length} reduced={reduced} close={transferring ? null : close}>
        <FrameContent frame={frame} index={motion ? 0 : index} count={motion ? 1 : frames.length}
          reduced={reduced} positioned={!!motion} transferring={transferring} width={layouts.get(frame.presentationID)?.width} height={layouts.get(frame.presentationID)?.height}
          promotes={index > 0} promote={promote} focus={focus} report={report} />
      </PositionedFrame>)}
    </Shared.g1e></StackLayout.Provider>
  </div>;
}
