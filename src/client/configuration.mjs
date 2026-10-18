/** Routes one settings surface to the active standalone or bundled owner. */
export async function configureCapability(form, key, enabled) {
  if (!['browserEnabled', 'nativeEnabled', 'extensionEnabled', 'managedHeadless'].includes(key)) throw new Error('Unknown computer capability');
  if (typeof enabled !== 'boolean') throw new TypeError('Computer capability setting must be a boolean');
  if (!await form.set(key, enabled)) throw new Error('The host did not accept the capability setting; reload settings and retry');
}

export function sharedConfigForm(forms, namespaces) {
  const mirror = forms.describe();
  const current = () => {
    const served = new Set(mirror.getSnapshot().view?.namespaces.map(row => row.ns) ?? []);
    return forms.get(namespaces.find(namespace => served.has(namespace)) ?? namespaces[0]);
  };
  return {
    getSnapshot: () => current().getSnapshot(),
    set: (key, value) => current().set(key, value),
    subscribe(listener) {
      const subscriptions = namespaces.map(namespace => forms.get(namespace).subscribe(listener));
      subscriptions.push(mirror.subscribe(listener));
      return () => subscriptions.forEach(unsubscribe => unsubscribe());
    },
  };
}
