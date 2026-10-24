import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaywrightAPI} from '../src/dsh/browser-api.mjs';
import {createGuestDriver} from '../src/client/guest-driver.mjs';
import {actOnPage} from '../src/browser/actions.mjs';
import {runCDPLocator} from '../extension/cdp-locator.js';
import {clickModifierKeys,clickParameters} from '../extension/click-options.js';
import {locatorInputFixture} from './fixtures/locator-input.mjs';

const locator = [{kind:'css',value:'#target'}];
const invalid = error => error.code === 'INVALID_ARGUMENT' && error.details.inputDispatched === false;

test('locator modifier arrays validate and normalize before dispatch, retaining target-specific ControlOrMeta',async() => {
  const requests = [], api = createPlaywrightAPI(async(_,request) => {requests.push(request);},value => value);
  for (const modifiers of [null,'Shift',{},1,[null],[''],['Shift+Alt'],['Enter'],['Shift','shift'],['Control','Ctrl'],['Cmd','Super'],['ControlOrMeta','controlormeta']]) {
    for (const method of ['click','dblclick']) await assert.rejects(api.locator('#target')[method]({modifiers}),invalid);
  }
  assert.equal(requests.length,0);
  await api.locator('#target').click({modifiers:[' shift ','option','ControlOrMeta']});
  assert.deepEqual(requests[0].args.modifiers,['Shift','Alt','ControlOrMeta']);
  assert.deepEqual(clickModifierKeys(['ControlOrMeta'],{mac:true}),['Meta']);
  assert.deepEqual(clickModifierKeys(['ControlOrMeta'],{mac:false}),['Control']);
  for (const mac of [true,false]) {
    assert.throws(() => clickModifierKeys(['ControlOrMeta',mac ? 'Cmd' : 'Ctrl'],{mac}),invalid);
    assert.deepEqual(clickParameters({key:'shift+option'},{mac}).keys,['Shift','Alt']);
  }
});

test('serialized DOM locator accepts modifiers and rejects unadvertised options before scrolling',async() => {
  const f = locatorInputFixture();
  await runCDPLocator(f.send,{locator,method:'click',args:{modifiers:['Shift']}},() => 1,f.router);
  assert(f.scrolls > 0);
  const before = f.scrolls;
  for (const args of [{modifiers:'Shift'},{modifiers:['Ctrl','Control']},{modifiers:['Shift'],force:true},{durationMs:1},{key:'Shift'}]) {
    await assert.rejects(runCDPLocator(f.send,{locator,method:'dblclick',args},() => 1,f.router),error =>
      ['INVALID_ARGUMENT','UNSUPPORTED_LOCATOR'].includes(error.code) && error.details.inputDispatched === false);
  }
  assert.equal(f.scrolls,before);
});

function standalone() {
  const f = locatorInputFixture(), events = [], held = new Set();
  const record = {session:{send:f.send},frameRouter:f.router,documentGeneration:0,nextElementId:0,elements:new Map(),pending:new Set(),keys:new Set(),buttons:new Set(),
    page:{keyboard:{down:async key => {held.add(key);events.push(['keyDown',key]);},up:async key => {held.delete(key);events.push(['keyUp',key]);}},
      mouse:{move:async() => {},down:async value => events.push(['mouseDown',value,[...held]]),up:async value => events.push(['mouseUp',value,[...held]])}}};
  const act = request => actOnPage(record,request,{persistInputs:async() => {}});
  return {...f,record,events,act};
}

function guest(hook = () => {}) {
  const f = locatorInputFixture(), events = [];
  const driver = createGuestDriver({addEventListener(){},getURL:() => 'https://fixture.invalid/',getTitle:() => 'Fixture'}, {},() => {},() => {},() => {},undefined,async(operation,args) => {
    events.push({operation,args});await hook(operation,args);
    if (operation === 'locator') return runCDPLocator(f.send,args,() => 'button',f.router);
    if (operation === 'point') return {x:30,y:30};
    if (operation === 'releaseInput') return {released:true};
    return {};
  });
  return {...f,events,driver};
}

test('standalone locator click and double-click hold modifiers across actual mouse calls and release once',async() => {
  for (const [method,count] of [['click',1],['dblclick',2]]) {
    const f = standalone();
    await f.act({action:'locator',locator,method,args:{button:'right',modifiers:['Shift','Option']}});
    assert.deepEqual(f.events.filter(([type]) => type === 'mouseDown').map(([,options,keys]) => [options,keys]),
      Array.from({length:count},(_,index) => [{button:'right',clickCount:index+1},['Shift','Alt']]));
    assert.deepEqual(f.events.filter(([type]) => type === 'mouseUp').map(([,options,keys]) => [options,keys]),
      Array.from({length:count},(_,index) => [{button:'right',clickCount:index+1},['Shift','Alt']]));
    assert.deepEqual(f.events.filter(([type]) => type.startsWith('key')),[['keyDown','Shift'],['keyDown','Alt'],['keyUp','Alt'],['keyUp','Shift']]);
    assert.equal(f.record.keys.size,0);assert.equal(f.record.buttons.size,0);
  }
});

test('DSH guest locator click and double-click carry modifiers into host mouse input and release once',async() => {
  for (const [method,count] of [['click',1],['dblclick',2]]) {
    const f = guest();
    await f.driver.act({action:'locator',locator,method,args:{modifiers:['Shift','Option']}});
    const input = f.events.filter(event => event.operation === 'input').map(event => event.args);
    assert.deepEqual(input.filter(event => event.type === 'mouseDown').map(event => [event.clickCount,event.modifiers]),
      Array.from({length:count},(_,index) => [index+1,['shift','alt']]));
    assert.deepEqual(input.filter(event => event.type === 'mouseUp').map(event => event.modifiers),Array.from({length:count},() => ['shift','alt']));
    assert.deepEqual(input.filter(event => event.type.startsWith('key')).map(event => [event.type,event.keyCode]),
      [['keyDown','Shift'],['keyDown','Alt'],['keyUp','Alt'],['keyUp','Shift']]);
  }
});

test('locator explicit modifiers including an empty array reject held inputs before resolving or scrolling',async() => {
  for (const modifiers of [[],['Shift']]) {
    const f = standalone();f.record.keys.add('Alt');
    await assert.rejects(f.act({action:'locator',locator,method:'click',args:{modifiers}}),error => error.code === 'INPUT_ALREADY_HELD' && error.details.inputDispatched === false);
    assert.deepEqual(f.calls,[]);assert.deepEqual(f.events,[]);assert.deepEqual([...f.record.keys],['Alt']);
    const g = guest();await g.driver.act({action:'keyDown',key:'Alt'});
    g.events.length = 0;
    await assert.rejects(g.driver.act({action:'locator',locator,method:'dblclick',args:{modifiers}}),error => error.code === 'INPUT_ALREADY_HELD' && error.details.inputDispatched === false);
    assert.equal(g.events.some(event => event.operation === 'locator' || event.operation === 'input'),false);
    assert.deepEqual(g.calls,[]);
  }
});

test('an uncertain modified locator click is never replayed by the facade',async() => {
  const f = guest((operation,args) => {if (operation === 'input' && args.type === 'mouseDown') throw new Error('uncertain mouse dispatch');});
  const api = createPlaywrightAPI(async(action,request) => f.driver.act({action,...request}),value => value);
  await assert.rejects(api.locator('#target').click({modifiers:['Shift']}),error => error.message === 'uncertain mouse dispatch' && error.details.inputDispatched === true);
  assert.equal(f.events.filter(event => event.operation === 'input' && event.args.type === 'mouseDown').length,1);
  assert.equal(f.events.filter(event => event.operation === 'locator').length,1);
  await f.driver.release();
});
