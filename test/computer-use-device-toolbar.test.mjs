import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { testBrowserExecutable } from './fixtures/computer-use/test-browser.mjs';

const bundle = await build({ stdin: { contents: `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserTools} from './src/client/browser-tools.jsx';
const initial={enabled:true,controlEpoch:7,viewViewport:null,viewEmulation:null};
window.probe={calls:[],state:initial,fail:null,hold:null,releases:[],modes:[],completed:0};
function App(){
 const [state,setState]=useState(initial),[error,setError]=useState(''),[target,setTarget]=useState({id:'tab-a',url:'https://fixture.test/'}),[frame,setFrame]=useState({actor:'view-a',tabId:'tab-a',width:1280,height:800}),[scale,setScale]=useState('1');
 const receive=result=>{window.probe.state=result;setState(result);if(result.viewViewport)setFrame(f=>({...f,width:result.viewViewport.width,height:result.viewViewport.height}));};
 window.probe.switch=()=>{setTarget({id:'tab-b',url:'https://fixture.test/b'});setFrame({actor:'view-b',tabId:'tab-b',width:800,height:600});receive({...initial,controlEpoch:22,viewViewport:{overridden:true,width:800,height:600}});};
 const api=async(op,session,data,signal)=>{
  window.probe.calls.push({op,session,data});
  const before=window.probe.state;
  if(data.controlEpoch!==before.controlEpoch)throw new Error('stale epoch');
  if(window.probe.hold===op)await new Promise(resolve=>window.probe.releases.push(resolve));
  if(window.probe.fail===op){window.probe.fail=null;throw new Error('fixture '+op+' failed');}
  let result={...before,controlEpoch:data.controlEpoch+1};
  if(op==='view-viewport')result.viewViewport=data.size?{...data.size,overridden:true}:{width:1280,height:800,overridden:false};
  if(op==='view-emulation')result.viewEmulation=data.settings?{settings:data.settings}:null;
  window.probe.completed++;return result;
 };
 return <div className="tx-cu-pane"><BrowserTools sessionId="fixture" target={target} frame={frame} state={state} api={api} onState={receive} onError={setError} previewScale={scale} onPreviewScale={setScale} onDeviceModeChange={value=>window.probe.modes.push(value)}/><p role="alert">{error}</p></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
`, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
const css = await readFile(new URL('../src/client/computer-use.css', import.meta.url), 'utf8');
const artifactRoots=new WeakMap();
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'opencu-device-toolbar-'));
  const browser = await chromium.launchPersistentContext(join(root, 'profile'), { executablePath: await testBrowserExecutable(root), headless: true, viewport: { width: 540, height: 620 } });
  t.after(async () => { await browser.close(); if(!process.env.TRISOUL_CU_UI_ARTIFACTS)await rm(root, { recursive: true, force: true }); });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><head></head><body><main id="root"></main></body></html>');
  await page.addStyleTag({ content: 'html{color-scheme:light dark}body{margin:16px;background:Canvas}.tx-cu-pane{padding:10px;border:1px solid var(--cu-line);border-radius:12px}' + css }); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('button', { name: '浏览器选项', exact: true }).click();
  await page.getByRole('menuitem', { name: '显示设备工具栏', exact: true }).click();
  artifactRoots.set(page,root);return page;
}
const calls = page => page.evaluate(() => window.probe.calls);

test('device toolbar keeps size presets independent, explicitly applies optional emulation, and resets both with the returned epoch', async t => {
  const page = await fixture(t);
  await page.getByLabel('视口尺寸预设').selectOption('phone');
  await page.waitForFunction(() => window.probe.state.viewViewport?.width === 390);
  assert.deepEqual((await calls(page)).map(call => call.op), ['view-viewport']);
  assert.equal(await page.getByLabel('模拟触摸').count(), 0, 'default toolbar exposes only size controls');
  await page.getByRole('button', { name: '设备模拟', exact: true }).click();
  await page.getByLabel('模拟触摸', { exact: true }).selectOption('true');
  await page.getByLabel('模拟移动布局', { exact: true }).selectOption('true');
  await page.getByLabel('模拟设备像素比', { exact: true }).fill('2');
  await page.getByLabel('模拟 User Agent', { exact: true }).fill('Isolated Mobile Fixture');
  assert.equal((await calls(page)).length, 1, 'editing simulation drafts does not take control');
  await page.getByLabel('模拟设备像素比').fill('11');
  assert.equal(await page.getByRole('button', { name: '应用设备模拟', exact: true }).isDisabled(), true);
  await page.getByLabel('视口宽度').fill('400');
  await page.getByLabel('视口宽度').press('Enter');
  await page.waitForFunction(() => window.probe.state.viewViewport?.width === 400);
  assert.equal((await calls(page)).at(-1).op,'view-viewport','invalid simulation drafts cannot block a dimensions submission');
  await page.getByLabel('模拟设备像素比').fill('2');
  await page.getByLabel('模拟 User Agent').press('Enter');
  await page.waitForFunction(() => window.probe.state.viewEmulation?.settings?.deviceScaleFactor === 2);
  assert.deepEqual((await calls(page))[2].data, { settings: { deviceScaleFactor: 2, userAgent: 'Isolated Mobile Fixture', hasTouch: true, isMobile: true }, actor: 'view-a', tabId: 'tab-a', controlEpoch: 9 });
  assert.equal((await calls(page))[2].op, 'view-emulation', 'Enter in simulation never submits dimensions');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    assert.equal(await page.getByRole('button', { name: '应用设备模拟', exact: true }).isVisible(), true);
    if(process.env.TRISOUL_CU_UI_ARTIFACTS){const png=join(artifactRoots.get(page),'device-toolbar-'+scheme+'.png');await page.locator('.tx-cu-pane').screenshot({path:png});console.log('Device toolbar artifact:',png);}
    assert.equal(await page.locator('.tx-cu-device-toolbar').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'compact controls wrap within the toolbar');
  }
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.waitForFunction(() => window.probe.calls.length === 5 && !window.probe.state.viewViewport.overridden);
  assert.deepEqual((await calls(page)).slice(-2).map(({op,data}) => [op,data.controlEpoch]), [['view-emulation',10],['view-viewport',11]]);
  await page.waitForFunction(() => document.querySelector('[aria-label="模拟设备像素比"]').value === '');
  assert.equal(await page.getByLabel('模拟设备像素比').inputValue(), '');
  assert.equal(await page.locator('.tx-cu-device-toolbar').isVisible(), true, 'Reset leaves the toolbar open');
  const count = (await calls(page)).length;
  await page.getByRole('button', { name: '关闭设备工具栏', exact: true }).click();
  assert.equal(await page.locator('.tx-cu-device-toolbar').count(), 0);
  assert.equal((await calls(page)).length, count, 'closing already-default settings does not take control');
});

test('failed emulation or viewport restore keeps the device toolbar open and exposes the error until retry succeeds', async t => {
  const page = await fixture(t);
  await page.getByLabel('视口尺寸预设').selectOption('phone');
  await page.waitForFunction(() => window.probe.state.viewViewport?.overridden);
  await page.evaluate(() => { window.probe.fail='view-emulation'; });
  await page.getByRole('button', { name: '关闭设备工具栏', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'fixture view-emulation failed' }).waitFor();
  assert.equal(await page.locator('.tx-cu-device-toolbar').isVisible(), true);
  assert.equal((await calls(page)).length, 2, 'viewport restore never follows failed emulation restore');
  await page.evaluate(() => { window.probe.fail='view-viewport'; });
  await page.getByRole('button', { name: '关闭设备工具栏', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'fixture view-viewport failed' }).waitFor();
  assert.equal(await page.locator('.tx-cu-device-toolbar').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: '关闭设备工具栏', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '关闭设备工具栏', exact: true }).click();
  await page.locator('.tx-cu-device-toolbar').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('alert').innerText(), '');
});

test('switching targets during a device restore fences the remaining restore and stale result', async t => {
  const page = await fixture(t);
  await page.getByLabel('视口尺寸预设').selectOption('phone');
  await page.waitForFunction(() => window.probe.state.viewViewport?.overridden);
  await page.evaluate(() => { window.probe.hold='view-emulation'; });
  await page.getByRole('button', { name: '关闭设备工具栏', exact: true }).click();
  await page.waitForFunction(() => window.probe.releases.length === 1);
  await page.evaluate(() => window.probe.switch());
  await page.getByLabel('视口宽度').waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="视口宽度"]').value === '800');
  await page.evaluate(() => window.probe.releases[0]());
  await page.waitForFunction(() => window.probe.completed === 2 && !document.querySelector('.tx-cu-browser-tool-progress'));
  assert.equal((await calls(page)).length, 2, 'no second reset may target the newly selected page');
  assert.equal(await page.getByLabel('视口宽度').inputValue(), '800');
  assert.equal(await page.locator('.tx-cu-device-toolbar').isVisible(), true, 'old completion cannot hide the current page toolbar');
  assert.equal(await page.getByRole('alert').innerText(), '');
});
