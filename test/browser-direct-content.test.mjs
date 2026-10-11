import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { frontendComponents, componentHostPrimitives } from './fixtures/frontend-components.mjs';

test('direct Browser content creates once, navigates the existing target and obeys disabled control', async t => {
  const { page, errors } = await frontendComponents(t);
  const { outputFiles } = await build({ plugins: [await componentHostPrimitives()], bundle: true, write: false,
    platform: 'browser', format: 'iife', loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';
      import{BrowserControls}from'./src/client/browser-controls.jsx';
      window.fixture={calls:[]};
      function Harness(){const[state,setState]=useState(null),controls=useRef();window.fixture.controls=controls;window.fixture.setState=setState;window.fixture.state=state;
        const api=async(op,id,input)=>{window.fixture.calls.push({op,id,input});
          if(op==='tabs'&&!input)return{tabs:state?.target?[{...state.target,available:true}]:[]};
          if(op==='tabs'&&input.action==='new')return new Promise(resolve=>window.fixture.release=()=>resolve({...state,target:{kind:'tab',id:'created',browserId:'browser',title:'验收网页',url:input.url??'about:blank'},viewTarget:null}));
          if(op==='navigate')return{...state,target:{...state.target,url:input.url}};
          return state;
        };
        return <BrowserControls ref={controls} renderTabs={tabs=>tabs} sessionId="direct" visible state={state}
          navigation={state?.target?{...state.target,tabId:state.target.id,canGoBack:true}:null}
          api={api} onState={setState} onError={error=>window.fixture.error=error}/>;
      }createRoot(document.getElementById('root')).render(<Harness/>);
    ` } });
  await page.addScriptTag({ content: outputFiles[0].text });
  const address = page.getByLabel('浏览器地址', { exact: true });
  const creates = () => page.evaluate(() => window.fixture.calls.filter(call => call.op === 'tabs' && call.input?.action === 'new'));
  await address.waitFor();
  assert.equal(await address.isDisabled(), true);
  await page.evaluate(() => window.fixture.controls.current.shortcut('new'));
  assert.deepEqual(await creates(), []);
  await page.evaluate(() => window.fixture.setState({ enabled: true, status: 'idle', controlEpoch: 12 }));
  await page.waitForFunction(() => !document.querySelector('[aria-label="浏览器地址"]').disabled);
  await address.fill('https://direct.example.invalid/path?q=1');
  await address.press('Enter');
  await page.waitForFunction(() => typeof window.fixture.release === 'function');
  await page.evaluate(() => window.fixture.controls.current.shortcut('new'));
  const first = await creates();
  assert.equal(first.length, 1, 'a pending explicit create cannot be duplicated');
  assert.equal(first[0].input.url, 'https://direct.example.invalid/path?q=1');
  assert.equal(first[0].input.controlEpoch, 12);
  await page.evaluate(() => { window.fixture.release(); delete window.fixture.release; });
  await page.getByRole('tab', { name: '验收网页', exact: true }).waitFor();
  await address.fill('https://next.example.invalid/path');
  await address.press('Enter');
  await page.waitForFunction(() => window.fixture.state.target.url === 'https://next.example.invalid/path');
  assert.equal((await creates()).length, 1, 'an existing target navigates instead of creating another browser');
  const navigation = await page.evaluate(() => window.fixture.calls.find(call => call.op === 'navigate'));
  assert.equal(navigation.input.tabId, 'created');
  assert.equal(navigation.input.controlEpoch, 12);
  for (const disabled of [{ enabled: false }, { enabled: true, resuming: true }, { enabled: true, transitioning: true }]) {
    await page.evaluate(disabled => window.fixture.setState({ ...window.fixture.state, resuming: false, transitioning: false, ...disabled }), disabled);
    await page.waitForFunction(() => document.querySelector('[aria-label="浏览器地址"]').disabled);
    await page.evaluate(() => window.fixture.controls.current.shortcut('new'));
    assert.equal((await creates()).length, 1, 'disabled or transitioning controls cannot issue a new browser action');
  }
  assert.deepEqual(errors, []);
});
