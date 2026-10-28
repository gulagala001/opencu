// A real JSON-lines peer with synthetic input only; never loads a native helper.
import {createInterface} from 'node:readline';
import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs';

const config = JSON.parse(process.env.OPENCU_TRANSPORT_FIXTURE || '{}');
const trace = value => { if (config.trace) appendFileSync(config.trace, JSON.stringify(value) + '\n'); };
const send = value => { if (!process.stdout.destroyed && !process.stdout.writableEnded) process.stdout.write(JSON.stringify(value) + '\n'); };
let held = [], actions = 0, requests = [], timers = new Set();
const later = (fn, ms) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); };
const release = () => {
  if (config.failRelease) { trace({released: false}); return {released: false, heldKeys: held, heldButtons: []}; }
  held = []; if (config.journal) writeFileSync(config.journal, JSON.stringify({held, actions}));
  trace({released: true}); return {released: true, heldKeys: [], heldButtons: []};
};
if (config.journal && existsSync(config.journal)) {
  const saved = JSON.parse(readFileSync(config.journal, 'utf8'));
  held = saved.held; actions = saved.actions;
}
const input = createInterface({input: process.stdin});
input.on('line', line => {
  const request = JSON.parse(line), {id, method, params = {}} = request;
  trace({id, method});
  const reply = result => send({id, ok: true, result});
  if (method === 'hello') {
    if (config.failHello) { send({id: 0, ok: false, error: {code: config.failHello, message: 'Synthetic helper startup rejected'}}); process.exitCode = 2; input.close(); process.stdin.destroy(); return; }
    reply({protocol: config.protocol ?? 1, input: {heldKeys: held, heldButtons: []}}); return;
  }
  if (method === 'close') {
    if (config.dropClose) return;
    later(() => { reply(release()); if (config.exitAfterClose !== undefined) process.exit(config.exitAfterClose); }, config.closeDelay || 0);
    return;
  }
  if (method === 'release') { reply(release()); return; }
  if (method === 'permissions') {
    later(() => reply({permissionOwner: 'helper', accessibility: !!config.permissions}), config.permissionDelay || 0);
    return;
  }
  if (method === 'configureCursor') { reply({configured: true}); return; }
  if (method === 'malformed') { process.stdout.write(params.line + '\n'); return; }
  if (method === 'stdoutEOF') { process.stdout.end(); return; }
  if (method === 'event') { send({event: {type: 'cursor', visible: false}}); reply({eventSent: true}); return; }
  if (method === 'delayed') {
    later(() => { reply(params.value); if (params.duplicate) reply({duplicate: true}); }, params.delay);
    return;
  }
  if (method === 'reverse') {
    requests.push(request);
    if (requests.length === 2) { for (const item of requests.reverse()) send({id: item.id, ok: true, result: item.params.value}); requests = []; }
    return;
  }
  if (method === 'act') {
    actions++; held = ['SyntheticKey'];
    if (config.journal) writeFileSync(config.journal, JSON.stringify({held, actions}));
    send({event: {type: 'cursor', visible: true, targetId: params.target?.id, x: 1, y: 2}});
    if (!config.dropAct) reply({input: {heldKeys: held, heldButtons: []}, actions});
    return;
  }
  if (method === 'observe') { reply({userActivity: {documentId: 'physical-input', sequence: 1, kind: 'keyboard'}}); return; }
  if (method === 'verify') { reply({valid: true}); return; }
  reply({method});
});
input.on('close', () => {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  trace({eof: true}); release();
  if (config.eofDelay) later(() => process.exit(config.exitCode || 0), config.eofDelay);
  else process.exitCode = config.exitCode || 0;
});
