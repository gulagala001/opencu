import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { frontendFixture, until } from './fixtures/frontend.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

for (const mode of ['native', 'ptc']) test(mode + ': browser download delivery survives a real stock host restart with identical attachment bytes', { timeout: 120000 }, async t => {
  const fixture = await frontendFixture(t, { toolMode: mode });
  const { root, home, page, rpc, sessionId, replyWith, errors } = fixture;
  const bytes = Buffer.from('TRISOUL_COMPUTER_USE_FIXTURE\n'), output = join(root, 'delivered.txt');
  const html = '<title>Download restart fixture</title><a id="download" download="fixture.txt" href="data:application/octet-stream;base64,' + bytes.toString('base64') + '">Download fixture</a>';
  const code = `var deliveredTab = await cua.createBrowserTab('browser', ${JSON.stringify('data:text/html,' + encodeURIComponent(html))}); await deliveredTab.markDeliverable(); await deliveredTab.playwright.locator('#download').click(); var received = []; for (var attempt = 0; attempt < 100 && !received.length; attempt++) { received = await deliveredTab.downloads.list(); if (!received.length) await new Promise(resolve => setTimeout(resolve, 20)); } await deliveredTab.downloads.save(received[0].id, ${JSON.stringify(output)});`;
  let schema;
  const wire=[];
  replyWith(async payload => {
    wire.push({tools:payload.tools.map(tool=>tool.function.name),messages:payload.messages});
    if(process.env.OPENCU_HOST_RESTART_ARTIFACTS)await writeFile(join(resolve(process.env.OPENCU_HOST_RESTART_ARTIFACTS),mode+'-wire.json'),JSON.stringify(wire,null,2));
    schema ??= payload.tools.map(tool => tool.function.name);
    const name = mode === 'ptc' ? 'run_code' : 'computer_use';
    const arguments_ = mode === 'ptc' ? { description: 'Deliver restart fixture through native PTC', code: 'return await tools.computer_use(' + JSON.stringify({ title: 'Deliver restart fixture', code }) + ');' } : { title: 'Deliver restart fixture', code };
    return payload.messages.at(-1)?.role === 'tool'
    ? { delta: { role: 'assistant', content: 'Downloaded file is ready.' }, finish_reason: 'stop' }
    : { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'download-restart-' + mode, type: 'function', function: { name, arguments: JSON.stringify(arguments_) } }] }, finish_reason: 'tool_calls' };
  });
  const hitTests=[];
  const clickable=async(locator,label)=>{await locator.scrollIntoViewIfNeeded();const hit=await locator.evaluate(node=>{const rect=node.getBoundingClientRect(),target=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return{rect:rect.toJSON(),hitTag:target?.tagName,hitClass:target?.className,floating:!!target?.closest('.tx-cu-floating'),matches:!!target&&(node===target||node.contains(target))};});hitTests.push({label,...hit});assert.equal(hit.matches,true,JSON.stringify({label,...hit}));};
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'Download and deliver the restart fixture.' }] });
  await until(() => schema);
  if (mode === 'ptc') assert.deepEqual(schema, ['run_code'], 'PTC mode uses only the public transport and never exposes a direct CU tool call');
  else assert.ok(schema.includes('computer_use'));
  await page.getByText('Downloaded file is ready.',{exact:true}).waitFor();
  // Open the delivered browser using its public pane, then return to the
  // conversation. The default parked observer must be present for every hit.
  await page.getByRole('button',{name:'打开 Computer Use',exact:true}).click();
  const pane=page.locator('.tx-cu-pane');await pane.waitFor();
  const existing=page.getByLabel('选择已有标签页');
  if(await existing.count()){await existing.locator('option').filter({hasText:'Download restart fixture'}).waitFor();await existing.selectOption({label:'Download restart fixture'});}
  await pane.locator('.tx-cu-live img').first().waitFor();
  await page.getByRole('button',{name:'收起右侧边栏',exact:true}).click();
  const parked=page.getByLabel('悬浮操控预览');await parked.waitFor();
  assert.equal(await parked.evaluate(node=>node.classList.contains('tx-cu-floating-parked')),true);
  if(process.env.OPENCU_HOST_RESTART_ARTIFACTS)await page.screenshot({path:join(resolve(process.env.OPENCU_HOST_RESTART_ARTIFACTS),mode+'-default-preview.png')});
  let cold=false;
  const attachment = async () => {
    await page.getByText('Downloaded file is ready.', { exact: true }).waitFor();
    const preview = page.getByLabel('悬浮操控预览');
    // The default observer stays open while real native process/file controls
    // are clicked. Closing it would conceal the overlap regression.
    if(!cold){await preview.waitFor();assert.equal(await preview.evaluate(node=>node.classList.contains('tx-cu-floating-parked')),true);}
    const process = page.locator('button[data-turn-process-tool-calls="1"]').last();
    await process.waitFor();await clickable(process,'native process');if (await process.getAttribute('aria-expanded') === 'false') await process.click();
    const group = page.locator('[data-cu-group] .tx-cu-group-toggle').last();
    await group.waitFor();await clickable(group,'native operation group');if (await group.getAttribute('aria-expanded') === 'false') await group.click();
    const card = page.locator('.tx-cu-card').filter({ hasText: 'Deliver restart fixture' });
    await card.waitFor(); const toggle = card.locator('.tx-cu-card-heading');
    await clickable(toggle,'CU result card');if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    const file = card.locator('.tx-cu-export-files button');
    await file.waitFor(); assert.equal(await file.count(), 1); assert.equal(await file.isEnabled(), true);
    await clickable(file,'native durable file');
    const path = await file.getAttribute('title'); assert.ok(path.startsWith(home + sep), 'the card addresses the native durable attachment');
    const actual = await readFile(path); assert.deepEqual(actual, bytes); assert.notEqual(path, output);
    return { path, bytes: actual.length, sha256: sha256(actual) };
  };
  const before = await attachment(); assert.deepEqual(await readFile(output), bytes);
  await clickable(parked.getByRole('button',{name:'停止操作',exact:true}),'preview stop');
  await parked.getByRole('button',{name:'停止操作',exact:true}).click();
  await parked.getByLabel('已停止 · 可手动操作',{exact:true}).waitFor();
  await clickable(parked.getByRole('button',{name:'从预览恢复助手',exact:true}),'preview resume');
  await parked.getByRole('button',{name:'从预览恢复助手',exact:true}).click();
  await parked.getByLabel('只读预览',{exact:true}).waitFor();
  cold=true;
  await fixture.restartHost();
  const after = await attachment(); assert.deepEqual(after, before, 'cold host restoration retains the same attachment and complete bytes');
  assert.deepEqual(errors, []);
  if (process.env.OPENCU_HOST_RESTART_ARTIFACTS) {
    const directory = resolve(process.env.OPENCU_HOST_RESTART_ARTIFACTS); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, mode + '-delivery.json'), JSON.stringify({ mode, schema, sessionId, output, before, after, hostRestarted: true, hitTests,previewLeftOpen:true }, null, 2) + '\n');
    await page.screenshot({ path: join(directory, mode + '-restored-attachment.png') });
  }
});
