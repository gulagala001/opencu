// Keep selector results in document order. Discover open shadow roots on insertion,
// so text, scroll and resize updates never need to walk the entire conversation.
export function observeLayoutTargets(selector, { shadowHosts = '*', attributes, changed }) {
  const roots = new Map(), pendingHosts = new Set();
  let cached;
  const matchesWithin = (node, query) => node.matches(query) || (node.firstElementChild && node.querySelector(query));

  function checkHost(node) {
    if (node.shadowRoot) { pendingHosts.delete(node); watch(node.shadowRoot); }
    else if (shadowHosts !== '*') pendingHosts.add(node);
  }

  function discover(node) {
    if (node.nodeType === 1 && node.matches(shadowHosts)) checkHost(node);
    if (node.firstElementChild) {
      for (const child of node.querySelectorAll(shadowHosts)) checkHost(child);
    }
  }

  function watch(root) {
    if (roots.has(root)) return;
    const observer = new MutationObserver(records => {
      let removed = false;
      for (const record of records) {
        const { target } = record;
        if (target.nodeType === 1 && (target.shadowRoot || shadowHosts !== '*') && target.matches(shadowHosts)) checkHost(target);
        if (record.type === 'attributes') {
          if (attributes.includes(record.attributeName)) cached = undefined;
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (cached && matchesWithin(node, selector)) cached = undefined;
          discover(node);
        }
        for (const node of record.removedNodes) {
          if (node.nodeType !== 1) continue;
          removed = true;
          if (cached && matchesWithin(node, selector)) cached = undefined;
        }
      }
      if (removed || shadowHosts !== '*' && records.some(record => record.type === 'attributes' && attributes.includes(record.attributeName))) {
        for (const host of pendingHosts) if (!host.isConnected || !host.matches(shadowHosts)) pendingHosts.delete(host);
        if (cached?.some(element => !element.isConnected || !roots.has(element.getRootNode()))) cached = undefined;
        for (const [scope, subscription] of roots) if (scope.host && (!scope.host.isConnected || !scope.host.matches(shadowHosts) || !roots.has(scope.host.getRootNode()))) {
          subscription.disconnect(); roots.delete(scope); cached = undefined;
        }
      }
      changed?.();
    });
    roots.set(root, observer); cached = undefined;
    observer.observe(root, { childList: true, subtree: true, attributes: true,
      attributeFilter: changed ? [...attributes, 'style', 'class', 'hidden', 'aria-hidden', 'data-state'] : attributes });
    discover(root);
  }

  function collect(root, result) {
    result.push(...root.querySelectorAll(selector));
    const children = [...roots.keys()].filter(scope => scope.host?.getRootNode() === root);
    children.sort((a, b) => a.host.compareDocumentPosition(b.host) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    for (const child of children) collect(child, result);
    return result;
  }

  watch(document);
  return {
    elements() {
      // A portal host may be mounted before its open shadow root is attached.
      for (const host of pendingHosts) if (host.shadowRoot) checkHost(host);
      return cached ??= collect(document, []);
    },
    dispose() { for (const observer of roots.values()) observer.disconnect(); roots.clear(); pendingHosts.clear(); cached = undefined; },
  };
}
