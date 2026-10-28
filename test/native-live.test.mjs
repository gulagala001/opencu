import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNativeBackend} from '../src/native/backend.mjs';
import {createController} from '../src/core/controller.mjs';

const exec=promisify(execFile),root=fileURLToPath(new URL('..',import.meta.url));
const bounded=async(work,ms=10000)=>{let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native live verification deadline exceeded')),ms);})]);}finally{clearTimeout(timer);}};
const ok=result=>{assert.equal(result?.ok,true,JSON.stringify(result));return result;};

test('macOS real native input survives human intervention, cancellation and restart',
  {skip:process.platform!=='darwin'&&'requires macOS native UI',timeout:180000},async()=>{
  const parent=join(root,'.local');await fs.mkdir(parent,{recursive:true});
  const directory=await fs.mkdtemp(join(parent,'native-live-'));
  let child,controller,backend,closed=false,stderr='';const pending=new Map();let sequence=0;
  try{
    const bundle=join(directory,'OpenCU Native Fixture.app'),executable=join(bundle,'Contents/MacOS/native-live');
    await fs.mkdir(join(bundle,'Contents/MacOS'),{recursive:true});
    await fs.writeFile(join(bundle,'Contents/Info.plist'),'<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>ai.opencu.verification-fixture</string><key>CFBundleName</key><string>OpenCU Native Fixture</string><key>CFBundleExecutable</key><string>native-live</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>');
    const {stdout}=await exec('/usr/bin/xcrun',['--find','swiftc']);
    const include=resolve(stdout.trim(),'../../include/swift'),args=['swiftc'];
    const maps=await Promise.all(['module.modulemap','bridging.modulemap'].map(name=>fs.readFile(join(include,name),'utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;})));
    if(maps.every(map=>/module SwiftBridging/.test(map))){
      const empty=join(directory,'empty.modulemap'),overlay=join(directory,'overlay.json');
      await fs.writeFile(empty,'// Compilation-only duplicate module map.\n');
      await fs.writeFile(overlay,JSON.stringify({version:0,roots:[{type:'file',name:join(include,'module.modulemap'),'external-contents':empty}]}));
      args.push('-vfsoverlay',overlay,'-Xcc','-ivfsoverlay','-Xcc',overlay);
    }
    await exec('/usr/bin/xcrun',[...args,'-framework','AppKit','-framework','ApplicationServices',join(root,'test/fixtures/native-live.swift'),'-o',executable],{timeout:120000});
    let readyResolve,readyReject;
    const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
    child=spawn(executable,[],{stdio:['pipe','pipe','pipe']});
    child.stderr.on('data',data=>{stderr=(stderr+data).slice(-6000);});
    child.once('error',readyReject);
    child.once('exit',()=>{closed=true;readyReject(Error('Native fixture exited: '+stderr));for(const task of pending.values())task.reject(Error('Native fixture exited: '+stderr));pending.clear();});
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{const value=JSON.parse(line);if(value.ready)readyResolve(value.state);else {const task=pending.get(value.id);pending.delete(value.id);task?.resolve(value.state);}});
    const call=command=>bounded(new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,...command})+'\n');}));
    const initial=await bounded(ready);assert.equal(initial.shiftHeld,false,'Do not acquire a key the user is holding');
    const dataDir=join(directory,'controller');
    const start=async()=>{
      // A lost presentation receiver must not delay native hardware release.
      backend=await createNativeBackend({dataDir,onCursor:()=>new Promise(()=>{})});
      const permissions=await backend.permissions();
      assert.equal(permissions.accessibility,true,'Native live verification requires existing Accessibility permission; it does not prompt or change TCC');
      assert.equal(permissions.postEvents,true,'Native live verification requires existing input permission');
      assert.equal(permissions.screenCapture,true,'Native live verification requires existing screenshot permission');
      controller=await createController({dataDir,browser:false,native:backend});
      const target=ok(await controller.listTargets()).targets.find(value=>value.pid===initial.pid&&value.windowId===initial.windowId);
      assert.ok(target,'The isolated fixture window must be enumerated');
      ok(await controller.selectTarget({id:target.id}));
      const state=ok(await controller.getState()).state;
      if(state.mode!=='active')ok(await controller.resume({targetId:target.id}));
      return target;
    };
    let target=await start();
    ok(await controller.observe({targetId:target.id,format:'both'}));
    ok(await controller.act({targetId:target.id,action:'type',text:'AI-before',inputMode:'background'}));
    assert.match((await call({command:'state'})).text,/AI-before/);
    // Application-side edits and a controller activity notification model an
    // external intervention. Physical device event attribution is a separate OS boundary.
    await call({command:'externalEdit',text:'human-kept:'});await call({command:'resize'});
    ok(await controller.notifyUserActivity({targetId:target.id,kind:'input',sequence:1}));
    assert.equal(ok(await controller.getState()).state.mode,'active');
    ok(await controller.observe({targetId:target.id,format:'both'}));
    await call({command:'focus'});
    ok(await controller.act({targetId:target.id,action:'type',text:'AI-after',inputMode:'background'}));
    assert.equal((await call({command:'state'})).text,'human-kept:AI-after');
    ok(await controller.act({targetId:target.id,action:'keyDown',key:'Shift',inputMode:'foreground'}));
    assert.equal((await call({command:'state'})).shiftHeld,true);
    const began=performance.now();ok(await bounded(controller.interrupt(),3000));
    assert.ok(performance.now()-began<3000);assert.equal((await call({command:'state'})).shiftHeld,false);
    ok(await controller.resume({targetId:target.id}));
    ok(await controller.act({targetId:target.id,action:'type',text:':resumed',inputMode:'background'}));
    ok(await bounded(controller.close(),4000));controller=undefined;backend=undefined;
    target=await start();await call({command:'focus'});
    ok(await controller.observe({targetId:target.id,format:'ax'}));
    ok(await controller.act({targetId:target.id,action:'type',text:':restarted',inputMode:'background'}));
    assert.equal((await call({command:'state'})).text,'human-kept:AI-after:resumed:restarted');
    ok(await controller.stop());
    assert.equal((await controller.act({targetId:target.id,action:'type',text:'must-not-dispatch'})).ok,false);
    assert.equal((await call({command:'state'})).text,'human-kept:AI-after:resumed:restarted');
  }finally{
    const failures=[];
    try{if(controller)ok(await bounded(controller.close(),5000));else if(backend)await bounded(backend.close(),5000);}catch(error){failures.push(error);}
    if(child&&!closed){const exited=new Promise(resolve=>child.once('exit',resolve));child.stdin.end();try{await bounded(exited,3000);}catch(error){child.kill('SIGKILL');await bounded(exited,3000);failures.push(error);}}
    await fs.rm(directory,{recursive:true,force:true});
    if(failures.length)throw new AggregateError(failures,'Native live cleanup failed');
  }
});
