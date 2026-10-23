// Era parameters: how a country's statistics look in the past (~1970), the present, and the
// future (~2050). The engine never reads raw country records for a life; it asks for
// `eraView(country, year)`, which interpolates between the three anchors.
//
// Anchors:
//   1970     real 1970 data where we have it (le1970, imr1970, pop1970), model for the rest
//   present  the numbers stored in countries.js
//   2050     le2050 plus a documented convergence model (UN WPP-style) for everything else
//
// All derived formulas below are deliberately simple and documented so that balance changes are
// easy: they only need to be roughly right, because events and systems add the texture.

import { COUNTRIES } from './countries.js';

export const PAST_YEAR = 1970;
export const FUTURE_YEAR = 2050;
export const ERA_KEYS = ['past', 'present', 'future'];

export const ERA_LABELS = {
  past: '過去（約 1970）',
  present: '現在',
  future: '未來（約 2050）',
};

/** Calendar year used for the "present" era. Evaluated lazily so tests can override via settings. */
export function presentYear() {
  return new Date().getFullYear();
}

/** Resolve a settings value ('past'|'present'|'future'|'random') to a concrete era key. */
export function resolveEra(setting, randFn) {
  if (ERA_KEYS.includes(setting)) return setting;
  return ERA_KEYS[Math.floor(randFn() * ERA_KEYS.length)];
}

/** Birth year for an era key. `jitter` is an integer offset (-3..3) chosen by the caller. */
export function birthYearFor(eraKey, jitter = 0, overrideYear = null) {
  if (overrideYear != null) return overrideYear;
  if (eraKey === 'past') return PAST_YEAR + jitter;
  if (eraKey === 'future') return FUTURE_YEAR + jitter;
  return presentYear();
}

/** Era key (for h.era()) that a calendar year belongs to. */
export function eraOfYear(year) {
  const now = presentYear();
  if (year <= PAST_YEAR + 12) return 'past';
  if (year >= FUTURE_YEAR - 12) return 'future';
  return year <= now + 3 ? 'present' : 'future';
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const round1 = (x) => Math.round(x * 10) / 10;

/** Development index 0..1 from 1970 life expectancy; used by most past-era formulas. */
function devIndex(c) {
  return clamp((c.le1970 - 35) / (75 - 35), 0, 1);
}

/** Rough 1970 total fertility from today's TFR and 1970 infant mortality. */
export function pastTfr(c) {
  return clamp(Math.max(c.tfr * 1.12, 2.0 + c.imr1970 / 55), 1.8, 7.9);
}

/** Population growth factor to 2050: momentum (+8%) plus fertility above/below replacement. */
export function popFactor2050(c) {
  return clamp(1.08 + 0.22 * (c.tfr - 2.05), 0.6, 2.4);
}

function buildPast(c) {
  const d = devIndex(c);
  const gap = c.le.F - c.le.M;
  const pastGap = clamp(gap * (0.6 + 0.7 * d), 0.5, 9);
  const tfr = pastTfr(c);
  const ratio = clamp(c.u5mr / c.imr, 1.02, 2.2);
  const sf = 0.3 + 0.45 * d;
  const roadFactor = { H: 4, UM: 1.8, LM: 0.6, L: 0.5 }[c.income];
  return {
    le: { F: round1(c.le1970 + pastGap / 2), M: round1(c.le1970 - pastGap / 2) },
    imr: c.imr1970,
    u5mr: round1(c.imr1970 * ratio),
    tfr: round1(tfr),
    school: { F: round1(c.school.F * sf * (1 - 0.18 * (1 - d))), M: round1(c.school.M * sf * (1 + 0.04 * (1 - d))) },
    tertiary: round1(clamp(c.tertiary * (0.1 + 0.4 * d * d), 0.3, 60)),
    gdp: Math.round(c.gdp * (0.12 + 0.33 * d)),
    poverty: round1(clamp(c.poverty + 60 * Math.pow(1 - d, 1.3), 0, 92)),
    urban: round1(clamp(c.urban * (0.5 + 0.4 * d), 4, 95)),
    childMarriage: round1(clamp(c.childMarriage * 1.5 + 4, 0, 85)),
    srb: c.srb,
    smoke: { F: round1(clamp(c.smoke.F * (d > 0.8 ? 1.5 : 0.8), 0, 45)), M: round1(clamp(c.smoke.M * 1.15 + 8 * d, 0, 75)) },
    homicide: c.homicide,
    road: round1(c.road * roadFactor),
    suicide: c.suicide,
    marryAge: { F: round1(Math.max(17, c.marryAge.F - (1.5 + 3.5 * d))), M: round1(Math.max(19, c.marryAge.M - (1.2 + 3 * d))) },
    pop: c.pop1970,
    births: Math.round(c.pop1970 * tfr * 0.0064),
  };
}

function buildPresent(c) {
  return {
    le: c.le, imr: c.imr, u5mr: c.u5mr, tfr: c.tfr, school: c.school, tertiary: c.tertiary, gdp: c.gdp,
    poverty: c.poverty, urban: c.urban, childMarriage: c.childMarriage, srb: c.srb, smoke: c.smoke,
    homicide: c.homicide, road: c.road, suicide: c.suicide, marryAge: c.marryAge, pop: c.pop, births: c.births,
  };
}

function buildFuture(c) {
  const gap = (c.le.F - c.le.M) * 0.85;
  const avg2050 = c.le2050;
  const tfr = c.tfr + (1.75 - c.tfr) * 0.4;
  const gdpF = { L: 2.0, LM: 1.9, UM: 1.6, H: 1.35 }[c.income];
  const pop = Math.round(c.pop * popFactor2050(c));
  return {
    le: { F: round1(avg2050 + gap / 2), M: round1(avg2050 - gap / 2) },
    imr: round1(Math.max(1.2, c.imr * 0.55)),
    u5mr: round1(Math.max(1.5, c.imr * 0.55 * Math.max(1.05, (c.u5mr / c.imr) * 0.95))),
    tfr: round1(tfr),
    school: { F: round1(c.school.F + (17.5 - c.school.F) * 0.3), M: round1(c.school.M + (17 - c.school.M) * 0.3) },
    tertiary: round1(c.tertiary + (85 - c.tertiary) * 0.45),
    gdp: Math.round(c.gdp * gdpF),
    poverty: round1(c.poverty * 0.3),
    urban: round1(c.urban + (90 - c.urban) * 0.4),
    childMarriage: round1(c.childMarriage * 0.35),
    srb: c.srb,
    smoke: { F: round1(c.smoke.F * 0.6), M: round1(c.smoke.M * 0.6) },
    homicide: round1(c.homicide * 0.8),
    road: round1(c.road * 0.55),
    suicide: c.suicide,
    marryAge: { F: round1(c.marryAge.F + (c.marryAge.F < 25 ? 2 : 1.5)), M: round1(c.marryAge.M + (c.marryAge.M < 25 ? 2 : 1.5)) },
    pop,
    births: Math.round(pop * tfr * 0.0056),
  };
}

const anchorCache = new Map(); // `${code}|${anchor}` -> view

function anchorView(c, anchor) {
  const key = `${c.code}|${anchor}`;
  let v = anchorCache.get(key);
  if (!v) {
    v = anchor === 'past' ? buildPast(c) : anchor === 'future' ? buildFuture(c) : buildPresent(c);
    anchorCache.set(key, v);
  }
  return v;
}

function lerp(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  const out = {};
  for (const k of Object.keys(a)) out[k] = lerp(a[k], b[k], t);
  return out;
}

const viewCache = new Map(); // `${code}|${yearInt}` -> view

/**
 * Statistics for `country` as of `year` (linear interpolation between the 1970, present and 2050
 * anchors). Returned objects are shared and must be treated as read-only.
 */
export function eraView(country, year) {
  const y = Math.round(year);
  const key = `${country.code}|${y}`;
  let v = viewCache.get(key);
  if (v) return v;
  const now = presentYear();
  if (y <= PAST_YEAR) v = anchorView(country, 'past');
  else if (y >= FUTURE_YEAR) v = anchorView(country, 'future');
  else if (y <= now) v = lerp(anchorView(country, 'past'), anchorView(country, 'present'), (y - PAST_YEAR) / (now - PAST_YEAR));
  else v = lerp(anchorView(country, 'present'), anchorView(country, 'future'), (y - now) / (FUTURE_YEAR - now));
  viewCache.set(key, v);
  return v;
}

/** Draw weight of a country for a given birth year and draw mode ('births' | 'population'). */
export function drawWeight(country, year, mode) {
  const v = eraView(country, year);
  return mode === 'population' ? v.pop : v.births;
}

const worldCache = new Map();

/**
 * World aggregate for comparisons: births-weighted life expectancy / IMR, population-weighted
 * schooling and GDP, over the listed countries (>99% of humanity).
 */
export function worldView(year) {
  const y = Math.round(year);
  if (worldCache.has(y)) return worldCache.get(y);
  let b = 0, p = 0, le = 0, imr = 0, u5 = 0, school = 0, gdp = 0, tfr = 0, urban = 0, poverty = 0;
  for (const c of COUNTRIES) {
    const v = eraView(c, y);
    b += v.births; p += v.pop;
    le += v.births * (v.le.F * 100 + v.le.M * v.srb) / (100 + v.srb);
    imr += v.births * v.imr; u5 += v.births * v.u5mr; tfr += v.pop * v.tfr;
    school += v.pop * (v.school.F + v.school.M) / 2; gdp += v.pop * v.gdp;
    urban += v.pop * v.urban; poverty += v.pop * v.poverty;
  }
  const w = {
    le: round1(le / b), imr: round1(imr / b), u5mr: round1(u5 / b), tfr: Math.round((tfr / p) * 100) / 100,
    school: round1(school / p), gdp: Math.round(gdp / p), urban: round1(urban / p), poverty: round1(poverty / p),
    pop: p, births: b,
  };
  worldCache.set(y, w);
  return w;
}
