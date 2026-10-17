import { keyEventKey } from '../../extension/keyboard.js';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

export function createGuestDriver(element, target, changed, focus, cursor, capture = () => element.capturePage(), automate) {
  const keys = new Set(), buttons = new Set(), pending = new Set();
  let inputSequence = 0, position = { x: 0, y: 0 }, lastObservation, generation = 0, moveSequence = 0, cancelNavigation;
  let exited = false;
  const rendererExited = () => exited || element.isCrashed?.() === true;
  const live = () => { if (rendererExited()) fail('BROWSER_GUEST_CRASHED', 'The browser page process exited; reload the page before observing or sending input'); };
  const invalidate = () => { exited = true; generation++; lastObservation = null; keys.clear(); buttons.clear(); cancelNavigation?.(); };
  element.addEventListener('render-process-gone', invalidate);
  element.addEventListener('dom-ready', () => { exited = false; });
  const execute = source => {
    live();
    return new Promise((resolve, reject) => {
      const gone = () => { finish(); reject(Object.assign(new Error('The browser page process exited'), { code: 'BROWSER_GUEST_CRASHED' })); };
      const finish = () => element.removeEventListener('render-process-gone', gone);
      element.addEventListener('render-process-gone', gone, { once: true });
      try { Promise.resolve(element.executeJavaScript(source)).then(value => { finish(); resolve(value); }, error => { finish(); reject(error); }); }
      catch (error) { finish(); reject(error); }
    });
  };
  const navigate = action => new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer); cancelNavigation = undefined;
      for (const event of ['did-stop-loading', 'did-navigate-in-page']) element.removeEventListener(event, loaded);
      element.removeEventListener('did-fail-load', failed);
      error ? reject(error) : resolve();
    };
    const loaded = () => finish();
    const failed = event => { if (event.isMainFrame !== false && event.errorCode !== -3) finish(new Error(event.errorDescription)); };
    const timer = setTimeout(() => finish(new Error('Browser navigation timed out')), 25000);
    const cancel = () => {
      try { if (!rendererExited()) element.stop(); }
      catch (error) { finish(error); cancelNavigation = cancel; throw error; }
      finish(Object.assign(new Error('Navigation was cancelled'), { code: 'CONTROL_STOPPED' }));
      if (cancelNavigation === cancel) cancelNavigation = undefined;
    };
    cancelNavigation = cancel;
    for (const event of ['did-stop-loading', 'did-navigate-in-page']) element.addEventListener(event, loaded);
    element.addEventListener('did-fail-load', failed);
    try { Promise.resolve(action()).catch(finish); } catch (error) { finish(error); }
  });
  const evaluate = async (operation, args = {}) => {
    if (!automate) fail('HOST_ADAPTER_REQUIRED', 'This DSH version needs the OpenCU accessibility and upload adapter');
    const writing = ['input', 'insertText', 'selectOption', 'upload'].includes(operation);
    try {const result = await automate(operation, args); if (writing) inputSequence++; return result;}
    catch (error) {
      if (writing && error.details?.inputDispatched !== false) {inputSequence++; error.details = {...error.details,inputDispatched:true};}
      if (['locator', 'domSnapshot'].includes(operation) && /Unsupported guest automation operation/u.test(error.message)) fail('UNSUPPORTED_LOCATOR', 'This DSH host lacks locator and DOM snapshot automation; build the matching OpenCU host adapter');
      throw error;
    }
  };
  const metadata = () => ({ ...target, url: element.getURL(), title: element.getTitle() });
  const verifyScreenshot = async observation => {
    const current = await execute('({ documentId: globalThis.__opencuDocument?.id, url: location.href, width: innerWidth, height: innerHeight, scrollX, scrollY })');
    if (current.documentId !== observation.documentId || current.url !== observation.url) fail('STALE_SCREENSHOT', 'The screenshot document changed; observe again');
    if (['width', 'height', 'scrollX', 'scrollY'].some(key => current[key] !== observation.viewport[key])) fail('STALE_SCREENSHOT', 'Viewport or scroll changed; observe again');
  };
  const modifiers = () => [...keys].flatMap(key => ({ Control: ['control'], Meta: ['meta'], Alt: ['alt'], Shift: ['shift'] })[key] ?? []);
  const expectInput = (events, pending = false) => execute(`globalThis.__opencuAnnotations?.expectInput(${JSON.stringify(events)}, ${pending})`);
  const send = async (event, observation, elementId) => {
    const epoch = generation;
    let marker, submitted = false, dispatched = false, failure;
    try {
      if (event.type === 'mouseDown') await expectInput([{ type: 'pointerdown', x: event.x, y: event.y }]);
      else if (event.type === 'mouseWheel') marker = await expectInput([{ type: 'wheel', x: event.x, y: event.y, deltaX: event.deltaX ?? 0, deltaY: event.deltaY ?? 0 }], true);
      else if (event.type === 'keyDown') await expectInput([{ type: 'keydown', key: keyEventKey(event.keyCode, keys.has('Shift') ? 8 : 0) }, { type: 'input' }]);
      if (['mouseMove', 'mouseDown', 'mouseWheel'].includes(event.type)) {
        if (elementId != null) await evaluate('verifyElement', { elementId });
        else if (observation) await verifyScreenshot(observation);
      }
      if (epoch !== generation) fail('CONTROL_STOPPED', 'Input sequence was cancelled');
      const heldButtons = [...buttons].filter(button => event.type !== 'mouseUp' || event.button !== button);
      submitted = true;
      await evaluate('input', { ...event, elementId, button: event.button ?? heldButtons[0] ?? 'none',
        buttons: heldButtons.reduce((mask, button) => mask | ({ left: 1, right: 2, middle: 4 }[button] ?? 0), 0), modifiers: modifiers() });
      dispatched = true;
    } catch (error) {
      failure = error; dispatched = submitted && error.details?.inputDispatched !== false; throw error;
    } finally {
      if (marker && !rendererExited()) try { await execute(`globalThis.__opencuAnnotations?.finishInput(${JSON.stringify(marker)}, ${dispatched})`); }
      catch (error) {
        if (!failure) { error.details = { ...error.details, inputDispatched: dispatched }; throw error; }
        failure.details = { ...failure.details, inputMarkerError: error.message };
      }
    }
  };
  const release = async () => {
    generation++;
    const failures = [];
    try { cancelNavigation?.(); } catch (error) { failures.push(error); }
    cursor?.({ ...position, visible: false });
    const cancelled = await Promise.allSettled(['cancelSiteTool', 'cancelUpload'].map(operation => Promise.resolve().then(() => evaluate(operation))));
    await Promise.allSettled([...pending]);
    if (!rendererExited()) try { await execute('globalThis.__opencuAnnotations?.clearInput()'); } catch (error) { failures.push(error); }
    else { keys.clear(); buttons.clear(); lastObservation = null; }
    failures.push(...cancelled.filter(result => result.status === 'rejected').map(result => result.reason));
    for (const key of [...keys].reverse()) {
      try { await send({ type: 'keyUp', keyCode: key }); keys.delete(key); } catch (error) { failures.push(error); }
    }
    for (const button of [...buttons]) {
      try { await send({ type: 'mouseUp', ...position, button, clickCount: 1 }); buttons.delete(button); } catch (error) { failures.push(error); }
    }
    if (!keys.size && !buttons.size) { try { await evaluate('releaseInput'); } catch (error) { failures.push(error); } }
    cursor?.({ ...position, visible: false });
    if (failures.length) throw new AggregateError(failures, 'Sidebar input release could not be fully acknowledged');
    return { released: true };
  };
  const point = async args => {
    if (args.elementId != null) return evaluate('point', args);
    if (!Number.isFinite(args.x) || !Number.isFinite(args.y)) fail('INVALID_COORDINATES', 'A finite viewport point is required');
    if (args.coordinateSpace?.includes('screenshot')) {
      if (!lastObservation?.screenshot || args.observationId && args.observationId !== lastObservation.observationId || element.getURL() !== lastObservation.url) fail('STALE_SCREENSHOT', 'Observe the current viewport before using screenshot coordinates');
      const shot = lastObservation.screenshot, width = args.previewWidth ?? shot.width, height = args.previewHeight ?? shot.height;
      if (!(width > 0 && height > 0) || args.x < 0 || args.y < 0 || args.x >= width || args.y >= height) fail('INVALID_COORDINATES', 'Point is outside the displayed screenshot');
      await verifyScreenshot(lastObservation);
      return { x: args.x * shot.viewport.width / width, y: args.y * shot.viewport.height / height };
    }
    return { x: args.x, y: args.y };
  };
  return {
    metadata, release,
    async preview() {
      live();
      const image = await capture();
      return { dataUrl: image.toDataURL(), ...image.getSize(), active: await execute('document.hasFocus()') };
    },
    async observe(options = {}) {
      live();
      const observation = await evaluate('observe');
      if (options.format !== 'ax') {
        const image = await capture();
        const dataUrl = image.toDataURL(), size = image.getSize();
        observation.screenshot = { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/png', ...size, viewport: observation.viewport };
        await verifyScreenshot(observation);
      }
      lastObservation = observation;
      return observation;
    },
    async act(args) {
      const inputStart = inputSequence;
      try {
      if (!['background', 'foreground'].includes(args.inputMode ?? 'background')) fail('INVALID_ARGUMENT', 'inputMode must be background or foreground');
      if (!['navigate', 'reload', 'back', 'forward'].includes(args.action)) live();
      const epoch = generation, screenshot = args.elementId == null && args.coordinateSpace?.includes('screenshot') ? lastObservation : null;
      const sendInput = event => send(event, screenshot, args.elementId);
      const step = async work => {
        if (epoch !== generation) fail('CONTROL_STOPPED', 'Input sequence was cancelled');
        const task = Promise.resolve().then(() => { if (epoch !== generation) fail('CONTROL_STOPPED', 'Input sequence was cancelled'); return work(); });
        pending.add(task);
        try { const result = await task; if (epoch !== generation) fail('CONTROL_STOPPED', 'Input sequence was cancelled'); return result; }
        finally { pending.delete(task); }
      };
      const move = async value => {
        position = await step(() => point(value));
        await step(() => cursor?.({ ...position, visible: true, animateMovement: true, moveSequence: ++moveSequence, sessionConversationId: target.sessionId }));
        await step(() => sendInput({ type: 'mouseMove', ...position }));
      };
      const down = async button => { buttons.add(button); await step(() => sendInput({ type: 'mouseDown', ...position, button, clickCount: 1 })); };
      const up = async button => { await step(() => sendInput({ type: 'mouseUp', ...position, button, clickCount: 1 })); buttons.delete(button); };
      switch (args.action) {
        case 'domSnapshot': return {action: args.action, ...await step(() => evaluate('domSnapshot', {locator:args.locator ?? [], args: args.args ?? {}}))};
        case 'locator': {
          const result = await step(() => evaluate('locator', args));
          if (Object.hasOwn(result, 'value')) return {action: args.action, value: result.value};
          const options = args.args ?? {}, method = args.method;
          const checking = ['check', 'uncheck', 'setChecked'].includes(method);
          const checked = method === 'setChecked' ? options.checked : method === 'check';
          if (!checking || result.checked !== checked) {
            await this.act({action: checking ? 'click' : method === 'dblclick' ? 'doubleClick' : method,
              elementId: result.elementId, button: options.button, key: options.key, value: options.value, inputMode: args.inputMode});
            if (checking && (await step(() => evaluate('checked', {elementId: result.elementId}))).checked !== checked) fail('LOCATOR_ACTION_FAILED', 'Click did not produce the requested checked state');
          }
          return {action: args.action, value: null};
        }

        case 'navigate': await step(() => navigate(() => element.loadURL(args.url))); break;
        case 'back': if (element.canGoBack()) await step(() => navigate(() => element.goBack())); break;
        case 'forward': if (element.canGoForward()) await step(() => navigate(() => element.goForward())); break;
        case 'reload': await step(() => navigate(() => element.reload())); break;
        case 'focus': case 'activate': await step(focus); break;
        case 'move': await move(args); break;
        case 'click': case 'doubleClick': {
          await move(args);
          const button = args.button ?? 'left', count = args.action === 'doubleClick' ? 2 : 1;
          for (let clickCount = 1; clickCount <= count; clickCount++) {
            buttons.add(button); await step(() => sendInput({ type: 'mouseDown', ...position, button, clickCount }));
            await step(() => sendInput({ type: 'mouseUp', ...position, button, clickCount })); buttons.delete(button);
          }
          break;
        }
        case 'mouseDown': if (args.x != null || args.elementId != null) await move(args); await down(args.button ?? 'left'); break;
        case 'mouseUp': await up(args.button ?? 'left'); break;
        case 'scroll': if (args.x != null || args.elementId != null) await move(args); await step(() => sendInput({ type: 'mouseWheel', ...position, deltaX: args.deltaX ?? 0, deltaY: args.deltaY ?? 0 })); break;
        case 'drag': {
          if (!Array.isArray(args.path) || args.path.length < 2) fail('INVALID_ARGUMENT', 'Drag needs two or more points');
          await move({ ...args, ...args.path[0] }); await down(args.button ?? 'left');
          for (const value of args.path.slice(1)) await move({ ...args, ...value });
          await up(args.button ?? 'left'); break;
        }
        case 'keyDown': keys.add(args.key); await step(() => sendInput({ type: 'keyDown', keyCode: args.key })); break;
        case 'keyUp': await step(() => sendInput({ type: 'keyUp', keyCode: args.key })); keys.delete(args.key); break;
        case 'press': {
          if (args.elementId != null) await step(() => evaluate('focus', args));
          if (typeof args.key !== 'string' || !args.key) fail('INVALID_ARGUMENT', 'key must be a non-empty string');
          const parts = [];
          let token = '';
          for (const character of args.key) {
            if (character === '+' && token) { parts.push(token); token = ''; }
            else token += character;
          }
          parts.push(token);
          if (parts.some(key => !key)) fail('INVALID_ARGUMENT', 'Shortcut contains an empty key');
          const chord = parts.map(key => key === 'ControlOrMeta' ? /Mac/.test(navigator.platform) ? 'Meta' : 'Control' : key);
          if (chord.some(key => keys.has(key))) fail('INVALID_ARGUMENT', 'press cannot reuse an explicitly held key');
          for (const key of chord) { keys.add(key); await step(() => sendInput({ type: 'keyDown', keyCode: key })); }
          for (const key of chord.reverse()) { await step(() => sendInput({ type: 'keyUp', keyCode: key })); keys.delete(key); }
          break;
        }
        case 'type':
          if (args.elementId != null) await step(() => evaluate('focus', args));
          await step(() => expectInput([{ type: 'input' }]));
          if (args.elementId != null) await step(() => evaluate('verifyElement', args));
          await step(() => evaluate('insertText', { text: args.text, elementId: args.elementId })); break;
        case 'fill':
          await step(() => evaluate('selectAll', args));
          await step(() => expectInput([{ type: 'input' }]));
          await step(() => evaluate('verifyElement', args));
          await step(() => evaluate('insertText', { text: String(args.value ?? args.text ?? ''), elementId: args.elementId })); break;
        case 'selectOption':
          await step(() => expectInput([{type:'input'}]));
          await step(() => evaluate('selectOption', args)); break;
        case 'upload': await step(() => evaluate('upload', args)); break;
        case 'siteTools': {
          const result = await step(() => evaluate('siteTools'));
          return { action: args.action, ...result, target: metadata() };
        }
        case 'invokeSiteTool': {
          const requestId = crypto.randomUUID();
          try {
            const result = await step(() => evaluate('invokeSiteTool', { ...args, requestId }));
            const tool = result.tool;
            return { action: args.action, ...result, target: metadata(), webMcpCall: {
              id: requestId, kind: 'invokeTool', name: tool.name, title: tool.title, description: tool.description,
              sourceHostname: new URL(tool.origin).hostname, readOnlyHint: tool.annotations?.readOnlyHint ?? tool.annotations?.readOnly,
              inputJson: JSON.stringify(args.input), outputJson: JSON.stringify(result.output ?? null),
            } };
          } finally { lastObservation = null; changed(); }
        }
        case 'hitTest': return { action: args.action, element: await step(async () => evaluate('hitTest', await point(args))) };
        case 'getDOM': return { action: args.action, element: await step(() => evaluate('describe', args)) };
        case 'setText': case 'setStyle': case 'designTweak': return { action: args.action, element: await step(() => evaluate('patch', args)) };
        default: fail('UNSUPPORTED_ACTION', `Sidebar guest does not support ${args.action}`);
      }
      lastObservation = null; changed();
      return { action: args.action, target: metadata(), inputMode: 'background', delivery: 'target-cdp', effectVerified: false };
      } catch (error) {
        error.details = {...error.details,inputDispatched:error.details?.inputDispatched === true || inputSequence !== inputStart};
        throw error;
      }
    },
  };
}
