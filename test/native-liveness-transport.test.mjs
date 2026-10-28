import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {SourceTextModule, SyntheticModule, createContext} from 'node:vm';
import {createHelperTransport} from '../src/native/transport.mjs';

const fixture = fileURLToPath(new URL('./fixtures/native-transport.mjs', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bounded(promise, ms = 1000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('liveness deadline exceeded')), ms); })]); }
  finally { clearTimeout(timer); }
}
const until = predicate => bounded((async () => { while (!predicate()) await pause(1); })());
async function peer(t, config = {}, options = {}) {
  await mkdir(join(root, '.local'), {recursive: true});
  const directory = await mkdtemp(join(root, '.local/native-transport-'));
  const trace = join(directory, 'trace.jsonl'), journal = join(directory, 'journal.json');
  const transport = createHelperTransport(process.execPath, [fixture], {...options, env: {...process.env, OPENCU_TRANSPORT_FIXTURE: JSON.stringify({...config, trace, journal})}});
  t.after(async () => {
    try { await bounded(transport.disconnect(), 1000); } catch { try { process.kill(transport.pid, 'SIGKILL'); } catch {} }
    await rm(directory, {recursive: true, force: true});
  });
  await transport.request('hello');
  return {transport, directory, journal, trace: async () => (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line))};
}

test('real helper transport correlates reordered, duplicate and late replies without replay', async t => {
  const {transport} = await peer(t);
  assert.deepEqual(await Promise.all([transport.request('reverse', {value: 1}), transport.request('reverse', {value: 2})]), [1, 2]);
  await assert.rejects(transport.request('delayed', {delay: 70, value: 'late', duplicate: true}, {monitoring: true, timeoutMs: 10}), {code: 'PRESENTATION_TIMEOUT'});
  await pause(90);
  assert.deepEqual(await transport.request('verify'), {valid: true});
  await transport.close();
});

test('lost action receipt fails all pending input, asks EOF cleanup and never replays', async t => {
  const {transport, journal, trace} = await peer(t, {dropAct: true});
  const action = transport.request('act', {}, {timeoutMs: 30});
  const other = transport.request('delayed', {delay: 500, value: 'unconfirmed'});
  const settled = await Promise.allSettled([action, other]);
  assert(settled.every(value => value.status === 'rejected' && value.reason.code === 'HELPER_TIMEOUT'));
  assert(settled.every(value => value.reason.details.inputDispatched !== false));
  await transport.close();
  assert.deepEqual(JSON.parse(await readFile(journal, 'utf8')), {held: [], actions: 1});
  assert.equal((await trace()).filter(value => value.method === 'act').length, 1);
});

test('helper stdout EOF rejects pending work promptly and requests release through stdin EOF', async t => {
  const {transport, trace} = await peer(t);
  await assert.rejects(bounded(transport.request('stdoutEOF')), {code: 'HELPER_EOF'});
  await transport.close();
  assert((await trace()).some(value => value.eof));
});

for (const line of ['not-json', 'null', '[]', '{"id":2,"ok":"yes","result":{}}', '{"event":null}']) {
  test(`invalid helper envelope ${line} fails safely and releases instead of crashing`, async t => {
    const {transport} = await peer(t);
    await assert.rejects(bounded(transport.request('malformed', {line})), {code: 'HELPER_PROTOCOL'});
    await transport.close();
  });
}

test('advisory event and exit callbacks cannot break input replies or shutdown', async t => {
  const {transport} = await peer(t, {}, {onEvent: () => { throw Error('view disposed'); }, onExit: async () => { throw Error('view disconnected'); }});
  assert.deepEqual(await transport.request('event'), {eventSent: true});
  await transport.close();
});

test('closing is single flight and gates new requests before their dispatch', async t => {
  const {transport, trace} = await peer(t, {closeDelay: 50});
  const first = transport.close(), second = transport.close();
  await assert.rejects(transport.request('act'), error => error.code === 'HELPER_CLOSING' && error.details.inputDispatched === false);
  await Promise.all([first, second]);
  const requests = await trace();
  assert.equal(requests.filter(value => value.method === 'close').length, 1);
  assert.equal(requests.filter(value => value.method === 'act').length, 0);
});

test('clean close acknowledgement cannot conceal a failed process exit', async t => {
  const {transport} = await peer(t, {exitAfterClose: 2});
  await assert.rejects(transport.close(), {code: 'HELPER_EXITED'});
});

test('unconfirmed helper exit is bounded and a later clean exit can confirm release', async t => {
  const {transport} = await peer(t, {eofDelay: 250}, {exitTimeout: 40});
  await assert.rejects(bounded(transport.close()), {code: 'HELPER_EXIT_TIMEOUT'});
  await pause(300);
  await transport.close();
});

test('unserializable request fails before dispatch without poisoning a live peer', async t => {
  const {transport} = await peer(t);
  const params = {}; params.cycle = params;
  await assert.rejects(transport.request('act', params), error => error.code === 'INVALID_REQUEST' && error.details.inputDispatched === false);
  assert.deepEqual(await transport.request('verify'), {valid: true});
  await transport.close();
});

async function nativeBackend(t, onCursor, configurations = {}) {
  const peers = [];
  await mkdir(join(root, '.local'), {recursive: true});
  const directory = await mkdtemp(join(root, '.local/native-backend-'));
  t.after(async () => {
    for (const {transport} of peers) {
      try { await transport.disconnect(); } catch { try { process.kill(transport.pid, 'SIGKILL'); } catch {} }
    }
    await rm(directory, {recursive: true, force: true});
  });
  const url = new URL('../src/native/backend.mjs', import.meta.url);
  const context = createContext({process: {...process, platform: 'darwin'}, URL, setInterval, clearInterval,
    setTimeout: (callback, ms) => setTimeout(callback, ms === 2000 ? 35 : ms), clearTimeout});
  const source = new SourceTextModule(await readFile(url, 'utf8'), {context, initializeImportMeta: meta => { meta.url = url.href; }});
  let mainCount = 0;
  await source.link(async specifier => {
    let exports;
    if (specifier === './build.mjs') exports = {buildMacHelper: async () => '/synthetic/OpenCU Helper.app/Contents/MacOS/helper'};
    else if (specifier === './macos-install.mjs') exports = {installMacHelper: async value => value};
    else if (specifier === './macos-identity.mjs') exports = {checkMacHelperIdentity: async () => {}};
    else if (specifier === './transport.mjs') exports = {createHelperTransport: (_command, args, options) => {
      const role = args[0] === '--permissions' ? 'probe' : args[0] === '--installation-lock' ? 'lease' : `main${++mainCount}`;
      const transport = createHelperTransport(process.execPath, [fixture], {...options, timeout: 800, exitTimeout: 80,
        env: {...process.env, OPENCU_TRANSPORT_FIXTURE: JSON.stringify({...(role.startsWith('main') ? {journal: join(directory, 'backend-journal.json')} : {}), ...configurations[role]})}});
      const item = {transport, role}, close = transport.close;
      transport.close = () => { item.closeStarted = true; return close(); };
      peers.push(item);
      return transport;
    }};
    else exports = await import(specifier.startsWith('node:') ? specifier : new URL(specifier, url).href);
    return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, {context});
  });
  await source.evaluate();
  const backend = await source.namespace.createNativeBackend({dataDir: directory, onCursor});
  return {backend, peers, journal: join(directory, 'backend-journal.json')};
}

test('native release and close finish even when the cursor view never settles', async t => {
  const events = [];
  const {backend} = await nativeBackend(t, value => { events.push(value); return new Promise(() => {}); });
  await backend.act({id: 'synthetic-target'}, {type: 'move', x: 1, y: 2});
  assert.equal(events[0].visible, true);
  assert.equal((await bounded(backend.release())).released, true);
  await bounded(backend.close());
  await pause(90);
  assert(events.some(value => value.visible === false), 'a hung old view must not trap the pending hide forever');
});

test('closing releases native input before a slow fresh permission probe finishes', async t => {
  const {backend, peers} = await nativeBackend(t, undefined, {probe: {permissions: true, permissionDelay: 250}});
  const permissions = backend.permissions();
  await until(() => peers.some(peer => peer.role === 'probe'));
  const closing = backend.close();
  await pause(70);
  await assert.rejects(peers.find(peer => peer.role === 'main1').transport.request('verify'), error => ['HELPER_CLOSING', 'HELPER_EXITED', 'HELPER_EOF'].includes(error.code));
  await Promise.all([permissions, closing]);
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 1);
});

test('close during helper replacement never starts a fresh helper after shutdown', async t => {
  const {backend, peers} = await nativeBackend(t, undefined, {main1: {closeDelay: 100}, probe: {permissions: true}});
  const permissions = backend.permissions();
  await until(() => peers.find(peer => peer.role === 'main1').closeStarted);
  const closing = backend.close();
  await Promise.all([permissions, closing]);
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 1);
});

test('native human activity is reported without stopping a subsequent action', async t => {
  const {backend} = await nativeBackend(t);
  const observed = await backend.observe({id: 'synthetic-target'});
  assert.equal(observed.userActivity.kind, 'keyboard');
  assert.equal((await backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'a'})).actions, 1);
  await backend.release(); await backend.close();
});

test('release recovers a dead helper journal without replaying an uncertain action', async t => {
  const {backend, peers, journal} = await nativeBackend(t, undefined, {main1: {dropAct: true, failRelease: true, exitCode: 2}});
  await assert.rejects(backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'a'}), {code: 'HELPER_TIMEOUT'});
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 1);
  assert.deepEqual(JSON.parse(await readFile(journal, 'utf8')), {held: ['SyntheticKey'], actions: 1});
  assert.equal((await backend.release()).released, true);
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 2);
  assert.deepEqual(JSON.parse(await readFile(journal, 'utf8')), {held: [], actions: 1});
  assert.equal((await backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'b'})).actions, 2);
  await backend.close();
});

test('recovery never replaces a helper whose old process has not exited', async t => {
  const {backend, peers} = await nativeBackend(t, undefined, {main1: {dropAct: true, eofDelay: 250}});
  await assert.rejects(backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'a'}), {code: 'HELPER_TIMEOUT'});
  await assert.rejects(backend.release(), {code: 'HELPER_EXIT_TIMEOUT'});
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 1);
  await pause(300);
  assert.equal((await backend.release()).released, true);
  await backend.close();
});

test('failed replacement retains recovery responsibility and a later explicit release can retry', async t => {
  const {backend, peers} = await nativeBackend(t, undefined, {main1: {dropAct: true}, main2: {failHello: 'NATIVE_DATA_LOCKED'}});
  await assert.rejects(backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'a'}), {code: 'HELPER_TIMEOUT'});
  await assert.rejects(backend.release(), {code: 'NATIVE_DATA_LOCKED'});
  assert.equal((await backend.release()).released, true);
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 3);
  await backend.close();
});

test('permission refresh waits for held input and replaces the helper only after release', async t => {
  const {backend, peers} = await nativeBackend(t, undefined, {probe: {permissions: true}, main2: {permissions: true}});
  await backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'a'});
  assert.equal((await backend.permissions()).accessibility, true);
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 1);
  await backend.release();
  await backend.permissions();
  assert.equal(peers.filter(peer => peer.role.startsWith('main')).length, 2);
  assert.equal((await backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'b'})).actions, 2);
  await backend.close();
});

test('unsupported fresh helper protocol cannot be accepted as input recovery', async t => {
  const {backend} = await nativeBackend(t, undefined, {main1: {dropAct: true}, main2: {protocol: 2}});
  await assert.rejects(backend.act({id: 'synthetic-target'}, {type: 'key_down', key: 'a'}), {code: 'HELPER_TIMEOUT'});
  await assert.rejects(backend.release(), {code: 'HELPER_PROTOCOL'});
  assert.equal((await backend.release()).released, true);
  await backend.close();
});
