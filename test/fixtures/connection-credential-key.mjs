// Credential persistence is an in-memory synthetic boundary in these tests.
// Connection's signing, cookie verification and admission run unmodified.
export const credentialKey = (namespace, name) => `${namespace}:${name}`;
