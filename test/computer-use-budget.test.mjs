import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerRuntime, computerUseTimeout } from '../src/computer-use/runtime.mjs';
import { registerComputerTools } from '../src/computer-use/tools.mjs';

function runtimeFixture(t, action, options) {
  const runtime = new ComputerRuntime(async (method, args, signal) => {
    if (method === 'getTab') return { id: 'fixture', kind: 'tab', browserId: 'fixture-browser' };
    if (method === 'target' && args[1] === 'getAXState') return { state: 'Fixture page' };
    return action?.(method, args, signal);
  }, options);
  t.after(() => runtime.reset());
  return runtime;
}

test('public budget schema and runtime validation use the same integer range and default', async t => {
  const tools = new Map(), calls = [];
  const docs = new Set();
  registerComputerTools({ tools: { register: tool => tools.set(tool.name, tool) } }, {
    config: () => ({}), documentationState: () => docs,
    computerUse: { execute: async (...args) => { calls.push(args); return { blocks: [] }; } },
  });
  const tool = tools.get('computer_use');
  assert.deepEqual(tool.parameters.properties.timeoutMs, {
    type: 'integer', default: 30000,
    description: tool.parameters.properties.timeoutMs.description,
  });
  assert.match(tool.parameters.properties.timeoutMs.description, /between 1 and 300000/);
  assert.equal(tool.parameters.required.includes('timeoutMs'), false);
  const exec = { agent: { session: { id: 'budget-fixture' } } };
  await tool.execute({ code: 'nodeRepl.write(1)' }, exec);
  assert.equal(calls.at(-1)[2].timeoutMs, 30000);
  assert.equal(calls.at(-1)[2].documentationState, docs);
  await tool.execute({ code: '', timeoutMs: 300000 }, exec);
  assert.equal(calls.at(-1)[2].timeoutMs, 300000);
  const runtime = runtimeFixture(t);
  for (const timeoutMs of [0, -1, 300001, 1.5, NaN, Infinity, '30000', null]) {
    assert.throws(() => computerUseTimeout(timeoutMs), /integer between 1 and 300000/);
    await assert.rejects(runtime.execute('', { timeoutMs }), /integer between 1 and 300000/);
    await assert.rejects(tool.execute({ code: '', timeoutMs }, exec), /integer between 1 and 300000/);
  }
  assert.equal(runtime.worker, undefined, 'invalid budgets must not start a runtime');
  assert.equal(computerUseTimeout(1), 1);
  assert.equal((await runtime.execute('nodeRepl.write(42)', { timeoutMs: 300000 })).error, undefined);
});

test('a deliberate long wait uses its requested budget instead of the shorter runtime default', async t => {
  const runtime = runtimeFixture(t, undefined, { timeoutMs: 40 });
  const result = await runtime.execute("await new Promise(r => setTimeout(r, 160)); nodeRepl.write('finished');", { timeoutMs: 1000 });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.blocks, [{ type: 'text', text: 'finished' }]);
});

test('timeout with no computer operation preserves output and interrupts CPU-bound JavaScript', async t => {
  let cleaned = false;
  const runtime = runtimeFixture(t, undefined, { onStop: async () => { await delay(25); cleaned = true; } });
  const result = await runtime.execute("nodeRepl.write('before CPU loop'); while (true) {}", { timeoutMs: 90 });
  assert.equal(cleaned, true);
  assert.match(result.error.message, /^Computer Use exceeded 90 ms; the runtime was reset\./);
  assert.deepEqual(result.progress, { lastReturned: null, lastFailed: null, inFlight: [] });
  assert.match(result.error.message, /none \(JavaScript was still running\)/);
  assert.deepEqual(result.blocks, [{ type: 'text', text: 'before CPU loop' }]);
  assert.equal(runtime.worker, null);
  assert.equal((await runtime.execute('nodeRepl.write(42)')).blocks[0].text, '42');
});

test('completed operations followed by a JavaScript wait report the last returned operation', async t => {
  const runtime = runtimeFixture(t, async () => null);
  await runtime.execute("const tab = await cua.getTab('fixture', {browser:'fixture-browser'});");
  const result = await runtime.execute("await tab.click(1); nodeRepl.write('click returned'); await new Promise(() => {});", { timeoutMs: 90 });
  assert.deepEqual(result.progress.lastReturned, { sequence: 1, method: 'target.click' });
  assert.deepEqual(result.progress.inFlight, []);
  assert.equal(result.blocks[0].text, 'click returned');
  assert.match(result.error.message, /returned operation does not verify/);
});

test('caught action errors stay failed in timeout progress and do not leak arguments', async t => {
  let changed = false;
  const runtime = runtimeFixture(t, async (_method, args) => {
    if (args[1] === 'setValue') { changed = true; throw new Error('backend failed after UI changed'); }
    return null;
  });
  await runtime.execute("const tab = await cua.getTab('fixture', {browser:'fixture-browser'});");
  const result = await runtime.execute("await tab.click(1); try { await tab.setValue(3, 'PRIVATE_PASSWORD_42'); } catch {} nodeRepl.write('continued'); await new Promise(() => {});", { timeoutMs: 100 });
  assert.equal(changed, true, 'a rejected action can still have a real side effect');
  assert.deepEqual(result.progress.lastReturned, { sequence: 1, method: 'target.click' });
  assert.deepEqual(result.progress.lastFailed, { sequence: 2, method: 'target.setValue' });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PASSWORD_42|backend failed after UI changed/);
  assert.equal(result.blocks[0].text, 'continued');
  const recovered = await runtime.execute("try { await cua.listApps(); } catch {} nodeRepl.write('recovered');");
  assert.equal(recovered.error, undefined, 'a valid catch must not force the entire call to fail');
});

test('concurrent unawaited operations remain in the budget and are cancelled before the result returns', async t => {
  let cancelled = false, lateSuccess = false;
  const runtime = runtimeFixture(t, async (_method, args, signal) => {
    if (args[1] === 'click') { await delay(20); return null; }
    try { await delay(2000, undefined, { signal }); lateSuccess = true; }
    finally { cancelled = signal.aborted; }
  });
  await runtime.execute("const tab = await cua.getTab('fixture', {browser:'fixture-browser'});");
  const result = await runtime.execute("tab.click(1).catch(() => {}); tab.setValue(2, 'DO_NOT_PRINT').catch(() => {}); nodeRepl.write('queued');", { timeoutMs: 120 });
  assert.equal(cancelled, true);
  assert.equal(lateSuccess, false);
  assert.deepEqual(result.progress.lastReturned, { sequence: 1, method: 'target.click' });
  assert.deepEqual(result.progress.inFlight, [{ sequence: 2, method: 'target.setValue' }]);
  assert.equal(result.progress.lastFailed, null, 'progress describes the timeout boundary before cancellation rejects');
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_PRINT/);
  assert.equal(runtime.current, null);
});

test('handling a dialog reports its own returned operation without declaring the triggering action completed', async t => {
  const runtime = runtimeFixture(t, async (_method, args) => {
    if (args[1] === 'click') throw new Error('triggering action interrupted by dialog');
    if (args[1] === 'dialog.accept') return { dialogHandled: true, triggeringActionError: { message: 'triggering action interrupted by dialog' } };
    return null;
  });
  await runtime.execute("const tab = await cua.getTab('fixture', {browser:'fixture-browser'});");
  const result = await runtime.execute("try { await tab.click(1); } catch {} await tab.dialog.accept('PRIVATE_DIALOG_INPUT'); await new Promise(() => {});", { timeoutMs: 100 });
  assert.deepEqual(result.progress.lastReturned, { sequence: 2, method: 'target.dialog.accept' });
  assert.deepEqual(result.progress.lastFailed, { sequence: 1, method: 'target.click' });
  assert.match(result.blocks[0].text, /earlier triggering action failed/);
  assert.match(result.blocks[0].text, /do not.*assume the triggering action completed/i);
  assert.doesNotMatch(result.error.message, /PRIVATE_DIALOG_INPUT/);
});

test('successful returns during abort cleanup cannot become timeout successes', async t => {
  let released, started;
  const entered = new Promise(resolve => { started = resolve; });
  const runtime = runtimeFixture(t, async () => { started(); await new Promise(resolve => { released = resolve; }); return 'late return'; }, {
    onStop: async () => { released(); await delay(30); },
  });
  const pending = runtime.execute('await cua.listApps();', { timeoutMs: 100 });
  await entered;
  const result = await pending;
  assert.equal(result.progress.lastReturned, null);
  assert.deepEqual(result.progress.inFlight, [{ sequence: 1, method: 'cua.listApps' }]);
  assert.deepEqual(result.blocks, []);
});

test('user abort keeps its own error and waits for cleanup instead of becoming a budget failure', async t => {
  let entered, cleaned = false;
  const started = new Promise(resolve => { entered = resolve; });
  const runtime = runtimeFixture(t, async (_method, _args, signal) => { entered(); await delay(2000, undefined, { signal }); }, {
    onStop: async () => { await delay(40); cleaned = true; },
  });
  const controller = new AbortController();
  const pending = runtime.execute('await cua.listApps();', { signal: controller.signal, timeoutMs: 1000 });
  await started;
  controller.abort(new Error('User stop budget fixture'));
  const result = await pending;
  assert.equal(cleaned, true);
  assert.equal(result.progress, undefined);
  assert.equal(result.error.message, 'User stop budget fixture');
  assert.equal(runtime.current, null);
});

test('timeout cleanup failure preserves the timeout prefix and progress', async t => {
  let fail = true;
  const runtime = runtimeFixture(t, undefined, {
    onStop: async () => { if (fail) throw new Error('budget cleanup failure'); },
  });
  t.after(() => { fail = false; });
  const result = await runtime.execute("nodeRepl.write('kept'); await new Promise(() => {});", { timeoutMs: 80 });
  assert.match(result.error.message, /^Computer Use exceeded 80 ms; the runtime was reset\./);
  assert.match(result.error.message, /Cleanup failed: budget cleanup failure/);
  assert.deepEqual(result.progress.inFlight, []);
  assert.equal(result.blocks[0].text, 'kept');
  fail = false;
  assert.equal((await runtime.execute('nodeRepl.write(42)')).blocks[0].text, '42');
});
