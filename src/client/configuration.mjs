/** Routes one settings surface to the active standalone or bundled owner. */
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
