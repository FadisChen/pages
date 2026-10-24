// Accessibility audit (PLAN Phase 5E): axe-core against every screen of the game, in light and dark.
//
//   npm install --no-save axe-core      (once, inside lifelottery/; node_modules is git-ignored)
//   node tests/a11y.mjs                 fails (exit 1) on any serious or critical violation, and on console errors
//   node tests/a11y.mjs --strict        also fails on moderate and minor violations
//   node tests/a11y.mjs --verbose       prints every violation node
//
// Without node_modules/axe-core the script says so and exits 0, so runs without the dev dependency do not break.
//
// Screens: landing, setup (with the 60-minute hint open), lottery reveal, life with a stage (focus) card, life with a choice card
// (and the family drawer over it), death, summary (with the share card), album (list), album detail, about, the full-screen map dialog, and the summary of a replayed
// life (重活 badge, comparison with the previous life, 同一起點 button). Each runs with the 'light' and the 'dark' colour scheme, on a
// 390px phone and a 1280px desktop.
// Animations are off (reduced motion) so axe never measures a colour in mid-fade.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const STRICT = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose');

const axePath = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
if (!fs.existsSync(axePath)) {
  console.log('a11y: node_modules/axe-core not found, skipping the accessibility audit.\n      Install it with:  cd lifelottery && npm install --no-save axe-core');
  process.exit(0);
}
const AXE_SOURCE = fs.readFileSync(axePath, 'utf8');
const AXE_VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'package.json'), 'utf8')).version; } catch (e) { return '?'; } })();

function loadPlaywright() {
  for (const c of ['playwright', '/opt/node22/lib/node_modules/playwright', '/usr/lib/node_modules/playwright', '/usr/local/lib/node_modules/playwright']) {
    try { return require(c); } catch (e) { /* try next */ }
  }
  throw new Error('Playwright not found. Install it or run with NODE_PATH pointing at the global modules.');
}
const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});
async function startServer(port) {
  const proc = spawn('npx', ['--yes', 'http-server', ROOT, '-p', String(port), '-c-1', '-s', '-a', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) return proc; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('http-server did not start');
}
const killServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch (e) { try { proc.kill('SIGTERM'); } catch (e2) { /* gone */ } } };

const FOCUS_CARD = '[data-role="focus-prompt"]';
const CHOICE_CARD = '.choice-card:not([data-role="focus-prompt"])';
const problems = [];       // console errors and page errors
const results = [];        // { scheme, screen, violations }

/** Run axe on the current page and record the violations under `screen`. */
async function audit(page, scheme, screen) {
  await page.waitForTimeout(250); // let layout and fonts settle
  await page.evaluate(AXE_SOURCE);
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help, url: v.helpUrl,
      nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 200), summary: (n.failureSummary || '').split('\n').slice(0, 3).join(' | ') })),
    }));
  });
  results.push({ scheme, screen, violations: res });
  const worst = res.length ? res.map((v) => v.impact).sort((a, b) => ['critical', 'serious', 'moderate', 'minor'].indexOf(a) - ['critical', 'serious', 'moderate', 'minor'].indexOf(b))[0] : 'none';
  console.log(`  ${res.length ? (worst === 'critical' || worst === 'serious' ? 'FAIL' : 'warn') : 'ok  '} ${scheme.padEnd(13)} ${screen.padEnd(28)} ${res.length ? `${res.length} rule(s), worst: ${worst}` : 'no violations'}`);
}

async function playUntil(page, selector, label, ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.$(selector)) return;
    if (/#\/death/.test(await page.evaluate(() => location.hash))) throw new Error(`the life ended before ${label} appeared`);
    // answer whatever is pending so the life keeps moving
    if (selector !== FOCUS_CARD && await page.$(FOCUS_CARD)) await page.evaluate(() => document.querySelector('[data-action="focus-confirm"]')?.click()).catch(() => {});
    if (selector !== CHOICE_CARD && await page.$(CHOICE_CARD)) await page.evaluate(() => document.querySelector('.choice-card .choice-btn')?.click()).catch(() => {});
    await page.waitForTimeout(30);
  }
  throw new Error(`${label} did not appear in time`);
}

async function playToDeath(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    if (/#\/death/.test(await page.evaluate(() => location.hash))) return;
    await page.evaluate(() => {
      document.querySelector('[data-action="focus-confirm"]')?.click();
      document.querySelector('.choice-card .choice-btn')?.click();
    }).catch(() => {});
    await page.waitForTimeout(30);
  }
  throw new Error('the life did not end in time');
}

const playwright = loadPlaywright();
const port = await freePort();
const server = await startServer(port);
const BASE = `http://127.0.0.1:${port}/?debug=fast`;
let browser;
let fatal = null;
try {
  const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await playwright.chromium.launch(exe ? { executablePath: exe } : {});
  console.log(`axe-core ${AXE_VERSION}${STRICT ? ' (strict: moderate and minor also fail)' : ''}`);

  const VIEWPORTS = [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]];
  for (const [vpName, viewport] of VIEWPORTS) for (const colors of ['light', 'dark']) {
    const scheme = `${colors}/${vpName}`;
    console.log(`\n${scheme}`);
    const ctx = await browser.newContext({ viewport, colorScheme: colors, reducedMotion: 'reduce', acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${scheme}] console.error: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`[${scheme}] pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (!/favicon/.test(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`[${scheme}] requestfailed: ${r.url()}`); });

    await page.goto(`${BASE}&seed=a11y-${colors}-${vpName}`);
    await page.waitForSelector('.ticker-num');
    await audit(page, scheme, 'landing');

    await page.click('[data-action="start"]');
    await page.waitForSelector('.setup-form');
    await page.check('#pace-long');          // opens the 60-minute hint
    await page.waitForSelector('[data-role="pace-long-hint"]:not([hidden])');
    await audit(page, scheme, 'setup (60 min hint open)');
    await page.check('#pace-short');

    await page.click('button[type="submit"]');
    await page.waitForSelector('.birth-country', { state: 'visible' });
    await audit(page, scheme, 'lottery reveal');

    await page.click('[data-action="begin"]');
    await page.waitForSelector('.life-name');
    await playUntil(page, FOCUS_CARD, 'the focus card');
    await audit(page, scheme, 'life: focus card');
    await page.evaluate(() => document.querySelector('[data-action="focus-confirm"]')?.click());
    await playUntil(page, CHOICE_CARD, 'a choice card');
    await audit(page, scheme, 'life: choice card');
    await page.click('[data-action="family"]');
    await page.waitForSelector('dialog.drawer[open]');
    await audit(page, scheme, 'life: family drawer');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.drawer', { state: 'detached' }).catch(() => {});
    await page.evaluate(() => document.querySelector('.choice-card .choice-btn')?.click());

    await playToDeath(page);
    await page.waitForSelector('.death-title');
    await audit(page, scheme, 'death');
    await page.click('[data-action="to-summary"]');
    await page.waitForSelector('.review-hero');
    await page.waitForSelector('#share-canvas');
    await audit(page, scheme, 'summary');

    // the full-screen map
    await page.evaluate(() => document.querySelector('.map-card button.wm-wrap').scrollIntoView({ block: 'center' }));
    await page.click('.map-card button.wm-wrap');
    await page.waitForSelector('dialog.mapzoom[open] .mz-stage');
    await audit(page, scheme, 'map zoom dialog');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.mapzoom', { state: 'detached' });

    await page.goto(`${BASE}#/album`);
    await page.waitForSelector('.album-card');
    await audit(page, scheme, 'album');
    await page.click('.album-link');
    await page.waitForSelector('.review-hero');
    await audit(page, scheme, 'album detail');

    // 同一起點，再活一次: lottery with the 重活 note, then the summary with the comparison
    await page.click('[data-action="replay"]');
    await page.waitForSelector('[data-role="replay-note"]');
    await page.waitForSelector('.birth-country', { state: 'visible' });
    await audit(page, scheme, 'lottery reveal (replay)');
    await page.click('[data-action="begin"]');
    await playToDeath(page);
    await page.waitForSelector('.death-title');
    await page.click('[data-action="to-summary"]');
    await page.waitForSelector('[data-role="replay-compare"]');
    await audit(page, scheme, 'summary (replay compare)');

    await page.goto(`${BASE}#/about`);
    await page.waitForSelector('.screen-about');
    await audit(page, scheme, 'about');

    // The life screen holds whatever the events produce (chips, results, milestones): audit a few more lives at their choice cards
    if (vpName === 'phone') {
      for (const k of [1, 2, 3]) {
        await page.goto(`${BASE}&seed=a11y-extra-${colors}-${k}#/setup`);
        await page.waitForSelector('.setup-form');
        await page.check('#pace-short');
        await page.click('button[type="submit"]');
        await page.waitForSelector('[data-action="begin"]', { state: 'visible' });
        await page.click('[data-action="begin"]');
        for (let n = 1; n <= 3; n++) {
          await playUntil(page, CHOICE_CARD, `choice card ${n} of life ${k}`);
          await audit(page, scheme, `life ${k}, choice ${n} (age ${await page.evaluate(() => document.querySelector('.life-meta')?.textContent.match(/\d+/)?.[0] ?? '?')})`);
          await page.evaluate(() => document.querySelector('.choice-card .choice-btn')?.click());
        }
        await playToDeath(page);
        await page.waitForSelector('.death-title');
        await page.click('[data-action="to-summary"]');
        await page.waitForSelector('.review-hero');
        await audit(page, scheme, `summary of life ${k}`);
        await page.goto(`${BASE}#/`);
        await page.waitForSelector('.ticker-num');
      }
    }
    await ctx.close();
  }
} catch (e) {
  fatal = e;
  console.error(`\nthe audit could not finish: ${e && e.stack || e}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  killServer(server);
}

// ---- report ------------------------------------------------------------------------------------------------------------
const order = ['critical', 'serious', 'moderate', 'minor'];
const totals = Object.fromEntries(order.map((k) => [k, 0]));
const byRule = new Map();
for (const r of results) {
  for (const v of r.violations) {
    totals[v.impact] = (totals[v.impact] || 0) + v.nodes.length;
    const key = `${v.impact}\t${v.id}`;
    const entry = byRule.get(key) || { help: v.help, screens: new Set(), nodes: 0 };
    entry.screens.add(`${r.screen} (${r.scheme})`);
    entry.nodes += v.nodes.length;
    byRule.set(key, entry);
    if (VERBOSE) for (const n of v.nodes) console.log(`    [${r.scheme}] ${r.screen}: ${v.id} ${n.target}\n        ${n.html}\n        ${n.summary}`);
  }
}
console.log(`\nviolating nodes: ${order.map((k) => `${k} ${totals[k]}`).join(', ')}   (${results.length} screens audited)`);
for (const [key, e] of [...byRule].sort()) {
  const [impact, id] = key.split('\t');
  console.log(` - ${impact.padEnd(8)} ${id}: ${e.help} — ${e.nodes} node(s) on ${[...e.screens].slice(0, 4).join('; ')}${e.screens.size > 4 ? '; ...' : ''}`);
}
if (problems.length) console.log(`\nconsole problems:\n${problems.slice(0, 20).map((p) => ` - ${p}`).join('\n')}`);

const bad = totals.critical + totals.serious + (STRICT ? totals.moderate + totals.minor : 0);
const ok = !fatal && bad === 0 && problems.length === 0;
console.log(ok ? '\na11y: pass' : `\na11y: FAIL${fatal ? ' (audit incomplete)' : ''}${bad ? ` — ${bad} violating node(s)` : ''}${problems.length ? ` — ${problems.length} console problem(s)` : ''}`);
process.exit(ok ? 0 : 1);
