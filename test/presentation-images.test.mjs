import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createBrowserHost } from '../src/dsh/browser-host.mjs';
import { createBrowserTransport } from '../src/client/browser-transport.mjs';
import { compactPresentationImages, restorePresentationImages } from '../src/presentation-images.mjs';

const frame = (id, revision = 1, extra = {}) => ({ presentationID: id, threadID: 'session', visibilityKey: 'occurrence-' + id,
  mediaGeneration: 1, imageRevision: id + '.' + revision, width: 800, height: 600, kind: 'screenshot',
  imageDataURL: 'data:image/png;base64,' + String(revision).repeat(10000), ...extra });
const waitFor = async read => { for (let i = 0; i < 200; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error('Transport fixture did not settle'); };
async function fixture(t, { desktop = async () => ({ visible: true }), alter = value => value, legacy = false } = {}) {
  const host = createBrowserHost(), updates = [], commands = [], receipts = [];
  let connection, active = ['session'];
  const priorDocument = globalThis.document, priorStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ colorScheme: 'light' });
  globalThis.document = { documentElement: { lang: 'zh' } };
  const transport = createBrowserTransport({ async request(method, args, signal) {
    if (legacy && method === 'browser/connect') args = { ...args, presentationImages: undefined };
    if (method === 'browser/result') receipts.push(args);
    const result = await host.handle(method, args, signal);
    if (method === 'browser/connect') connection = { rendererId: result.rendererId, connectionId: result.connectionId };
    if (method === 'browser/poll') for (const command of result.commands) if (command.method === 'presentation') commands.push(structuredClone(command));
    return alter(result, method);
  } }, { async presentation(operation, payload) {
    if (operation !== 'update') return {};
    updates.push(structuredClone(payload));return desktop(payload);
  } });
  transport.setSessionOwner(() => active);
  await transport.start();await waitFor(() => connection);
  t.after(async () => { await transport.dispose(); host.close(); globalThis.document = priorDocument; globalThis.getComputedStyle = priorStyle; });
  return { host, transport, updates, commands, receipts, get connection() { return connection; },
    present: frames => host.present({ frames }, transport.rendererId),
    async sessions(ids) { active = ids; await transport.updateSessions(); } };
}

test('image references preserve every field and reject occurrence or geometry mismatches', () => {
  const a = frame('a'), b = frame('b'), next = [frame('a'), frame('b', 2)];
  const packed = compactPresentationImages([a, b], next);
  assert.equal(packed[0].imageUnchanged, true);assert.ok(packed[1].imageDataURL);
  assert.deepEqual(restorePresentationImages([a, b], packed), next);
  for (const patch of [{ threadID: 'other' }, { visibilityKey: 'replaced' }, { mediaGeneration: 2 }, { width: 801 }, { height: 601 }, { kind: 'native-video' }, { imageRevision: undefined }]) {
    const changed = { ...a, ...patch };
    assert.equal(compactPresentationImages([a], [changed])[0].imageUnchanged, undefined);
    assert.throws(() => restorePresentationImages([a], [{ ...changed, imageDataURL: undefined, imageUnchanged: true }]), { code: 'PRESENTATION_IMAGE_BASELINE_MISSING' });
  }
  assert.deepEqual(restorePresentationImages([a], [{ ...a, imageDataURL: undefined, error: 'closed' }]), [{ ...a, imageDataURL: undefined, error: 'closed' }]);
});

test('the real broker and renderer reuse only acknowledged images and reset after hide/session changes', async t => {
  const f = await fixture(t), first = [frame('a'), frame('b')], next = [frame('a'), frame('b', 2, { stale: true, error: 'temporary capture failure' })];
  await f.present(first);await f.present(next);await f.present(next);
  const updates = f.commands.filter(c => c.params.operation === 'update').map(c => c.params.payload);
  assert.deepEqual(updates.map(p => p.frames.filter(v => v.imageDataURL).length), [2, 1, 0]);
  assert.deepEqual(f.updates.map(p => p.frames), [first, next, next]);
  assert.ok(JSON.stringify(updates[2]).length < JSON.stringify(updates[0]).length / 10);
  await f.host.hidePresentation(f.transport.rendererId);await f.present(next);
  assert.equal(f.commands.at(-1).params.payload.frames.filter(v => v.imageDataURL).length, 2);
  await f.sessions([]);await f.sessions(['session']);await f.present(next);
  assert.equal(f.commands.at(-1).params.payload.frames.filter(v => v.imageDataURL).length, 2);
});

test('a lost image baseline retries a display once in full, and display failures discard acknowledgements', async t => {
  let corrupt = false, fail = false;
  const f = await fixture(t, { alter(result, method) {
    if (corrupt && method === 'browser/poll' && result.commands?.some(c => c.params?.operation === 'update')) {
      corrupt = false;
      for (const command of result.commands) if (command.params?.operation === 'update') command.params.payload.frames = command.params.payload.frames.map(({ imageDataURL, ...value }) => ({ ...value, imageUnchanged: true }));
    }
    return result;
  }, desktop: async () => { if (fail) { fail = false; throw Error('Synthetic display failure'); } return { visible: true }; } });
  corrupt = true;await f.present([frame('a')]);
  assert.equal(f.commands.filter(c => c.params.operation === 'update').length, 2);
  assert.equal(f.receipts.filter(r => r.error?.code === 'PRESENTATION_IMAGE_BASELINE_MISSING').length, 1);
  fail = true;await assert.rejects(f.present([frame('a', 2)]), /Synthetic display failure/);
  await f.present([frame('a', 2)]);assert.ok(f.commands.at(-1).params.payload.frames[0].imageDataURL);
});

test('overlapping display acknowledgements cannot replace the newest image baseline', async t => {
  let hold, release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { desktop: async payload => { if (payload.frames[0].imageRevision === 'a.2') { hold = true; await gate; } return { visible: true }; } });
  await f.present([frame('a')]);
  const old = f.present([frame('a', 2)]);await waitFor(() => hold);
  await f.present([frame('a', 3)]);release();await old;
  await f.present([frame('a', 3)]);
  assert.equal(f.commands.at(-1).params.payload.frames[0].imageUnchanged, true);
  assert.equal(f.updates.at(-1).frames[0].imageRevision, 'a.3');
});

test('a new renderer also accepts an older broker that sends only full frames', async t => {
  const f = await fixture(t, { legacy: true });
  await f.present([frame('a')]);await f.present([frame('a')]);
  assert.ok(f.commands.every(c => c.params.payload.frames[0].imageDataURL));
  assert.deepEqual(f.updates.map(p => p.frames), [[frame('a')], [frame('a')]]);
});

test('unnegotiated clients keep full updates, and reconnects cannot reuse a retired baseline', async t => {
  const host = createBrowserHost(), rendererId = randomUUID();t.after(() => host.close());
  let connection = await host.handle('browser/connect', { rendererId, presentation: true, sessionIds: ['session'] });
  const send = async () => {
    const work = host.present({ frames: [frame('a')] }, rendererId);
    const [command] = (await host.handle('browser/poll', connection)).commands;
    assert.ok(command.params.payload.frames[0].imageDataURL);
    await host.handle('browser/result', { ...connection, id: command.id, result: { visible: true, presentationImageBaseline: command.params.payload.presentationImageBaseline } });
    await work;
  };
  await send();await send();
  connection = await host.handle('browser/connect', { rendererId, presentation: true, presentationImages: 1, sessionIds: ['session'] });
  await send();
  connection = await host.handle('browser/connect', { rendererId, presentation: true, presentationImages: 1, sessionIds: ['session'] });
  await send();
});
