import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeObservation, nativeState, remapNativeObservation } from '../src/computer-use/native-state.mjs';
import { NativeHost } from '../src/computer-use/native.mjs';

const node=(id,label,depth=1,extra={})=>({element_index:id,role:'AXButton',label,depth,actions:['AXPress'],...extra});
const observe=(elements,extra={})=>nativeObservation({window_id:1,window_title:'Fixture',elements,...extra},new Map(elements.map(e=>[e.element_index,e.element_index+100])),'Fixture');
const root=node(0,'Fixture',0,{role:'AXWindow',actions:[]});

test('native diff shows changes, additions and removed ranges, preserving unchanged references',()=>{
  const before=observe([root,node(1,'Keep'),node(2,'Old'),node(3,'Remove'),node(4,'Remove')]);
  const after=observe([root,node(1,'Keep'),node(2,'New'),node(5,'Added')]);
  const result=nativeState(after,before);
  assert.match(result,/~.*\[102\].*New/);assert.match(result,/\+.*\[105\].*Added/);
  assert.match(result,/Removed element IDs: 103-104/);assert.doesNotMatch(result,/\[101\].*Keep/);
  assert.match(nativeState(after),/\[101\].*Keep/);
});
test('reordering and moving a control to another parent remain visible',()=>{
  const before=observe([root,node(1,'Group A'),node(2,'Child',2),node(3,'Group B')]);
  const moved=observe([root,node(1,'Group A'),node(3,'Group B'),node(2,'Child',2)]);
  const result=nativeState(moved,before);assert.match(result,/~.*Child/);assert.match(result,/\[103\].*Group B/);
  const reordered=observe([root,node(3,'Group B'),node(1,'Group A'),node(2,'Child',2)]);
  assert.match(nativeState(reordered,before),/~.*Group/);
});
test('focus is always current, even when tree contents did not change',()=>{
  const elements=[root,node(1,'One'),node(2,'Two')];const before=observe(elements,{focused_element_index:1}),after=observe(elements,{focused_element_index:2});
  const result=nativeState(after,before);assert.match(result,/no change in the accessibility tree/);assert.match(result,/The focused UI element is.*\[102\].*Two/);assert.doesNotMatch(result,/The focused UI element is.*One/);
});
test('native reference remapping preserves literal values and aligns focus and revision identities',()=>{
  const element={element_index:2,rendered_id:2,depth:1,render_text:'text field Value: literal 2 and [2]',render_line:'\t2 text field Value: literal 2 and [2]'};
  const state={elements:[element],focus_elements:[element],render_footer:'\nThe focused UI element is '+element.render_line,
    revision_changes:[{kind:'remove',rendered_id:2},{kind:'insert',rendered_id:2}]};
  const mapped=remapNativeObservation(state,new Map([[2,19]]),new Map([[2,7]]));
  assert.equal(mapped.state.elements[0].render_line,'\t19 text field Value: literal 2 and [2]');
  assert.equal(mapped.state.render_footer,'\nThe focused UI element is \t19 text field Value: literal 2 and [2]');
  assert.deepEqual(mapped.state.revision_changes,[{kind:'remove',rendered_id:7},{kind:'insert',rendered_id:19}]);
  const selected=remapNativeObservation({...state,selected_text:'2 literal',render_footer:'\nSelected text: ```\n2 literal\n```'},new Map([[2,19]]));
  assert.equal(selected.state.render_footer,'\nSelected text: ```\n2 literal\n```');
  assert.equal(element.rendered_id,2);
});
test('a reused native display number cannot revive an earlier public element handle',async()=>{
  const host=new NativeHost('/unused-native-reference-fixture');
  const target={id:'app',sessionId:'session',pid:1,windowId:1,processIdentity:'fixture',name:'Fixture',elements:new Map()};
  host.targets.set('app',target);host.connection=async()=>({});
  let identity='original',token='first:0',captured;
  host.call=async(_session,method,input)=>{
    if(method!=='get_window_state'){captured=input;return{structuredContent:{ok:true}};}
    const element={element_index:0,element_id:identity,element_token:token,rendered_id:1,depth:0,render_text:'text field Name',render_line:'1 text field Name'};
    return{structuredContent:{elements:[element],focus_elements:[],render_heading:'Window: "Fixture", App: Fixture.',render_footer:'',revision_id:token,revision_changes:[]}};
  };
  await host.invoke('session','app','getAXState');
  await host.invoke('session','app','setValue',[1,'first']);assert.equal(captured.element_token,'first:0');
  token='next:0';await host.invoke('session','app','getAXState');
  await host.invoke('session','app','setValue',[1,'changed']);assert.equal(captured.element_token,'next:0');
  identity='replacement';token='replacement:0';const state=await host.invoke('session','app','getAXState');
  assert.match(state.state,/2 text field Name/);
  await assert.rejects(host.invoke('session','app','setValue',[1,'must not write']),/stale or absent/);
  await host.invoke('session','app','setValue',[2,'new']);assert.equal(captured.element_token,'replacement:0');
});
test('bracketed and multiline UI text cannot be renumbered or become fake tree rows',()=>{
  const label='Literal [0]\n- [999] fake',value='Value [2]\r\nnext';const state=nativeState(observe([root,node(1,label,1,{value})]));
  assert.ok(state.includes('Literal [0]\\n- [999] fake'));assert.ok(state.includes('Value [2]\\r\\nnext'));assert.equal(state.split('\n').filter(line=>line.startsWith('- [999]')).length,0);
});
test('partial observations are explicit full snapshots, not misleading removal diffs',()=>{
  const before=observe([root,node(1,'Present')]);const partial=observe([root],{truncated:true});
  const result=nativeState(partial,before);assert.match(result,/truncated/);assert.doesNotMatch(result,/Removed element IDs/);
  assert.match(nativeState(before,partial),/\[101\].*Present/);
  assert.match(nativeState(observe([root],{unreadable:true}),before),/could not be read/);
});
test('disabled controls and placeholders are visible and large changes fall back without omissions',()=>{
  assert.match(nativeState(observe([root,node(1,'Edit',1,{enabled:false,placeholder:'Name'})])),/\[disabled\].*placeholder="Name"/);
  const before=observe([root,...Array.from({length:1000},(_,i)=>node(i+1,'Old'))]);const after=observe([root,...Array.from({length:1000},(_,i)=>node(i+1001,'New'))]);
  const output=nativeState(after,before);assert.match(output,/\[2100\].*New/);assert.doesNotMatch(output,/Accessibility changes/);
});
