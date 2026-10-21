import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {createBrowserHost} from '../src/dsh/browser-host.mjs';
import {createRuntime} from '../src/runtime.mjs';

test('DSH provider status changes without changing legacy configured booleans',async t=>{
 const dirs=[]; t.after(async()=>{ for(const dir of dirs) await rm(dir,{recursive:true,force:true}); });
 const temporary=async prefix=>{const dir=await mkdtemp(prefix);dirs.push(dir);return dir;};
 const host=createBrowserHost();const runtime=await createRuntime({dataDir:await temporary(join(tmpdir(), 'opencu-status-')),dshBrowser:host.backend,nativeEnabled:false,extensionEnabled:false});
 const info=()=>JSON.parse(JSON.stringify(runtime.runtimeInfo));
 assert.equal(info().backends.dsh,true);assert.equal(info().backends.browser,false);
 assert.equal(info().browserProviders.dsh.status,'renderer_unavailable');
 assert.match(info().browserProviders.dsh.nextStep,/extension or CDP/);
 const {rendererId,connectionId}=await host.handle('browser/connect',{});
 assert.equal(info().browserProviders.dsh.status,'no_tabs');assert.equal(info().browserProviders.dsh.connectedRenderers,1);
 await host.handle('browser/publish',{rendererId,connectionId,targets:[{id:'synthetic',identity:{rendererId,guestId:'guest'}}]});
 assert.equal(info().browserProviders.dsh.status,'ready');assert.equal(info().browserProviders.dsh.targetCount,1);
 await host.handle('browser/disconnect',{rendererId,connectionId});
 assert.equal(info().browserProviders.dsh.status,'renderer_unavailable');assert.equal(info().backends.dsh,true);
 assert.equal((await runtime.close()).ok,true);host.close();
});

test('explicit CDP still provides a separate configured browser despite absent DSH renderer',async t=>{
 const dirs=[]; t.after(async()=>{ for(const dir of dirs) await rm(dir,{recursive:true,force:true}); });
 const temporary=async prefix=>{const dir=await mkdtemp(prefix);dirs.push(dir);return dir;};
 let connects=0,launches=0;const host=createBrowserHost();const context=new EventEmitter();context.pages=()=>[];
 const browser={contexts:()=>[context],close:async()=>{}};
 const runtime=await createRuntime({dataDir:await temporary(join(tmpdir(), 'opencu-cdp-')),dshBrowser:host.backend,nativeEnabled:false,extensionEnabled:false,managedHeadless:true,cdpEndpoint:'ws://synthetic.invalid/devtools/browser/test',browserOptions:{playwright:{chromium:{connectOverCDP:async()=>{connects++;return browser;},launchPersistentContext:async()=>{launches++;throw Error('must not launch');}}}}});
 const inventory=await runtime.listTargets();assert.equal(inventory.ok,true);assert.deepEqual(inventory.errors,[]);
 assert.equal(connects,1);assert.equal(launches,0);assert.equal(inventory.browsers.length,1);
 assert.equal(runtime.runtimeInfo.browserProviders.managed.configured,true);assert.equal(runtime.runtimeInfo.browserProviders.managed.mode,'cdp');
 assert.equal(runtime.runtimeInfo.browserProviders.dsh.status,'renderer_unavailable');
 assert.equal((await runtime.close()).ok,true);host.close();
});

test('real plugin targets and state expose live provider diagnostics and explicit default',async t=>{
 const dirs=[]; t.after(async()=>{ for(const dir of dirs) await rm(dir,{recursive:true,force:true}); });
 const temporary=async prefix=>{const dir=await mkdtemp(prefix);dirs.push(dir);return dir;};
 const {createPluginRuntime}=await import('../src/dsh/runtime.mjs');
 const host=createBrowserHost();const runtime=createPluginRuntime({dataDir:await temporary(join(tmpdir(), 'opencu-plugin-')),dshBrowser:host.backend,nativeEnabled:false,extensionEnabled:false});
 try {
  const targets=await runtime.request('targets');assert.equal(targets.ok,true);assert.equal(targets.browserProviders.dsh.code,'DSH_RENDERER_UNAVAILABLE');assert.deepEqual(targets.targets,[]);
  const state=await runtime.request('state');assert.equal(state.ok,true);assert.equal(state.config.managedHeadless,false);assert.equal(state.service.backends.dsh,true);assert.equal(state.service.browserProviders.dsh.status,'renderer_unavailable');
  const {rendererId,connectionId}=await host.handle('browser/connect',{});assert.equal((await runtime.request('targets')).browserProviders.dsh.status,'no_tabs');
  await host.handle('browser/disconnect',{rendererId,connectionId});
 } finally { await runtime.close();host.close(); }
});
