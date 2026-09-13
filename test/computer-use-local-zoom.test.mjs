import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import sharp from 'sharp';
import{ComputerUseManager}from'../src/computer-use/manager.mjs';import{startFixture}from'./fixtures/computer-use/server.mjs';import{testBrowserExecutable}from'./fixtures/computer-use/test-browser.mjs';import{extensionFixture}from'./fixtures/computer-use/extension.mjs';
import { largestColorRegion, seededColorRegion } from './fixtures/computer-use/color-region.mjs';
for(const backend of ['managed','extension'])test(backend+': local threefold zoom, nested scrolling, visual drag and restored iframe editing',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
 const root=await mkdtemp(join(tmpdir(),'opencu-local-zoom-')),fixture=await startFixture();t.after(()=>fixture.close());
 const external=backend==='extension'?await extensionFixture(t,{fixture}):null;
 const manager=new ComputerUseManager(root,{browser:{executablePath:await testBrowserExecutable(root)},...(external?{extensionHub:external.hub}:{}),native:{binary:join(root,'missing')}});t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
 const run=async(code,options)=>{const r=await manager.execute('test',code,options);assert.equal(r.error,undefined,r.error?.message);return r;};
 await run(`var tab=await cua.createBrowserTab(${JSON.stringify(external?.browser.id??'browser')},${JSON.stringify(fixture.url+'/zoom-workbench')});`);
 await run("await tab.viewport.set({width:704,height:734}); await tab.playwright.getByRole('button',{name:'放大细节 3×',exact:true}).click(); await tab.getScreenshot();");
 const target=manager.status('test').target,record=await manager.browserForTab(target.id).target('test',target.id);
 const observe=()=>record.page.evaluate(()=>({ ...zoomFixture,outerScroll:scrollY,outerScrollX:scrollX,innerScroll:document.querySelector('#view').scrollTop,innerScrollX:document.querySelector('#view').scrollLeft,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),view:document.querySelector('#view').getBoundingClientRect().toJSON() }));
 const evidence={backend},artifact=process.env.TRISOUL_CU_UI_ARTIFACTS?join(process.cwd(),'cu-artifacts',`local-zoom-${backend}-${Date.now()}`):null;
 const save=async()=>{if(artifact){await mkdir(artifact,{recursive:true});await writeFile(join(artifact,'evidence.json'),JSON.stringify(evidence,null,2));}};
 assert.equal(await record.page.evaluate(()=>zoomFixture.zoom),3);
 await run("await tab.scroll([430,365],'down',0.12);");
 const image=(await run('await tab.getScreenshot();')).blocks.find(b=>b.type==='image');
 evidence.capture=image.capture;evidence.before=await observe();evidence.candidates={};
 if(artifact){await save();await writeFile(join(artifact,'screenshot.png'),Buffer.from(image.data,'base64'));t.diagnostic('Local zoom evidence: '+artifact);}
 const pixels=await sharp(Buffer.from(image.data,'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const center=async(name,predicate)=>{const region=name==='drop'?seededColorRegion(pixels,predicate,[32,102,216]):largestColorRegion(pixels,predicate);evidence.candidates[name]=region;await save();assert.ok(region.n>100,JSON.stringify(evidence));return region.centroid;};
 const red=await center('red',(r,g,b)=>r>150&&g<100&&b<140),blue=await center('blue',(r,g,b,x)=>r<80&&g>70&&g<150&&b>150&&x<pixels.info.width/2),drop=await center('drop',(r,g,b,x)=>r<80&&g>70&&g<150&&b>150&&x>pixels.info.width/2);
 const frames=new Map([[JSON.stringify(['tab',target.browserId,target.id]),{...image.capture,previewWidth:pixels.info.width,previewHeight:pixels.info.height}]]);
 try{await run(`await tab.click(${JSON.stringify(red)}); await tab.drag(${JSON.stringify(blue)},${JSON.stringify(drop)}); await tab.getAXState();`,{coordinateFrames:frames});}
 finally{evidence.after=await observe();await save();}
 const state=evidence.after,diagnostic=JSON.stringify({points:{red,blue,drop},before:evidence.before,after:state});
 assert.deepEqual({redHit:state.redHit,dragComplete:state.dragComplete,wrongHits:state.wrongHits},{redHit:true,dragComplete:true,wrongHits:0},diagnostic);assert.equal(state.outerScroll,0,diagnostic);assert.ok(state.innerScroll>230,diagnostic);
 await run("await tab.playwright.getByRole('button',{name:'恢复全图',exact:true}).click(); await tab.playwright.frameLocator('iframe[title=\"放大后填写\"]').getByRole('textbox',{name:'框架备注'}).fill('放大后恢复 中文🌿'); await tab.playwright.frameLocator('iframe[title=\"放大后填写\"]').getByRole('button',{name:'保存框架备注'}).click();");
 assert.equal(await record.page.frameLocator('iframe').locator('output').textContent(),'放大后恢复 中文🌿');assert.equal(await record.page.evaluate(()=>zoomFixture.zoom),1);
});
