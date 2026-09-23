import test from 'node:test';
import assert from 'node:assert/strict';
import { operationRowLocale, operationState, summarizeToolOutcomes } from '../src/client/computer-groups.mjs';

test('preparing calls do not claim execution or outcomes', () => {
 const block={phase:'preparing',callId:'pending',name:'bash',subCalls:[]};
 const zh=key=>key==='row.failed'?'失败':key;
 assert.equal(operationState(block),'preparing');
 assert.equal(operationRowLocale(zh,'bash',block)('tool.title.bash'),'准备运行');
 assert.deepEqual(summarizeToolOutcomes([{root:block}]),{failures:0,stopped:0});
});
test('lifecycle titles preserve original locale actions and explicit stopped/error status',()=>{
 const zh=key=>key==='row.failed'?'执行失败':key,en=key=>key==='row.failed'?'Failed':key;
 const done={kind:'tool-result',call:{name:'read'}};
 assert.equal(operationRowLocale(zh,'read',done)('tool.title.read'),'已读取');
 assert.equal(operationRowLocale(zh,'bash',{})('tool.title.bash'),'正在运行');
 assert.equal(operationRowLocale(zh,'read',{...done,isError:true})('tool.title.read'),'读取失败');
 assert.equal(operationRowLocale(zh,'read',{...done,error:{code:'interrupted'}})('tool.title.read'),'已停止');
 assert.equal(operationRowLocale(zh,'read',done)('row.inspect'),'row.inspect');
 assert.equal(operationRowLocale(en,'read',done),en);
 assert.equal(operationState({...done,meta:{computerUseError:'failed'}}),'error');
 assert.equal(operationState({...done,isError:true,content:[{type:'text',text:'Computer Use is stopped'}]}),'error','file error text is not a Computer Use cancellation');
});

test('native turn outcomes count recursive calls once and separate stops from failures', () => {
 const failed = { callId: 'failed', kind: 'tool-result', isError: true };
 const stopped = { callId: 'stopped', kind: 'tool-result', error: { code: 'ABORTED' } };
 const running = { callId: 'live', kind: 'tool-call' };
 const root = { callId: 'root', kind: 'tool-result', subCalls: [failed, stopped, running] };
 assert.deepEqual(summarizeToolOutcomes([{ root }, { root: failed }]), { failures: 1, stopped: 1 });
 assert.deepEqual(summarizeToolOutcomes([]), { failures: 0, stopped: 0 });
});
