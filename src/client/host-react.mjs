// The REA renderer keeps its own pinned React. DSH slot components use the
// exact host React instance supplied by the ModuleLoader factory instead.
let host;
export let createElement, Fragment, useRef, useState, useEffect, useLayoutEffect,
  useMemo, useCallback, useSyncExternalStore;
export { host as default };
export function bindHostReact(value) {
  if (host && host !== value) throw new Error('OpenCU client received different host React instances');
  host = value;
  ({ createElement, Fragment, useRef, useState, useEffect, useLayoutEffect,
    useMemo, useCallback, useSyncExternalStore } = value);
}
