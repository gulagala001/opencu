import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

// Only for fresh disposable test profiles. Production browser profiles retain
// OS-backed credential storage and sandboxing stay unchanged in production.
// Disposable Linux CI fixtures use the same launch policy as Playwright.
export async function testBrowserExecutable(directory, executable = chromium.executablePath()) {
  const flags = process.platform === 'darwin' ? ['--use-mock-keychain', '--password-store=basic'] : process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [];
  if (!flags.length) return executable;
  const wrapper = join(directory, 'isolated-test-browser');
  const quoted = "'" + executable.replaceAll("'", "'\\''") + "'";
  await writeFile(wrapper, '#!/bin/sh\nexec ' + quoted + ' ' + flags.join(' ') + ' "$@"\n', { mode: 0o700 });
  return wrapper;
}
