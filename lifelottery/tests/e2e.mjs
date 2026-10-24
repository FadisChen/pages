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
//
// Phase 4B additions: the life-focus stage card (manual, auto, reload) and the chip's selector, the focus timeline and
// family religion in the review, the full-screen map (open, drag, wheel, pinch, keys, tooltip, reduced motion, both
// themes), share cards with a map in the extreme cases (long name, three-line message, four countries, no map, newborn:
// every painted string must lie on the paper), and the personal-odds line.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S } from '../js/strings.js';

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
  // a smooth scroll still under way would put the sticky header in the wrong place in a viewport shot
  for (let i = 0, prev = -1; i < 40; i++) { const y = await page.evaluate(() => Math.round(scrollY)); if (y === prev) break; prev = y; await page.waitForTimeout(80); }
  await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}.png`), fullPage: full });
  shotCount++;
}

/** viewBox, zoom level and the marker-scale variable of the open zoom dialog. */
const zoomState = (page) => page.evaluate(() => {
  const svg = document.querySelector('dialog.mapzoom svg.wm');
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3], level: parseFloat(document.querySelector('dialog.mapzoom .mz-level').textContent), zm: parseFloat(svg.style.getPropertyValue('--zm')), zs: parseFloat(svg.style.getPropertyValue('--zs')) };
});
async function openZoom(page, selector) {
  await page.evaluate((sel) => { document.querySelector(sel).scrollIntoView({ block: 'center' }); }, selector);
  await page.click(selector);
  await page.waitForSelector('dialog.mapzoom[open] .mz-stage');
  await page.waitForTimeout(200);
}
async function closeZoom(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog.mapzoom', { state: 'detached' });
}

const FOCUS_CARD = '[data-role="focus-prompt"]';
const CHOICE_CARD = '.choice-card:not([data-role="focus-prompt"])';

/** One step of a hand-played life: answer a stage prompt (keeping the preselected focus), a choice (first option), or go on one year. */
async function advanceOne(page) {
  if (await page.$(FOCUS_CARD)) { await page.evaluate(() => document.querySelector('[data-action="focus-confirm"]').click()); return 'focus'; }
  if (await page.$(`${CHOICE_CARD} .choice-btn`)) { await page.evaluate(() => document.querySelector('.choice-card .choice-btn').click()); return 'choice'; }
  await page.click('[data-action="next-year"]', { timeout: 4000 });
  return 'year';
}

/** Play the current life to its end, picking the first option of every choice. Screenshots a few moments. */
async function playManually(page, tag, shots) {
  let sawChoice = false, sawFocus = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const h = await hash(page);
    if (/#\/death/.test(h)) return;
    if (await page.$(FOCUS_CARD)) {
      if (!sawFocus && shots) {
        sawFocus = true;
        await page.waitForTimeout(500);
        await shot(page, tag, '04b-life-focus-card', { full: false });
      }
      await page.evaluate(() => { const b = document.querySelector('[data-action="focus-confirm"]'); if (b) b.click(); }).catch(() => {});
      await page.waitForTimeout(25);
      continue;
    }
    const card = await page.$(CHOICE_CARD);
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
        // the share-preview meta of index.html must be absolute for crawlers (README: "分享預覽"); it is never fetched by the game
        if (rel === 'index.html' && /^https:\/\/fadischen\.github\.io\/pages\/lifelottery\//.test(m[0])) continue;
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
  await step('service worker precache list covers every file under js/ and css/', async () => {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|css|html|svg|png|webmanifest))'/g)].map((m) => m[1]));
    const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else out.push(p); } return out; };
    const missing = [...walk(path.join(ROOT, 'js')), ...walk(path.join(ROOT, 'css'))].map((p) => path.relative(ROOT, p).split(path.sep).join('/')).filter((p) => /\.(js|css)$/.test(p) && !listed.has(p));
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
      assert(odds.rows >= 5 && odds.rows <= 7, `rows ${odds.rows}`); // country, gender, wealth, place, [age], total, [personal line]
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

    await step('summary: focus timeline bar with legend, family religion, and the personal-odds line', async () => {
      const f = await page.evaluate(() => {
        const card = document.querySelector('[data-role="focus-timeline"]');
        return card ? {
          segs: [...card.querySelectorAll('.ft-seg')].map((s) => s.dataset.focus),
          legend: [...card.querySelectorAll('.ft-legend li')].map((l) => l.textContent),
          aria: card.querySelector('.ft').getAttribute('aria-label'),
          ticks: card.querySelectorAll('.ft-axis span').length,
          widths: [...card.querySelectorAll('.ft-seg')].map((s) => s.getBoundingClientRect().width),
          bar: card.querySelector('.ft-bar').getBoundingClientRect().width,
        } : null;
      });
      assert(f && f.segs.length >= 1, `focus timeline missing: ${JSON.stringify(f)}`);
      assert(f.legend.length >= 1 && f.legend.every((l) => /\d+ 年$/.test(l)), `legend: ${f.legend}`);
      assert(/^人生重心時間軸：/.test(f.aria) && f.aria.includes('歲'), `aria: ${f.aria}`);
      assert(Math.abs(f.widths.reduce((a, b) => a + b, 0) - f.bar) < 3, 'the segments fill the bar (the bar has a 1px border on each side)');
      const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.album')).records[0].summary);
      assert(rec.focusTimeline.length === f.segs.length && rec.focusTimeline.every((g, i) => g.focus === f.segs[i]), `timeline matches the record: ${JSON.stringify(rec.focusTimeline)} vs ${f.segs}`);
      const religion = await page.textContent('[data-role="religion"]');
      assert(/^家庭信仰／傳統：.+/.test(religion), `religion line: ${religion}`);
      assert(Object.values(S.religion).includes(religion.replace(/^家庭信仰／傳統：/, '')), `religion name comes from strings.js: ${religion}`);
      // personal odds: a real percentage, the clarifying sentence, the headline untouched
      const ageNow = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.album')).records[0].summary.age);
      if (ageNow >= 1) {
        const p = await page.evaluate(() => { const r = document.querySelector('[data-role="odds-personal"]'); return r ? { text: r.textContent, pct: r.querySelector('[data-role="odds-personal-pct"]').textContent } : null; });
        assert(p, 'personal odds row');
        assert(p.text.includes(`以這一生的健康與風險，活到 ${ageNow} 歲的機率`) && p.text.includes('同國家、同性別、同年代的人平均約') && p.text.includes('不能相乘'), `personal row text: ${p.text}`);
        assert(/^約 (\d+(\.\d+)?%|不到 0\.1%|99% 以上)$/.test(p.pct), `percentage: ${p.pct}`);
      }
      assert(/^約 1／[\d.,]+[萬億兆]?$/.test(await page.textContent('.screen-review [data-role="odds-big"]')), 'headline stays 約 1／N');
    });

    await step('summary: tapping the life map opens the full-screen map, with legend and places; Esc closes it', async () => {
      await openZoom(page, '.map-card button.wm-wrap');
      const d = await page.evaluate(() => ({ title: document.querySelector('.mz-title').textContent, legend: document.querySelector('.mz-legend')?.textContent || '', caption: document.querySelector('.mz-caption')?.textContent || '' }));
      assert(d.title.includes('人生足跡地圖') && d.legend.includes('出生地') && d.caption.length > 0, JSON.stringify(d));
      await closeZoom(page);
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
      await openZoom(page, '.collection-card button.wm-wrap');
      assert((await page.textContent('.mz-legend')).includes('4 次以上'), 'collection legend in the zoom view');
      await closeZoom(page);
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
      for (let i = 0; i < 6; i++) await advanceOne(page);
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
      for (let i = 0; i < 80 && !(await page.$(CHOICE_CARD)); i++) await advanceOne(page).catch(() => {});
      assert(await page.$(CHOICE_CARD), 'a choice card should have appeared within 80 years');
      const title = await page.textContent(`${CHOICE_CARD} .choice-title`);
      await page.reload();
      await page.waitForSelector(CHOICE_CARD);
      assert((await page.textContent(`${CHOICE_CARD} .choice-title`)) === title, 'same pending choice after reload');
      const ageA = await page.textContent('.life-age');
      await page.waitForTimeout(700);
      assert((await page.textContent('.life-age')) === ageA, 'time must not advance while a choice is pending');
      assert(await page.isDisabled('[data-action="next-year"]'), 'next-year disabled during a choice');
    });
    await ctx.close();
  }

  // =========================================================================================
  console.log('\nLife focus: stage card (manual, auto, reload), chip selector, keyboard');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, colorScheme: 'light' });
    const page = await ctx.newPage();
    watch(page, 'focus');
    await page.goto(`${BASE}?seed=e2e-focus-1`);
    await page.evaluate(() => localStorage.setItem('lifelottery.settings', JSON.stringify({ era: 'present', drawMode: 'births', pace: 'short', autoChoice: false, speed: 1 })));
    await page.reload();
    await page.click('[data-action="start"]');
    await step('setup explains that the life focus can be chosen at each stage', async () => {
      const note = await page.textContent('[data-role="focus-note"]');
      assert(note.includes('人生重心') && note.includes('6、12、18、25、40、60'), note);
      await noHScroll(page, 'setup with focus note');
    });
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-action="begin"]', { state: 'visible', timeout: 20000 });
    await page.click('[data-action="begin"]');
    await page.waitForSelector('.life-name');
    await page.click('[data-action="toggle-pause"]');

    const toPrompt = async () => {
      for (let i = 0; i < 80 && !(await page.$(FOCUS_CARD)); i++) {
        if (await page.$(`${CHOICE_CARD} .choice-btn`)) await page.evaluate(() => document.querySelector('.choice-card .choice-btn').click());
        else await page.click('[data-action="next-year"]', { timeout: 4000 });
      }
      assert(await page.$(FOCUS_CARD), 'a stage prompt should appear');
    };
    const chipText = () => page.textContent('[data-action="focus-chip"] .focus-chip-text');
    const checked = () => page.evaluate(() => document.querySelector('.focus-picker input:checked').value);

    await step('age 6: the stage card stops time, names the stage, preselects the current focus and lists the open foci', async () => {
      assert((await chipText()) === '平衡', 'chip starts on 平衡');
      await toPrompt();
      assert((await page.textContent('.life-age')) === '6 歲', 'prompt at 6');
      const c = await page.evaluate(() => ({
        title: document.querySelector('[data-role="focus-prompt"] .choice-title').textContent,
        eyebrow: document.querySelector('[data-role="focus-prompt"] .eyebrow').textContent,
        opts: [...document.querySelectorAll('.focus-picker .focus-opt')].map((o) => ({ id: o.dataset.focus, name: o.querySelector('.focus-name').textContent, desc: o.querySelector('.focus-desc').textContent, effect: o.querySelector('.focus-effect').textContent })),
        nextDisabled: document.querySelector('[data-action="next-year"]').disabled,
        confirm: document.querySelector('[data-action="focus-confirm"]').textContent,
      }));
      assert(c.title === '你 6 歲了。接下來這幾年，你想把重心放在…', c.title);
      assert(c.eyebrow.includes('小學時期'), c.eyebrow);
      assert(c.opts.map((o) => o.id).join() === 'balance,study,health', `open at 6: ${c.opts.map((o) => o.id)}`);
      assert(c.opts.every((o) => o.desc.length > 8 && o.effect.length > 4), 'every option has a description and an effect hint');
      assert((await checked()) === 'balance', 'the current focus is preselected');
      assert(c.nextDisabled && c.confirm.includes('維持「平衡」'), `time stopped, confirm keeps the focus: ${c.confirm}`);
      const age = await page.textContent('.life-age');
      await page.waitForTimeout(700);
      assert((await page.textContent('.life-age')) === age, 'time does not advance during the prompt');
      const save = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.save')).state);
      assert(save.flags._focusPrompt === true, 'the pending prompt is saved');
      await shot(page, 'mobile-light', '04b-focus-card-age6', { full: false });
    });

    await step('number key 2 selects 學業, Enter confirms; the chip, the timeline and the save follow', async () => {
      await page.keyboard.press('2');
      assert((await checked()) === 'study', 'key 2 selects the second option');
      assert((await page.textContent('[data-action="focus-confirm"]')).includes('決定「學業」'), 'confirm label follows the selection');
      await page.keyboard.press('Enter');
      await page.waitForSelector(FOCUS_CARD, { state: 'detached' });
      assert((await chipText()) === '學業', 'chip shows the new focus');
      assert((await page.textContent('.kind-focus')).includes('學業'), 'timeline note');
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.save')).state);
      assert(st.focus === 'study' && st.focusHistory.some((r) => r.age === 6 && r.focus === 'study') && !st.flags._focusPrompt, JSON.stringify(st.focusHistory));
      if (await page.$(`${CHOICE_CARD} .choice-btn`)) await page.evaluate(() => document.querySelector('.choice-card .choice-btn').click()); // a choice that came with the stage prompt follows it (which seed meets one depends on the childhood events: Phase 6A)
      assert(!(await page.isDisabled('[data-action="next-year"]')), 'time can go on');
    });

    await step('age 12: a reload keeps the pending prompt (and the old focus preselected)', async () => {
      await toPrompt();
      assert((await page.textContent('.life-age')) === '12 歲', 'prompt at 12');
      await page.reload();
      await page.waitForSelector(FOCUS_CARD);
      assert((await page.textContent('.life-age')) === '12 歲', 'same age after reload');
      assert((await checked()) === 'study', 'preselected: the focus in effect');
      const ids = await page.evaluate(() => [...document.querySelectorAll('.focus-picker .focus-opt')].map((o) => o.dataset.focus));
      assert(ids.join() === 'balance,study,health,self', `open at 12: ${ids}`);
      assert(await page.isDisabled('[data-action="next-year"]'), 'still stopped after the reload');
      await page.keyboard.press('3');
      await page.click('[data-action="focus-confirm"]');
      await page.waitForSelector(FOCUS_CARD, { state: 'detached' });
      assert((await chipText()) === '健康', 'chose 健康');
    });

    await step('chip selector: opens a dialog with the foci, their descriptions and effects; keys 4 + Enter apply', async () => {
      await page.click('[data-action="focus-chip"]');
      await page.waitForSelector('dialog.focus-drawer[open]');
      const d = await page.evaluate(() => ({
        n: document.querySelectorAll('dialog.focus-drawer .focus-opt').length,
        current: document.querySelector('dialog.focus-drawer .focus-opt .tag-note')?.closest('.focus-opt').dataset.focus,
        checked: document.querySelector('dialog.focus-drawer input:checked').value,
        shownDesc: [...document.querySelectorAll('dialog.focus-drawer .focus-desc')].every((x) => x.offsetHeight > 0),
        lead: document.querySelector('dialog.focus-drawer .focus-lead').textContent,
      }));
      assert(d.n === 4 && d.current === 'health' && d.checked === 'health', JSON.stringify(d));
      assert(d.shownDesc && d.lead.includes('12 歲') && d.lead.includes('少年時期'), `descriptions visible, lead: ${d.lead}`);
      await shot(page, 'mobile-light', '06b-focus-selector', { full: false });
      await page.keyboard.press('4');
      await page.keyboard.press('Enter');
      await page.waitForSelector('dialog.focus-drawer', { state: 'detached' });
      assert((await chipText()) === '興趣與自我', 'chip follows');
      assert((await page.$$('.kind-focus')).length === 2, 'a timeline note for each decision made since the reload');
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.save')).state);
      assert(st.focus === 'self' && st.focusHistory[st.focusHistory.length - 1].focus === 'self', 'saved');
    });

    await step('keyboard: G opens the selector, Esc leaves the focus alone; the help lists G and Enter', async () => {
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('g');
      await page.waitForSelector('dialog.focus-drawer[open]');
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog.focus-drawer', { state: 'detached' });
      assert((await chipText()) === '興趣與自我', 'unchanged');
      assert((await page.evaluate(() => document.activeElement.dataset.action)) === 'focus-chip', 'focus returns to the chip');
      const help = await page.evaluate(() => document.querySelector('.shortcuts').textContent);
      assert(help.includes('G') && help.includes('更換人生重心') && help.includes('Enter'), help);
      await page.keyboard.press('f');
      await page.waitForSelector('dialog.drawer[open]');
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog.drawer', { state: 'detached' });
      await noHScroll(page, 'life with focus chip');
    });
    await ctx.close();
  }

  {
    // Auto-choice: the stage card counts down and applies autoFocus (a MutationObserver sees the card even in ?debug=fast)
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: 'light' });
    await ctx.addInitScript(() => {
      window.__focusSeen = [];
      new MutationObserver(() => {
        const n = document.querySelector('[data-role="focus-prompt"]');
        if (!n || n.__seen) return;
        n.__seen = true;
        const auto = [...n.querySelectorAll('.focus-opt')].find((o) => o.querySelector('.focus-auto-tag'));
        window.__focusSeen.push({
          title: n.querySelector('.choice-title').textContent,
          countdown: n.querySelector('.countdown-text').textContent,
          countdownShown: !n.querySelector('.countdown').hidden,
          auto: auto ? auto.dataset.focus : null,
          current: n.querySelector('.focus-opt input:checked').value,
        });
      }).observe(document, { childList: true, subtree: true });
    });
    const page = await ctx.newPage();
    watch(page, 'focus-auto');
    await page.goto(`${FAST}&seed=e2e-focus-auto`);
    await page.evaluate(() => localStorage.setItem('lifelottery.settings', JSON.stringify({ era: 'present', drawMode: 'births', pace: 'short', autoChoice: true, speed: 1 })));
    await page.reload();
    await page.click('[data-action="start"]');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-action="begin"]', { state: 'visible' });
    await page.click('[data-action="begin"]');
    await step('auto-choice: the stage card counts down, names the automatic pick, and applies autoFocus', async () => {
      await page.waitForFunction(() => window.__focusSeen.length >= 2 || /#\/death/.test(location.hash), null, { timeout: 60000 });
      const seen = await page.evaluate(() => window.__focusSeen);
      assert(seen.length >= 2, `prompts seen: ${seen.length}`);
      const first = seen[0];
      assert(first.title === '你 6 歲了。接下來這幾年，你想把重心放在…', first.title);
      assert(first.countdownShown && /^\d+ 秒後自動選擇「.+」$/.test(first.countdown), `countdown: ${first.countdown}`);
      assert(first.auto && first.current === 'balance', JSON.stringify(first));
      // the engine's own pick for that life and age, from the saved state (the card is long gone in fast mode)
      const r = await page.evaluate(async () => {
        const { deserialize, autoFocus } = await import('./js/engine/life.js');
        const raw = JSON.parse(localStorage.getItem('lifelottery.save') || 'null');
        if (!raw) return null;
        const s = deserialize(raw.state);
        return { history: s.focusHistory, age: s.age };
      });
      if (r) {
        const row = r.history.find((x) => x.age === 6);
        if (first.auto !== 'balance') assert(row && row.focus === first.auto, `age-6 row ${JSON.stringify(row)} should be the automatic pick ${first.auto}`);
        else assert(!row || row.focus === 'balance', `age-6 row ${JSON.stringify(row)}`);
      }
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
        await advanceOne(page);
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
        if (await page.$(CHOICE_CARD)) { seenCountdown = seenCountdown || (await page.isVisible('.countdown')); if (seenCountdown) break; }
        else if (!(await page.$(FOCUS_CARD))) await page.click('[data-action="next-year"]', { timeout: 500 }).catch(() => {});
        await page.waitForTimeout(20);
      }
      assert(seenCountdown, 'countdown visible on a choice card with auto on');
      const t = await page.textContent(`${CHOICE_CARD} .countdown-text`);
      assert(/秒後自動替你選擇/.test(t), `countdown text: ${t}`);
    });
    await ctx.close();
  }

  // =========================================================================================
  console.log('\nMap zoom: open, wheel, buttons, drag, pinch, keys, tooltip, reduced motion, themes');
  {
    const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, colorScheme: 'light', hasTouch: true });
    const page = await ctx.newPage();
    watch(page, 'zoom');
    await page.goto(`${FAST}&seed=e2e-zoom-1&country=TWN`);
    await page.click('[data-action="start"]');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.birth-country');
    const stageBox = async () => (await page.locator('.mz-stage').boundingBox());

    await step('the reveal map is a button; tapping it opens a full-screen dialog focused on the map', async () => {
      assert((await page.getAttribute('.birth-map button.wm-wrap', 'aria-label')).startsWith('放大地圖'), 'button label');
      await openZoom(page, '.birth-map button.wm-wrap');
      const d = await page.evaluate(() => {
        const dlg = document.querySelector('dialog.mapzoom');
        const r = dlg.getBoundingClientRect();
        return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, focus: document.activeElement.dataset.role, title: dlg.querySelector('.mz-title').textContent, buttons: [...dlg.querySelectorAll('.mz-btn')].map((b) => b.getAttribute('aria-label')), help: dlg.querySelector('.mz-help').textContent };
      });
      assert(Math.abs(d.w - d.vw) < 2 && Math.abs(d.h - d.vh) < 2, `full screen: ${d.w}x${d.h} vs ${d.vw}x${d.vh}`);
      assert(d.focus === 'zoom-stage', 'focus is on the map stage');
      assert(d.title.startsWith('你出生在') && d.buttons.join() === '放大,縮小,重設', JSON.stringify(d));
      const z = await zoomState(page);
      assert(z.level === 1 && z.zm === 1, JSON.stringify(z));
      assert(await page.isDisabled('[data-action="zoom-out"]') && await page.isDisabled('[data-action="zoom-reset"]'), 'out and reset are disabled at the fitted view');
      await shot(page, 'mobile-light', '12-map-zoom-fit', { full: false });
    });

    await step('+ button, wheel and the − button zoom; the ring and dot markers shrink while the shapes grow', async () => {
      await page.click('[data-action="zoom-in"]');
      await page.waitForTimeout(450);
      const a = await zoomState(page);
      assert(Math.abs(a.level - 1.6) < 0.05, `after +: ${a.level}`);
      const seen = await page.evaluate(() => { const e = document.querySelector('dialog.mapzoom [data-code]').getBoundingClientRect(), s = document.querySelector('.mz-stage').getBoundingClientRect(); const cx = e.x + e.width / 2, cy = e.y + e.height / 2; return cx > s.left && cx < s.right && cy > s.top && cy < s.bottom; });
      assert(seen, 'the first zoom-in keeps the birth country on screen');
      const box = await stageBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(150);
      const b = await zoomState(page);
      assert(b.level > a.level * 1.5, `wheel zoom: ${a.level} -> ${b.level}`);
      assert(b.w < a.w && b.zm < a.zm && b.zs < b.zm, `markers scale: zm ${a.zm} -> ${b.zm}, outlines zs ${b.zs}`);
      for (let i = 0; i < 4; i++) { await page.click('[data-action="zoom-in"]'); await page.waitForTimeout(260); }
      const c = await zoomState(page);
      assert(c.level > 10 && c.zm < 0.25 && c.zm > c.zs, `deep zoom: ${JSON.stringify(c)}`);
      const ring = await page.evaluate(() => { const r = document.querySelector('dialog.mapzoom .wm-tiny, dialog.mapzoom .wm-pin-dot, dialog.mapzoom .wm-dot'); return r ? { tf: getComputedStyle(r).transform, ve: getComputedStyle(r).vectorEffect } : null; });
      assert(ring && ring.tf !== 'none', `a marker is scaled by CSS: ${JSON.stringify(ring)}`);
      await page.click('[data-action="zoom-out"]');
      await page.waitForTimeout(300);
      assert((await zoomState(page)).level < c.level, '− zooms out');
      await shot(page, 'mobile-light', '12b-map-zoom-in', { full: false });
    });

    await step('dragging pans the map (and cannot leave it); reset returns to the fitted view', async () => {
      const box = await stageBox();
      const before = await zoomState(page);
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 90, cy + 40, { steps: 6 });
      await page.mouse.up();
      const after = await zoomState(page);
      assert(after.x < before.x - 1 && after.y < before.y - 0.5, `dragging right/down moves the view left/up: ${before.x},${before.y} -> ${after.x},${after.y}`);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 2000, cy + 2000, { steps: 4 });
      await page.mouse.up();
      const edge = await zoomState(page);
      assert(edge.x >= -0.01 && edge.y >= -0.01, `the view stays over the map: ${edge.x},${edge.y}`);
      await page.click('[data-action="zoom-reset"]');
      await page.waitForTimeout(350);
      const r = await zoomState(page);
      assert(r.level === 1 && r.zm === 1, `reset: ${JSON.stringify(r)}`);
    });

    await step('two-finger pinch zooms (pointer events)', async () => {
      const box = await stageBox();
      const cdp = await ctx.newCDPSession(page);
      const y = box.y + box.height / 2, mx = box.x + box.width / 2;
      const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, yy], i) => ({ x, y: yy, id: i + 1 })) });
      await touch('touchStart', [[mx - 40, y], [mx + 40, y]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[mx - 40 - i * 16, y], [mx + 40 + i * 16, y]]);
      await touch('touchEnd', []);
      const z = await zoomState(page);
      assert(z.level > 2, `pinch out zooms in: ${z.level}`);
      const lvl = z.level;
      await touch('touchStart', [[mx - 160, y], [mx + 160, y]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[mx - 160 + i * 16, y], [mx + 160 - i * 16, y]]);
      await touch('touchEnd', []);
      assert((await zoomState(page)).level < lvl, 'pinch in zooms out');
      await page.keyboard.press('0');
      await page.waitForTimeout(350);
    });

    await step('keys: arrows pan, + and − zoom, 0 resets', async () => {
      await page.evaluate(() => document.querySelector('.mz-stage').focus());
      for (let i = 0; i < 4; i++) { await page.keyboard.press('+'); await page.waitForTimeout(300); }
      const a = await zoomState(page);
      assert(a.level > 6, `+ key: ${a.level}`);
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(350);
      const l = await zoomState(page);
      assert(l.x < a.x - 0.5 && Math.abs(l.y - a.y) < 0.01, `ArrowLeft pans left: ${a.x} -> ${l.x}`);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(350);
      assert((await zoomState(page)).y > l.y + 0.5, 'ArrowDown pans down');
      await page.keyboard.press('-');
      await page.waitForTimeout(350);
      assert((await zoomState(page)).level < a.level, '- key zooms out');
      await page.keyboard.press('0');
      await page.waitForTimeout(350);
      assert((await zoomState(page)).level === 1, '0 key resets');
    });

    await step('tapping the highlighted country shows its name as a tooltip; tapping elsewhere hides it', async () => {
      await page.keyboard.press('0');
      await page.waitForTimeout(350);
      const pt = await page.evaluate(() => { const e = document.querySelector('dialog.mapzoom [data-code]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, code: e.dataset.code }; });
      await page.mouse.click(pt.x, pt.y);
      await page.waitForSelector('.mz-tip:not([hidden])');
      const tip = await page.textContent('.mz-tip');
      assert(tip === '台灣・出生地', `tooltip: ${tip}`);
      const inside = await page.evaluate(() => { const t = document.querySelector('.mz-tip').getBoundingClientRect(), s = document.querySelector('.mz-stage').getBoundingClientRect(); return t.left >= s.left - 1 && t.right <= s.right + 1; });
      assert(inside, 'the tooltip stays inside the stage');
      await page.mouse.click(pt.x - 120, pt.y + 200);
      await page.waitForSelector('.mz-tip', { state: 'hidden' });
    });

    await step('Esc closes the dialog and returns focus to the map button', async () => {
      await closeZoom(page);
      assert(await page.evaluate(() => document.activeElement.classList.contains('wm-open')), 'focus returns to the opener');
    });

    await step('dark theme: the zoom dialog and its map use the dark colours', async () => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await openZoom(page, '.birth-map button.wm-wrap');
      await page.click('[data-action="zoom-in"]');
      await page.waitForTimeout(400);
      const c = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector('dialog.mapzoom')).backgroundColor, sea: getComputedStyle(document.querySelector('dialog.mapzoom .wm-wrap')).backgroundColor }));
      assert(c.bg === 'rgb(10, 16, 36)', `dialog bg ${c.bg}`);
      await shot(page, 'mobile-dark', '12-map-zoom', { full: false });
      await closeZoom(page);
      await page.emulateMedia({ colorScheme: 'light' });
    });
    await ctx.close();

    const rm = await browser.newContext({ viewport: MOBILE, reducedMotion: 'reduce' });
    const rp = await rm.newPage();
    watch(rp, 'zoom-reduced');
    await rp.goto(`${FAST}&seed=e2e-zoom-2`);
    await rp.click('[data-action="start"]');
    await rp.click('button[type="submit"]');
    await rp.waitForSelector('.birth-country');
    await step('reduced motion: the zoom buttons and reset jump at once instead of gliding', async () => {
      await openZoom(rp, '.birth-map button.wm-wrap');
      await rp.click('[data-action="zoom-in"]');
      const a = await zoomState(rp);
      assert(Math.abs(a.level - 1.6) < 0.01, `immediate: ${a.level}`);
      await rp.keyboard.press('0');
      assert((await zoomState(rp)).level === 1, 'reset is immediate');
      assert((await rp.evaluate(() => getComputedStyle(document.querySelector('dialog.mapzoom .wm-arc, dialog.mapzoom .wm-land')).animationName)) === 'none', 'no map animation');
      await closeZoom(rp);
    });
    await rm.close();
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
      for (const k of ['era', 'urbanBirth', 'birthCity', 'countriesLived', 'wealthQ', 'yearsWorked', 'education', 'riskTrail', 'religion', 'focus', 'focusTimeline']) delete sm[k];
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
      assert(!(await page.$('[data-role="odds-personal"]')), 'an old record has no per-year risks: no personal line (and no error)');
      assert(!(await page.$('[data-role="focus-timeline"]')) && !(await page.$('[data-role="religion"]')), 'an old record has no focus timeline or religion');
      assert(/^約 1／/.test(await page.textContent('.odds-card [data-role="odds-big"]')), 'the headline odds still show');
      await openZoom(page, '.map-card button.wm-wrap');
      await closeZoom(page);
      await page.evaluate(() => { const b = document.querySelector('.review-actions [data-action="delete-record"]'); if (b) b.click(); });
      await page.click('[data-confirm="ok"]');
      await page.waitForSelector('.album-card');
      await page.waitForFunction(() => document.querySelectorAll('.album-card').length === 3);
    });
    await step('personal odds: each real record shows "活到這個歲數的機率" next to its 1／N, matching the engine', async () => {
      for (const id of ['seed-alb-1', 'seed-alb-2']) {
        await page.goto(`${BASE}#/album/${id}`);
        await page.waitForSelector('.review-hero');
        const got = await page.evaluate(async (rid) => {
          const rec = JSON.parse(localStorage.getItem('lifelottery.album')).records.find((r) => r.id === rid);
          const { personalFromSummary } = await import('./js/engine/odds.js');
          const { percentText } = await import('./js/strings.js');
          const p = personalFromSummary(rec.summary);
          const row = document.querySelector('[data-role="odds-personal"]');
          return { age: rec.summary.age, expected: p ? `約 ${percentText(p.p)}` : null, baseline: p ? percentText(p.baseline) : null, shown: row ? row.querySelector('[data-role="odds-personal-pct"]').textContent : null, text: row ? row.textContent : '', big: document.querySelector('[data-role="odds-big"]').textContent, rows: document.querySelectorAll('.odds-card .odds-row').length };
        }, id);
        assert(got.age >= 1 && got.expected, `${id}: engine has a personal figure`);
        assert(got.shown === got.expected, `${id}: shown ${got.shown} vs engine ${got.expected}`);
        assert(got.text.includes(`同國家、同性別、同年代的人平均約 ${got.baseline}`), `${id}: baseline in the row: ${got.text}`);
        assert(got.text.includes('不能相乘或直接比較'), 'the clarifying sentence');
        assert(/^約 1／/.test(got.big) && got.rows >= 7, `${id}: headline stays and the personal line is part of the breakdown (${got.rows} rows)`);
        assert(await page.$('[data-role="focus-timeline"]') && await page.$('[data-role="religion"]'), `${id}: album detail has the focus timeline and religion`);
      }
      await noHScroll(page, 'album detail with personal odds');
      await page.goto(`${BASE}#/album`);
      await page.waitForSelector('.album-card');
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
  console.log('\nShare cards with a map: extreme cases must stay on the paper');
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    // every string the card paints, with its box in card pixels (the transform is applied, so the rotated stamp is covered)
    await ctx.addInitScript(() => {
      window.__paint = null;
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...rest) {
        if (window.__paint) {
          const m = this.getTransform();
          const w = this.measureText(String(t)).width;
          const al = this.textAlign;
          const left = al === 'right' ? x - w : al === 'center' ? x - w / 2 : x;
          const p1 = m.transformPoint({ x: left, y }), p2 = m.transformPoint({ x: left + w, y });
          window.__paint.push({ t: String(t), x1: Math.min(p1.x, p2.x), x2: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y), font: this.font });
        }
        return orig.call(this, t, x, y, ...rest);
      };
    });
    const page = await ctx.newPage();
    watch(page, 'cards');
    await page.goto(`${FAST}`);
    const MSG3 = '謝謝你一路走來，無論順境或逆境都沒有放棄，願下一世你能過得輕鬆一些，也記得偶爾停下腳步看看天空，那裡一直都有星星，陪著每一個努力生活的人。';
    const cases = [
      ['normal', 'TWN', {}, '路上小心，謝謝你。'],
      ['long-name', 'IDN', { name: 'Muhammad Abdullahi Ibrahim Abubakar Al-Rashid bin Sultan Hassan', countriesLived: ['印尼', '沙烏地阿拉伯'] }, MSG3],
      ['migrant-4-countries', 'PHL', { name: '瑪麗亞・桑托斯・克魯茲', countriesLived: ['菲律賓', '沙烏地阿拉伯', '阿拉伯聯合大公國', '加拿大'], age: 71 }, MSG3],
      ['five-countries-age-102', 'COD', { name: '約瑟夫', countriesLived: ['剛果民主共和國', '烏干達', '南非', '英國', '加拿大'], age: 102 }, ''],
      ['newborn', 'NGA', { age: 0, cause: { id: 'neonatal', label: '新生兒疾病', text: '' } }, ''],
      ['tiny-countries', 'SGP', { countriesLived: ['新加坡', '馬爾地夫', '盧森堡'], age: 88, cause: { id: 'x', label: '慢性阻塞性肺病與其他呼吸道疾病', text: '' } }, '短短一行。'],
      ['no-map', 'JPN', { homeCountry: { code: '', name: '某個不存在的國家' }, countriesLived: [] }, MSG3],
    ];
    for (const [name, cc, over, message] of cases) {
      await step(`share card (${name}): everything painted lies on the paper, the map and its places are drawn`, async () => {
        const out = await page.evaluate(async ({ cc, over, message, name }) => {
          const { createLife, advanceYear } = await import('./js/engine/life.js');
          const { getSummary } = await import('./js/engine/summary.js');
          const { normalizeRecord } = await import('./js/storage.js');
          const { drawShareCard } = await import('./js/ui/sharecard.js');
          const s = createLife({ era: 'present' }, `card-${name}`, { countryCode: cc });
          let g = 0; while (s.alive && g++ < 140) advanceYear(s, { auto: true });
          const sum = JSON.parse(JSON.stringify(getSummary(s)));
          Object.assign(sum, over);
          const rec = normalizeRecord({ id: `card-${name}`, savedAt: Date.now(), message, summary: sum, meta: { drawMode: 'births' } });
          const c = document.createElement('canvas');
          window.__paint = [];
          drawShareCard(c, rec);
          const paint = window.__paint; window.__paint = null;
          const px = c.getContext('2d').getImageData(720, 520, 1, 1).data;
          return { paint, mapPixel: [px[0], px[1], px[2]], png: c.toDataURL('image/png').split(',')[1], w: c.width, h: c.height, name: rec.summary.name };
        }, { cc, over, message, name });
        fs.writeFileSync(path.join(SHOTS, `sharecard-case-${name}.png`), Buffer.from(out.png, 'base64'));
        assert(out.w === 1080 && out.h === 1350, 'card size');
        const onPaper = out.paint.filter((p) => p.y > 200 && p.y < 1280);
        assert(onPaper.length > 15, `painted ${onPaper.length} strings on the paper`);
        for (const p of onPaper) {
          assert(p.x1 >= 150 - 8 || /^[0-9]$/.test(p.t) || p.font.includes('800'), `left edge ${p.x1.toFixed(0)} of "${p.t}"`);
          assert(p.x2 <= 1000, `"${p.t}" ends at ${p.x2.toFixed(0)} (paper ends at 1020)`);
          assert(p.y <= 1264, `"${p.t}" sits at y=${p.y.toFixed(0)} (paper ends at 1270)`);
        }
        for (const p of out.paint.filter((q) => q.y >= 1280)) assert(p.x1 >= 0 && p.x2 <= 1080, `footer "${p.t}" fits the card`);
        const texts = out.paint.map((p) => p.t);
        if (name === 'no-map') {
          assert(!texts.some((x) => x.includes('→')), 'no places line without a map');
          assert(texts.some((x) => x.includes('願下一世')), 'the message is still there');
        } else {
          const hasPlaces = texts.some((x) => x.includes('→') || x.startsWith('一生都在'));
          assert(hasPlaces, 'the places under the map');
          assert(!(out.mapPixel[0] === 248 && out.mapPixel[1] === 241 && out.mapPixel[2] === 222), `the map is painted (pixel ${out.mapPixel})`);
        }
        if (name === 'migrant-4-countries') assert(texts.some((x) => /^1 .*→ 2 .*→ 3 .*/.test(x)), `route caption: ${texts.filter((x) => x.includes('→'))}`);
        if (name === 'migrant-4-countries' || name === 'long-name' || name === 'no-map') {
          const lines = out.paint.filter((p) => p.font.includes('500 32px'));
          assert(lines.length === 3, `a three-line message shows three lines, got ${lines.length}`);
          assert(lines.map((l) => l.t).join('') === message, 'the whole message fits in three lines');
        }
        if (name === 'long-name') assert(texts.some((x) => x.endsWith('…') && x.startsWith('Muhammad')), 'the very long name is shortened with an ellipsis, not drawn off the paper');
      });
    }
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
  // Phase 5E: same start, live again · load speed · share preview · small fixes
  // =========================================================================================
  console.log('\nPhase 5E: same start again, load speed, share preview, small fixes');
  {
    const REPLAY_SHOTS = process.env.LL_SHOTS5E || SHOTS;
    fs.mkdirSync(REPLAY_SHOTS, { recursive: true });
    const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, colorScheme: 'light', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') }).catch(() => {});
    await ctx.addInitScript(() => {
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = async (d) => { window.__shared = { n: d.files.length, text: d.text, title: d.title }; };
    });
    const page = await ctx.newPage();
    watch(page, 'phase5e');
    const album = () => page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.album') || '{"records":[]}').records);
    const facts = () => page.evaluate(() => ({
      country: document.querySelector('.birth-country').textContent.trim(),
      line: document.querySelector('.birth-line').textContent.trim(),
      facts: [...document.querySelectorAll('.facts .fact')].map((f) => f.textContent.replace(/\s+/g, ' ').trim()),
      year: document.querySelector('.birth-card .eyebrow').textContent.trim(),
    }));

    await step('landing: the page paints without fetching the engine or any event text; they arrive once the page is idle', async () => {
      const seen = [];
      page.on('request', (r) => { if (/\/js\/(engine|data\/(events|yearly|names|religion|geo|money|riskref|causes|conditions))/.test(r.url())) seen.push({ t: Date.now(), url: r.url() }); });
      await page.goto(`${BASE}?seed=e2e-replay-1&debug=fast`);
      await page.waitForSelector('.ticker-num');
      await page.waitForTimeout(250);
      assert(seen.length === 0, `heavy modules requested before the page was idle: ${seen.map((s) => s.url).join(', ')}`);
      assert((await page.$$('link[rel="modulepreload"]')).length === 8, 'only the first-paint modules are preloaded at load');
      assert(await page.$('template#preload-later'), 'the heavy modulepreload links wait in an inert template');
      await page.waitForFunction(() => !document.getElementById('preload-later'), null, { timeout: 15000 });
      await page.waitForFunction(() => document.querySelectorAll('link[rel="modulepreload"]').length >= 59);
      await page.waitForTimeout(500);
      assert(seen.some((s) => /events\/index\.js/.test(s.url)), 'the event texts are fetched in the background afterwards');
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const listed = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].length;
      assert(listed === 59 || listed >= 59, `index.html lists the modules (${listed})`);
    });

    await step('setup: the 60-minute option explains its slow pace and the speed-ups; short and standard do not', async () => {
      await page.click('[data-action="start"]');
      await page.waitForSelector('.setup-form');
      assert(await page.$eval('[data-role="pace-long-hint"]', (n) => n.hidden), 'hint hidden while 60 minutes is not chosen');
      await page.check('#pace-long');
      const hint = await page.$eval('[data-role="pace-long-hint"]', (n) => ({ hidden: n.hidden, text: n.textContent }));
      assert(!hint.hidden && hint.text.includes('慢') && hint.text.includes('慢慢讀') && hint.text.includes('2×') && hint.text.includes('4×') && hint.text.includes('按住'), `hint: ${JSON.stringify(hint)}`);
      assert((await page.getAttribute('#pace-long', 'aria-describedby')) === 'pace-long-hint', 'the radio is described by the hint');
      assert((await page.textContent('label[for="pace-long"]')).includes('節奏較慢'), 'the tile itself says it is slower');
      await shot(page, 'phase5e', 'setup-long-hint', { full: false });
      await page.check('#pace-short');
      assert(await page.$eval('[data-role="pace-long-hint"]', (n) => n.hidden), 'hint hidden again');
      await noHScroll(page, 'setup with the hint');
    });

    // ---- the first life, played on auto-choice
    let first = null;
    await step('life 1: a summary with a 同一起點 card and no 重活 marker; the record keeps its start', async () => {
      await page.check('#pace-short');
      await page.check('#era-past');
      await page.check('#autoChoice');
      await page.click('button[type="submit"]');
      await waitHash(page, /#\/lottery/);
      await page.waitForSelector('.birth-country', { state: 'visible' });
      assert(!(await page.$('[data-role="replay-note"]')), 'an ordinary life has no 重活 note on the reveal');
      first = await facts();
      await page.click('[data-action="begin"]');
      await waitHash(page, /#\/death/, 120000);
      await page.click('[data-action="to-summary"]');
      await page.waitForSelector('.review-hero');
      assert(!(await page.$('[data-role="replay-badge"]')) && !(await page.$('[data-role="replay-compare"]')), 'no badge or comparison on the first life');
      assert(await page.$('[data-role="replay-cta"] [data-action="replay"]'), 'the replay button is there');
      assert((await page.textContent('[data-role="replay-cta"]')).includes('同一起點，再活一次'), 'button text');
      const rec = (await album())[0];
      assert(rec.meta.birth && rec.meta.birth.v === 1 && rec.meta.birth.name.full && rec.meta.birth.mother && rec.meta.birth.father && typeof rec.meta.birth.business === 'boolean', `meta.birth: ${JSON.stringify(rec.meta.birth)}`);
      assert(!rec.meta.replay, 'the first life is not a replay');
    });

    let second = null;
    await step('replay from the summary: the reveal says 重活 and shows the same country, place, gender, wealth, name and year', async () => {
      const prevName = await page.textContent('.review-hero h1');
      await page.click('[data-action="replay"]');
      await waitHash(page, /#\/lottery/);
      await page.waitForSelector('[data-role="replay-note"]');
      await page.waitForSelector('.birth-country', { state: 'visible' });
      const note = await page.textContent('[data-role="replay-note"]');
      assert(note.includes('重活') && note.includes('同一起點的第 2 世') && note.includes('名字與家人都和上一世一樣'), `note: ${note}`);
      second = await facts();
      assert(JSON.stringify(second) === JSON.stringify(first), `same start:\n${JSON.stringify(first)}\n${JSON.stringify(second)}`);
      assert(second.line.includes(prevName.trim()), 'the same name');
      const save = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.save')));
      assert(save.replay && save.replay.n === 2 && save.replay.prev && save.replay.start === save.replay.prev, `save wrapper: ${JSON.stringify(save.replay)}`);
      assert(save.state.flags._fix && typeof save.state.flags._fix.family_business === 'boolean', 'the family-business answer is carried over');
      assert(save.state.seed !== (await album())[0].id, 'a new seed');
      await noHScroll(page, 'lottery (replay)');
      await shot(page, 'phase5e', 'replay-lottery', { full: false });
    });

    await step('a reload in the middle of the replayed life keeps it a 重活', async () => {
      await page.click('[data-action="begin"]');
      await waitHash(page, /#\/life/);
      await page.waitForSelector('.life-name');
      await page.reload();
      await page.waitForSelector('.life-name');
      const save = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.save')));
      assert(save.replay && save.replay.n === 2, 'the replay link survives the reload');
    });

    await step('life 2 summary: 重活 badge with a link to the previous life, and the comparison (lifespan, education, children, focus, odds, opening)', async () => {
      await waitHash(page, /#\/death/, 120000);
      await page.click('[data-action="to-summary"]');
      await page.waitForSelector('[data-role="replay-compare"]');
      const badge = await page.textContent('[data-role="replay-badge"]');
      assert(badge.includes('重活') && badge.includes('同一起點的第 2 世'), `badge: ${badge}`);
      const prevHref = await page.getAttribute('[data-role="replay-prev"]', 'href');
      const recs = await album();
      assert(recs.length === 2 && prevHref === `#/album/${encodeURIComponent(recs[recs.length - 1].id)}`, `link to the previous life: ${prevHref}`);
      assert((await page.textContent('[data-role="replay-prev"]')).startsWith('上一世：'), 'link text');
      const rows = await page.evaluate(() => [...document.querySelectorAll('[data-role="replay-compare"] tbody tr')].map((r) => ({ key: r.dataset.row, label: r.querySelector('th').textContent, prev: r.children[1].textContent.trim(), now: r.children[2].textContent.trim() })));
      assert(rows.map((r) => r.key).join() === 'lifespan,education,children,focus,odds,opening', `rows: ${rows.map((r) => r.key)}`);
      assert(rows.every((r) => r.prev && r.now), `no empty cell: ${JSON.stringify(rows)}`);
      assert(/^\d+ 歲$|^不滿一歲$/.test(rows[0].prev) && /^(\d+ 歲|不滿一歲)/.test(rows[0].now), `lifespan cells: ${JSON.stringify(rows[0])}`);
      assert(/^約 1／/.test(rows[4].prev) && /^約 1／/.test(rows[4].now), `odds cells: ${JSON.stringify(rows[4])}`);
      assert(rows[5].prev.endsWith('。') && rows[5].now.endsWith('。') && rows[5].prev.length > 10 && rows[5].now.length > 10, `the opening sentences: ${JSON.stringify(rows[5])}`);
      const rec = recs[0];
      assert(rec.meta.replay && rec.meta.replay.n === 2 && rec.meta.replay.prev === recs[recs.length - 1].id, `record link: ${JSON.stringify(rec.meta.replay)}`);
      assert(JSON.stringify(rec.meta.birth) === JSON.stringify(recs[recs.length - 1].meta.birth), 'the second record holds the very same start');
      assert(rec.summary.name === recs[recs.length - 1].summary.name, 'same name');
      await noHScroll(page, 'summary with the comparison');
      await page.locator('[data-role="replay-compare"]').screenshot({ path: path.join(REPLAY_SHOTS, 'replay-compare-mobile-light.png') });
      await page.locator('.review-hero').screenshot({ path: path.join(REPLAY_SHOTS, 'replay-hero-mobile-light.png') });
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.waitForTimeout(250);
      await noHScroll(page, 'summary with the comparison (desktop)');
      await page.locator('[data-role="replay-compare"]').screenshot({ path: path.join(REPLAY_SHOTS, 'replay-compare-desktop-light.png') });
      await page.setViewportSize(MOBILE);
    });

    await step('the badge links to the previous life; its page has no 重活 marker and offers the replay', async () => {
      await page.click('[data-role="replay-prev"]');
      await page.waitForFunction(() => /#\/album\//.test(location.hash) && !document.querySelector('[data-role="replay-badge"]') && document.querySelector('.review-hero'));
      assert(!(await page.$('[data-role="replay-badge"]')), 'the first life is not a 重活');
      assert(await page.$('[data-action="replay"]'), 'replay offered in the album detail too');
      assert((await page.textContent('[data-role="replay-cta"]')).includes('沿用這一世的出生地、性別、家境、名字與家人'), 'full-start hint');
    });

    await step('third life from the album detail: the 同一起點活過三次 achievement unlocks; the album marks both replays', async () => {
      await page.click('[data-action="replay"]');
      await waitHash(page, /#\/lottery/);
      await page.waitForSelector('[data-role="replay-note"]');
      assert((await page.textContent('[data-role="replay-note"]')).includes('同一起點的第 3 世'), 'third life of the start');
      await page.click('[data-action="begin"]');
      await waitHash(page, /#\/death/, 120000);
      await page.click('[data-action="to-summary"]');
      await page.waitForSelector('[data-role="replay-compare"]');
      const toastText = await page.evaluate(() => document.querySelector('#toast .toast-ach')?.textContent || '');
      assert(toastText.includes('同一起點活過三次'), `achievement toast: ${toastText}`);
      assert((await page.$$('.unlock-card .badge.is-earned')).length >= 1, 'unlock card');
      assert((await page.textContent('[data-role="replay-badge"]')).includes('第 3 世'), 'badge says the 3rd life');
      const recs = await album();
      assert(recs.length === 3 && recs[0].meta.replay.n === 3 && recs[0].meta.replay.start === recs[1].meta.replay.start, 'three records on one start');
      await page.goto(`${BASE}#/album`);
      await page.waitForSelector('.album-card');
      assert((await page.$$('.album-card .tag-replay')).length === 2, 'two cards carry the 重活 tag');
      const ach = await page.evaluate(() => [...document.querySelectorAll('.ach-card .badge.is-earned')].map((b) => b.dataset.id));
      assert(ach.includes('same_start_3'), `earned: ${ach}`);
      // lives and novelty still count: three lives were read
      const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.seenEvents')));
      assert(seen && seen.lives === 3, `cross-life counts include the replays: ${seen && seen.lives}`);
    });

    await step('deleting the previous life leaves the badge without a link (and no comparison)', async () => {
      const recs = await album();
      await page.evaluate((id) => { const raw = JSON.parse(localStorage.getItem('lifelottery.album')); raw.records = raw.records.filter((r) => r.id !== id); localStorage.setItem('lifelottery.album', JSON.stringify(raw)); }, recs[0].meta.replay.prev);
      await page.goto(`${BASE}#/album/${encodeURIComponent(recs[0].id)}`);
      await page.reload();
      await page.waitForSelector('.review-hero');
      assert((await page.textContent('[data-role="replay-badge"]')).includes('上一世的記錄已經刪除'), 'gone notice');
      assert(!(await page.$('[data-role="replay-compare"]')) && !(await page.$('[data-role="replay-prev"]')), 'no comparison, no link');
    });

    await step('an old record (no meta.birth) can still be replayed: place, gender, wealth and year are kept, the rest redrawn', async () => {
      const old = await page.evaluate(async () => {
        const { createLife, advanceYear, autoChoose } = await import('./js/engine/life.js');
        const { getSummary } = await import('./js/engine/summary.js');
        const s = createLife({ era: 'past' }, 'old-record-1', { countryCode: 'BRA', urban: false });
        let guard = 0;
        while (s.alive && guard++ < 140) { const r = advanceYear(s); if (r.pendingChoice) autoChoose(s); }
        const sum = getSummary(s);
        const rec = { id: 'old-1', savedAt: Date.now() - 5000, message: '', summary: sum };
        const raw = JSON.parse(localStorage.getItem('lifelottery.album') || '{"v":1,"records":[]}');
        raw.records.unshift(rec);
        localStorage.setItem('lifelottery.album', JSON.stringify(raw));
        return { country: sum.homeCountry.name, gender: sum.gender, year: sum.birthYear, city: sum.birthCity, wealth: sum.wealthShort };
      });
      await page.goto(`${BASE}#/album/old-1`);
      await page.reload();
      await page.waitForSelector('[data-role="replay-cta"]');
      assert((await page.textContent('[data-role="replay-cta"]')).includes('這是比較早的記錄'), 'partial hint');
      await page.click('[data-action="replay"]');
      await waitHash(page, /#\/lottery/);
      await page.waitForSelector('.birth-country', { state: 'visible' });
      const f = await facts();
      const note = await page.textContent('[data-role="replay-note"]');
      assert(f.country === old.country && f.facts.some((x) => x.includes(old.city)) && f.year.includes(String(old.year)) && f.facts.some((x) => x.includes(old.gender === 'M' ? '男性' : '女性')), `kept: ${JSON.stringify(f)} vs ${JSON.stringify(old)}`);
      assert(f.facts.some((x) => x.includes('近郊的鄉村')), `the countryside is kept: ${JSON.stringify(f.facts)}`);
      assert(note.includes('其餘重新抽') && !note.includes('名字與家人都和上一世一樣'), `partial note: ${note}`);
      const save = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.save')));
      assert(save.replay.partial === true && save.replay.prev === 'old-1' && save.replay.start === 'old-1', JSON.stringify(save.replay));
    });

    await step('replay with a life in progress asks first; cancel keeps it', async () => {
      // the partial replay from the previous step is still alive (age 0)
      await page.goto(`${BASE}#/album/${encodeURIComponent((await album())[0].id)}`);
      await page.waitForSelector('[data-action="replay"]');
      await page.click('[data-action="replay"]');
      await page.waitForSelector('dialog.confirm[open]');
      assert((await page.textContent('dialog.confirm[open]')).includes('重活會捨棄它'), 'confirm text');
      await page.click('[data-confirm="cancel"]');
      assert((await page.evaluate(() => !!localStorage.getItem('lifelottery.save'))), 'the life in progress is kept');
      assert(/#\/album\//.test(await hash(page)), 'still on the album detail');
      await page.click('[data-action="replay"]');
      await page.click('[data-confirm="ok"]');
      await waitHash(page, /#\/lottery/);
      await page.waitForSelector('[data-role="replay-note"]');
    });

    await step('records that cannot be lived again (unknown country) show no button', async () => {
      await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('lifelottery.album'));
        const r = JSON.parse(JSON.stringify(raw.records[raw.records.length - 1])); r.id = 'nowhere-1'; r.summary.homeCountry = { code: '', name: '未知' }; delete r.meta;
        raw.records.push(r);
        localStorage.setItem('lifelottery.album', JSON.stringify(raw));
        localStorage.removeItem('lifelottery.save');
      });
      await page.goto(`${BASE}#/album/nowhere-1`);
      await page.reload();
      await page.waitForSelector('.review-hero');
      assert(!(await page.$('[data-action="replay"]')) && !(await page.$('[data-role="replay-cta"]')), 'no replay offered');
    });

    await step('share: Web Share and copy both carry the page URL', async () => {
      await page.goto(`${BASE}?x=1#/album`);
      await page.waitForSelector('.album-card');
      await page.click('.album-card .album-link');
      await page.waitForSelector('#share-canvas');
      await page.click('[data-action="share-card"]');
      await page.waitForFunction(() => window.__shared);
      const shared = await page.evaluate(() => window.__shared);
      assert(shared.text.includes(BASE) && shared.text.includes('人生籤') && !shared.text.includes('#') && !shared.text.includes('?x=1'), `shared text: ${shared.text}`);
      await page.click('[data-action="copy-share-text"]');
      await page.waitForSelector('#toast .toast');
      const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
      if (copied !== null) assert(copied === shared.text, `copied text equals the shared text: ${copied}`);
      assert((await page.textContent('#toast')).includes('已複製'), 'toast');
    });

    await step('open graph and twitter meta: zh-Hant title and description, a 1200x630 image that loads', async () => {
      await page.goto(`${BASE}#/about`);
      const m = await page.evaluate(() => {
        const get = (sel) => document.querySelector(sel)?.getAttribute('content') || '';
        return {
          type: get('meta[property="og:type"]'), locale: get('meta[property="og:locale"]'), title: get('meta[property="og:title"]'), desc: get('meta[property="og:description"]'),
          image: get('meta[property="og:image"]'), w: get('meta[property="og:image:width"]'), h: get('meta[property="og:image:height"]'), alt: get('meta[property="og:image:alt"]'),
          card: get('meta[name="twitter:card"]'), tImage: get('meta[name="twitter:image"]'), tTitle: get('meta[name="twitter:title"]'),
        };
      });
      assert(m.type === 'website' && m.locale === 'zh_TW' && /人生籤/.test(m.title) && /[一-鿿]{10}/.test(m.desc), JSON.stringify(m));
      assert(m.card === 'summary_large_image' && m.tImage === m.image && m.tTitle === m.title && m.w === '1200' && m.h === '630' && m.alt.length > 5, JSON.stringify(m));
      const local = m.image.replace('https://fadischen.github.io/pages/lifelottery/', '');
      const dims = await page.evaluate(async (src) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve([i.naturalWidth, i.naturalHeight]); i.onerror = () => resolve(null); i.src = src; }), local);
      assert(dims && dims[0] === 1200 && dims[1] === 630, `og-image.png is 1200x630: ${dims}`);
    });

    await step('rural birthplaces read 「印度孟買近郊的鄉村」 on the reveal, never 「…的…附近的鄉村」', async () => {
      let found = null;
      for (let i = 0; i < 30 && !found; i++) {
        await page.evaluate(() => { localStorage.removeItem('lifelottery.save'); });
        await page.goto(`${BASE}?country=IND&seed=rural-${i}&debug=fast#/setup`);
        await page.click('button[type="submit"]');
        await page.waitForSelector('.birth-line', { state: 'visible' });
        const t = await facts();
        if (t.line.includes('近郊的鄉村')) found = t;
        else assert(!/附近的鄉村/.test(t.line), t.line);
      }
      assert(found, 'a rural start among 30 seeds');
      assert(/^你叫.+，出生在印度.+近郊的鄉村。$/.test(found.line) && !/印度的/.test(found.line), `line: ${found.line}`);
      assert(found.facts.some((f) => /近郊的鄉村$/.test(f) && !f.includes('印度')), `place fact: ${JSON.stringify(found.facts)}`);
      assert(!(await page.textContent('.screen-lottery')).includes('附近的鄉村'), 'no old phrasing anywhere on the reveal');
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
