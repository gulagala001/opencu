import { lazyGrammars } from './build-rea-assets.mjs';
import { dependencyRequire } from './dependencies.mjs';
import { cursorModules } from './cursor-modules.mjs';
import { optimizeBase64 } from './base64-transform.mjs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = dependencyRequire();
const { build } = require('esbuild');
const { parse } = require('acorn');
const lazyModules = new Set(JSON.parse(await readFile(resolve(root, 'src/client/rea/lazy-modules.json'), 'utf8')));
const resources = new Set(JSON.parse(await readFile(resolve(root, 'lib/rea-assets/manifest.json'), 'utf8')).map(record => record.file));
const decoderCounts = { 'app-initial-c468e3fd7f91.js': 5, 'wasm-7a831618ae1c.js': 1 };
const decoderTransforms = new Map();
const preloadTransforms = new Map();
let preloadTransformBytes = 0;
function bundlePreloads(source) {
  const key = source.includes('import.meta.url') ? createHash('sha256').update(source).digest('hex') : null;
  if (key && preloadTransforms.has(key)) return preloadTransforms.get(key);
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.arguments.length === 3 &&
      source.slice(node.arguments[2].start, node.arguments[2].end) === 'import.meta.url' &&
      ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.arguments[0].type)) {
      const callback = node.arguments[0];
      edits.push([node.start, callback.start, '('], [callback.end, node.end, ')()']);
      visit(callback); return;
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  }
  visit(ast);
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + text + source.slice(end);
  if (key && source.length * 2 <= 32 * 1024 * 1024) {
    while (preloadTransformBytes + source.length * 2 > 32 * 1024 * 1024) {
      const oldest = preloadTransforms.keys().next().value;
      preloadTransformBytes -= preloadTransforms.get(oldest).length * 2; preloadTransforms.delete(oldest);
    }
    preloadTransforms.set(key, source); preloadTransformBytes += source.length * 2;
  }
  return source;
}
const manifest = JSON.parse(await readFile(resolve(root, 'vendor/build-inputs/rea/manifest.json'), 'utf8'));
const originals = new Map(manifest.records.map(record => [basename(record.source), record]));
const closure = JSON.parse(await readFile(resolve(root, 'src/client/rea/provenance.json'), 'utf8'));
const prefixes = new Set(closure.map(record => record.file.replace(/-[a-f0-9]+\.js$/, '-')));
const cssFiles = [...originals.keys()].filter(file => file.endsWith('.css') && [...prefixes].some(prefix => file.startsWith(prefix)));
// Markup canvases need their original overlay sizing, including on Retina displays.
// Require this lazy component's CSS explicitly so a missing vendor entry fails the build.
const styleFiles = [...new Set(['app-shared-9a94b907ed47.css', 'app-initial-99e8b4b455fa.css', 'app-primary-6a01c6b721a4.css', 'sketch-6b4d12fa567e.css', ...cssFiles])];
const styles = await Promise.all(styleFiles.map(async file => {
  const record = originals.get(file);
  if (!record) throw new Error(`Missing vendored REA style: ${file}`);
  const source = await readFile(resolve(root, record.vendor), 'utf8');
  if (createHash('sha256').update(source).digest('hex') !== record.sha256) throw new Error(`REA style changed: ${file}`);
  return source;
}));
await mkdir(resolve(root, 'lib'), { recursive: true });
const pageRuntime = await build({
  absWorkingDir: root, entryPoints: ['src/client/page-annotations.mjs'], bundle: true, write: false,
  format: 'iife', globalName: 'OpenCUPageAnnotations', platform: 'browser', target: 'es2022',
  minify: true, keepNames: true,
  nodePaths: [resolve(root, '.local/frontend-deps/node_modules')],
});
await writeFile(resolve(root, 'src/client/page-annotations-source.mjs'), `export default ${JSON.stringify(pageRuntime.outputFiles[0].text)};\n`);
// REA establishes layer order in its HTML before any dependency CSS loads.
const htmlRecord = originals.get('index.html');
const html = await readFile(resolve(root, htmlRecord.vendor), 'utf8');
if (createHash('sha256').update(html).digest('hex') !== htmlRecord.sha256) throw new Error('REA HTML changed');
const layerOrder = html.match(/@layer\s+theme,\s*base,\s*components,\s*utilities;/)?.[0];
if (!layerOrder) throw new Error('Missing REA stylesheet layer order');
// Only the document mount changes: selectors, tokens, and component rules remain REA's.
const sharedRecord = originals.get('app-shared-2f2228189a8d.js');
const sharedSource = await readFile(resolve(root, sharedRecord.vendor), 'utf8');
if (createHash('sha256').update(sharedSource).digest('hex') !== sharedRecord.sha256) throw new Error('REA notification source changed');
const toastStyle = sharedSource.match(/pFt\((`[^`]+`)\)/)?.[1];
if (!toastStyle) throw new Error('Missing original REA notification styles');
const toastCSS = parse(`const css=${toastStyle}`, { ecmaVersion: 'latest' }).body[0].declarations[0].init.quasis[0].value.cooked;
const originalStyles = `${layerOrder}\n${styles.join('\n')}\n${toastCSS}`;
// Chromium does not register @property inside a shadow tree. Preserve the original
// non-inheriting initial values locally rather than registering globals in DSH.
const propertyDefaults = new Map();
for (const [, name, body] of originalStyles.matchAll(/@property\s+(--[\w-]+)\s*\{([^{}]*)\}/g)) {
  if (!/inherits\s*:\s*false/.test(body)) continue;
  const initial = body.match(/initial-value\s*:\s*([^;]+)/)?.[1]?.trim();
  // Registered <length> zero computes to pixels before use in calc().
  propertyDefaults.set(name, initial === '0' && /syntax\s*:\s*"<length>"/.test(body) ? '0px' : initial ?? 'initial');
}
const isolatedStyles = `@layer properties;\n${originalStyles.replace(/:root\b/g, '[data-rea-root]')}` +
  `\n@layer properties { :where(*,::before,::after) { ${[...propertyDefaults].map(([name, value]) => `${name}:${value}`).join(';')} } }`;
await writeFile(resolve(root, 'src/client/rea-styles.css'), isolatedStyles);
const cursorTokens = ['--blue-300', '--app-color-accent-blue'].map(name => {
  const declaration = originalStyles.match(new RegExp(`${name}\\s*:[^;}]+`))?.[0];
  if (!declaration) throw new Error(`Missing original REA cursor color: ${name}`);
  return declaration;
});
await writeFile(resolve(root, 'src/client/cursor-styles.css'), `[data-rea-root]{${cursorTokens.join(';')}}\n`);
const clientOptions = {
  absWorkingDir: root, entryPoints: ['src/client/index.jsx'], outfile: 'lib/client.js', bundle: true, format: 'cjs', banner: { js: 'window.__ModuleLoader__.load({id:"opencu",factory:(require)=>{var module={exports:{}};var exports=module.exports;' }, footer: { js: 'return module.exports;}});' }, platform: 'browser', target: 'es2022', jsx: 'automatic', minifySyntax: true, minifyIdentifiers: true, minifyWhitespace: true, keepNames: true,
  nodePaths: [resolve(root, '.local/frontend-deps/node_modules')], external: ['react-host'], loader: { '.css': 'text', '.svg': 'dataurl', '.png': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': 'document.baseURI', 'import.meta.resolve': 'undefined' },
  plugins: [{ name: 'dsh-host-react', setup(build) {
    build.onLoad({ filter: /\/src\/client\/rea\/.*\.js$/ }, async args => {
      let contents = await readFile(args.path, 'utf8');
      const file = basename(args.path);
      if (Object.hasOwn(decoderCounts, file)) {
        const key = createHash('sha256').update(contents).digest('hex');
        if (decoderTransforms.get(file)?.key !== key) decoderTransforms.set(file, { key, contents: optimizeBase64(contents, decoderCounts[file]) });
        contents = decoderTransforms.get(file).contents;
      }
      const references = [...contents.matchAll(/new URL\(`([^`]+)`\s*,\s*import\.meta\.url\)\.href/g)];
      for (const [expression, file] of references) {
        if (file.startsWith('runtime.worker-') || file === 'pdf.worker.min-46513d3652c6.mjs') {
          if (!resources.has(file)) throw new Error(`Missing served REA worker: ${file}`);
          contents = contents.replace(expression, `new URL(${JSON.stringify(`/api/opencu/rea-assets/${file}`)}, document.baseURI).href`);
          continue;
        }
        const data = await readFile(resolve(root, 'vendor/build-inputs/rea/assets', file));
        const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : file.endsWith('.avif') ? 'image/avif' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
        contents = contents.replace(expression, JSON.stringify(`data:${type};base64,${data.toString('base64')}`));
      }
      // esbuild owns the bundled lazy resources and CSS; Vite's deployment-relative
      // preload URLs are not valid inside DSH's module factory.
      contents = bundlePreloads(contents);
      if (basename(args.path) === 'walnut-reader-a850015a2722.js') contents = contents.replaceAll('import.meta.url', 'new URL("/api/opencu/rea-assets/walnut-reader-a850015a2722.js", document.baseURI).href');
      return { contents, loader: 'js' };
    });
    build.onResolve({ filter: /^react-host$/ }, () => build.initialOptions.format === 'cjs'
      ? { path: 'react', external: true } : { path: require.resolve('react') });
    build.onResolve({ filter: /^(react|react-dom|react-compiler-runtime)(\/|$)/ }, args => ({ path: require.resolve(args.path) }));
    build.onResolve({ filter: /^\.\// }, args => {
      if (args.kind !== 'dynamic-import') return;
      const file = basename(args.path);
      if (build.initialOptions.format === 'cjs' && lazyGrammars.has(file)) return { path: `/api/opencu/rea-assets/${file}`, external: true };
      if (!lazyModules.has(file)) return { path: args.path, external: true };
    });
  } }],
  logLevel: 'info', metafile: true,
};
const result = await build({ ...clientOptions, write: false });
const clientBundle = result.outputFiles[0].text;
await writeFile(resolve(root, 'lib/client.js'), clientBundle);
const factory = clientBundle.slice(clientOptions.banner.js.length).trimEnd();
if (!factory.endsWith(clientOptions.footer.js)) throw new Error('Unexpected OpenCU client wrapper');
await writeFile(resolve(root, 'lib/client.factory.mjs'), `export function createOpenCU(require) {\nvar module={exports:{}};var exports=module.exports;\n${factory.slice(0, -clientOptions.footer.js.length)}\nreturn module.exports;\n}\n`);
await build({ ...clientOptions, entryPoints: ['src/client/browser-surface.jsx'], outfile: 'lib/browser-surface.js', format: 'iife', banner: {}, footer: {} });
await writeFile(resolve(root, 'lib/browser-surface.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="browser-surface.js"></script></body></html>\n');
await build({ ...clientOptions, entryPoints: ['src/client/presentation.jsx'], outfile: 'lib/presentation.js', format: 'iife', banner: {}, footer: {} });
await build({ ...clientOptions, entryPoints: ['src/client/page-cursor.mjs'], outfile: 'lib/page-cursor.js', format: 'iife', banner: {}, footer: {}, minify: true, keepNames: false, plugins: [await cursorModules(root), ...clientOptions.plugins] });
await writeFile(resolve(root, 'extension/page-cursor.js'), await readFile(resolve(root, 'lib/page-cursor.js')));
await writeFile(resolve(root, 'lib/cursor.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'unsafe-inline\'; img-src data: blob:;"></head><body style="margin:0;background:transparent"><script src="page-cursor.js"></script></body></html>\n');
await writeFile(resolve(root, 'lib/presentation.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src data: blob:; media-src blob:; worker-src data: blob:"></head><body><div id="root"></div><script src="presentation.js"></script></body></html>\n');
// Reused dependency stores must not expose the builder's private checkout path.
const publicPath = path => path.replace(/^.*?\/node_modules\//, 'node_modules/');
const publicMetadata = value => Array.isArray(value) ? value.map(publicMetadata)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [publicPath(key), publicMetadata(item)]))
  : typeof value === 'string' ? publicPath(value) : value;
await writeFile(resolve(root, 'src/client/build-meta.json'), JSON.stringify(publicMetadata({ inputs: Object.keys(result.metafile.inputs), outputs: result.metafile.outputs }), null, 2));
console.log('OpenCU client bundle built; product UI acceptance is separate');
