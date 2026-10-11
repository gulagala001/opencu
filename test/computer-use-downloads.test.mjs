import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';
import {startFixture} from './fixtures/computer-use/server.mjs';
import {extensionFixture} from './fixtures/computer-use/extension.mjs';
import {isolateTestDownloads,testBrowserExecutable} from './fixtures/computer-use/test-browser.mjs';
import {BrowserTransport} from '../src/computer-use/browser-transport.mjs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
const until=async fn=>{for(let i=0;i<150;i++){const value=await fn();if(value)return value;await delay(30);}throw Error('download state timed out');};

for(const backend of ['managed','extension'])test(backend+': real downloads deduplicate observers, retain ownership and report completed bytes',{timeout:20000},async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-downloads-')),fixture=await startFixture(),cleanup=[];
  await isolateTestDownloads(root);
  if(backend==='extension')await isolateTestDownloads(root,join(root,'extension-profile'));
  const external=backend==='extension'?await extensionFixture({after:fn=>cleanup.push(fn)},{fixture,profile:join(root,'extension-profile')}):null;
  const launcher=join(root,'browser'),quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  if(process.platform==='darwin')await writeFile(launcher,'#!/bin/sh\nexec '+quote(chromium.executablePath())+' --use-mock-keychain "$@"\n',{mode:0o700});
  const manager=new ComputerUseManager(root,{...(external?{extensionHub:external.hub}:{}),browser:process.platform==='darwin'?{executablePath:launcher}:{},native:{binary:join(root,'missing')}});
  t.after(async()=>{await manager.close();for(const close of cleanup)await close();await fixture.close();await rm(root,{recursive:true,force:true});});
  const tab=await manager.dispatch('test','createBrowserTab',[external?.browser.id??'browser',fixture.url]);
  const browser=manager.browserForTab(tab.id),record=await browser.target('test',tab.id);
  await until(()=>manager.browsingHistory.list('test').entries.some(entry=>entry.url===fixture.url+'/'));
  assert.deepEqual(manager.browsingHistory.list('foreign').entries,[]);
  let frame;const close=await manager.watchBrowser('test',tab.id,(event,value)=>{if(event==='frame')frame=value;},undefined,false,true);await until(()=>frame);
  const before=manager.status('test');
  await record.page.locator('#download').click();
  const items=await until(()=>{const items=manager.listDownloads('test');return items.length===1&&items[0].state==='completed'&&items;});
  assert.equal(items[0].filename,'fixture.txt');assert.equal(items[0].receivedBytes,29);assert.equal(items[0].totalBytes,29);assert.equal(items[0].path,undefined);assert.equal(items[0].url,undefined);
  assert.deepEqual(manager.listDownloads('foreign'),[]);assert.throws(()=>manager.downloadFile('foreign',items[0].id),/不属于/);assert.throws(()=>manager.downloadFile('test','../../etc/passwd'),/不属于/);
  if(backend==='managed'){
    await until(()=>manager.listDownloads('test')[0].canDownload);
    assert.equal(await readFile(manager.downloadFile('test',items[0].id).path,'utf8'),'TRISOUL_COMPUTER_USE_FIXTURE\n');
    const out=join(root,'delivered.txt');
    const saved=await manager.execute('test',`var downloadTab=await cua.getTab(${JSON.stringify(tab.id)}); var downloads=await downloadTab.downloads.list(); await downloadTab.downloads.save(downloads[0].id,${JSON.stringify(out)}); await downloadTab.downloads.save(downloads[0].id,${JSON.stringify(out)});`);
    assert.equal(saved.error,undefined,saved.error?.message);
    assert.deepEqual(saved.blocks.filter(block=>block.type==='file'),[{type:'file',path:out}]);
    assert.equal(await readFile(out,'utf8'),'TRISOUL_COMPUTER_USE_FIXTURE\n');
    const history=manager.session('test').history.filter(entry=>entry.operation==='downloads.save');
    assert.equal(history.length,2);assert.ok(history.every(entry=>entry.ok&&entry.artifactPath===out));
    const failed=await manager.execute('test',`await downloadTab.downloads.save('missing',${JSON.stringify(join(root,'missing.txt'))});`);
    assert.match(failed.error?.message,/Unknown download/);assert.equal(failed.blocks.some(block=>block.type==='file'),false);
    assert.equal(manager.session('test').history.at(-1).ok,false);assert.equal(manager.session('test').history.at(-1).artifactPath,undefined);
  }else assert.equal(items[0].canDownload,false,'extension reports the native download, without claiming host file access');
  assert.equal(manager.status('test').controlEpoch,before.controlEpoch);assert.equal(manager.status('test').target.id,before.target.id);
  browser.keepForUser('test',tab.id);await manager.endTurn('test');assert.equal(browser.owners.has(tab.id),false,'downloads after a completed model turn still belong to its explicit tab selection');
  await manager.viewsFor(tab).views.get(tab.id).record.page.locator('#download').click();await until(()=>manager.listDownloads('test').length===2);assert.notEqual(manager.listDownloads('test')[0].id,items[0].id,'separate downloads with the same filename remain distinct');
  await manager.stop('test');assert.equal(manager.listDownloads('test').length,2,'ending the model connection does not erase captured history');
  const ended=manager.listDownloads('test').filter(item=>item.state==='completed');
  const file=backend==='managed'?manager.downloadFile('test',items[0].id).path:null;
  manager.clearDownloads('test');assert.equal(manager.listDownloads('test').some(item=>ended.some(old=>old.id===item.id)),false);
  if(file)assert.equal(await readFile(file,'utf8'),'TRISOUL_COMPUTER_USE_FIXTURE\n','clearing a record never deletes its file');
  await close();
});

test('managed downloads keep controller defaults, observer order, target ownership and real saved bytes', {timeout:30000}, async t => {
  const root=await mkdtemp(join(tmpdir(),'opencu-download-delivery-')),fixture=await startFixture();
  await isolateTestDownloads(root);
  const manager=new ComputerUseManager(root,{browser:{executablePath:await testBrowserExecutable(root)},native:{binary:join(root,'missing')}});
  const commands=[],connections=[],send=BrowserTransport.prototype.send,connect=chromium.connectOverCDP;
  BrowserTransport.prototype.send=function(message){if(message.method==='Browser.setDownloadBehavior')commands.push({connection:this.source,...message.params});return send.call(this,message);};
  chromium.connectOverCDP=function(transport,options){connections.push({source:transport.source,noDefaults:options.noDefaults===true,artifactsDir:options.artifactsDir});return connect.call(this,transport,options);};
  t.after(async()=>{BrowserTransport.prototype.send=send;chromium.connectOverCDP=connect;await manager.close();await fixture.close();await rm(root,{recursive:true,force:true});});
  const assertPolicies=()=>{
    assert.ok(commands.length>0,'Chromium has an explicit managed download policy');
    for(const command of commands){assert.equal(command.behavior,'allowAndName');assert.equal(command.downloadPath,join(root,'browser-profile','downloads'));assert.equal(command.eventsEnabled,true);}
    for(const connection of connections)assert.equal(connection.artifactsDir,join(root,'browser-profile','downloads'),'all managed connections retain the same owned artifact directory');
  };
  const run=async code=>{const result=await manager.execute('test',code);assert.equal(result.error,undefined,result.error?.message);return result;};
  await run(`var tab=await cua.createBrowserTab('browser',${JSON.stringify(fixture.url)});`);
  const target=manager.status('test').target,controller=await manager.browser.connections.get('test');
  assertPolicies();assert.equal(connections.length,1);assert.equal(connections[0].noDefaults,false,'the controller retains native Playwright download objects');
  const delivery=async label=>{
    const out=join(root,label+'.txt');
    const result=await run(`var priorCount=(await tab.downloads.list()).length; await tab.playwright.locator('#download').click(); var observed=[]; for(var attempt=0;attempt<100&&observed.length<=priorCount;attempt++){observed=await tab.downloads.list();if(observed.length<=priorCount)await new Promise(resolve=>setTimeout(resolve,20));} await tab.downloads.save(observed.at(-1).id,${JSON.stringify(out)});`);
    assert.deepEqual(result.blocks.filter(block=>block.type==='file'),[{type:'file',path:out}]);
    assert.equal(manager.session('test').history.at(-1).artifactPath,out);
    assert.equal(await readFile(out,'utf8'),'TRISOUL_COMPUTER_USE_FIXTURE\n');
    await until(()=>manager.listDownloads('test').some(item=>item.canDownload&&item.tabId===target.id));
    return out;
  };
  await delivery('without-observer');
  let frame;
  const close=await manager.watchBrowser('test',target.id,(event,value)=>{if(event==='frame')frame=value;});await until(()=>frame);
  assertPolicies();assert.equal(connections.length,2);assert.equal(connections[1].noDefaults,true,'the preview leaves Playwright context defaults alone');
  assert.equal(await manager.browser.connections.get('test'),controller);
  assert.ok(frame.data.length>100,'the preview still captures actual image data');
  const withObserver=await delivery('with-observer');
  await close();assertPolicies();assert.equal(await manager.browser.connections.get('test'),controller,'closing the observer leaves the model connection alive');
  await delivery('closed-observer');
  manager.browser.keepForUser('test',target.id);await manager.stop('test');await manager.resume('test');
  assert.equal(controller.browser.isConnected(),false,'stop releases the model controller');
  assert.equal(manager.browser.connections.has('test'),false,'resume alone does not reclaim a browser controller');
  assert.equal(await readFile(withObserver,'utf8'),'TRISOUL_COMPUTER_USE_FIXTURE\n');
  const entries=manager.listDownloads('test');assert.ok(entries.every(item=>item.canDownload));
  manager.setTarget(manager.session('test'),target);
  const closeFirst=await manager.watchBrowser('test',target.id,()=>{});
  assertPolicies();assert.equal(connections.length,3);assert.equal(connections[2].noDefaults,true,'an observer created first still preserves Playwright context defaults');
  await run(`var tab=await cua.getTab(${JSON.stringify(target.id)});`);
  assertPolicies();assert.equal(connections.length,4);assert.equal(connections[3].noDefaults,false);
  assert.notEqual(await manager.browser.connections.get('test'),controller,'explicit target selection creates a fresh model controller');
  await delivery('observer-first');await closeFirst();
  assertPolicies();
  assert.deepEqual(manager.listDownloads('foreign'),[]);
  assert.throws(()=>manager.downloadFile('foreign',entries[0].id),/不属于/);
  const active=await manager.browser.target('test',target.id);
  const identities=await Promise.all([...active.downloads].map(async([id,download])=>({id,path:await download.path()})));
  const {id:staleId,path:stale}=identities[0];
  const staleEntry=manager.listDownloads('test').find(item=>manager.downloadFile('test',item.id).path===stale);await rm(stale);
  assert.equal(manager.listDownloads('test').find(item=>item.id===staleEntry.id).canDownload,false);
  assert.throws(()=>manager.downloadFile('test',staleEntry.id),/不可用/);
  const invalid=await manager.execute('test',`await tab.downloads.save(${JSON.stringify(staleId)},${JSON.stringify(join(root,'stale.txt'))});`);
  assert.ok(invalid.error);assert.equal(invalid.blocks.some(block=>block.type==='file'),false);
  assert.equal(manager.session('test').history.at(-1).artifactPath,undefined);
  if(process.env.OPENCU_DOWNLOAD_EVIDENCE){
    const bytes=await readFile(withObserver);
    await writeFile(process.env.OPENCU_DOWNLOAD_EVIDENCE,JSON.stringify({commands,connections,downloadDirectory:commands[0].downloadPath,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,phases:['without-observer','with-observer','closed-observer','observer-first'],history:manager.session('test').history.filter(entry=>entry.operation==='downloads.save')},null,2));
  }
});

test('real downloads preserve distinct same-name files across sessions and refuse failed, unwritable and cancelled delivery', {timeout:30000}, async t => {
  const root=await mkdtemp(join(tmpdir(),'opencu-download-failures-'));
  await isolateTestDownloads(root);
  const payloads={a:Buffer.from('FIRST_DOWNLOAD_BYTES\n'),b:Buffer.from('SECOND_DOWNLOAD_BYTES\n')};
  const server=createServer((req,res)=>{
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<a id="a" href="/a">A</a><a id="b" href="/b">B</a><a id="pending" href="/pending">Pending</a>');return;}
    res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="same-name.bin"',...(req.url==='/pending'?{'Content-Length':1000000}:{})});
    if(req.url==='/pending')res.write('PENDING_DOWNLOAD_BYTES');else res.end(payloads[req.url.slice(1)]);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const manager=new ComputerUseManager(root,{browser:{executablePath:await testBrowserExecutable(root)},native:{binary:join(root,'missing')}});
  t.after(async()=>{await manager.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const saved=[];
  for(const session of ['a','b']){
    const out=join(root,session+'.bin');
    const result=await manager.execute(session,`var tab=await cua.createBrowserTab('browser',${JSON.stringify(url)}); await tab.playwright.locator('#${session}').click(); var download; for(var i=0;i<100&&!download;i++){download=(await tab.downloads.list())[0];if(!download)await new Promise(resolve=>setTimeout(resolve,20));} await tab.downloads.save(download.id,${JSON.stringify(out)});`);
    assert.equal(result.error,undefined,result.error?.message);assert.deepEqual(await readFile(out),payloads[session]);
    assert.deepEqual(result.blocks.filter(block=>block.type==='file'),[{type:'file',path:out}]);saved.push(out);
    await until(()=>manager.listDownloads(session).some(item=>item.canDownload));
  }
  assert.notEqual(manager.listDownloads('a')[0].id,manager.listDownloads('b')[0].id);
  assert.notEqual(manager.listDownloads('a')[0].tabId,manager.listDownloads('b')[0].tabId);
  assert.deepEqual(await readFile(manager.downloadFile('a',manager.listDownloads('a')[0].id).path),payloads.a);
  assert.deepEqual(await readFile(manager.downloadFile('b',manager.listDownloads('b')[0].id).path),payloads.b);
  assert.throws(()=>manager.downloadFile('a',manager.listDownloads('b')[0].id),/不属于/);
  const targetA=manager.status('a').target,recordA=await manager.browser.target('a',targetA.id);
  const recordB=await manager.browser.target('b',manager.status('b').target.id);
  const foreignId=[...recordB.downloads.keys()][0];
  const foreign=await manager.execute('a',`await tab.downloads.save(${JSON.stringify(foreignId)},${JSON.stringify(join(root,'foreign.bin'))});`);
  assert.match(foreign.error?.message,/Unknown download/);assert.equal(foreign.blocks.some(block=>block.type==='file'),false);
  const unwritable=await manager.execute('a',`await tab.downloads.save(download.id,${JSON.stringify(root)});`);
  assert.ok(unwritable.error);assert.equal(unwritable.blocks.some(block=>block.type==='file'),false);assert.equal(manager.session('a').history.at(-1).artifactPath,undefined);
  if(process.platform!=='win32'){
    const readonly=join(root,'readonly');await mkdir(readonly,{mode:0o500});
    try{
      const denied=await manager.execute('a',`await tab.downloads.save(download.id,${JSON.stringify(join(readonly,'denied.bin'))});`);
      assert.match(denied.error?.message,/EACCES|permission denied/i);assert.equal(denied.blocks.some(block=>block.type==='file'),false);
      assert.equal(manager.session('a').history.at(-1).artifactPath,undefined);
    }finally{await chmod(readonly,0o700);}
  }
  for(const mode of ['failed','cancelled']){
    const [download]=await Promise.all([recordA.page.waitForEvent('download'),recordA.page.locator('#pending').click()]);
    const id=[...recordA.downloads].find(([,value])=>value===download)[0],out=join(root,mode+'.bin');
    if(mode==='failed')await download.cancel();
    const controller=new AbortController(),pending=manager.execute('a',`await tab.downloads.save(${JSON.stringify(id)},${JSON.stringify(out)});`,{signal:controller.signal});
    if(mode==='cancelled'){await until(()=>manager.session('a').operation==='downloads.save');controller.abort(new Error('cancel native download fixture'));}
    const result=await pending;
    assert.ok(result.error);assert.match(result.error.message,mode==='failed'?/cancel/i:/cancel native download fixture/);
    assert.equal(result.blocks.some(block=>block.type==='file'),false);
    const history=manager.session('a').history.at(-1);assert.equal(history.ok,false);assert.equal(history.artifactPath,undefined);
    await assert.rejects(readFile(out),error=>error.code==='ENOENT');
  }
  for(let i=0;i<saved.length;i++)assert.deepEqual(await readFile(saved[i]),payloads[['a','b'][i]],'explicit saved files survive another session being cancelled');
});

test('a save completing after abort never records a successful download artifact', async t => {
  const root=await mkdtemp(join(tmpdir(),'opencu-download-race-'));
  const manager=new ComputerUseManager(root,{native:{binary:join(root,'missing')}}),out=join(root,'late.txt');
  t.after(async()=>{await manager.close();await rm(root,{recursive:true,force:true});});
  let entered,release;
  const ready=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{release=resolve;});
  manager.browser.target=async()=>({});
  manager.browser.invoke=async()=>{await writeFile(out,'REAL_SAVED_BYTES');entered();await held;return{path:out,filename:'late.txt'};};
  const controller=new AbortController();
  const result=manager.dispatch('test','target',[{kind:'tab',id:'race-tab',browserId:'browser'},'downloads.save',['observed',out]],controller.signal);
  const rejected=assert.rejects(result,/save fixture aborted/);
  await ready;controller.abort(new Error('save fixture aborted'));release();await rejected;
  const history=manager.session('test').history.at(-1);
  assert.equal(history.ok,false);assert.equal(history.artifactPath,undefined);
  assert.equal(await readFile(out,'utf8'),'REAL_SAVED_BYTES','an actual file does not make an aborted operation successful');
});
