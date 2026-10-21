import { guestKeySpec, keyEventKey } from '../../extension/keyboard.js';
import { clickParameters, checkClickHeld, holdClick } from '../../extension/click-options.js';
import { pressParameters, checkPressHeld } from '../../extension/key-options.js';

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
    const writing = ['input', 'insertText', 'focus', 'selectAll', 'selectOption', 'upload', 'selectText', 'paste'].includes(operation);
    try {const result = await automate(operation, args); if (writing) inputSequence++; return result;}
    catch (error) {
      if (['selectText','paste'].includes(operation) && /Unsupported guest automation operation/u.test(error.message)) throw Object.assign(new Error('This DSH host lacks text selection and source paste; build the matching OpenCU host adapter'),{code:'UNSUPPORTED_ACTION',details:{inputDispatched:false}});
      if (writing && error.details?.inputDispatched !== false) {inputSequence++; error.details = {...error.details,inputDispatched:true};}
      if (['locator', 'domSnapshot'].includes(operation) && /Unsupported guest automation operation/u.test(error.message)) fail('UNSUPPORTED_LOCATOR', 'This DSH host lacks locator and DOM snapshot automation; build the matching OpenCU host adapter');
      throw error;
    }
  };
  const metadata = () => ({ ...target, url: element.getURL(), title: element.getTitle() });
  let dialogSupported;
  const assertNoDialog = async () => {
    if (dialogSupported === false) return;
    let result;
    try { result = await evaluate('getDialog'); dialogSupported = true; }
    catch (error) {
      if (error.code === 'HOST_DIALOG_UNSUPPORTED' || /Unsupported guest automation operation/u.test(error.message)) { dialogSupported = false; return; }
      throw error;
    }
    if (result?.dialog) throw Object.assign(new Error('A JavaScript dialog is open. Read this target.getJsDialog() before continuing.'),
      { code: 'JS_DIALOG_OPEN', details: { dialog: result.dialog, inputDispatched: false } });
  };
  const verifyScreenshot = async observation => {
    const current = await evaluate('pageState');
    if (current.documentId !== observation.documentId || current.url !== observation.url) fail('STALE_SCREENSHOT', 'The screenshot document changed; observe again');
    if (['width', 'height', 'scrollX', 'scrollY'].some(key => current[key] !== observation.viewport[key])) fail('STALE_SCREENSHOT', 'Viewport or scroll changed; observe again');
  };
  const modifiers = () => [...keys].flatMap(key => ({ Control: ['control'], Meta: ['meta'], Alt: ['alt'], Shift: ['shift'] })[key] ?? []);
  const expectInput = (events, pending = false) => evaluate('inputMarker', { method: 'expect', events, pending });
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
      if (marker && !rendererExited() && failure?.code !== 'JS_DIALOG_OPEN') try { await evaluate('inputMarker', { method: 'finish', marker, dispatched }); }
      catch (error) {
        if (!failure) { error.details = { ...error.details, inputDispatched: dispatched }; throw error; }
        failure.details = { ...failure.details, inputMarkerError: error.message };
      }
    }
  };
  const release = async ({ dismissDialogs = true } = {}) => {
    generation++;
    capture.cancel?.();
    const failures = [];
    cursor?.({ ...position, visible: false });
    // The host owns the authoritative held-input journal and the synchronous dialog
    // callback. Resolve those before waiting for page JS or the client's pending work.
    if (!rendererExited()) {
      const result = await evaluate('releaseInput', { dismissDialogs });
      keys.clear(); buttons.clear();
      if (result?.deferredFocus) return { released: true };
    }
    try { cancelNavigation?.(); } catch (error) { failures.push(error); }
    cursor?.({ ...position, visible: false });
    const cancelled = await Promise.allSettled(['cancelSiteTool', 'cancelUpload'].map(operation => Promise.resolve().then(() => evaluate(operation))));
    await Promise.allSettled([...pending]);
    if (!rendererExited()) try { await evaluate('inputMarker', { method: 'clear' }); } catch (error) { failures.push(error); }
    else { keys.clear(); buttons.clear(); lastObservation = null; }
    failures.push(...cancelled.filter(result => result.status === 'rejected').map(result => result.reason));
    for (const key of [...keys].reverse()) {
      try { await send({ type: 'keyUp', keyCode: key }); keys.delete(key); } catch (error) { failures.push(error); }
    }
    for (const button of [...buttons]) {
      try { await send({ type: 'mouseUp', ...position, button, clickCount: 1 }); buttons.delete(button); } catch (error) { failures.push(error); }
    }
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
      await assertNoDialog();
      const image = await capture({ offThread: true });
      return { dataUrl: image.toDataURL(), ...image.getSize(), active: (await evaluate('pageState')).focused };
    },
    async observe(options = {}) {
      live();
      await assertNoDialog();
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
      if (args.action === 'getDialog' || args.action === 'handleDialog') {
        const result = await evaluate(args.action, args);
        if (args.action === 'handleDialog' && result.handled && !result.releasePending) { keys.clear(); buttons.clear(); }
        return { action: args.action, ...result };
      }
      await assertNoDialog();
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
            const performed = await this.act({action: checking ? 'click' : method === 'dblclick' ? 'doubleClick' : method,
              elementId: result.elementId, button: options.button, key: options.key, value: options.value, inputMode: args.inputMode});
            if (performed.pendingDialog) return performed;
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
          const click = clickParameters(args, {mac:/Mac/u.test(navigator.platform),count:args.action === 'doubleClick' ? 2 : 1});
          checkClickHeld({keys,buttons}, click);
          await move(args);
          const {button} = click;
          for (const key of click.keys) { keys.add(key); await step(() => sendInput({ type:'keyDown', keyCode:key })); }
          for (let clickCount = 1; clickCount <= click.count; clickCount++) {
            buttons.add(button); await step(() => sendInput({ type: 'mouseDown', ...position, button, clickCount }));
            await step(() => holdClick(click.durationMs, () => {if (epoch !== generation) fail('CONTROL_STOPPED','Input sequence was cancelled');}));
            await step(() => sendInput({ type: 'mouseUp', ...position, button, clickCount })); buttons.delete(button);
          }
          for (const key of [...click.keys].reverse()) { await step(() => sendInput({type:'keyUp',keyCode:key})); keys.delete(key); }
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
        case 'keyDown': {const key=guestKeySpec(args.key).key; keys.add(key); await step(() => sendInput({ type:'keyDown',keyCode:key })); break;}
        case 'keyUp': {
          const spec=guestKeySpec(args.key);
          await step(() => sendInput({type:'keyUp',keyCode:spec.key}));
          keys.delete(spec.key);
          break;
        }
        case 'press': {
          const keyboard={mac:/Mac/u.test(navigator.platform),identity:key=>guestKeySpec(key).code};
          const press=pressParameters(args,keyboard), chord=press.keys.map(key=>guestKeySpec(key).key), {durationMs}=press;
          checkPressHeld({keys},chord,keyboard);
          if (args.elementId != null) await step(() => evaluate('focus', args));
          for (const key of chord) {
            keys.add(key);
            try { await step(() => sendInput({ type:'keyDown',keyCode:key })); }
            catch (error) { if (error.details?.inputDispatched === false) keys.delete(key); throw error; }
          }
          await step(() => holdClick(durationMs, () => {if (epoch !== generation) fail('CONTROL_STOPPED','Input sequence was cancelled');}));
          for (const key of [...chord].reverse()) { await step(() => sendInput({ type: 'keyUp', keyCode: key })); keys.delete(key); }
          break;
        }
        case 'type':
          if (args.elementId != null) await step(() => evaluate('focus', args));
          if (args.elementId != null) await step(() => evaluate('verifyElement', args));
          await step(() => evaluate('insertText', { text: args.text, elementId: args.elementId })); break;
        case 'selectText':
        case 'paste': {
          const result = await step(() => evaluate(args.action,args));
          lastObservation=null;changed();
          return {action:args.action,...result,target:metadata(),inputMode:'background',delivery:'target-cdp'};
        }
        case 'fill':
          await step(() => evaluate('selectAll', args));
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
        if (error.code === 'JS_DIALOG_OPEN' && error.details.inputDispatched && error.details.dialog) {
          lastObservation = null; changed();
          return { action: args.action, pendingDialog: error.details.dialog, inputDispatched: true, effectVerified: false };
        }
        throw error;
      }
    },
  };
}
