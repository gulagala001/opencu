import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotContexts } from '../src/computer-use/snapshot-context.mjs';

// Synthetic AX nodes shaped like Accessibility.getFullAXTree output.
const ax = (id, parentId, role, name) => ({
  nodeId: String(id), parentId: parentId === null ? undefined : String(parentId), childIds: [],
  ignored: false, role: { value: role }, name: name === undefined ? undefined : { value: name },
});
const observe = nodes => {
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  for (const node of nodes) if (node.parentId) byId.get(node.parentId).childIds.push(node.nodeId);
  const rows = nodes.map(node => ({ node, role: node.role?.value ?? '', name: node.name?.value ?? '' }));
  const contexts = snapshotContexts(rows, byId);
  return id => contexts.get(rows.find(row => row.node.nodeId === String(id))?.node.nodeId);
};

test('a label just before a repeated row identifies it even when wrappers are flattened', () => {
  // Three cards become five sibling rows once the role-less `div` wrappers are
  // dropped from the AX tree, so only the label immediately before each button
  // tells them apart. Collecting labels from the container start would give
  // every row the first card's label.
  const context = observe([
    ax(1, null, 'RootWebArea', '审批'),
    ax(2, 1, 'StaticText', '张三 · 请假三天'), ax(3, 1, 'button', '批准'),
    ax(4, 1, 'StaticText', '李四 · 报销一千二'), ax(5, 1, 'button', '批准'),
    ax(6, 1, 'StaticText', '王五 · 加班两小时'), ax(7, 1, 'button', '批准'),
  ]);
  const labels = [3, 5, 7].map(id => context(String(id)));
  assert.deepEqual(labels.sort(), ['张三 · 请假三天', '李四 · 报销一千二', '王五 · 加班两小时']);
});

test('a named ancestor region identifies repeated rows when no sibling label applies', () => {
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'),
    ax(2, 1, 'region', 'Project Alpha'), ax(3, 2, 'button', 'Save'),
    ax(4, 1, 'region', 'Project Beta'), ax(5, 4, 'button', 'Save'),
  ]);
  assert.equal(context('3'), 'Project Alpha');
  assert.equal(context('5'), 'Project Beta');
});

test('a name that occurs once never pays for context', () => {
  const context = observe([ax(1, null, 'RootWebArea', 'T'), ax(2, 1, 'button', '唯一动作')]);
  assert.equal(context('2'), undefined);
});

test('the same text in different roles is not a duplicate', () => {
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'), ax(2, 1, 'button', 'View'),
    ax(3, 1, 'region', '报告'), ax(4, 3, 'link', 'View'),
  ]);
  assert.equal(context('2'), undefined);
  assert.equal(context('4'), undefined);
});

test('a weak action label is not offered as identity evidence', () => {
  // `Save` beside `Save` names nothing; the row must not claim it as context.
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'),
    ax(2, 1, 'StaticText', 'Save'), ax(3, 1, 'button', 'Save'),
    ax(4, 1, 'button', 'Save'),
  ]);
  assert.equal(context('3'), undefined);
  assert.equal(context('4'), undefined);
});

test('pure text nodes mirror a control instead of paying for context', () => {
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'), ax(2, 1, 'region', '项目甲'),
    ax(3, 2, 'button', 'Save'), ax(4, 3, 'StaticText', 'Save'),
    ax(5, 1, 'region', '项目乙'), ax(6, 5, 'button', 'Save'), ax(7, 6, 'StaticText', 'Save'),
  ]);
  assert.equal(context('3'), '项目甲');
  assert.equal(context('6'), '项目乙');
  assert.equal(context('4'), undefined);
  assert.equal(context('7'), undefined);
});

test('explicit scopes outrank action siblings and changing nearby status', () => {
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'), ax(2, 1, 'region', 'Alpha'),
    ax(3, 2, 'button', 'Download'), ax(4, 2, 'StaticText', 'Pending 1'), ax(5, 2, 'button', 'Save'),
    ax(6, 1, 'region', 'Beta'), ax(7, 6, 'button', 'Download'), ax(8, 6, 'button', 'Save'),
  ]);
  assert.equal(context('5'), 'Alpha'); assert.equal(context('8'), 'Beta');
});

test('owned following labels cannot be borrowed from another action branch', () => {
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'), ax(2, 1, 'generic'),
    ax(3, 2, 'StaticText', 'Alpha'), ax(4, 2, 'button', 'Save'),
    ax(5, 1, 'generic'), ax(6, 5, 'button', 'Save'), ax(7, 5, 'StaticText', 'Beta'),
    ax(8, 1, 'button', 'Save'),
  ]);
  assert.equal(context('4'), 'Alpha'); assert.equal(context('6'), 'Beta');
  assert.equal(context('8'), undefined);
});

test('common contexts do not claim to distinguish repeated controls', () => {
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'), ax(2, 1, 'region', 'Same'), ax(3, 2, 'button', 'Save'),
    ax(4, 1, 'region', 'Same'), ax(5, 4, 'button', 'Save'),
  ]);
  assert.equal(context('3'), undefined); assert.equal(context('5'), undefined);
});

test('cyclic ignored parents terminate without inventing context', () => {
  const context = observe([
    ax(1, 2, 'generic'), ax(2, 1, 'generic'), ax(3, 2, 'button', 'Save'), ax(4, 2, 'button', 'Save'),
  ]);
  assert.equal(context('3'), undefined); assert.equal(context('4'), undefined);
});


test('an unlabeled card does not borrow a preceding read-only card heading', () => {
  const context = observe([
    ax(1, null, 'RootWebArea', 'T'), ax(2, 1, 'generic'), ax(3, 2, 'heading', 'Alpha'),
    ax(4, 1, 'generic'), ax(5, 4, 'button', 'Save'),
    ax(6, 1, 'generic'), ax(7, 6, 'heading', 'Beta'), ax(8, 6, 'button', 'Save'),
  ]);
  assert.equal(context('5'), undefined); assert.equal(context('8'), 'Beta');
});

test('UTF-8 and JSON escaping stay within the context budget; shortened collisions are omitted', () => {
  const nodes = [ax(1, null, 'RootWebArea', 'T'),
    ax(2, 1, 'region', '甲"\\'.repeat(100) + 'A'), ax(3, 2, 'button', 'Save'),
    ax(4, 1, 'region', '甲"\\'.repeat(100) + 'B'), ax(5, 4, 'button', 'Save')];
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  for (const node of nodes) if (node.parentId) byId.get(node.parentId).childIds.push(node.nodeId);
  const rows = nodes.map(node => ({ node, role: node.role.value, name: node.name?.value ?? '' }));
  assert.equal(snapshotContexts(rows, byId, { maxBytes: 80 }).size, 0, 'common shortened prefixes are not distinct evidence');
  nodes[3].name.value = '乙"\\'.repeat(100);
  rows[3].name = nodes[3].name.value;
  const contexts = snapshotContexts(rows, byId, { maxBytes: 80 });
  assert.equal(contexts.size, 2);
  assert.ok([...contexts.values()].reduce((sum, label) => sum + Buffer.byteLength(JSON.stringify(label)) + 8, 0) <= 80);
});
