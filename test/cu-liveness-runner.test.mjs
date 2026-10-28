import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {runTests,runChild,runBrowser} from '../scripts/liveness/runner.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const runnerUrl=pathToFileURL(join(root,'scripts/liveness/runner.mjs')).href;
async function scratch(t){const parent=join(root,'.local');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(join(parent,'runner-self-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return directory;}
async function script(directory,name,source){const file=join(directory,name);await fs.writeFile(file,source);return file;}
const run=(file,options={})=>runTests([file],{root,timeoutMs:4000,...options});
function alive(pid){try{return !execFileSync('/bin/ps',['-p',String(pid),'-o','stat='],{encoding:'utf8'}).trim().startsWith('Z');}catch{return false;}}
async function waitFile(file){for(let count=0;count<150;count++){try{return await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Synthetic child did not report its PID');}
const stop=pid=>{if(pid)try{process.kill(pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};

// These tests deliberately spawn only synthetic descendants in their own .local
// directories. No browser, native helper, user profile or external target is used.
test('structured test summaries expose exact skipped/TODO scope and reject all-skipped suites',async t=>{
  const directory=await scratch(t),file=await script(directory,'skip.test.mjs',"import test from 'node:test';test('critical native proof',{skip:'wrong platform'},()=>{});\n");
  const skipped=await run(file);assert.equal(skipped.ok,false);assert.equal(skipped.error.code,'EMPTY_ADAPTER_SUITE');assert.equal(skipped.passed,0);assert.equal(skipped.skipped,1);assert.equal(skipped.fileResults[0].reported,true);
  const passing=await script(directory,'pass.test.mjs',"import test from 'node:test';test('actual check',()=>{});\n");
  const blocked=await runTests([file,passing],{root,timeoutMs:4000});assert.equal(blocked.error.code,'UNVERIFIED_TEST_SCOPE');
  const approved=await runTests([file,passing],{root,timeoutMs:4000,allowedSkips:[{file,name:'critical native proof',reason:'wrong platform'}]});
  assert.equal(approved.ok,true);assert.equal(approved.coverage.complete,true);assert.equal(approved.coverage.exclusions.length,1);assert.equal(approved.fileResults[0].excluded,true);
  const changedReason=await runTests([file,passing],{root,timeoutMs:4000,allowedSkips:[{file,name:'critical native proof',reason:'a different exclusion'}]});
  assert.equal(changedReason.error.code,'UNVERIFIED_TEST_SCOPE');
  const changedName=await runTests([file,passing],{root,timeoutMs:4000,allowedSkips:[{file,name:'a different test',reason:'wrong platform'}]});
  assert.equal(changedName.error.code,'UNVERIFIED_TEST_SCOPE');
  await fs.writeFile(file,"import test from 'node:test';test('actual',()=>{});test('unfinished',{todo:true},()=>{});\n");
  const todo=await run(file);assert.equal(todo.ok,false);assert.equal(todo.todoTests[0].name,'unfinished');
});

test('structured failures retain test source, exact assertion and stack independently of TAP text',async t=>{
  const directory=await scratch(t),file=await script(directory,'failure.test.mjs',"import test from 'node:test';import assert from 'node:assert/strict';test('causal failure',()=>{assert.equal(7,9,'synthetic causal assertion');});\n");
  const result=await run(file);assert.equal(result.ok,false);assert.equal(result.complete,true);
  assert.equal(result.failedTests.length,1);
  const failed=result.failedTests[0];assert.equal(resolve(root,failed.file),file);assert.equal(failed.name,'causal failure');
  assert.equal(failed.line,1);assert.equal(failed.error.cause.code,'ERR_ASSERTION');assert.equal(failed.error.cause.actual,7);assert.equal(failed.error.cause.expected,9);
  assert.match(failed.error.message,/synthetic causal assertion/);assert.match(failed.error.cause.stack,/failure\.test\.mjs/);
});

test('empty and prematurely exited test files cannot borrow another file success',async t=>{
  const directory=await scratch(t),passing=await script(directory,'pass.test.mjs',"import test from 'node:test';test('actual',()=>{});\n");
  for(const source of ['','process.exit(0);']){
    const empty=await script(directory,'empty.test.mjs',source),result=await runTests([passing,empty],{root,timeoutMs:4000});
    assert.equal(result.ok,false);assert.equal(result.fileResults.find(item=>item.file===empty).ok,false);
  }
});

for(const detached of [false,true])test(`successful tests fail and reap their ${detached?'detached':'same-group'} leaked descendant`,async t=>{
  const directory=await scratch(t),pidFile=join(directory,'leaked.pid');let pid;
  t.after(()=>stop(pid));
  const file=await script(directory,'leak.test.mjs',`import test from 'node:test';import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';test('leak',()=>{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:${detached},stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.unref();});\n`);
  const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});unrelated.unref();t.after(()=>stop(unrelated.pid));
  const result=await run(file);pid=Number(await fs.readFile(pidFile,'utf8'));
  assert.equal(result.ok,false);assert.equal(result.error.code,'PROCESS_LEAK');assert.equal(result.supervision.cleanup.confirmed,true);
  assert(result.supervision.cleanup.found.some(item=>item.pid===pid));assert.equal(alive(pid),false);assert.equal(alive(unrelated.pid),true,'unrelated process must survive exact cleanup');
});

test('external watchdog and cancellation reap stalled descendants and cannot become success',async t=>{
  const directory=await scratch(t),file=await script(directory,'hang.test.mjs',"import test from 'node:test';test('hang',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});\n");
  const expired=await run(file,{timeoutMs:150});assert.equal(expired.error.code,'WATCHDOG_TIMEOUT');assert.equal(expired.supervision.cleanup.confirmed,true);assert.equal(expired.timedOut,true);assert.equal(expired.complete,false);
  const controller=new AbortController();const pending=run(file,{signal:controller.signal});setTimeout(()=>controller.abort(),80);
  const cancelled=await pending;assert.equal(cancelled.error.code,'CANCELLED');assert.equal(cancelled.supervision.cleanup.confirmed,true);
  assert.equal((await run(file,{signal:AbortSignal.abort()})).supervision.cleanup.spawned,false);
});

test('nested detached supervisors are found after outer cancellation without touching a sibling',async t=>{
  const directory=await scratch(t),pidFile=join(directory,'nested.pid');let nestedPid;
  t.after(()=>stop(nestedPid));
  const inner=await script(directory,'inner.test.mjs',`import test from 'node:test';import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';test('inner hang',async()=>{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.unref();setInterval(()=>{},1000);await new Promise(()=>{});});\n`);
  const outer=await script(directory,'outer.test.mjs',`import test from 'node:test';import {runTests} from ${JSON.stringify(runnerUrl)};test('nested supervisor',async()=>{await runTests([${JSON.stringify(inner)}],{root:${JSON.stringify(root)},timeoutMs:30000});});\n`);
  const abort=new AbortController(),pending=run(outer,{signal:abort.signal,timeoutMs:8000});
  nestedPid=Number(await waitFile(pidFile));abort.abort();const result=await pending;
  assert.equal(result.error.code,'CANCELLED');assert.equal(result.supervision.cleanup.confirmed,true);assert.equal(alive(nestedPid),false);
  assert(result.supervision.cleanup.found.some(item=>item.pid===nestedPid));
});

async function frozenTool(directory){const tool=join(directory,'tool');await fs.mkdir(join(tool,'scripts/liveness'),{recursive:true});return tool;}
test('case supervisor reads its frozen toolRoot and rejects missing/unfinished receipts',async t=>{
  const directory=await scratch(t),toolRoot=await frozenTool(directory),entry=join(toolRoot,'scripts/liveness/child.mjs'),spec={id:'synthetic'};
  await fs.writeFile(entry,"process.once('message',()=>process.exit(0));\n");
  const missing=await runChild(spec,{root,parent:directory,toolRoot,timeoutMs:2000});assert.equal(missing.error.code,'MISSING_CASE_RECEIPT');assert.equal(missing.complete,false);
  await fs.writeFile(entry,"process.once('message',input=>process.send({type:'result',result:{id:input.spec.id,ok:true,trace:{events:[],pending:[{id:1}]}}},()=>process.disconnect()));\n");
  assert.equal((await runChild(spec,{root,parent:directory,toolRoot,timeoutMs:2000})).error.code,'WAITER_LEAK');
});

test('browser subprocess has an independent watchdog, cleanup and mandatory frozen receipt',async t=>{
  const directory=await scratch(t),toolRoot=await frozenTool(directory),entry=join(toolRoot,'scripts/liveness/browser-child.mjs');
  await fs.copyFile(join(root,'scripts/liveness/browser-child.mjs'),entry);
  const implementation=join(toolRoot,'scripts/liveness/browser.mjs');
  await fs.writeFile(implementation,"export async function verifyBrowser(){setInterval(()=>{},1000);await new Promise(()=>{});}\n");
  const timedOut=await runBrowser({root,parent:directory,toolRoot,timeoutMs:150});assert.equal(timedOut.error.code,'WATCHDOG_TIMEOUT');assert.equal(timedOut.supervision.cleanup.confirmed,true);
  await fs.writeFile(implementation,'export async function verifyBrowser(){return undefined;}\n');
  assert.equal((await runBrowser({root,parent:directory,toolRoot,timeoutMs:2000})).error.code,'MISSING_BROWSER_RECEIPT');
  await fs.writeFile(implementation,"export async function verifyBrowser(){return {ok:true,checkpoints:['synthetic-valid-receipt']};}\n");
  const valid=await runBrowser({root,parent:directory,toolRoot,timeoutMs:2000});assert.equal(valid.ok,true);assert.equal(valid.supervision.cleanup.confirmed,true);
});

test('failed process inspection cannot become a successful cleanup receipt',async t=>{
  const directory=await scratch(t),file=await script(directory,'hang.test.mjs',"import test from 'node:test';test('hang',async()=>{setInterval(()=>{},1000);await new Promise(()=>{});});\n");
  const {transform}=await import('esbuild'),{createRequire}=await import('node:module'),realRequire=createRequire(import.meta.url);
  const childProcess=realRequire('node:child_process'),{hash}=await import('../scripts/liveness/catalog.mjs');let launched;
  const {code}=await transform(await fs.readFile(new URL('../scripts/liveness/runner.mjs',import.meta.url),'utf8'),{format:'cjs',target:'node22',define:{'import.meta.url':JSON.stringify(new URL('../scripts/liveness/runner.mjs',import.meta.url).href)}});
  const module={exports:{}};
  const require=name=>name==='./catalog.mjs'?{hash}:name==='node:child_process'?{...childProcess,
    spawn:(...args)=>(launched=childProcess.spawn(...args)),
    execFile:(...args)=>queueMicrotask(()=>args.at(-1)(Object.assign(Error('injected process inventory unavailable'),{code:'EACCES'}))),
  }:realRequire(name);
  new Function('require','module','exports',code)(require,module,module.exports);
  t.after(()=>stop(launched?.pid));
  const result=await module.exports.runTests([file],{root,parent:directory,timeoutMs:150});
  assert.equal(result.ok,false);assert.equal(result.error.code,'CLEANUP_FAILED');assert.equal(result.supervision.cleanup.confirmed,false);
  assert(result.supervision.cleanup.errors.some(error=>error.code==='PROCESS_INSPECTION_FAILED'));assert.equal(alive(launched.pid),false);
});

test('every child temp convention points into its private scratch directory',async t=>{
  const previous=process.env.OPENCU_SOURCE_ROOT;process.env.OPENCU_SOURCE_ROOT='outside-synthetic-snapshot';
  t.after(()=>{if(previous===undefined)delete process.env.OPENCU_SOURCE_ROOT;else process.env.OPENCU_SOURCE_ROOT=previous;});
  const directory=await scratch(t),file=await script(directory,'temp.test.mjs',`import test from 'node:test';import assert from 'node:assert/strict';import {tmpdir} from 'node:os';import {writeFile} from 'node:fs/promises';import {join} from 'node:path';test('private temp',async()=>{assert.equal(process.env.OPENCU_SOURCE_ROOT,undefined);assert.equal(tmpdir(),process.env.OPENCU_TEST_TEMP_DIR);assert.equal(process.env.TEMP,tmpdir());assert.equal(process.env.TMP,tmpdir());assert(tmpdir().startsWith(${JSON.stringify(directory)}));await writeFile(join(tmpdir(),'synthetic-remnant'),'temporary');});\n`);
  const result=await run(file,{parent:directory});assert.equal(result.ok,true);assert.equal(result.supervision.cleanup.temporaryDirectoryRemoved,true);
  await assert.rejects(fs.stat(result.supervision.cleanup.temporaryDirectory),{code:'ENOENT'});
});
