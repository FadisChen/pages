// Life tables, annual death probability, risk multiplier and cause-of-death draw.
//
// Table shape (per country, sex and birth year):
//   age 0       q0   from the infant mortality rate (imr)
//   ages 1-4         shaped so survival to age 5 equals 1 - u5mr
//   ages 5+          Gompertz-Makeham  mu(x) = A + B * exp(C * (x - 5)),
//                    with B found by bisection so that life expectancy at birth equals the
//                    era-adjusted `le[sex]` of the country (see eras.js).
// Tables are cached by (country, sex, year).

import { CONDITIONS } from '../data/conditions.js';
import { causeWeights, CAUSES, causeSentence } from '../data/causes.js';
import { eraView } from '../data/eras.js';
import { rand, weightedIndex, pick, clamp } from './rng.js';
import RISK_REF from '../data/riskref.js';

export const MAX_AGE = 120;

const tableCache = new Map();

function sexTilt(sex) { return sex === 'M' ? 1.12 : 0.88; }

/** Expected years lived for a hazard table q[0..MAX_AGE] (continuous-age e0 with uniform deaths in the year). */
function e0Of(q) {
  let l = 1, e = 0;
  for (let x = 0; x <= MAX_AGE; x++) {
    const d = l * q[x];
    e += l - d / 2;
    l -= d;
    if (l < 1e-9) break;
  }
  return e;
}

/** Annual death probability from the Gompertz-Makeham hazard over [x, x+1). */
function gmQ(x, A, B, C) {
  const cum = A + (B * Math.exp(C * (x - 5)) * (Math.exp(C) - 1)) / C;
  return 1 - Math.exp(-cum);
}

/** Solve the 4-year childhood hazard scale k so that product(1 - k*w_i) equals the target survival ratio. */
function childhoodQs(ratio) {
  const w = [1.7, 1.1, 0.75, 0.55];
  const sumW = w.reduce((a, b) => a + b, 0);
  const target = clamp(ratio, 0.2, 1);
  let lo = 0, hi = 0.99 / Math.max(...w);
  for (let i = 0; i < 40; i++) {
    const k = (lo + hi) / 2;
    const surv = w.reduce((p, wi) => p * (1 - k * wi), 1);
    if (surv > target) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  void sumW;
  return w.map((wi) => k * wi);
}

/** Build (or fetch from cache) the life table for a country / sex / birth year. */
export function lifeTable(country, sex, year) {
  const y = Math.round(year);
  const key = `${country.code}|${sex}|${y}`;
  const hit = tableCache.get(key);
  if (hit) return hit;

  const v = eraView(country, y);
  const le = v.le[sex];
  const q = new Float64Array(MAX_AGE + 1);

  const q0 = clamp((v.imr / 1000) * sexTilt(sex), 0.0003, 0.6);
  const u5 = clamp((v.u5mr / 1000) * sexTilt(sex), q0 * 1.02, 0.8);
  q[0] = q0;
  const cq = childhoodQs((1 - u5) / (1 - q0));
  for (let i = 0; i < 4; i++) q[1 + i] = cq[i];

  const C = 0.07 + 0.03 * clamp((le - 45) / 40, 0, 1);
  const A = (0.0002 + 0.00012 * clamp(80 - le, 0, 40)) * (sex === 'M' ? 1.5 : 0.8);
  let lo = Math.log(1e-9), hi = Math.log(0.5);
  for (let it = 0; it < 60; it++) {
    const lb = (lo + hi) / 2;
    const B = Math.exp(lb);
    for (let x = 5; x < MAX_AGE; x++) q[x] = gmQ(x, A, B, C);
    q[MAX_AGE] = 1;
    if (e0Of(q) > le) lo = lb; else hi = lb;
  }
  const B = Math.exp((lo + hi) / 2);
  for (let x = 5; x < MAX_AGE; x++) q[x] = gmQ(x, A, B, C);
  q[MAX_AGE] = 1;

  const table = { q, e0: e0Of(q), key, le };
  tableCache.set(key, table);
  return table;
}

/** Probability a person of `sex` aged `age` (country/era table) dies within the year; used for relatives. */
export function baselineQ(country, sex, year, age) {
  return lifeTable(country, sex, year).q[clamp(Math.floor(age), 0, MAX_AGE)];
}

/** Remaining life expectancy at `age` from a table (years). */
export function remainingLife(table, age) {
  let l = 1, e = 0;
  for (let x = age; x <= MAX_AGE; x++) {
    const d = l * table.q[x];
    e += l - d / 2;
    l -= d;
    if (l < 1e-9) break;
  }
  return e;
}

/** Typical health stat for an age in a country where life expectancy is `le` (used as the baseline). */
export function expectedHealth(age, le) {
  const r = age / (le + 8);
  return 92 - 58 * Math.pow(Math.min(r, 1.3), 2.4);
}

/** Key of the reference row for a person: income group + gender + era (past / present / future lives differ). */
export function riskKey(country, s) {
  return `${country.income}${s.gender}@${s.settings.era}`;
}

/** Width (years) of the age bins in data/riskref.js. */
export const RISK_BIN = 5;

/**
 * Personal multiplier on the base annual death probability, BEFORE normalisation.
 * Terms: health vs. the age norm, wealth, smoking, chronic conditions, event-driven riskMult
 * and temporary risks, plus early-childhood circumstances (family wealth, rural birth).
 */
export function rawRiskMultiplier(s, country, view) {
  if (s.age < 5) {
    // Infants and toddlers: family circumstances matter more than a "health" stat.
    const wq = [1.5, 1.2, 1.0, 0.85, 0.7][s.family.wealthQ - 1] / 1.05;
    const u = view.urban / 100;
    const urb = s.urban ? 0.9 / (u * 0.9 + (1 - u) * 1.1) : 1.1 / (u * 0.9 + (1 - u) * 1.1);
    return clamp(wq * urb * s.riskMult, 0.2, 6);
  }
  let lg = 0;
  const le = view.le[s.gender];
  lg += -0.012 * (s.stats.health - expectedHealth(s.age, le));
  lg += -0.003 * (s.stats.wealth - 50);
  if (s.smoker && s.age >= 30) lg += 0.3;
  // Access to care: chronic conditions are deadlier where health care is scarce.
  const access = { L: 1.35, LM: 1.15, UM: 1.0, H: 0.85 }[country.income];
  for (const id of s.conditions) {
    const c = CONDITIONS[id];
    if (c) lg += Math.log(1 + (c.risk - 1) * access * 0.6);
  }
  lg += Math.log(s.riskMult);
  const temp = s.flags._risks;
  if (temp && temp.length) for (const [m, until] of temp) if (until > s.age) lg += Math.log(m);
  if (s.flags._birthThisYear && s.gender === 'F') lg += { L: 0.35, LM: 0.2, UM: 0.1, H: 0.03 }[country.income];
  return clamp(Math.exp(lg), 0.25, 8);
}

/**
 * Normalised multiplier actually applied to the life table. Dividing by the (income group, gender,
 * age bin) mean keeps the population-average multiplier at ~1, so mean lifespan stays equal to the
 * country's life expectancy while individuals still differ. The mean is taken separately for each era (people
 * born in 1960 are poorer and less schooled than people born in 2026, which shifts their raw multiplier). The reference table is generated by
 * tools/calibrate-risk.mjs and must be regenerated when systems or event risk effects change.
 */
export function riskMultiplier(s, country, view) {
  const raw = rawRiskMultiplier(s, country, view);
  if (s.age < 5) return raw;
  const row = RISK_REF[riskKey(country, s)] || RISK_REF[country.income + s.gender];
  const ref = row ? row[Math.floor(s.age / RISK_BIN)] ?? row[row.length - 1] : 1;
  return clamp(raw / (ref || 1), 0.2, 8);
}

/**
 * Resolve the year `s.age -> s.age + 1`: returns true if the person dies. The caller handles
 * recording the death (cause draw, state update).
 */
export function dies(s, country, view) {
  if (s.age >= MAX_AGE) return true; // nobody lives past the end of the table
  const table = lifeTable(country, s.gender, s.birthYear);
  const q = table.q[Math.min(s.age, MAX_AGE)] * riskMultiplier(s, country, view);
  return rand(s.rng) < Math.min(q, 1);
}

/** Draw a cause of death id for the person described by `s` (does not mutate it, except the rng). */
export function drawCause(s, country, view, eraKey) {
  const w = causeWeights(s, country, view, eraKey);
  const ids = Object.keys(w);
  const i = weightedIndex(s.rng, ids.map((id) => w[id]));
  return i < 0 ? 'other' : ids[i];
}

/** A random full-sentence description for a cause id. */
export function describeCause(s, causeId) {
  return causeSentence(causeId, (arr) => pick(s.rng, arr));
}

export function causeLabel(causeId) {
  return (CAUSES[causeId] || CAUSES.other).label;
}
