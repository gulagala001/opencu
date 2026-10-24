import { guestKeySpec, keyEventKey, sequentialTextKey, checkSequentialDeadline, keyboardInputTypes } from '../../extension/keyboard.js';
import { clickParameters, locatorClickParameters, checkClickHeld, holdClick } from '../../extension/click-options.js';
import { pressParameters, checkPressHeld } from '../../extension/key-options.js';
import {scrollDeltas} from '../../extension/scroll.js';
import { inputReleased } from '../protocol.mjs';
import { dragPath } from '../../extension/pointer-path.js';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

/** A native close signal starts verification; only the original host receipt permits retirement. */
export function watchGuestClosure(element, driver, closed, report) {
  let disposed = false, confirmed = false, requested = false, work;
  const check = () => {
    if (disposed || confirmed) return;
    requested = true;
    if (work) return;
    work = (async () => {
      while (requested && !disposed) {
        requested = false;
        const release = await driver.closedRelease({ waitForClose: true });
        if (!release) continue;
        if (!inputReleased(release) || release.retired !== true) fail('RELEASE_FAILED', 'The closed guest has not acknowledged input release');
        if (!disposed) { await closed(release); confirmed = true; requested = false; }
        return;
      }
    })().catch(report).finally(() => { work = undefined; if (requested && !disposed && !confirmed) check(); });
  };
  for (const event of ['close', 'destroyed']) element.addEventListener(event, check);
  return () => { disposed = true; for (const event of ['close', 'destroyed']) element.removeEventListener(event, check); };
}

export function createGuestDriver(element, target, changed, focus, cursor, capture = () => element.capturePage(), automate) {
  const keys = new Set(), buttons = new Set(), pending = new Set();
  let inputSequence = 0, position = { x: 0, y: 0 }, lastObservation, generation = 0, documentGeneration = 0, moveSequence = 0, cancelNavigation;
  let exited = false;
  const rendererExited = () => { if (exited) return true; try { return element.isCrashed?.() === true; } catch { return false; } };
  const live = () => { if (rendererExited()) fail('BROWSER_GUEST_CRASHED', 'The browser page process exited; reload the page before observing or sending input'); };
  const invalidate = () => { exited = true; generation++; lastObservation = null; keys.clear(); buttons.clear(); cancelNavigation?.(); };
  element.addEventListener('render-process-gone', invalidate);
  element.addEventListener('dom-ready', () => { exited = false; });
  for(const event of ['did-navigate','did-navigate-in-page'])element.addEventListener(event,()=>{documentGeneration++;lastObservation=null;});
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
      if (operation === 'navigationState' && /Unsupported guest automation operation/u.test(error.message)) throw Object.assign(new Error('This DSH host lacks navigation waits and download attribution; build the matching OpenCU host adapter'),{code:'UNSUPPORTED_ACTION',details:{inputDispatched:false}});
      if (['selectText','paste'].includes(operation) && /Unsupported guest automation operation/u.test(error.message)) throw Object.assign(new Error('This DSH host lacks text selection and source paste; build the matching OpenCU host adapter'),{code:'UNSUPPORTED_ACTION',details:{inputDispatched:false}});
      if (writing && error.details?.inputDispatched !== false) {inputSequence++; error.details = {...error.details,inputDispatched:true};}
      if (['locator', 'domSnapshot'].includes(operation) && /Unsupported guest automation operation/u.test(error.message)) fail('UNSUPPORTED_LOCATOR', 'This DSH host lacks locator and DOM snapshot automation; build the matching OpenCU host adapter');
      throw error;
    }
  };
  const metadata = () => ({ ...target, url: element.getURL(), title: element.getTitle() });
  const closedRelease = async ({ waitForClose = false } = {}) => {
    const receipt = await evaluate('closedState', { waitForClose });
    if (receipt?.closed !== true) return null;
    if (!inputReleased(receipt) || receipt.retired !== true) fail('RELEASE_FAILED', 'The destroyed guest has not acknowledged input release');
    generation++; capture.cancel?.(); lastObservation = null;
    await Promise.allSettled([...pending]);
    keys.clear(); buttons.clear();
    return receipt;
  };
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
      if (['mouseDown','mouseMove','mouseUp'].includes(event.type)) marker=await expectInput([{type:({mouseDown:'pointerdown',mouseMove:'pointermove',mouseUp:'pointerup'})[event.type],x:event.x,y:event.y}]);
      else if (event.type === 'mouseWheel') marker = await expectInput([{ type: 'wheel', x: event.x, y: event.y, deltaX: event.deltaX ?? 0, deltaY: event.deltaY ?? 0 }], true);
      else if (event.type === 'keyDown') {
        const bits = [...keys].reduce((mask,key) => mask | ({Alt:1,Control:2,Meta:4,Shift:8}[key] ?? 0),0);
        const inputTypes = keyboardInputTypes(guestKeySpec(event.keyCode).code,bits,/Mac/u.test(globalThis.navigator?.platform ?? ''));
        marker = await expectInput([{type:'keydown',key:keyEventKey(event.keyCode,keys.has('Shift') ? 8 : 0),...(inputTypes.length ? {inputTypes} : {})}]);
      }
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
      let result;
      try { result = await evaluate('releaseInput', { dismissDialogs }); }
      catch (error) { const closed = await closedRelease().catch(() => null); if (closed) return closed; throw error; }
      if (!inputReleased(result)) throw Object.assign(new Error('Host input release was not acknowledged'),{code:'RELEASE_FAILED',details:result});
      keys.clear(); buttons.clear();
      if (result.closed === true && result.retired === true) {
        await Promise.allSettled([...pending]); lastObservation = null; return result;
      }
      if (result?.deferredFocus) return { released: true };
    }
    try { cancelNavigation?.(); } catch (error) { failures.push(error); }
    cursor?.({ ...position, visible: false });
    const cancelled = await Promise.allSettled(['cancelSiteTool', 'cancelUpload'].map(operation => Promise.resolve().then(() => evaluate(operation))));
    await Promise.allSettled([...pending]);
    const cleanupErrors = [];
    if (!rendererExited()) try { await evaluate('inputMarker', { method: 'clear' }); } catch (error) { cleanupErrors.push({code:error.code,message:error.message}); }
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
    return { released: true, ...(cleanupErrors.length ? {cleanupErrors} : {}) };
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
    metadata, release, closedRelease,
    async preview() {
      live();
      await assertNoDialog();
      const image = await capture({ offThread: true });
      return { dataUrl: image.toDataURL(), ...image.getSize(), active: (await evaluate('pageState')).focused };
    },
    async observe(options = {}) {
      live();
      await assertNoDialog();
      const observation = await evaluate('observe', { format: options.format ?? 'both' });
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
      const heldKeys = new Set(keys), heldButtons = new Set(buttons);
      try {
      if (!['background', 'foreground'].includes(args.inputMode ?? 'background')) fail('INVALID_ARGUMENT', 'inputMode must be background or foreground');
      if (args.action === 'getDialog' || args.action === 'handleDialog') {
        const result = await evaluate(args.action, args);
        if (args.action === 'handleDialog' && result.handled && !result.releasePending) { keys.clear(); buttons.clear(); }
        return { action: args.action, ...result };
      }
      await assertNoDialog();
      if (!['navigate', 'reload', 'back', 'forward'].includes(args.action)) live();
      const epoch = generation, occurrence = documentGeneration;
      const inputActionId=['click','doubleClick','move','mouseDown','scroll','drag','type','keyDown','press','paste','selectText','fill','selectOption'].includes(args.action) ? crypto.randomUUID() : undefined;
      const inputDocumentId=inputActionId ? (await evaluate('navigationState')).documentId : undefined;
      const check=()=>{if(epoch!==generation)fail('CONTROL_STOPPED','Input sequence was cancelled');if(inputActionId&&occurrence!==documentGeneration)fail('STALE_ELEMENT','The document changed during input; observe again');};
      check();
      const screenshot = args.elementId == null && args.coordinateSpace?.includes('screenshot') ? lastObservation : null;
      const sendInput = event => send({...event,keyboardEditable:args.keyboardEditable,inputDocumentId,inputActionId}, screenshot, args.elementId);
      const step = async work => {
        check();
        const task = Promise.resolve().then(() => {check();return work();});
        pending.add(task);
        try { const result = await task;check();return result; }
        finally { pending.delete(task); }
      };
      const move = async (value, animateMovement = true, resolved = false) => {
        position = resolved ? value : await step(() => point(value));
        await step(() => cursor?.({ ...position, visible: true, animateMovement, moveSequence: ++moveSequence, sessionConversationId: target.sessionId }));
        await step(() => sendInput({ type: 'mouseMove', ...position }));
      };
      const down = async button => { buttons.add(button); await step(() => sendInput({ type: 'mouseDown', ...position, button, clickCount: 1 })); };
      const up = async button => { await step(() => sendInput({ type: 'mouseUp', ...position, button, clickCount: 1 })); buttons.delete(button); };
      switch (args.action) {
        case 'navigationState': return {action:args.action,value:await step(() => evaluate('navigationState',{downloadCursor:args.downloadCursor === true}))};
        case 'domSnapshot': return {action: args.action, ...await step(() => evaluate('domSnapshot', {locator:args.locator ?? [], args: args.args ?? {}}))};
        case 'locator': {
          const options = args.args ?? {}, method = args.method;
          const click = ['click','dblclick'].includes(method) ? locatorClickParameters(options, {mac:/Mac/u.test(navigator.platform),count:method === 'dblclick' ? 2 : 1}) : undefined;
          if (click) checkClickHeld({keys,buttons}, click);
          const result = await step(() => evaluate('locator', args));
          if (Object.hasOwn(result, 'value')) return {action: args.action, value: result.value};
          const checking = ['check', 'uncheck', 'setChecked'].includes(method);
          const checked = method === 'setChecked' ? options.checked : method === 'check';
          if (!checking || result.checked !== checked) {
            const performed = await this.act({action: checking ? 'click' : method === 'dblclick' ? 'doubleClick' : method === 'pressSequentially' ? 'type' : method,
              elementId: result.elementId, button: options.button, key: click?.keys.length ? click.keys.join('+') : options.key, value: options.value, text: options.value,
              sequential:method === 'pressSequentially', deadline:args.deadline, keyboardEditable:result.keyboardEditable, inputMode: args.inputMode});
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
            await step(() => holdClick(click.durationMs, check));
            await step(() => sendInput({ type: 'mouseUp', ...position, button, clickCount })); buttons.delete(button);
          }
          for (const key of [...click.keys].reverse()) { await step(() => sendInput({type:'keyUp',keyCode:key})); keys.delete(key); }
          break;
        }
        case 'mouseDown': if (args.x != null || args.elementId != null) await move(args); await down(args.button ?? 'left'); break;
        case 'mouseUp': await up(args.button ?? 'left'); break;
        case 'scroll': {
          let deltas = scrollDeltas(args), geometry;
          if (args.x != null || args.elementId != null) await move(args);
          if (!deltas) {geometry = await step(() => evaluate('scrollGeometry',args));deltas = scrollDeltas(args,geometry);}
          await step(() => sendInput({type:'mouseWheel',...position,...deltas,...(geometry ? {scrollPages:args.scrollPages,scrollDirection:args.scrollDirection,scrollGeometry:geometry,observationId:args.observationId} : {})}));
          break;
        }
        case 'drag': {
          const plan=dragPath(args.path,args.durationMs),waypoints=[],button=args.button ?? 'left';
          if (!['left','middle','right'].includes(button)) fail('INVALID_ARGUMENT','Drag button must be left, middle, or right');
          if (buttons.has(button)) fail('INPUT_ALREADY_HELD','Drag cannot acquire an already held mouse button');
          for (const value of plan.waypoints) waypoints.push(await step(() => point({...args,...value,elementId:undefined})));
          const {points,intervalMs}=dragPath(waypoints,args.durationMs);
          await move(points[0],true,true); await down(button);
          for (const value of points.slice(1)) {
            await step(() => holdClick(intervalMs,check));
            await move(value,false,true);
          }
          await up(button); break;
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
          await step(() => holdClick(durationMs, check));
          for (const key of [...chord].reverse()) { await step(() => sendInput({ type: 'keyUp', keyCode: key })); keys.delete(key); }
          break;
        }
        case 'type':
          if (typeof args.text !== 'string') fail('INVALID_ARGUMENT', 'type requires text');
          if (args.sequential) {
            checkSequentialDeadline(args.deadline);
            for (const character of args.text) {const key=sequentialTextKey(character); if(key) checkPressHeld({keys},[key],{identity:value=>guestKeySpec(value).code});}
          }
          if (args.elementId != null) await step(() => evaluate('focus', args));
          if (args.elementId != null) await step(() => evaluate('verifyElement', args));
          if (args.sequential) for (const character of args.text) {
            checkSequentialDeadline(args.deadline);
            const key=sequentialTextKey(character);
            if (key) {
              keys.add(key);
              try {await step(() => sendInput({type:'keyDown',keyCode:key}));}
              catch (error) {if (error.details?.inputDispatched === false) keys.delete(key);throw error;}
              await step(() => sendInput({type:'keyUp',keyCode:key}));keys.delete(key);
            } else await step(() => evaluate('insertText',{text:character,elementId:args.elementId}));
          }
          else await step(() => evaluate('insertText', { text: args.text, elementId: args.elementId })); break;
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
      return { action: args.action, target: metadata(), inputMode: 'background', delivery: 'target-cdp', effectVerified: false,
        ...(!keys.size && !buttons.size ? {release:{released:true}} : {}) };
      } catch (error) {
        error.details = {...error.details,inputDispatched:error.details?.inputDispatched === true || inputSequence !== inputStart};
        if (error.details.inputDispatched) {
          const closed = await closedRelease().catch(() => null);
          if (closed) return {action:args.action,closedTargetId:target.id,inputDispatched:true,effectVerified:false,release:closed};
        }
        if (error.details.inputDispatched === false) {
          for (const key of keys) if (!heldKeys.has(key)) keys.delete(key);
          for (const button of buttons) if (!heldButtons.has(button)) buttons.delete(button);
        }
        if (error.code === 'JS_DIALOG_OPEN' && error.details.inputDispatched && error.details.dialog) {
          lastObservation = null; changed();
          return { action: args.action, pendingDialog: error.details.dialog, inputDispatched: true, effectVerified: false };
        }
        throw error;
      }
    },
  };
}
