#!/usr/bin/env node
/** Lightweight CU measurements. Labels must be synthetic identifiers, never user content.
 * API: const sampler = await startSampler({ groups: { codex: [123] }, output,
 *   summary, markers, intervalMs: 500 }); await sampler.mark('idle'); await sampler.stop();
 * recordCall({ output, label: 'snapshot', phase: 'observe', durationMs: 42, resultBytes: 123 });
 */
import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cpuNote = process.platform === 'darwin'
  ? 'Sum of ps %cpu: macOS decaying average over up to one minute; not interval CPU. Can exceed 100%.'
  : 'Sum of platform ps %cpu; Linux normally averages CPU time over process lifetime; not interval CPU. Can exceed 100%.';
const label = (value, name = 'label') => {
  if (typeof value !== 'string' || !/^[\w .:/-]{1,120}$/.test(value)) {
    throw new Error(`${name} must be a synthetic ASCII identifier (1–120 characters)`);
  }
  return value;
};
const number = (value, name) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a nonnegative finite number`);
  return value;
};
async function append(output, row) {
  await mkdir(dirname(output), { recursive: true });
  await appendFile(output, `${JSON.stringify(row)}\n`, { mode: 0o600 });
}
function stats(values) {
  if (!values.length) return { peak: null, median: null, last: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { peak: sorted.at(-1), median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, last: values.at(-1) };
}
function normalizeGroups(groups) {
  if (!groups || !Object.keys(groups).length) throw new Error('At least one root PID/group is required');
  return Object.fromEntries(Object.entries(groups).map(([name, roots]) => {
    label(name, 'group');
    const pids = [...new Set(Array.isArray(roots) ? roots : [roots])];
    if (!pids.length || pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) throw new Error('Root PIDs must be positive integers');
    return [name, pids];
  }));
}
function descendants(roots, children, present) {
  const found = new Set();
  const pending = [...roots];
  while (pending.length) {
    const pid = pending.pop();
    if (!present.has(pid) || found.has(pid)) continue;
    found.add(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  return found;
}

export async function recordCall({ output, label: callLabel, phase = 'unmarked', durationMs, resultBytes, ok = true }) {
  if (!output) throw new Error('output is required');
  if (typeof ok !== 'boolean') throw new Error('ok must be boolean');
  const row = { type: 'call', at: new Date().toISOString(), label: label(callLabel), phase: label(phase, 'phase'),
    durationMs: number(durationMs, 'durationMs'), resultBytes: number(resultBytes, 'resultBytes'), ok };
  await append(output, row);
  return row;
}

export async function summarizeCalls({ input, output }) {
  if (!input || !output || resolve(input) === resolve(output)) throw new Error('Distinct input and output files are required');
  const calls = (await readFile(input, 'utf8')).split('\n').filter(line => line.trim()).map(JSON.parse).filter(row => row.type === 'call');
  for (const row of calls) {
    label(row.label); label(row.phase, 'phase');
    number(row.durationMs, 'durationMs'); number(row.resultBytes, 'resultBytes');
    if (typeof row.ok !== 'boolean') throw new Error('Invalid call status');
  }
  const summarize = rows => ({ callCount: rows.length, failedCount: rows.filter(row => !row.ok).length,
    durationMs: stats(rows.map(row => row.durationMs)), resultBytes: stats(rows.map(row => row.resultBytes)),
    totalDurationMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
    totalResultBytes: rows.reduce((sum, row) => sum + row.resultBytes, 0) });
  const by = key => Object.fromEntries([...new Set(calls.map(row => row[key]))].map(value => [value, summarize(calls.filter(row => row[key] === value))]));
  const result = { type: 'call-summary', ...summarize(calls), byLabel: by('label'), byPhase: by('phase') };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  return result;
}

export async function startSampler({ groups, output, summary, markers, intervalMs = 500 }) {
  groups = normalizeGroups(groups);
  if (!output) throw new Error('output is required');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 50) throw new Error('intervalMs must be an integer >= 50');
  if (markers && resolve(markers) === resolve(output)) throw new Error('markers and output must differ');
  if (summary && [output, markers].filter(Boolean).some(path => resolve(path) === resolve(summary))) throw new Error('summary must use a separate file');
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const samples = [];
  let phase = 'unmarked', stopped = false, timer, pending = Promise.resolve(), stopping;
  let markerBytes = 0, markerPartial = '';
  const enqueue = fn => {
    const current = pending.then(fn);
    pending = current.catch(() => {});
    return current;
  };
  const markInternal = async value => {
    phase = label(value, 'phase');
    await append(output, { type: 'marker', at: new Date().toISOString(), elapsedMs: performance.now() - started, phase });
  };
  async function readMarkers() {
    if (!markers) return;
    let data;
    try { data = await readFile(markers); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (data.length < markerBytes) { markerBytes = 0; markerPartial = ''; }
    markerPartial += data.subarray(markerBytes).toString('utf8');
    markerBytes = data.length;
    const lines = markerPartial.split('\n');
    markerPartial = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { await markInternal(JSON.parse(line).phase); }
      catch { await append(output, { type: 'marker-error', at: new Date().toISOString(), code: 'INVALID_MARKER' }); }
    }
  }
  async function sample() {
    await readMarkers();
    const tick = performance.now();
    try {
      const request = exec('ps', ['-axo', 'pid=,ppid=,rss=,%cpu='], {
        encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, maxBuffer: 16 * 1024 * 1024, timeout: 5000,
      });
      const collectorPid = request.child?.pid;
      const { stdout } = await request;
      const processes = new Map(), children = new Map();
      for (const line of stdout.trim().split('\n')) {
        const fields = line.trim().split(/\s+/).map(Number);
        if (fields.length !== 4 || fields.some(value => !Number.isFinite(value))) continue;
        const [pid, ppid, rssKiB, cpuPercent] = fields;
        processes.set(pid, { rssBytes: rssKiB * 1024, cpuPercent });
        if (!children.has(ppid)) children.set(ppid, []);
        children.get(ppid).push(pid);
      }
      const exclude = descendants(collectorPid ? [collectorPid] : [], children, processes);
      exclude.add(process.pid);
      const memberships = new Map();
      const groupValues = Object.create(null);
      for (const [name, roots] of Object.entries(groups)) {
        const pids = [...descendants(roots, children, processes)].filter(pid => !exclude.has(pid));
        for (const pid of pids) memberships.set(pid, (memberships.get(pid) ?? 0) + 1);
        groupValues[name] = { rootPids: roots, rootsPresent: roots.filter(pid => processes.has(pid)).length,
          processCount: pids.length, rssBytes: pids.reduce((sum, pid) => sum + processes.get(pid).rssBytes, 0),
          cpuPercent: pids.reduce((sum, pid) => sum + processes.get(pid).cpuPercent, 0) };
      }
      const row = { type: 'sample', at: new Date().toISOString(), elapsedMs: tick - started, phase,
        collectionMs: performance.now() - tick, overlappingProcessCount: [...memberships.values()].filter(count => count > 1).length,
        groups: groupValues };
      samples.push(row);
      await append(output, row);
    } catch (error) {
      await append(output, { type: 'sample-error', at: new Date().toISOString(), elapsedMs: tick - started,
        phase, code: typeof error.code === 'string' ? error.code : 'PS_FAILED' });
    }
  }
  await append(output, { type: 'metadata', startedAt, platform: process.platform, intervalMs, groups, cpuNote,
    rssNote: 'Sum of ps RSS (KiB × 1024); shared pages may be counted more than once. Excludes sampler process and ps collector.',
    treeNote: 'Current root PID plus current descendants. Reparented processes are excluded; root PID reuse is not tracked. Overlapping groups are reported separately.' });
  let nextTick = performance.now();
  await enqueue(sample);
  function schedule() {
    if (stopped) return;
    nextTick += intervalMs;
    if (nextTick < performance.now()) nextTick = performance.now();
    timer = setTimeout(() => {
      enqueue(sample).then(schedule, () => { stopped = true; });
    }, Math.max(0, nextTick - performance.now()));
  }
  schedule();
  return {
    mark(value) {
      if (stopped) return Promise.reject(new Error('Sampler stopped'));
      try { label(value, 'phase'); } catch (error) { return Promise.reject(error); }
      return enqueue(() => markInternal(value));
    },
    stop() {
      if (stopping) return stopping;
      stopped = true;
      clearTimeout(timer);
      stopping = (async () => {
        await pending;
        await readMarkers();
        const summarize = rows => Object.fromEntries(Object.keys(groups).map(name => [name, {
          sampleCount: rows.length, rssBytes: stats(rows.map(row => row.groups[name].rssBytes)),
          cpuPercent: stats(rows.map(row => row.groups[name].cpuPercent)),
          processCount: stats(rows.map(row => row.groups[name].processCount)),
        }]));
        const result = { type: 'summary', startedAt, finishedAt: new Date().toISOString(), durationMs: performance.now() - started,
          sampleCount: samples.length, cpuNote, groups: summarize(samples),
          phases: Object.fromEntries([...new Set(samples.map(row => row.phase))].map(name => [name, summarize(samples.filter(row => row.phase === name))])) };
        await append(output, result);
        if (summary) { await mkdir(dirname(summary), { recursive: true }); await writeFile(summary, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }); }
        return result;
      })();
      return stopping;
    },
  };
}

const help = `CU metrics (synthetic labels only; no commands, arguments, results or user text are saved)
  node scripts/cu-metrics.mjs sample --root PID --output FILE [--duration MS]
  node scripts/cu-metrics.mjs sample --group codex=PID[,PID] --group opencu=PID --output FILE
    [--summary FILE] [--markers FILE] [--stdin] [--interval 500] [--duration MS]
  node scripts/cu-metrics.mjs record --output FILE --label snapshot --duration-ms 42 --result-bytes 123
    [--phase observe] [--ok true|false]
  node scripts/cu-metrics.mjs summarize --input CALLS_JSONL --output SUMMARY_JSON
Markers: append a newline-terminated {"phase":"idle"} to FILE or stdin; other fields are ignored.
SIGINT/SIGTERM stop only this sampler, flush summary, and never signal the measured processes.
Process groups are current descendants including root; shared RSS may be double counted.
${cpuNote}`;

async function main(argv) {
  const command = argv.shift();
  if (!command || ['--help', '-h', 'help'].includes(command)) { console.log(help); return; }
  const opts = {}, groupArgs = [];
  const allowed = new Set(command === 'sample'
    ? ['root', 'group', 'output', 'summary', 'markers', 'stdin', 'interval', 'duration']
    : command === 'record' ? ['output', 'label', 'duration-ms', 'result-bytes', 'phase', 'ok'] : ['input', 'output']);
  if (!['sample', 'record', 'summarize'].includes(command)) throw new Error('Expected sample, record or summarize');
  while (argv.length) {
    const flag = argv.shift();
    const key = flag.startsWith('--') ? flag.slice(2) : '';
    if (!allowed.has(key)) throw new Error(`Unknown option: ${flag}`);
    if (key === 'stdin') { opts.stdin = true; continue; }
    const value = argv.shift();
    if (value == null || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (key === 'group') groupArgs.push(value); else opts[key] = value;
  }
  if (command === 'summarize') {
    const result = await summarizeCalls({ input: opts.input, output: opts.output });
    console.log(JSON.stringify({ callCount: result.callCount, output: opts.output }));
    return;
  }
  if (command === 'record') {
    if (opts.ok !== undefined && !['true', 'false'].includes(opts.ok)) throw new Error('--ok must be true or false');
    await recordCall({ output: opts.output, label: opts.label, phase: opts.phase, durationMs: Number(opts['duration-ms']),
      resultBytes: Number(opts['result-bytes']), ok: opts.ok !== 'false' });
    return;
  }
  const groups = Object.create(null);
  if (opts.root) groups.target = [Number(opts.root)];
  for (const value of groupArgs) {
    const match = /^([^=]+)=(\d+(?:,\d+)*)$/.exec(value);
    if (!match) throw new Error('--group must be NAME=PID[,PID]');
    if (Object.hasOwn(groups, match[1])) throw new Error('Duplicate group name');
    groups[match[1]] = match[2].split(',').map(Number);
  }
  const duration = opts.duration === undefined ? undefined : number(Number(opts.duration), 'duration');
  const sampler = await startSampler({ groups, output: opts.output, summary: opts.summary, markers: opts.markers,
    intervalMs: opts.interval === undefined ? 500 : Number(opts.interval) });
  let input, durationTimer, finishing = false;
  const finish = async () => {
    if (finishing) return;
    finishing = true;
    clearTimeout(durationTimer);
    input?.close();
    process.stdin.pause();
    try { const result = await sampler.stop(); console.log(JSON.stringify({ sampleCount: result.sampleCount, durationMs: result.durationMs, output: opts.output })); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
    finally { process.off('SIGINT', finish); process.off('SIGTERM', finish); }
  };
  process.on('SIGINT', finish);
  process.on('SIGTERM', finish);
  if (opts.stdin) {
    input = createInterface({ input: process.stdin, terminal: false });
    input.on('line', line => {
      try { const value = JSON.parse(line).phase; sampler.mark(value).catch(error => console.error(error.message)); }
      catch { console.error('Invalid marker JSON; expected {"phase":"identifier"}'); }
    });
  }
  if (duration !== undefined) durationTimer = setTimeout(finish, duration);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
