import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import {frontendComponents, componentHostPrimitives} from './fixtures/frontend-components.mjs';

test('workspace tabs preserve browser identity and an unsent address without taking control', async t => {
  const {page, errors, output} = await frontendComponents(t, {width: 390, height: 820});
  const {outputFiles} = await build({plugins: [await componentHostPrimitives()], bundle: true, write: false, platform: 'browser', format: 'iife', loader: {'.css': 'text'}, define: {'process.env.NODE_ENV': '"production"'}, stdin: {resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BrowserControls}from'./src/client/browser-controls.jsx';
    const tabs=[{kind:'tab',id:'A',browserId:'browser',title:'同名页面',url:'http://a.example.invalid/page',available:true},{kind:'tab',id:'B',browserId:'chrome:owned-profile',title:'同名页面',url:'https://b.example.invalid/actual?q=1',available:true}];
    window.fixture={calls:[],copied:[]};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.fixture.copied.push(text)}});
    function Harness(){const[state,setState]=useState({enabled:true,target:tabs[0],controlEpoch:9,status:'running'});const current=state.viewTarget??state.target;
      const api=async(op,id,input)=>{window.fixture.calls.push({op,id,input});if(op==='tabs'&&!input)return{tabs};if(op==='downloads')return{downloads:[]};if(op==='view-tab')return{...state,viewTarget:tabs.find(tab=>tab.id===input.tabId)};if(op==='browser-history')return{entries:[{id:'visit',title:'原浏览器记录',url:tabs[1].url,browserId:tabs[1].browserId,visitedAt:Date.now()},{id:'invalid-date',title:'时间异常的旧记录',url:'https://old.example.invalid/',browserId:'browser',visitedAt:1e100}]};return state;};
      return <div className="tx-cu-pane tx-cu-pane-browser"><BrowserControls renderTabs={tabs=>tabs} sessionId="fixture" visible state={state} frame={{tabId:current.id,actor:'observer-'+current.id,width:1280,height:800}} navigation={{tabId:current.id,url:current.url,canGoBack:true}} api={api} onState={setState} onError={text=>window.fixture.error=text}/></div>;
    }createRoot(document.getElementById('root')).render(<Harness/>);
  `}});
  await page.setContent('<style>:root{color-scheme:light dark}body{margin:0;background:Canvas;color:CanvasText}.tx-cu-pane{box-sizing:border-box;width:100%;height:820px}</style><div id="root"></div>');
  await page.addStyleTag({content: await readFile(new URL('../src/client/computer-use.css', import.meta.url), 'utf8')});
  await page.addScriptTag({content: outputFiles[0].text});
  const tabs = page.getByRole('tab', {name: '同名页面', exact: true});
  await tabs.nth(1).waitFor();
  assert.match(await tabs.nth(0).getAttribute('title'), /内置浏览器/);
  assert.match(await tabs.nth(1).getAttribute('title'), /Chrome.*\n.*chrome:owned-profile/s);
  await tabs.nth(1).click();
  await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.dataset.tabId === 'B');
  assert.match(await tabs.nth(1).getAttribute('title'), /chrome:owned-profile/, 'the selected viewed tab retains its browser identity');
  const address = page.getByLabel('浏览器地址', {exact: true});
  await address.fill('https://unsent.example.invalid/');
  assert.equal(await address.inputValue(), 'https://unsent.example.invalid/');
  assert.equal(await page.evaluate(() => window.fixture.calls.some(call => ['stop','resume','navigate','input'].includes(call.op))), false,
    'switching the viewed tab and editing an unsent address cannot retarget the assistant');
  assert.deepEqual(errors, []);
});
