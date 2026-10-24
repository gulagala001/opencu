#!/usr/bin/env node
/** Production OpenCU runtime + Worker REPL without a DSH GUI or HTTP host.
 * Importing this module starts nothing. All storage roots must be explicit.
 * const cu = await createDirectSession({dataDir: '/.../.local/cu/data', outputDir: '/.../.local/cu/output'});
 * try { console.log(await cu.run({code: 'await cua.getState()'})); } finally { await cu.close(); }
 * The attachment adapter stores original bytes; it is not DSH's normalization,
 * admission, model routing, or complete GUI attachment service.
 */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { createPluginRuntime } from '../src/dsh/runtime.mjs';
import { createComputerSession } from '../src/dsh/computer.mjs';
import { serializeReplError } from '../src/dsh/repl-output.mjs';
import { recordCall } from './cu-metrics.mjs';

const failure = (code, message) => Object.assign(new Error(message), {code});
function explicitPath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw failure('ISOLATED_PATH_REQUIRED', `${name} must be an explicit absolute local path`);
  const path = resolve(value), home = homedir();
  if (path === sep || path === home || path === join(home, '.opencu') || path.startsWith(join(home, '.opencu') + sep)) {
    throw failure('ISOLATED_PATH_REQUIRED', `${name} must use a private isolated directory`);
  }
  return path;
}
const filename = (name, fallback) => {
  const clean = typeof name === 'string' ? basename(name).replace(/[\\\u0000-\u001f]/g, '_') : fallback;
  return !clean || ['.', '..'].includes(clean) ? fallback : clean;
};

async function createAttachments(root) {
  const blobs = join(root, 'attachments');
  await mkdir(blobs, {recursive: true, mode: 0o700});
  const actualRoot = await realpath(blobs);
  if (!actualRoot.startsWith((await realpath(root)) + sep)) throw failure('ISOLATED_PATH_REQUIRED', 'Attachment storage must remain inside outputDir');
  const blobPath = ref => {
    if (!/^sha256:[a-f0-9]{64}$/.test(ref?.attachmentId) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) throw failure('INVALID_ATTACHMENT', 'Invalid attachment reference');
    return join(blobs, ref.attachmentId.slice(7));
  };
  async function saveFileStream({data, name, signal}) {
    const temporary = join(blobs, `${randomUUID()}.pending`), file = await open(temporary, 'wx', 0o600);
    const hash = createHash('sha256'); let bytes = 0;
    try {
      for await (const input of data) {
        signal?.throwIfAborted();
        const chunk = Buffer.from(input); hash.update(chunk); bytes += chunk.length;
        let offset = 0;
        while (offset < chunk.length) offset += (await file.write(chunk, offset, chunk.length - offset)).bytesWritten;
      }
      await file.close(); signal?.throwIfAborted();
      const ref = {attachmentId: `sha256:${hash.digest('hex')}`, name: filename(name, 'file'), bytes};
      await rename(temporary, blobPath(ref));
      return ref;
    } finally { await file.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function* readFileStream(ref, signal) {
    signal?.throwIfAborted();
    const path = blobPath(ref), actual = await realpath(path);
    if (actual !== join(actualRoot, ref.attachmentId.slice(7))) throw failure('INVALID_ATTACHMENT', 'Attachment escaped storage');
    const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW), hash = createHash('sha256'); let bytes = 0;
    try {
      if (!(await file.stat()).isFile()) throw failure('INVALID_ATTACHMENT', 'Attachment is not a regular file');
      for await (const chunk of file.createReadStream({autoClose: false})) { signal?.throwIfAborted(); bytes += chunk.length; hash.update(chunk); yield chunk; }
      if (bytes !== ref.bytes || `sha256:${hash.digest('hex')}` !== ref.attachmentId) throw failure('ATTACHMENT_CHANGED', 'Stored attachment bytes changed');
    } finally { await file.close(); }
  }
  return {
    saveFileStream,
    saveFile: ({data, ...input}) => saveFileStream({...input, data: (async function* () { yield data; })()}),
    readFileStream,
    async saveImage({data, mediaType, name}) {
      const {default: sharp} = await import('sharp');
      const metadata = await sharp(data, {limitInputPixels: 100_000_000}).metadata();
      const actualType = {png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif'}[metadata.format];
      if (!actualType || actualType !== mediaType || !metadata.width || !metadata.height) throw failure('INVALID_IMAGE', 'Image bytes do not match their declared media type');
      const ref = await this.saveFile({data, name: filename(name, 'image')});
      return {...ref, mediaType, width: metadata.width, height: metadata.height};
    },
    async readImage(ref, signal) {
      const chunks = []; for await (const chunk of readFileStream(ref, signal)) chunks.push(chunk);
      return {ref, data: Buffer.concat(chunks)};
    },
    async imagePath(ref) { await this.readImage(ref); return {ref, path: blobPath(ref)}; },
  };
}

export async function createDirectSession({dataDir, outputDir, config = {}, metricsOutput} = {}) {
  dataDir = explicitPath(dataDir, 'dataDir'); outputDir = explicitPath(outputDir, 'outputDir');
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw failure('INVALID_CONFIG', 'config must be an object');
  // Keep backend injection and mutable config callbacks out of this production entry.
  for (const key of ['browser', 'native', 'extension', 'getConfig', 'dshBrowser']) if (key in config) throw failure('INVALID_CONFIG', `${key} is not a direct-session option`);
  if (config.browserOptions?.context || config.browserOptions?.playwright) throw failure('INVALID_CONFIG', 'Injected browser contexts/providers are not supported');
  if (metricsOutput) metricsOutput = explicitPath(metricsOutput, 'metricsOutput');
  if (config.browserEnabled !== false) {
    const asset = new URL('../lib/page-cursor.js', import.meta.url);
    try { await readFile(asset); }
    catch (cause) {
      throw Object.assign(failure('BUILD_REQUIRED', 'OpenCU browser assets are missing or unreadable. Run npm run build:client before creating a direct session.'),
        {cause, details: {asset: asset.pathname, command: 'npm run build:client'}});
    }
  }
  for (const root of [dataDir, outputDir]) {
    await mkdir(root, {recursive: true, mode: 0o700});
    explicitPath(await realpath(root), 'storage root');
  }
  if (metricsOutput) { await mkdir(dirname(metricsOutput), {recursive: true, mode: 0o700}); const file = await open(metricsOutput, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600); await file.close(); await chmod(metricsOutput, 0o600); }
  const attachments = await createAttachments(outputDir);
  const runtime = createPluginRuntime({browserEnabled: true, managedHeadless: true, headless: true, nativeEnabled: false, extensionEnabled: false, ...config, dataDir});
  const sessionKey = `direct:${randomUUID()}`, pending = new Set(), aborters = new Set();
  let computer, closing, closed = false;
  async function measure(label, action) {
    const started = performance.now(); let result, caught;
    try { result = await action(); }
    catch (error) { caught = error; }
    if (metricsOutput) {
      try {
        const wire = caught ? serializeReplError(caught) : result;
        await recordCall({output: metricsOutput, label, phase: 'direct', durationMs: performance.now() - started,
          resultBytes: Buffer.byteLength(JSON.stringify(wire) ?? ''), ok: !caught && result?.ok !== false});
      } catch (error) {
        // Monitoring is a separate receipt: completed input must never appear to
        // have failed merely because its measurement could not be persisted.
        const metricsError = serializeReplError(error);
        if (caught) caught.metricsError = metricsError;
        else result = {...result, metricsError};
      }
    }
    if (caught) throw caught;
    return result;
  }
  function dispatch(endpoint, args, context = {}) {
    const work = runtime.request(endpoint, args, {attachments, sessionKey, ...context});
    pending.add(work); void work.finally(() => pending.delete(work)).catch(() => {}); return work;
  }
  computer = createComputerSession((endpoint, args, waiting) => dispatch(endpoint, args, {
    signal: endpoint === 'stop' ? undefined : computer.signal, modelProjection: true, onApprovalWait: waiting?.onApprovalWait,
  }));
  function ready() { if (closed) throw failure('SESSION_CLOSED', 'Direct session is closed'); }
  return {
    dataDir, outputDir, pid: process.pid,
    run(args, signal) { ready(); return measure('run', async () => { const started = performance.now(); const result = await computer.run(args, signal); return {...result, timing: {totalMs: performance.now() - started}}; }); },
    request(endpoint, args = {}, {signal} = {}) {
      ready(); const aborter = new AbortController(); aborters.add(aborter);
      return measure('request', () => dispatch(endpoint, args, {signal: signal ? AbortSignal.any([signal, aborter.signal]) : aborter.signal}))
        .finally(() => aborters.delete(aborter));
    },
    reset() { ready(); for (const aborter of aborters) aborter.abort(failure('SESSION_RESET', 'Direct session reset')); return measure('reset', () => computer.reset()); },
    readImage(ref) { ready(); return attachments.imagePath(ref); },
    close() {
      if (closing) return closing;
      closed = true; for (const aborter of aborters) aborter.abort(failure('SESSION_CLOSED', 'Direct session closed'));
      closing = (async () => {
        const failures = [];
        try { await computer.close(); } catch (error) { failures.push(error); }
        try { await runtime.close(); } catch (error) { failures.push(error); }
        await Promise.allSettled([...pending]);
        if (failures.length === 1) throw failures[0];
        if (failures.length) throw Object.assign(new AggregateError(failures, failures[0].message, {cause: failures[0]}), {code: failures[0].code, details: failures[0].details});
        return {ok: true, closed: true};
      })().catch(error => { closing = undefined; throw error; });
      return closing;
    },
  };
}

async function main(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = {'--data-dir': 'dataDir', '--output-dir': 'outputDir', '--metrics-output': 'metricsOutput', '--config': 'config'}[argv[index]];
    if (!name || !argv[index + 1]) throw failure('INVALID_ARGUMENT', 'Usage: cu-direct.mjs --data-dir ABSOLUTE --output-dir ABSOLUTE [--metrics-output FILE] [--config JSON]');
    options[name] = name === 'config' ? JSON.parse(argv[index + 1]) : argv[index + 1];
  }
  if (options.config?.extensionEnabled === true) throw failure('INVALID_CONFIG', 'The stdio CLI does not enable a TCP extension listener');
  const session = await createDirectSession(options), lines = createInterface({input: process.stdin, crlfDelay: Infinity});
  let tail = Promise.resolve(), shutdown;
  const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
  const stop = () => { lines.close(); shutdown ??= session.close(); void shutdown.catch(() => {}); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let input;
      try { input = JSON.parse(line); } catch (error) { send({ok: false, error: serializeReplError(error)}); continue; }
      // reset/close are deliberately not queued behind an in-flight run.
      const operation = async () => {
        try {
          const {id, method = 'run', ...args} = input;
          if (!['run', 'request', 'reset', 'close', 'readImage'].includes(method)) throw failure('UNSUPPORTED_METHOD', 'Unknown direct-session operation');
          const result = method === 'run' ? await session.run(args) : method === 'request' ? await session.request(args.endpoint, args.args)
            : method === 'readImage' ? await session.readImage(args.image) : await session[method]();
          send({id, ok: true, result}); if (method === 'close') lines.close();
        } catch (error) { send({id: input?.id, ok: false, error: {...serializeReplError(error), ...(error?.metricsError ? {metricsError: error.metricsError} : {})}}); }
      };
      if (['reset', 'close'].includes(input?.method)) await operation();
      else { const work = tail.then(operation); tail = work.catch(() => {}); }
    }
    await tail;
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await session.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(`${JSON.stringify({ok: false, error: serializeReplError(error)})}\n`); process.exitCode = 1; });
}
