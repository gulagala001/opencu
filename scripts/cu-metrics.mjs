#!/usr/bin/env node
/** Lightweight CU measurements. Labels must be synthetic identifiers, never user content.
 * API: const sampler = await startSampler({ groups: { codex: [123] }, output,
 *   summary, markers, intervalMs: 500 }); await sampler.mark('idle'); await sampler.stop();
 * recordCall({ output, label: 'snapshot', phase: 'observe', durationMs: 42, resultBytes: 123 });
 */
import { execFile } from 'node:child_process';
import { appendFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
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
// Exact extrema/counts; uniform reservoir medians keep long runs bounded.
const reservoirSize = 1024, phaseLimit = 128;
const summaryNote = 'Peak, last, total and count are exact. Median is exact through 1024 values, then estimated from a uniform reservoir of 1024. At most 128 named phases are summarized; additional phases share __overflow__. Raw rows remain in JSONL.';
const intervalCpuNote = 'intervalCpuTimeMs sums differences of ps cumulative CPU time for identities present in this group in both successful snapshots; intervalCpuPercent = 100 * that difference / intervalMs. First/no matched observation is null. New, exited, reparented and between-snapshot processes are omitted; this is partial observed CPU, not total group CPU or a strict numerical lower bound after time quantization. ps time precision is platform-dependent (macOS 10 ms; Linux commonly 1 s). PID + lstart identity has one-second precision; the wall interval uses ps completion times and has snapshot skew. Phase changes do not split a CPU interval.';
function accumulator() {
  let count = 0, peak = null, last = null, total = 0;
  const values = [];
  return {
    add(value) {
      if (!Number.isFinite(value)) return;
      count++; total += value; peak = peak === null ? value : Math.max(peak, value); last = value;
      if (values.length < reservoirSize) values.push(value);
      else { const index = Math.floor(Math.random() * count); if (index < reservoirSize) values[index] = value; }
    },
    result() { return { ...stats(values), peak, last, total, count, retainedCount: values.length, medianApproximate: count > reservoirSize }; },
  };
}
const sampledMetrics = ['rssBytes', 'cpuPercent', 'processCount', 'rootsPresent', 'intervalCpuPercent', 'intervalCpuTimeMs'];
function sampleAggregate(groups) {
  let count = 0;
  const values = Object.fromEntries(Object.keys(groups).map(name => [name,
    Object.fromEntries(sampledMetrics.map(metric => [metric, accumulator()]))]));
  return {
    add(row) { count++; for (const name of Object.keys(groups)) for (const metric of sampledMetrics) values[name][metric].add(row.groups[name][metric]); },
    result() { return Object.fromEntries(Object.keys(groups).map(name => [name, { sampleCount: count,
      ...Object.fromEntries(sampledMetrics.map(metric => [metric, values[name][metric].result()])) }])); },
  };
}
function cpuMilliseconds(value) {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(value);
  return match ? Math.round((Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4])) * 1000) : NaN;
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
  // In-process instrumentation must not subtract the explicitly measured runtime.
  const includesSamplerProcess = Object.values(groups).some(roots => roots.includes(process.pid));
  if (!output) throw new Error('output is required');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 50) throw new Error('intervalMs must be an integer >= 50');
  if (markers && resolve(markers) === resolve(output)) throw new Error('markers and output must differ');
  if (summary && [output, markers].filter(Boolean).some(path => resolve(path) === resolve(summary))) throw new Error('summary must use a separate file');
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const totals = sampleAggregate(groups), phases = new Map(), rootIdentities = new Map();
  let sampleCount = 0, sampleErrorCount = 0, lastSampleStatus = 'none', fatalError = null;
  let previous = null, previousTick = null;
  let phase = 'unmarked', stopped = false, timer, pending = Promise.resolve(), stopping, reportFailure;
  const failure = new Promise(resolve => { reportFailure = resolve; });
  let markerBytes = 0, markerPartial = '', markerIdentity, markerDiscarding = false, markerBacklogBytes = 0;
  const enqueue = fn => {
    const current = pending.then(fn);
    pending = current.catch(() => {});
    return current;
  };
  const errorCode = error => typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'COLLECTION_FAILED';
  const markInternal = async value => {
    phase = label(value, 'phase');
    await append(output, { type: 'marker', at: new Date().toISOString(), elapsedMs: performance.now() - started, phase });
  };
  async function readMarkers() {
    if (!markers) return;
    let file;
    try { file = await open(markers, 'r'); }
    catch (error) { if (error.code === 'ENOENT') { markerBacklogBytes = 0; return; } throw error; }
    try {
      const stat = await file.stat(), identity = `${stat.dev}:${stat.ino}`;
      if (identity !== markerIdentity || stat.size < markerBytes) {
        markerBytes = 0; markerPartial = ''; markerDiscarding = false; markerIdentity = identity;
      }
      // Bound each tick's work and any unterminated/invalid line. Never read old bytes again.
      const end = Math.min(stat.size, markerBytes + 256 * 1024), buffer = Buffer.alloc(16 * 1024);
      while (markerBytes < end) {
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, end - markerBytes), markerBytes);
        if (!bytesRead) break;
        markerBytes += bytesRead;
        for (const part of buffer.subarray(0, bytesRead).toString('utf8').split(/(?<=\n)/)) {
          if (!markerDiscarding) markerPartial += part;
          if (!markerDiscarding && markerPartial.length > 4096) {
            markerPartial = ''; markerDiscarding = true;
            await append(output, { type: 'marker-error', at: new Date().toISOString(), code: 'MARKER_TOO_LONG' });
          }
          if (part.endsWith('\n')) {
            if (!markerDiscarding && markerPartial.trim()) {
              let value;
              try { value = label(JSON.parse(markerPartial).phase, 'phase'); }
              catch { await append(output, { type: 'marker-error', at: new Date().toISOString(), code: 'INVALID_MARKER' }); }
              if (value !== undefined) await markInternal(value);
            }
            markerPartial = ''; markerDiscarding = false;
          }
        }
      }
      markerBacklogBytes = Math.max(0, stat.size - markerBytes);
    } finally { await file.close(); }
  }
  async function sample() {
    const tick = performance.now();
    try {
      await readMarkers();
      const request = exec('ps', ['-axo', 'pid=,ppid=,rss=,%cpu=,time=,lstart='], {
        encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, maxBuffer: 16 * 1024 * 1024, timeout: 5000,
      });
      const collectorPid = request.child?.pid;
      const { stdout } = await request;
      const observedTick = performance.now(), processes = new Map(), children = new Map();
      for (const line of stdout.trim().split('\n')) {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
        if (!match) continue;
        const [, rawPid, rawPpid, rawRss, rawCpu, rawTime, identity] = match;
        const pid = Number(rawPid), ppid = Number(rawPpid), cpuTimeMs = cpuMilliseconds(rawTime);
        if (!Number.isFinite(cpuTimeMs) || !Number.isFinite(Number(rawCpu))) continue;
        processes.set(pid, { rssBytes: Number(rawRss) * 1024, cpuPercent: Number(rawCpu), cpuTimeMs, identity });
        if (!children.has(ppid)) children.set(ppid, []);
        children.get(ppid).push(pid);
      }
      if (!processes.size) throw Object.assign(new Error('Invalid ps output'), { code: 'PS_INVALID_OUTPUT' });
      const exclude = descendants(collectorPid ? [collectorPid] : [], children, processes);
      if (!includesSamplerProcess) exclude.add(process.pid);
      const memberships = new Map(), nextPrevious = new Map();
      const groupValues = Object.create(null);
      for (const [name, roots] of Object.entries(groups)) {
        for (const pid of roots) if (!rootIdentities.has(pid) && processes.has(pid)) rootIdentities.set(pid, processes.get(pid).identity);
        const presentRoots = roots.filter(pid => processes.has(pid) && processes.get(pid).identity === rootIdentities.get(pid));
        const pids = [...descendants(presentRoots, children, processes)].filter(pid => !exclude.has(pid));
        const old = previous?.get(name), current = new Map(pids.map(pid => [pid, processes.get(pid)]));
        let cpuDelta = 0, tracked = 0;
        for (const pid of pids) {
          memberships.set(pid, (memberships.get(pid) ?? 0) + 1);
          const now = current.get(pid), before = old?.get(pid);
          if (before?.identity === now.identity && now.cpuTimeMs >= before.cpuTimeMs) {
            cpuDelta += now.cpuTimeMs - before.cpuTimeMs; tracked++;
          }
        }
        const exited = old ? [...old].filter(([pid, value]) => current.get(pid)?.identity !== value.identity).length : 0;
        const elapsed = previousTick === null ? null : observedTick - previousTick;
        const measured = elapsed > 0 && tracked > 0;
        groupValues[name] = { rootPids: roots, rootsPresent: presentRoots.length,
          status: presentRoots.length === roots.length ? 'ok' : presentRoots.length ? 'roots-partially-missing' : 'roots-missing',
          processCount: pids.length, rssBytes: pids.reduce((sum, pid) => sum + processes.get(pid).rssBytes, 0),
          cpuPercent: pids.reduce((sum, pid) => sum + processes.get(pid).cpuPercent, 0),
          intervalMs: elapsed, intervalCpuTimeMs: measured ? cpuDelta : null,
          intervalCpuPercent: measured ? 100 * cpuDelta / elapsed : null,
          cpuTrackedProcessCount: tracked, cpuUntrackedProcessCount: pids.length - tracked, exitedProcessCount: exited };
        nextPrevious.set(name, current);
      }
      const row = { type: 'sample', at: new Date().toISOString(), elapsedMs: tick - started, phase,
        collectionMs: performance.now() - tick, overlappingProcessCount: [...memberships.values()].filter(count => count > 1).length,
        groups: groupValues };
      await append(output, row);
      previous = nextPrevious; previousTick = observedTick;
      sampleCount++; lastSampleStatus = 'ok'; totals.add(row);
      let phaseKey = phase;
      if (!phases.has(phaseKey) && (phaseKey === '__overflow__' || phases.size >= phaseLimit)) phaseKey = '__overflow__';
      if (!phases.has(phaseKey)) phases.set(phaseKey, sampleAggregate(groups));
      phases.get(phaseKey).add(row);
    } catch (error) {
      sampleErrorCount++; lastSampleStatus = 'error';
      await append(output, { type: 'sample-error', at: new Date().toISOString(), elapsedMs: tick - started,
        phase, code: errorCode(error) });
    }
  }
  await append(output, { type: 'metadata', startedAt, platform: process.platform, intervalMs, groups, cpuNote, intervalCpuNote, summaryNote,
    markerNote: 'Incremental reads, at most 256 KiB/tick; lines above 4096 characters are discarded. Rotation and observed truncation reset the cursor; same-inode truncate-and-regrow between reads cannot be detected. Summary reports unread backlog and partial line.',
    includesSamplerProcess,
    rssNote: 'Sum of ps RSS (KiB × 1024); shared pages may be counted more than once. Excludes ps collector. Excludes sampler process unless explicitly named as a measured root; in-process sampling overhead is then included in every overlapping group.',
    treeNote: 'Current root PID plus current descendants. Root identity is pinned on first observation by PID + lstart; reparented processes are excluded. Overlapping groups are reported separately.' });
  let nextTick = performance.now();
  await enqueue(sample);
  function schedule() {
    if (stopped) return;
    nextTick += intervalMs;
    if (nextTick < performance.now()) nextTick = performance.now();
    timer = setTimeout(() => {
      enqueue(sample).then(schedule, error => { fatalError = errorCode(error); stopped = true; reportFailure(fatalError); });
    }, Math.max(0, nextTick - performance.now()));
  }
  schedule();
  return {
    // Resolves only on an unrecoverable collection/output failure; never rejects.
    failure,
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
        try { await readMarkers(); }
        catch (error) { fatalError = errorCode(error); }
        const result = { type: 'summary', startedAt, finishedAt: new Date().toISOString(), durationMs: performance.now() - started,
          sampleCount, sampleErrorCount, lastSampleStatus, fatalError, cpuNote, intervalCpuNote, summaryNote,
          markerBacklogBytes, markerPartialLine: markerDiscarding || markerPartial.length > 0,
          groups: totals.result(), phases: Object.fromEntries([...phases].map(([name, aggregate]) => [name, aggregate.result()])) };
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
${cpuNote}\n${intervalCpuNote}\n${summaryNote}`;

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
  sampler.failure.then(code => { console.error(`Sampler failed: ${code}`); process.exitCode = 1; return finish(); });
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
