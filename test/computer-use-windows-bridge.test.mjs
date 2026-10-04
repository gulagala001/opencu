import { msbuildValue } from '../src/computer-use/windows-build.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ExtensionHub } from '../src/computer-use/extension-hub.mjs';
import { encodeNativeMessage, NativeMessageReader } from '../src/computer-use/native-messaging.mjs';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
const enabled = process.platform === 'win32' || !!process.env.TRISOUL_CU_DOTNET;
async function until(fn) { for (let i = 0; i < 400; i++) { const value = fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Windows bridge observation timed out'); }

test('compiled Windows bridge preserves framed bytes, isolates connections and cancels on EOF', { skip: !enabled, timeout: 180000 }, async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "oh-my-dsh-win-中文-'-")));
  const dll = join(root, 'out', 'OhMyDsh.BrowserBridge.dll');
  let hub; const children = [];
  t.after(async () => {
    await hub?.close();
    await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? undefined : new Promise(resolve => { child.once('exit', resolve); child.kill(); })));
    await rm(root, { recursive: true, force: true });
  });
  // The portable fixture runs the DLL through dotnet; the self-contained
  // launcher is exercised separately by the real Windows browser fixture.
  // Cold SDK/NuGet fixture compilation uses a startup allowance; protocol
  // observation and cancellation deadlines below stay unchanged.
  await run(dotnet, ['build', fileURLToPath(new URL('../native/computer-use/windows/TrisoulBrowserBridge.csproj', import.meta.url)), '-p:UseAppHost=false', '-p:OutputPath=' + msbuildValue(join(root, 'out')) + '/', '-p:BaseIntermediateOutputPath=' + msbuildValue(join(root, 'obj')) + '/', '--nologo'], { timeout: 120000, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } }).catch(error=>{t.diagnostic(JSON.stringify({phase:'fixture-build',code:error.code,signal:error.signal,killed:error.killed,stdout:error.stdout,stderr:error.stderr}));throw error;});
  if (process.platform === 'win32') await t.test('native registry migration compares both inspected views and restores them', async () => {
    const host = 'ai.trisoul.test_' + randomUUID().replaceAll('-', '');
    const registry = async (...args) => JSON.parse((await run(dotnet, [dll, ...args])).stdout);
    const before = await registry('registry-read', host), first = join(root, 'first.json'), second = join(root, 'second.json');
    let owned = first;
    try {
      await registry('registry-set', host, first, JSON.stringify(before));
      const inspected = await registry('registry-read', host);
      await assert.rejects(registry('registry-set', host, second), error => error.code === 1);
      assert.deepEqual(await registry('registry-read', host), inspected, 'legacy writes still cannot replace another path');
      await registry('registry-set', host, second, JSON.stringify(inspected)); owned = second;
      const migrated = await registry('registry-read', host);
      assert.ok(migrated.every(entry => entry.value === second), JSON.stringify({ expected: second, migrated }));
      await assert.rejects(registry('registry-set', host, first, JSON.stringify(inspected)), /changed after inspection/);
      assert.deepEqual(await registry('registry-read', host), migrated, 'stale inspected values never overwrite the current owner');
    } finally { await registry('registry-restore', host, owned, JSON.stringify(before)); }
    assert.deepEqual(await registry('registry-read', host), before, 'all test registration views are restored');
  });
  const runtime = { command: async () => ({ command: dotnet, args: [dll] }) }, pipe = 'omd-' + randomUUID().replaceAll('-', '').slice(0, 20);
  const origin = 'chrome-extension://' + 'a'.repeat(32) + '/';
  await writeFile(join(root, 'out', 'bridge.json'), JSON.stringify({ pipe, origin }));
  hub = new ExtensionHub(pipe, { windowsRuntime: runtime }); await hub.start();
  const connect = async (id, args = [origin, '--parent-window=0']) => {
    const child = spawn(dotnet, [dll, ...args], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
    const messages = []; child.stdout.on('data', data => reader.push(data));
    const reader = new NativeMessageReader(value => messages.push(value));
    const hello = encodeNativeMessage({ type: 'hello', protocol: 2, instanceId: id, name: 'Chrome' });
    // Exercise fragmented native headers and UTF-8 bodies across actual stdio.
    for (let i = 0; i < hello.length; i++) child.stdin.write(hello.subarray(i, i + 1));
    await until(() => messages.find(message => message.type === 'ready'));
    return { child, messages };
  };
  const first = await connect('windows-fixture-first'), second = await connect('windows-fixture-second');
  assert.equal(hub.list().length, 2);
  const value = '中文🙂\n'.repeat(35000);
  const call = hub.call(hub.list()[0].id, 'fixture', { value });
  const request = await until(() => first.messages.find(message => message.method === 'fixture'));
  assert.equal(request.params.value, value); assert.equal(second.messages.some(message => message.method === 'fixture'), false);
  first.child.stdin.write(encodeNativeMessage({ id: request.id, result: { value } }));
  assert.deepEqual(await call, { value });
  first.child.stdin.end(); await until(() => hub.list().length === 1);
  assert.equal(hub.list()[0].id, 'chrome:windows-fixture-second');
  const pending = hub.call(hub.list()[0].id, 'pending', {}, { timeoutMs: 5000 });
  const rejected = assert.rejects(pending, /disconnected/);
  await hub.close(); await rejected;
  await until(() => second.child.exitCode !== null);
  assert.equal(second.child.exitCode, 0);
  for (const args of [[origin, '--parent-window=bad'], ['chrome-extension://' + 'b'.repeat(32) + '/'], [origin, '--parent-window=0', 'unexpected']]) {
    await assert.rejects(run(dotnet, [dll, ...args]), /Invalid native messaging origin or arguments/);
  }
  const lockName = 'fixture-lock-' + randomUUID();
  const lock = () => {
    const child = spawn(dotnet, [dll, 'install-lock', lockName], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
    const state = { child, output: '', diagnostic: '' };
    child.stdout.on('data', data => { state.output += data; }); child.stderr.on('data', data => { state.diagnostic += data; });
    return state;
  };
  const owner = lock(); await until(() => /(?:^|\n)locked\r?\n/.test(owner.output));
  const waiting = lock(); await until(() => waiting.diagnostic.includes('Waiting for browser installation lock'));
  assert.equal(waiting.output, '');
  owner.child.stdin.end(); await until(() => owner.child.exitCode === 0);
  await until(() => /(?:^|\n)locked\r?\n/.test(waiting.output));
  waiting.child.stdin.end(); await until(() => waiting.child.exitCode === 0);
});
