import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaywrightAPI} from '../src/dsh/browser-api.mjs';

const notReady = () => Object.assign(new Error('Element is moving'),
  {code: 'LOCATOR_NOT_STABLE', details: {inputDispatched: false}});

test('locator options reject invalid containers before any backend request', async () => {
  let calls = 0;
  const api = createPlaywrightAPI(async () => { calls++; return true; }, value => value);
  const operations = [
    options => api.getByRole('textbox', options),
    options => api.getByText('text', options),
    options => api.getByLabel('label', options),
    options => api.getByPlaceholder('placeholder', options),
    options => api.filter(options),
    options => api.domSnapshot(options),
    options => api.locator('input').click(options),
    options => api.locator('input').fill('value', options),
    options => api.locator('input').press('Enter', options),
    options => api.locator('input').getAttribute('name', options),
    options => api.locator('input').setChecked(true, options),
    options => api.locator('select').selectOption('value', options),
    options => api.locator('input').waitFor(options),
  ];
  for (const operation of operations) for (const options of [null, [], '', 1, true]) {
    await assert.rejects(async () => operation(options), /Locator options must be an object/);
  }
  assert.equal(calls, 0);
});

test('an expired retry never dispatches new input after its waiting timer', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1000});
  let attempts = 0;
  const api = createPlaywrightAPI(async () => {
    if (++attempts === 1) throw notReady();
    return 'input dispatched';
  }, value => value);
  const result = assert.rejects(api.locator('button').click({timeoutMs: 1}), error => {
    assert.equal(error.code, 'LOCATOR_TIMEOUT');
    assert.equal(error.details.inputDispatched, false);
    assert.equal(error.details.lastError.code, 'LOCATOR_NOT_STABLE');
    return true;
  });
  await Promise.resolve();
  t.mock.timers.tick(1);
  await result;
  assert.equal(attempts, 1);
});

test('supported locator option values fail at the API boundary', async () => {
  let calls = 0;
  const api = createPlaywrightAPI(async () => { calls++; return true; }, value => value);
  for (const invalid of [null, 0, 'true', [], {}]) {
    for (const method of ['getByRole', 'getByText', 'getByLabel', 'getByPlaceholder']) {
      assert.throws(() => api[method]('value', {exact: invalid}), /exact must be a boolean/);
    }
    assert.throws(() => api.filter({visible: invalid}), /visible must be a boolean/);
    await assert.rejects(api.locator('button').click({button: invalid}), /click button must be/);
    await assert.rejects(api.locator('button').waitFor({state: invalid}), /waitFor state must be/);
  }
  assert.equal(calls, 0);
});

test('locator rejects its unadvertised second argument before input and keeps explicit filters', async () => {
  const requests = [];
  const api = createPlaywrightAPI(async (_action, request) => {
    requests.push(structuredClone(request));
    return 'clicked';
  }, value => value);
  for (const options of [{hasText: '打开乙'}, {}, null, [], false, '打开乙']) {
    assert.throws(() => api.locator('.item button', options).first().click(),
      /locator supports only a CSS selector; use \.locator\(css\)\.filter/);
  }
  assert.equal(requests.length, 0);
  assert.equal(await api.locator('.item button', undefined).filter({hasText: '打开乙'}).first().click(), 'clicked');
  assert.deepEqual(requests, [{locator: [
    {kind: 'css', value: '.item button'},
    {kind: 'filter', hasText: '打开乙'},
    {kind: 'nth', index: 0},
  ], method: 'click', args: {}}]);
});

test('safe failures may retry within their deadline without changing the locator chain', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1000});
  const requests = [];
  const api = createPlaywrightAPI(async (_action, request) => {
    requests.push(structuredClone(request));
    if (requests.length === 1) throw notReady();
    return 'filled';
  }, value => value);
  const result = api.frameLocator('iframe').getByRole('textbox', {name: /Query/i}).nth(1)
    .fill('value', {timeoutMs: 500});
  await Promise.resolve();
  t.mock.timers.tick(100);
  assert.equal(await result, 'filled');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.deepEqual(requests[0], {locator: [
    {kind: 'frame', value: 'iframe'},
    {kind: 'role', value: 'textbox', name: {type: 'regex', source: 'Query', flags: 'i'}},
    {kind: 'nth', index: 1},
  ], method: 'fill', args: {value: 'value'}});
});

test('uncertain input and cancellation are never retried', async () => {
  for (const dispatched of [true, undefined]) {
    let calls = 0;
    const error = Object.assign(notReady(), {details: {inputDispatched: dispatched}});
    const api = createPlaywrightAPI(async () => { calls++; throw error; }, value => value);
    await assert.rejects(api.locator('button').click(), actual => actual === error);
    assert.equal(calls, 1);
  }
  const aborter = new AbortController();
  const stopped = new Error('Stopped while waiting');
  let calls = 0;
  const api = createPlaywrightAPI(async () => { calls++; throw notReady(); }, value => value,
    {signal: () => aborter.signal});
  const result = assert.rejects(api.locator('button').click({timeoutMs: 0}), error => error === stopped);
  await Promise.resolve();
  aborter.abort(stopped);
  await result;
  assert.equal(calls, 1);
});
