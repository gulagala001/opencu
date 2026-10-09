import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { decorateSlotComponent } from '../src/client/slot-decoration.mjs';

const host = createRequire(await realpath(process.env.OPENCU_SLOT_HOST || new URL(import.meta.resolve('@deepseek-ai/dsh/package.json'))));
const slotsPath = host.resolve('@deepseek-ai/dsh-client-ui-slots');
const { SlotCore } = await import(pathToFileURL(slotsPath));

function decorationFixture() {
  const core = new SlotCore();
  core.register({ name: 'root', children: { test: { kind: 'keyed', scope: 'root' } } }, () => null);
  const winners = [];
  core.onMutate(key => { if (key === 'test') winners.push(core.entriesOfSlot(key)[0]); });
  const slots = { entries: key => core.entries(key), subscribe: (key, fn) => core.subscribe(key, fn), register: (options, component) => core.register(options, component) };
  const render = component => {
    const result = component({});
    if (typeof result === 'string') return result;
    if (result.label) return result.label + '(' + render(() => result.inner) + ')';
    return render(() => result.type(result.props));
  };
  const wrap = label => entry => { const Original = entry.component; return props => ({ label, inner: Original(props) }); };
  return { core, slots, winners, render, wrap };
}

test('component decoration preserves one winner during reentrant refresh, reverse unload and an external wrapper', async () => {
  const f = decorationFixture(), original = () => 'host';
  f.core.register({ name: 'test', key: 'one', children: { detail: { kind: 'single', scope: 'root' } } }, original);
  const entry = f.core.entries('test')[0], metadata = { ...entry };
  // Exercise a synchronous subscriber too; the real host batches notifications.
  const listeners = new Set(), subscribe = f.slots.subscribe;
  f.slots.subscribe = (name, listener) => { listeners.add(listener); const off = subscribe(name, listener); return () => { listeners.delete(listener); off(); }; };
  const register = f.slots.register;
  f.slots.register = (...args) => { const off = register(...args); for (const fn of [...listeners]) fn(); return () => { off(); for (const fn of [...listeners]) fn(); }; };
  const a = decorateSlotComponent(f.slots, 'test', () => true, f.wrap('A'));
  const b = decorateSlotComponent(f.slots, 'test', () => true, f.wrap('B'));
  assert.equal(f.render(entry.component), 'B(A(host))');
  a(); assert.equal(f.render(entry.component), 'B(host)');
  const captured = entry.component, external = props => ({ label: 'external', inner: captured(props) });
  entry.component = external; b();
  assert.equal(entry.component, external); assert.equal(f.render(entry.component), 'external(host)');
  for (const key of ['options', 'inject', 'store', 'locale', 'children']) assert.equal(entry[key], metadata[key]);
  assert.ok(f.winners.every(winner => winner === entry), 'the refresh entry never replaces the declaring winner');
  assert.equal(f.core.entries('test').length, 1); assert.equal(f.core.spec('detail').kind, 'single');
  assert.equal(listeners.size, 0);
});

test('removed entries lose their decoration and a replacement receives one fresh wrapper', async () => {
  const f = decorationFixture(), original = () => 'first';
  let remove = f.core.register({ name: 'test', key: 'one' }, original);
  const first = f.core.entries('test')[0];
  const a = decorateSlotComponent(f.slots, 'test', () => true, f.wrap('A'));
  const b = decorateSlotComponent(f.slots, 'test', () => true, f.wrap('B'));
  assert.equal(f.render(first.component), 'B(A(first))');
  remove(); await Promise.resolve();
  assert.equal(first.component, original);
  const replacement = () => 'second'; remove = f.core.register({ name: 'test', key: 'one' }, replacement); await Promise.resolve();
  const second = f.core.entries('test')[0]; assert.equal(f.render(second.component), 'B(A(second))');
  b(); assert.equal(f.render(second.component), 'A(second)'); a();
  assert.equal(second.component, replacement); remove(); await Promise.resolve();
  assert.equal(f.core.entries('test').length, 0);
});

test('the fixed SlotCore rejects redeclaration but retains writable component and exact child authority', () => {
  const core = new SlotCore();
  core.register({ name: 'root', children: { parent: { kind: 'keyed', scope: 'root' } } }, () => null);
  const metadata = { inject: () => ({ custom: 'injected' }), store: { spec: {} }, locale: 'third-party', children: { detail: { kind: 'single', scope: 'root' } } };
  core.register({ name: 'parent', key: 'custom', ...metadata }, () => 'original');
  const entry = core.entries('parent')[0], before = { ...entry };
  assert.throws(() => core.register({ name: 'parent', key: 'custom', priority: -1, ...metadata }, () => null), /already declared/);
  entry.component = () => 'wrapped';
  assert.equal(core.entriesOfSlot('parent')[0], entry);
  for (const key of ['options', 'inject', 'store', 'locale', 'children']) assert.equal(entry[key], before[key]);
});

for (const order of ['after', 'before']) test(`real browser renderer preserves metadata, children, references and images with CU installed ${order} providers`, { timeout: 30000 }, async t => {
  const rendererPath = join(dirname(host.resolve('@deepseek-ai/dsh-client-ui-renderer')), 'client.js');
  const rendererSource = await readFile(rendererPath, 'utf8');
  const renderer = `import * as React from 'react'; import * as ReactDOM from 'react-dom'; import * as ReactDOMClient from 'react-dom/client'; import * as Jsx from 'react/jsx-runtime'; import * as Slots from ${JSON.stringify(slotsPath)}; import * as Cordis from '@deepseek-ai/cordis'; let registration; const window = {__ModuleLoader__:{load(value){registration=value;}}}; ${rendererSource}\nexport const apply=registration.factory(name=>({'react':React,'react-dom':ReactDOM,'react-dom/client':ReactDOMClient,'react/jsx-runtime':Jsx,'@deepseek-ai/dsh-client-ui-slots':Slots,'@deepseek-ai/cordis':Cordis})[name]).apply;`;
  const { outputFiles } = await build({ bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React from 'react'; import {Context} from '@deepseek-ai/cordis';
    import {apply} from 'fixture-renderer';
    import {installComputerReferenceMessages} from './src/client/computer-reference.jsx';
    import {computerGroupPresentation} from './src/client/computer-groups.jsx';
    const ctx=new Context();apply(ctx);const slots=ctx.slots;window.crashes=[];slots.onEntryError((_key,_entry,error)=>window.crashes.push(error.message));
    const binding={key:'fixture-session',ctx,hooks:{},keyedHooks:{},props:{}};const bindingSource={subscribe:()=>()=>{},getSnapshot:()=>binding};slots.installScope('session',{current:bindingSource,bindingSource:()=>bindingSource,renderArea:(_binding,props)=>props.children});
    slots.installLocale({bind:ns=>(key)=>ns==='third-party'&&key==='row.failed'?'插件失败':ns==='third-party'&&key==='tool.title.bash'?'插件执行':ns+':'+key,subscribe:()=>()=>{},getSnapshot:()=>0});
    window.storeScopes=[];window.injectScopes=[];const stored={value:'stored'};const store={spec:{},create:scope=>{window.storeScopes.push(scope);return {subscribe:()=>()=>{},getSnapshot:()=>stored,actions:{}};}};
    const outcomes=[];const source={subscribe:()=>()=>{},getSnapshot:()=>outcomes};
    const node={data:{turn:1,content:[{type:'text',text:'ordinary text'}]}};
    const owner={node,renderMessageImages:()=>null,useChat:selector=>selector({nodes:{turnDataSource:()=>source}}),toolName:'bash',block:{kind:'tool-result',content:[]}};
    let plugin;window.install=async()=>{plugin=ctx.plugin(child=>{installComputerReferenceMessages(child);computerGroupPresentation(child);});await plugin;};
    if(${JSON.stringify(order)}==='before')void window.install();
    function Parent({renderSlot}){return <><section id="user">{renderSlot('conversation.chat.node',owner,{entryKey:'user'})}</section><section id="native-user">{renderSlot('conversation.chat.node',owner,{entryKey:'steering'})}</section><section id="process">{renderSlot('conversation.chat.node',owner,{entryKey:'turn-process'})}</section><section id="tool">{renderSlot('tool.call.toolview',owner,{entryKey:'custom'})}</section></>;}
    slots.register({name:'root',children:{'conversation.chat.node':{kind:'keyed',scope:'session'},'tool.call.toolview':{kind:'keyed',scope:'session'}}},Parent);
    function User({custom,t,useStore,renderSlot}){return <div data-original-user>{custom}|{t('title')}|{useStore(s=>s.value)}{renderSlot('user.detail',{value:'user child'})}<i data-thirdparty-attachment>original attachment</i></div>;}
    function Process({custom,t,useStore,renderSlot}){return <span data-original-process>{custom}|{t('title')}|{useStore(s=>s.value)}{renderSlot('process.detail',{value:'process child'})}</span>;}
    function Tool({custom,t,useStore,renderSlot}){return <div data-original-tool>{custom}|{t('title')}|{useStore(s=>s.value)}{renderSlot('tool.detail',{value:'tool child'},{hookContext:{suffix:' contextual'}})}{renderSlot('tool.call.images',{images:[{attachment:{id:'image'}}],loadImage:async()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='})}<em data-custom-tool-title>{t('tool.title.bash')}</em></div>;}
    const metadata={inject:scope=>{window.injectScopes.push(scope);return {custom:'injected'};},store,locale:'third-party'};
    slots.register({name:'conversation.chat.node',key:'user',...metadata,children:{'user.detail':{kind:'single',scope:'session'}}},User);
    const NativeUser=React.memo(function UserMessageNodeView({node}){return <div data-native-user>{node.data.content.map(b=>b.text).join('')}</div>;});
    slots.register({name:'conversation.chat.node',key:'steering',locale:'chat'},NativeUser);
    slots.register({name:'user.detail'},({value})=><b>{value}</b>);
    slots.register({name:'conversation.chat.node',key:'turn-process',...metadata,children:{'process.detail':{kind:'single',scope:'session'}}},Process);
    slots.register({name:'process.detail'},({value})=><b>{value}</b>);
    slots.register({name:'tool.call.toolview',key:'custom',...metadata,children:{'tool.detail':{kind:'single',scope:'session',inject:{hooks:{extra:(_standard,context)=>selector=>selector({suffix:context.suffix})}}},'tool.call.images':{kind:'single',scope:'session'}}},Tool);
    slots.register({name:'tool.detail'},({value,useExtra})=><b>{value}{useExtra(s=>s.suffix)}</b>);
    slots.register({name:'tool.call.images'},()=> <span data-original-images>native images</span>);
    const original=slots.entries('conversation.chat.node')[0];const originalMeta={...original};
    const mount=ctx.uiRenderer.mount(document.getElementById('root'));
    window.uninstall=()=>plugin.dispose();window.setReference=()=>{node.data.content=[{type:'text',text:'hello <computer-use-target>'+JSON.stringify({kind:'tab',id:'fixture',label:'CU target'})+'</computer-use-target>'}];slots.provideRoot({props:{revision:Math.random()}});};
    window.metadata=()=>['inject','store','locale','children'].every(key=>original[key]===originalMeta[key])&&slots.entries('conversation.chat.node').includes(original);
    window.shutdown=async()=>{mount();await ctx.fiber.dispose();};
  ` }, plugins: [{ name: 'fixture-modules', setup(b) {
    b.onResolve({ filter: /^@deepseek-ai\/cordis$/ }, () => ({ path: host.resolve('@deepseek-ai/cordis') }));
    b.onResolve({ filter: /^fixture-renderer$/ }, () => ({ path: 'renderer', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: renderer, loader: 'js', resolveDir: process.cwd() }));
    b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'primitives' }));
    b.onLoad({ filter: /.*/, namespace: 'primitives' }, () => ({ contents: `import React from 'react';export const projectUserText=text=>text;export const FileTypeIcon=()=>null;export const JsonBlock=({label})=>React.createElement('span',null,label);`, loader: 'js', resolveDir: process.cwd() }));
  } }] });
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await browser.newPage(), errors = []; page.setDefaultTimeout(5000); page.on('pageerror', error => { errors.push(error.message); t.diagnostic(error.message); });
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: outputFiles[0].text });
  await page.locator('[data-original-user]').waitFor();
  if (order === 'after') {
    assert.match(await page.locator('#tool').innerText(), /injected\|third-party:title\|storedtool child contextualnative images/);
    await page.evaluate(() => window.install());
  }
  await page.waitForFunction(() => document.querySelector('.tx-cu-result-images img'));
  assert.equal(await page.evaluate(() => window.metadata()), true);
  assert.deepEqual(await page.evaluate(() => window.storeScopes), ['fixture-session']);
  assert.ok((await page.evaluate(() => window.injectScopes)).every(scope => scope === 'fixture-session'));
  assert.match(await page.locator('#user').innerText(), /injected\|third-party:title\|storeduser child/);
  assert.match(await page.locator('#process').innerText(), /injected\|third-party:title\|storedprocess child/);
  assert.match(await page.locator('#tool').innerText(), /tool child contextual/);
  assert.equal(await page.locator('[data-custom-tool-title]').innerText(), '插件执行');
  await page.evaluate(() => window.setReference()); await page.locator('#user [data-computer-use-reference="tab"]').waitFor();
  assert.match(await page.locator('#user').innerText(), /injected\|third-party:title\|storeduser childoriginal attachment\s*CU target/);
  assert.equal(await page.locator('#user [data-original-user]').count(), 1);
  assert.equal(await page.locator('#user [data-thirdparty-attachment]').count(), 1);
  assert.match(await page.locator('#native-user .tx-cu-user-bubble').innerText(), /hello CU target/);
  assert.equal(await page.locator('#native-user [data-native-user]').count(), 0);
  await page.getByRole('button', { name: '查看截图大图' }).click(); await page.getByRole('dialog', { name: '截图预览' }).waitFor();
  await page.getByRole('button', { name: '关闭截图预览' }).click();
  await page.evaluate(() => window.uninstall()); await page.locator('[data-original-images]').waitFor();
  await page.locator('[data-original-user]').waitFor();
  assert.equal(await page.evaluate(() => window.metadata()), true);
  assert.deepEqual(await page.evaluate(() => window.crashes), []); assert.deepEqual(errors, []);
  await page.evaluate(() => window.shutdown());
});
