import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { startSampler } from '../scripts/cu-metrics.mjs';

const sourceURL = new URL('../scripts/cu-metrics.mjs', import.meta.url);
const lines = async path => (await fs.readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
async function directory(t) {
  const root = await fs.mkdtemp(join(process.env.CU_METRICS_TEST_TMP ?? tmpdir(), 'cu-metrics-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const psRow = (pid = 12345, ppid = 1, cpu = '0:01.00', identity = 'Sat Oct 24 01:00:00 2026') => `${pid} ${ppid} 100 75.0 ${cpu} ${identity}\n`;

// Virtual time/ps only: real sampler queues and file I/O, with no wall-clock long run.
async function harness(t, snapshot = () => psRow()) {
  const root = await directory(t), output = join(root, 'samples.jsonl'), markers = join(root, 'markers.jsonl');
  let now = 0, scheduled, source = snapshot, markerReadBytes = 0, failWrites = false;
  const fakeExecFile = () => {};
  fakeExecFile[promisify.custom] = () => {
    const promise = Promise.resolve().then(() => ({ stdout: source() }));
    promise.child = { pid: 99998 };
    return promise;
  };
  const mod = new SourceTextModule(await fs.readFile(sourceURL, 'utf8'), {
    context: (await import('node:vm')).createContext({ Buffer, console, performance: { now: () => now },
      process: { platform: process.platform, env: {}, pid: 99999, argv: [] },
      setTimeout: fn => (scheduled = fn), clearTimeout: () => { scheduled = undefined; } }),
  });
  await mod.link(async name => {
    const exports = name === 'node:child_process' ? { execFile: fakeExecFile }
      : name === 'node:fs/promises' ? { ...fs, appendFile: async (...args) => {
        if (failWrites) throw Object.assign(Error('synthetic output failure'), { code: 'EIO' });
        return fs.appendFile(...args);
      }, open: async (...args) => {
        const file = await fs.open(...args);
        if (args[0] !== markers) return file;
        return { stat: () => file.stat(), close: () => file.close(), read: async (...readArgs) => {
          const result = await file.read(...readArgs); markerReadBytes += result.bytesRead; return result;
        } };
      } } : await import(name);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context: mod.context });
  });
  await mod.evaluate();
  const sampler = await mod.namespace.startSampler({ groups: { target: [12345] }, output, markers, intervalMs: 100 });
  return { root, output, markers, sampler, get markerReadBytes() { return markerReadBytes; }, failWrites: value => { failWrites = value; },
    trigger() { const fn = scheduled; scheduled = undefined; now += 100; fn(); }, snapshot: value => { source = value; },
    async tick() {
      const fn = scheduled; scheduled = undefined; now += 100; fn();
      for (let i = 0; i < 10000 && !scheduled; i++) await new Promise(resolve => setImmediate(resolve));
      assert(scheduled, 'sampler must schedule its next observation');
    } };
}

test('interval CPU uses cumulative deltas, excludes new/exited/reused identities and reports failures/root exit', async t => {
  const f = await harness(t);
  f.snapshot(() => psRow(12345, 1, '0:01.10') + psRow(12346, 12345, '0:20.00'));
  await f.tick();
  f.snapshot(() => { throw Object.assign(Error('synthetic failure'), { code: 'EIO' }); });
  await f.tick();
  f.snapshot(() => psRow(12345, 1, '0:01.15') + psRow(12346, 12345, '0:50.00', 'Sat Oct 24 01:00:01 2026'));
  await f.tick();
  f.snapshot(() => psRow(1)); await f.tick();
  // A reused root must never silently become the measured application.
  f.snapshot(() => psRow(12345, 1, '1-00:00:00', 'Sat Oct 24 01:00:02 2026')); await f.tick();
  const result = await f.sampler.stop(), rows = await lines(f.output), samples = rows.filter(row => row.type === 'sample');
  assert.equal(samples[0].groups.target.intervalCpuPercent, null);
  const busy = samples[1].groups.target;
  assert.equal(busy.cpuPercent, 150); assert.equal(busy.intervalCpuTimeMs, 100);
  assert.equal(busy.intervalMs, 100); assert.equal(busy.intervalCpuPercent, 100);
  assert.equal(busy.cpuTrackedProcessCount, 1); assert.equal(busy.cpuUntrackedProcessCount, 1);
  assert.equal(samples[2].groups.target.intervalCpuTimeMs, 50);
  assert.equal(samples[2].groups.target.intervalMs, 200);
  assert.equal(samples[2].groups.target.exitedProcessCount, 1);
  for (const row of samples.slice(3)) {
    assert.equal(row.groups.target.status, 'roots-missing'); assert.equal(row.groups.target.intervalCpuPercent, null);
  }
  assert.equal(result.sampleCount, 5); assert.equal(result.sampleErrorCount, 1);
  assert.equal(rows.find(row => row.type === 'sample-error').code, 'EIO');
  assert.equal(result.groups.target.rootsPresent.last, 0);
  assert.equal(result.groups.target.intervalCpuTimeMs.count, 2);
  assert.equal(result.groups.target.intervalCpuTimeMs.total, 150);
  assert.match(result.intervalCpuNote, /New, exited/);
});

test('unrecoverable output failures are signaled instead of silently stopping', async t => {
  const f = await harness(t);
  f.failWrites(true); f.trigger();
  assert.equal(await f.sampler.failure, 'EIO');
  f.failWrites(false);
  const result = await f.sampler.stop();
  assert.equal(result.fatalError, 'EIO'); assert.equal(result.sampleErrorCount, 1);
  assert.equal(result.lastSampleStatus, 'error');
});

test('markers are incrementally consumed, bounded, rotated/truncated, and flushed once on stop', async t => {
  const f = await harness(t);
  await fs.writeFile(f.markers, '{"phase":"one"}\n{"phase":"tw'); await f.tick();
  await fs.appendFile(f.markers, 'o"}\n'); await f.tick(); await f.tick();
  assert.equal(f.markerReadBytes, (await fs.stat(f.markers)).size, 'unchanged marker bytes must not be re-read');
  await fs.appendFile(f.markers, 'x'.repeat(6000)); await f.tick();
  await fs.appendFile(f.markers, '\n{"phase":"three"}\n'); await f.tick();
  await fs.rename(f.markers, join(f.root, 'old-markers'));
  await fs.writeFile(f.markers, '{"phase":"four"}\n'); await f.tick();
  await fs.writeFile(f.markers, '\n'); await f.tick();
  await fs.appendFile(f.markers, '{"phase":"final"}\n');
  const stop = f.sampler.stop(); assert.equal(f.sampler.stop(), stop);
  const result = await stop, rows = await lines(f.output);
  assert.deepEqual(rows.filter(row => row.type === 'marker').map(row => row.phase), ['one', 'two', 'three', 'four', 'final']);
  assert.equal(rows.filter(row => row.code === 'MARKER_TOO_LONG').length, 1);
  assert.equal(rows.filter(row => row.type === 'summary').length, 1);
  assert.equal(result.markerBacklogBytes, 0); assert.equal(result.markerPartialLine, false);
  await assert.rejects(f.sampler.mark('later'), /stopped/);
});

test('marker floods leave an explicit backlog and incomplete line on stop', async t => {
  const f = await harness(t);
  await fs.writeFile(f.markers, 'x'.repeat(1024 * 1024) + '\n{"phase":"backlog"}\n');
  await f.tick();
  assert.equal(f.markerReadBytes, 256 * 1024);
  const result = await f.sampler.stop();
  assert.equal(f.markerReadBytes, 512 * 1024);
  assert(result.markerBacklogBytes > 0); assert.equal(result.markerPartialLine, true);
  const rows = await lines(f.output);
  assert.equal(rows.filter(row => row.type === 'marker-error').length, 1);
  assert.equal(rows.filter(row => row.phase === 'backlog').length, 0);
});

test('long-run summaries retain bounded reservoirs and phase cardinality with exact counts/extrema', async t => {
  const f = await harness(t);
  for (let i = 0; i < 1100; i++) {
    if (i < 140) await f.sampler.mark(`phase-${i}`);
    await f.tick();
  }
  const result = await f.sampler.stop(), target = result.groups.target;
  assert.equal(result.sampleCount, 1101); assert.equal(target.rssBytes.count, 1101);
  assert.equal(target.rssBytes.retainedCount, 1024); assert.equal(target.rssBytes.medianApproximate, true);
  assert.equal(target.rssBytes.peak, 102400); assert.equal(target.rssBytes.last, 102400);
  assert.equal(target.rssBytes.median, 102400);
  assert.equal(Object.keys(result.phases).length, 129); assert(result.phases.__overflow__);
  assert.equal(Object.values(result.phases).reduce((sum, phase) => sum + phase.target.sampleCount, 0), 1101);
});

test('real process CPU, marker and root exit survive repeated stop without signaling the target', async t => {
  const root = await directory(t), output = join(root, 'samples.jsonl');
  const child = spawn(process.execPath, ['-e', 'process.send("ready");setInterval(()=>{const end=Date.now()+20;while(Date.now()<end){}},40)'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); });
  const survivor = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(() => survivor.kill());
  const sampler = await startSampler({ groups: { target: [child.pid], survivor: [survivor.pid] }, output, intervalMs: 50 });
  t.after(() => sampler.stop());
  await sampler.mark('busy');
  const until = async predicate => {
    for (let i = 0; i < 100; i++) {
      const rows = await lines(output);
      if (predicate(rows)) return rows;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.fail('real process sample did not settle');
  };
  const rows = await until(rows => rows.some(row => row.type === 'sample' && row.groups.target.intervalCpuTimeMs > 0));
  assert(rows.find(row => row.type === 'sample').groups.target.rssBytes > 0);
  assert.equal(child.exitCode, null);
  const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited;
  await until(rows => rows.some(row => row.type === 'sample' && row.groups.target.status === 'roots-missing'));
  const stopping = sampler.stop(); assert.equal(sampler.stop(), stopping);
  const result = await stopping;
  assert.equal(result.sampleErrorCount, 0); assert.equal(result.groups.target.rootsPresent.last, 0);
  assert.equal(survivor.exitCode, null); assert.equal(process.kill(survivor.pid, 0), true);
});
