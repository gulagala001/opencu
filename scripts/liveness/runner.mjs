import fs from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {hash} from './catalog.mjs';

const execute=promisify(execFile),chainName='OPENCU_LIVENESS_PROCESS_CHAIN';
const defaultToolRoot=fileURLToPath(new URL('../..',import.meta.url));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errorJSON=error=>({code:error?.code??error?.name??'SUPERVISOR_ERROR',message:error?.message??String(error)});

async function processInventory() {
  // Environments are used only to identify this random supervision chain. Never
  // retain command lines or other environment fields in reports or diagnostics.
  let output;
  // Keep selection in BSD syntax: procps rejects the mixed `eww -axo`
  // spelling that macOS accepts. Both implementations support `axeww -o`.
  try {output=(await execute('/bin/ps',['axeww','-o','pid=,ppid=,pgid=,stat=,command='],{encoding:'utf8',timeout:2000,maxBuffer:64*1024*1024})).stdout;}
  catch(error){throw Object.assign(Error('Could not inspect the supervised process tree'),{code:'PROCESS_INSPECTION_FAILED',causeCode:error.code});}
  const rows=[];
  for(const line of output.split('\n')) {
    const match=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/u.exec(line);if(!match)continue;
    const chain=/(?:^|\s)OPENCU_LIVENESS_PROCESS_CHAIN=([a-zA-Z0-9,-]+)(?:\s|$)/u.exec(match[5])?.[1]?.split(',')??[];
    rows.push({pid:Number(match[1]),ppid:Number(match[2]),pgid:Number(match[3]),state:match[4],chain});
  }
  return rows;
}
const publicProcess=({pid,ppid,pgid,state})=>({pid,ppid,pgid,state});

async function supervise(args,{root,parent,timeoutMs,signal,input,onMessage,environment={}}) {
  const started=performance.now(),token=randomUUID();
  if(process.platform==='win32')return {ok:false,error:{code:'UNSUPPORTED_PROCESS_SUPERVISION',message:'This runner requires POSIX process groups and verified process inventory; Windows tree cleanup has not been implemented.'},cleanup:{confirmed:false},elapsedMs:0,output:''};
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('A positive external watchdog is required');
  if(signal?.aborted)return {ok:false,cancelled:true,timedOut:false,error:{code:'CANCELLED',message:'Run cancelled before launch'},cleanup:{confirmed:true,spawned:false},elapsedMs:0,output:''};
  const scratchParent=parent??join(root,'.local');await fs.mkdir(scratchParent,{recursive:true,mode:0o700});
  const temporaryDirectory=await fs.mkdtemp(join(scratchParent,'supervisor-'));
  let output='',outputTruncated=false,closed=false,exitResult,spawnFailure,triggered;
  const trigger=Promise.withResolvers(),exited=Promise.withResolvers(),finished=Promise.withResolvers();
  const chain=[...(process.env[chainName]?.split(',').filter(value=>/^[a-zA-Z0-9-]+$/.test(value))??[]),token].join(',');
  const env={...process.env,...environment,[chainName]:chain,TMPDIR:temporaryDirectory,TEMP:temporaryDirectory,TMP:temporaryDirectory,OPENCU_TEST_TEMP_DIR:temporaryDirectory};
  // A nested node:test worker must launch a fresh runner, not inherit Node's
  // internal recursive-run sentinel and silently execute no requested files.
  delete env.NODE_TEST_CONTEXT;delete env.NODE_TEST_WORKER_ID;
  // A host-build override belongs to that build. Inheriting it here would let
  // private-snapshot tests inspect an unrelated checkout through source guards.
  if(!Object.hasOwn(environment,'OPENCU_SOURCE_ROOT'))delete env.OPENCU_SOURCE_ROOT;
  const child=spawn(process.execPath,args,{cwd:root,detached:true,stdio:['ignore','pipe','pipe','ipc'],env});
  const append=data=>{output+=data;if(output.length>8*1024*1024){output=output.slice(-8*1024*1024);outputTruncated=true;}};
  child.stdout.on('data',append);child.stderr.on('data',append);
  child.on('message',message=>{try{onMessage?.(message);}catch(error){triggered??={code:'INVALID_CHILD_RECEIPT',message:error.message};trigger.resolve();}});
  child.once('error',error=>{spawnFailure=errorJSON(error);exited.resolve();});
  child.once('exit',(code,exitSignal)=>{exitResult={code,signal:exitSignal};exited.resolve();});
  child.once('close',()=>{closed=true;finished.resolve();});
  const abort=()=>{triggered??={code:'CANCELLED',message:'Run cancelled'};trigger.resolve();};
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{triggered??={code:'WATCHDOG_TIMEOUT',message:'External watchdog expired before the supervised process exited'};trigger.resolve();},timeoutMs);
  if(signal?.aborted)abort();
  else if(input)child.send(input,error=>{if(error){triggered??={code:'IPC_SEND_FAILED',message:error.message};trigger.resolve();}});
  await Promise.race([exited.promise,trigger.promise]);clearTimeout(timer);
  const cleanup={confirmed:false,mechanism:'private POSIX process group plus inherited supervision chain',found:[],remaining:[],errors:[]};
  const owned=rows=>{
    const ids=new Set(rows.filter(row=>row.chain.includes(token)||row.pgid===child.pid).map(row=>row.pid));
    let changed=true;while(changed){changed=false;for(const row of rows)if(ids.has(row.ppid)&&!ids.has(row.pid)){ids.add(row.pid);changed=true;}}
    return rows.filter(row=>!row.state.startsWith('Z')&&ids.has(row.pid));
  };
  const inspect=async()=>owned(await processInventory());
  let leaked=false;
  try {
    let rows=child.pid?await inspect():[];
    cleanup.found=rows.map(publicProcess);
    leaked=!!exitResult&&rows.length>0;
    const deadline=Date.now()+3000;
    // The token survives nested detached supervisors and reparenting. Only this
    // invocation's descendants match; siblings and the caller never inherit it.
    while(rows.length&&Date.now()<deadline) {
      if(rows.some(row=>row.pgid===child.pid))try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')cleanup.errors.push(errorJSON(error));}
      for(const row of rows)try{process.kill(row.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')cleanup.errors.push({...errorJSON(error),pid:row.pid});}
      await delay(25);rows=await inspect();
    }
    cleanup.remaining=rows.map(publicProcess);cleanup.confirmed=rows.length===0&&cleanup.errors.length===0;
  } catch(error) {
    cleanup.errors.push(errorJSON(error));
    // The directly launched group is still ours even if inventory failed. Do
    // not claim complete cleanup when detached descendants cannot be verified.
    if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(killError){if(killError.code!=='ESRCH')cleanup.errors.push(errorJSON(killError));}
  }
  if(!closed)await Promise.race([finished.promise,delay(500)]);
  if(!closed) {cleanup.confirmed=false;cleanup.errors.push({code:'PROCESS_STREAMS_OPEN',message:'Child handles remained open after process cleanup'});child.stdout.destroy();child.stderr.destroy();if(child.connected)child.disconnect();child.unref();}
  if(cleanup.confirmed)try{await fs.rm(temporaryDirectory,{recursive:true,force:true});}catch(error){cleanup.confirmed=false;cleanup.errors.push(errorJSON(error));}
  cleanup.temporaryDirectory=temporaryDirectory;cleanup.temporaryDirectoryRemoved=cleanup.confirmed;
  signal?.removeEventListener('abort',abort);
  const error=!cleanup.confirmed?{code:'CLEANUP_FAILED',message:'The supervised process tree did not confirm complete cleanup',cause:triggered??spawnFailure}
    : triggered??spawnFailure??(leaked?{code:'PROCESS_LEAK',message:'A terminated subprocess left live descendants; they were killed by the supervisor'}
      : exitResult?.code!==0?{code:'CHILD_FAILED',message:`Subprocess exited ${exitResult?.code??'without an exit receipt'}`,exit:exitResult}:undefined);
  return {ok:!error,complete:!triggered&&!spawnFailure&&closed&&cleanup.confirmed,...exitResult,cancelled:triggered?.code==='CANCELLED',timedOut:triggered?.code==='WATCHDOG_TIMEOUT',error,cleanup,elapsedMs:Math.round(performance.now()-started),output,outputTruncated};
}

export async function runChild(spec,{root,parent,toolRoot=defaultToolRoot,timeoutMs=12000,signal}) {
  const events=[];let result;
  const supervision=await supervise([join(toolRoot,'scripts/liveness/child.mjs')],{root,parent,timeoutMs,signal,input:{spec,root,parent},environment:{OPENCU_LIVENESS_CHILD:'1'},onMessage:message=>{
    if(message?.type==='result'){if(result!==undefined)throw Error('Duplicate case receipt');result=message.result;}
    else if(message?.type==='trace'){if(events.length>=100000)throw Error('Trace limit exceeded');events.push(message.event);}
  }});
  const pending=new Map();for(const event of events){if(event.type==='enter')pending.set(event.sequence,event);else if(['reply','reject'].includes(event.type))pending.delete(event.id);}
  const validReceipt=!!result&&result.id===spec.id&&typeof result.ok==='boolean'&&Array.isArray(result.trace?.events)&&Array.isArray(result.trace?.pending);
  let error=supervision.error;
  if(!error&&(!result||result.id!==spec.id||typeof result.ok!=='boolean'||result.ok&&(!Array.isArray(result.trace?.events)||!Array.isArray(result.trace?.pending))))error={code:'MISSING_CASE_RECEIPT',message:'Case exited without a valid result and trace for the requested schedule'};
  if(!error&&result.ok&&(result.trace.pending.length||pending.size))error={code:'WAITER_LEAK',message:'Case claimed success with an unfinished backend wait'};
  if(error)result={id:spec.id,ok:false,error,trace:{events,pending:[...pending.values()]}};
  result.trace??={events,pending:[...pending.values()]};
  result.elapsedMs=supervision.elapsedMs;result.traceDigest=hash(JSON.stringify(result.trace??{}));result.supervision={...supervision};delete result.supervision.output;
  result.complete=validReceipt&&supervision.complete===true;
  if(supervision.output)result.stderr=supervision.output;
  return result;
}

export async function runBrowser({root,parent,toolRoot=defaultToolRoot,timeoutMs=180000,signal}) {
  let result;
  const supervision=await supervise([join(toolRoot,'scripts/liveness/browser-child.mjs')],{root,parent,timeoutMs,signal,input:{root,parent},onMessage:message=>{
    if(message?.type==='result'){if(result!==undefined)throw Error('Duplicate browser receipt');result=message.result;}
  }});
  const error=supervision.error??(!result||typeof result.ok!=='boolean'||!Array.isArray(result.checkpoints)
    ? {code:'MISSING_BROWSER_RECEIPT',message:'Browser subprocess exited without a complete verification receipt'}:undefined);
  const value=error?{ok:false,checkpoints:result?.checkpoints??[],error}:result;
  value.complete=!supervision.error&&!!result&&typeof result.ok==='boolean'&&Array.isArray(result.checkpoints);
  value.supervision={...supervision};delete value.supervision.output;if(supervision.output)value.output=supervision.output;
  return value;
}

export async function runTests(files,{root,parent,toolRoot=defaultToolRoot,timeoutMs=180000,signal,allowedSkips=[],environment={}}) {
  if(!files.length)throw Error('Adapter suite is empty');
  const expected=new Map(files.map(file=>[resolve(root,file),file]));if(expected.size!==files.length)throw Error('Duplicate adapter test file');
  const approvals=allowedSkips.map(item=>{if(!item||typeof item.file!=='string'||typeof item.name!=='string'||typeof item.reason!=='string'||!item.reason.trim())throw Error('Allowed skips require exact file, test name and reason');return {...item,file:resolve(root,item.file)};});
  const summaries=new Map(),skippedTests=[],todoTests=[],failedTests=[];let summary;
  const supervision=await supervise(['--experimental-vm-modules','--test','--test-concurrency=2','--test-reporter='+join(toolRoot,'scripts/liveness/reporter.mjs'),...files],{root,parent,timeoutMs,signal,environment,onMessage:message=>{
    if(message?.type!=='test-event')return;
    const {type,data}=message.event??{};
    if(type==='test:summary') {
      if(!data?.counts||typeof data.success!=='boolean'||['tests','passed','failed','cancelled','skipped','todo'].some(key=>!Number.isSafeInteger(data.counts[key])||data.counts[key]<0))throw Error('Invalid Node test summary');
      if(data.file){const file=resolve(data.file);if(summaries.has(file))throw Error('Duplicate per-file summary');summaries.set(file,data);}
      else {if(summary)throw Error('Duplicate final test summary');summary=data;}
    } else if(['test:pass','test:fail'].includes(type)&&(data.skip||data.todo)) {
      const record={file:relative(root,resolve(data.file)),name:data.name,reason:typeof(data.skip??data.todo)==='string'?data.skip??data.todo:undefined};
      (data.skip?skippedTests:todoTests).push(record);
    } else if(type==='test:fail') {
      failedTests.push({file:data.file?relative(root,resolve(data.file)):undefined,name:data.name,line:data.line,column:data.column,error:data.details?.error});
    }
  }});
  const approved=record=>approvals.find(item=>item.file===resolve(root,record.file)&&item.name===record.name&&item.reason===record.reason);
  const unapprovedSkips=skippedTests.filter(record=>!approved(record));
  const fileResults=[...expected].map(([file,label])=>{
    const item=summaries.get(file),skips=skippedTests.filter(record=>resolve(root,record.file)===file);
    const excluded=!!item&&item.counts.tests>0&&item.counts.passed===0&&item.counts.skipped===item.counts.tests&&skips.length===item.counts.skipped&&skips.every(approved);
    return {file:label,reported:!!item,counts:item?.counts,success:item?.success===true,excluded,
      ok:!!item&&item.success===true&&item.counts.tests>0&&(item.counts.passed>0||excluded)&&!item.counts.failed&&!item.counts.cancelled&&!item.counts.todo};
  });
  const counts=summary?.counts??{},coverage={complete:!!summary&&fileResults.every(item=>item.reported)&&!unapprovedSkips.length&&!todoTests.length,
    exclusions:skippedTests.filter(approved).map(record=>({...record,acceptedReason:approved(record).reason})),unapprovedSkips,todoTests};
  const inconsistent=summary&&fileResults.every(item=>item.reported)&&['tests','passed','failed','cancelled','skipped','todo'].some(key=>fileResults.reduce((sum,item)=>sum+item.counts[key],0)!==counts[key]);
  const error=supervision.error??(!summary||fileResults.some(item=>!item.reported)?{code:'MISSING_TEST_REPORT',message:'Node did not report every requested test file and its final summary'}
    : inconsistent?{code:'INCONSISTENT_TEST_REPORT',message:'Per-file test counts do not match the final Node summary'}
    : !counts.passed?{code:'EMPTY_ADAPTER_SUITE',message:'No effective tests passed; skipped or TODO tests cannot prove liveness'}
    : unapprovedSkips.length||todoTests.length?{code:'UNVERIFIED_TEST_SCOPE',message:'Tests were skipped or left TODO without an explicit scope exclusion'}
    : !summary.success||fileResults.some(item=>!item.ok)||counts.failed||counts.cancelled?{code:'ADAPTER_TEST_FAILED',message:'One or more requested adapter suites failed or executed no effective tests'}:undefined);
  return {ok:!error,complete:!!summary&&fileResults.every(item=>item.reported)&&!supervision.cancelled&&!supervision.timedOut&&supervision.cleanup?.confirmed===true,files,tests:counts.tests??0,passed:counts.passed??0,failed:counts.failed??0,skipped:counts.skipped??0,todo:counts.todo??0,
    cancelled:supervision.cancelled,timedOut:supervision.timedOut,code:supervision.code,signal:supervision.signal,error,
    fileResults,skippedTests,todoTests,failedTests,coverage,supervision:{...supervision,output:undefined},output:supervision.output};
}

export function orderedCases(items,seed) {
  let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;
}
export async function writeJson(path,value){await fs.writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
