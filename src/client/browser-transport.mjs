import { createGuestDriver } from './guest-driver.mjs';
import { inputReleased } from '../protocol.mjs';

export function createBrowserTransport(client, desktop) {
  const guests = new Map(), executing = new Set();
  let openTab, closeTab, sessions = () => [];
  let rendererId, connectionId, aborter, loop, closing = false, connectionEpoch = 0, pendingPublish = Promise.resolve(), pendingSessions = Promise.resolve();
  const request = (method, args = {}, signal = aborter?.signal) => client.request(`browser/${method}`, { ...args, rendererId, connectionId }, signal);
  const quiesce = () => { closing = true; connectionEpoch++; aborter?.abort(); };
  async function releaseGuests(options) {
    const results = await Promise.allSettled([...guests.values()].map(guest => guest.driver.release(options)));
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason]
      : inputReleased(result.value) ? [] : [Object.assign(new Error('Sidebar guest input release was not acknowledged'), {details: result.value})]);
    if (failures.length) throw new AggregateError(failures, 'OpenCU sidebar cleanup failed');
    return {released: true};
  }
  const publish = () => {
    if (closing) return Promise.resolve();
    const targets = [...guests.values()].flatMap(guest => {
      if (!guest.ready || !guest.element.isConnected) return [];
      try { return [guest.driver.metadata()]; }
      catch { return []; /* A detached Electron guest must not poison other live targets. */ }
    });
    const work = pendingPublish.then(() => request('publish', { targets }));
    pendingPublish = work.catch(error => { if (!aborter?.signal.aborted) console.error('OpenCU guest inventory', error); });
    return work;
  };
  async function execute(command) {
    const connection = rendererId, occurrence = connectionId, epoch = connectionEpoch;
    const deliver = args => epoch === connectionEpoch && !aborter.signal.aborted
      ? client.request('browser/result', { ...args, rendererId: connection, connectionId: occurrence }, aborter.signal) : undefined;
    try {
      let result;
      if (command.method === 'presentation') {
        if (!desktop?.presentation) throw new Error('This DSH window does not provide monitoring windows');
        const payload = command.params.operation === 'update'
          ? { ...command.params.payload, frames: command.params.payload.frames.filter(frame => sessions().includes(frame.threadID)) }
          : command.params.payload;
        result = await desktop.presentation(command.params.operation, { ...payload, locale: document.documentElement.lang,
          theme: getComputedStyle(document.documentElement).colorScheme === 'dark' ? 'dark' : 'light' });
      } else if (command.method === 'openTab') {
        if (!openTab) throw new Error('The sidebar tab owner is unavailable');
        const ids = await openTab(command.params);
        const guest = [...guests.values()].find(item => item.target.sessionId === ids.sessionId && item.target.sidebarTabId === ids.tabId);
        if (!guest?.ready) throw new Error('The new sidebar tab did not become ready');
        await publish();
        result = { target: guest.driver.metadata() };
      } else if (command.method === 'release') {
        const target = command.params.target;
        const values = target ? [guests.get(target.identity?.guestId)].filter(Boolean) : [...guests.values()];
        if (target && !values.length) throw new Error('The cancelled sidebar guest is no longer available');
        const releases = await Promise.allSettled(values.map(guest => guest.driver.release({ dismissDialogs: command.params.dismissDialogs !== false })));
        const failures = releases.flatMap(value => value.status === 'rejected'
          ? [{message: value.reason.message, code: value.reason.code, details: value.reason.details}]
          : inputReleased(value.value) ? [] : [value.value]);
        result = {released: failures.length === 0, failures};
      } else {
        const guest = guests.get(command.params.target?.identity?.guestId);
        if (!guest?.ready) throw Object.assign(new Error('The original sidebar guest is no longer available'), { code: 'TARGET_IDENTITY_CHANGED' });
        switch (command.method) {
          case 'select': case 'verify': result = guest.driver.metadata(); break;
          case 'focus': result = { ...await guest.focus(), focused: true, target: guest.driver.metadata() }; break;
          case 'preview': result = await guest.driver.preview(); break;
          case 'observe': result = await guest.driver.observe(command.params.options); break;
          case 'act':
            if (command.params.action.action === 'newTab') {
              const ids = await openTab({ sessionId: guest.driver.metadata().sessionId, url: command.params.action.url });
              const next = [...guests.values()].find(item => item.target.sessionId === ids.sessionId && item.target.sidebarTabId === ids.tabId);
              if (!next?.ready) throw new Error('The new sidebar tab did not become ready');
              await publish();
              result = { action: 'newTab', target: next.driver.metadata() };
            } else if (command.params.action.action === 'closeTab') {
              const target = guest.driver.metadata();
              await guest.driver.release();
              await closeTab({ sessionId: target.sessionId, tabId: target.sidebarTabId });
              result = { action: 'closeTab', closedTargetId: target.id };
            } else result = await guest.driver.act(command.params.action);
            break;
          default: throw new Error(`Unknown sidebar command ${command.method}`);
        }
      }
      await deliver({ id: command.id, result });
    } catch (error) {
      await deliver({ id: command.id, error: { code: error.code, message: error.message, details: error.details } });
    }
  }
  return {
    quiesce,
    attachRemote({ sessionId, tabId, request }) {
      const guestId = crypto.randomUUID();
      let target = { id: `dsh:${rendererId}:${guestId}`, identity: { rendererId, guestId, sessionId, tabId },
        sessionId, sidebarTabId: tabId, backend: 'browser', provider: 'dsh', kind: 'tab', browserId: `dsh:${rendererId}`,
        capabilities: ['ax', 'screenshot', 'navigation', 'tabs', 'focus', 'mouse', 'keyboard', 'uploads', 'downloads', 'hitTest', 'getDOM', 'designTweak'] };
      const guest = { element: { isConnected: true }, target, ready: false, focus: () => request('focus'), driver: {
        metadata: () => target, release: options => request('release', options), preview: () => request('preview'),
        observe: options => request('observe', options), act: action => request('act', action),
      } };
      guests.set(guestId, guest);
      return { get target() { return target; },
        update(value) { target = { ...target, url: value.url, title: value.title, isDetached: value.isDetached === true }; guest.target = target; guest.ready = true; void publish(); },
        async dispose() {
          guest.ready = false;
          const result = await guest.driver.release();
          if (!inputReleased(result)) throw new Error('Sidebar guest input release was not acknowledged');
          guests.delete(guestId); await publish();
        },
      };
    },
    get rendererId() { return rendererId; },
    targetFor(sessionId, tabId) {
      const guest = [...guests.values()].find(item => item.target.sessionId === sessionId && item.target.sidebarTabId === tabId);
      if (!guest?.ready) throw new Error('The original sidebar page is not ready');
      return guest.driver.metadata();
    },
    setTabOwner(callback, close) { openTab = callback; closeTab = close; },
    setSessionOwner(callback) { sessions = callback; },
    async updateSessions() {
      const sessionIds = [...sessions()];
      const work = Promise.all([pendingSessions.catch(() => undefined), desktop?.presentation?.('sessions', { sessionIds })])
        .then(() => rendererId && !aborter?.signal.aborted ? request('sessions', { sessionIds }) : undefined);
      pendingSessions = work;
      await work;
    },
    async start() {
      if (loop) return;
      closing = false; aborter = new AbortController();
      rendererId ??= crypto.randomUUID();
      loop = (async () => {
        let reconnect = true, needsRelease = false;
        while (!aborter.signal.aborted) {
          try {
            if (reconnect) {
              if (needsRelease) { await releaseGuests({dismissDialogs: false}); needsRelease = false; }
              await desktop?.presentation?.('sessions', { sessionIds: sessions() });
              const connected = await request('connect', { presentation: !!desktop?.presentation, sessionIds: sessions() });
              connectionId = connected.connectionId;
              await publish(); reconnect = false;
              const work = pendingSessions.catch(() => undefined).then(() => request('sessions', { sessionIds: sessions() }));
              pendingSessions = work; void work.catch(error => console.error('OpenCU reconnected sessions', error));
            }
            const response = await request('poll');
            if (!response.connected) throw new Error('OpenCU sidebar transport disconnected');
            // Release must be able to interrupt an in-flight input sequence.
            for (const command of response.commands) {
              const work = execute(command).catch(error => {
                if (!aborter.signal.aborted) console.error('OpenCU sidebar command delivery', error);
              }).finally(() => executing.delete(work));
              executing.add(work);
            }
          } catch (error) {
            connectionEpoch++;
            reconnect = true; needsRelease = true;
            try { await releaseGuests({dismissDialogs: false}); needsRelease = false; }
            catch (releaseError) { console.error('OpenCU sidebar input release', releaseError); }
            try { await desktop?.presentation?.('cursor', { visible: false }); }
            catch (cursorError) { console.error('OpenCU cursor cleanup', cursorError); }
            if (aborter.signal.aborted) break;
            console.error('OpenCU sidebar transport; reconnecting the same guests', error);
            await new Promise(resolve => {
              const done = () => { clearTimeout(timer); aborter.signal.removeEventListener('abort', done); resolve(); };
              const timer = setTimeout(done, 1000);
              aborter.signal.addEventListener('abort', done, { once: true });
            });
          }
        }
      })();
    },
    async attach(element, { sessionId, tabId, focus, cursor, capture, automate }) {
      if (!rendererId || closing) throw new Error('Start the sidebar transport before attaching a guest');
      const guestId = crypto.randomUUID();
      const target = { id: `dsh:${rendererId}:${guestId}`, identity: { rendererId, guestId, sessionId, tabId },
        sessionId, sidebarTabId: tabId, backend: 'browser', provider: 'dsh', kind: 'tab', browserId: `dsh:${rendererId}`,
        capabilities: ['ax', 'screenshot', 'navigation', 'tabs', 'focus', 'mouse', 'keyboard', 'uploads', 'downloads', 'hitTest', 'getDOM', 'designTweak'] };
      const guest = { element, target, focus, ready: false, driver: createGuestDriver(element, target, publish, focus, cursor, capture, automate) };
      guests.set(guestId, guest);
      const update = () => { guest.ready = true; void publish(); };
      const events = ['dom-ready', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'];
      for (const event of events) element.addEventListener(event, update);
      if (element.isConnected) { try { element.getURL(); update(); } catch { /* Electron has not attached the guest yet. */ } }
      return async () => {
        for (const event of events) element.removeEventListener(event, update);
        guest.ready = false;
        const result = await guest.driver.release();
        if (!inputReleased(result)) throw new Error('Sidebar guest input release was not acknowledged');
        guests.delete(guestId); await publish();
      };
    },
    async dispose() {
      quiesce();
      const releases = await Promise.allSettled([releaseGuests()]);
      const cleanup = await Promise.allSettled([
        loop, pendingPublish, pendingSessions, ...executing,
        rendererId && releases[0].status === 'fulfilled'
          ? client.request('browser/disconnect', { rendererId, connectionId, released: true }, AbortSignal.timeout(5000)) : undefined,
        desktop?.presentation?.('close', {}),
      ]);
      const failures = [...releases, ...cleanup].filter(result => result.status === 'rejected' && result.reason?.name !== 'AbortError').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'OpenCU sidebar cleanup failed');
      guests.clear(); executing.clear(); loop = undefined;
    },
  };
}
