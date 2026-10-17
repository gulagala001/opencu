import * as React from 'react-host';
import { annotationMessageContent } from './annotation-message.mjs';

const decoration = Symbol.for('opencu.slot-component-decoration.v1');
const refresh = Symbol.for('opencu.slot-refresh.v1');
const unwrap = component => {
  while (component?.[decoration]?.active === false) component = component[decoration].previous;
  return component;
};

/** Preserve native message chrome, attachments, locale and child-slot authority. */
export function installAnnotationMessages(slots) {
  const name = 'conversation.chat.node', installed = new Map();
  let stopped = false, reconciling = false;
  const publish = () => {
    const entries = slots.entries(name), original = entries.find(entry => ['user', 'steering'].includes(entry.options.key) && !entry.component?.[refresh]);
    const publisher = slots.ctx?.fiber?.uid === null ? slots.ctx.root?.get('slots') : slots;
    if (!original || !publisher || publisher.ctx?.fiber?.uid === null) return;
    const Probe = () => null; Probe[refresh] = true;
    publisher.register({ name, key: original.options.key, priority: Math.max(...entries.map(entry => entry.options.priority ?? 0)) + 1 }, Probe)();
  };
  const release = (entry, state) => {
    state.active = false;
    if (entry.component === state.wrapper) entry.component = unwrap(state.previous);
  };
  const reconcile = () => {
    if (stopped || reconciling || slots.ctx?.fiber?.uid === null) return;
    reconciling = true;
    try {
      const entries = slots.entries(name), live = new Set(entries);
      for (const [entry, state] of installed) if (!live.has(entry)) { release(entry, state); installed.delete(entry); }
      let changed = false;
      for (const entry of entries) {
        if (!['user', 'steering'].includes(entry.options.key) || entry.component?.[refresh] || installed.has(entry)) continue;
        const state = { active: true, previous: entry.component, wrapper: null };
        function AnnotationMessage(props) {
          const content = props.node?.data?.content;
          if (!state.active || !Array.isArray(content)) return React.createElement(unwrap(state.previous), props);
          const display = annotationMessageContent(content);
          const next = display === content ? props : { ...props, node: { ...props.node, data: { ...props.node.data, content: display } } };
          return React.createElement(unwrap(state.previous), next);
        }
        state.wrapper = AnnotationMessage; AnnotationMessage[decoration] = state;
        const metadata = Symbol.for('opencu.slot-decoration.v1');
        if (state.previous?.[metadata]) AnnotationMessage[metadata] = state.previous[metadata];
        entry.component = AnnotationMessage; installed.set(entry, state); changed = true;
      }
      if (changed) publish();
    } finally { reconciling = false; }
  };
  const unsubscribe = slots.subscribe(name, reconcile);
  const dispose = () => {
    stopped = true; unsubscribe();
    for (const [entry, state] of [...installed].reverse()) release(entry, state);
    if (installed.size) publish();
    installed.clear();
  };
  try { reconcile(); } catch (error) { dispose(); throw error; }
  return dispose;
}
