import {mkdtemp, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const rootPath = fileURLToPath(new URL('../../', import.meta.url));
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {isolateTestDownloads} from './computer-use/test-browser.mjs';

// Component-only fixtures cannot start a Native host or write OS registration.
export async function frontendComponents(t, viewport = {width: 1000, height: 800}, {hasTouch=false}={}) {
  const root = await mkdtemp(join(tmpdir(), 'opencu-component-ui-'));
  const server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end('<!doctype html><html lang="zh-CN"><div id="root"></div></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await isolateTestDownloads(root, join(root, 'profile'));
  const context = await chromium.launchPersistentContext(join(root, 'profile'), {
    executablePath: process.env.TRISOUL_CU_TEST_BROWSER_EXECUTABLE || chromium.executablePath(),
    viewport, hasTouch, args: ['--use-mock-keychain', '--password-store=basic'],
    downloadsPath: join(root, 'downloads'),
  });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const evidence = process.env.OPENCU_FRONTEND_EVIDENCE;
  const name = t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 90);
  const output = evidence && join(evidence, name);
  if (output) await mkdir(output, {recursive: true});
  t.after(async () => {
    if (output) await page.screenshot({path: join(output, 'final.png')}).catch(() => {});
    await context.close();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await rm(root, {recursive: true, force: true});
    if (output) await writeFile(join(output, 'cleanup.json'), JSON.stringify({scope: 'frontend components with synthetic transport; no DSH/Native/extension installation', rootRemoved: true, errors}, null, 2));
  });
  return {page, context, root, errors, output};
}

// These fixtures render owned OpenCU controls without booting DSH's unrelated
// Markdown and icon modules. Use the reviewed native positioning hooks.
export async function componentHostPrimitives() {
  const { extractStandalonePrimitiveHooks } = await import('../../scripts/standalone-primitive-hooks.mjs');
  const hooks = await extractStandalonePrimitiveHooks();
  return { name: 'component-host-primitives', setup(builder) {
    builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'host-primitives', namespace: 'component-host' }));
    builder.onLoad({ filter: /.*/, namespace: 'component-host' }, () => ({
      contents: hooks.contents + '\nexport const MarkdownDelegateProvider = ({ children }) => children;\n',
      loader: 'js', resolveDir: rootPath,
    }));
  } };
}
