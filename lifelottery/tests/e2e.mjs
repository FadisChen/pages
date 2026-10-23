// End-to-end test (PLAN section 7): Playwright + Chromium against `npx http-server lifelottery`.
//
//   node lifelottery/tests/e2e.mjs
//
// Environment (all optional):
//   LL_SHOTS=<dir>      where screenshots go (default: <os tmp>/lifelottery-shots)
//   LL_PORT=<port>      http-server port (default: a free port)
//   LL_CHROMIUM=<path>  Chromium executable (default: /opt/pw-browsers/chromium when present)
//
// What it covers: a full life on auto-choice from landing to summary, share card (canvas.toBlob and
// download, Web Share via a stub), album add / detail / export / import / delete / clear, reload mid-life
// and resume, 390px layout without horizontal scroll, dark mode, offline (service worker), the helpline
// block, an isolation lint of the sources, and zero console errors. It also saves screenshots of every
// screen at mobile and desktop widths in light and dark.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), 'lifelottery-shots');
fs.mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Tooling
// ---------------------------------------------------------------------------------------------

function loadPlaywright() {
  const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright'];
  const require = createRequire(import.meta.url);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Install it or run with NODE_PATH pointing at the global modules.');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function startServer(port) {
  const proc = spawn('npx', ['--yes', 'http-server', ROOT, '-p', String(port), '-c-1', '-s', '-a', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url); if (r.ok) return { proc, url }; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  killServer(proc);
  throw new Error(`http-server did not start:\n${log}`);
}

function killServer(proc) {
  try { process.kill(-proc.pid, 'SIGTERM'); } catch (e) { try { proc.kill('SIGTERM'); } catch (e2) { /* gone */ } }
}

let passed = 0;
const failures = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL ${name}\n       ${String(e && e.message || e).split('\n').join('\n       ')}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ---------------------------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------------------------

const consoleProblems = [];
function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleProblems.push(`[${label}] console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleProblems.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!/favicon/.test(u) && r.failure()?.errorText !== 'net::ERR_ABORTED') consoleProblems.push(`[${label}] requestfailed: ${u} ${r.failure()?.errorText}`);
  });
}

const hash = (page) => page.evaluate(() => location.hash);
async function waitHash(page, re, timeout = 90000) {
  await page.waitForFunction((src) => new RegExp(src).test(location.hash), re.source, { timeout });
}
async function noHScroll(page, label) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  assert(m.sw <= m.cw + 1 && m.bw <= m.cw + 1, `horizontal scroll on ${label}: scrollWidth ${m.sw} / body ${m.bw} > viewport ${m.cw}`);
}
let shotCount = 0;
async function shot(page, tag, name, { full = true } = {}) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}.png`), fullPage: full });
  shotCount++;
}

/** Play the current life to its end, picking the first option of every choice. Screenshots a few moments. */
async function playManually(page, tag, shots) {
  let sawChoice = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const h = await hash(page);
    if (/#\/death/.test(h)) return;
    const card = await page.$('.choice-card');
    if (card) {
      if (!sawChoice && shots) {
        sawChoice = true;
        await page.waitForTimeout(500);
        await shot(page, tag, '05-life-choice', { full: false });
      }
      // DOM click: Playwright's actionability wait would sit out the card's entrance animation
      await page.evaluate(() => { const b = document.querySelector('.choice-card .choice-btn'); if (b) b.click(); }).catch(() => {});
    }
    await page.waitForTimeout(25);
  }
  throw new Error('life did not end in time');
}

// ---------------------------------------------------------------------------------------------
// Source lint: isolation (PLAN 2.1) and storage-key prefix
// ---------------------------------------------------------------------------------------------

function lintSources() {
  const problems = [];
  const walk = (dir, out = []) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules' || f.name === 'raw') continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
  };
  const files = walk(ROOT).filter((p) => /\.(js|mjs|css|html|webmanifest|svg)$/.test(p));
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const text = fs.readFileSync(file, 'utf8');
    // 1. every relative import / fetch / src / href must resolve inside lifelottery/
    const refs = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+|fetch\(\s*|src=|href=|url\()\s*['"`(]?(\.{1,2}\/[^'"`)\s]+)/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (ref.includes('${')) continue;
      const resolved = path.resolve(path.dirname(file), ref.split('?')[0].split('#')[0]);
      if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) problems.push(`${rel}: reference leaves lifelottery/: ${ref}`);
    }
    // 2. no external URLs in the shipped UI sources
    if (/^(index\.html|sw\.js|manifest\.webmanifest|css\/|js\/(main|strings|storage|theme-init)\.js|js\/ui\/|icon\.svg|icons\/)/.test(rel)) {
      for (const m of text.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
        if (/^https?:\/\/(www\.w3\.org\/2000\/svg|1in8b\.life)/.test(m[0])) continue;
        problems.push(`${rel}: external URL ${m[0]}`);
      }
    }
    // 3. localStorage keys carry the prefix
    if (/^js\/(ui|main|storage)/.test(rel)) {
      for (const m of text.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)/g)) {
        if (!m[1].startsWith('lifelottery.')) problems.push(`${rel}: localStorage key without prefix: ${m[1]}`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

const playwright = loadPlaywright();
const port = Number(process.env.LL_PORT) || await freePort();
const { proc: server, url: BASE } = await startServer(port);
console.log(`serving ${ROOT} at ${BASE}\nscreenshots: ${SHOTS}`);

let browser;
try {
  const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await playwright.chromium.launch(exe ? { executablePath: exe } : {});

  const FAST = `${BASE}?debug=fast`;
  const MOBILE = { width: 390, height: 844 };
  const DESKTOP = { width: 1280, height: 900 };

  // =========================================================================================
  console.log('\nSource checks');
  await step('isolation lint: no references outside lifelottery/, no external URLs, prefixed storage keys', async () => {
    const problems = lintSources();
    assert(problems.length === 0, problems.join('\n'));
  });
  await step('service worker precache list covers every file under js/', async () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|css|html|svg|png|webmanifest))'/g)].map((m) => m[1]));
    const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else out.push(p); } return out; };
    const missing = walk(path.join(ROOT, 'js')).map((p) => path.relative(ROOT, p).split(path.sep).join('/')).filter((p) => p.endsWith('.js') && !listed.has(p));
    assert(missing.length === 0, `not precached: ${missing.join(', ')}`);
    for (const f of ['index.html', 'css/style.css', 'icon.svg', 'manifest.webmanifest']) assert(f === 'manifest.webmanifest' || listed.has(f), `missing ${f}`);
    assert(/CACHE_PREFIX = 'lifelottery-'/.test(sw), 'cache prefix');
    assert(/startsWith\(CACHE_PREFIX\)/.test(sw), 'only own caches are cleaned');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    for (const i of manifest.icons) assert(fs.existsSync(path.join(ROOT, i.src)), `manifest icon missing: ${i.src}`);
  });

  // =========================================================================================
  console.log('\nFull life on auto-choice (mobile, light)');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, colorScheme: 'light', acceptDownloads: true });
    // record every string the share card paints, so the test can check what the card says
    await ctx.addInitScript(() => {
      window.__cardTexts = [];
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__cardTexts.push(String(t)); return orig.call(this, t, ...a); };
    });
    const page = await ctx.newPage();
    watch(page, 'auto-life');
    await page.goto(`${FAST}&seed=e2e-auto-1`);

    await step('landing: ticker ticks, 15+ notice, no resume yet', async () => {
      await page.waitForSelector('.ticker-num');
      const a = await page.textContent('.ticker-num');
      assert(/^\d{1,3}(,\d{3}){2,3}$/.test(a), `ticker format: ${a}`);
      await page.waitForTimeout(1200);
      const b = await page.textContent('.ticker-num');
      assert(a !== b, 'population ticker should move');
      assert((await page.textContent('.notice')).includes('15+'), '15+ notice');
      assert(!(await page.$('[data-action="resume"]')), 'no resume card without a save');
      assert((await page.textContent('.ticker-sub')).includes('每秒約有'), 'births per second');
      await noHScroll(page, 'landing');
    });

    await step('setup: choose short pace and auto-choice, then draw', async () => {
      await page.click('[data-action="start"]');
      await waitHash(page, /#\/setup/);
      await page.check('#pace-short');
      await page.check('#era-present');
      await page.check('#autoChoice');
      await noHScroll(page, 'setup');
      await page.click('button[type="submit"]');
      await waitHash(page, /#\/lottery/);
    });

    await step('lottery: birth reveal with 100-babies statistic and country-vs-world comparison', async () => {
      await page.waitForSelector('.birth-country');
      const country = await page.textContent('.birth-country');
      assert(country.trim().length > 0, 'country name');
      assert((await page.textContent('.hundred-text')).includes('100 個嬰兒'), '100 babies text');
      assert((await page.$$('.hundred .dots .dot')).length === 100, '100 dots');
      assert((await page.$$('.cmp-row')).length >= 3, 'comparison rows');
      // world map: accessible, birth country highlighted (shape or marker), gentle pulse rings present
      const map = await page.evaluate(() => {
        const svg = document.querySelector('.birth-map svg.wm');
        return svg ? { role: svg.getAttribute('role'), title: svg.querySelector('title').textContent, desc: svg.querySelector('desc').textContent, hi: svg.querySelectorAll('.wm-birth, .wm-m-birth').length, rings: svg.querySelectorAll('.wm-ring').length, pin: !!svg.querySelector('.wm-pin-dot'), land: svg.querySelector('.wm-land').getAttribute('d').length } : null;
      });
      assert(map && map.role === 'img', 'birth map is an svg role=img');
      assert(map.title.includes(country.trim()) && map.desc.length > 10, `map title/desc: ${map.title}`);
      assert(map.hi >= 1 && map.pin && map.rings === 2, `birth country highlighted: ${JSON.stringify(map)}`);
      assert(map.land > 20000, 'land path is drawn');
      // odds: 像你這樣的人約 1／N with four facts and the product row
      const odds = await page.evaluate(() => ({ big: document.querySelector('.odds-reveal [data-role="odds-big"]')?.textContent, lead: document.querySelector('.odds-reveal .odds-lead')?.textContent, rows: document.querySelectorAll('.odds-reveal .odds-row').length }));
      assert(/^約 1／[\d.,]+[萬億兆]?$/.test(odds.big || ''), `odds big text: ${odds.big}`);
      assert(odds.lead.includes('同年出生的人裡，像你這樣的人約'), 'odds lead');
      assert(odds.rows === 5, `odds rows (4 facts + total): ${odds.rows}`);
      await noHScroll(page, 'lottery');
    });

    await step('life: auto-choice plays the whole life through to the death screen', async () => {
      await page.click('[data-action="begin"]');
      await waitHash(page, /#\/life/);
      await page.waitForSelector('.life-name');
      await waitHash(page, /#\/death/, 120000);
      await noHScroll(page, 'death');
    });

    await step('death: farewell text, then summary', async () => {
      assert((await page.textContent('.death-title')).includes('享年'), 'death title');
      await page.click('[data-action="to-summary"]');
      await waitHash(page, /#\/summary/);
      await page.waitForSelector('.review-hero');
    });

    await step('summary: lifespan comparison, SVG curves, highlights, life stats', async () => {
      assert((await page.$$('.span-row')).length === 3, 'three lifespan bars');
      assert((await page.$$('.chart-svg .chart-line')).length >= 5, 'five stat lines');
      assert(await page.$('.highlights, #sec-highlights'), 'highlights section');
      assert((await page.$$('.stat-item')).length >= 6, 'life stats');
      // scrubbing the chart updates the readout
      const before = await page.textContent('.chart-readout');
      await page.$eval('.chart-slider', (el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      const after = await page.textContent('.chart-readout');
      assert(before !== after && after.includes('0 歲'), `chart scrub: ${before} -> ${after}`);
      await noHScroll(page, 'summary');
    });

    await step('summary: odds, life map, first-life achievement toast and unlock card', async () => {
      const odds = await page.evaluate(() => ({ big: document.querySelector('.screen-review [data-role="odds-big"]')?.textContent, rows: document.querySelectorAll('.screen-review .odds-card .odds-row').length, lead: document.querySelector('.screen-review .odds-card .odds-lead')?.textContent }));
      assert(/^約 1／[\d.,]+[萬億兆]?$/.test(odds.big || ''), `summary odds: ${odds.big}`);
      assert(odds.rows >= 5 && odds.rows <= 6, `rows ${odds.rows}`); // country, gender, wealth, place, [age], total
      assert(/離世的人約$/.test(odds.lead), `lead: ${odds.lead}`);
      const map = await page.evaluate(() => { const s = document.querySelector('.map-card svg.wm'); return s ? { birth: s.querySelectorAll('.wm-birth, .wm-m-birth').length, title: s.querySelector('title').textContent, arcs: s.querySelectorAll('.wm-arc').length } : null; });
      assert(map && map.birth >= 1, `life map highlights the birth country: ${JSON.stringify(map)}`);
      const toastText = await page.evaluate(() => document.querySelector('#toast .toast-ach')?.textContent || '');
      assert(toastText.includes('解鎖成就') && toastText.includes('第一次投胎'), `achievement toast: "${toastText}"`);
      assert((await page.$$('.unlock-card .badge.is-earned')).length >= 1, 'unlock card lists the new badge');
      const log = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.achievements') || 'null'));
      assert(log && log.seen && 'first_life' in log.seen, `achievement log stored: ${JSON.stringify(log)}`);
      await noHScroll(page, 'summary sections');
    });

    await step('summary: message to the character is saved into the album record', async () => {
      await page.fill('#life-message', '謝謝你走完這一程。');
      await page.click('[data-action="save-message"]');
      const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.album')).records[0]);
      assert(rec.message === '謝謝你走完這一程。', `saved message: ${rec.message}`);
    });

    await step('share card: 1080x1350 canvas, toBlob size > 0, downloads as PNG', async () => {
      await page.waitForSelector('#share-canvas');
      const info = await page.evaluate(async () => {
        const c = document.getElementById('share-canvas');
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        // the pixels must not be blank: sample a few points for non-transparent colour
        const g = c.getContext('2d');
        const d = g.getImageData(540, 700, 1, 1).data;
        return { w: c.width, h: c.height, size: blob ? blob.size : 0, a: d[3] };
      });
      assert(info.w === 1080 && info.h === 1350, `canvas size ${info.w}x${info.h}`);
      assert(info.size > 5000, `blob size ${info.size}`);
      assert(info.a === 255, 'card pixels are opaque');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="download-card"]')]);
      assert(dl.suggestedFilename().endsWith('.png'), `download name ${dl.suggestedFilename()}`);
      const p = await dl.path();
      assert(fs.statSync(p).size > 5000, 'downloaded png has content');
      await page.locator('.share-card').screenshot({ path: path.join(SHOTS, 'sharecard-section.png') });
      const png = await page.evaluate(() => document.getElementById('share-canvas').toDataURL('image/png').split(',')[1]);
      fs.writeFileSync(path.join(SHOTS, 'sharecard-1080x1350.png'), Buffer.from(png, 'base64'));
      const texts = await page.evaluate(() => window.__cardTexts);
      assert(texts.some((t) => /^約 1／[\d.,]+[萬億兆]?$/.test(t)), `share card paints the odds: ${texts.filter((t) => t.includes('1／')).join('|')}`);
      assert(texts.includes('這樣一生的機率'), 'share card odds label');
    });

    await step('album: the finished life was added; save is cleared after leaving the review', async () => {
      await page.click('a[href="#/album"].btn');
      await waitHash(page, /#\/album$/);
      await page.waitForSelector('.album-card');
      assert((await page.$$('.album-card')).length === 1, 'one album card');
      assert((await page.textContent('.album-card')).includes('有留言'), 'message tag');
      assert((await page.textContent('.cumulative')).includes('活過的人生'), 'cumulative stats');
      const col = await page.evaluate(() => ({
        tiles: document.querySelectorAll('.collection-card .col-tile').length,
        countries: document.querySelector('.collection-card .col-tile b')?.textContent,
        mapHi: document.querySelectorAll('.collection-card svg.wm .wm-hi, .collection-card svg.wm .wm-m').length,
        badges: document.querySelectorAll('.ach-card .badge').length,
        earned: [...document.querySelectorAll('.ach-card .badge.is-earned')].map((b) => b.dataset.id),
        summary: document.querySelector('.ach-card .card-title small')?.textContent,
      }));
      assert(col.tiles === 6 && /^1 \/ 173$/.test(col.countries), `collection tiles: ${JSON.stringify(col)}`);
      assert(col.mapHi >= 1, 'album map shades the birth country');
      assert(col.badges >= 20 && col.earned.includes('first_life'), `achievements: ${JSON.stringify(col)}`);
      assert(/^已解鎖 \d+ \/ \d+$/.test(col.summary), col.summary);
      await noHScroll(page, 'album collection');
      const save = await page.evaluate(() => localStorage.getItem('lifelottery.save'));
      assert(save === null, 'dead save cleared after leaving the review');
      const keys = await page.evaluate(() => Object.keys(localStorage));
      assert(keys.every((k) => k.startsWith('lifelottery.')), `unprefixed keys: ${keys}`);
    });

    await step('zero console errors in this flow', async () => {
      assert(consoleProblems.length === 0, consoleProblems.join('\n'));
    });
    await ctx.close();
  }

  // =========================================================================================
  console.log('\nReload mid-life and resume');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: 'light' });
    const page = await ctx.newPage();
    watch(page, 'resume');
    await page.goto(`${BASE}?seed=e2e-resume-1`); // normal speed: we step manually
    await page.evaluate(() => localStorage.setItem('lifelottery.settings', JSON.stringify({ era: 'present', drawMode: 'births', pace: 'standard', autoChoice: false, speed: 1 })));
    await page.reload();
    await page.click('[data-action="start"]');
    await page.click('button[type="submit"]');
    await waitHash(page, /#\/lottery/);
    await page.click('[data-action="skip"], .slot-actions button, [data-action="begin"]').catch(() => {});
    await page.waitForSelector('[data-action="begin"]', { state: 'visible' });
    await page.click('[data-action="begin"]');
    await waitHash(page, /#\/life/);

    let before;
    await step('step a few years by hand', async () => {
      await page.click('[data-action="toggle-pause"]');
      for (let i = 0; i < 6; i++) {
        const choice = await page.$('.choice-card .choice-btn');
        if (choice) { await choice.click(); continue; }
        await page.click('[data-action="next-year"]');
      }
      before = await page.evaluate(() => ({ name: document.querySelector('.life-name').textContent, age: document.querySelector('.life-age').textContent, entries: document.querySelectorAll('.timeline .entry').length }));
      assert(before.entries >= 3, `entries ${before.entries}`);
    });

    await step('reload keeps the same life and the timeline', async () => {
      await page.reload();
      await page.waitForSelector('.life-name');
      assert((await hash(page)) === '#/life', `hash after reload ${await hash(page)}`);
      const after = await page.evaluate(() => ({ name: document.querySelector('.life-name').textContent, age: document.querySelector('.life-age').textContent, entries: document.querySelectorAll('.timeline .entry').length }));
      assert(after.name === before.name, `name ${after.name} vs ${before.name}`);
      assert(after.age === before.age, `age ${after.age} vs ${before.age}`);
      assert(after.entries >= before.entries - 1, `entries ${after.entries} vs ${before.entries}`);
    });

    await step('landing offers 繼續上一段人生 and it resumes', async () => {
      await page.goto(BASE);
      await page.waitForSelector('[data-action="resume"]');
      assert((await page.textContent('.resume')).includes(before.name), 'resume card names the character');
      await page.click('[data-action="resume"]');
      await waitHash(page, /#\/life/);
      assert((await page.textContent('.life-name')) === before.name, 'same life');
    });

    await step('a pending choice survives a reload (time stays stopped)', async () => {
      // jump forward until a choice card appears
      for (let i = 0; i < 80 && !(await page.$('.choice-card')); i++) await page.click('[data-action="next-year"]').catch(() => {});
      assert(await page.$('.choice-card'), 'a choice card should have appeared within 80 years');
      const title = await page.textContent('.choice-title');
      await page.reload();
      await page.waitForSelector('.choice-card');
      assert((await page.textContent('.choice-title')) === title, 'same pending choice after reload');
      const ageA = await page.textContent('.life-age');
      await page.waitForTimeout(700);
      assert((await page.textContent('.life-age')) === ageA, 'time must not advance while a choice is pending');
      assert(await page.isDisabled('[data-action="next-year"]'), 'next-year disabled during a choice');
    });
    await ctx.close();
  }

  // =========================================================================================
  console.log('\nLife screen controls');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: 'light' });
    const page = await ctx.newPage();
    watch(page, 'controls');
    await page.goto(`${BASE}?seed=e2e-controls-1`);
    await page.evaluate(() => localStorage.setItem('lifelottery.settings', JSON.stringify({ era: 'present', drawMode: 'births', pace: 'short', autoChoice: false, speed: 1 })));
    await page.reload();
    await page.click('[data-action="start"]');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-action="begin"]', { state: 'visible', timeout: 20000 });
    await page.click('[data-action="begin"]');
    await page.waitForSelector('.life-name');

    await step('pause / play toggles the label and stops the clock', async () => {
      const label = () => page.textContent('[data-action="toggle-pause"]');
      assert((await label()).includes('暫停'), 'starts playing');
      await page.click('[data-action="toggle-pause"]');
      assert((await label()).includes('播放'), 'now paused');
      assert(await page.isVisible('.paused-chip'), 'paused chip');
      const a = await page.textContent('.life-age');
      await page.waitForTimeout(600);
      assert((await page.textContent('.life-age')) === a, 'age frozen while paused');
      await page.click('[data-action="toggle-pause"]');
    });
    await step('speed buttons set aria-pressed (1x / 2x / 4x)', async () => {
      for (const n of [2, 4, 1]) {
        await page.click(`[data-speed="${n}"]`);
        assert((await page.getAttribute(`[data-speed="${n}"]`, 'aria-pressed')) === 'true', `speed ${n}`);
      }
    });
    await step('next year advances the age and shows floating stat deltas somewhere along the way', async () => {
      await page.click('[data-action="toggle-pause"]');
      let sawFloat = false;
      const a0 = parseInt(await page.textContent('.life-age'), 10);
      for (let i = 0; i < 12; i++) {
        if (await page.$('.choice-card .choice-btn')) { await page.click('.choice-card .choice-btn'); } else await page.click('[data-action="next-year"]');
        if (await page.$('.float-delta')) sawFloat = true;
      }
      assert(parseInt(await page.textContent('.life-age'), 10) > a0, 'age advanced');
      assert(sawFloat, 'floating +/- delta shown');
    });
    await step('family drawer opens as a dialog, lists parents, closes with Escape', async () => {
      await page.click('[data-action="family"]');
      await page.waitForSelector('dialog.drawer[open]');
      const txt = await page.textContent('dialog.drawer');
      assert(txt.includes('母親') && txt.includes('父親'), 'parents listed');
      await shot(page, 'mobile-light', '06-family-drawer', { full: false });
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog.drawer', { state: 'detached' });
    });
    await step('keyboard: Space pauses, A toggles auto, N steps', async () => {
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      const wasPaused = (await page.textContent('[data-action="toggle-pause"]')).includes('播放');
      await page.keyboard.press(' ');
      const nowPaused = (await page.textContent('[data-action="toggle-pause"]')).includes('播放');
      assert(wasPaused !== nowPaused, 'space toggles pause');
      await page.keyboard.press('a');
      assert((await page.getAttribute('[data-action="toggle-auto"]', 'aria-pressed')) === 'true', 'A turns auto on');
      await page.keyboard.press('a');
      assert((await page.getAttribute('[data-action="toggle-auto"]', 'aria-pressed')) === 'false', 'A turns auto off');
    });
    await step('auto-choice countdown picks for the player when a choice appears', async () => {
      if ((await page.textContent('[data-action="toggle-pause"]')).includes('播放')) await page.click('[data-action="toggle-pause"]');
      await page.click('[data-speed="4"]');
      await page.keyboard.press('a');
      let seenCountdown = false;
      for (let i = 0; i < 400; i++) {
        if (await page.$('.choice-card')) { seenCountdown = seenCountdown || (await page.isVisible('.countdown')); if (seenCountdown) break; }
        else await page.click('[data-action="next-year"]').catch(() => {});
        await page.waitForTimeout(20);
      }
      assert(seenCountdown, 'countdown visible on a choice card with auto on');
      const t = await page.textContent('.countdown-text');
      assert(/秒後自動替你選擇/.test(t), `countdown text: ${t}`);
    });
    await ctx.close();
  }

  // =========================================================================================
  console.log('\nShare, album tools, helpline');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: 'light', acceptDownloads: true });
    await ctx.addInitScript(() => {
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = async (d) => { window.__shared = { n: d.files.length, size: d.files[0].size, type: d.files[0].type, title: d.title }; };
    });
    const page = await ctx.newPage();
    watch(page, 'tools');
    await page.goto(BASE);

    // Seed the album with three records: two normal, one with a suicide cause (helpline).
    const records = await page.evaluate(async () => {
      const { createLife, advanceYear, autoChoose } = await import('./js/engine/life.js');
      const { getSummary } = await import('./js/engine/summary.js');
      const out = [];
      for (const [seed, cc] of [['alb-1', 'TWN'], ['alb-2', 'NGA'], ['alb-3', 'JPN']]) {
        const s = createLife({ era: 'present' }, seed, { countryCode: cc });
        let guard = 0;
        while (s.alive && guard++ < 140) { const r = advanceYear(s); if (r.pendingChoice) autoChoose(s); }
        const sum = getSummary(s);
        if (seed === 'alb-3') { sum.suicide = true; sum.cause = { id: 'suicide', label: '自殺', text: '因自殺離世。' }; }
        out.push({ id: `seed-${seed}`, savedAt: Date.now() - out.length * 1000, message: seed === 'alb-1' ? '路上小心。' : '', summary: sum });
      }
      return out;
    });

    await step('album import: JSON file with records is merged, duplicates skipped', async () => {
      await page.goto(`${BASE}#/album`);
      await page.waitForSelector('.empty');
      const file = path.join(SHOTS, 'import-test.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'lifelottery', v: 1, records }));
      await page.setInputFiles('[data-role="import-input"]', file);
      await page.waitForSelector('.album-card');
      assert((await page.$$('.album-card')).length === 3, 'three cards after import');
      await page.setInputFiles('[data-role="import-input"]', file);
      await page.waitForTimeout(300);
      assert((await page.$$('.album-card')).length === 3, 'duplicates not added twice');
      fs.writeFileSync(file, '{"nope": true}');
      await page.setInputFiles('[data-role="import-input"]', file);
      await page.waitForSelector('.toast-error');
      assert((await page.$$('.album-card')).length === 3, 'bad file leaves the album unchanged');
    });
    await step('old album records (no meta, era, urbanBirth, countriesLived, wealthQ) still render; collection and achievements derive from them', async () => {
      const legacy = JSON.parse(JSON.stringify(records[0]));
      legacy.id = 'legacy-1';
      legacy.savedAt = Date.now() - 99999;
      delete legacy.meta;
      const sm = legacy.summary;
      for (const k of ['era', 'urbanBirth', 'birthCity', 'countriesLived', 'wealthQ', 'yearsWorked', 'education']) delete sm[k];
      sm.age = 104; sm.deathYear = sm.birthYear + 104; sm.homeCountry = { code: '', name: '台灣' };
      sm.lifespan = { age: 104, countryLe: 80, worldLe: 70, vsCountry: 24, vsWorld: 34 };
      const file = path.join(SHOTS, 'legacy-test.json');
      fs.writeFileSync(file, JSON.stringify({ app: 'lifelottery', v: 1, records: [legacy] }));
      await page.goto(`${BASE}#/album`);
      await page.waitForSelector('.album-card');
      await page.setInputFiles('[data-role="import-input"]', file);
      await page.waitForFunction(() => document.querySelectorAll('.album-card').length === 4);
      const earned = await page.evaluate(() => [...document.querySelectorAll('.ach-card .badge.is-earned')].map((b) => b.dataset.id));
      for (const id of ['age_100', 'age_90', 'taiwan', 'beat_average']) assert(earned.includes(id), `legacy record earns ${id}: ${earned}`);
      await page.goto(`${BASE}#/album/legacy-1`);
      await page.waitForSelector('.review-hero');
      assert(await page.$('.odds-card [data-role="odds-big"]'), 'odds derived for an old record (draw mode defaults to newborns)');
      assert(await page.$('.map-card svg.wm .wm-birth, .map-card svg.wm .wm-m-birth'), 'map derived from the country name');
      await page.evaluate(() => { const b = document.querySelector('.review-actions [data-action="delete-record"]'); if (b) b.click(); });
      await page.click('[data-confirm="ok"]');
      await page.waitForSelector('.album-card');
      await page.waitForFunction(() => document.querySelectorAll('.album-card').length === 3);
    });
    await step('album export: downloads JSON that round-trips', async () => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
      const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      assert(data.records.length === 3 && data.app === 'lifelottery', 'export content');
    });
    await step('album detail opens; share uses the Web Share API with a PNG file', async () => {
      await page.click('.album-card .album-link');
      await page.waitForSelector('#share-canvas');
      await page.click('[data-action="share-card"]');
      await page.waitForFunction(() => window.__shared);
      const shared = await page.evaluate(() => window.__shared);
      assert(shared.n === 1 && shared.type === 'image/png' && shared.size > 5000, JSON.stringify(shared));
    });
    await step('helpline block (1925 / 1995) appears when the cause is suicide, not otherwise', async () => {
      await page.goto(`${BASE}#/album/seed-alb-3`);
      await page.waitForSelector('.help-card');
      const t = await page.textContent('.help-card');
      assert(t.includes('1925') && t.includes('1995'), 'helplines');
      assert((await page.$$('a[href="tel:1925"]')).length === 1, 'tel link');
      await page.goto(`${BASE}#/album/seed-alb-1`);
      await page.waitForSelector('.review-hero');
      assert(!(await page.$('.help-card')), 'no helpline for other causes');
    });
    await step('message edited in the album detail persists', async () => {
      await page.fill('#life-message', '改過的留言');
      await page.click('[data-action="save-message"]');
      await page.goto(`${BASE}#/album`);
      await page.waitForSelector('.album-card');
      assert((await page.textContent('.album-list')).includes('改過的留言'), 'edited message shown on the card');
    });
    await step('delete one record (confirm dialog), then clear all', async () => {
      await page.click('.album-delete >> nth=0');
      await page.waitForSelector('dialog.confirm[open]');
      await page.click('[data-confirm="ok"]');
      await page.waitForFunction(() => document.querySelectorAll('.album-card').length === 2);
      await page.click('[data-action="clear-all"]');
      await page.waitForSelector('dialog.confirm[open]');
      await page.click('[data-confirm="cancel"]');
      assert((await page.$$('.album-card')).length === 2, 'cancel keeps records');
      await page.click('[data-action="clear-all"]');
      await page.click('[data-confirm="ok"]');
      await page.waitForSelector('.empty');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.album')).records.length);
      assert(stored === 0, 'storage emptied');
    });
    await ctx.close();
  }

  // =========================================================================================
  console.log('\nTheme, offline and robustness');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: 'dark', serviceWorkers: 'allow' });
    const page = await ctx.newPage();
    watch(page, 'theme');
    await page.goto(BASE);
    const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    await step('dark mode follows the system, with dark colours', async () => {
      const c = await bg();
      assert(c === 'rgb(10, 16, 36)', `dark bg ${c}`);
      assert(!(await page.evaluate(() => document.documentElement.hasAttribute('data-theme'))), 'no manual override');
    });
    await step('manual toggle cycles system -> light -> dark and persists', async () => {
      await page.click('#theme-toggle');
      assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light');
      assert((await bg()) === 'rgb(239, 231, 212)', `light bg ${await bg()}`);
      await page.reload();
      assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'persisted across reload');
      await page.click('#theme-toggle');
      assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark');
      await page.click('#theme-toggle');
      assert(!(await page.evaluate(() => document.documentElement.dataset.theme)), 'back to system');
    });
    await step('service worker caches the game; the page loads offline', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('lifelottery-')));
      const names = await page.evaluate(() => caches.keys());
      assert(names.every((k) => k.startsWith('lifelottery-')), `foreign cache: ${names}`);
      const n = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).length; });
      assert(n >= 50, `only ${n} files cached`);
      await ctx.setOffline(true);
      await page.goto(BASE);
      await page.waitForSelector('.hero-title');
      await page.goto(`${BASE}#/setup`);
      await page.waitForSelector('.setup-form');
      await page.goto(`${BASE}#/about`);
      await page.waitForSelector('.screen-about');
      await ctx.setOffline(false);
    });
    await step('about page: sources, methodology, disclaimer, credit, helplines', async () => {
      const t = await page.textContent('.screen-about');
      for (const needle of ['資料來源', '方法說明', '免責聲明', '80 億分之 1', '1in8b.life', '1925', '1995']) assert(t.includes(needle), `about lacks ${needle}`);
    });
    await step('unknown route shows a not-found screen; storage failure does not break the game', async () => {
      await page.goto(`${BASE}#/nonsense`);
      await page.waitForSelector('h1');
      assert((await page.textContent('h1')).includes('找不到'), 'not found');
      const ctx2 = await browser.newContext({ viewport: MOBILE });
      await ctx2.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
      });
      const p2 = await ctx2.newPage();
      watch(p2, 'nostorage');
      await p2.goto(`${FAST}&seed=nostorage`);
      await p2.click('[data-action="start"]');
      await p2.click('button[type="submit"]');
      await p2.waitForSelector('[data-action="begin"]', { state: 'visible' });
      await p2.click('[data-action="begin"]');
      await p2.waitForSelector('.life-name');
      await p2.waitForFunction(() => parseInt(document.querySelector('.life-age').textContent, 10) >= 2);
      await ctx2.close();
    });
    await ctx.close();
  }

  // =========================================================================================
  // Screenshot tours: every screen, mobile and desktop, light and dark
  // =========================================================================================
  console.log('\nScreenshot tours');
  for (const [vpName, viewport] of [['mobile', MOBILE], ['desktop', DESKTOP]]) {
    for (const scheme of ['light', 'dark']) {
      const tag = `${vpName}-${scheme}`;
      await step(`tour ${tag}: every screen renders without horizontal scroll`, async () => {
        const ctx = await browser.newContext({ viewport, deviceScaleFactor: vpName === 'mobile' ? 2 : 1, colorScheme: scheme });
        const page = await ctx.newPage();
        watch(page, `tour-${tag}`);
        await page.goto(`${FAST}&seed=tour-${tag}`);
        await page.waitForSelector('.ticker-num');
        await shot(page, tag, '01-landing');
        await noHScroll(page, `${tag} landing`);

        await page.click('[data-action="start"]');
        await page.waitForSelector('.setup-form');
        await shot(page, tag, '02-setup');
        await noHScroll(page, `${tag} setup`);
        await page.check('#pace-short');
        await page.click('button[type="submit"]');
        await page.waitForSelector('.birth-country');
        await page.waitForTimeout(300);
        await shot(page, tag, '03-lottery-reveal');
        await page.locator('.birth-card').screenshot({ path: path.join(SHOTS, `${tag}-03a-birth-map.png`) });
        await page.locator('.odds-reveal').screenshot({ path: path.join(SHOTS, `${tag}-03b-odds.png`) });
        await noHScroll(page, `${tag} lottery`);

        await page.click('[data-action="begin"]');
        await page.waitForSelector('.life-name');
        // let a handful of years pass so the timeline has substance, then play to the end by hand
        await page.waitForTimeout(600);
        await shot(page, tag, '04-life', { full: false });
        await noHScroll(page, `${tag} life`);
        await playManually(page, tag, true);
        await page.waitForSelector('.death-title');
        await page.waitForTimeout(300);
        await shot(page, tag, '07-death', { full: false });
        await noHScroll(page, `${tag} death`);
        await page.click('[data-action="to-summary"]');
        await page.waitForSelector('.review-hero');
        await page.fill('#life-message', '你辛苦了。謝謝你。');
        await page.click('[data-action="save-message"]');
        await page.waitForTimeout(400);
        await shot(page, tag, '08-summary');
        await noHScroll(page, `${tag} summary`);
        await page.locator('.odds-card').screenshot({ path: path.join(SHOTS, `${tag}-08a-odds.png`) });
        await page.locator('.map-card').screenshot({ path: path.join(SHOTS, `${tag}-08b-life-map.png`) });
        fs.writeFileSync(path.join(SHOTS, `${tag}-08c-sharecard.png`), Buffer.from(await page.evaluate(() => document.getElementById('share-canvas').toDataURL('image/png').split(',')[1]), 'base64'));

        await page.goto(`${FAST}#/album`);
        await page.waitForSelector('.album-card');
        await shot(page, tag, '09-album');
        await noHScroll(page, `${tag} album`);
        await page.locator('.collection-card').screenshot({ path: path.join(SHOTS, `${tag}-09a-collection.png`) });
        await page.locator('.ach-card').screenshot({ path: path.join(SHOTS, `${tag}-09b-achievements.png`) });
        await page.click('.album-link');
        await page.waitForSelector('.review-hero');
        await page.waitForTimeout(300);
        await shot(page, tag, '10-album-detail');
        await noHScroll(page, `${tag} album detail`);

        await page.goto(`${FAST}#/about`);
        await page.waitForSelector('.screen-about');
        await shot(page, tag, '11-about');
        await noHScroll(page, `${tag} about`);
        await ctx.close();
      });
    }
  }

  await step('lottery animation (normal speed): names spin, then the card is revealed', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, colorScheme: 'light' });
    const page = await ctx.newPage();
    watch(page, 'spin');
    await page.goto(`${BASE}?seed=spin-1`);
    await page.click('[data-action="start"]');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.slot-name');
    await page.waitForTimeout(900);
    await shot(page, 'mobile-light', '03a-lottery-spinning', { full: false });
    await page.waitForSelector('.birth-country', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(3500);
    assert((await page.$$('.reveal .show')).length >= 8, 'all reveal steps shown');
    await ctx.close();
  });

  await step('reduced motion: the lottery reveals immediately', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    watch(page, 'reduced');
    await page.goto(`${BASE}?seed=rm-1`);
    await page.click('[data-action="start"]');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.birth-country', { state: 'visible', timeout: 2500 });
    await ctx.close();
  });

  console.log('\nConsole');
  await step('zero console errors, page errors or failed requests across the whole run', async () => {
    assert(consoleProblems.length === 0, consoleProblems.slice(0, 20).join('\n'));
  });
} finally {
  if (browser) await browser.close().catch(() => {});
  killServer(server);
}

console.log(`\n${passed} passed, ${failures.length} failed, ${shotCount} screenshots in ${SHOTS}`);
if (failures.length) {
  console.log(`\nFailures:\n${failures.map((f) => ` - ${f.name}`).join('\n')}`);
  process.exit(1);
}
process.exit(0);
