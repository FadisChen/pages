// "這樣一生的機率" (js/engine/odds.js): probabilities are real probabilities, the parts multiply to the whole, the
// maths is deterministic and agrees with what the birth lottery really draws. Run: node --test tests/odds.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, BY_CODE } from '../js/data/countries.js';
import { createLife, advanceYear } from '../js/engine/life.js';
import { drawBirth, drawCountry } from '../js/engine/birth.js';
import { createRngState } from '../js/engine/rng.js';
import { getSummary } from '../js/engine/summary.js';
import { lifeTable } from '../js/engine/mortality.js';
import { normalizeSummary } from '../js/storage.js';
import {
  lifeOdds, oddsFromState, oddsFromSummary, humanizeOneIn, countryShare, genderShare, urbanShare, deathAtAge, SCALES,
  personalSurvival, personalFromState, personalFromSummary,
} from '../js/engine/odds.js';

const close = (a, b, rel = 1e-10) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);

function live(seed, opts, era = 'present') {
  const s = createLife({ era, drawMode: opts.drawMode || 'births' }, seed, opts);
  let g = 0;
  while (s.alive && g++ < 140) advanceYear(s, { auto: true });
  return s;
}

test('every part is a probability in (0, 1] and the product of the parts is the whole', () => {
  const codes = ['TWN', 'NGA', 'IND', 'LUX', 'MDV', 'USA', 'JPN', 'COD', 'SGP'];
  let n = 0;
  for (const code of codes) for (const era of ['past', 'present', 'future']) for (const mode of ['births', 'population']) {
    const s = live(`odds-${code}-${era}-${mode}`, { countryCode: code, drawMode: mode }, era);
    const o = oddsFromState(s);
    assert.deepEqual(o.parts.map((p) => p.key), ['country', 'gender', 'wealth', 'place', 'age']);
    for (const p of o.parts) {
      assert.ok(p.p > 0 && p.p <= 1, `${code} ${p.key} p=${p.p}`);
      assert.ok(close(p.oneIn, 1 / p.p), 'oneIn is 1/p');
    }
    assert.ok(o.p > 0 && o.p <= 1, `total p=${o.p}`);
    assert.ok(close(o.p, o.parts.reduce((a, b) => a * b.p, 1)), `${code} product matches the breakdown`);
    assert.ok(close(o.oneIn, 1 / o.p));
    const born = o.parts.filter((p) => p.key !== 'age');
    assert.ok(close(o.atBirth.p, born.reduce((a, b) => a * b.p, 1)), 'atBirth = the four birth facts');
    assert.ok(o.atBirth.p >= o.p, 'the age of death only makes the life rarer');
    n++;
  }
  assert.equal(n, codes.length * 6);
});

test('a life that has not ended has no age part; the odds are deterministic', () => {
  const s = createLife({ era: 'present' }, 'odds-det-1', { countryCode: 'TWN' });
  const a = oddsFromState(s), b = oddsFromState(s);
  assert.deepEqual(a, b);
  assert.deepEqual(a.parts.map((p) => p.key), ['country', 'gender', 'wealth', 'place']);
  assert.equal(a.p, a.atBirth.p);
  const input = { countryCode: 'NGA', birthYear: 1971, drawMode: 'births', gender: 'F', wealthQ: 2, urban: false, deathAge: 37 };
  assert.deepEqual(lifeOdds(input), lifeOdds({ ...input }));
  // the same life asked in a fresh call, and rebuilt from its album summary, agrees
  const dead = live('odds-det-2', { countryCode: 'BRA' });
  const fromState = oddsFromState(dead);
  const fromSummary = oddsFromSummary(getSummary(dead), dead.settings.drawMode);
  assert.deepEqual(fromState, fromSummary);
});

test('random lives across eras and draw modes: valid, and the draw mode matters only for the country part', () => {
  for (let i = 0; i < 120; i++) {
    const era = ['past', 'present', 'future', 'random'][i % 4];
    const mode = i % 2 ? 'population' : 'births';
    const s = createLife({ era, drawMode: mode }, `odds-rand-${i}`);
    const o = oddsFromState(s);
    assert.ok(o.p > 0 && o.p <= 1 && Number.isFinite(o.oneIn), `life ${i}`);
    assert.ok(o.human.rounded >= 1);
    const other = lifeOdds({ countryCode: s.homeCountryCode, birthYear: s.birthYear, drawMode: mode === 'births' ? 'population' : 'births', gender: s.gender, wealthQ: s.family.wealthQ, urban: s.urban });
    for (const k of ['gender', 'wealth', 'place']) assert.equal(o.parts.find((p) => p.key === k).p, other.parts.find((p) => p.key === k).p);
  }
});

test('the distributions the parts are drawn from add up to one', () => {
  const year = 2000;
  assert.ok(close(COUNTRIES.reduce((a, c) => a + countryShare(c, year, 'births'), 0), 1, 1e-9), 'country shares (births)');
  assert.ok(close(COUNTRIES.reduce((a, c) => a + countryShare(c, 1965, 'population'), 0), 1, 1e-9), 'country shares (population)');
  for (const c of [BY_CODE.CHN, BY_CODE.IND, BY_CODE.MAC, BY_CODE.KOR]) {
    assert.ok(close(genderShare(c, year, 'F') + genderShare(c, year, 'M'), 1));
    for (const q of [1, 3, 5]) {
      const u = urbanShare(c, year, q);
      assert.ok(u > 0 && u < 1);
    }
    for (const g of ['F', 'M']) {
      let sum = 0;
      for (let a = 0; a <= 120; a++) sum += deathAtAge(c, g, year, a);
      assert.ok(Math.abs(sum - 1) < 1e-6, `${c.code} ${g} death-age distribution sums to ${sum}`);
    }
  }
});

test('the parts agree with what the birth lottery really draws (guards against drift from birth.js)', () => {
  const N = 5000;
  const year = 2024;
  // gender and place for one country / wealth fifth
  for (const [code, wealthQ] of [['BRA', 5], ['IND', 1], ['NGA', 3]]) {
    const rng = createRngState(`odds-sample-${code}`);
    let male = 0, urban = 0;
    for (let i = 0; i < N; i++) {
      const b = drawBirth(rng, { era: 'present', drawMode: 'births' }, { countryCode: code, wealthQ, birthYear: year });
      if (b.gender === 'M') male++;
      if (b.urban) urban++;
    }
    const c = BY_CODE[code];
    const tol = (p) => 4.5 * Math.sqrt((p * (1 - p)) / N);
    const pm = genderShare(c, year, 'M'), pu = urbanShare(c, year, wealthQ);
    assert.ok(Math.abs(male / N - pm) < tol(pm), `${code} male share ${male / N} vs ${pm}`);
    assert.ok(Math.abs(urban / N - pu) < tol(pu), `${code} urban share ${urban / N} vs ${pu}`);
  }
  // country shares: the biggest countries and a mid-sized one
  const rng = createRngState('odds-sample-country');
  const M = 20000, hits = {};
  for (let i = 0; i < M; i++) { const c = drawCountry(rng, year, 'births'); hits[c.code] = (hits[c.code] || 0) + 1; }
  for (const code of ['IND', 'NGA', 'CHN', 'USA']) {
    const p = countryShare(BY_CODE[code], year, 'births');
    assert.ok(Math.abs((hits[code] || 0) / M - p) < 4.5 * Math.sqrt((p * (1 - p)) / M), `${code} country share`);
  }
});

test('rarer facts give bigger N, and common ones stay small', () => {
  const base = { countryCode: 'IND', birthYear: 2024, drawMode: 'births', gender: 'F', wealthQ: 3, urban: true };
  const big = lifeOdds({ ...base, countryCode: 'IND' }), tiny = lifeOdds({ ...base, countryCode: 'MDV' });
  assert.ok(tiny.oneIn > big.oneIn * 10, 'a tiny country is much rarer than India');
  const young = lifeOdds({ ...base, deathAge: 3 }), prime = lifeOdds({ ...base, deathAge: 80 }), ancient = lifeOdds({ ...base, deathAge: 112 });
  assert.ok(ancient.oneIn > prime.oneIn, 'dying at 112 is rarer than dying at 80');
  assert.ok(young.p > 0 && prime.p > 0);
  assert.throws(() => lifeOdds({ ...base, countryCode: 'XXX' }));
});

test('humanizeOneIn rounds sensibly and is monotone', () => {
  const cases = [[1, 1, ''], [3.46, 3.5, ''], [47.3, 47, ''], [4321, 4300, ''], [9999, 10000, 'wan'], [34567, 35000, 'wan'], [150000000, 150000000, 'yi'], [2.3e12, 2.3e12, 'zhao']];
  for (const [n, rounded, unit] of cases) {
    const h = humanizeOneIn(n);
    assert.equal(h.rounded, rounded, `${n}`);
    assert.equal(h.unit, unit, `${n} unit`);
    const size = SCALES.find((s) => s.unit === unit)?.size || 1;
    assert.ok(close(h.value * size, h.rounded, 1e-9), `${n}: value x unit`);
  }
  let prev = 0;
  for (let e = 0; e < 14; e += 0.37) {
    const h = humanizeOneIn(10 ** e);
    assert.ok(h.rounded >= prev, 'monotone');
    prev = h.rounded;
    assert.ok(h.rounded >= 1 && Math.abs(h.rounded - 10 ** e) / 10 ** e <= 0.051, `${10 ** e} rounds within 5%`);
  }
});

test('oddsFromSummary copes with old / odd records', () => {
  const dead = live('odds-old-1', { countryCode: 'JPN' });
  const sum = JSON.parse(JSON.stringify(getSummary(dead)));
  const ref = oddsFromSummary(sum);
  const noCode = { ...sum, homeCountry: { code: '', name: sum.homeCountry.name } };
  assert.deepEqual(oddsFromSummary(noCode), ref, 'falls back to the country name');
  assert.equal(oddsFromSummary({ ...sum, homeCountry: { code: '', name: '不存在國' } }), null);
  assert.equal(oddsFromSummary(null), null);
  assert.equal(oddsFromSummary({ ...sum, birthYear: undefined }), null);
});

// ---------------------------------------------------------------------------------------------
// Personal odds (Phase 4B): P(reach this age | the risk multipliers this life really had)
// ---------------------------------------------------------------------------------------------

const survivalTo = (code, gender, year, age) => {
  const table = lifeTable(BY_CODE[code], gender, year);
  let p = 1;
  for (let x = 0; x < age; x++) p *= 1 - table.q[x];
  return p;
};
const flat = (n, m) => new Array(n).fill(m);

test('personalSurvival: with no personal factor (all multipliers 1) it is exactly the life table survival', () => {
  for (const [code, g, year, age] of [['TWN', 'F', 2026, 83], ['NGA', 'M', 1971, 37], ['JPN', 'F', 2060, 100], ['IND', 'M', 2026, 1], ['BRA', 'F', 1960, 55]]) {
    const r = personalSurvival({ countryCode: code, birthYear: year, gender: g, deathAge: age, riskTrail: flat(age, 1) });
    const s = survivalTo(code, g, year, age);
    assert.ok(close(r.p, s, 1e-9), `${code} ${age}: ${r.p} vs ${s}`);
    assert.ok(close(r.baseline, s, 1e-9));
    assert.ok(close(r.ratio, 1, 1e-9));
    assert.equal(r.age, age);
    // consistent with the headline: P(die at exactly this age) = P(reach age) * q(age)
    assert.ok(close(deathAtAge(BY_CODE[code], g, year, age), s * lifeTable(BY_CODE[code], g, year).q[age], 1e-9));
  }
});

test('personalSurvival: riskier years make a long life less likely, safer years more likely, and it stays a probability', () => {
  const base = { countryCode: 'USA', birthYear: 2026, gender: 'M', deathAge: 70 };
  const neutral = personalSurvival({ ...base, riskTrail: flat(70, 1) });
  const risky = personalSurvival({ ...base, riskTrail: flat(70, 2.5) });
  const safe = personalSurvival({ ...base, riskTrail: flat(70, 0.5) });
  assert.ok(risky.p < neutral.p && neutral.p < safe.p, `${risky.p} < ${neutral.p} < ${safe.p}`);
  assert.ok(risky.ratio < 1 && safe.ratio > 1);
  for (const r of [neutral, risky, safe]) assert.ok(r.p > 0 && r.p <= 1 && r.baseline > 0 && r.baseline <= 1);
  // only the years before the death age count; extra entries are ignored
  const longer = personalSurvival({ ...base, riskTrail: [...flat(70, 1), 9, 9, 9] });
  assert.equal(longer.p, neutral.p);
  // a huge multiplier cannot push a yearly death probability above 1
  const doomed = personalSurvival({ ...base, riskTrail: flat(70, 50) });
  assert.ok(doomed.p >= 0 && doomed.p < 1e-6);
  // a later death age (same multipliers) can only be less likely
  const earlier = personalSurvival({ ...base, deathAge: 40, riskTrail: flat(70, 1.3) });
  const later = personalSurvival({ ...base, deathAge: 60, riskTrail: flat(70, 1.3) });
  assert.ok(later.p < earlier.p);
});

test('personalSurvival: missing, short or broken data gives null instead of a wrong number', () => {
  const ok = { countryCode: 'TWN', birthYear: 2026, gender: 'F', deathAge: 30, riskTrail: flat(30, 1) };
  assert.ok(personalSurvival(ok));
  assert.equal(personalSurvival(null), null);
  assert.equal(personalSurvival({ ...ok, riskTrail: undefined }), null);
  assert.equal(personalSurvival({ ...ok, riskTrail: flat(29, 1) }), null, 'trail shorter than the age');
  assert.equal(personalSurvival({ ...ok, riskTrail: [...flat(10, 1), null, ...flat(19, 1)] }), null, 'a hole in the trail');
  assert.equal(personalSurvival({ ...ok, riskTrail: [...flat(10, 1), NaN, ...flat(19, 1)] }), null);
  assert.equal(personalSurvival({ ...ok, countryCode: 'XXX' }), null);
  assert.equal(personalSurvival({ ...ok, deathAge: 0, riskTrail: [] }), null, 'a life that ended before age 1 has nothing to report');
  assert.equal(personalFromSummary({ homeCountry: { code: 'TWN', name: '台灣' }, birthYear: 2026, gender: 'F', age: 30 }), null, 'old record: no trail');
  assert.equal(personalFromState(createLife({ era: 'present' }, 'pv-alive', { countryCode: 'TWN' })), null, 'a living person has no death age');
});

test('the engine records the multiplier it really applied, and the summary and the album copy carry it', () => {
  let checked = 0, withTrail = 0;
  for (const [seed, code] of [['pr-1', 'TWN'], ['pr-2', 'NGA'], ['pr-3', 'USA'], ['pr-4', 'IND'], ['pr-5', 'DEU'], ['pr-6', 'BRA']]) {
    const s = live(seed, { countryCode: code });
    const sum = getSummary(s);
    const d = s.death.age;
    if (d < 1) continue;
    checked++;
    const trail = s.flags._riskTrail;
    for (let a = 0; a <= d; a++) assert.ok(Number.isFinite(trail[a]) && trail[a] > 0 && trail[a] <= 8, `${seed} age ${a}: ${trail[a]}`);
    assert.equal(sum.riskTrail.length, d, 'summary keeps ages 0 .. death age - 1');
    const fromState = personalFromState(s);
    const fromSummary = personalFromSummary(sum);
    const fromAlbum = personalFromSummary(normalizeSummary(JSON.parse(JSON.stringify(sum))));
    assert.ok(fromState && fromState.p > 0 && fromState.p <= 1);
    assert.deepEqual(fromSummary, fromState);
    assert.deepEqual(fromAlbum, fromState, 'survives the album normalisation and a JSON round trip');
    withTrail++;
  }
  assert.ok(checked >= 5 && withTrail === checked);
});

test('the recorded multipliers follow the life: lives that were frail at 50 carry higher risk through their fifties', () => {
  const rows = [];
  for (let i = 0; i < 320; i++) {
    const s = createLife({ era: 'present' }, `pr-split-${i}`, { countryCode: 'USA' });
    let h50 = null, g = 0;
    while (s.alive && g++ < 140) { advanceYear(s, { auto: true }); if (s.age === 50) h50 = s.stats.health; }
    if (s.death.age >= 60 && h50 != null) {
      const t = s.flags._riskTrail;
      rows.push({ h: h50, m: t.slice(50, 60).reduce((a, b) => a + b, 0) / 10 });
    }
  }
  rows.sort((a, b) => a.h - b.h);
  const half = Math.floor(rows.length / 2);
  const mean = (a) => a.reduce((x, r) => x + r.m, 0) / a.length;
  assert.ok(rows.length >= 100, `rows ${rows.length}`);
  assert.ok(mean(rows.slice(0, half)) > mean(rows.slice(half)), `frail ${mean(rows.slice(0, half)).toFixed(2)} vs healthy ${mean(rows.slice(half)).toFixed(2)}`);
});

test('normalizeSummary keeps a complete riskTrail, drops a damaged or short one, and keeps religion and focus as ids', () => {
  const s = live('pr-norm', { countryCode: 'JPN' });
  const sum = JSON.parse(JSON.stringify(getSummary(s)));
  const n = normalizeSummary(sum);
  assert.equal(n.riskTrail.length, s.death.age);
  assert.equal(typeof n.religion, 'string');
  assert.equal(typeof n.focus, 'string');
  assert.ok(Array.isArray(n.focusTimeline) && n.focusTimeline.length >= 1);
  assert.equal(normalizeSummary({ ...sum, riskTrail: [1, 'x', 1] }).riskTrail, null);
  assert.equal(normalizeSummary({ ...sum, riskTrail: sum.riskTrail.slice(0, 3) }).riskTrail, null, 'shorter than the age');
  const old = { ...sum }; delete old.riskTrail; delete old.religion; delete old.focus; delete old.focusTimeline;
  const o = normalizeSummary(old);
  assert.equal(o.riskTrail, null);
  assert.equal(o.religion, '');
  assert.deepEqual(o.focusTimeline, []);
});
