// Diagnostic preload for the unchanged cold-navigation regression.
// Only fresh, blank targets are affected. Never retry a destination URL.
import assert from 'node:assert/strict';
import { BrowserHost } from '../../../src/computer-use/browser.mjs';

const mode = process.env.CU_STARTUP_PROBE || 'baseline';
assert.ok(['baseline', 'stop-blank', 'commit-blank'].includes(mode));
if (mode !== 'baseline') {
  const bind = BrowserHost.prototype.bind;
  BrowserHost.prototype.bind = async function (...args) {
    const record = await bind.apply(this, args);
    const page = record.page, goto = page.goto.bind(page);
    let first = true;
    page.goto = async (...request) => {
      if (first) {
        first = false;
        assert.equal(page.url(), 'about:blank', 'only a newly created empty target may use this barrier');
        if (mode === 'stop-blank') await record.cdp.send('Page.stopLoading');
        else await goto('about:blank', { waitUntil: 'load' });
      }
      return goto(...request);
    };
    return record;
  };
}
console.log('Cold navigation probe:', mode);
