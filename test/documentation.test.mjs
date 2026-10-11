import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { marked } from 'marked';
import { Parser } from 'htmlparser2';

const names = ['README', 'docs/README', 'docs/usage', 'docs/showcase', 'docs/integration', 'docs/windows', 'docs/development'];
const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const urls = text => [...new Set([...text.matchAll(/https:\/\/github.com\/gulagala001\/opencu\/releases\/download\/[^\s)"<>]+/g)].map(match => match[0]))].sort();

test('Chinese and English guides preserve the same public installation assets and screenshots', async () => {
  for (const name of names) {
    const zh = await read(`${name}.md`), en = await read(`${name}_EN.md`);
    assert.ok(zh.length > 100 && en.length > 100, name);
    assert.deepEqual(urls(zh), urls(en), `${name}: release assets match`);
    const images = text => [...new Set([...text.matchAll(/(?:docs\/)?images\/[\w.-]+\.(?:png|jpg|svg)/g)].map(match => match[0]))].sort();
    assert.deepEqual(images(zh), images(en), `${name}: real screenshots match`);
  }
  for (const file of ['README.md', 'README_EN.md']) {
    const text = await read(file);
    for (const tag of ['v1.3.0', 'v1.3.0-dsh.0.2.0-rc.2']) {
      assert.ok(text.includes(`https://github.com/gulagala001/opencu/releases/download/${tag}/opencu-1.3.0.tgz`));
    }
    assert.match(text, /未发布|unpublished/i);
    assert.ok(!text.includes('/releases/download/v1.6.1/'), 'local builds have no public download URL');
  }
});

const parsed = new Map();
async function page(file) {
  if (parsed.has(file)) return parsed.get(file);
  const ids = new Set(), links = [], headings = new Map();
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const inline = this.parser.parseInline(tokens);
    let text = '';
    const parser = new Parser({ ontext: value => { text += value; } }); parser.end(inline);
    const slug = text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
    const count = headings.get(slug) ?? 0; headings.set(slug, count + 1);
    return `<h${depth} id="${slug}${count ? '-' + count : ''}">${inline}</h${depth}>`;
  };
  const html = marked.parse(await read(file), { renderer });
  const parser = new Parser({ onopentag(name, attributes) {
    if (attributes.id) ids.add(attributes.id);
    if (name === 'a' && attributes.href) links.push(attributes.href);
    if (name === 'img' && attributes.src) links.push(attributes.src);
  } }); parser.end(html);
  const value = { ids, links }; parsed.set(file, value); return value;
}

test('all primary guide links resolve without private material or local machine paths', async () => {
  const missing = [];
  for (const file of names.flatMap(name => [`${name}.md`, `${name}_EN.md`])) {
    for (const target of (await page(file)).links) {
      assert.ok(!/^(?:file:|\/Users\/|\/private\/|javascript:)/i.test(target), `${file}: ${target}`);
      if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) continue;
      const destination = new URL(target, new URL(file, root));
      assert.ok(destination.href.startsWith(root.href), `${file}: link must remain in the project`);
      assert.ok(!/\/(?:AGENTS\.md|work\/|data\/|COMPUTER_USE_HANDOFF\.md)/.test(destination.pathname), `${file}: private link`);
      try {
        await access(destination);
        const relative = decodeURIComponent(destination.pathname.slice(root.pathname.length));
        if (destination.hash && relative.endsWith('.md') && !(await page(relative)).ids.has(decodeURIComponent(destination.hash.slice(1)))) missing.push(`${file} -> ${target}`);
      } catch { missing.push(`${file} -> ${target}`); }
    }
  }
  assert.deepEqual(missing, []);
});
