// End-to-end test for PLAN 5.2 (adaptive pacing): Playwright + Chromium against `npx http-server lifelottery`.
//
//   node lifelottery/tests/e2e-pacing.mjs
//
// Environment (all optional, same as e2e.mjs):
//   LL_SHOTS=<dir>      where screenshots go (default: <os tmp>/lifelottery-pacing-shots)
//   LL_PORT=<port>      http-server port (default: a free port)
//   LL_CHROMIUM=<path>  Chromium executable (default: /opt/pw-browsers/chromium when present)
//   LL_ONLY=<regex>     run only the steps whose name matches
//
// How it measures real pacing without waiting an hour: `?debug=scale=N` divides every time by N, so a 10-minute life
// takes 10 * 60 / N seconds. The life screen publishes what it planned on its root element (data-load, data-dwell-ms,
// data-plan, data-expected-years); an in-page recorder timestamps each plan and each choice card, so the test can compare
// the time the clock really took with the plan, the plan with the target, and quiet years with event years.
//
// Covers: the allocation model on 200 engine lives per pace (+-15% of the target, quiet < event, floors), a full life on
// auto-choice at two paces (real total length, per-category timings), speed multipliers, next-year skip, pause (button and
// Space), choice cards stopping time, hold-to-accelerate by pointer and by Shift (tap / drag / buttons do not count, cancel
// on pointercancel), the per-year progress cue, existing shortcuts untouched, reduced motion, ?debug=fast and bad scale
// values, and zero console errors. Mobile screenshots of a quiet year, an event year and a hold go to LL_SHOTS.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLife, advanceYear, autoChoose } from '../js/engine/life.js';
import { lifespanComparison } from '../js/engine/summary.js';
import { createPacer, loadOf, dwellSeconds, baseSecondsPerYear, parseDebug, PACING, TARGET_MINUTES } from '../js/ui/pacing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.LL_SHOTS || path.join(os.tmpdir(), 'lifelottery-pacing-shots');
fs.mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Tooling (same shape as e2e.mjs)
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
const ONLY = process.env.LL_ONLY ? new RegExp(process.env.LL_ONLY, 'i') : null;   // run only the steps whose name matches (debugging aid)
async function step(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const quantile = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };

const consoleProblems = [];
function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error') consoleProblems.push(`[${label}] console.error: ${m.text()}`); });
  page.on('pageerror', (e) => consoleProblems.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!/favicon/.test(u) && r.failure()?.errorText !== 'net::ERR_ABORTED') consoleProblems.push(`[${label}] requestfailed: ${u} ${r.failure()?.errorText}`);
  });
}
const waitHash = (page, re, timeout = 90000) => page.waitForFunction((src) => new RegExp(src).test(location.hash), re.source, { timeout });

let shotCount = 0;
async function shot(page, name) {
  await page.waitForTimeout(250);
  for (let i = 0, prev = -1; i < 40; i++) { const y = await page.evaluate(() => Math.round(scrollY)); if (y === prev) break; prev = y; await page.waitForTimeout(80); }
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  shotCount++;
}

// ---------------------------------------------------------------------------------------------
// In-page recorder and life helpers
// ---------------------------------------------------------------------------------------------

/**
 * Installed before any page script. Records, with performance.now() timestamps:
 *  plans  - every time the life screen planned a dwell (data-plan changes): load kind, planned ms, age on screen
 *  cards  - choice / focus cards opening and closing (time stops while one is open)
 *  dying  - when the screen started to fade out
 */
function recorderScript() {
  window.__rec = { plans: [], cards: [], dying: null };
  const ageNow = () => { const m = /(\d+)/.exec(document.querySelector('.life-age')?.textContent || ''); return m ? Number(m[1]) : null; };
  const attach = (sc) => {
    const snap = () => window.__rec.plans.push({ t: performance.now(), plan: Number(sc.dataset.plan), load: sc.dataset.load, dwellMs: Number(sc.dataset.dwellMs), age: ageNow() });
    new MutationObserver(snap).observe(sc, { attributes: true, attributeFilter: ['data-plan'] });
    if (sc.dataset.plan) snap();
    new MutationObserver(() => { if (sc.classList.contains('is-dying') && window.__rec.dying == null) window.__rec.dying = performance.now(); })
      .observe(sc, { attributes: true, attributeFilter: ['class'] });
    const host = sc.querySelector('.choice-host');
    let open = false;
    new MutationObserver(() => {
      const has = !!host.querySelector('.choice-card');
      if (has !== open) { open = has; window.__rec.cards.push({ t: performance.now(), open }); }
    }).observe(host, { childList: true });
  };
  new MutationObserver(() => {
    const sc = document.querySelector('.screen-life');
    if (sc && !sc.__attached) { sc.__attached = true; attach(sc); }
  }).observe(document, { childList: true, subtree: true });
}

/** Seconds (real) each plan really lasted, with the time cards were open taken out. */
function durations(rec) {
  const plans = rec.plans;
  const out = [];
  for (let i = 0; i < plans.length; i++) {
    const t0 = plans[i].t;
    const t1 = i + 1 < plans.length ? plans[i + 1].t : rec.dying;
    if (t1 == null) break;
    let cardMs = 0, openedAt = null;
    for (const c of rec.cards) {
      if (c.open) openedAt = c.t;
      else if (openedAt != null) { cardMs += Math.max(0, Math.min(c.t, t1) - Math.max(openedAt, t0)); openedAt = null; }
    }
    if (openedAt != null && openedAt < t1) cardMs += t1 - Math.max(openedAt, t0);
    out.push({ ...plans[i], realMs: t1 - t0 - cardMs, spanMs: t1 - t0 });
  }
  return out;
}

/** Walk the setup screen and begin a life. */
async function startLife(page, BASE, { seed, scale = 1, pace = 'standard', auto = false, country = 'TWN', fast = false, query = '' }) {
  const dbg = fast ? 'debug=fast' : (query || `debug=scale=${scale}`);
  await page.goto(`${BASE}?${dbg}&seed=${seed}&country=${country}`);
  await page.click('[data-action="start"]');
  await waitHash(page, /#\/setup/);
  await page.check(`#pace-${pace}`);
  await page.check('#era-present');
  await page.setChecked('#autoChoice', auto);
  await page.click('button[type="submit"]');
  await waitHash(page, /#\/lottery/);
  await page.waitForSelector('[data-action="begin"]');
  await page.click('[data-action="begin"]', { timeout: 60000 });
  await waitHash(page, /#\/life/);
  await page.waitForSelector('.screen-life[data-plan]');
}

const readScreen = (page) => page.evaluate(() => {
  const sc = document.querySelector('.screen-life');
  const m = /(\d+)/.exec(document.querySelector('.life-age')?.textContent || '');
  return {
    plan: Number(sc.dataset.plan), load: sc.dataset.load, dwellMs: Number(sc.dataset.dwellMs), expected: Number(sc.dataset.expectedYears),
    age: m ? Number(m[1]) : null, boosting: sc.classList.contains('is-boosting'), paused: sc.classList.contains('is-paused'),
    choosing: sc.classList.contains('is-choosing'), chip: !document.querySelector('[data-role="boost-chip"]').hidden,
    yp: parseFloat(document.querySelector('.timeline').style.getPropertyValue('--yp') || '0'),
    hash: location.hash,
  };
});
const waitPlan = (page, after, timeout = 60000) => page.waitForFunction((n) => Number(document.querySelector('.screen-life')?.dataset.plan) > n, after, { timeout, polling: 5 });

/** Answer any focus card or choice card that is open (first option); returns true when one was answered. */
async function answerCards(page) {
  return page.evaluate(() => {
    const f = document.querySelector('[data-action="focus-confirm"]');
    if (f) { f.click(); return true; }
    const b = document.querySelector('.choice-card .choice-btn');
    if (b) { b.click(); return true; }
    return false;
  });
}

/** Let a manual game run (answering cards) until `fn` returns truthy; polls every 20 ms. */
async function until(page, fn, timeout = 60000) {
  const t0 = Date.now();
  for (;;) {
    await answerCards(page);
    const r = await fn();
    if (r) return r;
    if (Date.now() - t0 > timeout) throw new Error('timed out waiting for the game');
    await sleep(20);
  }
}

/**
 * Jump (with the skip button, answering cards on the way) to a year that has just started and will stay at least `minMs`
 * (real ms at 1x), so a timing test is not at the mercy of whatever the clock was in the middle of.
 */
async function freshYear(page, minMs, { kinds = null } = {}) {
  for (let i = 0; i < 400; i++) {
    await answerCards(page);
    const st = await readScreen(page);
    if (!st.choosing && !st.paused && st.dwellMs >= minMs && st.yp < 0.08 && (!kinds || kinds.includes(st.load))) return st;
    if (!st.choosing) await page.evaluate(() => document.querySelector('[data-action="next-year"]')?.click());
    await sleep(25);
  }
  throw new Error(`no year of at least ${minMs} ms found`);
}

// ---------------------------------------------------------------------------------------------
// Model checks on real engine lives (no browser)
// ---------------------------------------------------------------------------------------------

const isPending = (e, pc) => !!pc && e.kind === 'event' && e.title === pc.title && e.text === pc.text;

/** Play a life like the screen does and return, for each moment the screen pauses on, the entries shown and the age. */
function dwellMoments(seed, era) {
  const s = createLife({ era }, seed);
  const le = lifespanComparison(s).countryLe;
  const moments = [{ entries: s.log.filter((e) => e.age === 0), age: 0, intro: true }];
  let guard = 0;
  while (s.alive && guard++ < 130) {
    const r = advanceYear(s, { auto: false });
    if (r.died && !r.pendingChoice) break;
    const pc = r.pendingChoice;
    if (pc) {
      const o = autoChoose(s);
      if (o.died) break;
      moments.push({ entries: o.entries, age: s.age, outcome: true });
    } else if (!r.died) {
      moments.push({ entries: r.entries.filter((e) => !isPending(e, pc)), age: s.age });
    }
    if (r.died) break;
  }
  return { le, moments, lived: s.age };
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
  console.log('\nAllocation model (pure, 200 engine lives per pace)');

  await step('?debug= parsing: fast, scale=N, both, junk', async () => {
    assert(parseDebug('?debug=fast').fast && parseDebug('?debug=fast').scale === 1, 'fast');
    assert(parseDebug('?debug=scale=30').scale === 30 && !parseDebug('?debug=scale=30').fast, 'scale=30');
    assert(parseDebug('?debug=scale=2.5,fast').scale === 2.5 && parseDebug('?debug=scale=2.5,fast').fast, 'scale=2.5,fast');
    for (const bad of ['', '?debug=scale=0', '?debug=scale=abc', '?debug=scale=-4', '?x=1']) assert(parseDebug(bad).scale === 1 && !parseDebug(bad).fast, `junk: ${bad}`);
  });

  await step('quiet years are brisk but never instant, events get a comfortable read, quiet < event', async () => {
    for (const pace of Object.keys(TARGET_MINUTES)) {
      for (const le of [52, 72, 85]) {
        const base = baseSecondsPerYear(pace, le);
        const quiet = dwellSeconds({ quiet: true, empty: false, chars: 40, entries: 1, milestones: 0 }, { pace, expectedYears: le });
        const quietLong = dwellSeconds({ quiet: true, empty: false, chars: 70, entries: 1, milestones: 0 }, { pace, expectedYears: le });
        assert(quiet >= PACING.QUIET_MIN - 1e-9, `${pace}/${le}: quiet ${quiet} below the minimum`);
        if (base * PACING.QUIET_LO >= PACING.QUIET_MIN && base * PACING.QUIET_HI <= PACING.QUIET_MAX) {
          assert(quiet >= base * PACING.QUIET_LO - 1e-9 && quietLong <= base * PACING.QUIET_HI + 1e-9, `${pace}/${le}: quiet ${quiet}..${quietLong} outside ${PACING.QUIET_LO}-${PACING.QUIET_HI} of base ${base}`);
        }
        let prev = 0;
        for (const chars of [20, 60, 120, 240, 330]) {
          const ev = dwellSeconds({ quiet: false, empty: false, chars, entries: 1, milestones: 0 }, { pace, expectedYears: le });
          assert(ev >= PACING.EVENT_MIN - 1e-9, `${pace}/${le}: ${chars}-char event ${ev}s is under the minimum dwell`);
          assert(ev >= PACING.ORIENT_FAST + chars / PACING.CPS_FAST - 1e-9, `${pace}/${le}: ${chars}-char event ${ev}s is faster than a fast reader`);
          assert(ev >= prev - 1e-9, `${pace}/${le}: dwell must not shrink as text grows`);
          prev = ev;
          assert(ev <= PACING.EVENT_MAX + 1e-9, 'cap');
        }
        const ev40 = dwellSeconds({ quiet: false, empty: false, chars: 40, entries: 1, milestones: 0 }, { pace, expectedYears: le });
        assert(quiet < ev40 * 1.001 || quiet <= PACING.QUIET_MIN + 1e-9 || base * PACING.QUIET_HI >= ev40, `${pace}/${le}: a quiet year (${quiet}) should not outlast an event of the same length (${ev40})`);
      }
    }
  });

  const modelByPace = {};
  await step('simulated lives: total length within +-15% of the chosen minutes (scaled to the years actually lived)', async () => {
    const lives = [];
    const eras = ['past', 'present', 'present', 'future'];
    for (let i = 0; i < 200; i++) lives.push(dwellMoments(`pace-model-${i}`, eras[i % eras.length]));
    for (const pace of Object.keys(TARGET_MINUTES)) {
      const T = TARGET_MINUTES[pace] * 60;
      const ratios = [], quiet = [], event = [], totalsFull = [];
      for (const l of lives) {
        const pacer = createPacer({ pace, expectedYears: l.le });
        let total = 0;
        for (const m of l.moments) {
          const load = loadOf(m.entries);
          const sec = pacer.plan(load, m.age, m.intro ? { cap: PACING.INTRO_MAX } : undefined);
          total += sec;
          if (!m.outcome && !m.intro) (load.quiet ? quiet : event).push(sec);
          else if (m.outcome) event.push(sec);
        }
        if (l.lived >= 20) ratios.push(total / (T * l.lived / l.le));
        if (l.lived >= 0.9 * l.le && l.lived <= 1.1 * l.le) totalsFull.push(total / (T * l.lived / l.le));
      }
      const inside = ratios.filter((r) => Math.abs(r - 1) <= 0.15).length / ratios.length;
      modelByPace[pace] = { n: ratios.length, inside, mean: mean(ratios), quietMean: mean(quiet), eventMean: mean(event), full: totalsFull };
      assert(ratios.length >= 100, `only ${ratios.length} lives reached 20 years`);
      assert(inside >= 0.95, `${pace}: only ${(inside * 100).toFixed(1)}% of lives within +-15% of target`);
      assert(Math.abs(mean(ratios) - 1) <= 0.05, `${pace}: mean ratio ${mean(ratios).toFixed(3)} is off target by more than 5%`);
      assert(totalsFull.length < 5 || totalsFull.every((r) => Math.abs(r - 1) <= 0.15), `${pace}: a near-average life is outside +-15%: ${totalsFull.map((r) => r.toFixed(2))}`);
      assert(mean(quiet) < 0.6 * mean(event), `${pace}: quiet mean ${mean(quiet).toFixed(1)}s vs event mean ${mean(event).toFixed(1)}s`);
      assert(Math.min(...event) >= PACING.EVENT_MIN - 1e-9, `${pace}: an event year under the minimum dwell`);
    }
    console.log('       ' + Object.entries(modelByPace).map(([p, m]) => `${p}: ${(m.inside * 100).toFixed(0)}% within +-15%, mean ${(m.mean * 100).toFixed(1)}%, quiet ${m.quietMean.toFixed(1)}s, event ${m.eventMean.toFixed(1)}s`).join(' | '));
  });

  await step('a resumed life starts on schedule, and a lagging life is stretched, a leading one squeezed (within the clamp)', async () => {
    const p = createPacer({ pace: 'standard', expectedYears: 80, age: 30 });
    assert(Math.abs(p.gain(30) - 1) < 1e-9, 'resume is neutral');
    const behind = createPacer({ pace: 'standard', expectedYears: 80, age: 0 });
    assert(behind.gain(20) > 1 && behind.gain(20) <= PACING.G_MAX, 'behind schedule: stretch');
    const ahead = createPacer({ pace: 'standard', expectedYears: 80, age: 40 });
    assert(ahead.gain(10) < 1 && ahead.gain(10) >= PACING.G_MIN, 'ahead of schedule: squeeze');
  });

  // =========================================================================================
  console.log('\nThe life screen, in a real browser (?debug=scale=N)');
  const exe = process.env.LL_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  browser = await playwright.chromium.launch(exe ? { executablePath: exe } : {});
  const MOBILE = { width: 390, height: 844 };

  // ---- full lives on auto-choice -------------------------------------------------------------
  const lifeRuns = [];
  for (const { pace, scale, seed } of [{ pace: 'short', scale: 25, seed: 'pace-full-a' }, { pace: 'standard', scale: 70, seed: 'pace-full-b' }]) {
    await step(`full life, ${pace} pace at scale ${scale}: real timings follow the plan and the total matches ${TARGET_MINUTES[pace]} minutes`, async () => {
      let result = null;
      for (let attempt = 0; attempt < 4 && !result; attempt++) {
        const ctx = await browser.newContext({ viewport: MOBILE });
        await ctx.addInitScript(recorderScript);
        const page = await ctx.newPage();
        watch(page, `full-${pace}`);
        await startLife(page, BASE, { seed: `${seed}-${attempt}`, scale, pace, auto: true });
        const { expected } = await readScreen(page);
        await waitHash(page, /#\/death/, 240000);
        const rec = await page.evaluate(() => window.__rec);
        await ctx.close();
        const ds = durations(rec);
        const lived = Math.max(...ds.map((d) => d.age));
        if (lived >= 25) result = { ds, lived, expected, rec };
      }
      assert(result, 'no seed lived 25 years in four tries');
      const { ds, lived, expected } = result;
      const T = TARGET_MINUTES[pace] * 60;
      const realTotal = ds.reduce((n, d) => n + d.realMs, 0) / 1000 * scale;
      const plannedTotal = ds.reduce((n, d) => n + d.dwellMs, 0) / 1000 * scale;
      const ratio = realTotal / (T * lived / expected);
      const q = ds.filter((d) => d.load === 'quiet'), ev = ds.filter((d) => d.load === 'event' && d.plan > 1);
      assert(q.length >= 3 && ev.length >= 10, `too few years to compare: quiet ${q.length}, event ${ev.length}`);
      const qMean = mean(q.map((d) => d.realMs)), eMean = mean(ev.map((d) => d.realMs));
      lifeRuns.push({ pace, scale, lived, expected, realTotalMin: realTotal / 60, plannedTotalMin: plannedTotal / 60, ratio, qMean: qMean * scale / 1000, eMean: eMean * scale / 1000, nq: q.length, ne: ev.length });
      console.log(`       lived ${lived} of ~${expected} years: real ${(realTotal / 60).toFixed(2)} min (plan ${(plannedTotal / 60).toFixed(2)}), ${(ratio * 100).toFixed(1)}% of target; quiet ${(qMean * scale / 1000).toFixed(1)}s (n=${q.length}), event ${(eMean * scale / 1000).toFixed(1)}s (n=${ev.length}) [unscaled seconds]`);
      assert(qMean < 0.6 * eMean, `quiet years (${qMean.toFixed(0)} ms) should be clearly shorter than event years (${eMean.toFixed(0)} ms)`);
      // the clock does what the plan says (timer granularity on a loaded machine is a few frames)
      assert(Math.abs(realTotal / plannedTotal - 1) <= 0.12, `real ${realTotal.toFixed(0)}s vs planned ${plannedTotal.toFixed(0)}s (unscaled)`);
      assert(Math.abs(ratio - 1) <= 0.15, `total length ${(ratio * 100).toFixed(1)}% of target, outside +-15%`);
      for (const d of ds) {
        if (d.load === 'event' && d.plan > 1) assert(d.dwellMs * scale >= PACING.EVENT_MIN * 1000 - 20, `event year planned ${d.dwellMs * scale} ms (unscaled), under the minimum dwell`);
        if (d.load === 'quiet') assert(d.dwellMs * scale >= PACING.QUIET_MIN * 1000 - 20, `quiet year planned ${d.dwellMs * scale} ms, instant`);
      }
      // the screen kept time per category: mean real vs planned per category within 15%
      for (const cat of ['quiet', 'event']) {
        const set = ds.filter((d) => d.load === cat);
        const r = mean(set.map((d) => d.realMs)) / mean(set.map((d) => d.dwellMs));
        assert(Math.abs(r - 1) <= 0.15, `${cat} years: real/planned ${r.toFixed(2)}`);
      }
    });
  }

  // ---- speed, skip, pause, choices ------------------------------------------------------------
  await step('speed multipliers: 1x follows the plan, 4x takes a quarter, 2x half; the choice is remembered', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'speed');
    await startLife(page, BASE, { seed: 'pace-speed-1', scale: 6, pace: 'standard' });
    const ratios = {};
    for (const sp of [1, 4, 2]) {
      await page.click(`[data-speed="${sp}"]`);
      assert((await page.getAttribute(`[data-speed="${sp}"]`, 'aria-pressed')) === 'true', `${sp}x pressed`);
      const n0 = (await readScreen(page)).plan;
      const target = n0 + 3;
      await until(page, async () => (await readScreen(page)).plan >= target);
      const rec = await page.evaluate(() => window.__rec);
      const ds = durations({ ...rec, dying: rec.plans[rec.plans.length - 1].t }).filter((d) => d.plan > n0 + 0 && d.plan < target && d.dwellMs > 400);
      // the first plan after the click started counting before the click: skip it
      const use = ds.slice(1);
      assert(use.length >= 1, `no plan to measure at ${sp}x`);
      ratios[sp] = mean(use.map((d) => d.realMs / d.dwellMs));
    }
    assert(Math.abs(ratios[1] - 1) <= 0.2, `1x real/planned ${ratios[1]}`);
    assert(Math.abs(ratios[4] - 0.25) <= 0.1, `4x real/planned ${ratios[4]}`);
    assert(Math.abs(ratios[2] - 0.5) <= 0.15, `2x real/planned ${ratios[2]}`);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lifelottery.settings')).speed);
    assert(saved === 2, `speed persisted: ${saved}`);
    await ctx.close();
  });

  await step('next year skips at once and restarts the wait; pause and Space stop the clock; N and the arrow key skip too', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'skip');
    await startLife(page, BASE, { seed: 'pace-skip-1', scale: 3, pace: 'standard' });
    let st = await readScreen(page);
    // next-year button
    const a0 = st.age;
    await page.click('[data-action="next-year"]');
    await until(page, async () => (await readScreen(page)).age > a0);
    st = await readScreen(page);
    assert(st.age === a0 + 1, `age after skip ${st.age} (from ${a0})`);
    // after a skip the new year gets its full planned wait: the plan is fresh and the ring starts again
    assert(st.yp < 0.35, `progress restarts after a skip: ${st.yp}`);
    const planAfterSkip = st.plan;
    // N and ArrowRight
    for (const key of ['n', 'ArrowRight']) {
      const before = (await readScreen(page));
      if (before.choosing) await until(page, async () => !(await readScreen(page)).choosing);
      const age = (await readScreen(page)).age;
      await page.evaluate(() => document.activeElement && document.activeElement.blur()); // ArrowRight on a focused button is the button's own
      await page.keyboard.press(key);
      await until(page, async () => (await readScreen(page)).age > age, 5000);
    }
    assert((await readScreen(page)).plan > planAfterSkip, 'plans moved on');
    // pause: button, then Space
    await until(page, async () => !(await readScreen(page)).choosing);
    await page.click('[data-action="toggle-pause"]');
    let s1 = await readScreen(page);
    assert(s1.paused, 'paused class');
    assert(await page.isVisible('.paused-chip'), 'paused chip shown');
    await sleep(Math.max(1500, s1.dwellMs * 1.6));
    let s2 = await readScreen(page);
    assert(s2.age === s1.age && s2.plan === s1.plan, `a paused game must not advance (${s1.age} -> ${s2.age})`);
    // holding and Shift while paused do not run the clock either
    await page.keyboard.down('Shift');
    await sleep(150);
    assert(!(await readScreen(page)).boosting, 'no boost while paused');
    await page.keyboard.up('Shift');
    await page.keyboard.press(' ');
    await sleep(150);
    assert(!(await readScreen(page)).paused, 'Space resumed');
    await page.keyboard.press(' ');
    assert((await readScreen(page)).paused, 'Space paused again');
    await page.keyboard.press(' ');
    // next-year while paused still works as a deliberate skip
    await page.click('[data-action="toggle-pause"]');
    const ageP = (await readScreen(page)).age;
    await page.click('[data-action="next-year"]');
    await until(page, async () => (await readScreen(page)).age > ageP, 5000);
    await page.click('[data-action="toggle-pause"]');
    await ctx.close();
  });

  await step('a choice card stops time (as before); the outcome is then paced by its text', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'choice');
    await startLife(page, BASE, { seed: 'pace-choice-1', scale: 20, pace: 'standard' });
    // skip ahead year by year until a choice card is open
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      if (await page.$('[data-action="focus-confirm"]')) { await page.evaluate(() => document.querySelector('[data-action="focus-confirm"]').click()); continue; }
      if (await page.$('.choice-card .choice-btn')) { found = true; break; }
      await page.click('[data-action="next-year"]', { timeout: 3000 }).catch(() => {});
      await sleep(30);
    }
    assert(found, 'no choice card in 80 years');
    const s1 = await readScreen(page);
    assert(s1.choosing, 'is-choosing class');
    await sleep(1500); // far longer than any planned year at this scale
    const s2 = await readScreen(page);
    assert(s2.age === s1.age && s2.plan === s1.plan && s2.choosing, 'time must stay stopped while a choice is open');
    assert((await page.$$('.choice-card')).length === 1, 'the card is still there');
    // the next-year button is disabled while a card is open
    assert(await page.isDisabled('[data-action="next-year"]'), 'next-year disabled during a choice');
    const ringHidden = await page.evaluate(() => { const b = document.querySelector('.timeline > .entry:last-child .entry-body'); return b ? getComputedStyle(b, '::after').display : 'no-entry'; });
    assert(ringHidden === 'none', `the progress ring is hidden while a card is open: ${ringHidden}`);
    await page.evaluate(() => document.querySelector('.choice-card .choice-btn').click());
    await page.waitForFunction((n) => Number(document.querySelector('.screen-life').dataset.plan) > n, s1.plan, { timeout: 2000 });
    const s3 = await readScreen(page);
    assert(s3.load === 'event' && !s3.choosing && s3.dwellMs * 20 >= PACING.EVENT_MIN * 1000 - 20, `outcome plan: ${JSON.stringify(s3)}`);
    await ctx.close();
  });

  // ---- hold to accelerate ---------------------------------------------------------------------
  await step('hold the timeline: the clock runs about 6x until release; taps, drags and buttons do not count', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'hold');
    await startLife(page, BASE, { seed: 'pace-hold-1', scale: 3, pace: 'standard' });
    await page.click('[data-speed="1"]');
    const textPoint = async () => {
      const box = await page.locator('.timeline .entry:last-child .entry-text').first().boundingBox();
      return { x: box.x + Math.min(box.width / 2, 60), y: Math.max(130, Math.min(box.y + box.height / 2, 600)) };
    };
    const fresh = (minMs) => freshYear(page, minMs);
    // a tap does nothing
    let st = await fresh(1400);
    let p = await textPoint();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down(); await sleep(120); await page.mouse.up();
    await sleep(500);
    assert(!(await readScreen(page)).boosting, 'a short tap must not boost');
    // dragging before the delay (a scroll gesture) does nothing
    st = await fresh(1400);
    p = await textPoint();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y + 40, { steps: 4 });
    await sleep(PACING.HOLD_DELAY_MS + 250);
    assert(!(await readScreen(page)).boosting, 'moving past the slop before the delay cancels the hold');
    await page.mouse.up();
    // pressing a button for a long time is not a hold on the timeline
    st = await fresh(1400);
    const sp = await page.locator('[data-speed="1"]').boundingBox();
    await page.mouse.move(sp.x + sp.width / 2, sp.y + sp.height / 2);
    await page.mouse.down(); await sleep(PACING.HOLD_DELAY_MS + 250);
    assert(!(await readScreen(page)).boosting, 'a button press is not a hold');
    await page.mouse.up();
    // a real hold
    st = await fresh(3000);
    p = await textPoint();
    const t0 = Date.now();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('.screen-life').classList.contains('is-boosting'), null, { timeout: 2000 });
    const held = await readScreen(page);
    assert(held.chip, 'the 快轉中 chip is visible while holding');
    assert(Date.now() - t0 >= PACING.HOLD_DELAY_MS - 60, `boost came too early: ${Date.now() - t0} ms`);
    await waitPlan(page, st.plan);
    const took = Date.now() - t0;
    await page.mouse.up();
    // unboosted it would take the full dwell; the expected time is delay + (dwell - delay) / boost
    const expectMs = PACING.HOLD_DELAY_MS + (st.dwellMs - PACING.HOLD_DELAY_MS) / PACING.HOLD_BOOST;
    assert(took < st.dwellMs * 0.55, `holding took ${took} ms against a ${st.dwellMs} ms plan (expected about ${Math.round(expectMs)} ms)`);
    await page.waitForFunction(() => !document.querySelector('.screen-life').classList.contains('is-boosting'), null, { timeout: 1000 });
    assert(!(await readScreen(page)).chip, 'chip hidden after release');
    // after release the clock is back to 1x: the next year takes about its plan
    const after = await fresh(2500);
    const tA = Date.now();
    await waitPlan(page, after.plan);
    const slow = Date.now() - tA;
    assert(slow > after.dwellMs * 0.6, `after release a year took ${slow} ms against a ${after.dwellMs} ms plan: still fast?`);
    // pointercancel (the browser takes over for a scroll) ends a hold
    st = await fresh(3000);
    p = await textPoint();
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('.screen-life').classList.contains('is-boosting'), null, { timeout: 2000 });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, isPrimary: true })));
    await sleep(80);
    assert(!(await readScreen(page)).boosting, 'pointercancel ends the hold');
    await page.mouse.up();
    await ctx.close();
  });

  await step('keyboard: holding Shift accelerates, releasing restores; existing shortcuts (Space, N, A, F, G, 1-3) keep working', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'shift');
    await startLife(page, BASE, { seed: 'pace-shift-1', scale: 3, pace: 'standard' });
    await page.click('[data-speed="1"]');
    const fresh = (minMs) => freshYear(page, minMs);
    const st = await fresh(3000);
    const t0 = Date.now();
    await page.keyboard.down('Shift');
    await sleep(60);
    const mid = await readScreen(page);
    assert(mid.boosting && mid.chip, 'Shift boosts and shows the chip');
    await waitPlan(page, st.plan);
    const took = Date.now() - t0;
    await page.keyboard.up('Shift');
    assert(took < st.dwellMs * 0.5, `Shift hold took ${took} ms against a ${st.dwellMs} ms plan`);
    await sleep(60);
    assert(!(await readScreen(page)).boosting, 'released');
    // Shift+Tab is navigation: it must not leave a boost behind
    await page.keyboard.press('Shift+Tab');
    await sleep(60);
    assert(!(await readScreen(page)).boosting, 'Shift+Tab does not boost');
    // window blur releases a held key
    await page.keyboard.down('Shift');
    await sleep(60);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sleep(60);
    assert(!(await readScreen(page)).boosting, 'blur releases a held Shift');
    await page.keyboard.up('Shift');
    // other shortcuts
    await until(page, async () => !(await readScreen(page)).choosing);
    const autoBefore = await page.getAttribute('[data-action="toggle-auto"]', 'aria-pressed');
    await page.keyboard.press('a');
    assert((await page.getAttribute('[data-action="toggle-auto"]', 'aria-pressed')) !== autoBefore, 'A toggles auto');
    await page.keyboard.press('a');
    await page.keyboard.press('f');
    await page.waitForSelector('dialog.drawer[open]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.drawer', { state: 'detached' });
    await until(page, async () => !(await readScreen(page)).choosing);
    // the cheat sheet lists the hold gesture
    const keys = await page.$$eval('.shortcuts dt', (n) => n.map((x) => x.textContent));
    assert(keys.some((k) => /Shift/.test(k)), `shortcut list: ${keys}`);
    assert((await page.textContent('.hold-hint')).includes('按住'), 'hold hint line');
    await ctx.close();
  });

  // ---- progress cue ---------------------------------------------------------------------------
  await step('progress cue: the newest entry carries a ring that fills during the year and restarts with the next', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'cue');
    await startLife(page, BASE, { seed: 'pace-cue-1', scale: 3, pace: 'standard' });
    const st = await freshYear(page, 2500);
    const ring = await page.evaluate(() => { const b = document.querySelector('.timeline > .entry:last-child .entry-body'); const c = getComputedStyle(b, '::after'); return { content: c.content, display: c.display, image: c.backgroundImage.slice(0, 40) }; });
    assert(ring.content !== 'none' && ring.display !== 'none' && /conic-gradient/.test(ring.image), `ring: ${JSON.stringify(ring)}`);
    await sleep(st.dwellMs * 0.3);
    const a = (await readScreen(page)).yp;
    await sleep(st.dwellMs * 0.35);
    const b = (await readScreen(page)).yp;
    assert(a > 0.05 && b > a + 0.1 && b < 1.001, `the ring fills as the year goes by: ${a} -> ${b}`);
    const barP = await page.evaluate(() => parseFloat(document.querySelector('.year-bar i').style.getPropertyValue('--p')));
    assert(barP > 0.3, `the top bar fills too: ${barP}`);
    await waitPlan(page, st.plan);
    const c = (await readScreen(page)).yp;
    assert(c < 0.35, `restarts for the next year: ${c}`);
    await ctx.close();
  });

  // ---- reduced motion --------------------------------------------------------------------------
  await step('reduced motion: pacing, hold and the progress cue still work; entries do not animate', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE, reducedMotion: 'reduce' });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'reduced');
    await startLife(page, BASE, { seed: 'pace-reduced-1', scale: 6, pace: 'standard' });
    const first = await readScreen(page);
    await until(page, async () => (await readScreen(page)).plan >= first.plan + 4);
    const rec = await page.evaluate(() => window.__rec);
    const ds = durations({ ...rec, dying: rec.plans[rec.plans.length - 1].t }).slice(0, -1).filter((d) => d.plan > 1 && d.dwellMs > 400);
    assert(ds.length >= 2, 'years advanced');
    const r = mean(ds.map((d) => d.realMs / d.dwellMs));
    assert(Math.abs(r - 1) <= 0.2, `reduced motion must not change the pace: real/planned ${r}`);
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.timeline .entry:last-child')).animationDuration);
    assert(parseFloat(dur) < 0.01, `entries do not animate: ${dur}`);
    const yp = await page.evaluate(() => getComputedStyle(document.querySelector('.timeline > .entry:last-child .entry-body'), '::after').transitionDuration);
    assert(parseFloat(yp) < 0.01, `ring does not transition: ${yp}`);
    // hold still works
    await freshYear(page, 1500);
    await page.keyboard.down('Shift');
    await sleep(80);
    assert((await readScreen(page)).boosting, 'boost under reduced motion');
    await page.keyboard.up('Shift');
    assert((await readScreen(page)).yp >= 0, 'ring variable present');
    await ctx.close();
  });

  // ---- debug flags -----------------------------------------------------------------------------
  await step('?debug=fast keeps working (every year a blink) and a bad scale value falls back to real time', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    const page = await ctx.newPage();
    watch(page, 'debug');
    await startLife(page, BASE, { seed: 'pace-fast-1', fast: true, pace: 'standard', auto: true });
    const st = await readScreen(page);
    assert(st.dwellMs <= 60, `fast dwell ${st.dwellMs}`);
    await waitHash(page, /#\/death/, 60000);
    await ctx.close();
    for (const [query, label] of [['debug=scale=abc', 'abc'], ['debug=scale=0', '0']]) {
      const c2 = await browser.newContext({ viewport: MOBILE });
      const p2 = await c2.newPage();
      watch(p2, `debug-${label}`);
      await startLife(p2, BASE, { seed: 'pace-bad-1', query, pace: 'standard' });
      const s2 = await readScreen(p2);
      assert(s2.dwellMs >= 2000, `bad scale ${label} must mean real time: dwell ${s2.dwellMs} ms`);
      await c2.close();
    }
    const c3 = await browser.newContext({ viewport: MOBILE });
    const p3 = await c3.newPage();
    watch(p3, 'debug-both');
    await startLife(p3, BASE, { seed: 'pace-both-1', query: 'debug=scale=100,fast', pace: 'standard' });
    assert((await readScreen(p3)).dwellMs <= 60, 'fast wins when both are given');
    await c3.close();
  });

  await step('a reload mid-life resumes with a fresh wait for the year on screen', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE });
    await ctx.addInitScript(recorderScript);
    const page = await ctx.newPage();
    watch(page, 'resume');
    await startLife(page, BASE, { seed: 'pace-resume-1', scale: 20, pace: 'short' });
    await until(page, async () => (await readScreen(page)).age >= 3);
    await page.reload();
    await page.waitForSelector('.screen-life[data-plan]');
    const st = await readScreen(page);
    assert(st.dwellMs > 0 && st.age >= 3, `resumed: ${JSON.stringify(st)}`);
    await until(page, async () => (await readScreen(page)).age > st.age);
    await ctx.close();
  });

  // ---- screenshots -----------------------------------------------------------------------------
  await step('mobile screenshots: a quiet year, an event year and a hold-to-accelerate (real time)', async () => {
    const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2, hasTouch: false });
    const page = await ctx.newPage();
    watch(page, 'shots');
    await startLife(page, BASE, { seed: 'pace-shots-3', scale: 1, pace: 'standard', country: 'TWN' });
    await page.click('[data-speed="4"]');
    // the newest entry on screen, so an "event" shot shows an event (not the outcome of a choice) and a quiet shot the one-liner
    const lastKind = () => page.evaluate(() => (document.querySelector('.timeline > .entry:last-child')?.className.match(/kind-(\w+)/) || [])[1]);
    const reach = async (kind, minAge) => {
      for (let i = 0; i < 300; i++) {
        await answerCards(page);
        const st = await readScreen(page);
        const k = await lastKind();
        if (st.load === kind && !st.choosing && st.age >= minAge && st.yp < 0.05 && (kind === 'quiet' ? k === 'year' : k === 'event' || k === 'milestone')) return st;
        if (!st.choosing) await page.click('[data-action="next-year"]', { timeout: 2000 }).catch(() => {});
        await sleep(40);
      }
      throw new Error(`no ${kind} year found`);
    };
    await page.click('[data-speed="1"]');
    const toEnd = () => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    let st = await reach('quiet', 8);
    await toEnd();
    await page.waitForTimeout(Math.min(4000, st.dwellMs * 0.45)); // the ring is part way round
    await shot(page, 'pacing-1-quiet-year');
    st = await reach('event', 12);
    await toEnd();
    await page.waitForTimeout(Math.min(5000, st.dwellMs * 0.35));
    await shot(page, 'pacing-2-event-year');
    // hold: wait for a fresh year with a long wait, press and hold on the text, and shoot while the chip is up
    st = await reach('event', 14);
    await toEnd();
    await page.waitForTimeout(300);
    const box = await page.locator('.timeline .entry:last-child .entry-text').first().boundingBox();
    await page.mouse.move(box.x + 40, Math.max(150, Math.min(box.y + box.height / 2, 600)));
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector('.screen-life').classList.contains('is-boosting'), null, { timeout: 3000 });
    await shot(page, 'pacing-3-hold-to-accelerate');
    await page.mouse.up();
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
