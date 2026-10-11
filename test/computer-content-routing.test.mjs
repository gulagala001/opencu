import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { frontendComponents, componentHostPrimitives } from './fixtures/frontend-components.mjs';

// Browser content lives in the native workspace now. A passive browser body
// must not start an inventory or retarget an application controlled elsewhere.
test('empty Browser chrome and an application target remain passive until an explicit action', async t => {
  const { page, errors } = await frontendComponents(t);
  const { outputFiles } = await build({ plugins: [await componentHostPrimitives()], bundle: true, write: false,
    platform: 'browser', format: 'iife', loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
      import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {BrowserControls} from './src/client/browser-controls.jsx';
      window.fixture={calls:[]};
      function Harness(){ const [state,setState]=useState({enabled:true,status:'stopped',controlEpoch:7,target:null,viewTarget:null});window.fixture.setState=setState;
        const api=async(op,id,input)=>{window.fixture.calls.push({op,id,input});return state;};
        return <BrowserControls sessionId="passive" state={state} visible api={api} onState={setState} onError={error=>window.fixture.error=error}/>;
      } createRoot(document.getElementById('root')).render(<Harness/>);
    ` } });
  await page.addScriptTag({ content: outputFiles[0].text });
  await page.getByLabel('浏览器地址', { exact: true }).waitFor();
  await page.waitForTimeout(1700);
  assert.deepEqual(await page.evaluate(() => window.fixture.calls), [], 'empty content cannot cold-list or create a browser');
  await page.evaluate(() => window.fixture.setState({ enabled: true, status: 'running', controlEpoch: 23,
    target: { kind: 'app', id: 'document', name: '文稿' }, viewTarget: { kind: 'app', id: 'document', name: '文稿' } }));
  await page.waitForTimeout(1700);
  assert.deepEqual(await page.evaluate(() => window.fixture.calls), [], 'rendering Browser content cannot take control away from an application');
  assert.equal(await page.getByRole('button', { name: '恢复助手控制', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
});
