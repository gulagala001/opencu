import React from 'react';
import * as Shared from './rea/app-shared-2f2228189a8d.js';

Shared.gT(); Shared.n5(); Shared.U6n();

/** Native completion timing over the original REA frame, motion runtime and checkmark asset. */
export function PresentationCompletion({ completion, icon, reduced }) {
  const phaseAt = () => reduced ? 2 : Date.now() - completion.at < 1000 ? 0 : Date.now() - completion.at < 2500 ? 1 : 2;
  const [phase, setPhase] = React.useState(phaseAt);
  React.useEffect(() => {
    setPhase(phaseAt());
    if (reduced) return;
    const timers = [1000, 2500].map(delay => setTimeout(() => setPhase(phaseAt()), Math.max(0, completion.at + delay - Date.now())));
    return () => timers.forEach(clearTimeout);
  }, [completion.id, completion.at, reduced]);
  const spring = reduced ? { duration: 0 } : { type: 'spring', mass: 1, stiffness: 170, damping: 18 };
  const fade = reduced ? { duration: 0 } : { duration: .35, ease: 'easeOut' };
  const mini = phase === 2, check = !icon || phase > 0;
  const badgeOffset = mini && icon ? 18 : 0;
  return <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', placeItems: 'center' }}>
    <Shared.hT.div initial={{ opacity: 0 }} animate={{ opacity: .17 }} transition={fade} style={{ position: 'absolute', inset: 0, background: '#000' }} />
    <div style={{ position: 'relative', width: 50, height: 50 }}>
      {icon && <Shared.hT.img src={icon} alt="" draggable={false} initial={{ opacity: 0 }} animate={{ opacity: 1, filter: phase === 1 ? 'brightness(.35)' : 'brightness(1)' }}
        transition={fade} style={{ width: 50, height: 50, objectFit: 'contain' }} />}
      <Shared.hT.div initial={{ opacity: 0, scale: .01, x: 0, y: 0 }} animate={{ opacity: mini ? 1 : 0, scale: mini ? 1 : .01, x: badgeOffset, y: badgeOffset }}
        transition={spring} style={{ position: 'absolute', top: 16.25, left: 16.25, width: 17.5, height: 17.5, borderRadius: '50%', background: '#00e62d', boxShadow: '0 0 4px #000c' }} />
      <Shared.hT.div initial={{ opacity: 0, scale: .01 }} animate={{ opacity: check ? 1 : 0, scale: mini ? .5 : check ? 1 : .01, x: badgeOffset, y: badgeOffset, color: mini ? '#0008' : '#fff' }}
        transition={spring} style={{ position: 'absolute', top: 16, left: 16, width: 18, height: 18 }}>
        <Shared.t5 asset={Shared.H6n} style={{ width: 18, height: 18 }} />
      </Shared.hT.div>
    </div>
  </div>;
}
