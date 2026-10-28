// Executable verification scope, not a claim about arbitrary OS or website code.
export const VERSION = 1;
export const contracts = [
  {id:'controller', roots:['src/core/','src/protocol.mjs','src/runtime.mjs'],
    invariant:'Terminal outcome, exact occurrence, durable input ownership, scoped recovery, cancellation wins over late replies.',
    tests:['core.controller','control-recovery','controller-verification-cancel','recovery-isolation','interaction-recovery','refusal-recovery']},
  {id:'execution', roots:['src/dsh/computer','src/dsh/input-release','src/dsh/repl-output','src/dsh/shared','src/dsh/tools','src/dsh/runtime','src/dsh/index','src/dsh/stdio'],
    invariant:'Every cell settles; pending input settles or remains explicitly quarantined; reset/disposal never resumes input or replays it.',
    tests:['computer-pending-calls','computer-binding-timeout','computer-target-identity','computer-output-transfer','screen-handback-events','host-closed-lease']},
  {id:'approval', roots:['src/dsh/app-approval','src/extension/pairing','src/client/capability-settings','src/client/app-approval'],
    invariant:'Human approval may wait without spending execution time, but cancellation and disposal always settle it; stale approvals cannot grant authority.',
    tests:['app-approvals-lifecycle','app-approval-session-cancel','app-approval-target-binding','app-approval-feedback','pending-app-approvals','desktop-approval-availability']},
  {id:'sidebar', roots:['host/','src/dsh/browser-host','src/dsh/browser-registration','src/dsh/browser-session','src/client/browser-','src/client/guest-','src/client/rea-browser','src/client/page-'],
    invariant:'Replies match renderer, guest and generation; disconnect rejects waiters; unrelated targets keep running; no input after cancellation acknowledgement.',
    tests:['host','browser-host-generation','browser-registration-inputs','browser-registration-recovery','browser-guest-startup','browser-surface-lifecycle','browser-context-init','browser-navigation-lifecycle','browser-live-descriptors']},
  {id:'browser', roots:['src/browser/','src/dsh/browser','src/dsh/playwright','src/dsh/locator','src/dsh/navigation','src/dsh/clipboard','src/dsh/file-chooser'],
    invariant:'Input is target-scoped; user activity invalidates observations, never implies stop; navigation/dialog/clipboard/download waits settle without replay.',
    tests:['browser-api-parity','browser-waits','browser-dialogs','browser-bound-selection','browser-closed-release','browser-cleanup-retry','browser-screenshot-consistency','browser-clipboard','browser-drag-preflight','locator-append-input','navigation-waits','download-waits','human-intervention-advisory']},
  {id:'extension', roots:['src/extension/','extension/'],
    invariant:'Authenticated requests have bounded ownership; missing, duplicated and late replies cannot dispatch twice or revive expired connections.',
    tests:['extension','extension-observation-cancel','extension-download-client','extension-input','extension-browser']},
  {id:'native', roots:['src/native/','native/'],
    invariant:'The helper transport bounds waits and fences process death; only AI-owned input is released; human input and unresolved hardware remain protected.',
    tests:['native','native-input-receipts','native-helper-selection','keyboard-input-markers','screen-handback','hyprland-control']},
  {id:'presentation', roots:['src/dsh/presentation','src/dsh/activity','src/client/presentation','src/client/monitor','src/client/overlay','src/client/cursor'],
    invariant:'Preview, cursor and monitoring failure cannot hold the control/release lane; hiding a view is not a stop.',
    tests:['presentation-controls','frame-input-monitor','screen-handback','screen-handback-events','presentation']},
  {id:'resources', roots:['src/dsh/','src/client/','src/'],
    invariant:'Resource, document and attachment lifetimes settle or report a bounded failure without poisoning independent control.',
    tests:['runtime-web-reconfigure','runtime-web-managed','runtime-web-reconfigure','runtime-web-managed','client-entry-lifecycle','client-factory-load','file-inputs','screenshot-transport']},
];
export function contractFor(file) {
  const candidates=contracts.flatMap(contract=>contract.roots.filter(root=>file.startsWith(root)).map(root=>({contract,length:root.length})));
  return candidates.sort((a,b)=>b.length-a.length)[0]?.contract;
}
export const invariants = [
  'operation-terminates', 'no-uncertain-replay', 'no-late-authority', 'owned-input-only',
  'unrelated-target-progress', 'human-intervention-is-not-stop', 'explicit-stop-is-final-until-resume',
  'recovery-then-reset-progress', 'next-session-progress', 'restart-preserves-obligations',
  'approval-cancellable', 'no-leaked-process-or-waiter', 'fault-must-actually-fire',
];
