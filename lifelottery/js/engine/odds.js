// "這樣一生的機率": how unlikely was this particular life? Pure maths on the engine's own statistics, no DOM and no
// text: the UI turns the keys below into words (js/strings.js, S.odds).
//
// A life is described by independent-looking draws that the birth lottery really makes (engine/birth.js):
//   country  share of the year's babies (or of the living population, per draw mode) born in this country
//   gender   the country's sex ratio at birth (era-adjusted)
//   wealth   the family's wealth fifth (uniform: 1/5)
//   place    city or countryside, from the country's urban share nudged by family wealth
//   age      (only for a finished life) the chance of dying at exactly that age, from the country / sex / year life table:
//            P(alive at age a) * q(a), where q(a) is the annual death probability at the age of death (享年)
// Everything is conditional on the birth YEAR (the era only picks the year), so the numbers answer
// "among the babies born that year, how many are like this one?". The product of the parts is the whole.
//
// The urban shares repeat birth.js (URBAN_BY_WEALTH is private there); tests/odds.test.mjs samples drawBirth() to
// make sure they never drift apart.

import { BY_CODE, COUNTRIES } from '../data/countries.js';
import { eraView } from '../data/eras.js';
import { lifeTable, MAX_AGE } from './mortality.js';
import { babyShare } from './birth.js';

export const URBAN_BY_WEALTH = [0.7, 0.85, 1, 1.12, 1.3];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** P(born in `country` | birth year, draw mode). */
export function countryShare(country, birthYear, drawMode = 'births') {
  return babyShare(country, birthYear, drawMode === 'population' ? 'population' : 'births').share;
}

/** P(gender | country, birth year): from the era-adjusted sex ratio at birth (males per 100 females). */
export function genderShare(country, birthYear, gender) {
  const srb = eraView(country, birthYear).srb;
  const pM = srb / (100 + srb);
  return gender === 'M' ? pM : 1 - pM;
}

/** P(wealth fifth) = 1/5 (the draw is uniform). */
export const WEALTH_SHARE = 1 / 5;

/** P(urban birth | country, birth year, wealth fifth). */
export function urbanShare(country, birthYear, wealthQ) {
  return clamp((eraView(country, birthYear).urban / 100) * URBAN_BY_WEALTH[clamp(wealthQ, 1, 5) - 1], 0.01, 0.99);
}

/** P(dying at exactly `age` completed years | alive at birth), for the country / sex / birth-year life table. */
export function deathAtAge(country, gender, birthYear, age) {
  const table = lifeTable(country, gender, birthYear);
  const a = clamp(Math.floor(age), 0, MAX_AGE);
  let alive = 1;
  for (let x = 0; x < a; x++) alive *= 1 - table.q[x];
  return Math.max(alive * table.q[a], 1e-12);
}

// ---------------------------------------------------------------------------------------------
// Human-friendly rounding of "1 in N"
// ---------------------------------------------------------------------------------------------

export const SCALES = [{ unit: 'zhao', size: 1e12 }, { unit: 'yi', size: 1e8 }, { unit: 'wan', size: 1e4 }];

/**
 * Round N for display and split it into a number and a Chinese unit scale.
 *   N <  10  -> one decimal      ( 5.5 )
 *   N < 100  -> whole number     ( 47 )
 *   N < 10^4 -> two significant  ( 4300 )
 *   N >= 10^4 -> two significant, expressed in 萬 / 億 / 兆   ( 3.4 萬, 1.2 億 )
 * Returns { n (exact), rounded (number actually shown, in plain units), value (number shown next to the unit),
 * unit: '' | 'wan' | 'yi' | 'zhao', decimals }.
 */
export function humanizeOneIn(n) {
  const exact = Math.max(1, Number(n) || 1);
  let rounded;
  if (exact < 10) rounded = Math.round(exact * 10) / 10;
  else if (exact < 100) rounded = Math.round(exact);
  else {
    const pow = 10 ** (Math.floor(Math.log10(exact)) - 1);
    rounded = Math.round(exact / pow) * pow;
  }
  for (const { unit, size } of SCALES) {
    if (rounded >= size) {
      const value = Math.round((rounded / size) * 10) / 10;
      if (value >= 10000 && unit !== 'zhao') continue; // 10000 億 -> 1 兆 (handled by the next bigger scale)
      return { n: exact, rounded, value, unit, decimals: value % 1 ? 1 : 0 };
    }
  }
  return { n: exact, rounded, value: rounded, unit: '', decimals: exact < 10 && rounded % 1 ? 1 : 0 };
}

// ---------------------------------------------------------------------------------------------
// The odds of a life
// ---------------------------------------------------------------------------------------------

/**
 * @param {{ countryCode: string, birthYear: number, drawMode?: string, gender: 'F'|'M', wealthQ: number,
 *           urban: boolean, deathAge?: number|null }} life
 * @returns {{ p: number, oneIn: number, human: object, atBirth: object, parts: Array }}
 *   parts: [{ key: 'country'|'gender'|'wealth'|'place'|'age', p, oneIn, human, value }] in that order; `value` carries what
 *   the UI needs to name the fact (gender 'F'|'M', wealthQ, urban, age, country code).
 *   atBirth: the same for the first four parts only ("像你這樣的人", before anything has happened).
 */
export function lifeOdds(life) {
  const country = BY_CODE[life.countryCode];
  if (!country) throw new Error(`unknown country ${life.countryCode}`);
  const year = life.birthYear;
  const wealthQ = clamp(Math.round(life.wealthQ), 1, 5);
  const gender = life.gender === 'M' ? 'M' : 'F';
  const urban = !!life.urban;

  const pUrban = urbanShare(country, year, wealthQ);
  const specs = [
    ['country', countryShare(country, year, life.drawMode), life.countryCode],
    ['gender', genderShare(country, year, gender), gender],
    ['wealth', WEALTH_SHARE, wealthQ],
    ['place', urban ? pUrban : 1 - pUrban, urban],
  ];
  if (life.deathAge != null && Number.isFinite(life.deathAge)) specs.push(['age', deathAtAge(country, gender, year, life.deathAge), Math.floor(life.deathAge)]);

  const parts = specs.map(([key, p, value]) => ({ key, p, oneIn: 1 / p, human: humanizeOneIn(1 / p), value }));
  const product = (list) => list.reduce((a, b) => a * b.p, 1);
  const total = product(parts);
  const born = parts.filter((x) => x.key !== 'age');
  const pBorn = product(born);
  return {
    p: total,
    oneIn: 1 / total,
    human: humanizeOneIn(1 / total),
    atBirth: { p: pBorn, oneIn: 1 / pBorn, human: humanizeOneIn(1 / pBorn) },
    parts,
  };
}

/** Odds of a living (or just born) engine state: no age part until it has died. */
export function oddsFromState(s) {
  return lifeOdds({
    countryCode: s.homeCountryCode,
    birthYear: s.birthYear,
    drawMode: s.settings && s.settings.drawMode,
    gender: s.gender,
    wealthQ: s.family.wealthQ,
    urban: s.flags && s.flags._birthUrban != null ? s.flags._birthUrban : s.urban,
    deathAge: s.death ? s.death.age : null,
  });
}

/**
 * Odds from an album summary (js/engine/summary.js `getSummary`, possibly an old record). The draw mode is not part of the summary,
 * so pass the one stored with the record (default: by newborns, the game's default). Returns null if the summary is unusable.
 */
export function oddsFromSummary(sum, drawMode = 'births') {
  if (!sum || !sum.homeCountry) return null;
  let code = sum.homeCountry.code;
  if (!BY_CODE[code]) {
    const byName = COUNTRIES.find((c) => c.name === sum.homeCountry.name);
    code = byName ? byName.code : null;
  }
  if (!code || !Number.isFinite(sum.birthYear)) return null;
  return lifeOdds({
    countryCode: code,
    birthYear: sum.birthYear,
    drawMode,
    gender: sum.gender,
    wealthQ: sum.wealthQ,
    urban: sum.urbanBirth,
    deathAge: Number.isFinite(sum.age) ? sum.age : null,
  });
}

// ---------------------------------------------------------------------------------------------
// Personal odds: how likely was it to get this far with THIS life's health and risks?
// ---------------------------------------------------------------------------------------------
//
// The headline 約 1／N above is a population probability: it uses the country's average life table and does not know whether
// this person was healthy or frail. This is the second, separate question. During the game every year's death check uses
// q(age) x m(age), where m is the personal risk multiplier (health against the age norm, wealth, smoking, chronic
// conditions, events, life focus; normalised so the population average is 1, see mortality.js). The engine keeps the m that
// it actually applied in each year (`state.flags._riskTrail`, `summary.riskTrail`), so
//
//   P(reach age a | this life's risks) = prod over x < a of (1 - min(1, q(x) m(x)))
//
// is computed from the real thing, not from the final stats. It is compared with the same product without the personal
// factor (the baseline, = the life table's survival to a). The two answers must not be multiplied together: the headline
// already contains the chance of dying at exactly that age.

/**
 * @param {{ countryCode: string, birthYear: number, gender: 'F'|'M', deathAge: number, riskTrail: number[] }} life
 *   `riskTrail[x]` is the multiplier applied in the year of life x (ages 0 .. deathAge-1 are needed).
 * @returns {{ age: number, p: number, baseline: number, ratio: number } | null}
 *   null when the data is missing or incomplete (old records have no trail), or for a life that ended before age 1.
 */
export function personalSurvival(life) {
  if (!life) return null;
  const country = BY_CODE[life.countryCode];
  const age = Math.floor(life.deathAge);
  const trail = life.riskTrail;
  if (!country || !Number.isFinite(age) || age < 1 || age > MAX_AGE || !Array.isArray(trail) || trail.length < age) return null;
  const table = lifeTable(country, life.gender === 'M' ? 'M' : 'F', life.birthYear);
  let p = 1, baseline = 1;
  for (let x = 0; x < age; x++) {
    const m = trail[x];
    if (!Number.isFinite(m) || m < 0) return null;
    baseline *= 1 - table.q[x];
    p *= 1 - Math.min(1, table.q[x] * m);
  }
  p = Math.max(p, 1e-12);
  baseline = Math.max(baseline, 1e-12);
  return { age, p, baseline, ratio: p / baseline };
}

/** Personal survival of an engine state that has died (null while the person is alive or has no trail). */
export function personalFromState(s) {
  if (!s || !s.death) return null;
  return personalSurvival({
    countryCode: s.homeCountryCode,
    birthYear: s.birthYear,
    gender: s.gender,
    deathAge: s.death.age,
    riskTrail: s.flags && s.flags._riskTrail,
  });
}

/** Personal survival from an album summary (old records without `riskTrail` give null). */
export function personalFromSummary(sum) {
  if (!sum || !sum.homeCountry || !Array.isArray(sum.riskTrail)) return null;
  let code = sum.homeCountry.code;
  if (!BY_CODE[code]) {
    const byName = COUNTRIES.find((c) => c.name === sum.homeCountry.name);
    code = byName ? byName.code : null;
  }
  if (!code || !Number.isFinite(sum.birthYear)) return null;
  return personalSurvival({ countryCode: code, birthYear: sum.birthYear, gender: sum.gender, deathAge: sum.age, riskTrail: sum.riskTrail });
}
