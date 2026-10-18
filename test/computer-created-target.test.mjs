import test from 'node:test';
import assert from 'node:assert/strict';
import {createComputerSession} from '../src/dsh/computer.mjs';

for (const code of ["await cua.createBrowserTab('dsh-browser', 'https://example.test')", "const browser = await cua.getBrowser({id:'dsh-browser'}); await browser.newTab('https://example.test')"]) {
  test('created tab survives selection failure with recoverable identity: ' + code, async t => {
    const target = {id:'created-tab', backend:'browser', browserId:'dsh-browser', verified:false};
    let created=0, recover=false;
    const computer=createComputerSession(async endpoint => {
      if(endpoint==='targets') return {ok:true,targets:[],browsers:[{id:'dsh-browser'}]};
      if(endpoint==='openTarget') {created++;return {ok:true,target};}
      if(endpoint==='select') return {ok:true,target};
      if(endpoint==='resume') return recover ? {ok:true,target:{...target,verified:true}} : {ok:false,error:{code:'RELEASE_FAILED',message:'Input release failed'}};
      if(endpoint==='stop') return {ok:true};
      throw new Error(endpoint);
    });
    t.after(()=>computer.reset());
    await assert.rejects(computer.run({code}), error => {
      assert.equal(error.code,'RELEASE_FAILED');
      assert.equal(error.details.created,true);
      assert.equal(error.details.target.id,target.id);
      assert.match(error.message,/created-tab.*created/);
      assert.match(error.message,/Do not create another tab/);
      return true;
    });
    assert.equal(created,1);
    recover=true;
    assert.equal((await computer.run({code:"await cua.getTab('created-tab')"})).ok,true);
    assert.equal(created,1);
  });
}

test('tab visibility is explicit and unsupported options fail before creating a tab', async t => {
  const calls = [], target = {id:'new-tab',backend:'browser',browserId:'dsh-browser',verified:true};
  let showFails = false;
  const computer = createComputerSession(async endpoint => {
    calls.push(endpoint);
    if (endpoint === 'openTarget' || endpoint === 'select') return {ok:true,target};
    if (endpoint === 'observe') return {ok:true,observation:{id:'one',ax:{nodes:[]}}};
    if (endpoint === 'focus' && showFails) return {ok:false,error:{code:'SHOW_FAILED',message:'Cannot show tab'}};
    return {ok:true};
  });
  t.after(()=>computer.reset());
  await computer.run({code:"await cua.createBrowserTab('dsh-browser','about:blank',{visible:false})"});
  assert.equal(calls.includes('focus'),false);
  calls.length = 0;
  await computer.run({code:"await cua.createBrowserTab('dsh-browser','about:blank',{visible:true})"});
  assert.deepEqual(calls,['openTarget','select','observe','focus']);
  calls.length = 0;
  await assert.rejects(computer.run({code:"await cua.createBrowserTab('dsh-browser','about:blank',{sessionName:'ignored'})"}),/sessionName/);
  assert.deepEqual(calls,[]);
  showFails = true;
  await assert.rejects(computer.run({code:"await cua.createBrowserTab('dsh-browser','about:blank',{visible:true})"}), error => {
    assert.equal(error.details.created,true);
    assert.equal(error.details.stage,'show');
    assert.equal(error.details.target.id,'new-tab');
    return true;
  });
});
