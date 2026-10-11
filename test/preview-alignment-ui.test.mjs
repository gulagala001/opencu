import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {frontendComponents} from './fixtures/frontend-components.mjs';

const buildHarness = contents => build({bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents}});

test('app preview reveals the exact window while zoom, hiding and stopped observation stay independent', async t => {
  const {page,errors}=await frontendComponents(t);
  const {outputFiles}=await buildHarness(`
    import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';import{FloatingPreview}from'./src/client/floating-preview.jsx';
    window.calls=[];window.streams=[];window.EventSource=class{constructor(url){this.url=url;this.handlers={};window.streams.push(this);}addEventListener(name,fn){this.handlers[name]=fn;}close(){this.closed=true;}};
    const targets=[{kind:'app',id:'app.one',viewId:'window-one',name:'文稿'},{kind:'app',id:'app.two',viewId:'window-two',name:'表格'}];
    function Harness(){const anchor=useRef(null),[state,setState]=useState({enabled:true,status:'stopped',target:targets[0],previewTargets:targets,controlEpoch:7});window.setFixtureState=patch=>setState(value=>({...value,...patch}));const api=(op,id,input)=>{window.calls.push({op,id,input});return new Promise((resolve,reject)=>{window.resolveAction=()=>resolve(state);window.rejectAction=()=>reject(new Error('窗口暂时不可用'));});};return <div ref={anchor} className="tx-cu-chip"><FloatingPreview sessionId="apps" state={state} onState={setState} anchor={anchor} api={api} url={()=>'/synthetic-stream'} onError={error=>window.fixtureError=error}/></div>;}createRoot(document.getElementById('root')).render(<Harness/>);
  `);
  await page.addStyleTag({content:await readFile(new URL('../src/client/computer-use.css',import.meta.url),'utf8')});
  await page.addScriptTag({content:outputFiles[0].text});
  const preview=page.getByLabel('悬浮操控预览');await preview.waitFor();
  await preview.getByRole('button',{name:'打开应用窗口：文稿',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.calls),[{op:'reveal-preview',id:'apps',input:{targetId:'window-one',controlEpoch:7}}]);
  assert.equal(await preview.getByRole('button',{name:'打开应用窗口：文稿',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.rejectAction());await preview.getByText('窗口暂时不可用',{exact:true}).waitFor();
  assert.equal(await preview.isVisible(),true,'a reveal error does not hide the observed window');
  await preview.getByRole('button',{name:'放大预览',exact:true}).click();
  assert.equal(await preview.evaluate(node=>node.classList.contains('is-zoomed')),true);
  assert.equal(await page.evaluate(()=>window.calls.length),1,'explicit zoom does not acquire control or reveal a window');
  await preview.getByRole('button',{name:'缩小预览',exact:true}).click();
  await preview.getByRole('button',{name:'打开应用窗口：文稿',exact:true}).click();await page.evaluate(()=>window.resolveAction());
  await preview.getByText('窗口暂时不可用',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await preview.getByRole('button',{name:'从预览恢复助手',exact:true}).isVisible(),true,'revealing does not resume stopped control');
  await preview.getByRole('button',{name:'展开 2',exact:true}).click();
  await preview.getByRole('button',{name:'置于最前：表格',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.calls.length),2,'a back card only changes the observed front');
  await preview.getByRole('button',{name:'关闭操控预览',exact:true}).click();await preview.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.streams.every(stream=>stream.closed)),true);
  await page.evaluate(()=>window.setFixtureState({target:{kind:'app',id:'app.two',viewId:'window-two',name:'表格'}}));
  assert.equal(await preview.count(),0,'switching assistant targets respects a manually hidden preview');
  await page.getByRole('button',{name:'悬浮预览',exact:true}).click();await preview.waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls.map(call=>call.op)),['reveal-preview','reveal-preview']);
  assert.deepEqual(errors,[]);
});
