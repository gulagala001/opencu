import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installBrowser } from '../src/computer-use/browser-install.mjs';

test('browser preparation reuses existing paths and installs only the bundled fallback', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'opencu-browser-install-')), path = join(dir, 'browser');
  t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const options = { resolveExecutable: () => path, run: async (command, args) => {
    calls++; assert.equal(command, process.execPath); assert.deepEqual(args.slice(-2), ['install', 'chromium']);
    await writeFile(path, 'fixture');
  } };
  await assert.rejects(installBrowser({ ...options, executablePath: path }), /自定义浏览器/);
  assert.equal(calls, 0);
  assert.equal(await installBrowser(options), path);
  assert.equal(await installBrowser(options), path);
  assert.equal(calls, 1);
  await rm(path);
  await assert.rejects(installBrowser({ ...options, run: async () => {} }), /未找到可用程序/);
  await assert.rejects(installBrowser({ ...options, run: async () => { throw Error('offline'); } }), /检查网络/);
});
