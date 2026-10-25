// Statistical simulation tests: whole lives are played with automatic choices and compared with the
// country statistics they were drawn from.
//
// Env: LL_SIM_N overrides the number of lives per country (default 2000, as in PLAN section 7; `npm run test:quick` uses 1000 lives in four countries).
// The lives are played on worker threads (tests/lib/sim-pool.mjs, sim-worker.mjs): the same lives and the same asserts as a serial run,
// only spread over the cores. Run with: node --test lifelottery/tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import ALL_EVENTS from '../js/data/events/index.js';
import { createLife, advanceYear } from '../js/engine/life.js';
import { BY_CODE } from '../js/data/countries.js';
import { eraView, presentYear } from '../js/data/eras.js';
import { EFFECT_KEYS } from '../js/engine/events.js';
import { runTasks } from './lib/sim-pool.mjs';
import { scaled, QUICK } from './lib/scale.mjs';

// a quick run covers half of the countries (one of each regime); the complete run all eight
const TARGETS = QUICK ? ['TWN', 'USA', 'NGA', 'IND'] : ['TWN', 'JPN', 'USA', 'NGA', 'IND', 'BRA', 'CHN', 'DEU'];
const N = Number(process.env.LL_SIM_N) || scaled(2000, 1000, 500);

/** The choices-per-life target (15-45) only applies once the content set is complete. */
const CONTENT_THRESHOLD = 300;
const CONTENT_COMPLETE = ALL_EVENTS.length >= CONTENT_THRESHOLD;
const CHOICES_RANGE = [15, 45];

const year = presentYear();
const results = {};

test(`simulation: ${N} lives per country (${TARGETS.join(', ')}) run without errors`, async () => {
  const t0 = Date.now();
  const all = await runTasks(TARGETS.map((code) => ({ task: 'country', args: { code, n: N } })));
  TARGETS.forEach((code, k) => {
    const stats = all[k];
    results[code] = stats;
    for (const m of stats.messages) console.error(m);
    assert.equal(stats.errors, 0, `${code}: ${stats.errors} lives threw`);
  });
  console.log(`  simulated ${N * TARGETS.length} lives in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
});

test('simulation: mean age at death within +-2.5 years of life expectancy', () => {
  const rows = [];
  for (const code of TARGETS) {
    const r = results[code];
    assert.ok(r && r.n > 0, `${code}: no results`);
    const v = eraView(BY_CODE[code], year);
    const leMix = (v.le.F * 100 + v.le.M * v.srb) / (100 + v.srb);
    const mean = r.ageSum / r.n;
    rows.push(`${code}: mean death age ${mean.toFixed(1)} vs le ${leMix.toFixed(1)} (F ${(r.ageF / r.nF).toFixed(1)}/${v.le.F}, M ${(r.ageM / r.nM).toFixed(1)}/${v.le.M})`);
    assert.ok(Math.abs(mean - leMix) <= 2.5, `${code}: mean death age ${mean.toFixed(2)} not within 2.5 of le ${leMix.toFixed(2)}`);
    assert.ok(Math.abs(r.ageF / r.nF - v.le.F) <= 3.5, `${code}: female mean ${(r.ageF / r.nF).toFixed(1)} vs ${v.le.F}`);
    assert.ok(Math.abs(r.ageM / r.nM - v.le.M) <= 3.5, `${code}: male mean ${(r.ageM / r.nM).toFixed(1)} vs ${v.le.M}`);
  }
  console.log('  ' + rows.join('\n  '));
});

test('simulation: infant deaths within +-25% of the infant mortality rate', async () => {
  const rows = [];
  // Rich countries need many more lives for a stable count: aim for ~200 expected deaths.
  const Ms = TARGETS.map((code) => Math.min(60000, Math.max(N, Math.ceil(200 / (eraView(BY_CODE[code], year).imr / 1000)))));
  const res = await runTasks(TARGETS.map((code, k) => ({ task: 'imr', args: { code, M: Ms[k] } })));
  TARGETS.forEach((code, k) => {
    const v = eraView(BY_CODE[code], year);
    const p = v.imr / 1000;
    const { deaths, M } = res[k];
    const rate = deaths / M;
    // Observed rate is a mix of sexes (x1.12 / x0.88); the mix is ~1.003 so compare with imr directly.
    const sd = Math.sqrt((p * (1 - p)) / M) / p;
    rows.push(`${code}: infant deaths ${(rate * 1000).toFixed(2)}‰ vs imr ${v.imr}‰ (n=${M}, sd ${(sd * 100).toFixed(1)}%)`);
    assert.ok(Math.abs(rate - p) / p <= 0.25, `${code}: infant mortality ${(rate * 1000).toFixed(2)}‰ vs ${v.imr}‰`);
  });
  console.log('  ' + rows.join('\n  '));
});

test('simulation: demographics are plausible (children per woman, marriage)', () => {
  const rows = [];
  for (const code of TARGETS) {
    const r = results[code];
    const v = eraView(BY_CODE[code], year);
    const kids = r.kidsSum / Math.max(1, r.kidsN);
    const evermarried = r.ever / r.n;
    rows.push(`${code}: children per woman (50+) ${kids.toFixed(2)} vs tfr ${v.tfr}; ever married ${(evermarried * 100).toFixed(0)}%`);
    assert.ok(Math.abs(kids / v.tfr - 1) <= 0.15, `${code}: ${kids.toFixed(2)} children per woman vs tfr ${v.tfr} (must be within 15%)`);
    assert.ok(evermarried > 0.5 && evermarried < 0.97, `${code}: ever married ${evermarried}`);
  }
  console.log('  ' + rows.join('\n  '));
});

test('simulation: children per woman track the TFR within 15% in low- and high-fertility countries', async () => {
  // Women who live to 50+, whole simulated lives. Covers the ultra-low (KOR, HKG), low (ITA, UKR, FRA), middle (BRA, IND)
  // and high (PAK, COD, NER) fertility regimes on top of the TARGETS above.
  const EXTRA = QUICK ? ['KOR', 'ITA', 'BRA', 'PAK', 'NER'] : ['KOR', 'HKG', 'ITA', 'UKR', 'FRA', 'BRA', 'IND', 'PAK', 'COD', 'NER'];
  const n = Math.max(scaled(600, 300, 300), Math.floor(N / 2));
  const rows = [];
  const res = await runTasks(EXTRA.map((code) => ({ task: 'fert', args: { code, n } })));
  EXTRA.forEach((code, k) => {
    const v = eraView(BY_CODE[code], year);
    const mean = res[k].kids / res[k].women;
    rows.push(`${code}: ${mean.toFixed(2)} children per woman vs tfr ${v.tfr} (${((mean / v.tfr - 1) * 100).toFixed(0)}%)`);
    assert.ok(Math.abs(mean / v.tfr - 1) <= 0.15, `${code}: ${mean.toFixed(2)} children per woman vs tfr ${v.tfr}`);
  });
  console.log('  ' + rows.join('\n  '));
});

test('simulation: past and future lives also track the TFR of their reproductive years (+-15%)', async () => {
  const rows = [];
  const n = Math.max(scaled(500, 300, 300), Math.floor(N / 3));
  const jobs = [];
  for (const era of ['past', 'future']) for (const code of QUICK ? ['USA', 'NGA', 'KOR'] : ['USA', 'NGA', 'CHN', 'IND', 'KOR', 'DEU']) jobs.push({ era, code });
  const res = await runTasks(jobs.map(({ era, code }) => ({ task: 'fert', args: { code, n, era, tfrAt27: true } })));
  jobs.forEach(({ era, code }, k) => {
    const { kids, women, tfrSum } = res[k];
    const ratio = kids / tfrSum;
    rows.push(`${era} ${code}: ${(kids / women).toFixed(2)} children per woman vs tfr ${(tfrSum / women).toFixed(2)} at age 27 (${((ratio - 1) * 100).toFixed(0)}%)`);
    assert.ok(Math.abs(ratio - 1) <= 0.15, `${era} ${code}: ${(kids / women).toFixed(2)} children per woman vs tfr ${(tfrSum / women).toFixed(2)}`);
  });
  console.log('  ' + rows.join('\n  '));
});

test('simulation: birth years cover 1955-1990 (past) and 2040-2070 (future); the present era is this year', () => {
  const span = (era, n) => {
    const ys = [];
    for (let i = 0; i < n; i++) ys.push(createLife({ era }, `by-${era}-${i}`).birthYear);
    return ys;
  };
  const past = span('past', 600);
  assert.ok(Math.min(...past) <= 1957 && Math.max(...past) >= 1988, `past birth years ${Math.min(...past)}-${Math.max(...past)}`);
  assert.ok(Math.min(...past) >= 1955 && Math.max(...past) <= 1990);
  assert.ok(past.filter((y) => y < 1970).length > 600 * 0.3, 'pre-1970 births must be common');
  const future = span('future', 600);
  assert.ok(Math.min(...future) <= 2042 && Math.max(...future) >= 2068);
  assert.ok(Math.min(...future) >= 2040 && Math.max(...future) <= 2070);
  assert.ok(span('present', 20).every((y) => y === year));
});

test(`simulation: choices per life (target ${CHOICES_RANGE.join('-')} once there are >= ${CONTENT_THRESHOLD} events)`, () => {
  const rows = [];
  let low = false;
  for (const code of TARGETS) {
    const r = results[code];
    const avg = r.choices / r.n;
    rows.push(`${code}: ${avg.toFixed(1)} choices per life (min ${r.minChoices}, max ${r.maxChoices})`);
    if (avg < CHOICES_RANGE[0] || avg > CHOICES_RANGE[1]) low = true;
    if (CONTENT_COMPLETE) assert.ok(avg >= CHOICES_RANGE[0] && avg <= CHOICES_RANGE[1], `${code}: ${avg.toFixed(1)} choices per life outside ${CHOICES_RANGE.join('-')}`);
  }
  console.log('  ' + rows.join('\n  '));
  if (!CONTENT_COMPLETE && low) {
    console.warn(`  WARNING: only ${ALL_EVENTS.length} events (< ${CONTENT_THRESHOLD}); choices-per-life target ${CHOICES_RANGE.join('-')} is NOT enforced yet.`);
  }
  // Always enforce a floor so a broken major-event pipeline is still caught.
  for (const code of TARGETS) assert.ok(results[code].choices / results[code].n >= 4, `${code}: almost no choices are being offered`);
});

test('simulation: every country in every era plays out cleanly and stays calibrated on average', async () => {
  const eras = [['past', 1970], ['present', year], ['future', 2050]];
  const perCountry = Number(process.env.LL_SMOKE_N) || 5;
  const codes = Object.keys(BY_CODE);
  const rows = [];
  // each era in four slices of the country list
  const jobs = [];
  for (const [era] of eras) for (let k = 0; k < 4; k++) jobs.push({ era, codes: codes.filter((c, i) => i % 4 === k), perCountry });
  const res = await runTasks(jobs.map((j) => ({ task: 'smoke', args: j })));
  for (const [era] of eras) {
    const mine = res.filter((r, k) => jobs[k].era === era);
    const gap = mine.reduce((a, r) => a + r.gap, 0), n = mine.reduce((a, r) => a + r.n, 0), errors = mine.reduce((a, r) => a + r.errors, 0);
    for (const r of mine) for (const m of r.messages) console.error(m);
    rows.push(`${era}: mean (death age - le) = ${(gap / n).toFixed(2)} over ${n} lives`);
    assert.equal(errors, 0, `${era}: ${errors} lives threw`);
    assert.ok(Math.abs(gap / n) < 2, `${era}: lives deviate from life expectancy by ${(gap / n).toFixed(2)} years on average`);
  }
  console.log('  ' + rows.join('\n  '));
});
