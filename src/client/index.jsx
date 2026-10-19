import { downloadExtensionZip } from './extension-download.mjs';
import { resolveDesktopBrowserHost } from './host-compat.mjs';
import { decodeBase64 } from './base64.mjs';
import { createCoreClient } from './core-client.mjs';
import { createPendingAppApprovals, selectAppApproval } from './pending-app-approvals.mjs';
import { createAppApprovalResponder } from './app-approval-response.mjs';
import { sharedConfigForm, configureCapability } from './configuration.mjs';
import { createBrowserHistoryHost } from './browser-history.mjs';
import { createDownloadsHost } from './downloads-host.mjs';
import { createBrowserTransport } from './browser-transport.mjs';
import { createReaBrowserHost } from './rea-browser-host.mjs';
import { createBrowserSurfaces } from './browser-surfaces.mjs';
import { initializeRea } from './rea-root.jsx';
import { installReaServices } from './rea-services.mjs';
import { BrowserSlot } from './browser-slot.jsx';
import { HiddenBrowserSlot } from './hidden-browser-slot.jsx';
import { BrowserTitleSlot } from './browser-title.jsx';
import { createReferences } from './references.mjs';
import { createSettingsHost } from './settings-host.mjs';
import { createBrowserSettings } from './browser-settings.mjs';
import { SettingsSlot } from './settings-slot.jsx';
import { ImageSlot } from './image-slot.jsx';
import { DocumentSlot } from './document-slot.jsx';
import { ToolSlot } from './tool-slot.jsx';
import { AppApprovalSlot } from './app-approval-slot.jsx';
import { createFilesHost } from './files-host.mjs';
import { createArtifactDocumentsHost } from './artifact-documents.mjs';
import { createSourcesHost } from './sources-host.mjs';
import { SourcesSlot } from './sources-slot.jsx';
import { createReferenceEditor } from './reference-editor.mjs';
import { ReferenceEditorSlot } from './reference-editor-slot.jsx';
import { createBrowserAddress, createBrowserAddressAutocomplete } from './browser-address.mjs';
import { BrowserAddressSlot } from './browser-address-slot.jsx';
import { AW as browserTabs } from './rea/app-initial-c468e3fd7f91.js';
import { createTextAnnotations } from './text-annotations.mjs';
import { TextAnnotationSlot } from './text-annotation-slot.jsx';
import { installAnnotationMessages } from './annotation-message-slot.jsx';
import { createPresentationClient } from './presentation-host.mjs';
import { PresentationSlot } from './presentation-slot.jsx';
import { OverviewSlot } from './session-overview.jsx';
import { createPresentationLayout } from './presentation-layout.mjs';
import { guestPortalStyles } from './portal-host.mjs';

export const name = 'opencu/client';
export { OverviewSlot };
export const inject = ['connection', 'slots', 'sidebarRight', 'sidebarRightTabs', 'locale', 'conversation', 'sessions', 'inputTriggers', 'configForms', 'uiWorkspace', 'uiSession'];

const clients = globalThis[Symbol.for('opencu.shared-client.v1')] ??= new WeakMap();

// Standalone and bundled installations share one mounted client. Its REA
// components must use that same bundle's initialized renderer and services.
export function getOverviewSlot(ctx) {
  const slot = clients.get(ctx.root)?.overviewSlot;
  if (!slot) throw new Error('OpenCU shared client is not initialized');
  return slot;
}

export async function apply(ctx) {
  const root = ctx.root;
  let entry = clients.get(root);
  if (entry?.closing) { await entry.closing; entry = clients.get(root); }
  if (!entry) {
    entry = { owners: new Set(), overviewSlot: OverviewSlot };
    entry.fiber = root.plugin({ name: 'opencu/shared-client', inject, apply: scope => mountClient(scope, entry) });
    clients.set(root, entry);
  }
  const owner = {};
  entry.owners.add(owner);
  ctx.effect(() => async () => {
    if (!entry.owners.delete(owner) || entry.owners.size) return;
    entry.closing = (async () => { await entry.beforeDispose?.(); await entry.fiber.dispose(); })();
    try { await entry.closing; }
    catch (error) { entry.closing = undefined; throw error; }
    if (clients.get(root) === entry) clients.delete(root);
  }, 'opencu: shared client ownership');
  await entry.fiber;
}

function mountClient(ctx, entry) {
  const client = createCoreClient();
  const publishApproval = ctx.uiSession.registerPendingInteraction(() => -1);
  const appApprovalManager = createPendingAppApprovals({client,publish:publishApproval});
  ctx.effect(() => () => appApprovalManager.dispose(), 'opencu: pending app approvals');
  ctx.effect(() => ctx.slots.inject('conversation.composer', () => ctx.slots.register({name:'conversation.composer',priority:1,select:selectAppApproval}, AppApprovalSlot)), 'opencu: application approval composer');
  ctx.effect(() => {
    const unprovide = ctx.provide('opencuClient', client);
    client.start();
    return () => { client.dispose(); unprovide(); };
  }, 'opencu: core events');
  const { desktop, error: desktopAdapterError } = resolveDesktopBrowserHost();
  const transport = createBrowserTransport(client, desktop);
  transport.setSessionOwner(() => [ctx.sidebarRight.mounted.getSnapshot()].filter(Boolean));
  ctx.effect(() => ctx.sidebarRight.mounted.subscribe(() => {
    void transport.updateSessions().catch(error => console.error('OpenCU presentation owner', error));
  }), 'opencu: window session ownership');
  if (desktop?.onPresentationEvent) {
    ctx.effect(() => createPresentationLayout(desktop), 'opencu: REA monitor anchors');
    ctx.effect(() => desktop.onPresentationEvent(event => {
      if (event.type === 'alignment' || event.type === 'geometry') return;
      if (event.type === 'contrast-request') {
        void client.request('presentation/contrast', { ...event, rendererId: transport.rendererId })
          .catch(() => ({ available: false }))
          .then(result => desktop.presentation('contrast-result', { sequence: event.sequence, ...result }))
          .catch(error => console.error('OpenCU monitoring contrast', error));
        return;
      }
      const sessionId = ctx.sidebarRight.mounted.getSnapshot();
      void client.request('presentation/event', { ...event, rendererId: transport.rendererId }).catch(error => {
        console.error('OpenCU monitoring', error);
        const scope = ctx.sessions.scope(sessionId);
        if (scope) ctx.conversation.input.for(scope).notify('error', error.message);
      });
    }), 'opencu: monitoring events');
  }
  ctx.effect(() => ctx.locale.register('opencuReferences', {
    zh: { annotations: '网页批注', tabs: '浏览器标签', applications: '应用窗口' },
    en: { annotations: 'Page annotations', tabs: 'Browser tabs', applications: 'Application windows' },
  }), 'opencu: reference copy');
  const referenceCopy = ctx.locale.bind('opencuReferences');
  const references = createReferences({ client, translate: referenceCopy,
    edit: (sessionId, ref) => referenceEditor.open(sessionId, ref),
    focus: async target => {
      if (target.nodeKey && target.conversationId) {
        if (ctx.sidebarRight.mounted.getSnapshot() !== target.conversationId) await ctx.uiWorkspace.openSession(target.conversationId);
        return textAnnotations.focus(target);
      }
      if (!target.resourceAddress) return host.service.focusReference(target);
      if (ctx.sidebarRight.mounted.getSnapshot() !== target.sessionId) await ctx.uiWorkspace.openSession(target.sessionId);
      ctx.sidebarRight.openResourceIn(target.sessionId, target.resourceAddress);
    },
    notify: message => {
      const scope = ctx.sessions.scope(ctx.sidebarRight.mounted.getSnapshot());
      if (scope) ctx.conversation.input.for(scope).notify('error', message);
    },
  });
  const referenceEditor = createReferenceEditor({ references,
    inputFor: sessionId => {
      const scope = ctx.sessions.scope(sessionId);
      if (!scope) throw new Error('The annotation conversation is no longer available');
      return ctx.conversation.input.for(scope);
    },
    remove: async (sessionId, span) => await ctx.sessions.scope(sessionId)?.bail('slash/input-insert-text', { text: '', span }) === true,
    notify: (sessionId, message) => {
      const scope = ctx.sessions.scope(sessionId);
      if (scope) ctx.conversation.input.for(scope).notify('error', message);
    },
  });
  ctx.effect(() => () => referenceEditor.dispose(), 'opencu: annotation draft edits');
  ctx.effect(() => ctx.inputTriggers.registerSource(references.source), 'opencu: target and annotation references');
  const textAnnotations = createTextAnnotations({
    notify: (sessionId, message) => { const scope = ctx.sessions.scope(sessionId); if (scope) ctx.conversation.input.for(scope).notify('error', message); },
    async submit(value, directly) {
      const scope = ctx.sessions.scope(value.sessionId);
      if (!scope) throw new Error('The annotated conversation is no longer available');
      const payload = { conversationId: value.sessionId, nodeKey: value.nodeKey, turn: value.turn,
        selectedText: value.text, textOffset: value.start, comments: [{ body: value.body }] };
      const reference = references.chip({ kind: 'text-annotations', payload }, value.text.slice(0, 64));
      if (directly) {
        const result = await ctx.sessions.sessionOf(scope).prompt([{ type: 'text', text: references.serialize(reference.ref) }], 'queue');
        if (!result.ok) throw new Error(result.error.message);
      } else {
        const input = ctx.conversation.input.for(scope), state = input.state.getSnapshot();
        if (state.phase !== 'plain') throw new Error('The message draft is busy; the annotation is still saved');
        const end = state.draft.length - state.occurrences.reduce((size, occurrence) => size + occurrence.length - 1, 0);
        if (!input.insertReference(reference, { start: end, end, draftRev: state.draftRev })) throw new Error('The message draft changed; retry saving the annotation');
        input.focus();
      }
    },
  });
  ctx.effect(() => { textAnnotations.start(); return () => textAnnotations.dispose(); }, 'opencu: selected response text');
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'opencu.text-annotation', inject: () => ({ hooks: { annotation: textAnnotations.state },
      body: textAnnotations.body, close: textAnnotations.close, submit: textAnnotations.submit, copy: textAnnotations.copy, edit: textAnnotations.edit,
      report: message => { const value = textAnnotations.state.getSnapshot(); const scope = value && ctx.sessions.scope(value.sessionId); if (scope) ctx.conversation.input.for(scope).notify('error', message); },
    }),
  }, TextAnnotationSlot)), 'opencu: REA selected text editor');
  ctx.effect(() => ctx.slots.inject('conversation.chat.node', () => installAnnotationMessages(ctx.slots)), 'opencu: sent response annotation display');
  const settings = createSettingsHost(client, sharedConfigForm(ctx.configForms, ['omd-ui-chat', 'ui-chat']));
  const capabilitiesConfig = sharedConfigForm(ctx.configForms, ['opencu', 'omd-opencu']);
  const addImageDrafts = (conversationId, images) => {
    const scope = ctx.sessions.scope(conversationId);
    if (!scope) throw new Error('The image conversation is no longer available');
    const drafts = ctx.conversation.createDrafts(conversationId, images.map(image => new File([
      decodeBase64(image.data),
    ], image.name || 'screenshot.png', { type: image.mediaType })));
    const input = ctx.conversation.input.for(scope);
    if (!input.addAttachments(drafts.map(draft => draft.id))) {
      for (const draft of drafts) ctx.conversation.releaseDraftAttachment(draft.id);
      throw new Error('The message draft is busy; retry adding the screenshot');
    }
    input.focus();
  };
  const history = createBrowserHistoryHost(client, desktop);
  ctx.effect(() => () => history.dispose(), 'opencu: browsing history and address suggestions');
  const downloads = createDownloadsHost({ desktop, client, settings, downloadUrl: url => host.service.downloadUrl(url) });
  const host = (desktop ? createBrowserSurfaces : createReaBrowserHost)({ desktop, transport, client, sidebar: ctx.sidebarRight, openSession: id => ctx.uiWorkspace.openSession(id), settings, history, downloads,
    async deliverScreenshot(conversationId, dataURL, title) {
      const mediaType = dataURL.slice(5, dataURL.indexOf(';')), extension = mediaType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      addImageDrafts(conversationId, [{ mediaType, data: dataURL.slice(dataURL.indexOf(',') + 1), name: `${title || 'screenshot'}.${extension}` }]);
    },
    async deliverAnnotations({ conversationId, browserTabId, comments, directly, url, title, target }) {
      const scope = ctx.sessions.scope(conversationId);
      if (!scope) throw new Error('The annotation conversation is no longer available');
      const input = ctx.conversation.input.for(scope);
      const payload = { target, browserId: target?.browserId, browserTabId, conversationId, url, title, comments };
      const label = `${referenceCopy('annotations')} · ${title || url}`;
      const session = ctx.sessions.sessionOf(scope);
      const images = await Promise.all(comments.flatMap(comment => [
        ...(comment.screenshot ? [{ attachment: comment.screenshot }] : []),
        ...(comment.attachedImages ?? []).map(image => ({ image })),
      ]).map(async ({ attachment, image }) => {
        if (attachment) {
          const result = await client.request('image', { attachmentId: attachment.attachmentId });
          return { type: 'image', mediaType: result.mediaType, data: result.data, name: attachment.name };
        }
        if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(image.dataUrl ?? '')) throw new Error('The annotation image is no longer available');
        const separator = image.dataUrl.indexOf(','), mediaType = image.dataUrl.slice(5, image.dataUrl.indexOf(';'));
        return { type: 'image', mediaType, data: image.dataUrl.slice(separator + 1), name: image.filename || 'annotation-image' };
      }));
      if (directly) {
        const reference = references.chip({ kind: 'annotations', payload }, `${label} (${comments.length})`);
        const result = await session.prompt([{ type: 'text', text: references.serialize(reference.ref) }, ...images], 'queue');
        if (!result.ok) throw new Error(result.error.message);
        return;
      }
      const state = input.state.getSnapshot();
      if (state.phase !== 'plain') throw new Error('The message draft is busy; your annotations are still saved');
      // Synchronous insertion keeps this batch together; spans count each chip as one character.
      for (const [index, comment] of comments.entries()) {
        const reference = references.chip({ kind: 'annotations', payload: { ...payload, comments: [comment] } }, `${label} · ${index + 1}`);
        const current = input.state.getSnapshot();
        const end = current.draft.length - current.occurrences.reduce((size, occurrence) => size + occurrence.length - 1, 0);
        if (!input.insertReference(reference, { start: end, end, draftRev: current.draftRev })) throw new Error('The message draft changed; your annotations are still saved');
      }
      if (images.length) addImageDrafts(conversationId, images);
      input.focus();
    },
  });
  ctx.effect(() => {
    const onSubmit = event => {
      const { conversationId, onSubmitAvailability, onSubmitStarted } = event.detail;
      const scope = ctx.sessions.scope(conversationId);
      if (!scope) { onSubmitAvailability?.(false); return; }
      const input = ctx.conversation.input.for(scope);
      onSubmitAvailability?.(input.state.getSnapshot().phase === 'plain');
      if (onSubmitStarted) {
        const sending = host.service.sendAnnotations(conversationId, true);
        onSubmitStarted(sending);
        sending.catch(error => input.notify('error', error.message));
      }
    };
    window.addEventListener('codex-browser-sidebar-tweaks-submit-request', onSubmit);
    return () => window.removeEventListener('codex-browser-sidebar-tweaks-submit-request', onSubmit);
  }, 'opencu: REA annotation submission');
  let settingsPath = '/settings/computer-use';
  const settingsListeners = new Set();
  const settingsRoute = { getSnapshot: () => settingsPath, subscribe(listener) { settingsListeners.add(listener); return () => settingsListeners.delete(listener); } };
  function openSettings(path) {
    const entry = ctx.slots.entries('sidebar.settings').find(entry => entry.store);
    const actions = entry?.store.create().actions;
    if (!actions?.openSection) throw new Error('The DSH settings shell is unavailable');
    settingsPath = path; for (const listener of settingsListeners) listener();
    actions.openSection('opencu-capabilities');
  }
  const paneActions = sessionId => ({
    report: message => { const scope = ctx.sessions.scope(sessionId); if (scope) ctx.conversation.input.for(scope).notify('error', message); },
    toggleFullscreen(element) {
      const target = ctx.sidebarRight.focusedTarget(element);
      if (!target || target.sessionId !== sessionId || !ctx.sidebarRight.isTargetCurrent(target)) throw new Error('The viewer pane changed');
      ctx.sidebarRight.toggleFullscreen(target);
    },
  });
  const files = createFilesHost({ client, desktop, sidebar: ctx.sidebarRight, openSession: id => ctx.uiWorkspace.openSession(id) });
  const artifactDocuments = createArtifactDocumentsHost(desktop);
  entry.beforeDispose = () => artifactDocuments.dispose();
  ctx.effect(() => async () => { await artifactDocuments.dispose(); files.dispose(); }, 'opencu: workbook and file services');
  const sources = createSourcesHost({ client, sidebar: ctx.sidebarRight, openSession: id => ctx.uiWorkspace.openSession(id) });
  ctx.effect(() => () => sources.dispose(), 'opencu: conversation sources');
  const browserSettings = createBrowserSettings(client);
  ctx.effect(() => () => browserSettings.dispose(), 'opencu: connected browser settings');
  const browserAddressAutocomplete = createBrowserAddressAutocomplete(history.browserAutocomplete, (sessionId, message) => {
    const scope = ctx.sessions.scope(sessionId);
    if (scope) ctx.conversation.input.for(scope).notify('error', message);
  });
  ctx.effect(() => () => browserAddressAutocomplete.dispose(), 'opencu: composer address requests');
  const addresses = new Map();
  ctx.effect(() => () => { for (const address of addresses.values()) address.dispose(); addresses.clear(); }, 'opencu: composer address lifetimes');
  const addressFor = sessionId => {
    const scope = ctx.sessions.scope(sessionId);
    if (!scope) throw new Error('The conversation is no longer open');
    const input = ctx.conversation.input.for(scope);
    if (addresses.has(input)) return addresses.get(input);
    let captureInsertion;
    const address = createBrowserAddress({ sessionId, readInput: () => input.state.getSnapshot(),
      subscribeInput: listener => input.state.subscribe(listener), captureInsertion: () => captureInsertion(),
      insertReference: (reference, span) => input.insertReference(reference, span),
      replaceReference: (reference, guard) => {
        const state = input.state.getSnapshot(), selection = captureInsertion();
        if (state.phase !== 'plain' || state.draftRev !== guard.span.draftRev || selection.draftRev !== guard.selection.draftRev ||
          selection.start !== guard.selection.start || selection.end !== guard.selection.end ||
          !state.occurrences.some(item => item.source === guard.source && item.ref === guard.ref && item.occurrenceId === guard.occurrenceId)) return false;
        return input.updateReference(reference, guard.span);
      },
      chip: references.chip, focusReference: reference => host.service.focusReference(reference),
      notify: message => input.notify('error', message), getTabSnapshot: (session, tab) => browserTabs.getSnapshot(session, tab),
      subscribeTabs: listener => browserTabs.subscribe(listener),
    });
    address.bind = (element, root, portal, actions) => { captureInsertion = actions.captureInsertion; return address.connect(element, root, portal); };
    addresses.set(input, address);
    scope.effect(() => () => { address.dispose(); addresses.delete(input); }, 'opencu: session address suggestions');
    return address;
  };
  ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay', id: 'opencu.browser-address', inject: sessionId => {
      const address = addressFor(sessionId);
      return { hooks: { browserAddress: address.state }, connectBrowserAddress: address.bind,
        report: message => ctx.conversation.input.for(ctx.sessions.scope(sessionId)).notify('error', message) };
    },
  }, BrowserAddressSlot)), 'opencu: REA composer address suggestions');
  const uninstall = installReaServices({ browserAddressAutocomplete, browserHost: host.service, browserSettings, settings, downloads: downloads.service, browsingHistory: history.browsingHistory, browserAutocomplete: history.browserAutocomplete,
    files, sources, artifactDocuments, openIn: files.openIn, workspaceFiles: files.workspaceFiles, openSettings, settingsRoute,
    images: {
      open: (attachment, sessionId) => files.previewImage(attachment, sessionId),
      saveCopy: attachment => files.saveImageCopy(attachment),
      async add(attachment, sessionId) {
        const image = await client.request('image', { attachmentId: attachment.attachmentId });
        addImageDrafts(sessionId, [{ ...image, name: attachment.name }]);
      },
    },
    computerUseSettings: {
      getAppApprovals: () => Object.assign(client.request('appApprovals/read').then(value => value.approvals), { [Symbol.dispose]() {} }),
      removeAppApproval: bundleIdentifier => Object.assign(client.request('appApprovals/remove', { bundleIdentifier }).then(value => value.approvals), { [Symbol.dispose]() {} }),
      getPendingAppApprovals: conversationId => client.request('appApprovals/pending', { conversationId }).then(value => value.requests),
      respondAppApproval: createAppApprovalResponder({
        request: (_method, response) => appApprovalManager.respond(response),
        notify: (conversationId, message) => {
          const scope = ctx.sessions.scope(conversationId);
          if (scope) return ctx.conversation.input.for(scope).notify('error', message);
        },
      }),
    },
    clipboard: { writeText: text => navigator.clipboard.writeText(text) },
    notify(tone, message) {
      const scope = ctx.sessions.scope(ctx.sidebarRight.mounted.getSnapshot());
      if (scope) ctx.conversation.input.for(scope).notify(tone, message);
      else console.error('OpenCU settings', message);
    },
    capabilities: {
      prepareRecovery: () => client.request('recovery/prepare'),
      confirmRecovery: nonce => client.request('recovery/confirm', { nonce, confirmedClosed: true }),
      downloadExtension: signal => downloadExtensionZip(signal),
      async read() { return { ...await client.request('capabilities'), inAppBrowser: host.service.available, desktopAdapterError }; },
      configure: (key, enabled) => configureCapability(capabilitiesConfig, key, enabled),
      openConfiguration: () => openSettings('/settings/computer-use'),
      connectBrowser: (browser, signal) => client.request('connectBrowser', { browser, requestApproval: true }, signal),
      manageConnection: instanceId => client.request('browserSettings/open', { instanceId, section: 'connection' }),
      disconnectBrowser: instanceId => client.request('browserSettings/disconnect', { instanceId }),
      forgetBrowser: instanceId => client.request('browserSettings/forget', { instanceId }),
      async showExtensionFiles() {
        const { path } = await client.request('extensionFiles');
        if (typeof path !== 'string' || !path.trim() || /[\u0000-\u001f\u007f]/.test(path) ||
          !(path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path))) {
          throw new Error('DSH returned an invalid extension folder path.');
        }
        if (typeof desktop?.files !== 'function') return { path, revealed: false };
        try {
          const result = await desktop.files('reveal', { path });
          if (result?.success !== true) throw new Error('The desktop did not confirm revealing the extension folder.');
          return { path, revealed: true };
        } catch (error) {
          return { path, revealed: false, revealError: error?.message || 'Could not reveal the extension folder.' };
        }
      },
      installBrowser: () => client.request('browserResources/install'),
      openPermissionSettings: permission => client.request('openPermissionSettings', { permission }),
      requestPermission: permission => client.request('requestPermission', { permission }),
      revealPermissionHelper: () => client.request('revealPermissionHelper'),
    },
  });
  initializeRea();
  const presentation = createPresentationClient({ client, transport, desktop,
    dock: async sessionId => {
      if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) await ctx.uiWorkspace.openSession(sessionId);
      if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded();
    },
    notify: (sessionId, message) => {
      const scope = ctx.sessions.scope(sessionId ?? ctx.sidebarRight.mounted.getSnapshot());
      if (scope) ctx.conversation.input.for(scope).notify('error', message);
    },
  });
  ctx.effect(() => { presentation.start(); return () => presentation.dispose(); }, 'opencu: monitoring state');
  for (const [name, docked] of [['conversation.session.header.utilities', false], ['sidebar.right.accessory', true]]) {
    ctx.effect(() => ctx.slots.inject(name, () => ctx.slots.register({
      name, id: 'opencu.monitoring', order: 30,
      inject: sessionId => ({ docked, hooks: { presentation: presentation.state }, service: presentation.service,
        report: event => { void client.request('presentation/event', { ...event, rendererId: transport.rendererId })
          .catch(error => console.error('OpenCU monitor rendering', error)); },
      }),
    }, PresentationSlot)), `opencu: ${name} monitoring`);
  }
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'opencu.annotation-editor', inject: () => ({ hooks: { editor: referenceEditor.state },
      save: referenceEditor.save, remove: referenceEditor.remove, close: referenceEditor.close,
      report: message => {
        const scope = ctx.sessions.scope(referenceEditor.state.getSnapshot()?.sessionId);
        if (scope) ctx.conversation.input.for(scope).notify('error', message);
      },
    }),
  }, ReferenceEditorSlot)), 'opencu: REA composer annotation editor');
  if (host.pages) ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'opencu.hidden-browser', inject: () => ({ hooks: { pages: host.pages } }),
  }, HiddenBrowserSlot)), 'opencu: retained REA browser hosts');
  for (const key of ['computer_use', 'computer_use_reset', 'opencu_connectBrowser', 'opencu_state', 'opencu_targets', 'opencu_select', 'opencu_observe', 'opencu_act', 'opencu_stop', 'opencu_resume', 'opencu_deliveries', 'opencu_focus', 'opencu_openTarget', 'opencu_permissions', 'opencu_annotate']) ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key, inject: sessionId => ({ sessionId }),
  }, ToolSlot)), `opencu: ${key} result`);
  ctx.effect(() => () => settings.dispose(), 'opencu: persistent preferences');
  ctx.effect(() => {
    const style = document.createElement('style');
    style.textContent = guestPortalStyles;
    document.head.append(style);
    return () => style.remove();
  }, 'opencu: REA native guest portal geometry');
  ctx.effect(() => {
    const starting = host.service.available ? transport.start().then(() => host.start()) : Promise.resolve();
    starting.catch(error => console.error('OpenCU browser host startup', error));
    return async () => {
      transport.quiesce();
      await starting.catch(() => undefined);
      const failures = [];
      for (const dispose of [() => host.dispose(), () => downloads.dispose(), () => transport.dispose()]) {
        try { await dispose(); } catch (error) { failures.push(error); }
      }
      await artifactDocuments.dispose();
      uninstall();
      if (failures.length) throw new AggregateError(failures, 'OpenCU client cleanup failed');
    };
  }, 'opencu: real browser host');
  ctx.effect(() => ctx.locale.register('opencuBrowser', {
    zh: { title: '浏览器', description: '浏览网页', preferences: '浏览器偏好', capabilities: '电脑与浏览器', sources: '来源', unavailable: '当前网页没有内嵌浏览器所需的桌面适配，无法在此打开受控页面。\n请到「设置 → 电脑与浏览器」查看其他已配置的浏览器连接及其可用状态。' },
    en: { title: 'Browser', description: 'Browse the web', preferences: 'Browser preferences', capabilities: 'Computer and browsers', sources: 'Sources', unavailable: 'This web page has no desktop adapter for the embedded browser, so controlled pages cannot open here.\nCheck Settings → Computer and browsers for other configured browser connections and their availability.' },
  }), 'opencu: browser copy');
  const browserCopy = ctx.locale.bind('opencuBrowser');
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: 'opencu.sources', kind: 'opencu-sources', multiple: false,
    priority: 'extension', title: () => browserCopy('sources'),
    guide: [{ id: 'sources', order: 31, title: () => browserCopy('sources') }],
  }), 'opencu: source tab');
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: 'opencu.sources', inject: sessionId => ({ sessionId }),
  }, SourcesSlot)), 'opencu: REA sources body');
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'opencu-capabilities', order: 30, label: () => browserCopy('capabilities'),
  }, SettingsSlot)), 'opencu: computer and browser settings');
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: 'opencu.browser', kind: 'browser', multiple: true,
    keepMounted: true, priority: 'extension', title: () => browserCopy('title'),
    guide: [{ id: 'new', commandId: 'browser.new', order: 30, title: () => browserCopy('title'), description: () => browserCopy('description') }],
  }), 'opencu: browser presentation');
  if (desktop) ctx.inject(['documentPreviews'], previewCtx => {
    previewCtx.effect(() => previewCtx.documentPreviews.register({ id: 'opencu.document', extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'tsv', 'ipynb'],
      binaryExtensions: ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'tsv', 'ipynb'], priority: 'extension', title: () => 'OpenCU', loading: 'bytes-complete', wrap: false,
    }), 'opencu: REA document previews');
    previewCtx.effect(() => previewCtx.slots.inject('sidebar.right.tab.document', () => previewCtx.slots.register({
      name: 'sidebar.right.tab.document', key: 'opencu.document',
      inject: sessionId => ({ sessionId, ...paneActions(sessionId), async deliverDocument(payload) {
        const scope = ctx.sessions.scope(sessionId);
        if (!scope) throw new Error('The document conversation is no longer available');
        const reference = references.chip({ kind: 'document-annotations', payload }, `${payload.title} (${payload.comments.length})`);
        const result = await ctx.sessions.sessionOf(scope).prompt([{ type: 'text', text: references.serialize(reference.ref) }], 'queue');
        if (!result.ok) throw new Error(result.error.message);
      } }),
    }, DocumentSlot)), 'opencu: REA document body and comments');
    const id = 'opencu.image';
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'];
    previewCtx.effect(() => previewCtx.documentPreviews.register({ id, extensions,
      binaryExtensions: extensions, priority: 'extension',
      title: () => 'OpenCU', loading: 'bytes-complete', wrap: false,
    }), 'opencu: REA image preview');
    previewCtx.effect(() => previewCtx.slots.inject('sidebar.right.tab.document', () => previewCtx.slots.register({
      name: 'sidebar.right.tab.document', key: id,
      inject: sessionId => ({ sessionId, ...paneActions(sessionId), async deliverImage({ resourceAddress, title, data, mediaType, comments, prompt, maskSrc, markupSrc, markupDocument, signal }) {
        const scope = ctx.sessions.scope(sessionId);
        if (!scope) throw new Error('The image conversation is no longer available');
        signal?.throwIfAborted();
        const files = [new File([data], title, { type: mediaType })];
        if (markupSrc) {
          const response = await fetch(markupSrc, { signal });
          if (!response.ok) throw new Error('The image markup could not be read');
          files.push(new File([await response.blob()], title.replace(/\.[^.]+$/, '') + '-markup.png', { type: 'image/png' }));
        }
        if (maskSrc) {
          const response = await fetch(maskSrc, { signal });
          if (!response.ok) throw new Error('The image selection mask could not be read');
          files.push(new File([await response.blob()], 'mask.png', { type: 'image/png' }));
        }
        const input = ctx.conversation.input.for(scope), state = input.state.getSnapshot();
        if (state.phase !== 'plain') throw new Error('The message draft is busy; image comments remain saved');
        signal?.throwIfAborted();
        const ref = references.chip({ kind: 'image-annotations', payload: { resourceAddress, sessionId, title, comments, prompt, ...(markupDocument ? { markupDocument, imageOrder: ['original', 'markup'] } : {}) } }, `${title} (${markupDocument ? markupDocument.objects.length : comments.length})`);
        const drafts = ctx.conversation.createDrafts(sessionId, files);
        const end = state.draft.length - state.occurrences.reduce((size, item) => size + item.length - 1, 0);
        if (!input.insertReference(ref, { start: end, end, draftRev: state.draftRev }) || !input.addAttachments(drafts.map(draft => draft.id))) {
          for (const draft of drafts) ctx.conversation.releaseDraftAttachment(draft.id);
          throw new Error('The message draft changed; image comments remain saved');
        }
        input.focus();
      } }),
    }, ImageSlot)), 'opencu: REA image body');
  });
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: 'opencu.browser', inject: sessionId => ({ sessionId }),
  }, BrowserTitleSlot)), 'opencu: REA browser title and activity');
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: 'opencu.browser',
    inject: sessionId => ({ sessionId, mountTab: host.mountTab, updateBounds: host.updateBounds,
      browserAvailable: host.service.available, browserUnavailableMessage: browserCopy('unavailable') }),
  }, BrowserSlot)), 'opencu: REA browser body');
}
