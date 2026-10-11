import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import {frontendComponents} from './fixtures/frontend-components.mjs';

async function mount(page, contents) {
  const {outputFiles} = await build({bundle: true, write: false, platform: 'browser', format: 'iife', loader: {'.css': 'text'}, define: {'process.env.NODE_ENV': '"production"'}, stdin: {resolveDir: process.cwd(), loader: 'jsx', contents}});
  await page.setContent('<style>:root{color-scheme:light dark}body{margin:0;background:Canvas;color:CanvasText}.tx-cu-pane{width:min(390px,100vw);height:780px;box-sizing:border-box;margin-left:auto}</style><div id="root"></div>');
  await page.addStyleTag({content: await readFile(new URL('../src/client/computer-use.css', import.meta.url), 'utf8')});
  await page.addScriptTag({content: outputFiles[0].text});
}

test('download records retain late/error states, safe save links and focus through filtering and clearing', async t => {
  const {page, errors, output} = await frontendComponents(t, {width: 390, height: 800});
  await mount(page, `
    import React from 'react';import{createRoot}from'react-dom/client';import{BrowserDownloads}from'./src/client/browser-downloads.jsx';
    window.fixture={calls:[],failClear:true,downloads:[
      {id:'saved',filename:'交付结果.txt',state:'completed',receivedBytes:2048,canDownload:true,browserId:'browser'},
      {id:'late',filename:'迟到的下载.txt',state:'unobserved',receivedBytes:1024,canDownload:false,browserId:'browser'},
      {id:'external',filename:'原浏览器文件.txt',state:'completed',receivedBytes:50,canDownload:false,browserId:'chrome'},
      {id:'canceled',filename:'中断.txt',state:'canceled',receivedBytes:0,canDownload:false,browserId:'browser'}]};
    const api=async(op,id,input)=>{window.fixture.calls.push({op,id,input});if(op==='downloads-clear'){if(window.fixture.failClear)throw Error('Fixture clear failed; files retained');window.fixture.downloads=window.fixture.downloads.filter(item=>item.state==='unobserved');}return{downloads:window.fixture.downloads};};
    createRoot(document.getElementById('root')).render(<div className="tx-cu-pane"><div style={{display:'flex',justifyContent:'end'}}><BrowserDownloads sessionId="fixture / ?" visible api={api}/></div></div>);
  `);
  const trigger = page.getByRole('button', {name: '下载记录', exact: true});
  await trigger.click();
  const panel = page.getByRole('dialog', {name: '当前会话下载记录', exact: true});
  await panel.getByText('交付结果.txt', {exact: true}).waitFor();
  assert.equal(await panel.getByRole('link', {name: '保存文件'}).getAttribute('href'), 'trisoul-x/computer-use/download-file?session=fixture%20%2F%20%3F&id=saved');
  await panel.getByText('文件保存在原浏览器的下载位置', {exact: true}).waitFor();
  await panel.getByLabel('筛选下载记录').selectOption('unobserved');
  assert.equal(await panel.locator('li').count(), 1);
  await panel.getByText('连接已断开，状态待确认', {exact: false}).waitFor();
  await panel.getByLabel('搜索下载文件').fill('没有此文件');
  await panel.getByText('没有匹配的下载记录', {exact: true}).waitFor();
  await panel.getByLabel('搜索下载文件').fill('');
  await panel.getByLabel('筛选下载记录').selectOption('all');
  await panel.getByRole('button', {name: '清除已结束记录', exact: true}).click();
  await panel.getByRole('alert').filter({hasText: 'files retained'}).waitFor();
  assert.equal(await panel.locator('li').count(), 4);
  if (output) await page.screenshot({path: join(output, 'failed-clear-light.png')});
  await page.evaluate(() => {window.fixture.failClear = false;});
  await panel.getByRole('button', {name: '清除已结束记录', exact: true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.tx-cu-download-panel li').length === 1);
  assert.equal(await panel.getByRole('alert').count(), 0);
  const box = await panel.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box));
  await page.emulateMedia({colorScheme: 'dark', reducedMotion: 'reduce'});
  if (output) await page.screenshot({path: join(output, 'late-download-dark.png')});
  await panel.getByLabel('搜索下载文件').press('Escape');
  await panel.waitFor({state: 'hidden'});
  assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  assert.deepEqual(errors, []);
});

test('setup distinguishes another legitimate instance, retains read failure and retries without automatic install', async t => {
  const {page, errors, output} = await frontendComponents(t, {width: 390, height: 820});
  await mount(page, `
    import React from 'react';import{createRoot}from'react-dom/client';import{ComputerSetup}from'./src/client/computer-setup.jsx';
    window.fixture={calls:[],fail:true};
    const setup={browser:{name:'Fixture browser',installed:true,path:'/owned/browser'},extension:{browsers:[],installation:{supported:true,superseded:true,prepared:false,updateAvailable:true,version:'1.5.0',extensionPath:'/owned/extension',browserProfile:'/owned/profile'}},native:{supported:true,installed:true,platform:'darwin',version:'0.1.1',accessibility:false,screenRecording:true}};
    const api=async(op,id,input)=>{window.fixture.calls.push({op,id,input});if(window.fixture.fail)throw Error('Fixture state read failed');return setup;};
    createRoot(document.getElementById('root')).render(<div className="tx-cu-pane"><ComputerSetup sessionId="fixture" visible api={api}/></div>);
  `);
  await page.getByRole('button', {name: '运行环境与权限', exact: true}).click();
  await page.getByRole('alert').filter({hasText: 'state read failed'}).waitFor();
  await page.evaluate(() => {window.fixture.fail = false;});
  await page.getByRole('button', {name: '重新检查', exact: true}).click();
  await page.getByText('Chrome 当前连接到另一套 Oh My DSH。需要在这里使用时，可手动切换到当前实例。', {exact: true}).waitFor();
  await page.getByRole('button', {name: '切换 Chrome 到当前实例', exact: true}).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  const calls = await page.evaluate(() => window.fixture.calls);
  assert.ok(calls.length >= 2);
  assert.equal(calls.some(call => call.input !== undefined), false, 'read/retry never installs or takes over');
  await page.locator('.tx-cu-setup-row').filter({hasText: '辅助功能'}).getByText('待开启', {exact: true}).waitFor();
  await page.locator('.tx-cu-setup-row').filter({hasText: '屏幕录制'}).getByText('已开启', {exact: true}).waitFor();
  assert.equal(await page.locator('.tx-cu-pane').evaluate(node => node.scrollWidth > node.clientWidth), false);
  if (output) await page.screenshot({path: join(output, 'setup-light.png')});
  await page.emulateMedia({colorScheme: 'dark'});
  assert.deepEqual(errors, []);
});

test('browser workbench preserves target identity and keyboard focus in narrow navigation and device controls', async t => {
  const {page, errors, output} = await frontendComponents(t, {width: 390, height: 820});
  await mount(page, `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BrowserControls}from'./src/client/browser-controls.jsx';
    const tabs=[{kind:'tab',id:'A',browserId:'browser',title:'First page',url:'https://a.example.invalid/',available:true},{kind:'tab',id:'B',browserId:'browser',title:'Second page',url:'https://b.example.invalid/',available:true}];
    window.fixture={calls:[]};
    function Harness(){const[state,setState]=useState({enabled:true,target:tabs[0],controlEpoch:4,status:'idle'}),[scale,setScale]=useState('1');const api=async(op,id,input)=>{window.fixture.calls.push({op,id,input});if(op==='tabs'&&!input)return{tabs};if(op==='downloads')return{downloads:[]};if(op==='view-tab')return{...state,target:tabs.find(tab=>tab.id===input.tabId)};return state;};return <div className="tx-cu-pane"><BrowserControls sessionId="fixture" visible state={state} frame={{tabId:state.target.id,actor:'fixture-actor',width:1280,height:800}} navigation={{tabId:state.target.id,url:state.target.url}} api={api} onState={setState} onError={text=>window.fixture.error=text} previewScale={scale} onPreviewScale={setScale}/></div>;}
    createRoot(document.getElementById('root')).render(<Harness/>);
  `);
  const first = page.getByRole('tab', {name: 'First page', exact: true});
  await first.waitFor(); await first.focus(); await first.press('ArrowRight');
  const second = page.getByRole('tab', {name: 'Second page', exact: true});
  await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent === 'Second page');
  assert.equal(await second.evaluate(node => node === document.activeElement), true);
  await page.getByLabel('浏览器地址').focus();
  await page.getByLabel('浏览器地址').press('Control+j');
  await page.getByRole('dialog', {name: '当前会话下载记录', exact: true}).waitFor();
  await page.getByRole('button', {name: '关闭下载记录', exact: true}).press('Escape');
  const options = page.getByRole('button', {name: '浏览器选项', exact: true});
  await options.focus(); await options.press('ArrowDown');
  await page.getByRole('menuitem', {name: '显示设备工具栏', exact: true}).click();
  await page.getByLabel('设备工具栏', {exact: true}).waitFor();
  await page.getByLabel('设备模拟', {exact: true}).click();
  await page.getByLabel('模拟触摸').selectOption('true');
  await page.getByRole('button', {name: '应用设备模拟', exact: true}).click();
  const emulation = await page.evaluate(() => window.fixture.calls.find(call => call.op === 'view-emulation'));
  assert.equal(emulation.input.tabId, 'B'); assert.equal(emulation.input.actor, 'fixture-actor'); assert.equal(emulation.input.settings.hasTouch, true);
  assert.equal(await page.locator('.tx-cu-pane').evaluate(node => node.scrollWidth > node.clientWidth), false);
  if (output) await page.screenshot({path: join(output, 'device-light.png')});
  await page.emulateMedia({colorScheme: 'dark', reducedMotion: 'reduce'});
  assert.deepEqual(errors, []);
});
