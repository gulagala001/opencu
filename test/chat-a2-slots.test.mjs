import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { frontendFixture } from './fixtures/frontend.mjs';

const clientProbe = `window.__ModuleLoader__.load({id:'opencu-chat-probe',factory:require=>{
  const React=require('react');
  return {inject:['slots'],apply(ctx){
    const crashes=[];
    ctx.effect(()=>ctx.slots.onEntryError((key,entry,error)=>crashes.push({key,message:error.message})));
    window.opencuChatProbe={inspect:()=>({flow:ctx.slots.spec('conversation.chat.flow'),body:ctx.slots.spec('conversation.chat.reasoning.body'),tree:ctx.slots.snapshot(),crashes})};
    ctx.effect(()=>()=>{delete window.opencuChatProbe;});
    ctx.slots.inject('conversation.chat.reasoning.body',()=>ctx.slots.register({name:'conversation.chat.reasoning.body',priority:-10},({text,running,renderFactorySlot})=>React.createElement('section',{'data-opencu-reasoning-probe':'', 'data-original-reasoning':text,'data-reasoning-running':String(running)},renderFactorySlot('conversation.chat.reasoning.content',{text:'Factory composition\\n\\n'+text,running}))));
  }};
}});`;

for (const stockChat of [true, false]) test(`${stockChat ? 'stock a2' : 'OpenCU a2'} flow and original reasoning compose through the public Body Slot and root Content Factory`, { timeout: 90000 }, async t => {
  const { page, replyWith, rpc, sessionId, errors } = await frontendFixture(t, { clientProbe, stockChat });
  await page.waitForFunction(() => !!window.opencuChatProbe);
  const identity = await page.evaluate(() => window.opencuChatProbe.inspect());
  const artifact = process.env.OPENCU_CHAT_ARTIFACTS && resolve(process.env.OPENCU_CHAT_ARTIFACTS, stockChat ? 'stock-a2' : 'opencu-a2');
  if (artifact) { await mkdir(artifact, { recursive: true }); await writeFile(join(artifact, 'declarations.json'), JSON.stringify(identity, null, 2) + '\n'); }
  assert.equal(identity.flow?.scope, 'session', 'Chat must publish the viewport-bound flow slot');
  assert.equal(identity.body?.scope, 'session', 'Chat must offer original reasoning through the session Body slot');
  assert.match(JSON.stringify(identity.tree), /conversation\.chat\.reasoning\.content/, 'Chat must publish its root Content Factory');
  const first = 'Original reasoning first line\n\n', second = '**Original reasoning second paragraph**\n';
  const original = first + second;
  let continueReasoning, finishReply;
  const reasoningGate = new Promise(resolve => { continueReasoning = resolve; });
  const replyGate = new Promise(resolve => { finishReply = resolve; });
  t.after(() => { continueReasoning(); finishReply(); });
  replyWith(async function* () {
    yield { delta: { role: 'assistant', reasoning_content: first }, finish_reason: null };
    await reasoningGate;
    yield { delta: { reasoning_content: second }, finish_reason: null };
    await replyGate;
    yield { delta: { content: 'Native a2 Chat reply.' }, finish_reason: 'stop' };
  });
  const reference = '<computer-use-target>' + JSON.stringify({ kind: 'browser', id: 'browser', label: 'Bound browser' }) + '</computer-use-target>';
  await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'Exercise native reasoning composition ' + reference }] });
  if (!stockChat) {
    await page.locator('.tx-cu-user-bubble [data-computer-use-reference="browser"]').waitFor();
    assert.doesNotMatch(await page.locator('.tx-cu-user-bubble').innerText(), /<computer-use-target>/, 'the native reference bubble projects the original serialized marker exactly once');
  }
  const liveReasoning = page.locator('[data-variant="think"][data-state="running"]');
  await liveReasoning.getByRole('button').click();
  const liveBody = page.locator('[data-opencu-reasoning-probe]');
  await liveBody.waitFor();
  assert.equal(await liveBody.getAttribute('data-original-reasoning'), first);
  await page.evaluate(() => { window.opencuReasoningRow = document.querySelector('[data-variant="think"]'); });
  continueReasoning();
  await page.waitForFunction(text => document.querySelector('[data-opencu-reasoning-probe]')?.getAttribute('data-original-reasoning') === text, original);
  assert.equal(await page.evaluate(() => document.querySelector('[data-variant="think"]') === window.opencuReasoningRow), true, 'stream growth keeps the open reasoning row mounted');
  assert.equal(await liveBody.getAttribute('data-reasoning-running'), 'true');
  finishReply();
  await page.getByText('Native a2 Chat reply.', { exact: true }).waitFor();
  if (artifact) {
    await writeFile(join(artifact, 'reply.html'), await page.content());
    await page.screenshot({ path: join(artifact, 'reply.png') });
  }
  const processToggle = page.locator('[data-turn-process-tool-calls]').last();
  if (await processToggle.getAttribute('aria-expanded') === 'false') await processToggle.click();
  const reasoning = page.locator('[data-variant="think"]');
  const groupToggle = page.locator('[data-chat-group-key]').filter({ has: reasoning }).locator('button[data-process-activity]');
  if (await groupToggle.isVisible() && await groupToggle.getAttribute('aria-expanded') === 'false') await groupToggle.click();
  if (await reasoning.getByRole('button').getAttribute('aria-expanded') !== 'true') await reasoning.getByRole('button').click();
  const body = page.locator('[data-opencu-reasoning-probe]');
  await body.waitFor();
  assert.equal(await body.getAttribute('data-original-reasoning'), original);
  assert.match(await body.innerText(), /Factory composition/);
  assert.match(await body.innerText(), /Original reasoning second paragraph/);
  assert.equal(await body.locator('strong').innerText(), 'Original reasoning second paragraph');
  assert.equal(await page.locator('[data-slot="conversation.chat.flow"]').count(), 1);
  await page.reload();
  await page.getByText('Native a2 Chat reply.', { exact: true }).waitFor();
  const restoredProcess = page.locator('[data-turn-process-tool-calls]').last();
  if (await restoredProcess.getAttribute('aria-expanded') === 'false') await restoredProcess.click();
  const restoredGroup = page.locator('[data-chat-group-key]').filter({ has: page.locator('[data-variant="think"]') }).locator('button[data-process-activity]');
  if (await restoredGroup.isVisible() && await restoredGroup.getAttribute('aria-expanded') === 'false') await restoredGroup.click();
  await page.locator('[data-variant="think"]').getByRole('button').click();
  assert.equal(await page.locator('[data-opencu-reasoning-probe]').getAttribute('data-original-reasoning'), original, 'cold replay preserves the original model reasoning');
  assert.deepEqual(await page.evaluate(() => window.opencuChatProbe.inspect().crashes), []);
  assert.deepEqual(errors, []);
  if (artifact) await page.screenshot({ path: join(artifact, 'reasoning-factory.png') });
});
