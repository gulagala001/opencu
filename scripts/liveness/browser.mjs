import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {bounded,ok} from './scheduler.mjs';

export async function verifyBrowser({root,parent,signal}) {
  const load=file=>import(pathToFileURL(join(root,file)));
  const [{withIsolatedBrowser},{createPluginRuntime},{createComputerSession}]=await Promise.all([
    load('src/browser/automation.mjs'),load('src/dsh/runtime.mjs'),load('src/dsh/computer.mjs')]);
  const directory=await fs.mkdtemp(join(parent,'chromium-'));
  const server=createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end(`<!doctype html><title>CU human intervention fixture</title>
    <label>Human editor<input id="editor"></label><button id="count" onclick="out.textContent=++window.count">Count</button><output id="out">0</output>
    <button id="dialog" onclick="alert('Human opened dialog')">Dialog</button><div style="height:1800px">Scroll area</div><script>window.count=0;</script>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const checkpoints=[];let report;
  try {
    await withIsolatedBrowser(async({context})=>{
      const runtime=createPluginRuntime({dataDir:join(directory,'state'),browserOptions:{context},nativeEnabled:false,extensionEnabled:false});
      const attachments={saveImage:async({data,mediaType,name})=>({attachmentId:'sha256:'+createHash('sha256').update(data).digest('hex'),mediaType,name})};
      let computer;
      const create=()=>createComputerSession((method,args)=>runtime.request(method,args,{sessionKey:'synthetic-human-verification',attachments,signal:['stop','interrupt'].includes(method)?undefined:computer.signal}));
      computer=create();const run=code=>bounded(computer.run({code,timeoutMs:10000},signal),'real browser cell',15000);
      const state=async()=>{const value=await runtime.request('state');assert.equal(value.state.mode,'active');assert.equal(value.state.explicitlyStopped,false);return value;};
      try {
        await run('await cua.getState();');
        await run(`var tab=await cua.createBrowserTab('browser:local',${JSON.stringify(origin+'/main')});`);
        const page=context.pages().find(page=>page.url()===origin+'/main');assert.ok(page);
        await run("await tab.playwright.getByRole('button',{name:'Count',exact:true}).click();");
        assert.equal(await page.locator('output').textContent(),'1');checkpoints.push('initial-input');
        await page.locator('#editor').click();await page.keyboard.type('human text');
        await run('await tab.getAXState();');await state();
        await run("await tab.playwright.getByRole('button',{name:'Count',exact:true}).click();");
        assert.equal(await page.locator('#editor').inputValue(),'human text');assert.equal(await page.locator('output').textContent(),'2');checkpoints.push('human-typing-preserved');
        await run('await tab.getScreenshot();');await page.setViewportSize({width:1000,height:700});
        await assert.rejects(run('await tab.click([10,10]);'),error=>{assert.equal(error.code,'STALE_SCREENSHOT');assert.equal(error.details.inputDispatched,false);return true;});
        await state();await run('await tab.getAXState();');checkpoints.push('resize-refresh-without-stop');
        await page.mouse.wheel(0,500);await run('await tab.getAXState();');
        await run("await tab.playwright.getByRole('button',{name:'Count',exact:true}).click();");await state();checkpoints.push('human-scroll-continue');
        await run('await tab.getScreenshot();');await page.goto(origin+'/navigated');
        await assert.rejects(run('await tab.click([10,10]);'));
        await run('await tab.getAXState();');await state();
        await run("await tab.playwright.getByRole('button',{name:'Count',exact:true}).click();");assert.equal(await page.locator('output').textContent(),'1');checkpoints.push('human-navigation-continue');
        await run(`var peer=await cua.createBrowserTab('browser:local',${JSON.stringify(origin+'/peer')});`);
        const peer=context.pages().find(page=>page.url()===origin+'/peer');await peer.bringToFront();
        await run('await tab.getAXState();');await state();checkpoints.push('human-focus-switch');
        page.once('dialog',dialog=>dialog.dismiss());await page.locator('#dialog').click();
        await run('await tab.getAXState();');await state();checkpoints.push('human-dialog-close');
        await page.close();await assert.rejects(run('await tab.getAXState();'));
        await run("await peer.playwright.getByRole('button',{name:'Count',exact:true}).click();");assert.equal(await peer.locator('output').textContent(),'1');await state();checkpoints.push('human-closes-one-target-peer-continues');
        const peerId=(await runtime.request('state')).state.activeTargetId;
        await computer.reset();await state();
        await run(`var peer=await cua.getTab(${JSON.stringify(peerId)});`);
        await run("await peer.playwright.getByRole('button',{name:'Count',exact:true}).click();");
        await computer.close();computer=create();await run(`var peer=await cua.getTab(${JSON.stringify(peerId)});`);
        await run("await peer.playwright.getByRole('button',{name:'Count',exact:true}).click();");
        assert.equal(await peer.locator('output').textContent(),'3');await state();checkpoints.push('reset-and-next-session');
        await run('await cua.stop();');await assert.rejects(run("await peer.playwright.getByRole('button',{name:'Count',exact:true}).click();"));
        await run(`await cua.resume(${JSON.stringify(peerId)});await peer.getAXState();`);
        await run("await peer.playwright.getByRole('button',{name:'Count',exact:true}).click();");assert.equal(await peer.locator('output').textContent(),'4');checkpoints.push('explicit-stop-and-explicit-continuation');
        report={ok:true,checkpoints,engine:'real isolated Chromium, actual backend/runtime/worker',nativeHardware:'not exercised'};
      } finally {
        const failures=[];
        try{await bounded(computer.close(),'browser worker cleanup',15000);}catch(error){failures.push(error);}
        try{await bounded(runtime.close(),'browser runtime cleanup',15000);}catch(error){failures.push(error);}
        if(failures.length)throw new AggregateError(failures,'Browser verification cleanup failed: '+failures.map(error=>error.message).join('; '));
      }
    },{directory,timeoutMs:120000,signal});
  } catch(error){report={ok:false,checkpoints,error:{code:error.code??error.name,message:error.message,stack:error.stack}};}
  finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(directory,{recursive:true,force:true});}
  return report;
}
