import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserTransport } from '../../../src/computer-use/browser-transport.mjs';

const methods = new Set(['Page.navigate', 'Page.stopLoading', 'Page.getFrameTree', 'Page.setLifecycleEventsEnabled', 'Target.createTarget', 'Target.setAutoAttach', 'Runtime.runIfWaitingForDebugger', 'Browser.getVersion', 'Browser.close']);
const events = /^(Page\.(frameNavigated|frameStartedNavigating|frameRequestedNavigation|frameStartedLoading|frameStoppedLoading|lifecycleEvent)|Target\.(targetCreated|targetDestroyed|attachedToTarget|detachedFromTarget)|Network\.(loadingFailed|loadingFinished|requestWillBeSent|responseReceived))$/;
const errorInfo = error => error && ({ name: error.name, message: error.message, stack: error.stack });

// Observe existing traffic only: diagnosing a first navigation must not retry it.
export function navigationTrace(host) {
  const evidence = { node: process.version, platform: process.platform, protocol: [] };
  const traces = new WeakMap(), listeners = [];
  const previousOpen = BrowserTransport.prototype.open, previousWrite = BrowserTransport.prototype.write;
  const record = value => {
    if (evidence.protocol.length < 4000) evidence.protocol.push({ at: Date.now(), ...value });
    else evidence.dropped = (evidence.dropped ?? 0) + 1;
  };
  const run = () => host.run && ({ executable: host.runtimePath, guardianPid: host.run.child?.pid, guardianExitCode: host.run.child?.exitCode,
    guardianSignalCode: host.run.child?.signalCode, browserPid: host.run.browserPid, phase: host.run.phase, lost: host.run.lost,
    requestedStop: host.run.requestedStop, terminated: host.run.terminated, cleanupError: errorInfo(host.run.cleanupError), stderr: host.run.stderr });
  function open() {
    previousOpen.call(this);
    if (this.endpoint !== host.endpoint || !this.socket) return;
    const pending = new Set(); traces.set(this, pending);
    const message = data => {
      try { const value = JSON.parse(data.toString()); if (pending.delete(value.id) || events.test(value.method ?? '')) record({ direction: 'received', ...value }); }
      catch (error) { record({ diagnosticError: errorInfo(error) }); }
    };
    const close = (code, reason) => record({ transportClosed: { code, reason: reason.toString() } });
    this.socket.on('message', message); this.socket.on('close', close); listeners.push([this.socket, message, close]);
  }
  function write(message) {
    const pending = traces.get(this);
    if (pending && methods.has(message.method)) { pending.add(message.id); record({ direction: 'sent', ...message }); }
    return previousWrite.call(this, message);
  }
  BrowserTransport.prototype.open = open; BrowserTransport.prototype.write = write;
  return {
    stage: name => record({ stage: name }),
    beforeClose: diagnostics => { evidence.beforeClose = run(); if (diagnostics) evidence.diagnostics = diagnostics; },
    async finish(t, cleanupErrors = []) {
      evidence.afterClose = run();
      if (BrowserTransport.prototype.open === open) BrowserTransport.prototype.open = previousOpen;
      if (BrowserTransport.prototype.write === write) BrowserTransport.prototype.write = previousWrite;
      for (const [socket, message, close] of listeners) { socket.off('message', message); socket.off('close', close); }
      if (t.passed !== false && !cleanupErrors.length) return;
      evidence.test = t.name; evidence.error = errorInfo(t.error); evidence.cleanupErrors = cleanupErrors.map(errorInfo);
      const directory = resolve('cu-artifacts'); await mkdir(directory, { recursive: true });
      const path = join(directory, `view-navigation-${process.pid}-${randomUUID()}.json`);
      await writeFile(path, JSON.stringify(evidence, null, 2)); t.diagnostic(`Browser navigation evidence: ${path}`);
    },
  };
}
