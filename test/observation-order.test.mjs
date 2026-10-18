import test from 'node:test';
import assert from 'node:assert/strict';
import {createObservationProjector, semanticAX} from '../src/dsh/observation-output.mjs';

test('small AX changes retain reconstructable ordering without replaying unchanged IDs', () => {
  const base = Array.from({length: 24}, (_, index) => String(index));
  const observation = (id, ids) => ({targetId: 'page', observation: {id, ax: {
    stableIds: true, identityScope: 'document', nodes: ids.map(elementId => ({elementId, role: 'button', name: `Action ${elementId}`})),
  }}});
  for (const next of [base, ['new', ...base], [...base.slice(0, 4), 'new', ...base.slice(4)],
    base.filter(id => id !== '5'), [base[5], ...base.filter(id => id !== '5')],
    [...base.slice(1), base[0]], [...base.slice(0, 4), base[6], 'new', base[4], ...base.slice(7)]]) {
    const projector = createObservationProjector();
    projector.project(observation('before', base));
    const value = projector.project(observation('after', next)).observation;
    assert.equal(value.axView.mode, 'diff');
    assert.doesNotMatch(value.ax, /\norder=/);
    const restored = [...base];
    for (const line of value.ax.split('\n')) {
      if (line.startsWith('- [')) restored.splice(restored.indexOf(line.slice(3, -1)), 1);
      if (line.startsWith('+ [')) restored.push(line.slice(3, line.indexOf(']')));
      if (line.startsWith('orderAfter=')) {
        const edits = JSON.parse(line.slice(11, line.indexOf(' (move/insert')));
        for (const [id, predecessor] of edits) {
          const old = restored.indexOf(id);
          if (old >= 0) restored.splice(old, 1);
          restored.splice(predecessor === null ? 0 : restored.indexOf(predecessor) + 1, 0, id);
        }
      }
    }
    assert.deepEqual(restored, next);
  }
});

test('compact AX preserves fragments without proof of complete non-actionable coverage', () => {
  const nodes = [
    {nodeId: 'parent', elementId: 'text', role: 'StaticText', name: 'Save', children: ['duplicate', 'different', 'actionable']},
    {nodeId: 'duplicate', role: 'InlineTextBox', name: 'Save'},
    {nodeId: 'different', role: 'InlineTextBox', name: 'Distinct text'},
    {nodeId: 'actionable', elementId: 'pressable', role: 'InlineTextBox', name: 'Save', actions: ['press']},
    {nodeId: 'text-parent', elementId: 'other-text', role: 'StaticText', text: 'Parent text', children: ['text-child']},
    {nodeId: 'text-child', role: 'InlineTextBox', text: 'Distinct child text'},
  ];
  const raw = {targetId: 'page', observation: {id: 'one', ax: {nodes}}};
  const original = JSON.stringify(raw), view = semanticAX(raw.observation.ax);
  assert.equal(view.rows.has('node:duplicate'), true);
  assert.match(view.rows.get('node:different'), /Distinct text/);
  assert.match(view.rows.get('pressable'), /actions=\["press"\]/);
  assert.match(view.rows.get('node:text-child'), /Distinct child text/);
  assert.equal(createObservationProjector().project(raw, {details: true}), raw);
  assert.equal(JSON.stringify(raw), original);
});

test('compact AX collapses only complete ordered text fragments, including literal newlines', () => {
  const names = ['cu-example.csv', '\n', 'name,status', '\n', '合成项目,ready', '\n'];
  const parent = {nodeId:'parent', elementId:'text', role:'StaticText', name:names.join(''), childIds:names.map((_, index) => `part-${index}`)};
  const fragments = names.map((name, index) => ({nodeId:`part-${index}`, role:'InlineTextBox', name}));
  const raw = {targetId:'page', observation:{id:'one', ax:{nodes:[parent, ...fragments.slice().reverse()]}}};
  const original = JSON.stringify(raw), view = semanticAX(raw.observation.ax);
  assert.equal(view.rows.size, 1, 'childIds order, rather than the node array order, proves exact coverage');
  assert.equal(view.rows.get('text'), `[text] StaticText ${JSON.stringify(names.join(''))}`);
  assert.equal(createObservationProjector().project(raw, {details:true}), raw);
  assert.equal(JSON.stringify(raw), original);
  for (const nodes of [
    [parent, ...fragments.map((node, index) => index === 0 ? {...node, name:'Different'} : node)],
    [parent, ...fragments.slice(1)],
    [{...parent, childIds:[...parent.childIds].reverse()}, ...fragments],
    [parent, ...fragments.map((node, index) => index === 0 ? {...node, elementId:'actionable'} : node)],
    [parent, ...fragments.map((node, index) => index === 0 ? {...node, actions:['press']} : node)],
    [parent, ...fragments, {nodeId:'extra', parentId:'parent', role:'InlineTextBox', name:''}],
    [parent, ...fragments, {nodeId:'descendant', parentId:'part-0', role:'StaticText', name:'child'}],
    [{...parent, childIds:undefined}, ...fragments.map(node => ({...node, parentId:'parent'}))],
  ]) {
    const kept = semanticAX({nodes});
    assert.equal(kept.rows.has('node:part-1'), true, 'uncertain or non-identical groups retain every fragment');
  }
  assert.equal(semanticAX({nodes:[{nodeId:'one', role:'StaticText', name:'Save', children:['leaf']},
    {nodeId:'leaf', role:'InlineTextBox', name:'Save'}]}).rows.size, 1, 'single complete duplicate still collapses');
});
