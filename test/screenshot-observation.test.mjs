import test from 'node:test';
import assert from 'node:assert/strict';
import {observeAccessibility, elementOperation, invalidateElements} from '../extension/accessibility.js';
import {createGuestDriver} from '../src/client/guest-driver.mjs';

const node = {nodeId: '1', backendDOMNodeId: 42, role: {value: 'button'}, name: {value: 'Save'}};

test('screenshot-only AX metadata defers one live index read until an element is used', async t => {
  const tab = 901, calls = [], send = async method => {calls.push(method); return {nodes: [node]};};
  t.after(() => invalidateElements(tab));
  const first = await observeAccessibility(tab, send, 'document');
  const id = first.ax.nodes[0].elementId;
  calls.length = 0;
  const shot = await observeAccessibility(tab, send, 'document', () => {}, {format: 'screenshot'});
  assert.equal(shot.ax, undefined);
  assert.notEqual(shot.observationId, first.observationId);
  assert.deepEqual(calls, []);
  await assert.rejects(elementOperation(tab, send, 'verifyElement', {elementId: id, observationId: first.observationId}), {code: 'STALE_ELEMENT'});
  assert.deepEqual(calls, [], 'an expired observation must not trigger a deferred read');
  await elementOperation(tab, send, 'verifyElement', {elementId: id, observationId: shot.observationId});
  await elementOperation(tab, send, 'verifyElement', {elementId: id, observationId: shot.observationId});
  assert.deepEqual(calls, ['Accessibility.getFullAXTree']);
});

test('deferred element reads reject removed nodes and cannot restore a replaced document', async t => {
  const tab = 902;
  t.after(() => invalidateElements(tab));
  const original = await observeAccessibility(tab, async () => ({nodes: [node]}), 'document');
  const id = original.ax.nodes[0].elementId;
  const shot = await observeAccessibility(tab, null, 'document', () => {}, {format: 'screenshot'});
  await assert.rejects(elementOperation(tab, async () => ({nodes: []}), 'verifyElement', {elementId: id, observationId: shot.observationId}), {code: 'STALE_ELEMENT'});
  await observeAccessibility(tab, null, 'document', () => {}, {format: 'screenshot'});
  const entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const pending = elementOperation(tab, async () => {entered.resolve(); await gate.promise; return {nodes: [node]};}, 'verifyElement', {elementId: id});
  await entered.promise;
  invalidateElements(tab);
  gate.resolve();
  await assert.rejects(pending, {code: 'STALE_ELEMENT'});
  await assert.rejects(elementOperation(tab, async () => ({nodes: [node]}), 'verifyElement', {elementId: id}), {code: 'STALE_ELEMENT'});
});

test('guest passes the requested observation format and retains screenshot geometry checks', async () => {
  const calls = [], viewport = {width: 100, height: 80, scrollX: 0, scrollY: 0};
  let changed = false;
  const automate = async (operation, args) => {
    calls.push({operation, args});
    if (operation === 'getDialog') return {dialog: null};
    if (operation === 'observe') return {observationId: 'fresh', documentId: 'document', url: 'https://fixture.invalid/', viewport};
    if (operation === 'pageState') return {documentId: 'document', url: 'https://fixture.invalid/', ...viewport, scrollY: changed ? 10 : 0};
    throw Error(operation);
  };
  const element = {addEventListener() {}, isCrashed: () => false};
  const driver = createGuestDriver(element, {}, () => {}, () => {}, () => {}, async () => ({toDataURL: () => 'data:image/png;base64,eA==', getSize: () => ({width: 100, height: 80})}), automate);
  const shot = await driver.observe({format: 'screenshot'});
  assert.equal(shot.screenshot.width, 100);
  assert.deepEqual(calls.find(call => call.operation === 'observe').args, {format: 'screenshot'});
  changed = true;
  await assert.rejects(driver.observe({format: 'screenshot'}), {code: 'STALE_SCREENSHOT'});
});
