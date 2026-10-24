// The birth lottery: which era, country, urban/rural setting, gender, family and name a new life gets,
// plus the helpers the UI uses to describe the draw ("100 babies" statistic, country vs world).

import { COUNTRIES, BY_CODE } from '../data/countries.js';
import { eraView, drawWeight, worldView, resolveEra, birthYearFor, eraSpan, ERA_LABELS } from '../data/eras.js';
import { drawGroup, makeName, getPool, composeName, motherFamilyToken, GROUP_KEYS } from '../data/names.js';
import { lifeTable } from './mortality.js';
import { rand, randInt, poisson, normal, clamp, weightedIndex } from './rng.js';
import { placePhrases } from './place.js';
import { RELIGION_LABELS } from '../data/religion.js';

export const WEALTH_LABELS = ['最貧困的五分之一', '偏低的五分之一', '中等的五分之一', '偏高的五分之一', '最富裕的五分之一'];
export const WEALTH_SHORT = ['赤貧', '清寒', '小康', '寬裕', '富裕'];
export const GENDER_LABELS = { F: '女性', M: '男性' };

const weightCache = new Map(); // `${year}|${mode}` -> { weights, total }

function weightsFor(year, mode) {
  const key = `${Math.round(year)}|${mode}`;
  let w = weightCache.get(key);
  if (!w) {
    const weights = COUNTRIES.map((c) => drawWeight(c, year, mode));
    w = { weights, total: weights.reduce((a, b) => a + b, 0) };
    weightCache.set(key, w);
  }
  return w;
}

/** Draw a country for the given birth year / draw mode ('births' | 'population'). */
export function drawCountry(rng, year, mode) {
  const { weights } = weightsFor(year, mode);
  return COUNTRIES[weightedIndex(rng, weights)];
}

/**
 * Share of the 100 babies born in this era that are born in `country`.
 * Returns { share (0..1), per100, oneIn }.
 */
export function babyShare(country, year, mode) {
  const { weights, total } = weightsFor(year, mode);
  const w = weights[COUNTRIES.indexOf(country)];
  const share = w / total;
  return { share, per100: share * 100, oneIn: Math.round(1 / share) };
}

/** Human text for the "100 babies" statistic, e.g. "約 18 個" or "不到 1 個（約每 700 個才有 1 個）". */
export function babyShareText(country, year, mode) {
  const { per100, oneIn } = babyShare(country, year, mode);
  if (per100 >= 10) return `約 ${Math.round(per100)} 個`;
  if (per100 >= 1) return `約 ${per100.toFixed(1)} 個`;
  return `不到 1 個（約每 ${oneIn.toLocaleString('en-US')} 個嬰兒才有 1 個）`;
}

// Probability of an urban birth is shifted by family wealth so that rich families skew urban while
// the national urban share is preserved on average (factors average to 1).
const URBAN_BY_WEALTH = [0.7, 0.85, 1, 1.12, 1.3];

/** Probability of surviving from age a to age b under the given table (no personal risk). */
function survivalBetween(table, a, b) {
  let s = 1;
  for (let x = a; x < b; x++) s *= 1 - table.q[Math.min(x, 120)];
  return s;
}

function makeParents(rng, country, view, birthYear, wealthQ, siblings, groupKey, name) {
  const tfr = view.tfr;
  const mu = 24.5 + 3.5 * clamp((2.4 - tfr) / 1.5, -1, 1.5) + Math.min(siblings, 4) * 1.2;
  const motherAge = Math.round(clamp(normal(rng, mu, 4.8), 16, 46));
  const fatherAge = Math.round(clamp(motherAge + normal(rng, 3.5, 3), Math.max(18, motherAge - 3), motherAge + 16));
  const mT = lifeTable(country, 'F', birthYear), fT = lifeTable(country, 'M', birthYear);
  const motherAlive = rand(rng) < survivalBetween(mT, 18, motherAge) * 0.995;
  const fatherAlive = rand(rng) < survivalBetween(fT, 18, fatherAge) * 0.99;
  const r = () => rand(rng);
  const pool = getPool(groupKey);
  let father, mother;
  if (pool.mode === 'syll') {
    // Two-word personal names without a shared family name (Burmese, Bhutanese ...).
    father = makeName(groupKey, 'M', r);
    mother = makeName(groupKey, 'F', r);
  } else {
    // The father carries the family's name token (for patronymic cultures the player's family token
    // IS the father's given name); the mother keeps her own name where that is the custom.
    const fGiven = pool.mode === 'patro' && name.familyToken ? name.familyToken : pool.M[Math.floor(r() * pool.M.length)];
    const fFam = pool.mode === 'patro' ? pool.M[Math.floor(r() * pool.M.length)] : name.familyToken;
    const mGiven = pool.F[Math.floor(r() * pool.F.length)];
    father = composeName(groupKey, 'M', fGiven, fFam);
    mother = composeName(groupKey, 'F', mGiven, motherFamilyToken(groupKey, name.familyToken, r));
  }
  return {
    mother: { alive: motherAlive, age: motherAge, name: mother.full },
    father: { alive: fatherAlive, age: fatherAge, name: father.full },
  };
}

export const START_VERSION = 1;

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const cleanParent = (p) => (p && typeof p === 'object' && typeof p.alive === 'boolean' && isInt(p.age, 12, 95) && isStr(p.name, 80) ? { alive: p.alive, age: p.age, name: p.name } : null);

/**
 * Validate and clean the "start" of a life (the `birth` object of createLife / the album's `meta.birth`):
 *   { v:1, eraKey, birthYear, countryCode, city, urban, gender, wealthQ,                 <- always (a partial start)
 *     poolKey, name:{ given, family, full, givenToken, familyToken }, siblings,
 *     mother:{ alive, age, name }, father:{ ... }, religion, business }                  <- the rest (a complete start)
 * Returns the clean object with `full: boolean`, or null when even the partial start is unusable (unknown country, ...).
 */
export function normalizeBirth(b) {
  if (!b || typeof b !== 'object') return null;
  const country = BY_CODE[b.countryCode];
  if (!country) return null;
  if (b.gender !== 'M' && b.gender !== 'F') return null;
  if (!isInt(b.wealthQ, 1, 5) || !isInt(b.birthYear, 1800, 2200) || typeof b.urban !== 'boolean') return null;
  const eraKey = ['past', 'present', 'future'].includes(b.eraKey) ? b.eraKey : null;
  if (!eraKey) return null;
  const out = {
    v: START_VERSION, eraKey, birthYear: b.birthYear, countryCode: country.code, gender: b.gender, wealthQ: b.wealthQ, urban: b.urban,
    city: typeof b.city === 'string' && country.cities.includes(b.city) ? b.city : '',
    full: false,
  };
  const n = b.name;
  const mother = cleanParent(b.mother), father = cleanParent(b.father);
  const complete = GROUP_KEYS.includes(b.poolKey) && out.city
    && n && typeof n === 'object' && isStr(n.full, 80) && isStr(n.given, 80) && typeof n.family === 'string' && n.family.length <= 80
    && typeof n.givenToken === 'string' && typeof n.familyToken === 'string'
    && isInt(b.siblings, 0, 11) && mother && father && RELIGION_LABELS[b.religion];
  if (!complete) return out;
  return {
    ...out, full: true, poolKey: b.poolKey, siblings: b.siblings, mother, father, religion: b.religion,
    name: { given: n.given, family: n.family, full: n.full, givenToken: n.givenToken, familyToken: n.familyToken },
    business: typeof b.business === 'boolean' ? b.business : undefined,
  };
}

/** The draw result for a complete start (fresh copies: the parents are mutated as the life goes on). */
function birthFromStart(nb) {
  return {
    eraKey: nb.eraKey, birthYear: nb.birthYear, country: BY_CODE[nb.countryCode], gender: nb.gender, wealthQ: nb.wealthQ, urban: nb.urban, city: nb.city,
    poolKey: nb.poolKey, name: { ...nb.name }, siblings: nb.siblings,
    parents: { mother: { ...nb.mother }, father: { ...nb.father } },
    religion: nb.religion, business: nb.business,
  };
}

/**
 * Draw everything that defines the start of a life.
 * `opts` may force { countryCode, gender, urban, wealthQ, birthYear, eraKey, city } (used by tests and tools), or carry a whole
 * `birth` (the start of an earlier life: "same start, live again", see normalizeBirth).
 * `rng` is the life's PRNG state array.
 */
export function drawBirth(rng, settings, opts = {}) {
  if (opts.birth) {
    // "Same start, live again": reuse the start of an earlier life (see normalizeBirth). A complete start consumes no random numbers at
    // all, so everything after it comes from the new seed; an incomplete one (an old album record) forces what it knows and draws the rest.
    const nb = normalizeBirth(opts.birth);
    if (!nb) throw new Error('Invalid birth');
    if (nb.full) return birthFromStart(nb);
    const { birth, ...rest } = opts;
    return drawBirth(rng, settings, { ...rest, eraKey: nb.eraKey, birthYear: nb.birthYear, countryCode: nb.countryCode, gender: nb.gender, wealthQ: nb.wealthQ, urban: nb.urban, city: nb.city || undefined });
  }
  const eraKey = opts.eraKey || resolveEra(settings.era, () => rand(rng));
  // Past: 1955-1990, future: 2040-2070 (uniform); the present era is the current year.
  const span = eraSpan(eraKey);
  const offset = span > 1 ? randInt(rng, 0, span - 1) : 0;
  const birthYear = birthYearFor(eraKey, offset, opts.birthYear ?? settings.birthYear ?? null);
  const country = opts.countryCode ? BY_CODE[opts.countryCode] : drawCountry(rng, birthYear, settings.drawMode || 'births');
  const view = eraView(country, birthYear);

  const gender = opts.gender || (rand(rng) < view.srb / (100 + view.srb) ? 'M' : 'F');
  const wealthQ = opts.wealthQ || randInt(rng, 1, 5);
  const pUrban = clamp((view.urban / 100) * URBAN_BY_WEALTH[wealthQ - 1], 0.01, 0.99);
  const urban = opts.urban ?? rand(rng) < pUrban;
  const city = opts.city || country.cities[Math.floor(rand(rng) * country.cities.length)];

  // Culture group: a country may hold several (Nigeria: Hausa / Yoruba / Igbo ...), drawn by population share.
  const poolKey = drawGroup(country.code, () => rand(rng), country.region);
  const name = makeName(poolKey, gender, () => rand(rng));
  const siblingMean = Math.max(0.1, view.tfr * 1.15 * (1 + 0.1 * (3 - wealthQ)) - 1);
  const siblings = Math.min(poisson(rng, siblingMean), 11);
  const parents = makeParents(rng, country, view, birthYear, wealthQ, siblings, poolKey, name);

  return { eraKey, birthYear, country, gender, wealthQ, urban, city, poolKey, name, siblings, parents };
}

/** Generate a name for a relative / partner / child. `familyToken` forces the surname (children). */
export function randomName(rng, poolKey, gender, familyToken = null) {
  return makeName(poolKey, gender, () => rand(rng), familyToken);
}

/** Family name token used for a child's surname, given the state's pool and father's surname. */
export function inheritedFamilyToken(s) {
  return s.flags._ft || null;
}

/**
 * Everything the lottery reveal card needs, as plain data.
 * `comparisons` pairs the country's value with the world average of the same era.
 */
export function describeBirth(s) {
  const country = BY_CODE[s.homeCountryCode];
  const view = eraView(country, s.birthYear);
  const world = worldView(s.birthYear);
  const table = lifeTable(country, s.gender, s.birthYear);
  const schoolAvg = (view.school.F + view.school.M) / 2;
  const mode = s.settings.drawMode || 'births';
  const birthCity = s.flags._birthCity ?? s.city, birthUrban = s.flags._birthUrban ?? s.urban; // the place of BIRTH, not today's
  const place = placePhrases(country.name, birthCity, birthUrban);
  return {
    name: s.name.full,
    year: s.birthYear,
    era: s.settings.era,
    eraName: ERA_LABELS[s.settings.era],
    // reads as "…出生的 100 個嬰兒": the current era says 現在, past / future lives name their birth year
    eraLabel: s.settings.era === 'present' ? ERA_LABELS.present : `${s.birthYear} 年`,
    countryCode: country.code,
    countryName: country.name,
    region: country.region,
    income: country.income,
    city: birthCity,
    urban: birthUrban,
    placeText: place.short,
    placeFull: place.full,
    gender: s.gender,
    genderLabel: GENDER_LABELS[s.gender],
    wealthQ: s.family.wealthQ,
    wealthLabel: WEALTH_LABELS[s.family.wealthQ - 1],
    wealthShort: WEALTH_SHORT[s.family.wealthQ - 1],
    babiesPer100: babyShare(country, s.birthYear, mode).per100,
    babiesText: babyShareText(country, s.birthYear, mode),
    lifeExpectancy: Math.round(table.e0 * 10) / 10,
    comparisons: [
      { key: 'le', label: '出生時平均壽命', unit: '歲', value: Math.round(((view.le.F * 100 + view.le.M * view.srb) / (100 + view.srb)) * 10) / 10, world: world.le, higherIsBetter: true },
      { key: 'imr', label: '嬰兒死亡率', unit: '‰', value: Math.round(view.imr * 10) / 10, world: world.imr, higherIsBetter: false },
      { key: 'school', label: '預期受教育年限', unit: '年', value: Math.round(schoolAvg * 10) / 10, world: world.school, higherIsBetter: true },
      { key: 'gdp', label: '人均所得（購買力）', unit: '國際元', value: Math.round(view.gdp), world: world.gdp, higherIsBetter: true },
    ],
  };
}
