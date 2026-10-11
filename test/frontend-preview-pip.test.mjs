import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {frontendComponents} from './fixtures/frontend-components.mjs';

test('real document PiP synchronizes manual effects in both directions and returns focus on close',async t=>{
 const {page,context,output,errors}=await frontendComponents(t);
 await page.emulateMedia({reducedMotion:'no-preference'});
 const {outputFiles}=await build({bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';import{FloatingPreview}from'./src/client/floating-preview.jsx';
 window.EventSource=class{addEventListener(){}close(){}};
 function Harness(){const anchor=useRef(null),[state,setState]=useState({enabled:true,status:'idle',target:{kind:'tab',id:'owned',title:'Owned PiP fixture'},previewTargets:[{kind:'tab',id:'owned',title:'Owned PiP fixture'}]});return <div ref={anchor} className="tx-cu-chip"><FloatingPreview sessionId="owned-pip" state={state} onState={setState} anchor={anchor} api={async()=>state} url={()=>'/synthetic-stream'} onError={error=>window.fixtureError=error}/></div>;}
 createRoot(document.getElementById('root')).render(<Harness/>);`}});
 await page.addScriptTag({content:outputFiles[0].text});await page.getByLabel('悬浮操控预览').waitFor();
 assert.equal(await page.evaluate(()=>!!window.documentPictureInPicture),true,'owned CFT provides the actual document PiP API');
 await page.getByRole('button',{name:'弹出预览',exact:true}).click();
 await page.waitForFunction(()=>!!window.documentPictureInPicture.window?.document.querySelector('.tx-cu-floating'));
 await page.evaluate(()=>{const popup=window.documentPictureInPicture.window;const loading=popup.document.createElement('div');loading.className='tx-cu-loading';const cursor=popup.document.createElement('span');cursor.className='tx-cu-cursor-pulse';const root=popup.document.querySelector('.tx-cu-floating');root.append(loading,cursor);});
 const state=()=>page.evaluate(()=>{const popup=window.documentPictureInPicture.window,html=popup.document.documentElement;return{actualWindow:popup!==window,title:popup.document.title,previewHeaderMinHeight:popup.getComputedStyle(popup.document.querySelector('.tx-cu-native-preview > .tx-cu-live-meta')).minHeight,flag:html.hasAttribute('data-omd-reduce-effects'),loading:popup.getComputedStyle(popup.document.querySelector('.tx-cu-loading'),'::before').animationName,cursor:popup.getComputedStyle(popup.document.querySelector('.tx-cu-cursor-pulse')).animationName};});
 const normal=await state();assert.equal(normal.actualWindow,true);assert.equal(normal.flag,false);assert.equal(normal.loading,'tx-cu-loading');
 assert.equal(normal.previewHeaderMinHeight,'34px','the actual PiP document applies the separate preview alignment stylesheet');assert.equal(normal.title,'Owned PiP fixture · Oh My DSH');
 await page.locator('html').evaluate(node=>node.setAttribute('data-omd-reduce-effects',''));await page.waitForFunction(()=>window.documentPictureInPicture.window.document.documentElement.hasAttribute('data-omd-reduce-effects'));const reduced=await state();assert.equal(reduced.loading,'none');assert.equal(reduced.cursor,'none');
 await page.locator('html').evaluate(node=>node.removeAttribute('data-omd-reduce-effects'));await page.waitForFunction(()=>!window.documentPictureInPicture.window.document.documentElement.hasAttribute('data-omd-reduce-effects'));const restored=await state();assert.deepEqual(restored,normal);
 await page.evaluate(()=>window.documentPictureInPicture.window.close());await page.waitForFunction(()=>!window.documentPictureInPicture.window);await page.getByLabel('悬浮操控预览').waitFor();await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='悬浮预览');assert.deepEqual(errors,[]);
 if(output)await writeFile(join(output,'actual-pip.json'),JSON.stringify({normal,reduced,restored,actualPopupClosed:true,focusReturned:true,transport:'explicit synthetic EventSource; actual native Chrome document PiP'},null,2));
});
