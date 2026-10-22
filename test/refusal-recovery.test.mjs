import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController} from '../src/core/controller.mjs';

// A backend that refuses before dispatching input has not touched the desktop, so the session
// must stay usable. Reading that as a fault locks control until the user stops and resumes, which
// is what a Hyprland window without an accessibility tree used to trigger on every background act.
const refusals = [['FOREGROUND_REQUIRED', false], ['TARGET_NOT_ACTIVE', false], ['FOREGROUND_REQUIRED', true],
  ['FOREGROUND_REQUIRED', undefined], ['TARGET_NOT_ACTIVE', undefined], ['ACCESSIBILITY_UNAVAILABLE', false]];

for (const action of ['click', 'right_click', 'press_key', 'type', 'set_value', 'scroll', 'drag', 'hitTest', 'move']) {
  test(`an undispatched ${action} refusal keeps the session alive`, async t => {
    for (const [code, dispatched] of refusals) {
      const dataDir = await mkdtemp(join(tmpdir(), 'opencu-refusal-'));
      t.after(() => rm(dataDir, {recursive: true, force: true}));
      const target = {id: 'fixture', kind: 'app', platform: 'linux', identity: {pid: 1, windowId: 1}};
      let releases = 0, attempts = 0;
      const backend = {
        async listTargets() { return [target]; }, async select() { return target; }, async observe() { return {}; },
        async verify() { return {valid: true, target}; }, async close() {}, async release() { releases++; return {released: true}; },
        async act(_target, request) {
          attempts++;
          throw Object.assign(Error('fixture refusal'), {code, ...(dispatched === undefined ? {} : {details: {inputDispatched: dispatched}})});
        },
      };
      const controller = await createController({dataDir, native: backend, browser: false});
      try {
        assert.equal((await controller.selectTarget(target.id)).ok, true);
        const before = releases;
        assert.equal((await controller.act({targetId: target.id, action})).error.code, code);
        const recoverable = code === 'FOREGROUND_REQUIRED' || code === 'TARGET_NOT_ACTIVE' ? dispatched === false : false;
        assert.equal((await controller.getState()).state.mode, recoverable ? 'active' : 'faulted', `${action}/${code}/${dispatched}`);
        // Nothing reached the desktop, so the fault path has no input to release.
        assert.equal(releases === before, recoverable, `${action}/${code}/${dispatched} release`);
        assert.equal(attempts, 1);
      } finally { await controller.close(); }
    }
  });
}
