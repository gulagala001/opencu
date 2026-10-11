import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {frontendComponents} from './fixtures/frontend-components.mjs';

test('manual reduced effects covers CU motion and backdrop, restores defaults and preserves other surfaces',async t=>{
 const {page,output,errors}=await frontendComponents(t);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.setContent('<style>@keyframes foreign-spin{to{transform:rotate(360deg)}}.foreign-surface{animation:foreign-spin 2s linear infinite}</style><div class="tx-cu-pane"><div class="tx-cu-loading"></div><span class="tx-cu-tab-loading"></span><span class="tx-cu-assistant-cursor"></span><span class="tx-cu-cursor-pulse"></span><button>CU control</button></div><div class="tx-cu-group"><span class="tx-cu-disclosure">Disclosure</span></div><div class="foreign-surface">Other plugin</div><dialog class="tx-cu-share-dialog">Owned CU dialog</dialog>');
 await page.addStyleTag({content:await readFile(new URL('../src/client/computer-use.css',import.meta.url),'utf8')});
 await page.locator('dialog').evaluate(node=>node.showModal());
 const state=()=>page.evaluate(()=>({osReduce:matchMedia('(prefers-reduced-motion:reduce)').matches,loading:getComputedStyle(document.querySelector('.tx-cu-loading'),'::before').animationName,tab:getComputedStyle(document.querySelector('.tx-cu-tab-loading')).animationName,cursor:getComputedStyle(document.querySelector('.tx-cu-cursor-pulse')).animationName,cursorTransition:getComputedStyle(document.querySelector('.tx-cu-assistant-cursor')).transitionDuration,buttonTransition:getComputedStyle(document.querySelector('.tx-cu-pane button')).transitionDuration,groupTransition:getComputedStyle(document.querySelector('.tx-cu-group .tx-cu-disclosure')).transitionDuration,backdrop:getComputedStyle(document.querySelector('dialog'),'::backdrop').backdropFilter,foreign:getComputedStyle(document.querySelector('.foreign-surface')).animationName}));
 const normal=await state();assert.equal(normal.osReduce,false);assert.equal(normal.loading,'tx-cu-loading');assert.equal(normal.cursor,'tx-cu-cursor-click');assert.match(normal.backdrop,/blur/);
 await page.locator('html').evaluate(node=>node.setAttribute('data-omd-reduce-effects',''));const manual=await state();
 if(output)await writeFile(join(output,'actual-css.json'),JSON.stringify({normal,manual},null,2));
 for(const key of ['loading','tab','cursor'])assert.equal(manual[key],'none',key+' manual reduction');assert.equal(manual.cursorTransition,'0s');assert.equal(manual.buttonTransition,'0s');assert.equal(manual.groupTransition,'0s');assert.equal(manual.backdrop,'none');assert.equal(manual.foreign,'foreign-spin');
 await page.locator('html').evaluate(node=>node.removeAttribute('data-omd-reduce-effects'));const restored=await state();assert.deepEqual(restored,normal);
 await page.emulateMedia({reducedMotion:'reduce'});const os=await state();for(const key of ['loading','tab','cursor'])assert.equal(os[key],'none',key+' OS reduction');
 if(output)await writeFile(join(output,'actual-css.json'),JSON.stringify({normal,manual,restored,os},null,2));assert.deepEqual(errors,[]);
});
