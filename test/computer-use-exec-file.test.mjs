import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

// Match a console-hiding plugin that forwards callbacks but loses execFile's
// custom promisify symbol. No real registry or user installation is touched.
test('Windows inspection and registry actions survive a console-hiding execFile wrapper', async t => {
  const original = childProcess.execFile, calls = [];
  childProcess.execFile = function (file, args, options, callback) {
    calls.push({ file, args, options });
    if (!file.startsWith('fixture-')) return original(file, args, options, callback);
    const value = args[0] === 'info' ? { name: 'oh-my-dsh-windows-desktop', protocol: 1 } : [{ view: 64, value: args[0] }];
    queueMicrotask(() => callback(null, JSON.stringify(value), 'diagnostic'));
    return {};
  };
  syncBuiltinESMExports();
  t.after(() => { childProcess.execFile = original; syncBuiltinESMExports(); });
  const generic = await promisify(childProcess.execFile)('fixture-native', ['info'], {});
  assert.equal(typeof generic, 'string', 'fixture reproduces the missing custom promisify contract');
  const { WindowsNativeRuntime } = await import('../src/computer-use/windows-native-runtime.mjs');
  const { WindowsExtensionRuntime } = await import('../src/computer-use/windows-extension.mjs');
  assert.deepEqual(await new WindowsNativeRuntime('.').inspect('fixture-native'), { name: 'oh-my-dsh-windows-desktop', protocol: 1 });
  const bridge = new WindowsExtensionRuntime('.');
  bridge.command = async () => ({ command: 'fixture-bridge' });
  for (const [method, args, command] of [
    ['read', ['test-host'], 'registry-read'],
    ['set', ['test-host', 'C:/test/host.json'], 'registry-set'],
    ['restore', ['test-host', 'C:/test/host.json', []], 'registry-restore'],
  ]) assert.deepEqual(await bridge[method](...args), [{ view: 64, value: command }]);
  assert.ok(calls.slice(1).every(call => call.options.windowsHide === true), 'console hiding is preserved');
});

test('runFile preserves real child output, buffers and failure diagnostics', async () => {
  const { runFile } = await import('../src/computer-use/run-file.mjs');
  const pending = runFile(process.execPath, ['-e', 'process.stdout.write(process.env.RUN_FILE_TEST); process.stderr.write("diagnostic")'], { env: { ...process.env, RUN_FILE_TEST: '中文 output' }, windowsHide: true });
  assert.ok(pending.child.pid);
  assert.deepEqual(await pending, { stdout: '中文 output', stderr: 'diagnostic' });
  const buffered = await runFile(process.execPath, ['-e', 'process.stdout.write("buffer")'], { encoding: 'buffer' });
  assert.equal(Buffer.isBuffer(buffered.stdout), true);
  assert.equal(buffered.stdout.toString(), 'buffer');
  await assert.rejects(runFile(process.execPath, ['-e', 'process.stdout.write("partial"); process.stderr.write("failed"); process.exit(7)']), error => error.code === 7 && error.stdout === 'partial' && error.stderr === 'failed');
  await assert.rejects(runFile('missing-opencu-test-executable-issue15', []), { code: 'ENOENT' });
  await assert.rejects(runFile(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 50 }), error => error.killed === true);
  await assert.rejects(runFile(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: AbortSignal.timeout(50) }), { name: 'AbortError' });
  await assert.rejects(runFile(process.execPath, ['-e', 'process.stdout.write("x".repeat(10000))'], { maxBuffer: 16 }), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
});
