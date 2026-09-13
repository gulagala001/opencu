import test from 'node:test';
import assert from 'node:assert/strict';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';
const fixture=()=>{
 const manager=Object.create(ComputerUseManager.prototype),states=new Map(),browser={id:'browser'};
 manager.session=id=>{if(!states.has(id))states.set(id,{id,target:{kind:'tab',id:'tab',browserId:'browser'}});return states.get(id);};
 manager.browserFor=()=>browser;manager.browserForTab=()=>browser;return manager;
};
test('presentation requires matching acknowledgement and another client failure cannot preempt success',async()=>{
 const m=fixture(),pending=m.presentBrowser('one','browser',true),request=m.session('one').presentationRequest;
 assert.ok(request.expiresAt>Date.now());
 assert.throws(()=>m.acknowledgePresentation('two',{id:request.id,visible:true}),/expired/);
 assert.throws(()=>m.acknowledgePresentation('one',{id:'old',visible:true}),/expired/);
 assert.throws(()=>m.acknowledgePresentation('one',{id:request.id,visible:false}),/does not match/);
 m.acknowledgePresentation('one',{id:request.id,visible:true,error:'another client cannot show'});
 m.acknowledgePresentation('one',{id:request.id,visible:true});
 assert.deepEqual(await pending,{visible:true,surface:'dsh-preview',tabId:'tab'});
 assert.equal(m.session('one').presentationRequest,null);
 assert.deepEqual(m.acknowledgePresentation('one',{id:request.id,visible:true}),{acknowledged:true});
});
test('cancelled presentation expires and cannot be acknowledged later',async()=>{
 const m=fixture(),controller=new AbortController(),pending=m.presentBrowser('one','browser',false,controller.signal),request=m.session('one').presentationRequest;
 controller.abort(new Error('cancelled test'));
 await assert.rejects(pending,/cancelled test/);assert.equal(m.session('one').presentationPending,null);
 assert.throws(()=>m.acknowledgePresentation('one',{id:request.id,visible:false}),/expired/);
 await assert.rejects(m.presentBrowser('one','browser','yes'),/boolean/);
});
test('no active UI produces an explicit timeout rather than a claimed display',async()=>{
 const m=fixture();await assert.rejects(m.presentBrowser('one','browser',true),/No active DSH page confirmed/);
 assert.equal(m.session('one').presentationRequest,null);assert.equal(m.session('one').presentationCompleted,undefined);
});
