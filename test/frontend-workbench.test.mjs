import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {isolateTestDownloads} from './fixtures/computer-use/test-browser.mjs';

// This is a frontend contract fixture. It launches no DSH/Native services and
// installs no extension; stream and HTTP data are explicitly synthetic.
for(const hasTouch of [false,true])test((hasTouch?'touch':'pointer')+': parked preview keeps conversation results clickable and closed intent across late targets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'opencu-frontend-'));
  const evidence = process.env.OPENCU_FRONTEND_EVIDENCE&&join(process.env.OPENCU_FRONTEND_EVIDENCE,hasTouch?'touch-workbench':'pointer-workbench');
  if (evidence) await mkdir(evidence, {recursive: true});
  await isolateTestDownloads(root, join(root, 'profile'));
  const executablePath = process.env.TRISOUL_CU_TEST_BROWSER_EXECUTABLE || chromium.executablePath();
  const context = await chromium.launchPersistentContext(join(root, 'profile'), {
    executablePath, hasTouch, viewport: {width: 1440, height: 1050},
    args: ['--use-mock-keychain', '--password-store=basic'],
    downloadsPath: join(root, 'downloads'),
  });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(4000);
  page.on('pageerror', error => errors.push(error.message));
  let complete = false;
  t.after(async () => {
    if (evidence && !complete) await page.screenshot({path: join(evidence, 'failure.png')}).catch(() => {});
    await context.close();
    await rm(root, {recursive: true, force: true});
    if (evidence) await writeFile(join(evidence, 'cleanup.json'), JSON.stringify({root, rootRemoved: true, complete, errors}, null, 2));
  });
  const {outputFiles} = await build({bundle: true, write: false, format: 'iife', platform: 'browser', loader: {'.css': 'text'}, define: {'process.env.NODE_ENV': '"production"'}, stdin: {resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React,{useRef,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {FloatingPreview} from './src/client/floating-preview.jsx';
    window.EventSource=class{constructor(){this.handlers={};}addEventListener(name,fn){this.handlers[name]=fn;}close(){}};
    const first={kind:'tab',id:'first',title:'OMD 下载交付测试'};
    function Harness(){const anchor=useRef(null),[state,setState]=useState({enabled:true,target:first,previewTargets:[first],status:'idle'});
      window.lateTarget=()=>setState(value=>({...value,target:{...first,id:'late'},previewTargets:[{...first,id:'late'}]}));
      return <main><article><h1>下载已交付</h1><button id="download" onClick={()=>window.delivered=true}>打开下载结果 · receipt.txt</button></article>
        <section className="composer"><div contentEditable suppressContentEditableWarning>继续讨论下载结果</div><div className="dock"><div ref={anchor} className="tx-cu-chip"><button>电脑</button><FloatingPreview sessionId="fixture" state={state} url={()=>'/stream'} api={async op=>{window.lastControl=op;return state;}} onState={setState} onError={text=>window.error=text} anchor={anchor}/></div><small id="stats">上下文 12% · 8.2k tokens</small></div></section>
      </main>;}
    createRoot(document.getElementById('root')).render(<Harness/>);
  `}});
  const css = await readFile(new URL('../src/client/computer-use.css', import.meta.url), 'utf8');
  await page.setContent(`<style>body{margin:0;background:#fff;color:#18243a;font:14px system-ui}main{margin-left:280px;width:1153px}article{height:805px;padding:24px;box-sizing:border-box}h1{font-size:18px}#download{position:absolute;left:485px;top:729px;width:742px;height:32px}.composer{background:#f6f8fc;border:1px solid #ccd5e3;padding:12px;border-radius:12px}.composer [contenteditable]{min-height:42px;width:calc(100% - 192px)}.dock{display:flex;justify-content:space-between;align-items:end;gap:8px}#stats{white-space:nowrap;color:#68768e}@media(max-width:700px){main{margin:0;width:100%}article{height:380px}#download{position:static;width:100%;height:40px}.dock{flex-wrap:wrap}}</style><div id="root"></div>`);
  await page.addStyleTag({content: css});
  await page.addScriptTag({content: outputFiles[0].text});
  const preview = page.getByLabel('悬浮操控预览');
  await preview.waitFor();
  const stopHit=await preview.getByRole('button',{name:'停止操作',exact:true}).evaluate(node=>{const rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return !!hit&&(hit===node||node.contains(hit));});
  assert.equal(stopHit,true,'visible compact Stop receives the first pointer hit without hover');
  if(hasTouch){await preview.getByRole('button',{name:'停止操作',exact:true}).tap();assert.equal(await page.evaluate(()=>window.lastControl),'stop');}
  const hit = await page.locator('#download').evaluate(node => {
    const box = node.getBoundingClientRect(), target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {rect: box.toJSON(), tag: target?.tagName, id: target?.id, floating: !!target?.closest('.tx-cu-floating')};
  });
  if (evidence) {
    await page.screenshot({path: join(evidence, 'preview-and-download.png')});
    await writeFile(join(evidence, 'identity.json'), JSON.stringify({scope: 'frontend-only synthetic I/O; no Native/DSH execution', executablePath, bundleSha256: createHash('sha256').update(outputFiles[0].text).digest('hex'), cssSha256: createHash('sha256').update(css).digest('hex'), hit}, null, 2));
  }
  assert.equal(hit.id, 'download', JSON.stringify(hit));
  await page.locator('#download').click();
  assert.equal(await page.evaluate(() => window.delivered), true);
  await preview.getByRole('button', {name: '关闭操控预览', exact: true}).click();
  await preview.waitFor({state: 'hidden'});
  await page.evaluate(() => window.lateTarget());
  await page.waitForFunction(() => document.querySelector('[aria-label="悬浮预览"]').getAttribute('aria-expanded') === 'false');
  assert.equal(await preview.count(), 0, 'late target updates preserve the user close');
  await page.getByRole('button', {name: '悬浮预览', exact: true}).click();
  await preview.waitFor();
  await page.emulateMedia({colorScheme: 'dark', reducedMotion: 'reduce'});
  await page.setViewportSize({width: 390, height: 780});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await preview.getByRole('button', {name: '关闭操控预览', exact: true}).focus();
  await page.keyboard.press('Escape');
  await preview.waitFor({state: 'hidden'});
  assert.equal(await page.getByRole('button', {name: '悬浮预览', exact: true}).evaluate(node => node === document.activeElement), true);
  assert.deepEqual(errors, []);
  complete = true;
});
