import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserTransport } from '../src/computer-use/browser-transport.mjs';

const layoutMetrics = {
  cssLayoutViewport: { pageX: 0, pageY: 0, clientWidth: 800, clientHeight: 600 },
  cssVisualViewport: { offsetX: 0, offsetY: 0, pageX: 0, pageY: 0, clientWidth: 800, clientHeight: 600, scale: 1 },
  visualViewport: { clientWidth: 800, clientHeight: 600 },
};

async function fixture(t) {
  const server = new WebSocketServer({ port: 0 });
  await new Promise(resolve => server.once('listening', resolve));
  const connected = new Promise(resolve => server.once('connection', resolve));
  const transport = new BrowserTransport(`ws://127.0.0.1:${server.address().port}`);
  const delivered = [], requests = [];
  transport.onmessage = message => delivered.push(message);
  const socket = await connected;
  socket.on('message', data => requests.push(JSON.parse(data.toString())));
  t.after(async () => { transport.close(); for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); });
  const send = message => socket.send(JSON.stringify(message));
  const until = async check => { for (let attempt = 0; attempt < 100; attempt++) { if (check()) return; await delay(5); } assert.fail('transport did not deliver the expected message'); };
  send({ method: 'Target.attachedToTarget', params: { sessionId: 'parent', targetInfo: { targetId: 'tab', type: 'page' }, waitingForDebugger: false } });
  await until(() => transport.sessions.has('parent'));
  return { transport, delivered, requests, send, until };
}

test('a detached restored iframe cannot be resurrected by a late attachment synchronization reply', async t => {
  const { transport, delivered, requests, send, until } = await fixture(t);
  send({ sessionId: 'parent', method: 'Target.attachedToTarget', params: { sessionId: 'child', targetInfo: { targetId: 'iframe', type: 'iframe' }, waitingForDebugger: false } });
  await until(() => requests.length);
  send({ sessionId: 'parent', method: 'Target.detachedFromTarget', params: { sessionId: 'child', targetId: 'iframe' } });
  send({ id: requests[0].id, sessionId: 'parent', result: { frameTree: { frame: { id: 'tab', loaderId: 'restored' } } } });
  await until(() => transport.frameAttachments.size === 0);
  assert.equal(transport.sessions.has('child'), false);
  assert.equal(delivered.some(message => message.method === 'Target.attachedToTarget' && message.params.sessionId === 'child'), false);
});

test('a later navigation invalidates a pending BFCache frame-tree restoration', async t => {
  const { transport, delivered, requests, send, until } = await fixture(t);
  send({ sessionId: 'parent', method: 'Runtime.executionContextCreated', params: { context: { id: 7, auxData: { frameId: 'old-child' } } } });
  send({ sessionId: 'parent', method: 'Page.frameNavigated', params: { frame: { id: 'tab', loaderId: 'restored' }, type: 'BackForwardCacheRestore' } });
  await until(() => requests.length);
  send({ sessionId: 'parent', method: 'Page.frameNavigated', params: { frame: { id: 'tab', loaderId: 'newer' }, type: 'Navigation' } });
  send({ id: requests[0].id, sessionId: 'parent', result: { frameTree: { frame: { id: 'tab', loaderId: 'restored' }, childFrames: [{ frame: { id: 'old-child', parentId: 'tab', loaderId: 'old' } }] } } });
  await until(() => transport.frameRestores.size === 0);
  assert.equal(delivered.some(message => message.method === 'Page.frameAttached'), false);
  assert.equal(delivered.filter(message => message.method === 'Runtime.executionContextCreated').length, 1);
});

test('detach retires pending frame and pointer work without requiring replies', async t => {
  const { transport, delivered, requests, send, until } = await fixture(t);
  const pointers = []; transport.onPointer = value => pointers.push(value);
  send({ sessionId: 'parent', method: 'Runtime.executionContextCreated', params: { context: { id: 7, auxData: { frameId: 'old-child' } } } });
  send({ sessionId: 'parent', method: 'Page.frameNavigated', params: { frame: { id: 'tab', loaderId: 'restored' }, type: 'BackForwardCacheRestore' } });
  send({ sessionId: 'parent', method: 'Target.attachedToTarget', params: { sessionId: 'child', targetInfo: { targetId: 'iframe', type: 'iframe' }, waitingForDebugger: false } });
  await until(() => transport.frameRestores.size === 1 && transport.frameAttachments.size === 1);
  transport.send({ id: 1, sessionId: 'parent', method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 10, y: 20 } });
  await until(() => requests.length >= 4);
  const pending = requests.filter(message => message.id < 0);
  send({ method: 'Target.detachedFromTarget', params: { sessionId: 'parent', targetId: 'tab' } });
  await until(() => !transport.sessions.has('parent'));
  assert.equal(transport.frameRestores.size, 0);
  assert.equal(transport.frameAttachments.size, 0);
  assert.equal(transport.observations.size, 0);
  assert.equal(transport.requests.size, 0);
  for (const request of pending) send({ id: request.id, sessionId: 'parent', result: {
    frameTree: { frame: { id: 'tab', loaderId: 'restored' } },
    ...layoutMetrics,
  } });
  send({ method: 'Test.replyBarrier' });
  await until(() => delivered.some(message => message.method === 'Test.replyBarrier'));
  assert.equal(pointers.length, 0);
  assert.equal(delivered.some(message => message.id < 0), false);
  assert.equal(transport.sessions.has('child'), false);
});

test('a detached pending iframe drops its synchronization while its parent remains usable', async t => {
  const { transport, delivered, requests, send, until } = await fixture(t);
  send({ sessionId: 'parent', method: 'Target.attachedToTarget', params: { sessionId: 'child', targetInfo: { targetId: 'iframe', type: 'iframe' }, waitingForDebugger: false } });
  await until(() => requests.length === 1);
  const request = requests[0];
  send({ sessionId: 'parent', method: 'Target.detachedFromTarget', params: { sessionId: 'child', targetId: 'iframe' } });
  send({ method: 'Test.detachBarrier' });
  await until(() => delivered.some(message => message.method === 'Test.detachBarrier'));
  assert.equal(transport.frameAttachments.size, 0);
  assert.equal(transport.sessions.has('parent'), true);
  send({ id: request.id, sessionId: 'parent', result: { frameTree: { frame: { id: 'tab', loaderId: 'restored' } } } });
  send({ method: 'Test.replyBarrier' });
  await until(() => delivered.some(message => message.method === 'Test.replyBarrier'));
  assert.equal(delivered.some(message => message.id === request.id), false);
  assert.equal(delivered.some(message => message.method === 'Target.attachedToTarget' && message.params.sessionId === 'child'), false);
});

test('pointer geometry from an earlier navigation cannot apply to the current page', async t => {
  const { transport, delivered, requests, send, until } = await fixture(t);
  const pointers = []; transport.onPointer = value => pointers.push(value);
  send({ sessionId: 'parent', method: 'Page.frameNavigated', params: { frame: { id: 'tab', loaderId: 'before' }, type: 'Navigation' } });
  await until(() => transport.sessions.get('parent').loaderId === 'before');
  transport.send({ id: 1, sessionId: 'parent', method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 10, y: 20 } });
  await until(() => requests.length >= 2);
  const request = requests.find(message => message.method === 'Page.getLayoutMetrics');
  send({ sessionId: 'parent', method: 'Page.frameNavigated', params: { frame: { id: 'tab', loaderId: 'after' }, type: 'Navigation' } });
  send({ id: request.id, sessionId: 'parent', result: layoutMetrics });
  send({ method: 'Test.replyBarrier' });
  await until(() => delivered.some(message => message.method === 'Test.replyBarrier'));
  assert.equal(pointers.length, 0);
});
