import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('Windows setup exposes runtime removal, retains failures and offers reinstall after success', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let installed = true, fail = true;
  const actions = [];
  await page.route('**/trisoul-x/computer-use/setup?*', async route => {
    if (route.request().method() === 'POST') {
      const action = route.request().postDataJSON().action; actions.push(action);
      if (action === 'remove-native') {
        if (fail) { await route.fulfill({ status: 500, json: { error: '测试：清理尚未确认，安装已保留' } }); return; }
        installed = false;
      } else { assert.equal(action, 'install-native'); installed = true; }
    }
    await route.fulfill({ json: { browser: { name: 'Fixture Chromium', installed: true, path: 'C:\\fixture\\chrome.exe' }, extension: { browsers: [] }, native: { platform: 'win32', supported: true, installed, removable: true, interactive: installed, captureSupported: installed, version: '0.1.1' } } });
  });
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
  await page.getByRole('button', { name: '运行环境与权限', exact: true }).click();
  await page.getByText('桌面控制版本', { exact: true }).click();
  const remove = page.getByRole('button', { name: '移除桌面控制', exact: true });
  await remove.click();
  await page.getByRole('alert').filter({ hasText: '清理尚未确认' }).waitFor();
  assert.equal(await remove.isVisible(), true, 'failed removal keeps the installed runtime available for retry');
  assert.equal(await page.getByRole('button', { name: '安装桌面控制', exact: true }).count(), 0);
  fail = false; await remove.click();
  const install = page.getByRole('button', { name: '安装桌面控制', exact: true }); await install.waitFor();
  assert.equal(await remove.count(), 0);
  await install.click();
  await until(async () => (await page.locator('.tx-cu-setup').innerText()).includes('Windows 桌面'));
  await page.getByText('桌面控制版本', { exact: true }).click(); await remove.waitFor();
  assert.deepEqual(actions, ['remove-native', 'remove-native', 'install-native']);
  assert.deepEqual(f.errors, []);
  if (process.env.TRISOUL_UI_ARTIFACTS) { await page.locator('.tx-cu-setup').screenshot({ path: join(f.root, 'windows-runtime-removal.png') }); t.diagnostic('Windows removal UI: ' + f.root); }
});

test('WSL external desktop shows Windows availability and manual recovery without managed install actions', { timeout: 60000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  let native = { platform: 'win32', bridge: true, external: true, supported: true, installed: false, removable: false };
  await page.route('**/trisoul-x/computer-use/setup?*', async route => {
    assert.equal(route.request().method(), 'GET');
    await route.fulfill({ json: { browser: { installed: true, name: 'Fixture' }, extension: { browsers: [] }, native } });
  });
  await page.getByRole('button', { name: '打开 Computer Use', exact: true }).click();
  const toggle = page.getByRole('button', { name: '运行环境与权限', exact: true });
  await toggle.click();
  await page.getByText('未找到指定的桌面程序，请检查桌面控制程序路径。', { exact: true }).waitFor();
  const noManagedActions = async () => assert.equal(await page.getByRole('button', { name: /^(安装|更新|修复|重启|移除)桌面控制$/ }).count(), 0);
  await noManagedActions();
  native = { ...native, installed: true, interactive: true, captureSupported: true, version: '0.1.1' };
  await toggle.click(); await toggle.click();
  await page.getByText('Windows 桌面', { exact: true }).waitFor();
  await page.getByText('窗口捕获', { exact: true }).waitFor();
  assert.equal(await page.getByText('辅助功能', { exact: true }).count(), 0);
  await noManagedActions();
  native = { ...native, restartRequired: true };
  await toggle.click(); await toggle.click();
  await page.getByText('桌面程序已替换，请重启 DSH 服务或完整重启应用与 Host 后重新选择应用。', { exact: true }).waitFor();
  await noManagedActions();
  native = { ...native, restartRequired: false, repairRequired: true, error: '测试：协议不匹配' };
  await toggle.click(); await toggle.click();
  await page.getByRole('alert').filter({ hasText: '协议不匹配' }).waitFor();
  await page.getByText('请手动更新或修复指定的桌面程序，再重启 DSH 服务或完整重启应用与 Host。', { exact: true }).waitFor();
  await noManagedActions();
  assert.deepEqual(f.errors, []);
});
