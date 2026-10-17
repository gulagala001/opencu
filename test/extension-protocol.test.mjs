import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExtensionBackend } from '../src/extension/backend.mjs';
import { targetId, parseTarget, mapScreenshotPoint } from '../src/extension/protocol.mjs';

const token = 'protocol-test-only-token-0123456789';
const identity = { instanceId: 'profile-instance-1', browserInstanceId: 'browser-instance-1', epoch: 'connection-epoch-1', tabId: 42, documentId: 'document-identity-1' };

test('extension bridge rejects websites and bad tokens, isolates epoch, persists acknowledged downloads', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'opencu-extension-protocol-'));
  const server = createServer(), backend = createExtensionBackend({ server, token, dataDir, requestTimeoutMs: 1000 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}${backend.path}`;
  const origin = 'chrome-extension://' + 'a'.repeat(32);
  const post = async (route, body, headers = {}) => {
    const response = await fetch(base + '/' + route, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  let poller;
  try {
    const hello = { protocol: 1, authorized: true, debuggerConsent: true, ...identity };
    assert.equal((await post('connect', hello, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('connect', hello, { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await post('connect', { ...hello, authorized: false })).status, 403);
    const connected = await post('connect', hello); assert.equal(connected.status, 200);
    const session = { sessionId: connected.body.sessionId, epoch: identity.epoch };
    const event = { eventId: 'download-event-1', type: 'changed', at: '2026-10-13T04:00:00Z', download: { id: 7, state: 'complete', filename: '/isolated/download.txt' } };
    const saved = await post('poll', { ...session, events: [event] });
    assert.deepEqual(saved.body.acknowledgedEvents, [event.eventId]);
    await post('poll', { ...session, events: [event] });
    assert.equal((await backend.listDownloads()).length, 1);
    assert.equal((await post('poll', { ...session, epoch: 'old-epoch' })).status, 409);
    let stopped = false;
    poller = (async () => {
      while (!stopped) {
        const result = await post('poll', { ...session, events: [] });
        for (const command of result.body.commands || []) {
          let value = { released: true };
          if (command.method === 'listTargets') value = [{ tabId: 42, documentId: identity.documentId, title: 'Fixture', url: 'https://fixture.example', supported: true }];
          if (command.method === 'select') value = { selected: true };
          if (command.method === 'verify') value = { verified: true, url: 'https://fixture.example', title: 'Fixture' };
          await post('result', { ...session, id: command.id, ok: true, result: value });
        }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    })();
    const targets = await backend.listTargets(); assert.equal(targets[0].id, targetId(identity));
    assert.deepEqual(parseTarget(targets[0]), identity);
    const target = await backend.select(targets[0]); assert.equal((await backend.verify(target)).valid, true);
    assert.equal((await backend.release({ targets: [target] })).released, true);
    await backend.close(); stopped = true; await poller; poller = undefined;
    const restored = createExtensionBackend({ token, dataDir });
    assert.equal((await restored.deliveries())[0].filename, '/isolated/download.txt'); await restored.close();
  } finally {
    if (poller) { await backend.close().catch(() => {}); }
    await new Promise(resolve => server.close(resolve));
  }
});

test('screenshot point mapping respects the displayed preview and rejects missing/outside geometry', () => {
  const screenshot = { width: 2400, height: 1600, bounds: { x: 0, y: 0, width: 1200, height: 800 } };
  assert.deepEqual(mapScreenshotPoint([300, 200], screenshot, { width: 600, height: 400 }), { x: 600, y: 400 });
  assert.deepEqual(mapScreenshotPoint([1200, 800], screenshot), { x: 600, y: 400 });
  assert.throws(() => mapScreenshotPoint([600, 0], screenshot, { width: 600, height: 400 }), { code: 'INVALID_COORDINATES' });
  assert.throws(() => mapScreenshotPoint([0, 0], null), { code: 'OBSERVATION_REQUIRED' });
});
