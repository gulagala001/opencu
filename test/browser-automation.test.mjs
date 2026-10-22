import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isolatedLaunchOptions, withIsolatedBrowser} from '../src/browser/automation.mjs';
import {createBrowserBackend} from '../src/browser/backend.mjs';

test('owned browser launch keeps credential isolation after Playwright default filtering', async t => {
  const dataDir=await mkdtemp(join(tmpdir(),'opencu-options-'));t.after(()=>rm(dataDir,{recursive:true,force:true}));
  const launchOptions=Object.freeze({args:Object.freeze(['--use-angle=swiftshader','--password-store','gnome-libsecret','--use-mock-keychain=false']),
    ignoreDefaultArgs:Object.freeze(['--use-mock-keychain','--password-store=basic','--disable-sync'])});
  const original=structuredClone(launchOptions);
  const backend=await createBrowserBackend({dataDir,launchOptions,playwright:{chromium:{async launchPersistentContext(_path,options){
    const actual=options.args.filter(arg=>!options.ignoreDefaultArgs.includes(arg));
    assert(actual.includes('--use-mock-keychain'));assert(actual.includes('--password-store=basic'));
    assert(actual.includes('--use-angle=swiftshader'));assert(!actual.includes('gnome-libsecret'));assert(!actual.includes('--use-mock-keychain=false'));
    throw Error('checked physical launch boundary');
  }}}});
  await assert.rejects(backend.listTargets(),/checked physical launch boundary/);await backend.close();
  assert.deepEqual(launchOptions,original);
  assert.deepEqual(isolatedLaunchOptions({ignoreDefaultArgs:true}).args,['--use-mock-keychain','--password-store=basic']);
});

for(const outcome of ['success','failure','timeout','cancel'])test(`isolated checks clean their owned context and profile on ${outcome}`,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opencu-check-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const aborter=new AbortController();let closed=0,profile;
  const playwright={chromium:{async launchPersistentContext(path){profile=path;return {close:async()=>{closed++;}};}}};
  const run=withIsolatedBrowser(async({signal})=>{
    assert.equal(signal.aborted,false);
    if(outcome==='success')return 42;
    if(outcome==='failure')throw Error('synthetic check failed');
    if(outcome==='cancel')aborter.abort(Error('synthetic cancellation'));
    return new Promise(()=>{});
  },{directory,playwright,signal:aborter.signal,timeoutMs:30});
  if(outcome==='success')assert.equal(await run,42);
  else await assert.rejects(run,outcome==='timeout'?{code:'BROWSER_CHECK_TIMEOUT'}:new RegExp(outcome==='failure'?'synthetic check failed':'synthetic cancellation'));
  assert.equal(closed,1);assert(profile.startsWith(directory));assert.deepEqual(await readdir(directory),[]);
});

test('cancelled startup closes a late browser without running the check',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opencu-check-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const aborter=new AbortController();let ran=false,closed=0;
  await assert.rejects(withIsolatedBrowser(()=>{ran=true;},{directory,signal:aborter.signal,playwright:{chromium:{async launchPersistentContext(){
    aborter.abort(Error('cancel while launching'));return {close:async()=>{closed++;}};
  }}}}),/cancel while launching/);
  assert.equal(ran,false);assert.equal(closed,1);assert.deepEqual(await readdir(directory),[]);
});
