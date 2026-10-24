import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext,SourceTextModule,SyntheticModule} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createUserActivityMonitor} from '../src/browser/user-activity.mjs';
import {keyboardInputTypes} from '../extension/keyboard.js';
import {actOnPage} from '../src/browser/actions.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {installDocumentRuntime} from '../extension/content.js';

async function fixture(route) {
  const listeners=new Map(),plain={nodeType:1,tagName:'TEXTAREA',closest:()=>null},other={nodeType:1,tagName:'TEXTAREA',closest:()=>null};
  const rich={nodeType:1,tagName:'DIV',isContentEditable:true,parentElement:null,closest:()=>null};
  const leaf={nodeType:1,tagName:'B',isContentEditable:true,parentElement:rich};
  let clock=10000,count=0;
  const context=createContext({crypto:webcrypto,performance:{now:()=>clock},setTimeout,clearTimeout,Date,
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
    document:{activeElement:plain},location:{href:'https://fixture.test/'},MutationObserver:class{observe(){}},visualViewport:null,
    innerWidth:100,innerHeight:100,scrollX:0,scrollY:0,devicePixelRatio:1});
  runInContext('globalThis.window=globalThis;window.top=window;',context);
  let api;
  if(route==='standalone'){
    const session={async send(method,args={}){
      if(method==='Page.addScriptToEvaluateOnNewDocument')return {identifier:'marker'};
      if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main'}}};
      if(method==='Page.createIsolatedWorld')return {executionContextId:1};
      if(method==='Runtime.evaluate')return {result:{value:runInContext(args.expression,context)}};
      return {};
    }};
    const monitor=await createUserActivityMonitor(session);api={expect:events=>monitor.expect(events),finish:id=>monitor.finish(id),read:async()=>(await monitor.read())?.sequence??0};
  }else if(route==='extension'){
    runInContext(`(${installDocumentRuntime.toString()})()`,context);
    const invoke=(name,args)=>context.__opencuDocument.run(name,args);
    api={expect:events=>invoke('expectInput',{events}),finish:marker=>invoke('finishInput',{...marker,dispatched:true}),read:()=>invoke('identity').userActivity?.sequence??0};
  }else{
    const module=new SourceTextModule(await readFile(new URL('../src/client/page-annotations.mjs',import.meta.url),'utf8'),{context});
    const exports={mountBrowserCommentRuntime:()=>({dispose(){},setSiteAnnotationPreview(){}}),createAnnotationControls:()=>({getTargets(){},getControls(){},dispose(){}}),
      createAnnotationRequests:()=>({subscribe(){},clear(){},dispose(){}}),observeAnnotationFeatures:()=>({recordUse(){},dispose(){}}),installSiteAnnotationApi:()=>null};
    await module.link(specifier=>{assert.equal(specifier,'./rea-page-runtime.js');return new SyntheticModule(Object.keys(exports),function(){for(const[name,value]of Object.entries(exports))this.setExport(name,value);},{context});});
    await module.evaluate();module.namespace.install({});
    const bridge=context.__opencuAnnotations;
    api={expect:events=>bridge.expectInput(events),finish:id=>bridge.finishInput(id,true),read:()=>{count+=bridge.drain().filter(item=>item.type==='opencu-user-activity').length;return count;}};
  }
  return {...api,plain,other,rich,leaf,active:target=>{context.document.activeElement=target;},
    event(type,props={}){clock++;listeners.get(type)?.({type,isTrusted:true,target:plain,...props});},tick:()=>{clock+=300;}};
}
const key = (key='v',types=['insertFromPaste']) => ({type:'keydown',key,inputTypes:types});
const auto = async(f,types=['insertFromPaste'],target=f.plain,beforeTarget=target) => {
  f.active(target);const marker=await f.expect([key('KeyV',types)]);
  f.event('keydown',{key:'v',code:'KeyV',target});
  f.event('beforeinput',{inputType:types[0],data:null,target:beforeTarget});
  f.event('input',{inputType:types[0],data:null,target});return marker;
};

for(const route of ['standalone','extension','dsh']){
  test(`${route}: keyboard edits require matching real keydown, editor and InputType`,async()=>{
    const f=await fixture(route),marker=await auto(f);assert.equal(await f.read(),0);await f.finish(marker);
    f.event('beforeinput',{inputType:'insertFromPaste',data:null});f.event('input',{inputType:'insertFromPaste',data:null});assert.equal(await f.read(),1,'finished keyboard marker must not hide the next real edit');
    const unarmed=await fixture(route);await unarmed.expect([key()]);unarmed.event('beforeinput',{inputType:'insertFromPaste',data:null});unarmed.event('input',{inputType:'insertFromPaste'});assert.equal(await unarmed.read(),1,'a pre-dispatch edit is not automated');
    for(const mismatch of ['target','type']){
      const f=await fixture(route);await f.expect([key()]);f.event('keydown',{key:'v',code:'KeyV'});
      const target=mismatch==='target'?f.other:f.plain,inputType=mismatch==='type'?'historyUndo':'insertFromPaste';
      f.event('beforeinput',{target,inputType,data:null});f.event('input',{target,inputType});assert.equal(await f.read(),1,mismatch);
    }
  });
  test(`${route}: rich editing host normalization and interrupted/no-op shortcuts leave no broad input allowance`,async()=>{
    const f=await fixture(route),marker=await auto(f,['deleteByCut'],f.rich,f.leaf);assert.equal(await f.read(),0);await f.finish(marker);
    for(const type of ['keydown','pointerdown','wheel']){
      const f=await fixture(route);const marker=await f.expect([key()]);f.event('keydown',{key:'v',code:'KeyV'});
      f.event(type,{key:'x',code:'KeyX'});f.event('beforeinput',{inputType:'insertFromPaste'});f.event('input',{inputType:'insertFromPaste'});assert((await f.read())>=1,type);await f.finish(marker);
    }
    const noOp=await fixture(route),token=await noOp.expect([key('z',['historyUndo'])]);noOp.event('keydown',{key:'z',code:'KeyZ'});await noOp.finish(token);
    noOp.event('input',{inputType:'historyUndo'});assert.equal(await noOp.read(),1,'a no-op command cannot consume later human input');
  });
}

test('one physical key mapping covers platform edit commands and never marks copy/navigation as text edits',()=>{
  for(const [code,bits,mac,types]of [['KeyV',4,true,['insertFromPaste','insertFromPasteAsQuotation']],['KeyX',2,false,['deleteByCut']],['KeyZ',4,true,['historyUndo']],['KeyZ',12,true,['historyRedo']],['KeyY',2,false,['historyRedo']],['Insert',8,true,['insertFromPaste','insertFromPasteAsQuotation']],['KeyH',2,true,['deleteContentBackward']],['KeyA',0,true,['insertText','insertReplacementText']]])assert.deepEqual(keyboardInputTypes(code,bits,mac),types);
  for(const[code,bits]of [['KeyC',4],['KeyA',4],['ArrowLeft',4],['modifier:Meta',4]])assert.deepEqual(keyboardInputTypes(code,bits,true),[]);
});

test('standalone modifier/key aliases and failed dispatch clean exact keyboard markers',async()=>{
  const events=[],finished=[],record={page:{keyboard:{down:async()=>{},up:async()=>{}}},session:{send:async()=>({})},pending:new Set(),keys:new Set(),buttons:new Set()};
  const options={persistInputs:async()=>{},expectInput:async value=>{events.push(value);return {id:events.length};},finishInput:async marker=>finished.push(marker.id)};
  await actOnPage(record,{action:'press',key:'MetaLeft+KeyV'},options);
  assert.deepEqual(events[1],[key('KeyV',['insertFromPaste','insertFromPasteAsQuotation'])]);assert.deepEqual(finished,[1,2]);
  record.page.keyboard.down=async()=>{throw Object.assign(Error('rejected'),{details:{inputDispatched:false}});};
  await assert.rejects(actOnPage(record,{action:'keyDown',key:'ShiftRight'},options),/rejected/);assert.equal(finished.at(-1),3);
});


test('guest driver sends the same narrow marker and finishes it even when native dispatch is refused',async()=>{
  const calls=[];let rejected=false;
  const driver=createGuestDriver({addEventListener(){},getURL:()=> 'https://fixture.test/',getTitle:()=> 'Fixture'}, {},()=>{},()=>{},()=>{},undefined,async(operation,args)=>{
    calls.push({operation,args});if(operation==='inputMarker'&&args.method==='expect')return 'exact-marker';
    if(rejected&&operation==='input'&&args.type==='keyDown')throw Object.assign(Error('native key refused'),{details:{inputDispatched:false}});
    return {};
  });
  const primary=/Mac/u.test(globalThis.navigator?.platform??'')?'Meta':'Control';
  await driver.act({action:'press',key:primary+'+v'});
  const marked=calls.filter(row=>row.operation==='inputMarker'&&row.args.method==='expect');
  assert(marked.every(row=>row.args.events.length===1&&row.args.events[0].type==='keydown'));
  assert.deepEqual(marked.at(-1).args.events[0].inputTypes,['insertFromPaste','insertFromPasteAsQuotation']);
  assert.equal(calls.filter(row=>row.operation==='inputMarker'&&row.args.method==='finish').length,2);
  calls.length=0;rejected=true;await assert.rejects(driver.act({action:'press',key:'v'}),/native key refused/);
  const finish=calls.find(row=>row.operation==='inputMarker'&&row.args.method==='finish');assert.equal(finish.args.marker,'exact-marker');assert.equal(finish.args.dispatched,false);
});


for(const route of ['standalone','extension','dsh']) {
  test(`${route}: native value control navigation is exact, cleaned and never exempts text navigation`,async()=>{
    for(const [tagName,type,code] of [['SELECT',undefined,'ArrowDown'],['SELECT',undefined,'Home'],['SELECT',undefined,'End'],['SELECT',undefined,'PageUp'],['SELECT',undefined,'PageDown'],['SELECT',undefined,'Space'],['INPUT','range','ArrowRight'],['INPUT','number','ArrowUp'],['INPUT','date','ArrowUp'],['INPUT','time','Digit1']]) {
      const f=await fixture(route),control={nodeType:1,tagName,type,isConnected:true,matches:()=>false,closest:()=>null};f.active(control);
      const marker=await f.expect([{type:'keydown',key:code,...code==='Digit1'?{inputTypes:['insertText']}: {}}]);f.event('keydown',{target:control,key:code,code});
      if (['number','date','time'].includes(type)) f.event('beforeinput',{target:control,inputType:'insertText',data:'4'});
      f.event('input',{target:control});assert.equal(await f.read(),0,`${tagName}/${type}/${code}`);await f.finish(marker);
      f.event('input',{target:control});assert.equal(await f.read(),1,'finished control marker must not mask manual value changes');
    }
    const stepped=await fixture(route),number={nodeType:1,tagName:'INPUT',type:'number',matches:()=>false,closest:()=>null};stepped.active(number);const transaction=await stepped.expect([{type:'keydown',key:'ArrowUp'}]);stepped.event('keydown',{target:number,key:'ArrowUp',code:'ArrowUp'});stepped.event('beforeinput',{target:number,inputType:'insertText',data:'4'});stepped.event('input',{target:number});assert.equal(await stepped.read(),0);stepped.event('input',{target:number});assert.equal(await stepped.read(),1,'one step cannot exempt a second plain input');await stepped.finish(transaction);
    for(const [tagName,type,code]of [['TEXTAREA',undefined,'ArrowDown'],['SELECT',undefined,'F1'],['INPUT','number','Home']]) {
      const f=await fixture(route),control={nodeType:1,tagName,type,matches:()=>false,closest:()=>null};f.active(control);
      await f.expect([{type:'keydown',key:code}]);f.event('keydown',{target:control,key:code,code});f.event('input',{target:control});assert.equal(await f.read(),1,'no native effect must not leave a generic allowance');
    }
  });
  test(`${route}: radio navigation allows only enabled same-tree/form/name members`,async()=>{
    const makeGroup=()=>{
      const root={querySelectorAll:()=>members},otherRoot={},form={},members=[];
      const radio=(extra={})=>({nodeType:1,tagName:'INPUT',type:'radio',name:'group',form,isConnected:true,matches:()=>false,getRootNode:()=>root,closest:()=>null,...extra});
      const source=radio(),next=radio(),differentName=radio({name:'other'}),differentForm=radio({form:{}}),differentRoot=radio({getRootNode:()=>otherRoot}),disabled=radio({matches:()=>true});members.push(source,next,differentName,differentForm,differentRoot,disabled);return {source,next,differentName,differentForm,differentRoot,disabled};
    };
    const group=makeGroup(),f=await fixture(route);f.active(group.source);const marker=await f.expect([{type:'keydown',key:'ArrowRight'}]);f.event('keydown',{target:group.source,key:'ArrowRight',code:'ArrowRight'});f.event('input',{target:group.next});assert.equal(await f.read(),0);await f.finish(marker);f.event('input',{target:group.next});assert.equal(await f.read(),1);
    for(const mismatch of ['differentName','differentForm','differentRoot','disabled']) {
      const group=makeGroup(),f=await fixture(route);f.active(group.source);await f.expect([{type:'keydown',key:'ArrowRight'}]);f.event('keydown',{target:group.source,key:'ArrowRight',code:'ArrowRight'});f.event('input',{target:group[mismatch]});assert.equal(await f.read(),1,mismatch);
    }
    const disabled=makeGroup(),blocked=await fixture(route);disabled.source.matches=()=>true;blocked.active(disabled.source);await blocked.expect([{type:'keydown',key:'ArrowRight'}]);blocked.event('keydown',{target:disabled.source,key:'ArrowRight',code:'ArrowRight'});blocked.event('input',{target:disabled.next});assert.equal(await blocked.read(),1,'disabled source cannot authorize its group');
  });
}

test('extension pointer checkbox input belongs only to the confirmed clicked control',async()=>{
  const f=await fixture('extension'),control={nodeType:1,tagName:'INPUT',type:'checkbox',closest:()=>null};
  const marker=await f.expect([{type:'pointerdown',target:control}]);
  f.event('pointerdown',{target:control,button:0});f.event('click',{target:control});f.event('input',{target:control});assert.equal(await f.read(),0);
  await f.finish(marker);f.event('input',{target:control});assert.equal(await f.read(),1,'completed click cannot hide a later manual value change');
  const separate=await fixture('extension');await separate.expect([{type:'pointerdown',target:control}]);separate.event('pointerdown',{target:control,button:0});separate.event('click',{target:control});separate.event('input',{target:separate.other});assert.equal(await separate.read(),1,'another control is never exempted');
});
