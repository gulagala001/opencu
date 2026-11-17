import React from 'react';
import * as Shared from './rea/app-shared-2f2228189a8d.js';

const listeners = new Set();
let media, observer;
const reduced = () => document.documentElement.hasAttribute('data-omd-reduce-effects')
  || (media ?? window.matchMedia?.('(prefers-reduced-motion: reduce)'))?.matches === true;
const changed = () => { for (const listener of listeners) listener(); };
function subscribe(listener) {
  if (!listeners.size) {
    media = window.matchMedia?.('(prefers-reduced-motion: reduce)'); media?.addEventListener?.('change', changed);
    observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-omd-reduce-effects'] });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; media?.removeEventListener?.('change', changed); media = undefined; }
  };
}
export const useOverviewReducedMotion = () => React.useSyncExternalStore(subscribe, reduced, () => true);
export const arrivalMotion = (reduce, delay = 0) => ({
  initial: reduce ? false : { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: reduce ? { duration: 0 } : { opacity: { duration: .2, delay }, y: { type: 'spring', stiffness: 340, damping: 24, mass: .7, delay } },
});

/** Stagger just this batch. Committed identities survive reorder/status changes. */
export function useArrivalDelays(ids) {
  const seen = React.useRef(new Set());
  const arrivals = new Map(ids.filter(id => !seen.current.has(id)).map((id, index) => [id, Math.min(index * .065, .325)]));
  React.useLayoutEffect(() => { for (const id of ids) seen.current.add(id); });
  return arrivals;
}

function SectionFrame({ children, reduce }) {
  const present = Shared.u1e();
  return <Shared.hT.div data-overview-section="" aria-hidden={!present || undefined} inert={!present || undefined}
    initial={reduce ? false : { height: 0, opacity: 0, y: 8, marginBottom: -8 }}
    animate={{ height: 'auto', opacity: 1, y: 0, marginBottom: 0 }}
    exit={{ height: 0, opacity: 0, y: reduce ? 0 : 6, marginBottom: -8 }}
    transition={{ duration: reduce ? 0 : .28, ease: [.22, 1, .36, 1] }} style={{ overflow: 'hidden', minHeight: 0 }}>
    {children}
  </Shared.hT.div>;
}
export function OverviewSectionReveal({ visible, reduce, children }) {
  return <Shared.g1e initial={false}>{visible && <SectionFrame key="section" reduce={reduce}>{children}</SectionFrame>}</Shared.g1e>;
}
