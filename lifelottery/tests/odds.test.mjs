// "這樣一生的機率" (js/engine/odds.js): probabilities are real probabilities, the parts multiply to the whole, the
// maths is deterministic and agrees with what the birth lottery really draws. Run: node --test tests/odds.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRIES, BY_CODE } from '../js/data/countries.js';
import { createLife, advanceYear } from '../js/engine/life.js';
import { drawBirth, drawCountry } from '../js/engine/birth.js';
import { createRngState } from '../js/engine/rng.js';
import { getSummary } from '../js/engine/summary.js';
import {
  lifeOdds, oddsFromState, oddsFromSummary, humanizeOneIn, countryShare, genderShare, urbanShare, deathAtAge, SCALES,
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
