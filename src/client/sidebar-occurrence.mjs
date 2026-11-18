// Stock DSH closes synchronously without a result. Patched hosts can defer
// or veto. Only an accepted close or the disappearance of this tab is proof.
export async function closeSidebarTab(sidebar, sessionId, tabId) {
  const present = () => sidebar.tabsIn(sessionId).some(tab => tab.id === tabId);
  if (!present()) return true;
  const receipt = await sidebar.closeIn(sessionId, tabId);
  if (receipt === true || !present()) return true;
  throw Object.assign(new Error('The sidebar tab is still open'), { code: 'TAB_CLOSE_REFUSED' });
}
