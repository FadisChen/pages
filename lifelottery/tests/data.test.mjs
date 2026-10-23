// Data integrity tests: countries, eras, names, causes, life tables, yearly templates.
// Run with: node --test lifelottery/tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import { COUNTRIES, BY_CODE, WORLD_POP, WORLD_POP_LISTED } from '../js/data/countries.js';
import { eraView, worldView, drawWeight, ERA_KEYS, presentYear } from '../js/data/eras.js';
import { POOL_KEYS, poolSizes, poolKeyFor, makeName, getPool } from '../js/data/names.js';
import { CAUSES, CAUSE_IDS, baseWeights, AGE_BANDS } from '../js/data/causes.js';
import { CONDITIONS } from '../js/data/conditions.js';
import YEARLY from '../js/data/yearly.js';
import { lifeTable } from '../js/engine/mortality.js';
import { createRngState, rand, weightedIndex } from '../js/engine/rng.js';
import { drawCountry, babyShare } from '../js/engine/birth.js';

const REGIONS = ['EAS', 'SEA', 'SAS', 'CAS', 'MENA', 'SSA', 'EUR', 'NAM', 'LAC', 'OCE'];
const INCOMES = ['L', 'LM', 'UM', 'H'];
const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

test('countries: coverage and identity', () => {
  assert.ok(COUNTRIES.length >= 160, `need >= 160 countries, got ${COUNTRIES.length}`);
  const codes = new Set(COUNTRIES.map((c) => c.code));
  assert.equal(codes.size, COUNTRIES.length, 'duplicate ISO3 codes');
  assert.ok(BY_CODE.TWN, 'Taiwan must be present');
  assert.equal(BY_CODE.TWN.name, '台灣');
  assert.ok(WORLD_POP_LISTED / WORLD_POP >= 0.99, `listed countries cover only ${(WORLD_POP_LISTED / WORLD_POP * 100).toFixed(1)}% of the world`);
  for (const r of REGIONS) assert.ok(COUNTRIES.some((c) => c.region === r), `region ${r} has no country`);
  for (const i of INCOMES) assert.ok(COUNTRIES.some((c) => c.income === i), `income ${i} has no country`);
});

test('countries: every field present and in a sane range', () => {
  for (const c of COUNTRIES) {
    const w = `${c.code}`;
    assert.match(c.code, /^[A-Z]{3}$/, w);
    assert.ok(typeof c.name === 'string' && /^[一-鿿]/.test(c.name), `${w}: name must be zh-Hant`);
    assert.ok(REGIONS.includes(c.region), `${w}: region`);
    assert.ok(INCOMES.includes(c.income), `${w}: income`);
    assert.ok(inRange(c.pop, 500000, 1.6e9), `${w}: pop ${c.pop}`);
    assert.ok(inRange(c.pop1970, 100000, 1.2e9), `${w}: pop1970 ${c.pop1970}`);
    assert.ok(inRange(c.births, 1000, 4.5e7), `${w}: births ${c.births}`);
    const cbr = (c.births / c.pop) * 1000;
    assert.ok(inRange(cbr, 3, 60), `${w}: crude birth rate ${cbr.toFixed(1)}`);
    for (const g of ['F', 'M']) {
      assert.ok(inRange(c.le[g], 40, 95), `${w}: le.${g}=${c.le[g]}`);
      assert.ok(inRange(c.school[g], 0.5, 24), `${w}: school.${g}=${c.school[g]}`);
      assert.ok(inRange(c.smoke[g], 0, 80), `${w}: smoke.${g}=${c.smoke[g]}`);
      assert.ok(inRange(c.marryAge[g], 15, 40), `${w}: marryAge.${g}=${c.marryAge[g]}`);
    }
    assert.ok(c.le.F >= c.le.M - 1.5, `${w}: female life expectancy should not trail male by > 1.5y`);
    assert.ok(inRange(c.imr, 0.5, 200), `${w}: imr ${c.imr}`);
    assert.ok(inRange(c.u5mr, c.imr, 300), `${w}: u5mr ${c.u5mr} must be >= imr ${c.imr}`);
    assert.ok(inRange(c.tfr, 0.5, 8), `${w}: tfr ${c.tfr}`);
    assert.ok(inRange(c.tertiary, 0, 150), `${w}: tertiary ${c.tertiary}`);
    assert.ok(inRange(c.gdp, 300, 200000), `${w}: gdp ${c.gdp}`);
    assert.ok(inRange(c.poverty, 0, 100), `${w}: poverty ${c.poverty}`);
    assert.ok(inRange(c.urban, 5, 100), `${w}: urban ${c.urban}`);
    assert.ok(inRange(c.childMarriage, 0, 100), `${w}: childMarriage ${c.childMarriage}`);
    assert.ok(inRange(c.srb, 100, 120), `${w}: srb ${c.srb}`);
    for (const k of ['homicide', 'road', 'suicide']) assert.ok(inRange(c[k], 0, 100), `${w}: ${k} ${c[k]}`);
    assert.ok(inRange(c.le1970, 25, 80), `${w}: le1970 ${c.le1970}`);
    assert.ok(inRange(c.imr1970, 3, 350), `${w}: imr1970 ${c.imr1970}`);
    assert.ok(inRange(c.le2050, 50, 95), `${w}: le2050 ${c.le2050}`);
    assert.ok(Array.isArray(c.cities) && c.cities.length >= 2 && c.cities.length <= 4, `${w}: needs 2-4 cities`);
    for (const city of c.cities) assert.match(city, /^[一-鿿]+$/, `${w}: city "${city}" must be zh-Hant`);
    assert.ok(Array.isArray(c.est), `${w}: est must be an array`);
    for (const f of c.est) assert.ok(f in c, `${w}: est names unknown field "${f}"`);
    // The four fields without an open dataset must always be flagged as estimates.
    for (const f of ['tertiary', 'road', 'childMarriage', 'homicide']) assert.ok(c.est.includes(f), `${w}: ${f} must be flagged est`);
  }
});

test('countries: spot checks against well-known facts', () => {
  const near = (v, t, tol, msg) => assert.ok(Math.abs(v - t) <= tol, `${msg}: ${v} not within ${tol} of ${t}`);
  near(BY_CODE.JPN.le.F, 87, 2, 'Japan female le');
  near(BY_CODE.NGA.le.F, 55, 4, 'Nigeria female le');
  near(BY_CODE.IND.pop / 1e9, 1.42, 0.1, 'India population');
  near(BY_CODE.CHN.pop / 1e9, 1.42, 0.1, 'China population');
  assert.ok(BY_CODE.NER.childMarriage > 60, 'Niger child marriage');
  assert.ok(BY_CODE.KOR.tfr < 1, 'Korea tfr');
  assert.ok(BY_CODE.TWN.tfr < 1.1, 'Taiwan tfr');
  assert.ok(BY_CODE.NER.tfr > 6, 'Niger tfr');
  assert.ok(BY_CODE.ZAF.homicide > 25, 'South Africa homicide');
  assert.ok(BY_CODE.NGA.imr > 40, 'Nigeria imr');
});

test('eras: views are finite for all countries and years', () => {
  const years = [1950, 1955, 1965, 1970, 1990, presentYear(), 2035, 2050, 2060, 2070, 2090];
  for (const c of COUNTRIES) {
    for (const y of years) {
      const v = eraView(c, y);
      for (const g of ['F', 'M']) {
        assert.ok(inRange(v.le[g], 25, 96), `${c.code} ${y}: le ${v.le[g]}`);
        assert.ok(inRange(v.school[g], 0, 25), `${c.code} ${y}: school ${v.school[g]}`);
      }
      assert.ok(inRange(v.imr, 0.5, 350) && inRange(v.u5mr, v.imr, 500), `${c.code} ${y}: imr/u5mr ${v.imr}/${v.u5mr}`);
      assert.ok(inRange(v.tfr, 0.5, 8), `${c.code} ${y}: tfr ${v.tfr}`);
      assert.ok(inRange(v.births, 100, 1e8) && inRange(v.pop, 1e4, 4e9), `${c.code} ${y}: births/pop`);
      assert.ok(inRange(v.urban, 1, 100) && inRange(v.poverty, 0, 100) && inRange(v.childMarriage, 0, 100), `${c.code} ${y}: pct fields`);
    }
    assert.ok(eraView(c, 1970).le.F < eraView(c, 2050).le.F, `${c.code}: life expectancy should rise 1970 -> 2050`);
    assert.ok(eraView(c, 1955).le.F <= eraView(c, 1990).le.F + 0.5, `${c.code}: life expectancy should not fall 1955 -> 1990`);
    assert.ok(eraView(c, 2070).le.F >= eraView(c, 2050).le.F - 0.01, `${c.code}: life expectancy should not fall 2050 -> 2070`);
    assert.ok(eraView(c, 1955).imr >= eraView(c, 1990).imr - 0.5, `${c.code}: infant mortality should not rise 1955 -> 1990`);
  }
  const w = worldView(presentYear());
  assert.ok(inRange(w.le, 66, 76) && inRange(w.imr, 10, 40) && inRange(w.school, 8, 14), `present world averages off: ${JSON.stringify(w)}`);
  assert.ok(worldView(1970).le < w.le - 8, 'world life expectancy should be much lower in 1970');
});

test('draw weights: every country can be drawn in every era and mode', () => {
  for (const mode of ['births', 'population']) {
    for (const era of ERA_KEYS) {
      const year = era === 'past' ? 1970 : era === 'future' ? 2050 : presentYear();
      for (const y of era === 'past' ? [1955, 1990] : era === 'future' ? [2040, 2070] : []) {
        for (const c of COUNTRIES) assert.ok(drawWeight(c, y, mode) > 0 && Number.isFinite(drawWeight(c, y, mode)), `${c.code} ${y} ${mode}`);
      }
      let total = 0;
      for (const c of COUNTRIES) {
        const wgt = drawWeight(c, year, mode);
        assert.ok(wgt > 0 && Number.isFinite(wgt), `${c.code} ${era} ${mode}`);
        total += wgt;
      }
      // Empirical draw frequency of the two giants should track their weights.
      const rng = createRngState(`draw-${mode}-${era}`);
      const counts = {};
      const N = 20000;
      for (let i = 0; i < N; i++) { const c = drawCountry(rng, year, mode); counts[c.code] = (counts[c.code] || 0) + 1; }
      for (const code of ['IND', 'CHN', 'NGA']) {
        const expected = (drawWeight(BY_CODE[code], year, mode) / total) * N;
        const sd = Math.sqrt(expected);
        assert.ok(Math.abs((counts[code] || 0) - expected) < 5 * sd + 5, `${code} ${era} ${mode}: ${counts[code]} vs ${expected.toFixed(0)}`);
      }
    }
  }
  const share = babyShare(BY_CODE.TWN, presentYear(), 'births');
  assert.ok(share.per100 > 0 && share.per100 < 1, 'Taiwan should be < 1 of 100 babies');
  assert.ok(babyShare(BY_CODE.IND, presentYear(), 'births').per100 > 10, 'India should be > 10 of 100 babies');
});

test('names: every pool has >= 25 male and female names and surnames; every country resolves', () => {
  assert.ok(POOL_KEYS.length >= 90);
  for (const k of POOL_KEYS) {
    const s = poolSizes(k);
    const single = getPool(k).mode === 'syll';
    assert.ok(s.M >= 25 && s.F >= 25 && (single || s.S >= 25), `pool ${k}: ${JSON.stringify(s)}`);
    const p = getPool(k);
    for (const list of [p.M, p.F, p.S]) for (const t of list) assert.ok(typeof t === 'string' && t.length > 0 && !/undefined/.test(t), `pool ${k}: bad token ${t}`);
  }
  const rng = createRngState('names');
  const r = () => rand(rng);
  const regionsSeen = new Set();
  for (const c of COUNTRIES) {
    const key = poolKeyFor(c);
    assert.ok(getPool(key), `${c.code}: pool ${key} missing`);
    regionsSeen.add(c.region);
    for (const g of ['F', 'M']) {
      const n = makeName(key, g, r);
      assert.ok(n.full && n.given, `${c.code}: empty name`);
      assert.ok(!/undefined|NaN|\|/.test(n.full), `${c.code}: bad name "${n.full}"`);
    }
  }
  assert.equal(regionsSeen.size, REGIONS.length);
  // Display conventions (see names.test.mjs for the full set)
  assert.match(makeName('zh_hant', 'M', r).full, /^[\u4e00-\u9fff]{3}$/);
  assert.match(makeName('ko', 'F', r).full, /^[가-힣]+（[\u4e00-\u9fff]+）$|^[가-힣]+$/);
});

test('causes: table is well-formed and drawable for every income group and age band', () => {
  assert.equal(new Set(CAUSE_IDS).size, CAUSE_IDS.length);
  for (const id of ['neonatal', 'lri', 'diarrhea', 'malaria', 'tb', 'hiv', 'malnutrition', 'road', 'drowning', 'homicide', 'suicide', 'conflict', 'maternal', 'cvd', 'stroke', 'cancer', 'diabetes', 'copd', 'dementia', 'kidney', 'liver', 'other']) {
    assert.ok(CAUSES[id], `missing cause ${id}`);
    assert.ok(CAUSES[id].label && CAUSES[id].phrases.length > 0);
  }
  for (const inc of INCOMES) {
    for (let b = 0; b < AGE_BANDS.length; b++) {
      const w = baseWeights(inc, b);
      let total = 0;
      for (const [k, v] of Object.entries(w)) { assert.ok(CAUSES[k], `unknown cause ${k}`); assert.ok(v >= 0 && Number.isFinite(v)); total += v; }
      assert.ok(total > 50, `${inc} band ${b}: total weight ${total}`);
    }
  }
  for (const [id, c] of Object.entries(CONDITIONS)) {
    assert.ok(c.label && c.risk >= 1 && Array.isArray(c.onset), `condition ${id}`);
  }
});

test('life tables: calibrated to the era life expectancy, monotone in old age', () => {
  const years = [1955, 1970, 1990, presentYear(), 2050, 2070];
  for (const c of COUNTRIES) {
    for (const y of years) {
      for (const sex of ['F', 'M']) {
        const t = lifeTable(c, sex, y);
        const target = eraView(c, y).le[sex];
        assert.ok(Math.abs(t.e0 - target) < 0.2, `${c.code} ${sex} ${y}: e0 ${t.e0.toFixed(2)} vs le ${target}`);
        for (let x = 0; x <= 120; x++) assert.ok(t.q[x] >= 0 && t.q[x] <= 1 && Number.isFinite(t.q[x]), `${c.code} q[${x}]`);
        assert.equal(t.q[120], 1);
        for (let x = 40; x < 119; x++) assert.ok(t.q[x + 1] >= t.q[x] - 1e-12, `${c.code} ${sex} ${y}: q must rise after 40 (age ${x})`);
        const imr = eraView(c, y).imr / 1000;
        assert.ok(Math.abs(t.q[0] - imr * (sex === 'M' ? 1.12 : 0.88)) < 1e-6 + imr * 0.001);
      }
    }
  }
});

test('rng: deterministic, uniform-ish, state is JSON-safe', () => {
  const a = createRngState('seed-1'), b = createRngState('seed-1'), c = createRngState('seed-2');
  const xa = Array.from({ length: 5 }, () => rand(a)), xb = Array.from({ length: 5 }, () => rand(b)), xc = Array.from({ length: 5 }, () => rand(c));
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  const st = createRngState(42);
  const saved = JSON.parse(JSON.stringify(st));
  const next1 = rand(st);
  assert.equal(rand(saved), next1, 'restored rng state must continue identically');
  let sum = 0;
  const N = 100000;
  for (let i = 0; i < N; i++) sum += rand(st);
  assert.ok(Math.abs(sum / N - 0.5) < 0.01);
  const counts = [0, 0, 0];
  for (let i = 0; i < 30000; i++) counts[weightedIndex(st, [1, 2, 3])]++;
  assert.ok(Math.abs(counts[2] / 30000 - 0.5) < 0.02);
});

test('yearly templates are well-formed', () => {
  assert.ok(YEARLY.length >= 30, `need >= 30 starter lines, have ${YEARLY.length}`);
  for (const t of YEARLY) {
    assert.equal(typeof t.text, 'function');
    if (t.ages) assert.ok(t.ages[0] >= 0 && t.ages[1] >= t.ages[0]);
  }
  // Every age 0..100 must have at least one unconditional-ish template.
  for (let age = 0; age <= 100; age++) {
    assert.ok(YEARLY.some((t) => (!t.ages || (age >= t.ages[0] && age <= t.ages[1]))), `no yearly template for age ${age}`);
  }
});
