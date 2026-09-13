import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { setTimeout as delay } from 'node:timers/promises';
import { NativeViews } from '../src/computer-use/native-view.mjs';

test('preview cursor persists beyond idle, expires only its pulse, and rejects invalid geometry', { timeout: 10000 }, async t => {
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage();
  const { outputFiles } = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {AssistantCursor} from './src/client/assistant-cursor.jsx';
    const root=createRoot(document.getElementById('root'));
    window.render=(cursor,frame)=>root.render(<AssistantCursor cursor={cursor} frame={frame}/>);
  `, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife' });
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: outputFiles[0].text });
  const frame = { width: 800, height: 600, loaderId: 'document', geometry: { width: 800, height: 600 } };
  const cursor = { source: 'input', sequence: 1, x: 300, y: 200, buttons: 0, loaderId: frame.loaderId, geometry: frame.geometry, press: { sequence: 1, x: 300, y: 200 } };
  const render = (pointer, image = frame) => page.evaluate(([p,f]) => render(p,f), [pointer,image]);
  await render(cursor);
  const arrow = page.locator('.tx-cu-assistant-cursor'); await arrow.waitFor();
  await delay(1700);
  assert.equal(await arrow.count(), 1, 'idle does not remove the pointer');
  assert.equal(await page.locator('.tx-cu-cursor-pulse').count(), 0, 'click feedback remains temporary');
  await render(cursor, { ...frame, loaderId: 'next-document' }); await arrow.waitFor({ state: 'detached' });
  await render(cursor); await arrow.waitFor();
  await render(cursor, { ...frame, geometry: { ...frame.geometry, width: 900 } }); await arrow.waitFor({ state: 'detached' });
  await render(cursor); await arrow.waitFor();
  await render(null); await arrow.waitFor({ state: 'detached' });
});

test('native preview retains the turn endpoint through control release, then accepts new input and clears on stop', async () => {
  const controller = new AbortController(); let nextFrame;
  const native = { call: async () => new Promise(resolve => { nextFrame = resolve; }) };
  const views = new NativeViews(native), events = [];
  const pointer = { source: 'lease-1', sequence: 1, x: 20, y: 30, buttons: 0 };
  const view = { id: 'view', target: { sessionId: 'model', processIdentity: 'process', windowId: 42 }, sessionId: 'capture', controller, listeners: new Set([(event,value) => { if (event === 'cursor') events.push(value); }]), latest: {}, status: 'live', closed: false };
  views.views.set(view.id, view);
  const running = views.poll(view);
  const emit = async cursor => { nextFrame({ structuredContent: { status: 'live', cursor } }); await new Promise(resolve => setImmediate(resolve)); };
  await emit(pointer); views.retainCursor('model');
  await emit(pointer); await emit(null);
  assert.equal(view.cursor.source, pointer.source, 'a final capture during release cannot discard the retained location');
  assert.equal(view.cursor.x, pointer.x);
  await emit({ ...pointer, source: 'lease-2', sequence: 2, x: 50 });
  assert.equal(view.cursor.x, 50, 'next turn replaces the retained pointer');
  views.retainCursor('model'); views.clearRetainedCursor('model'); await emit(null);
  assert.equal(events.at(-1), null);
  view.closed = true; nextFrame({ structuredContent: { status: 'live' } }); await running;
});
