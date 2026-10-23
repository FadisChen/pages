// Statistical simulation tests: whole lives are played with automatic choices and compared with the
// country statistics they were drawn from.
//
// Env: LL_SIM_N overrides the number of lives per country (default 2000, as in PLAN section 7).
// Run with: node --test lifelottery/tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import ALL_EVENTS from '../js/data/events/index.js';
import { createLife, advanceYear } from '../js/engine/life.js';
import { BY_CODE } from '../js/data/countries.js';
import { eraView, presentYear } from '../js/data/eras.js';
import { EFFECT_KEYS } from '../js/engine/events.js';

const TARGETS = ['TWN', 'JPN', 'USA', 'NGA', 'IND', 'BRA', 'CHN', 'DEU'];
const N = Number(process.env.LL_SIM_N) || 2000;

/** The choices-per-life target (15-45) only applies once the content set is complete. */
const CONTENT_THRESHOLD = 300;
const CONTENT_COMPLETE = ALL_EVENTS.length >= CONTENT_THRESHOLD;
const CHOICES_RANGE = [15, 45];

const year = presentYear();
const results = {};

function playLife(code, i) {
  const s = createLife({ era: 'present' }, `sim-${code}-${i}`, { countryCode: code });
  let guard = 0;
  while (s.alive && guard++ < 130) advanceYear(s, { auto: true });
  return s;
}

test(`simulation: ${N} lives per country (${TARGETS.join(', ')}) run without errors`, () => {
  const t0 = Date.now();
  for (const code of TARGETS) {
    const stats = { n: 0, ageSum: 0, ageF: 0, nF: 0, ageM: 0, nM: 0, choices: 0, errors: 0, kidsSum: 0, kidsN: 0, ever: 0, evMax: 0, minChoices: 1e9, maxChoices: 0 };
    for (let i = 0; i < N; i++) {
      try {
        const s = playLife(code, i);
        assert.equal(s.alive, false, 'life must end');
        for (const k of EFFECT_KEYS) assert.ok(Number.isFinite(s.stats[k]), `${k} not finite`);
        const age = s.death.age + 0.5; // deaths are spread uniformly over the year of age
        stats.n++; stats.ageSum += age;
        if (s.gender === 'F') { stats.ageF += age; stats.nF++; } else { stats.ageM += age; stats.nM++; }
        const c = s.log.reduce((n, e) => n + (e.kind === 'choice' ? 1 : 0), 0);
        stats.choices += c;
        stats.minChoices = Math.min(stats.minChoices, c); stats.maxChoices = Math.max(stats.maxChoices, c);
        if (s.gender === 'F' && s.death.age >= 50) { stats.kidsSum += s.children.length; stats.kidsN++; }
        if (s.flags._married) stats.ever++;
      } catch (e) {
        stats.errors++;
        if (stats.errors <= 3) console.error(`life ${code}-${i} threw:`, e);
      }
    }
    results[code] = stats;
    assert.equal(stats.errors, 0, `${code}: ${stats.errors} lives threw`);
  }
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

test('simulation: infant deaths within +-25% of the infant mortality rate', () => {
  const rows = [];
  for (const code of TARGETS) {
    const v = eraView(BY_CODE[code], year);
    const p = v.imr / 1000;
    // Rich countries need many more lives for a stable count: aim for ~200 expected deaths.
    const M = Math.min(60000, Math.max(N, Math.ceil(200 / p)));
    let deaths = 0;
    for (let i = 0; i < M; i++) {
      const s = createLife({ era: 'present' }, `imr-${code}-${i}`, { countryCode: code });
      if (advanceYear(s, { auto: true }).died) deaths++;
    }
    const rate = deaths / M;
    // Observed rate is a mix of sexes (x1.12 / x0.88); the mix is ~1.003 so compare with imr directly.
    const sd = Math.sqrt((p * (1 - p)) / M) / p;
    rows.push(`${code}: infant deaths ${(rate * 1000).toFixed(2)}‰ vs imr ${v.imr}‰ (n=${M}, sd ${(sd * 100).toFixed(1)}%)`);
    assert.ok(Math.abs(rate - p) / p <= 0.25, `${code}: infant mortality ${(rate * 1000).toFixed(2)}‰ vs ${v.imr}‰`);
  }
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
    assert.ok(kids >= v.tfr * 0.6 && kids <= v.tfr * 1.5 + 0.2, `${code}: ${kids.toFixed(2)} children per woman vs tfr ${v.tfr}`);
    assert.ok(evermarried > 0.5 && evermarried < 0.97, `${code}: ever married ${evermarried}`);
  }
  console.log('  ' + rows.join('\n  '));
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

test('simulation: every country in every era plays out cleanly and stays calibrated on average', () => {
  const eras = [['past', 1970], ['present', year], ['future', 2050]];
  const perCountry = Number(process.env.LL_SMOKE_N) || 5;
  const codes = Object.keys(BY_CODE);
  const rows = [];
  for (const [era, y] of eras) {
    let gap = 0, n = 0, errors = 0;
    for (const code of codes) {
      for (let i = 0; i < perCountry; i++) {
        try {
          const s = createLife({ era }, `smoke-${era}-${code}-${i}`, { countryCode: code });
          let guard = 0;
          while (s.alive && guard++ < 130) advanceYear(s, { auto: true });
          assert.equal(s.alive, false);
          for (const k of EFFECT_KEYS) assert.ok(Number.isFinite(s.stats[k]) && s.stats[k] >= 0 && s.stats[k] <= 100);
          const v = eraView(BY_CODE[code], s.birthYear);
          gap += s.death.age + 0.5 - v.le[s.gender];
          n++;
        } catch (e) {
          errors++;
          if (errors <= 3) console.error(`smoke ${era} ${code} threw:`, e);
        }
      }
    }
    rows.push(`${era}: mean (death age - le) = ${(gap / n).toFixed(2)} over ${n} lives`);
    assert.equal(errors, 0, `${era}: ${errors} lives threw`);
    assert.ok(Math.abs(gap / n) < 2, `${era}: lives deviate from life expectancy by ${(gap / n).toFixed(2)} years on average`);
  }
  console.log('  ' + rows.join('\n  '));
});
