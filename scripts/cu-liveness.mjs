import fs from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scan,checkCatalog,adapterTests,hash} from './liveness/catalog.mjs';
import {contracts,invariants,VERSION} from './liveness/contracts.mjs';
import {cases} from './liveness/cases.mjs';
import {runChild,runTests,runBrowser,orderedCases,writeJson} from './liveness/runner.mjs';
import {snapshot,fingerprint} from './liveness/snapshot.mjs';
import {platformSkips,discoverDsh} from './liveness/scope.mjs';
import {validateReplay} from './liveness/replay.mjs';

const sourceRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
const baseline=join(sourceRoot,'scripts/liveness/catalog.json');
const args=process.argv.slice(2),command=args.shift()??'verify',options={};
for(let i=0;i<args.length;i++) {
  const arg=args[i];if(!arg.startsWith('--'))throw Error(`Unexpected argument: ${arg}`);
  const key=arg.slice(2);if(Object.hasOwn(options,key))throw Error(`Duplicate --${key}`);
  if(['write','allow-source-change'].includes(key))options[key]=true;
  else if(['profile','case','seed','replay','root','timeout-ms','output'].includes(key)) {if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing --${key} value`);options[key]=args[++i];}
  else throw Error(`Unknown option --${key}`);
}
const root=resolve(options.root??(command==='check'?process.env.OPENCU_SOURCE_ROOT:undefined)??sourceRoot);
if(command==='help'||command==='--help') {
  console.log('CU/BU liveness machine\n  check                         Verify source inventory and test registration\n  catalog [--write]              Inspect/update reviewed async source inventory\n  list                          List deterministic cases and invariants\n  verify [--profile matrix|adapters|browser|full] [--case ID] [--seed N]\n  replay --replay failure.json [--allow-source-change]\nAll reports and isolated fixtures live under .local/. Watchdog/cancellation is never success.');
} else if(command==='catalog') {
  const catalog=await scan(root);if(options.write)await writeJson(baseline,catalog);
  console.log(JSON.stringify({files:catalog.records.length,waitPoints:catalog.records.reduce((n,r)=>n+r.sites.length,0),written:options.write===true}));
} else if(command==='list')console.log(JSON.stringify({invariants,contracts:contracts.map(({id,invariant})=>({id,invariant})),cases:cases()},null,2));
else if(['check','verify','replay'].includes(command)) {
  const inventory=await checkCatalog(root,baseline,{consumer:root!==sourceRoot&&Boolean(options.root)}),groups=await adapterTests(sourceRoot);
  for(const [id,files]of Object.entries(groups))if(!files.length)throw Error(`Contract ${id} has no executable adapter tests`);
  if(command==='check')console.log(JSON.stringify({...inventory,adapterSuites:Object.fromEntries(Object.entries(groups).map(([key,files])=>[key,files.length]))}));
  else {
    const profile=options.profile??'full';if(!['matrix','adapters','browser','full'].includes(profile))throw Error('Unknown profile');
    if(root!==sourceRoot&&['adapters','full'].includes(profile))throw Error('For an embedded package use --profile matrix or browser. Run the complete source adapter suite in the source checkout.');
    const seed=Number(options.seed??1);if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Seed must be an unsigned 32-bit integer');
    const timeoutMs=Number(options['timeout-ms']??12000);if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>300000)throw Error('Invalid case timeout');
    const sourceIdentity=await fingerprint(root);
    const verifierIdentity=root===sourceRoot?sourceIdentity:await fingerprint(sourceRoot);
    let selected=orderedCases(cases(),seed),replay;
    if(command==='replay') {
      if(!options.replay)throw Error('--replay is required');
      replay=JSON.parse(await fs.readFile(resolve(options.replay),'utf8'));
      const original=validateReplay(replay,{cases:selected,sourceDigest:sourceIdentity.digest,verifierDigest:verifierIdentity.digest,allowSourceChange:options['allow-source-change']});
      selected=[original];
    } else if(options.case) {selected=selected.filter(spec=>spec.id===options.case);if(!selected.length)throw Error('Unknown case ID');}
    const runMatrix=command==='replay'||Boolean(options.case)||['matrix','full'].includes(profile);
    const runAdapters=!options.case&&command!=='replay'&&['adapters','full'].includes(profile);
    const runLiveBrowser=!options.case&&command!=='replay'&&['browser','full'].includes(profile);
    const effectiveProfile=command==='replay'?'replay':options.case?'case':profile;
    const outputParent=join(sourceRoot,'.local','cu-liveness');await fs.mkdir(outputParent,{recursive:true,mode:0o700});
    if(options.output&&resolve(options.output)!==outputParent)throw Error('Reports must remain in this checkout .local/cu-liveness; use the reported run directory');
    const output=await fs.mkdtemp(join(outputParent,'run-'));await fs.chmod(output,0o700);
    const scratch=join(output,'scratch');await fs.mkdir(scratch,{mode:0o700});
    const failures=join(output,'failures');await fs.mkdir(failures,{mode:0o700});
    const aborter=new AbortController(),cancel=()=>aborter.abort(Error('User cancelled verification'));
    process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    const results=[],report={version:VERSION,kind:'opencu-liveness-report',ok:false,complete:false,cancelled:false,startedAt:new Date().toISOString(),sourceRoot:root,sourceDigest:sourceIdentity.digest,verifierDigest:verifierIdentity.digest,sourceIdentity,inventory,profile:effectiveProfile,requestedProfile:profile,command,scope:{expectedCases:runMatrix?selected.length:0,adapters:runAdapters,browser:runLiveBrowser},seed,platform:process.platform,node:process.version,invariants,results,
      coverage:{static:'All registered owned asynchronous sources; drift is a failure.',dynamic:'Enumerated causal schedules and actual adapter assertions; not all arbitrary event histories.',external:'Browser/OS implementations outside owned boundaries are not formally proven.'}};
    await writeJson(join(output,'input.json'),{version:VERSION,profile:effectiveProfile,requestedProfile:profile,command,seed,sourceDigest:sourceIdentity.digest,verifierDigest:verifierIdentity.digest,cases:runMatrix?selected:[]});
    console.log(`Report: ${output}`);
    try {
      const testedRoot=await snapshot(root,scratch,{dependencyRoot:sourceRoot});
      const copied=await fingerprint(testedRoot);
      if(copied.digest!==sourceIdentity.digest)throw Object.assign(Error('Source, tests or generated output changed while the private test snapshot was being copied'),{code:'SOURCE_CHANGED'});
      const testedToolRoot=root===sourceRoot?testedRoot:await snapshot(sourceRoot,scratch);
      if((await fingerprint(testedToolRoot)).digest!==verifierIdentity.digest)throw Object.assign(Error('Verifier source changed while its snapshot was being copied'),{code:'SOURCE_CHANGED'});
      report.isolation={sourceSnapshot:true,snapshotRoot:testedRoot,verifierSnapshotRoot:testedToolRoot,generatedOutputCopied:true,dependenciesShared:true,dependencies:await fs.realpath(join(testedRoot,'node_modules')),processGroupWatchdog:true};
      if(runMatrix)for(const spec of selected) {
        if(aborter.signal.aborted)break;
        const result=await runChild(spec,{root:testedRoot,toolRoot:testedToolRoot,parent:scratch,timeoutMs,signal:aborter.signal});
        results.push({id:result.id,ok:result.ok,complete:result.complete,elapsedMs:result.elapsedMs,traceDigest:result.traceDigest,error:result.error});
        if(!result.ok) {
          const file=hash(spec.id).slice(0,16)+'.json';
          results.at(-1).failureFile='failures/'+file;
          await writeJson(join(failures,file),{version:VERSION,kind:'opencu-liveness-failure',sourceDigest:sourceIdentity.digest,verifierDigest:verifierIdentity.digest,spec,result});
          console.log(`FAIL ${spec.id}: ${result.error?.code} ${result.error?.message}`);
        } else if(results.length%25===0)console.log(`Cases ${results.length}/${selected.length}`);
      }
      if(!aborter.signal.aborted&&runAdapters) {
        const files=profile==='full'?(await fs.readdir(join(sourceRoot,'test'))).filter(file=>file.endsWith('.test.mjs')).map(file=>'test/'+file):[...new Set(Object.values(groups).flat())];
        const needsDsh=files.includes('test/dsh.test.mjs');
        const dsh=needsDsh?await discoverDsh(sourceRoot):undefined;
        if(dsh)report.requirements={dsh};
        const environment=needsDsh?{OPENCU_DSH_SMOKE:'1',OPENCU_DSH_INSTALL:dsh.installation??join(sourceRoot,'.local/cu-dsh-sdk/package.json'),OPENCU_DSH_PLUGIN:join(testedRoot,'src/dsh/index.mjs'),OPENCU_DSH_PEER_PLUGIN:join(testedRoot,'src/dsh/index.mjs')}:{};
        const suite=await runTests(files,{root:testedRoot,toolRoot:testedToolRoot,signal:aborter.signal,timeoutMs:900000,allowedSkips:platformSkips(),environment});
        await fs.writeFile(join(output,'adapters.tap'),suite.output,{mode:0o600});delete suite.output;report.adapters=suite;
        console.log(`Adapters: ${suite.passed}/${suite.tests}, skipped ${suite.skipped}, ok=${suite.ok}`);
      }
      if(!aborter.signal.aborted&&runLiveBrowser) {
        report.browser=await runBrowser({root:testedRoot,toolRoot:testedToolRoot,parent:scratch,signal:aborter.signal});
      }
      report.cancelled=aborter.signal.aborted;
      report.complete=!report.cancelled&&(!runMatrix||results.length===selected.length);
      if(results.some(result=>!result.complete)||report.adapters?.complete===false||report.browser?.complete===false)report.complete=false;
      if(report.requirements?.dsh.available===false){report.complete=false;report.error=report.requirements.dsh.error;}
      report.ok=report.complete&&results.every(item=>item.ok)&&report.adapters?.ok!==false&&report.browser?.ok!==false;
      report.sourceStillCurrent=(await fingerprint(root)).digest===sourceIdentity.digest;
      report.verifierStillCurrent=root===sourceRoot?report.sourceStillCurrent:(await fingerprint(sourceRoot)).digest===verifierIdentity.digest;
      if(!report.verifierStillCurrent)report.sourceStillCurrent=false;
      if(!report.sourceStillCurrent){report.ok=false;report.complete=false;report.error={code:'SOURCE_CHANGED',message:'Private snapshot was tested, but current source changed; validate the final source before delivery.'};}
    } catch(error){report.ok=false;report.complete=false;report.error={code:error.code??error.name,message:error.message,stack:error.stack};}
    finally {
      process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
      report.cancelled=aborter.signal.aborted;
      if(report.cancelled){report.ok=false;report.complete=false;}
      report.finishedAt=new Date().toISOString();
      // Each subprocess owns only this run's scratch tree. A watchdog is a
      // failure; it is never counted as successful product cancellation.
      try {await fs.rm(scratch,{recursive:true,force:true});report.scratchRemoved=true;}
      catch(error){report.ok=false;report.complete=false;report.scratchRemoved=false;report.cleanupError={code:error.code??error.name,message:error.message,stack:error.stack};}
      await writeJson(join(output,'summary.json'),report);
      console.log(JSON.stringify({ok:report.ok,complete:report.complete,cases:results.length,failures:results.filter(x=>!x.ok).length,report:join(output,'summary.json')}));
      process.exitCode=report.cancelled||!report.complete?2:report.ok?0:1;
    }
  }
} else throw Error('Unknown command; use help');
