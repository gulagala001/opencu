import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cases,runCase} from '../scripts/liveness/cases.mjs';
import {Schedule,bounded} from '../scripts/liveness/scheduler.mjs';
import {scan,checkCatalog} from '../scripts/liveness/catalog.mjs';
import {runChild,orderedCases,writeJson} from '../scripts/liveness/runner.mjs';
import {fixture} from '../scripts/liveness/fixture.mjs';
import {snapshot,fingerprint} from '../scripts/liveness/snapshot.mjs';
import {execFileSync} from 'node:child_process';
import {platformSkips,discoverDsh} from '../scripts/liveness/scope.mjs';
import {validateReplay} from '../scripts/liveness/replay.mjs';
import {createRequire} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
async function scratch(t){const parent=join(root,'.local');await fs.mkdir(parent,{recursive:true});const path=await fs.mkdtemp(join(parent,'machine-self-'));t.after(()=>fs.rm(path,{recursive:true,force:true}));return path;}

test('generated grammar has unique replayable IDs and deterministic order',()=>{
  const all=cases();assert.equal(new Set(all.map(x=>x.id)).size,all.length);
  assert.deepEqual(orderedCases(all,7),orderedCases(all,7));assert.notDeepEqual(orderedCases(all,7),orderedCases(all,8));
  for(const backend of ['browser','native'])for(const phase of ['before','observing','acting','recovering'])
    for(const human of ['click','type','scroll','focus','resize','navigate','dialog','held-key'])assert.ok(all.some(x=>x.backend===backend&&x.phase===phase&&x.human===human));
});
test('an unconsumed fault and a watchdog can never be treated as success',async()=>{
  const schedule=new Schedule(),fault=schedule.arm('unused','reject-before');assert.throws(()=>schedule.assertInjected(fault));
  await assert.rejects(bounded(new Promise(()=>{}),'synthetic wait',10),{code:'LIVENESS_VIOLATION'});schedule.release();
});
test('source inventory rejects changed and newly added asynchronous paths',async t=>{
  const directory=await scratch(t);await fs.mkdir(join(directory,'src/core'),{recursive:true});
  const file=join(directory,'src/core/controller.mjs'),baseline=join(directory,'catalog.json');
  await fs.writeFile(file,'export async function work(){await Promise.resolve(1)}');await writeJson(baseline,await scan(directory));
  assert.ok((await checkCatalog(directory,baseline)).waitPoints>0);
  await fs.writeFile(file,'export async function work(){await new Promise(()=>{})}');await assert.rejects(checkCatalog(directory,baseline),{code:'CATALOG_DRIFT'});
  await writeJson(baseline,await scan(directory));await fs.writeFile(join(directory,'src/core/new.mjs'),'export async function extra(){await Promise.resolve()}');
  await assert.rejects(checkCatalog(directory,baseline),{code:'CATALOG_DRIFT'});
});
for(const mutation of ['human-stop','duplicate-input','release-human'])test(`independent continuation oracle catches the ${mutation} mutant`,async t=>{
  const parent=await scratch(t),spec=cases().find(x=>x.family==='human'&&x.backend==='browser'&&x.phase==='before'&&x.human===(mutation==='release-human'?'held-key':'click'));
  const baseline=await runCase(spec,{root,parent});assert.equal(baseline.ok,true,JSON.stringify(baseline.error));
  const mutant=await runCase(spec,{root,parent,mutation});assert.equal(mutant.ok,false,'deliberately broken product behavior must fail');
});
test('external supervisor reports cancellation and hard timeout as incomplete failures',async t=>{
  const parent=await scratch(t),spec={version:1,id:'synthetic-unreachable-boundary',family:'cancel-read',backend:'browser',port:'permissions',action:'stop'};
  const expired=await runChild(spec,{root,parent,timeoutMs:200});assert.equal(expired.ok,false);assert.equal(expired.error.code,'WATCHDOG_TIMEOUT');
  const abort=new AbortController();abort.abort();const cancelled=await runChild(spec,{root,parent,timeoutMs:1000,signal:abort.signal});
  assert.equal(cancelled.ok,false);assert.equal(cancelled.error.code,'CANCELLED');
});

test('a false cleanup receipt fails verification and preserves its diagnostic state',async t=>{
  const parent=await scratch(t),f=await fixture(root,parent);
  f.bodies.close=async()=>{throw Error('Synthetic backend cleanup failure');};
  await assert.rejects(f.cleanup(),/cleanup failure/);
  assert.equal((await fs.stat(f.dataDir)).isDirectory(),true);
  f.bodies.close=async()=>{};await f.cleanup();
});

test('snapshot and fingerprint include tests/tooling/build bytes without writable source links',async t=>{
  const parent=await scratch(t),source=join(parent,'original');await fs.mkdir(join(source,'lib'),{recursive:true});
  await fs.writeFile(join(source,'.gitignore'),'lib/\nnode_modules/\nlegacy.txt\n');await fs.writeFile(join(source,'package.json'),'{"name":"synthetic"}');
  await fs.writeFile(join(source,'lib/bundle.js'),'original');
  execFileSync('git',['init','-q','-b','main'],{cwd:source});
  await fs.writeFile(join(source,'legacy.txt'),'tracked legacy source');execFileSync('git',['add','-f','legacy.txt'],{cwd:source});
  let before=await fingerprint(source);
  await fs.mkdir(join(source,'test'));await fs.writeFile(join(source,'test/probe.mjs'),'export const probe=1;');
  assert.notEqual((await fingerprint(source)).digest,before.digest);
  before=await fingerprint(source);await fs.writeFile(join(source,'lib/bundle.js'),'changed build');assert.notEqual((await fingerprint(source)).digest,before.digest);
  const copy=await snapshot(source,parent);assert.equal((await fingerprint(copy)).digest,(await fingerprint(source)).digest);
  await fs.writeFile(join(copy,'lib/bundle.js'),'private edit');assert.equal(await fs.readFile(join(source,'lib/bundle.js'),'utf8'),'changed build');
  await fs.symlink(join(source,'lib/bundle.js'),join(source,'lib/unsafe-link.js'));
  await assert.rejects(snapshot(source,parent),/symlinks/);
});

test('consumer snapshots resolve dependencies from the explicit tool root',async t=>{
  const parent=await scratch(t),source=join(parent,'consumer'),tool=join(parent,'tool');
  await fs.mkdir(source);await fs.mkdir(join(tool,'node_modules/synthetic-dependency'),{recursive:true});
  await fs.writeFile(join(source,'package.json'),'{"name":"consumer"}');
  await fs.writeFile(join(tool,'node_modules/synthetic-dependency/package.json'),'{"name":"synthetic-dependency","main":"index.cjs"}');
  await fs.writeFile(join(tool,'node_modules/synthetic-dependency/index.cjs'),'module.exports="explicit tool dependency";');
  execFileSync('git',['init','-q','-b','main'],{cwd:source});
  const copy=await snapshot(source,parent,{dependencyRoot:tool});
  assert.equal(await fs.realpath(join(copy,'node_modules')),join(tool,'node_modules'));
  assert.equal(createRequire(join(copy,'package.json'))('synthetic-dependency'),'explicit tool dependency');
  assert.equal((await fingerprint(copy)).digest,(await fingerprint(source)).digest);
});

test('replay retains a failed causal schedule and fences source, verifier and grammar changes',async t=>{
  const parent=await scratch(t),spec=cases().find(item=>item.family==='human'&&item.phase==='before'&&item.backend==='browser'&&item.human==='click');
  const result=await runCase(spec,{root,parent,mutation:'human-stop'});assert.equal(result.ok,false);assert.ok(result.error.message);assert.ok(result.trace.events.length);
  const sourceDigest='a'.repeat(64),verifierDigest='b'.repeat(64),file=join(parent,'failure.json');
  await writeJson(file,{version:1,kind:'opencu-liveness-failure',sourceDigest,verifierDigest,spec,result});
  const value=JSON.parse(await fs.readFile(file,'utf8')),options={cases:cases(),sourceDigest,verifierDigest};
  assert.deepEqual(validateReplay(value,options),spec);
  assert.throws(()=>validateReplay(value,{...options,sourceDigest:'c'.repeat(64)}),/Source changed/);
  assert.throws(()=>validateReplay(value,{...options,verifierDigest:'c'.repeat(64)}),/Verifier changed/);
  assert.deepEqual(validateReplay(value,{...options,sourceDigest:'c'.repeat(64),allowSourceChange:true}),spec);
  assert.throws(()=>validateReplay({...value,spec:{...spec,unreviewed:true}},options),/grammar/);
  assert.throws(()=>validateReplay({...value,sourceDigest:undefined},{...options,allowSourceChange:true}),/incomplete/);
  assert.throws(()=>validateReplay({...value,result:{...result,ok:true}},options),/incomplete/);
  const replayed=await runChild(validateReplay(value,options),{root,parent,timeoutMs:4000});
  assert.equal(replayed.ok,true,JSON.stringify(replayed.error));assert.equal(replayed.id,result.id);assert.equal(replayed.supervision.cleanup.confirmed,true);
});

test('platform exclusions are exact and missing real DSH SDK is an explicit incomplete requirement',async t=>{
  const darwin=platformSkips({platform:'darwin',environment:{}});assert.equal(darwin.length,3);
  assert(darwin.every(item=>item.file.startsWith('test/')&&item.name&&item.reason.includes('darwin')));
  const linux=platformSkips({platform:'linux',environment:{}});assert.equal(linux.length,4);
  assert.equal(platformSkips({platform:'linux',environment:{XDG_SESSION_TYPE:'wayland',HYPRLAND_INSTANCE_SIGNATURE:'synthetic'}}).length,2);
  const parent=await scratch(t);await fs.writeFile(join(parent,'package.json'),JSON.stringify({engines:{dsh:'0.2.1-rc.3'}}));
  const missing=await discoverDsh(parent,{installation:join(parent,'missing/package.json')});
  assert.equal(missing.available,false);assert.equal(missing.error.code,'MISSING_DSH_SDK');assert.equal(missing.attempts.length,1);
  const installation=join(parent,'old-sdk/package.json');await fs.mkdir(join(parent,'old-sdk/node_modules/@deepseek-ai/dsh'),{recursive:true});
  await fs.writeFile(installation,'{}');await fs.writeFile(join(parent,'old-sdk/node_modules/@deepseek-ai/dsh/package.json'),'{"version":"0.2.0"}');
  const mismatched=await discoverDsh(parent,{installation});
  assert.equal(mismatched.available,false);assert.equal(mismatched.attempts[0].code,'DSH_VERSION_MISMATCH');
});
