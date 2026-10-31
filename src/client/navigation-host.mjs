/** REA links use the owning DSH conversation and its current browser preference. */
export function createNavigationHost({ settings, browser, currentSession, openExternal }) {
  let disposed = false;
  const live = () => { if (disposed) throw new Error('The browser navigation host is closed'); };
  return {
    async open(args) {
      live();
      const url = new URL(args.href ?? args.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported browser URL');
      // Capture ownership before reading settings; switching chats must not move the action.
      const conversationId = args.conversationId ?? currentSession();
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
      const preferences = (await settings.readAll()).values;
      live();
      const destination = args.useExternalBrowser ? 'external-browser' : args.openTarget
        ?? preferences[local ? 'open-local-url-in-target-preference' : 'open-link-in-target-preference'];
      if (destination === 'external-browser' || browser.available !== true) {
        await openExternal(url.href);
        return true;
      }
      if (!conversationId) throw new Error('Open a conversation before opening its browser');
      const tab = await browser.newTab({ conversationId, url: url.href,
        active: args.disposition !== 'background-tab' });
      live();
      if (args.presentationIntent === 'new-window') await browser.detachTab(tab);
      return true;
    },
    dispose() { disposed = true; },
  };
}
