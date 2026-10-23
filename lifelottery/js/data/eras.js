// Era parameters: how a country's statistics look in the past, the present and the future. The
// engine never reads raw country records for a life; it asks for `eraView(country, year)`, which
// interpolates between three anchors and extrapolates a little beyond the outer two.
//
// Anchors:
//   1970     real 1970 data where we have it (le1970, imr1970, pop1970), model for the rest
//   present  the numbers stored in countries.js
//   2050     le2050 plus a documented convergence model (UN WPP-style) for everything else
//
// Birth years: "past" lives are born 1955-1990, "future" lives 2040-2070. Years before 1970 continue the
// 1970 -> 1985 trend backwards (damped), years after 2050 continue the 2035 -> 2050 trend forwards
// (damped); both are clamped to plausible bounds and frozen beyond 1950 / 2090.
//
// All derived formulas below are deliberately simple and documented so that balance changes are
// easy: they only need to be roughly right, because events and systems add the texture.

import { COUNTRIES } from './countries.js';

export const PAST_YEAR = 1970;   // anchor year of the past statistics
export const FUTURE_YEAR = 2050; // anchor year of the future statistics
export const ERA_KEYS = ['past', 'present', 'future'];
/** Inclusive range of birth years drawn for the "past" and "future" eras. */
export const PAST_BIRTHS = [1955, 1990];
export const FUTURE_BIRTHS = [2040, 2070];
const EXTRAP_FROM = 1950; // statistics are frozen before this year ...
const EXTRAP_TO = 2090;   // ... and after this one

/** Short names of the eras (the birth-year ranges are PAST_BIRTHS / FUTURE_BIRTHS). */
export const ERA_LABELS = {
  past: '過去',
  present: '現在',
  future: '未來',
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

/** Number of distinct birth years of an era (1 for the present). */
export function eraSpan(eraKey) {
  if (eraKey === 'past') return PAST_BIRTHS[1] - PAST_BIRTHS[0] + 1;
  if (eraKey === 'future') return FUTURE_BIRTHS[1] - FUTURE_BIRTHS[0] + 1;
  return 1;
}

/**
 * Birth year for an era key. `offset` is an integer 0 .. eraSpan-1 chosen by the caller (uniform over the
 * era's range); `overrideYear` forces the year (tests, "replay this life").
 */
export function birthYearFor(eraKey, offset = 0, overrideYear = null) {
  if (overrideYear != null) return overrideYear;
  if (eraKey === 'past') return PAST_BIRTHS[0] + offset;
  if (eraKey === 'future') return FUTURE_BIRTHS[0] + offset;
  return presentYear();
}

/** Era key (for h.era()) that a calendar year belongs to. */
export function eraOfYear(year) {
  const now = presentYear();
  if (year <= PAST_BIRTHS[1]) return 'past';
  if (year >= FUTURE_BIRTHS[0]) return 'future';
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

/**
 * Approximate GDP per capita around 1970 (same units as countries.js `gdp`, i.e. international dollars
 * PPP) for economies whose growth since then makes the generic model (a fraction of today's GDP scaled by
 * 1970 life expectancy) badly wrong: the East Asian miracle economies, oil states and ex-communist
 * countries. Rounded recollections of Maddison-style series; everything else uses the generic model.
 */
const GDP1970 = {
  KOR: 2900, TWN: 3600, SGP: 6500, HKG: 8500, CHN: 900, JPN: 15000, THA: 1900, MYS: 3200, IDN: 1300, VNM: 800,
  IND: 1100, BGD: 1000, PAK: 1700, LKA: 1900, TUR: 5200, IRN: 6500, SAU: 9000, ARE: 20000, KWT: 35000, QAT: 20000,
  BHR: 14000, OMN: 5000, ISR: 11000, IRL: 9500, ESP: 10500, PRT: 6500, GRC: 11000, POL: 8000, ROU: 4200, CZE: 12000,
  HUN: 9000, RUS: 10500, UKR: 8500, BLR: 8000, KAZ: 8000, BGR: 7000, CHL: 6000, ARG: 11500, BWA: 800, GNQ: 1000,
  PRK: 2000, MNG: 2800, MMR: 800, KHM: 900, LAO: 800, EGY: 1500, DZA: 3500, MAR: 1800, TUN: 2400, CUB: 4000, SVK: 9500,
  HRV: 9000, SRB: 7500, SVN: 11500, EST: 9000, LVA: 9000, LTU: 8500, ARM: 5000, GEO: 5500, AZE: 5500,
};

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
    gdp: Math.round(GDP1970[c.code] ?? c.gdp * (0.12 + 0.33 * d)),
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

// Fields that grow geometrically (interpolated in log space).
const GEOMETRIC = new Set(['gdp', 'pop']);

function lerp(a, b, t, key = '') {
  if (typeof a === 'number') {
    if (GEOMETRIC.has(key) && a > 0 && b > 0) {
      // Economies that grew several-fold since 1970 did so early: use a concave path for them.
      const ratio = b / a;
      const f = key === 'gdp' && ratio >= 3 ? 1 - Math.pow(1 - t, 1.6) : t;
      return a * Math.pow(ratio, f);
    }
    return a + (b - a) * t;
  }
  const out = {};
  for (const k of Object.keys(a)) out[k] = lerp(a[k], b[k], t, key || k);
  return out;
}

// ---- Extrapolation beyond the outer anchors ----------------------------------------------------------

const BOUNDS = {
  le: [25, 95], imr: [1, 320], u5mr: [1.2, 460], tfr: [1.1, 7.9], school: [0.2, 19], tertiary: [0.2, 98], gdp: [60, 1e7],
  poverty: [0, 95], urban: [3, 97], childMarriage: [0, 90], smoke: [0, 80], homicide: [0, 400], road: [0, 80], suicide: [0, 80],
  marryAge: [15, 40], pop: [1000, 1e11], births: [100, 1e10],
};

/**
 * Continue the trend between `ref` and `anchor` (geometric for gdp / pop, linear otherwise) by `dy` years
 * from the anchor. `span` = anchor year - reference year (negative when extrapolating backwards).
 */
function extrapolate(anchor, ref, span, dy, damp, key = '') {
  if (typeof anchor === 'number') {
    let v;
    if (GEOMETRIC.has(key) && anchor > 0 && ref > 0) v = anchor * Math.pow(anchor / ref, (dy / span) * damp);
    else v = anchor + ((anchor - ref) / span) * dy * damp;
    const bd = BOUNDS[key];
    if (bd) v = clamp(v, bd[0], bd[1]);
    return Math.round(v * 100) / 100;
  }
  const out = {};
  for (const k of Object.keys(anchor)) out[k] = extrapolate(anchor[k], ref[k], span, dy, damp, key || k);
  return out;
}

function tidy(v) {
  // Keep derived relations sensible after extrapolation.
  const out = { ...v };
  out.u5mr = Math.max(out.u5mr, out.imr * 1.02);
  return out;
}

const viewCache = new Map(); // `${code}|${yearInt}` -> view

/**
 * Statistics for `country` as of `year`: interpolation between the 1970, present and 2050 anchors, and a
 * damped continuation of the trend before 1970 (down to 1950) and after 2050 (up to 2090). Returned
 * objects are shared and must be treated as read-only.
 */
export function eraView(country, year) {
  const y = clamp(Math.round(year), EXTRAP_FROM, EXTRAP_TO);
  const key = `${country.code}|${y}`;
  let v = viewCache.get(key);
  if (v) return v;
  const now = presentYear();
  const past = anchorView(country, 'past'), present = anchorView(country, 'present'), future = anchorView(country, 'future');
  if (y < PAST_YEAR) {
    const ref = lerp(past, present, 15 / (now - PAST_YEAR)); // 1985
    v = tidy(extrapolate(past, ref, -15, y - PAST_YEAR, 0.85));
    v.srb = past.srb;
  } else if (y === PAST_YEAR) v = past;
  else if (y <= now) v = lerp(past, present, (y - PAST_YEAR) / (now - PAST_YEAR));
  else if (y < FUTURE_YEAR) v = lerp(present, future, (y - now) / (FUTURE_YEAR - now));
  else if (y === FUTURE_YEAR) v = future;
  else {
    const ref = lerp(present, future, (FUTURE_YEAR - 15 - now) / (FUTURE_YEAR - now)); // 2035
    v = tidy(extrapolate(future, ref, 15, y - FUTURE_YEAR, 0.55));
    v.srb = future.srb;
  }
  viewCache.set(key, v);
  return v;
}

// ---- Era-adjusted income group -------------------------------------------------------------------------

// Income-group boundaries in the units of countries.js `gdp` (international dollars PPP per head). They
// were chosen to separate the World Bank groups of today's data as cleanly as one threshold per boundary can.
const INCOME_BOUNDS = { LM: 2100, UM: 9500, H: 18000 };
const INCOME_ORDER = ['L', 'LM', 'UM', 'H'];
const calibration = new Map();

/** Per-country factor that makes today's GDP land inside the country's own (World Bank) group band. */
function incomeCalibration(c) {
  let f = calibration.get(c.code);
  if (f === undefined) {
    const i = INCOME_ORDER.indexOf(c.income);
    const lo = i === 0 ? 0 : INCOME_BOUNDS[c.income], hi = i === 3 ? Infinity : INCOME_BOUNDS[INCOME_ORDER[i + 1]];
    f = 1;
    if (c.gdp < lo) f = (lo * 1.02) / c.gdp;
    else if (c.gdp >= hi) f = (hi * 0.98) / c.gdp;
    calibration.set(c.code, f);
  }
  return f;
}

/**
 * Income group ('L' | 'LM' | 'UM' | 'H') of a country in a given calendar year, from the era GDP per head
 * (so South Korea in 1975 is lower-middle, not high income). In the present year it equals the country's
 * World Bank group by construction.
 */
export function incomeGroupAt(country, year) {
  const g = eraView(country, year).gdp * incomeCalibration(country);
  return g >= INCOME_BOUNDS.H ? 'H' : g >= INCOME_BOUNDS.UM ? 'UM' : g >= INCOME_BOUNDS.LM ? 'LM' : 'L';
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
