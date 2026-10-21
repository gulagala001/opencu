export { name, inject } from './client-contract.mjs';

// Start fetching while the native conversation plugins initialize. The ES
// graph shares one REA renderer and loads Office/PDF engines only on demand.
let runtime, loading;
function loadRuntime() {
  if (runtime) return Promise.resolve(runtime);
  if (loading) return loading;
  const pending = import(__OPENCU_RUNTIME_URL__).then(value => {
    value.bindHostReact(require('react-host'));
    return runtime = value;
  });
  loading = pending;
  // apply() delivers failures; the next activation may retry a failed fetch.
  pending.catch(() => { if (loading === pending) loading = undefined; });
  return pending;
}
loadRuntime();
export function OverviewSlot(props) { return runtime.OverviewSlot(props); }
export function getOverviewSlot(ctx) { return runtime.getOverviewSlot(ctx); }
export async function apply(ctx) {
  const module = await loadRuntime();
  if (ctx.fiber.uid === null) return;
  await module.apply(ctx);
}
