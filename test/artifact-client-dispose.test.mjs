import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dependencyRequire } from '../scripts/dependencies.mjs';
import { createArtifactDocumentsHost } from '../src/client/artifact-documents.mjs';
import { operateArtifactDocument } from '../host/artifact-documents.ts';

// Run REA's persistence controller unchanged; replace only its XLSX exporter.
const source = await readFile(new URL('../src/client/rea/artifact-tab-content.electron-64a58871ee86.js', import.meta.url), 'utf8');
const ast = dependencyRequire()('acorn').parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
let controllerClass;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'AssignmentExpression' && node.left.name === 'so' && node.right.type === 'ClassExpression') controllerClass = source.slice(node.right.start, node.right.end);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
}
visit(ast);
assert.ok(controllerClass, 'pinned REA persistence controller must be present');
const dispose = value => value?.[Symbol.dispose]?.();
const hash = value => createHash('sha256').update(value).digest('hex');
const Controller = Function('oo', 'no', 'to', 'gt', 'aa', 'Xa', 'Za', 'qa', 'io', 'ao', 'return (' + controllerClass + ')')(
  { status: 'starting' }, dispose, value => { dispose(value.value.subscription.unsubscribe()); dispose(value); }, value => value,
  () => () => {}, async value => hash(value), (a, b) => Buffer.from(a).equals(Buffer.from(b)),
  async ({ record }) => ({ stateVersion: record.stateVersion, publicFileBytes: new Uint8Array([9, 8, 7]) }), 500, 1000,
);

test('last client teardown waits for late REA worker update, durable append and materialization', { timeout: 3000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencu-artifact-dispose-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'fixture.xlsx'), bytes = new Uint8Array([1, 2, 3]), commands = [];
  await writeFile(path, bytes);
  const host = createArtifactDocumentsHost({ files(_operation, { command, request }) {
    commands.push(command);
    return operateArtifactDocument(join(directory, 'journals'), path, command, request, async data => { await writeFile(path, data); return { outcome: 'saved' }; });
  } });
  const binding = await host.bindToExactFile({ publicFilePath: path });
  const request = { publicFilePath: path, workspaceRoot: directory, documentId: 'fixture-document' };
  await binding.adopt({ ...request, kind: 'spreadsheet', checkpoint: [1], publicFileHash: hash(bytes) });
  const controller = new Controller({ ...request, artifactDocuments: host, initialPublicFileBytes: bytes, initialWorkbookProto: {},
    onBeforePublicFileMaterialization() {}, onPublicFileMaterialized() {} });
  Object.assign(controller, { artifactDocuments: binding, documentId: request.documentId, publicFileHash: hash(bytes), snapshot: { status: 'live', sessionKey: 0 } });
  const worker = Promise.withResolvers();
  let stopped = false, settled = false;
  host.registerEditor({ quiesce() {}, async flush() {}, resume() {}, stop() { stopped = true; controller.onCrdtDrain(worker.promise); setTimeout(() => controller.dispose(), 0); } });
  const closing = host.dispose().then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, true);
  assert.equal(settled, false, 'IPC snapshot is empty but the worker has not delivered its final update');
  controller.onCrdtUpdate(new Uint8Array([4, 5]));
  worker.resolve();
  await closing;
  assert.equal(controller.disposed, true);
  assert.deepEqual(Array.from(await readFile(path)), [9, 8, 7]);
  assert.ok(commands.includes('append'));
  assert.ok(commands.includes('materialize'));
  assert.equal(controller.appendQueue.length, 0);
  assert.equal(controller.materializedStateVersion, 1);
  assert.throws(() => host.bindToExactFile({ publicFilePath: path }), /unavailable/);
});


test('failed flush preserves every editor and permits a later teardown retry', async () => {
  const host = createArtifactDocumentsHost({ files() {} }), state = [];
  let fail = true;
  for (let index = 0; index < 2; index++) host.registerEditor({
    quiesce() { state.push('pause:' + index); },
    async flush() { if (index === 1 && fail) throw Error('fixture save conflict'); },
    stop() { state.push('stop:' + index); },
    resume() { state.push('resume:' + index); },
  });
  await assert.rejects(host.dispose(), /save conflict/);
  assert.deepEqual(state, ['pause:0', 'pause:1', 'resume:0', 'resume:1']);
  fail = false;
  await host.dispose();
  assert.deepEqual(state.slice(-4), ['pause:0', 'pause:1', 'stop:0', 'stop:1']);
});
