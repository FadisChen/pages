// Service worker: the precache list covers every game file, lists nothing that does not exist, and uses its own
// cache namespace (PLAN 2.1). Run with: node --test tests/*.test.mjs   (from lifelottery/)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePreload, currentBlock, withBlock, ROOT as TOOL_ROOT } from '../tools/build-preload.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/^\s*'([^']+)',\s*$/gm)].map((m) => m[1]).filter((p) => p !== './');

const walk = (dir, out = []) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else out.push(path.relative(ROOT, p).split(path.sep).join('/'));
  }
  return out;
};

test('sw.js precaches every game file and only existing files', () => {
  const game = [
    ...walk(path.join(ROOT, 'js')).filter((p) => p.endsWith('.js')),
    ...walk(path.join(ROOT, 'css')),
    ...walk(path.join(ROOT, 'icons')),
    'index.html', 'icon.svg', 'manifest.webmanifest',
  ];
  const missing = game.filter((p) => !listed.includes(p));
  assert.deepEqual(missing, [], `not precached: ${missing.join(', ')}`);
  for (const p of listed) assert.ok(fs.existsSync(path.join(ROOT, p)), `precache lists a missing file: ${p}`);
  assert.equal(new Set(listed).size, listed.length, 'duplicate precache entries');
  assert.ok(!listed.some((p) => /^(tests|tools)\//.test(p) || p.startsWith('..')), 'no tests / tools / outside files');
});

test('sw.js cache namespace and version', () => {
  assert.match(sw, /CACHE_PREFIX = 'lifelottery-'/);
  assert.match(sw, /startsWith\(CACHE_PREFIX\)/);
  const v = sw.match(/CACHE_VERSION = 'v(\d+)'/);
  assert.ok(v && Number(v[1]) >= 2, 'the cache version was bumped after the Phase 3A changes');
  assert.ok(!/\.\.\//.test(sw), 'no reference outside lifelottery/');
});

// ---- modulepreload (Phase 5E): index.html lists every module, and the list is current ------------------------------------

test('index.html modulepreload list matches the module graph (run: node tools/build-preload.mjs)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.equal(TOOL_ROOT, ROOT);
  const graph = computePreload();
  const block = currentBlock(html);
  assert.ok(block && block.length, 'index.html has the preload block between its markers');
  const listedHrefs = block.map((b) => b.href);
  assert.deepEqual([...listedHrefs].sort(), [...graph.all].sort(), 'the preload list is stale: run  node tools/build-preload.mjs');
  assert.equal(withBlock(html, graph), html, 'the block is not what the tool generates: run  node tools/build-preload.mjs');
  assert.equal(new Set(listedHrefs).size, listedHrefs.length, 'no duplicates');

  // every module of the game is in it (nothing is dead code), and only modules inside lifelottery/
  const modules = walk(path.join(ROOT, 'js')).filter((p) => p.endsWith('.js') && p !== 'js/theme-init.js');
  const missing = modules.filter((p) => !listedHrefs.includes(p));
  assert.deepEqual(missing, [], `modules that nothing imports or preloads: ${missing.join(', ')}`);
  for (const h of listedHrefs) {
    assert.ok(!h.startsWith('.') && !h.startsWith('/') && !/^https?:/.test(h), `relative path inside lifelottery/: ${h}`);
    assert.ok(fs.existsSync(path.join(ROOT, h)), `listed module exists: ${h}`);
  }
  // js/theme-init.js is a classic script, never a modulepreload
  assert.ok(!listedHrefs.includes('js/theme-init.js'));
});

test('the landing screen does not pull in the engine or the event texts', () => {
  const { firstPaint } = computePreload();
  const heavy = firstPaint.filter((p) => /^js\/(engine\/|data\/(events\/|yearly|names|religion|geo|money|worldmap|causes|conditions|riskref))/.test(p));
  assert.deepEqual(heavy, [], `first-paint modules must not import the engine or event data: ${heavy.join(', ')}`);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const block = currentBlock(html);
  // the first-paint links are plain; the heavy ones wait in the inert template
  for (const b of block) assert.equal(b.later, !firstPaint.includes(b.href), `${b.href} is in the right group`);
  assert.match(html, /<template id="preload-later">/);
});

test('sw.js bumps its version and index.html carries the share-preview meta', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const meta = (key, attr = 'property') => (html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`)) || [])[1];
  assert.equal(meta('og:type'), 'website');
  assert.equal(meta('og:locale'), 'zh_TW');
  assert.equal(meta('og:site_name'), '人生籤 Life Lottery');
  assert.match(meta('og:title'), /人生籤/);
  assert.ok(meta('og:description').length > 20 && /[一-鿿]/.test(meta('og:description')));
  assert.equal(meta('og:image:width'), '1200');
  assert.equal(meta('og:image:height'), '630');
  assert.ok(meta('og:image:alt').length > 5);
  assert.equal(meta('twitter:card', 'name'), 'summary_large_image');
  assert.equal(meta('twitter:title', 'name'), meta('og:title'));
  assert.equal(meta('twitter:image', 'name'), meta('og:image'));
  const img = meta('og:image');
  assert.ok(img && !/^\.\.|^\/\//.test(img));
  const local = img.replace(/^https:\/\/fadischen\.github\.io\/pages\/lifelottery\//, '');
  assert.ok(fs.existsSync(path.join(ROOT, local)), `og:image points at a file in lifelottery/: ${img}`);
  const png = fs.readFileSync(path.join(ROOT, local));
  assert.equal(png.readUInt32BE(16), 1200, 'og-image width');
  assert.equal(png.readUInt32BE(20), 630, 'og-image height');
  assert.ok(png.length < 600 * 1024, `og-image stays small (${png.length} bytes)`);
});
