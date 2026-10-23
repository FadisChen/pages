// Service worker: the precache list covers every game file, lists nothing that does not exist, and uses its own
// cache namespace (PLAN 2.1). Run with: node --test tests/*.test.mjs   (from lifelottery/)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
