import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

const buildRequire = createRequire(process.env.OPENCU_TEST_ESBUILD_ROOT ? resolve(process.env.OPENCU_TEST_ESBUILD_ROOT, 'package.json') : import.meta.url);
if (buildRequire('esbuild/package.json').version !== '0.25.12') throw Error('Expected the project-pinned esbuild 0.25.12');
const { transformSync } = buildRequire('esbuild');

export const hostSource = () => readFileSync(new URL('../../host/extensions.ts', import.meta.url), 'utf8');
export function extensionFixture(source = hostSource(), count = 6) {
  const root = mkdtempSync(join(tmpdir(), 'opencu-extension-state-'));
  writeFileSync(join(root, 'opencu-extensions.json'), JSON.stringify({ paths: [], pinned: [], recent: [] }));
  const state = { extensions: Array.from({ length: count }, (_, n) => ({ id: `extension-${n}`, name: `Extension ${n}`, version: '1.0',
    path: `/synthetic/extensions/${n}`, manifest: { icons: { 32: 'icon.png' } } })), actions: [], calls: [], encodes: 0, generation: 1,
    empty: new Set(), failed: new Set(), unavailable: false };
  state.actions = state.extensions.map(e => ({ id: e.id, title: e.name, enabled: true }));
  const window = { isDestroyed: () => state.unavailable };
  const owner = { isDestroyed: () => state.unavailable, send() {} };
  const session = { storagePath: root, extensions: { getAllExtensions: () => state.extensions,
    loadExtension: () => { throw Error('No extension installation is allowed in this fixture'); } } };
  const guest = Object.assign(new EventEmitter(), { id: 73, session, isDestroyed: () => state.unavailable });
  const electron = { BrowserWindow: { fromWebContents: () => window }, dialog: {}, Menu: {}, nativeImage: {
    createFromPath(path) { state.calls.push(path); if (state.failed.has(path)) throw Error('synthetic image failure');
      return { isEmpty: () => state.empty.has(path), toDataURL: () => { state.encodes++; return `data:image/png;base64,fixture-${state.generation}-${path}`; } }; },
  } };
  class Extensions extends EventEmitter {
    constructor() { super(); this.api = { browserAction: { getState: () => ({ actions: state.actions }), activate() {} } }; }
    addTab() {} selectTab() {}
  }
  const dependencies = createRequire(import.meta.url);
  const require = name => name === 'electron' ? electron : name === 'electron-chrome-extensions' ? { ElectronChromeExtensions: Extensions }
    : ['node:fs/promises', 'node:path', 'node:crypto'].includes(name) ? dependencies(name) : (() => { throw Error(`Unexpected fixture dependency: ${name}`); })();
  try {
    const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }), module = { exports: {} };
    new Function('require', 'module', 'exports', code)(require, module, module.exports);
    module.exports.prepareOpenCUExtensions(session);
    module.exports.attachOpenCUExtensionGuest(owner, guest);
    return { state, owner, guest, sourceSha256: createHash('sha256').update(source).digest('hex'),
      read: (sender = owner) => module.exports.operateOpenCUExtensions(sender, guest, 'state', {}),
      close: async () => { try { await module.exports.operateOpenCUExtensions(owner, guest, 'state', {}); } catch {} guest.emit('destroyed'); rmSync(root, { recursive: true, force: true }); } };
  } catch (error) { rmSync(root, { recursive: true, force: true }); throw error; }
}
