import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createPluginRuntime} from '../src/dsh/runtime.mjs';
import {createComputerSession} from '../src/dsh/computer.mjs';

// Real worker, adapter, composite and controller; synthetic browser boundary.
async function fixture(t) {
  const parent = resolve('.local'); await mkdir(parent, {recursive: true});
  const dataDir = await mkdtemp(join(parent, 'target-identity-'));
  const target = occurrence => ({id: 'tab:reused', backend: 'browser', kind: 'tab',
    browserId: 'browser:synthetic', title: occurrence, identity: {occurrence}});
  const targets = [target('original'), {...target('other'), id: 'tab:other'}], calls = [], actions = [];
  const backend = {
    listTargets: async () => targets,
    listBrowsers: async () => [{id: 'browser:synthetic'}],
    select: async value => value,
    verify: async value => ({valid: true, target: targets.find(item => item.id === value.id)}),
    observe: async value => { calls.push(['observe', value.id, value.identity.occurrence]);
      return {observationId: `ax:${value.identity.occurrence}`, ax: {nodes: []}}; },
    act: async (value, args) => {
      calls.push([args.action, value.id, value.identity.occurrence]);
      actions.push({action: args.action, targetId: value.id, observationId: args.observationId});
      if (args.action === 'newTab') {
        const child = {...target('child'), id: 'tab:child'};
        targets.push(child); return {target: child};
      }
      if (['navigate','reload','type'].includes(args.action)) return {target:{...targets.find(target => target.id === value.id),...(args.url ? {url:args.url} : {})}};
      if (args.action !== 'closeTab') return {};
      targets.splice(targets.findIndex(item => item.id === value.id), 1);
      return {closedTargetId: value.id};
    },
    focus: async value => { calls.push(['focus', value.id, value.identity.occurrence]); return {}; },
    release: async () => ({released: true}), close: async () => {},
  };
  const runtime = createPluginRuntime({dataDir, browser: backend, nativeEnabled: false, extensionEnabled: false});
  const computer = createComputerSession((endpoint, args) => runtime.request(endpoint, args,
    {sessionKey: 'synthetic-session', signal: endpoint === 'stop' ? undefined : computer.signal}));
  const run = code => computer.run({code, timeoutMs: 3000});
  t.after(async () => { await computer.close(); await runtime.close(); await rm(dataDir, {recursive: true, force: true}); });
  await run('var original = await cua.getTab("tab:reused");');
  return {runtime, run, targets, target, calls, actions};
}

for (const method of ['getAXState()', 'typeText("never")', 'focus()'])
test(`a persistent ${method} handle refuses a replacement with the same target ID`, async t => {
  const f = await fixture(t);
  await f.run('await original.close();');
  f.targets.push(f.target('replacement'));
  await f.run('var replacement = await cua.getTab("tab:reused");');
  f.calls.length = 0;
  await assert.rejects(f.run(`await original.${method};`), {code: 'TARGET_IDENTITY_CHANGED'});
  assert.deepEqual(f.calls, []);
  assert.equal((await f.run('await replacement.getAXState();')).ok, true);
});

test('public target metadata and action arguments cannot redirect a bound handle', async t => {
  const f = await fixture(t);
  await f.run('var other = await cua.getTab("tab:other");');
  f.calls.length = 0;
  await f.run(`original.id = other.id; original.target.id = other.id;
    original.target.identity.occurrence = "other";
    await original.act({action: "type", text: "original only", targetId: other.id, targetIdentity: other.target.identity});`);
  assert.deepEqual(f.calls, [['type', 'tab:reused', 'original']]);
});

test('a verified action result updates the binding without sharing its mutable descriptor', async t => {
  const f = await fixture(t);
  await f.run('var opened = await original.act({action: "newTab"});');
  f.calls.length = 0;
  await f.run(`opened.result.target.identity.occurrence = "edited";
    original.target.identity.occurrence = "edited"; await original.typeText("child only");`);
  assert.deepEqual(f.calls, [['type', 'tab:child', 'child']]);
  assert.equal(f.actions.at(-1).observationId, undefined, 'a new target cannot reuse the original observation');
  const capability = JSON.parse((await f.run('({id:original.id,control:original.capabilities.control(),metadata:original.target.control})')).outputs.at(-1));
  assert.equal(capability.id,'tab:child');assert.equal(capability.control.input,'target-cdp');
  assert.deepEqual(capability.metadata,capability.control);
});

test('navigation and ordinary action receipts refresh actual control capabilities without replacing the target occurrence',async t => {
  const f = await fixture(t);
  for (const action of ['await original.goto("https://example.test/next");','await original.reload();','await original.typeText("once");']) {
    const result = await f.run(`${action} ({id:original.id,identity:original.target.identity,control:original.capabilities.control(),metadata:original.target.control});`);
    const value = JSON.parse(result.outputs.at(-1));
    assert.equal(value.id,'tab:reused');assert.equal(value.identity.occurrence,'original');
    assert.equal(value.control.input,'target-cdp');assert.deepEqual(value.control.waits.navigation,['commit','domcontentloaded','load']);
    assert.deepEqual(value.metadata,value.control);
  }
  // Neither stale backend metadata nor an edited prior capability object may
  // replace routes freshly derived from the verified current descriptor.
  f.targets[0].control = {input:'stale-backend-route',waits:{navigation:false}};
  const result = await f.run('original.capabilities.control().input = "stale-prior-route"; await original.typeText("new route"); original.capabilities.control();');
  const control = JSON.parse(result.outputs.at(-1));
  assert.equal(control.input,'target-cdp');assert.deepEqual(control.waits.navigation,['commit','domcontentloaded','load']);
  assert.equal(f.calls.at(-1)[1],'tab:reused');
});

for (const endpoint of ['observe', 'act', 'resume', 'preview', 'focus', 'openTarget'])
test(`${endpoint} preserves the caller's expected occurrence through the DSH adapter`, async t => {
  const f = await fixture(t);
  f.calls.length = 0;
  const result = await f.runtime.request(endpoint, {targetId: 'tab:reused', targetIdentity: {occurrence: 'retired'},
    action: 'type', text: 'never'}, {sessionKey: 'synthetic-session'}).catch(error => ({ok: false, error}));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TARGET_IDENTITY_CHANGED');
  assert.deepEqual(f.calls, []);
});
