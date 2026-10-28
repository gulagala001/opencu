import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(read) {
  const deadline = performance.now() + 2000;
  while (performance.now() < deadline) {
    let timer, value;
    try {
      value = await Promise.race([read(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Expected direct-session stage was not reached')), Math.max(1, deadline - performance.now()));
      })]);
    } finally { clearTimeout(timer); }
    if (value) return value; await tick();
  }
  assert.fail('Expected direct-session stage was not reached');
}
const observed = work => work.then(value => ({value}), error => ({error}));
const bind = {code: 'var app = await cua.getApp("native:fixture");', timeoutMs: 1000};

// Copy the unchanged direct entry and replace only its runtime import boundary.
// Runtime, approvals, controller and Worker stay production code; the native
// backend records synthetic calls without launching apps or generating OS input.
async function fixture(t) {
  const root = await mkdtemp(join(process.env.OPENCU_TEST_TEMP_DIR ?? tmpdir(), 'opencu-direct-approval-'));
  const cleanups = [];
  t.after(async () => {
    try { for (const close of cleanups.reverse()) await close(); }
    finally { await rm(root, {recursive: true, force: true}); }
  });
  await mkdir(join(root, 'scripts')); await mkdir(join(root, 'src', 'dsh'), {recursive: true});
  const script = join(root, 'scripts', 'cu-direct.mjs'), callsFile = join(root, 'calls.jsonl');
  await copyFile(new URL('../scripts/cu-direct.mjs', import.meta.url), script);
  await symlink(fileURLToPath(new URL('../scripts/cu-metrics.mjs', import.meta.url)), join(root, 'scripts', 'cu-metrics.mjs'));
  for (const name of ['computer.mjs', 'repl-output.mjs'])
    await symlink(fileURLToPath(new URL(`../src/dsh/${name}`, import.meta.url)), join(root, 'src', 'dsh', name));
  await writeFile(callsFile, '');
  await writeFile(join(root, 'src', 'dsh', 'runtime.mjs'), `
import {appendFile} from 'node:fs/promises';
import {createPluginRuntime as create} from ${JSON.stringify(new URL('../src/dsh/runtime.mjs', import.meta.url).href)};
const target = {id:'native:fixture',backend:'native',kind:'app',name:'Synthetic Fixture',title:'Synthetic Fixture',
  identity:{bundleId:'synthetic.direct.fixture',executable:'/synthetic/direct-fixture',pid:42,windowId:7}};
const record = method => appendFile(${JSON.stringify(callsFile)}, JSON.stringify({method})+'\\n');
export const createPluginRuntime = options => create({...options,native:{
  listTargets:async()=>[target],verify:async()=>({valid:true,target}),
  select:async()=>{await record('select');return target;},observe:async()=>({ax:{nodes:[]}}),
  act:async()=>{await record('act');return {};},release:async()=>({released:true}),close:async()=>{},
}});
`);
  const {createDirectSession} = await import(pathToFileURL(script).href);
  let sequence = 0;
  async function session() {
    const name = String(++sequence);
    const cu = await createDirectSession({dataDir: join(root, name, 'data'), outputDir: join(root, name, 'output'), config: {browserEnabled: false}});
    cleanups.push(() => cu.close()); return cu;
  }
  return {root, script, session, cleanups, calls: async () => (await readFile(callsFile, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)};
}
async function pending(cu) { return until(async () => (await cu.request('appApprovals/pending')).requests[0]); }
const accept = (cu, request) => cu.request('appApprovals/respond', {requestId: request.id, action: 'accept', persist: 'session'});

test('direct approvals are discoverable, explicit and limited to the current session', async t => {
  const f = await fixture(t), a = await f.session(), b = await f.session();
  const binding = observed(a.run(bind)), request = await pending(a);
  assert.equal(request.request.appDisplayName, 'Synthetic Fixture');
  assert.deepEqual((await b.request('appApprovals/pending')).requests, []);
  await assert.rejects(a.request('appApprovals/pending', {conversationId: 'another-session'}), {code: 'APP_SESSION_MISMATCH'});
  await assert.rejects(b.request('appApprovals/respond', {requestId: request.id, action: 'accept', persist: 'session'}), {code: 'APP_REQUEST_EXPIRED'});
  await assert.rejects(b.request('appApprovals/respond', {conversationId: request.conversationId,
    requestId: request.id, action: 'accept', persist: 'session'}), {code: 'APP_SESSION_MISMATCH'});
  assert.deepEqual(await f.calls(), [], 'No native call is admitted before explicit acceptance');
  await a.request('appApprovals/respond', {requestId: request.id, action: 'decline'});
  assert.equal((await binding).error.code, 'APP_ACCESS_DENIED');
  assert.deepEqual(await f.calls(), []);
  const retry = observed(a.run(bind)), next = await pending(a);
  assert.notEqual(next.id, request.id);
  await accept(a, next); assert.equal((await retry).value.ok, true);
  assert.equal((await a.run({code: 'app.id'})).outputs.at(-1), 'native:fixture');
  assert.deepEqual(await f.calls(), [{method: 'select'}]);
  assert.deepEqual((await a.request('appApprovals/read')).approvals.approvedApps, [], 'Session approval is not persisted');
  await assert.rejects(accept(a, next), {code: 'APP_REQUEST_EXPIRED'});
});

for (const mode of ['abort', 'reset', 'close']) test(`direct ${mode} cancels waiting approvals and rejects late responses`, async t => {
  const f = await fixture(t), cu = await f.session(), aborter = new AbortController();
  const binding = observed(cu.run(bind, aborter.signal));
  const selection = observed(cu.request('select', {reference: {id: 'native:fixture'}}, {signal: aborter.signal}));
  const request = await pending(cu);
  if (mode === 'abort') aborter.abort(Object.assign(new Error('Synthetic caller cancellation'), {code: 'CALLER_CANCELLED'}));
  else await cu[mode]();
  assert.ok((await binding).error); assert.ok((await selection).error);
  assert.deepEqual(await f.calls(), []);
  if (mode === 'close') {
    assert.throws(() => accept(cu, request), {code: 'SESSION_CLOSED'});
    assert.deepEqual(await cu.close(), {ok: true, closed: true});
  } else {
    assert.deepEqual((await cu.request('appApprovals/pending')).requests, []);
    await assert.rejects(accept(cu, request), {code: 'APP_REQUEST_EXPIRED'});
    const retry = observed(cu.run(bind)), next = await pending(cu);
    assert.notEqual(next.id, request.id);
    await accept(cu, next); assert.equal((await retry).value.ok, true);
  }
});

async function stdio(t, f) {
  const child = spawn(process.execPath, [f.script, '--data-dir', join(f.root, 'stdio', 'data'),
    '--output-dir', join(f.root, 'stdio', 'output'), '--config', JSON.stringify({browserEnabled: false})], {stdio: ['pipe', 'pipe', 'pipe']});
  const pending = new Map(), receipts = []; let sequence = 0, stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', value => { stderr += value; });
  const lines = createInterface({input: child.stdout});
  lines.on('line', line => {
    const receipt = JSON.parse(line); receipts.push(receipt);
    pending.get(receipt.id)?.resolve(receipt); pending.delete(receipt.id);
  });
  const exited = new Promise(resolve => child.on('exit', (code, signal) => {
    for (const value of pending.values()) value.reject(new Error(`Direct CLI exited: ${code}/${signal}: ${stderr}`));
    pending.clear(); resolve({code, signal});
  }));
  f.cleanups.push(async () => { if (child.exitCode == null && child.signalCode == null) child.kill('SIGTERM'); await exited; lines.close(); });
  return {receipts, exited, send(input) {
    const id = ++sequence;
    const receipt = new Promise((resolve, reject) => pending.set(id, {resolve, reject}));
    // Tests keep stdin open while a run awaits a later explicit decision.
    child.stdin.write(JSON.stringify({...input, id}) + '\n'); return receipt;
  }};
}
const stdioPending = cli => until(async () => (await cli.send({method: 'request', endpoint: 'appApprovals/pending'})).result.requests[0]);

test('stdio approval controls pass a waiting run while ordinary input stays queued', async t => {
  const f = await fixture(t), cli = await stdio(t, f);
  let acted = false;
  const binding = cli.send(bind), input = cli.send({method: 'request', endpoint: 'act', args: {action: 'type', text: 'synthetic only'}}).then(value => { acted = true; return value; });
  const request = await stdioPending(cli);
  assert.equal(acted, false); assert.deepEqual(await f.calls(), []);
  const response = await cli.send({method: 'request', endpoint: 'appApprovals/respond', args: {requestId: request.id, action: 'accept', persist: 'session'}});
  assert.equal(response.ok, true); assert.equal((await binding).ok, true); assert.equal((await input).result.ok, true);
  assert.deepEqual(await f.calls(), [{method: 'select'}, {method: 'act'}]);
  assert.equal((await cli.send({method: 'close'})).result.closed, true);
  assert.equal((await cli.exited).code, 0);
});

test('stdio reset invalidates queued input, cancels approval and permits a fresh run', async t => {
  const f = await fixture(t), cli = await stdio(t, f);
  const binding = cli.send(bind), input = cli.send({method: 'request', endpoint: 'act', args: {action: 'type', text: 'must never execute'}});
  const request = await stdioPending(cli);
  assert.equal((await cli.send({method: 'reset'})).result.reset, true);
  assert.equal((await binding).ok, false); assert.equal((await input).error.code, 'SESSION_RESET');
  assert.deepEqual(await f.calls(), []);
  assert.deepEqual((await cli.send({method: 'request', endpoint: 'appApprovals/pending'})).result.requests, []);
  const late = await cli.send({method: 'request', endpoint: 'appApprovals/respond', args: {requestId: request.id, action: 'accept', persist: 'session'}});
  assert.equal(late.error.code, 'APP_REQUEST_EXPIRED');
  assert.equal((await cli.send({code: '40+2'})).result.outputs.at(-1), '42');
  await cli.send({method: 'close'}); assert.equal((await cli.exited).code, 0);
});

test('stdio reset invalidates unstarted runs and ordinary requests', async t => {
  const f = await fixture(t), cli = await stdio(t, f);
  const active = cli.send({code: 'while(true) {}', timeoutMs: 10000});
  const queuedRun = cli.send({code: 'var stale = 42;'}), queuedRequest = cli.send({method: 'request', endpoint: 'state'});
  assert.equal((await cli.send({method: 'reset'})).result.reset, true);
  assert.equal((await active).ok, false);
  assert.equal((await queuedRun).error?.code, 'SESSION_RESET');
  assert.equal((await queuedRequest).error?.code, 'SESSION_RESET');
  assert.equal((await cli.send({code: 'typeof stale'})).result.outputs.at(-1), 'undefined');
  await cli.send({method: 'close'}); assert.equal((await cli.exited).code, 0);
});

test('stdio close cancels approval and queued input before exiting', async t => {
  const f = await fixture(t), cli = await stdio(t, f);
  const binding = cli.send(bind), input = cli.send({method: 'request', endpoint: 'act', args: {action: 'type', text: 'must never execute'}});
  await stdioPending(cli);
  assert.equal((await cli.send({method: 'close'})).result.closed, true);
  assert.equal((await binding).ok, false); assert.equal((await input).error.code, 'SESSION_RESET');
  assert.deepEqual(await f.calls(), []); assert.equal((await cli.exited).code, 0);
});

for (const kind of ['file', 'directory']) test('stdio starts through a ' + kind + ' symlink and keeps approval control available', async t => {
  const f = await fixture(t);
  const link = join(f.root, kind === 'file' ? 'direct-link.mjs' : 'scripts-link');
  await symlink(kind === 'file' ? f.script : join(f.root, 'scripts'), link, kind === 'directory' ? 'dir' : 'file');
  const cli = await stdio(t, { ...f, script: kind === 'file' ? link : join(link, 'cu-direct.mjs') });
  const binding = cli.send(bind);
  const request = await stdioPending(cli);
  assert.equal((await cli.send({ method: 'request', endpoint: 'appApprovals/respond', args: { requestId: request.id, action: 'accept', persist: 'session' } })).ok, true);
  assert.equal((await binding).ok, true);
  assert.deepEqual(await f.calls(), [{ method: 'select' }]);
  assert.equal((await cli.send({ method: 'close' })).result.closed, true);
  assert.equal((await cli.exited).code, 0);
});
