import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {transform} from 'esbuild';
import * as keyboard from '../extension/keyboard.js';
import * as inputMonitor from '../extension/input-monitor.js';
import * as locator from '../extension/cdp-locator.js';
import * as selectOptions from '../extension/select-options.js';
import * as fileInput from '../extension/file-input.js';
import * as textEdit from '../extension/text-edit.js';
import * as frameRouter from '../extension/frame-router.js';
import * as axTree from '../extension/ax-tree.js';
import * as scroll from '../extension/scroll.js';

const require=createRequire(import.meta.url);
const {code}=await transform(await readFile(new URL('../host/automation.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs',target:'node22'});

// Exercise the actual host adapter and helpers. The Electron dispatcher and
// dialog scheduling boundary are synthetic; no user window is attached.
function fixture() {
  const events=[],hooks={};let attached=false,failNextGuard=false;
  const failure=Object.assign(Error('dialog/cancellation fence rejected before dispatch'),{code:'SYNTHETIC_PREFLIGHT'});
  const guard=async work=>{if(failNextGuard){failNextGuard=false;if(hooks.navigate){hooks.navigate=false;guest.emit('did-navigate');}else throw failure;}return work();};
  const dialogs={get:()=>({dialog:null}),pending:()=>false,assertClear(){},dismiss(){},guard,
    fence:()=>({guard,close(){},interrupted:false})};
  const guest=Object.assign(new EventEmitter(),{id:71,isDestroyed:()=>false,isCrashed:()=>false,getURL:()=> 'https://fixture.invalid/',
    debugger:Object.assign(new EventEmitter(),{isAttached:()=>attached,attach(){attached=true;},detach(){attached=false;},
      async sendCommand(method,args){
        events.push([method,args]);
        if(method==='Emulation.setFocusEmulationEnabled'&&args.enabled&&hooks.preflight){hooks.preflight=false;failNextGuard=true;}
        if(method.startsWith('Input.')&&hooks.dispatch){const callback=hooks.dispatch;delete hooks.dispatch;await callback(method,args);}
        return {result:{value:null}};
      }}),hostWebContents:{executeJavaScript:async()=>{}}});
  const modules={'./opencu-keyboard.js':keyboard,'./opencu-input-monitor.js':inputMonitor,'./opencu-cdp-locator.js':locator,
    './opencu-select-options.js':selectOptions,'./opencu-file-input.js':fileInput,'./opencu-text-edit.js':textEdit,
    './opencu-frame-router.js':frameRouter,'./opencu-ax-tree.js':axTree,'./opencu-scroll.js':scroll,
    './opencu-downloads.ts':{},'./opencu-site-tools.ts':{},'./opencu-page-image.ts':{},'./opencu-dialogs.ts':{openCUDialogs:()=>dialogs}};
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>name.startsWith('node:')?require(name):modules[name]??assert.fail(name),module,module.exports);
  const run=(operation,args={})=>module.exports.openCUAutomation(guest,operation,args,()=>true);
  return {events,hooks,guest,failure,run,input:args=>run('input',args),inputs:()=>events.filter(([method])=>method.startsWith('Input.'))};
}

test('host unmatched releases preserve human input and aliases release the original owned key once',async()=>{
  const f=fixture();
  assert.equal((await f.input({type:'keyUp',keyCode:'a'})).dispatched,false);
  assert.equal((await f.input({type:'mouseUp',button:'left',x:10,y:10})).dispatched,false);
  assert.deepEqual(f.inputs(),[]);
  await f.input({type:'keyDown',keyCode:'a'});await f.input({type:'keyUp',keyCode:'A'});
  await f.input({type:'keyUp',keyCode:'a'});await f.run('releaseInput');
  assert.deepEqual(f.inputs().map(([,args])=>[args.type,args.key]),[['keyDown','a'],['keyUp','a']]);
});

for(const [name,down,up] of [
  ['key',{type:'keyDown',keyCode:'a'},'keyUp'],
  ['button',{type:'mouseDown',button:'left',x:10,y:10},'mouseReleased'],
]) {
  test(`host ${name} acquires ownership only after the last asynchronous dispatch fence`,async()=>{
    const f=fixture();await f.input({type:'keyDown',keyCode:'Shift'});f.events.length=0;
    f.hooks.preflight=true;
    await assert.rejects(f.input(down),error=>error===f.failure&&error.details.inputDispatched===false);
    await f.run('releaseInput');
    assert.deepEqual(f.inputs().map(([,args])=>[args.type,args.key??args.button]),[['keyUp','Shift']]);
  });
  test(`host ${name} keeps unknown dispatched input owned until its release acknowledgement`,async()=>{
    const f=fixture();f.hooks.dispatch=async()=>{throw Error('lost dispatch acknowledgement');};
    await assert.rejects(f.input(down),error=>error.details.inputDispatched===true);
    await f.run('releaseInput');await f.run('releaseInput');
    assert.equal(f.inputs().length,2);assert.equal(f.inputs()[1][1].type,up);
  });
  test(`host ${name} document change at the final dispatch fence cannot acquire or send input`,async()=>{
    const f=fixture();f.hooks.preflight=true;f.hooks.navigate=true;
    await assert.rejects(f.input(down),error=>error.code==='STALE_ELEMENT'&&error.details.inputDispatched===false);
    await f.run('releaseInput');assert.deepEqual(f.inputs(),[]);
  });
}

test('host document replacement remains an honest input error and a fresh action can continue',async()=>{
  const f=fixture();await f.input({type:'keyUp',keyCode:'a'});f.events.length=0;f.guest.emit('did-navigate');
  await assert.rejects(f.input({type:'keyDown',keyCode:'a',inputActionId:'old',inputDocumentId:'0'}),error=>error.code==='STALE_ELEMENT'&&error.details.inputDispatched===false);
  assert.deepEqual(f.inputs(),[]);
  await f.input({type:'keyDown',keyCode:'b',inputActionId:'new',inputDocumentId:'1'});await f.input({type:'keyUp',keyCode:'b'});
  assert.deepEqual(f.inputs().map(([,args])=>args.key),['b','b']);
});
