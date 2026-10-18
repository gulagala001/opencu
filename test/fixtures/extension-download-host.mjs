// All physical runtime/store boundaries are synthetic. shared's registration,
// the distribution reader and official Connection/auth/HTTP bridge stay real.
export const createPluginRuntime = () => ({ dataDir: '/synthetic-secrets-not-an-input', close: async () => {} });
export const installToolDefinitions = () => {};
export const publicConfig = value => value;
export const createComputerSession = () => { throw new Error('No session operation expected'); };
export const createActivityFeed = () => ({ close() {}, sessionEvent() {}, forget() {} });
export const createBrowserHost = () => ({ backend: {}, close() {} });
const store = () => ({ close: async () => {} });
export const createPresentationHost = store, createPreferences = store, createBrowserHistory = store;
