import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createGuestDriver } from '../src/client/guest-driver.mjs';

async function fixture() {
  const workers = [], urls = [], revoked = [];
  class Worker {
    constructor(url) { this.url = url; this.messages = []; this.terminations = 0; workers.push(this); }
    postMessage(message) { this.messages.push(message); if (this.postError) throw this.postError; }
    terminate() { this.terminations++; }
    reply(data = {}) { this.onmessage({ data: { id: this.messages.at(-1).id, dataUrl: 'data:image/png;base64,cGl4ZWxz', ...data } }); }
  }
  const context = vm.createContext({ Worker, Blob, URL: {
    createObjectURL(blob) { const url = 'blob:fixture-' + urls.length; urls.push({ url, blob }); return url; },
    revokeObjectURL(url) { revoked.push(url); },
  } });
  const module = new vm.SourceTextModule(await readFile(new URL('../src/client/capture-compositor.mjs', import.meta.url), 'utf8'), { context });
  await module.link(() => { throw Error('Unexpected compositor import'); }); await module.evaluate();
  return { compositor: module.namespace.createCaptureCompositor(), workers, urls, revoked };
}
const frame = { source: 'data:image/png;base64,cGl4ZWxz', width: 1280, height: 800, background: 'rgb(255, 255, 255)' };

test('a guest creates one lazy worker and matches each result to its request', async () => {
  const { compositor, workers, urls, revoked } = await fixture();
  assert.equal(workers.length, 0);
  const first = compositor.compose(frame), worker = workers[0];
  await assert.rejects(compositor.compose(frame), /already being composed/);
  worker.reply({ id: -1, dataUrl: 'data:image/png;base64,d3Jvbmc=' });
  worker.reply(); assert.equal(await first, 'data:image/png;base64,cGl4ZWxz');
  const second = compositor.compose({ ...frame, width: 640, background: 'rgb(0, 0, 0)' });
  assert.equal(workers.length, 1); assert.equal(worker.messages.at(-1).width, 640);
  worker.reply(); await second;
  compositor.cancel(); assert.equal(worker.terminations, 0, 'input release must not restart an idle compositor');
  const third = compositor.compose(frame); assert.equal(workers.length, 1); worker.reply(); await third;
  assert.equal(urls.length, 1); assert.deepEqual(revoked, [urls[0].url]);
  compositor.dispose(); assert.equal(worker.terminations, 1);
});

test('cancel terminates active work and late worker events cannot affect its replacement', async () => {
  const { compositor, workers } = await fixture();
  const first = compositor.compose(frame), original = workers[0];
  compositor.cancel(); await assert.rejects(first, { code: 'CONTROL_STOPPED' });
  assert.equal(original.terminations, 1);
  const second = compositor.compose(frame), replacement = workers[1];
  original.reply(); original.onerror({ message: 'late crash', preventDefault() {} }); original.onmessageerror();
  assert.equal(replacement.terminations, 0);
  replacement.reply(); await second; compositor.dispose();
});

test('closing a guest rejects its capture, frees its worker and permanently closes that compositor', async () => {
  const { compositor, workers } = await fixture();
  const pending = compositor.compose(frame); compositor.dispose(); compositor.dispose();
  await assert.rejects(pending, { code: 'CONTROL_STOPPED' });
  await assert.rejects(compositor.compose(frame), { code: 'CONTROL_STOPPED' });
  assert.equal(workers.length, 1); assert.equal(workers[0].terminations, 1);
});

for (const failure of ['decode', 'crash', 'message', 'post']) test(`${failure} failure rejects the current frame and permits a fresh capture`, async () => {
  const { compositor, workers } = await fixture();
  const first = compositor.compose(frame), worker = workers[0];
  if (failure === 'decode') worker.reply({ error: 'PNG decode failed' });
  else if (failure === 'crash') worker.onerror({ message: 'worker crashed', preventDefault() {} });
  else if (failure === 'message') worker.onmessageerror();
  else { worker.reply(); await first; worker.postError = Error('postMessage failed'); }
  if (failure === 'post') await assert.rejects(compositor.compose(frame), /postMessage failed/);
  else await assert.rejects(first);
  assert.equal(worker.terminations, 1);
  const next = compositor.compose(frame); workers[1].reply(); await next; compositor.dispose();
});

test('separate guests cannot consume each other\'s images or cancellation', async () => {
  const left = await fixture(), right = await fixture();
  const a = left.compositor.compose(frame), b = right.compositor.compose({ ...frame, source: 'other target' });
  left.compositor.cancel(); await assert.rejects(a, { code: 'CONTROL_STOPPED' });
  assert.equal(right.workers[0].terminations, 0);
  right.workers[0].reply({ dataUrl: 'data:image/png;base64,cmlnaHQ=' });
  assert.equal(await b, 'data:image/png;base64,cmlnaHQ='); left.compositor.dispose(); right.compositor.dispose();
});

test('input release cancels frame work before dispatching the authoritative input release', async () => {
  const events = [], capture = () => {};
  capture.cancel = () => events.push('cancel capture');
  const driver = createGuestDriver({ addEventListener() {}, getURL: () => 'about:blank', getTitle: () => '' }, {}, () => {}, () => {}, () => {}, capture,
    async operation => { events.push(operation); return { released: true }; });
  assert.deepEqual(await driver.release(), { released: true });
  assert.deepEqual(events.slice(0, 2), ['cancel capture', 'releaseInput']);
});

test('continuous preview requests worker composition while tool screenshots retain their synchronous capture policy', async () => {
  const options = [], image = { toDataURL: () => 'data:image/png;base64,cGl4ZWxz', getSize: () => ({ width: 800, height: 600 }) };
  const state = { documentId: 'doc', url: 'about:blank', viewport: { width: 800, height: 600, scrollX: 0, scrollY: 0 } };
  const driver = createGuestDriver({ addEventListener() {}, getURL: () => 'about:blank', getTitle: () => '' }, {}, () => {}, () => {}, () => {},
    async option => { options.push(option); return image; }, async operation => operation === 'pageState' ? { ...state, ...state.viewport } : state);
  await driver.preview(); await driver.observe({ format: 'screenshot' });
  assert.deepEqual(options, [{ offThread: true }, undefined]);
});
