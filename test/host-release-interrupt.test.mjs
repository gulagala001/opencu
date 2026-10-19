import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { dependencyRequire } from '../scripts/dependencies.mjs';

const require = dependencyRequire(), local = createRequire(import.meta.url);
const { transform } = require('esbuild');
const compile = async file => (await transform(await readFile(new URL(file, import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs', target: 'es2022' })).code;
function load(code, resolve) {
  const module = { exports: {} };
  runInThisContext('(function(require,module,exports){' + code + '\n})')(resolve, module, module.exports);
  return module.exports;
}
const dialogs = load(await compile('../host/dialogs.ts'), require);
const keyboard = local('../extension/keyboard.js');
const automation = load(await compile('../host/automation.ts'), name => {
  if (name === './opencu-dialogs.ts') return dialogs;
  if (name === './opencu-keyboard.js') return keyboard;
  if (name === 'electron' || name.startsWith('./opencu-')) return {};
  return require(name);
});

for (const method of ['Runtime.evaluate', 'Accessibility.getFullAXTree']) test('release interrupts suspended ' + method + ' and retires queued work', { timeout: 3000 }, async () => {
  const guest = new EventEmitter(), calls = [], entered = Promise.withResolvers(), late = Promise.withResolvers();
  let attached = false, suspended = false;
  guest.isDestroyed = guest.isCrashed = () => false;
  guest.debugger = { isAttached: () => attached, attach() { attached = true; }, detach() { attached = false; },
    async sendCommand(name, args) {
      calls.push({ name, args });
      if (suspended && name === method) { suspended = false; entered.resolve(); await late.promise; }
      if (name === 'Runtime.evaluate') return { result: { value: { documentId: 'fixture', url: 'https://fixture.invalid/' } } };
      if (name === 'Accessibility.getFullAXTree') return { nodes: [{ nodeId: 'button', backendDOMNodeId: 7, name: { value: 'fixture' } }] };
      return {};
    } };
  const run = (operation, args = {}) => automation.openCUAutomation(guest, operation, args, () => false);
  await run('input', { type: 'keyDown', keyCode: 'Shift' });
  suspended = true;
  const observation = run('observe').catch(error => error);
  await entered.promise;
  const queued = run('input', { type: 'keyDown', keyCode: 'Control' }).catch(error => error);
  const release = run('releaseInput');
  assert.equal(await run('releaseInput'), await release, 'concurrent release shares the same acknowledgment');
  assert.equal((await observation).code, 'CONTROL_STOPPED');
  assert.equal((await queued).code, 'CONTROL_STOPPED');
  assert.deepEqual(calls.filter(call => call.name === 'Input.dispatchKeyEvent').map(call => [call.args.type, call.args.key]), [['rawKeyDown', 'Shift'], ['keyUp', 'Shift']]);
  const fresh = await run('observe');
  late.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await run('verifyElement', { elementId: fresh.ax.nodes[0].elementId, observationId: fresh.observationId })).valid, true, 'late read cannot overwrite fresh observation state');
});

test('release bypasses native navigation while subsequent ordinary input waits for it', { timeout: 3000 }, async () => {
  const guest = new EventEmitter(), entered = Promise.withResolvers(), restored = Promise.withResolvers(), calls = [];
  guest.isDestroyed = guest.isCrashed = () => false;
  guest.getURL = () => 'https://fixture.invalid/';
  guest.navigationHistory = { restore() { entered.resolve(); return restored.promise; }, getActiveIndex: () => 0 };
  let attached = false;
  guest.debugger = { isAttached: () => attached, attach() { attached = true; }, detach() { attached = false; },
    async sendCommand(name, args) { calls.push({ name, args }); return {}; } };
  const run = (operation, args = {}) => automation.openCUAutomation(guest, operation, args, () => true);
  const navigation = run('restoreNavigation', { entries: [{ url: guest.getURL(), title: 'Fixture' }], index: 0 }).catch(error => error);
  await entered.promise;
  assert.equal((await run('releaseInput')).released, true);
  assert.equal((await navigation).code, 'CONTROL_STOPPED');
  const input = run('input', { type: 'keyDown', keyCode: 'Shift' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.some(call => call.name === 'Input.dispatchKeyEvent'), false);
  restored.resolve();
  await input;
  assert.equal(calls.find(call => call.name === 'Input.dispatchKeyEvent').args.type, 'rawKeyDown');
  await run('releaseInput');
});
