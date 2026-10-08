import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ComputerUseManager } from '../src/computer-use/manager.mjs';
import { BrowserActions } from '../src/computer-use/browser-actions.mjs';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';
import { startFixture } from './fixtures/computer-use/server.mjs';

test('AX identities survive unrelated frame navigation while navigated subtrees and whole-page observations expire', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-frame-ax-'));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url.startsWith('/grandchild')) res.end('<input aria-label="Grandchild note">');
    else if (req.url.startsWith('/child')) res.end('<input aria-label="Child note"><iframe src="/grandchild"></iframe>');
    else res.end('<!doctype html><title>Frame identity fixture</title><input aria-label="Main note"><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Main save</button><output>not saved</output><iframe src="/child"></iframe>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  t.after(async () => { await manager.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const run = async code => {
    const result = await manager.execute('frames', code);
    assert.equal(result.error, undefined, JSON.stringify({ error: result.error, operations: manager.status('frames').history.slice(-4) }));
    return result.blocks.filter(block => block.type === 'text' && block.text.startsWith('Tab ')).at(-1)?.text;
  };
  const read = () => run('await tab.getAXState({disableDiffing:true});');
  const ids = state => {
    const find = (role, name) => {
      const line = state.split('\n').find(line => line.includes(`${role} ${JSON.stringify(name)}`));
      assert.ok(line, `${role} ${name}\n${state}`); return Number(line.trim().split(' ')[0]);
    };
    return { main: find('textbox', 'Main note'), save: find('button', 'Main save'), child: find('textbox', 'Child note'), grandchild: find('textbox', 'Grandchild note') };
  };
  const rejects = async (id, action = 'setValue') => {
    const result = await manager.execute('frames', `await tab.${action}(${id}${action === 'setValue' ? ", 'must not write'" : ''});`);
    assert.match(result.error?.message, /old or detached page/, 'an observation from the changed document must not act on its replacement');
  };
  await run(`const tab=await cua.createBrowserTab('browser', ${JSON.stringify(url)}); await tab.playwright.waitForLoadState('load');`);
  const record = await manager.browser.target('frames', manager.status('frames').target.id);
  const original = ids(await read()), main = record.page.mainFrame(), mainUrl = main.url();
  const child = record.page.frames().find(frame => frame.url() === url + '/child');
  const oldGrandchild = record.page.frames().find(frame => frame.url() === url + '/grandchild');
  const generation = record.generation;
  const navigated = new Promise(resolve => record.page.on('framenavigated', frame => { if (frame === child && frame.url() === url + '/child-next') resolve(); }));
  await child.evaluate(() => setTimeout(() => { location.href = '/child-next'; }, 50));
  await navigated;
  assert.ok(record.generation > generation, 'child navigation still invalidates whole-page snapshots and screenshot geometry');
  assert.equal(main.url(), mainUrl);
  assert.equal(oldGrandchild.isDetached(), true, 'the ancestor navigation actually replaced the nested frame');
  await run(`await tab.setValue(${original.main}, '主文档仍可操作'); await tab.click(${original.save});`);
  assert.equal(await record.page.locator('output').textContent(), '主文档仍可操作');
  await rejects(original.child); await rejects(original.grandchild);
  await child.waitForLoadState('load');
  const afterChild = ids(await read());
  assert.equal(afterChild.main, original.main); assert.equal(afterChild.save, original.save);
  assert.notEqual(afterChild.child, original.child); assert.notEqual(afterChild.grandchild, original.grandchild);

  const grandchild = record.page.frames().find(frame => frame.url() === url + '/grandchild');
  const beforeNested = record.generation;
  await grandchild.goto(url + '/grandchild-next');
  assert.ok(record.generation > beforeNested);
  await run(`await tab.setValue(${afterChild.main}, '主文档保留'); await tab.setValue(${afterChild.child}, '父框架保留');`);
  await rejects(afterChild.grandchild);
  const afterGrandchild = ids(await read());
  assert.equal(afterGrandchild.main, original.main); assert.equal(afterGrandchild.save, original.save); assert.equal(afterGrandchild.child, afterChild.child);
  assert.notEqual(afterGrandchild.grandchild, afterChild.grandchild);

  const beforeMain = record.generation;
  await run(`await tab.goto(${JSON.stringify(url + '/?new-main=1')});`);
  assert.ok(record.generation > beforeMain);
  for (const id of [afterGrandchild.main, afterGrandchild.child, afterGrandchild.grandchild]) await rejects(id);
  await rejects(afterGrandchild.save, 'click');
});

test('a slow first AX observation still retries a document change without reviving old actions', { timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-slow-ax-'));
  const fixture = await startFixture();
  const manager = new ComputerUseManager(root, { browser: { executablePath: await testBrowserExecutable(root) }, native: { binary: join(root, 'missing-native') } });
  t.after(async () => { await manager.close(); await fixture.close(); await rm(root, { recursive: true, force: true }); });
  const tab = await manager.browser.create('slow', fixture.url), record = await manager.browser.target('slow', tab.id);
  const child = record.page.frameLocator('iframe');
  await child.getByRole('textbox', { name: '框架输入', exact: true }).waitFor();
  const initial = await manager.browser.invoke('slow', tab.id, 'getAXState', [{ disableDiffing: true }]);
  const oldId = Number(initial.state.split('\n').find(line => line.includes('textbox "框架输入"')).trim().split(' ')[0]);
  const send = record.cdp.send.bind(record.cdp); let delayed = false;
  const read = manager.browser.readSnapshot.bind(manager.browser), observations = [];
  manager.browser.readSnapshot = async (...args) => {
    const attempt = { started: performance.now(), before: record.generation }; observations.push(attempt);
    try { return await read(...args); }
    finally { attempt.elapsed = performance.now() - attempt.started; attempt.after = record.generation; }
  };
  record.cdp.send = async (method, params) => {
    const response = await send(method, params);
    if (method === 'Accessibility.getFullAXTree' && !delayed) {
      delayed = true;
      await delay(2100);
      await record.page.locator('iframe').evaluate(frame => { frame.src = '/frame?changed'; });
      await child.getByRole('textbox', { name: '姓名', exact: true }).waitFor();
    }
    return response;
  };
  t.after(() => { record.cdp.send = send; });
  const updated = await manager.browser.invoke('slow', tab.id, 'getAXState', [{ disableDiffing: true }]);
  assert.equal(delayed, true);
  assert.ok(observations[0].elapsed >= 2000);
  assert.ok(observations[0].after > observations[0].before);
  assert.ok(observations.length >= 2, JSON.stringify(observations));
  assert.match(updated.state, /iframe .*frame\?changed/);
  await assert.rejects(manager.browser.invoke('slow', tab.id, 'setValue', [oldId, 'must not write']), /old or detached/);
});

test('snapshot retries remain bounded during continuous changes and abort promptly', { timeout: 5000 }, async () => {
  const actions = new BrowserActions(), record = { page: { isClosed: () => false }, generation: 0 };
  let reads = 0;
  actions.readSnapshot = async () => { reads++; record.generation++; throw Object.assign(new Error('changing'), { code: 'STALE_ELEMENT' }); };
  // Use the same millisecond clock as the retry deadline: its integer boundary
  // can elapse just before a performance.now() interval reaches exactly 2000.
  const start = Date.now();
  await assert.rejects(actions.snapshot(record, {}), /changing/);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 2000, `retry window elapsed ${elapsed}ms`);
  assert.ok(reads > 1);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(new Error('cancel observation')), 60);
  try { await assert.rejects(actions.snapshot(record, {}, controller.signal), /cancel observation|aborted/); }
  finally { clearTimeout(timer); }
  const stopped = reads; await delay(50); assert.equal(reads, stopped);
});

test('a same-process child appearing after the frame-tree read retries observation with fresh ownership', async () => {
  const actions = new BrowserActions(), main = {}, child = { url: () => 'https://fixture.test/child' };
  let trees = 0, axReads = 0;
  const cdp = { send: async (method, parameters) => {
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' }, ...(trees++ ? { childFrames: [{ frame: { id: 'child' } }] } : {}) } };
    if (method === 'DOM.getFrameOwner') return { backendNodeId: 10 };
    if (method === 'Accessibility.getFullAXTree') {
      axReads++;
      return { nodes: [{ nodeId: 'root', role: { value: 'RootWebArea' }, name: { value: parameters.frameId }, childIds: ['control'] }, { nodeId: 'control', parentId: 'root', role: { value: 'textbox' }, name: { value: parameters.frameId + ' note' }, backendDOMNodeId: 11 }] };
    }
    throw Error('Unexpected CDP read: ' + method);
  } };
  const record = { id: 'fixture', cdp, frames: new Map(), frameGenerations: new Map(), generation: 0, ids: new Map(), previous: new Map(), page: {
    mainFrame: () => main, frames: () => [main, child], isClosed: () => false,
    title: async () => 'fixture', url: () => 'https://fixture.test',
    context: () => ({ newCDPSession: async () => { throw Error("This frame does not have a separate CDP session, it is a part of the parent frame's session"); } }),
  } };
  actions.resolveElement = async () => ({ contentFrame: async () => child, dispose: async () => {} });
  const state = await actions.snapshot(record, { disableDiffing: true });
  assert.match(state.state, /textbox "main note"/); assert.match(state.state, /textbox "child note"/);
  assert.equal(trees, 2, 'refresh discovery after the first stale frame tree');
  assert.equal(axReads, 2, 'read each recovered frame once');
  assert.equal(record.frames.get(child), cdp, 'same-process child keeps its actual parent CDP');
  const ids = [...record.elements.keys()]; assert.equal(new Set(ids).size, 2);
});
