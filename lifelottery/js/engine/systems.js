// The yearly "systems": everything that happens to a life every year regardless of events.
// Growth and health, schooling, work and income, love and marriage (including child marriage),
// fertility, ageing parents / partner / children, smoking, chronic conditions and retirement.
//
// `runSystems(s)` is called by life.js once per tick, after age/year have been incremented.
// All randomness comes from `s.rng`; all log entries are appended to `s.log`.
//
// The state-mutating primitives (startJob, marry, addChild, migrate, ...) are exported so that
// helpers.js (and therefore events) use exactly the same code paths as the systems.
//
// Phase 6B added `state.household` (who lives with whom): see the "Household" section below. It is created lazily
// (ensureHousehold), kept up to date by marry / divorce / addChild / migrate / the yearly pass, and never draws a
// random number (every household decision is a stableFlip), so a life without migration or divorce is untouched.

import { BY_CODE } from '../data/countries.js';
import { eraView, incomeGroupAt } from '../data/eras.js';
import { CONDITIONS } from '../data/conditions.js';
import { HIV_HIGH } from '../data/causes.js';
import { baselineQ, expectedHealth } from './mortality.js';
import { rand, chance, between, randInt, normal, clamp, weightedIndex, normInv, poisson, hash01 } from './rng.js';
import { randomName } from './birth.js';
import { drawGroup, getPool, childFamilyToken } from '../data/names.js';
import { fxOf } from './focus.js';
import { placeGeo } from '../data/geo.js';
import { remember, noteSpoken, speech, resting } from './memory.js';
import { kinYear, kinParentDied, syncPartner, inLawsOf } from './kin.js';

export const STAT_KEYS = ['health', 'happiness', 'knowledge', 'wealth', 'social'];
export const EDU_LEVELS = ['none', 'primary', 'secondary', 'tertiary', 'graduate'];

// ---------------------------------------------------------------------------------------------
// Context cache (current country, era view, birth-era view)
// ---------------------------------------------------------------------------------------------

const ctxCache = new WeakMap();

/** Cached per-state lookups; invalidated automatically when the year or country changes. */
export function ctxOf(s) {
  let c = ctxCache.get(s);
  if (!c || c.code !== s.countryCode || c.year !== s.year) {
    const country = BY_CODE[s.countryCode];
    const home = BY_CODE[s.homeCountryCode];
    c = {
      code: s.countryCode, year: s.year, country, home,
      view: eraView(country, s.year),
      birthView: eraView(home, s.birthYear),
      income: incomeGroupAt(country, s.year), // era-adjusted income group (used for living-conditions text)
    };
    ctxCache.set(s, c);
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Small state utilities
// ---------------------------------------------------------------------------------------------

/**
 * Deterministic per-life coin flip: true with probability `p`, the same answer for the same life and `key`, without consuming
 * the random generator (h.stable is this function).
 */
export function stableFlip(s, key, p = 0.5) {
  const fixed = s.flags && s.flags._fix; // set only by a "same start" life (createLife { birth }): answers carried over from the first life
  if (fixed && Object.prototype.hasOwnProperty.call(fixed, key)) return !!fixed[key];
  if (!(p > 0)) return false;
  if (p >= 1) return true;
  return hash01(`${s.seed}|${s.birthYear}|${s.name.full}|${key}`) < p;
}

/**
 * Does this person drink alcohol (beer with friends, a toast at the wedding)? Decided once per life: very unlikely in a Muslim
 * family, unlikely in many Hindu, Sikh and Buddhist families, less likely for women, and always true with the condition 'alcohol'.
 */
export function drinksAlcohol(s) {
  if (s.age < 18 && !s.conditions.includes('alcohol')) return false;
  if (s.conditions.includes('alcohol')) return true;
  let p = { muslim: 0.04, hindu: 0.3, sikh: 0.3, buddhist: 0.5, jewish: 0.7, folk: 0.6 }[s.religion] ?? 0.78;
  if (s.gender === 'F') {
    const home = BY_CODE[s.homeCountryCode];
    p *= s.homeCountryCode === 'USA' || (home && (home.region === 'EUR' || home.region === 'OCE')) ? 0.9 : 0.45;
  }
  return stableFlip(s, 'drinks', p);
}

/** Append a log entry and return it. */
export function pushLog(s, kind, title, text, delta) {
  const e = { age: s.age, year: s.year, kind, title, text };
  if (delta && Object.keys(delta).length) e.delta = delta;
  s.log.push(e);
  if (kind !== 'death') noteSpoken(s, text); // a memory said again in this line counts as spoken (memory.js)
  return e;
}

/**
 * A system line that can happen several times in one life ("layoff", "diagnosis" ...) must not say the same thing
 * twice: `variants` are used in order, one per occurrence (the count lives in the private flag `_sv`).
 */
export function variant(s, key, variants, overflow) {
  const used = (s.flags._sv ||= {});
  const n = used[key] || 0;
  used[key] = n + 1;
  if (n >= variants.length && overflow) return overflow(n + 1);
  return variants[n % variants.length];
}

/** Add a "highlight" (important moment shown in the summary). */
export function addHighlight(s, text) {
  s.highlights.push({ age: s.age, year: s.year, text });
}

/**
 * Apply stat deltas with clamping to 0..100. A wealth change also shifts the underlying income
 * percentile so that shocks leave a lasting mark. Returns the deltas actually applied.
 */
export function applyDelta(s, delta) {
  const out = {};
  for (const k of STAT_KEYS) {
    const d = delta[k];
    if (!d) continue;
    const before = s.stats[k];
    const after = clamp(before + d, 0, 100);
    s.stats[k] = after;
    const real = Math.round((after - before) * 10) / 10;
    if (real) out[k] = real;
    if (k === 'wealth') s.flags._pctl = clamp((s.flags._pctl ?? 0.5) + d / 130, 0.01, 0.995);
  }
  return out;
}

const incomeRank = { L: 0, LM: 1, UM: 2, H: 3 };
export const incomeAtLeast = (income, group) => incomeRank[income] >= incomeRank[group];

/** Pick a string by income group, falling back to the nearest defined group. */
export function byIncome(income, map) {
  if (map[income] !== undefined) return map[income];
  const order = ['L', 'LM', 'UM', 'H'];
  const i = order.indexOf(income);
  for (let d = 1; d < 4; d++) {
    if (i - d >= 0 && map[order[i - d]] !== undefined) return map[order[i - d]];
    if (i + d < 4 && map[order[i + d]] !== undefined) return map[order[i + d]];
  }
  return '';
}

/** Number of living children. */
export function aliveKids(s) {
  let n = 0;
  for (const c of s.children) if (c.alive) n++;
  return n;
}

const eduIndex = (s) => EDU_LEVELS.indexOf(s.edu.level);
export const levelForYears = (y) => (y <= 0 ? 'none' : y <= 6 ? 'primary' : y <= 12 ? 'secondary' : y <= 16 ? 'tertiary' : 'graduate');

// ---------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------

/**
 * Occupations. `w` = relative frequency by income group [L, LM, UM, H]; `min` = minimum education
 * index (0 none … 4 graduate); `rank` = typical income percentile within a country; `type` = work
 * status when holding it; `u` = urban multiplier; `g` = gender multipliers.
 */
export const JOBS = {
  farmer: { name: '農夫', w: [45, 28, 10, 2], min: 0, rank: 0.2, type: 'self', u: 0.1, r: 2.2 },
  fisher: { name: '漁民', w: [2, 1.5, 0.8, 0.3], min: 0, rank: 0.24, type: 'self', u: 0.05, r: 2, g: { F: 0.25, M: 1.5 } },
  laborer: { name: '臨時工', w: [12, 14, 8, 4], min: 0, rank: 0.2, type: 'employed', u: 1.4 },
  street_vendor: { name: '攤販', w: [10, 9, 4, 0.8], min: 0, rank: 0.22, type: 'self', u: 1.7 },
  domestic: { name: '家務幫傭', w: [4, 5, 3, 1.5], min: 0, rank: 0.18, type: 'employed', g: { F: 2.5, M: 0.3 } },
  miner: { name: '礦工', w: [2, 1.5, 1, 0.3], min: 0, rank: 0.3, type: 'employed', g: { F: 0.1, M: 3 } },
  factory: { name: '工廠作業員', w: [3, 10, 12, 7], min: 1, rank: 0.36, type: 'employed', u: 1.5 },
  construction: { name: '營建工人', w: [3, 6, 6, 4], min: 0, rank: 0.33, type: 'employed', g: { F: 0.1, M: 4 } },
  driver: { name: '司機', w: [3, 5, 5, 4], min: 1, rank: 0.4, type: 'employed', g: { F: 0.15, M: 4 } },
  shopkeeper: { name: '小店老闆', w: [6, 9, 7, 4], min: 1, rank: 0.5, type: 'self' },
  artisan: { name: '手藝匠人', w: [4, 4, 2, 1.5], min: 1, rank: 0.38, type: 'self' },
  cook: { name: '餐飲從業人員', w: [2, 4, 5, 5], min: 1, rank: 0.36, type: 'employed', u: 1.3 },
  guard: { name: '保全', w: [1, 2, 2, 2], min: 1, rank: 0.33, type: 'employed', g: { F: 0.3, M: 2 } },
  soldier: { name: '軍人', w: [1, 1.5, 1.5, 1.5], min: 1, rank: 0.45, type: 'employed', g: { F: 0.25, M: 3 } },
  caregiver: { name: '照護員', w: [0.5, 1, 2, 4], min: 1, rank: 0.34, type: 'employed', g: { F: 3, M: 0.3 } },
  clerk: { name: '行政職員', w: [1, 3, 6, 8], min: 2, rank: 0.52, type: 'employed', u: 1.5 },
  sales: { name: '業務銷售', w: [1, 3, 6, 7], min: 2, rank: 0.5, type: 'employed', u: 1.3 },
  technician: { name: '技術員', w: [1, 2, 4, 6], min: 2, rank: 0.55, type: 'employed', g: { F: 0.6, M: 1.4 } },
  civil_servant: { name: '公務員', w: [1, 2, 3, 4], min: 2, rank: 0.6, type: 'employed' },
  entrepreneur: { name: '創業者', w: [1, 2, 2, 2], min: 2, rank: 0.55, type: 'self' },
  artist: { name: '藝術工作者', w: [0.2, 0.5, 1, 1.5], min: 1, rank: 0.4, type: 'self' },
  teacher: { name: '教師', w: [2, 4, 5, 5], min: 3, rank: 0.6, type: 'employed', g: { F: 1.6, M: 0.8 } },
  nurse: { name: '護理師', w: [0.6, 1.5, 2.5, 4], min: 3, rank: 0.6, type: 'employed', g: { F: 5, M: 0.3 } },
  accountant: { name: '會計師', w: [0.3, 1, 2, 3], min: 3, rank: 0.65, type: 'employed' },
  engineer: { name: '工程師', w: [0.4, 1.5, 3.5, 5], min: 3, rank: 0.78, type: 'employed', g: { F: 0.5, M: 1.6 } },
  developer: { name: '軟體工程師', w: [0.1, 0.8, 2.5, 5], min: 3, rank: 0.8, type: 'employed', u: 1.5, g: { F: 0.5, M: 1.5 } },
  manager: { name: '經理人', w: [0.3, 1, 2.5, 5], min: 3, rank: 0.82, type: 'employed' },
  doctor: { name: '醫師', w: [0.2, 0.6, 1, 2], min: 3, rank: 0.92, type: 'employed' },
  lawyer: { name: '律師', w: [0.1, 0.3, 0.7, 1.2], min: 3, rank: 0.85, type: 'self' },
  researcher: { name: '研究員', w: [0.05, 0.2, 0.5, 1], min: 4, rank: 0.7, type: 'employed' },
};
export const JOB_IDS = Object.keys(JOBS);
const INC_IDX = { L: 0, LM: 1, UM: 2, H: 3 };
const CHILD_JOBS = ['farmer', 'laborer', 'street_vendor', 'domestic', 'fisher'];

function jobWeights(s, ctx, candidates) {
  const inc = INC_IDX[ctx.country.income];
  const lvl = eduIndex(s);
  return candidates.map((id) => {
    const j = JOBS[id];
    if (lvl < j.min) return 0;
    let w = j.w[inc];
    if (lvl > j.min) w *= Math.pow(0.28, lvl - j.min);
    w *= s.urban ? (j.u ?? 1) : (j.r ?? (j.u && j.u > 1 ? 0.35 : 1));
    if (j.g) w *= j.g[s.gender] ?? 1;
    // an office or professional job needs more than a few years of secondary school: not for a 15-year-old who left class at 14
    if (j.min >= 2 && s.age < 18 && s.edu.years < 12) w *= 0.02;
    // nobody becomes a soldier or goes down a mine for the first time at 45
    if (id === 'soldier' && s.age > 32) w = 0;
    // the fishing in the game is sea fishing (boats, harbours, the catch): it needs a coast
    if (id === 'fisher' && !placeGeo(s.countryCode, s.city, s.urban).coast) w = 0;
    if ((id === 'miner' || id === 'construction' || id === 'fisher') && s.age > 50) w *= 0.15;
    return w;
  });
}

/** Pick an occupation id suited to the person's education, gender and surroundings. */
export function pickJob(s, candidates = JOB_IDS) {
  const ctx = ctxOf(s);
  const i = weightedIndex(s.rng, jobWeights(s, ctx, candidates));
  return i < 0 ? 'laborer' : candidates[i];
}

/** Put the person into an occupation (sets job and the matching work status). */
export function startJob(s, id) {
  const j = JOBS[id];
  if (!j) throw new Error(`unknown job ${id}`);
  if (!(s.flags._jobs && s.flags._jobs.length)) remember(s, 'work:first', `你有了第一份工作，是${j.name}`, { tag: 'work', w: 3 });
  s.work.job = id;
  s.work.status = j.type;
  s.flags._jobs = s.flags._jobs || [];
  if (s.flags._jobs[s.flags._jobs.length - 1] !== id) s.flags._jobs.push(id);
}

export function loseJob(s) {
  s.work.status = 'unemployed';
  s.work.job = null;
}

// ---------------------------------------------------------------------------------------------
// Initial per-life plans (marriage age, desired children, income percentile …)
// ---------------------------------------------------------------------------------------------

const NEVER_MARRY = { EAS: 0.15, SEA: 0.08, SAS: 0.02, CAS: 0.03, MENA: 0.06, SSA: 0.05, EUR: 0.2, NAM: 0.22, LAC: 0.15, OCE: 0.2 };
const SPOUSE_AGE_GAP = { EAS: 2, SEA: 2.5, SAS: 5, CAS: 3, MENA: 5, SSA: 6, EUR: 2.5, NAM: 2, LAC: 3, OCE: 2 };

function planMarriageAge(s, view, region, planView = view) {
  const era = s.settings.era;
  const never = NEVER_MARRY[region] * (era === 'past' ? 0.5 : era === 'future' ? 1.4 : 1);
  if (chance(s.rng, never)) return 999;
  if (s.gender === 'F' && chance(s.rng, view.childMarriage / 100)) {
    const i = weightedIndex(s.rng, [0.04, 0.1, 0.2, 0.3, 0.36]);
    return 13 + i;
  }
  if (s.gender === 'M' && chance(s.rng, (view.childMarriage / 100) * 0.1)) return 16 + randInt(s.rng, 0, 1);
  const mean = planView.marryAge[s.gender];
  return Math.max(18, Math.round(normal(s.rng, mean, s.gender === 'F' ? 3.2 : 3.6)));
}

/** Share of each region's population that never marries (before era scaling); also used by planChildren. */
function neverMarryShare(s, region) {
  const era = s.settings.era;
  return NEVER_MARRY[region] * (era === 'past' ? 0.5 : era === 'future' ? 1.4 : 1);
}

/**
 * Number of children this person will try to have. The mean is solved so that children per woman (the
 * simulated completed fertility) lands on the country's TFR: women who plan never to marry have few
 * children; for the rest the mean `want` is (tfr - those women's share of births) / (married share x
 * efficiency), where `efficiency` (< 1) stands for late marriage, divorce, infertility and lost children
 * that keep couples below their plan. Childlessness among the married rises as fertility falls.
 */
function planChildren(s, view, ctx, planView = view) {
  // Small calibration against simulation (survivor bias, rounding of whole children): aim a little below the TFR
  // when fertility is very low.
  const tfr0 = planView.tfr;
  const tfr = tfr0 * (0.97 + 0.03 * clamp((tfr0 - 2) / 2, 0, 1) - 0.1 * clamp((1.5 - tfr0) / 0.8, 0, 1));
  if (s.flags._marryAt >= 999) return chance(s.rng, 0.3) ? 1 + (chance(s.rng, 0.2) ? 1 : 0) : 0;
  const m = Math.min(0.5, neverMarryShare(s, ctx.country.region));
  const eff = FERT_EFFICIENCY(planView);
  const mu = Math.max(0.3, (tfr - m * 0.2) / ((1 - m) * eff));
  const childless = tfr < 1 ? 0.3 : tfr < 1.4 ? 0.2 : tfr < 2 ? 0.13 : ctx.country.income === 'H' ? 0.08 : 0.04;
  if (chance(s.rng, childless)) return 0;
  const mean = mu / (1 - childless);
  // 1 + Poisson keeps the mean exact (a clamped normal would bias small families upward).
  return mean >= 1 ? 1 + poisson(s.rng, mean - 1) : chance(s.rng, mean) ? 1 : 0;
}

/** Fraction of planned children that are actually born and survive in the model (tuned by simulation, see tests). */
const FERT_EFFICIENCY = (view) => clamp(0.92 - 0.03 * Math.max(0, view.marryAge.F - 26), 0.62, 0.92);

/** Called once by createLife after the birth draw. Sets the private plan flags. */
export function initSystems(s) {
  const ctx = ctxOf(s);
  const view = ctx.view;
  const q = s.family.wealthQ;
  s.flags._pctl = clamp((q - 0.5) / 5 + normal(s.rng, 0, 0.05), 0.02, 0.98);
  s.flags._pctl0 = s.flags._pctl;
  // People born in the past or future marry and have children decades later, when fertility and marriage ages have
  // changed: they plan from the statistics of their late twenties. The present era plans from today's numbers
  // (so that simulated children per woman can be checked against today's TFR).
  const planView = s.settings.era === 'present' ? view : eraView(ctx.home, s.birthYear + 27);
  s.flags._marryAt = planMarriageAge(s, view, ctx.country.region, planView);
  s.flags._dateAt = s.flags._marryAt >= 999 ? 999 : s.flags._marryAt < 18 ? s.flags._marryAt : Math.max(15, Math.round(s.flags._marryAt - between(s.rng, 0.5, 3.2)));
  s.flags._want = planChildren(s, view, ctx, planView);
  s.flags._lfp = null; // labour-force participation decided when leaving school
  s.flags._countries = [s.countryCode];
  s.flags._jobs = [];
  // Starting stats
  s.stats.health = clamp(88 + (q - 3) * 1.5 + normal(s.rng, 0, 3), 55, 100);
  s.stats.happiness = clamp(62 + normal(s.rng, 0, 5), 35, 85);
  s.stats.knowledge = 2;
  s.stats.wealth = wealthTarget(s, ctx);
  s.stats.social = clamp(55 + normal(s.rng, 0, 6), 30, 80);
}

// ---------------------------------------------------------------------------------------------
// Wealth model
// ---------------------------------------------------------------------------------------------

const SIGMA = { L: 0.75, LM: 0.85, UM: 0.8, H: 0.65 };
const LN_LO = Math.log(300), LN_HI = Math.log(90000);

/** Wealth stat implied by the person's income percentile in their current country. */
export function wealthTarget(s, ctx) {
  const p = clamp(s.flags._pctl ?? 0.5, 0.01, 0.995);
  const sigma = SIGMA[ctx.country.income];
  const income = ctx.view.gdp * 0.55 * Math.exp(sigma * zOf(p) - (sigma * sigma) / 2);
  const global = clamp((100 * (Math.log(Math.max(income, 1)) - LN_LO)) / (LN_HI - LN_LO), 0, 100);
  return clamp(0.5 * p * 100 + 0.5 * global, 1, 99);
}

const zOf = normInv;

/** Estimated annual income in 2011 international dollars (PPP) for the person's current country and percentile. */
export function annualIncome(s) {
  const ctx = ctxOf(s);
  const sigma = SIGMA[ctx.country.income];
  const p = clamp(s.flags._pctl ?? 0.5, 0.01, 0.995);
  return Math.round(ctx.view.gdp * 0.55 * Math.exp(sigma * zOf(p) - (sigma * sigma) / 2));
}

// ---------------------------------------------------------------------------------------------
// People around you: parents, partner, children
// ---------------------------------------------------------------------------------------------

/** Who is still alive among the parents: 'both' | 'mother' | 'father' | 'none'. */
export function parentsPresent(s) {
  const { mother, father } = s.family;
  return mother.alive && father.alive ? 'both' : mother.alive ? 'mother' : father.alive ? 'father' : 'none';
}

/**
 * Who stands in for absent parents at a wedding or a first day: an uncle, an aunt, an elder of the family while the person is
 * young enough for one to be alive (up to 40), the eldest brother or sister later on (if there are any), else nobody (''). Decided once
 * per life with `hash01`, no random numbers consumed.
 */
export function standInKin(s) {
  if (s.age <= 40) return ['叔叔', '姑姑', '舅舅', '阿姨', '伯父'][Math.floor(hash01(`${s.seed}|${s.birthYear}|${s.name.full}|standin`) * 5)];
  return s.family.siblings > 0 ? '年紀最長的手足' : '';
}

/** Have the partner's parents died too? From the roster (kin.js) once there is a marriage; the old guess by the partner's age only for a state without one. */
export function partnerParentsGone(s) {
  // the roster (kin.js) knows: both of the partner's parents are dead (created at the marriage, by the life tables)
  const laws = inLawsOf(s);
  if (laws.length) return laws.every((x) => !x.alive);
  const a = s.partner ? s.partner.age : s.age;
  return stableFlip(s, 'pt_parents_gone', clamp((a - 38) / 40, 0, 0.9));
}

/**
 * One tender sentence about the parents who cannot be at the wedding (the empty seats at the table, a prayer, an offering, an
 * uncle who gives the bride or groom away); the tradition follows the family religion. '' when both parents are alive.
 */
export function weddingAbsence(s, again = (s.flags._married || 0) >= 2) {
  const pp = parentsPresent(s);
  const far = parentsFar(s);
  if (pp === 'both') return far && !again ? `婚禮那天，遠在${BY_CODE[s.homeCountryCode].name}的爸媽只能透過${farLink(s)}參加，${farLink(s)}那頭傳來他們壓不住的笑聲，和一點點哽咽。` : '';
  // a second wedding: the empty seats were already told once
  if (again) return pp === 'none' ? '這一次，你只在心裡對過世的爸媽說：「我慢慢走到這裡了。」' : `這一次，你只在心裡對過世的${pp === 'mother' ? '父親' : '母親'}說了一聲。`;
  const rel = s.religion || 'none';
  if (pp === 'none') {
    const kin = standInKin(s);
    const both = partnerParentsGone(s);
    const by = kin ? `${kin}坐在旁邊，替你們主婚` : '沒有人替你們主婚，你和對方自己牽著手，向賓客一桌一桌敬了過去';
    const seats = both ? '雙方過世的父母都沒能到場，主桌上留了四個空位' : '你過世的爸媽沒能到場';
    switch (rel) {
      case 'muslim': return `婚禮前一天，你到墓地為過世的爸媽唸了一段祈禱，把明天的事告訴他們。${by}。`;
      case 'christian': return `牧師在禱詞裡提到你過世的爸媽，你低頭停了一下。${kin ? `${kin}陪你走到台前` : '你一個人走到台前'}。`;
      case 'hindu': case 'sikh': return `儀式開始前，你在家中的神龕前點了一盞燈，請不在了的爸媽也來祝福。${by}。`;
      case 'buddhist': case 'folk': return `婚禮前你先到牌位前為過世的爸媽上了香，告訴他們今天的事。主桌替他們留了兩個位子，${by}。`;
      case 'jewish': return `華蓋旁點了一盞小燈，紀念過世的爸媽。${by}。`;
      default: return `${seats}，桌上擺著他們的相片。${by}。`;
    }
  }
  const dead = pp === 'mother' ? '父親' : '母親', alive = pp === 'mother' ? '母親' : '父親';
  if (far) return `婚禮那天，遠在${BY_CODE[s.homeCountryCode].name}的${alive}只能透過${farLink(s)}參加，你替過世的${dead}在桌上留了一個位子，擺著${dead}的相片。`;
  switch (rel) {
    case 'muslim': return `婚禮前你到墓地為過世的${dead}唸了一段祈禱，婚禮上${alive}握著你的手，眼眶紅紅的。`;
    case 'hindu': case 'sikh': case 'buddhist': case 'folk': return `儀式前你在${dead}的牌位或神龕前點了香，婚禮上${alive}坐在主桌，旁邊替過世的${dead}留了一個位子。`;
    default: return `婚禮上，${alive}坐在主桌，旁邊替過世的${dead}留了一個位子，擺著${dead}的相片。`;
  }
}

/** The person lives abroad and a living parent does not live with them. */
function parentsFar(s) {
  return isAbroad(s) && parentsAliveCount(s) > 0 && !ensureHousehold(s).parents;
}

/** How the family far away keeps in touch in this year and place: 視訊 | 電話 | 長途電話 (the lag of the technology follows income and the countryside, like h.techReady). */
function farLink(s) {
  const lag = ({ H: 0, UM: 2, LM: 4, L: 7 }[ctxOf(s).income] ?? 0) + (!s.urban && ctxOf(s).income !== 'H' ? 2 : 0);
  return s.year >= 2012 + lag ? '視訊' : s.year >= 1996 + lag ? '電話' : '長途電話';
}

/** Who sits with the person at the wedding table: '兩家人' as long as one of the person's own parents lives, else the partner's side, '親友'. */
export function weddingFolk(s) {
  return parentsPresent(s) === 'none' || parentsFar(s) ? '親友們' : '兩家人';
}

/** At a parent's death the person remembers what that parent did for them (a decision the family took when they were small), if it was kept: "你想起十歲那年，是爸爸借了車，送你去診所。" */
function parentRecall(s, who) {
  if (s.age < 14) return '';
  const word = who === 'mother' ? '媽媽' : '爸爸';
  const m = (s.memories || []).filter((x) => x.k.startsWith('f:') && !x.u && !resting(s, x) && x.p.includes(word) && s.age - x.a >= 3).sort((a, b) => (a.n || 0) - (b.n || 0) || a.a - b.a)[0];
  return m ? `你想起${speech(s, m)}。` : '';
}

function parentDeathText(s, who, ctx) {
  return `${parentDeathBase(s, who, ctx)}${parentRecall(s, who)}`;
}

function parentDeathBase(s, who, ctx) {
  const label = who === 'mother' ? '母親' : '父親';
  const young = s.age < 18;
  const poor = s.family.wealthQ <= 2;
  if (young) {
    if (s.age < 9) {
      return poor
        ? `你的${label}過世了。你還太小，只知道家裡突然變得很安靜，大人們低聲討論著接下來該怎麼辦。`
        : `你的${label}過世了。你還太小，說不清那是什麼感覺，只是一直問${label}什麼時候回來。`;
    }
    return poor
      ? `你的${label}過世了。一夜之間，你覺得自己必須快點長大。家裡突然變得很安靜，大人們低聲討論著接下來該怎麼辦。`
      : `你的${label}過世了。${s.edu.inSchool ? '你還在上學' : '你還這麼年輕'}，許多事來不及問，也來不及說。`;
  }
  return s.age < 40
    ? `你的${label}過世了，比你預期的早。你在整理遺物時，翻到一些你從來不知道的舊照片。`
    : `你的${label}在${s.family[who].age}歲那年安靜地離開了。葬禮上，親戚們輪流說起你小時候的事。`;
}

function agePeople(s, ctx) {
  // Parents
  for (const who of ['mother', 'father']) {
    const p = s.family[who];
    p.age += 1;
    if (!p.alive) continue;
    const sex = who === 'mother' ? 'F' : 'M';
    const q = baselineQ(ctx.home, sex, s.birthYear, p.age - 1);
    if (rand(s.rng) < q) {
      p.alive = false;
      kinParentDied(s, who); // the roster notes the year and the cause (no random number is used)
      const delta = applyDelta(s, {
        happiness: s.age < 18 ? -9 : -7, social: -3,
        wealth: s.age < 18 && who === 'father' && s.family.wealthQ <= 3 ? -3 : 0,
      });
      pushLog(s, 'event', who === 'mother' ? '母親過世' : '父親過世', parentDeathText(s, who, ctx), delta);
      remember(s, `loss:${who}`, `你的${who === 'mother' ? '母親' : '父親'}過世了`, { tag: 'family', w: 3 });
      householdOnParentDeath(s);
      if (s.age >= 12) s.pending.push({ id: 'regional_culture_funeral', atAge: s.age }); // the rites of the family's tradition, told in the same year
      if (!s.family.mother.alive && !s.family.father.alive && s.age < 18) {
        s.flags.orphan = true;
        addHighlight(s, '失去了雙親。');
      }
      if (s.age < 16 && s.edu.inSchool && s.family.wealthQ <= 3 && incomeRank[ctx.country.income] <= 1 && chance(s.rng, 0.3)) {
        s.flags.drop_school = true;
      }
    }
  }
  // Partner
  const pt = s.partner;
  if (pt) {
    pt.age += 1;
    if (pt.status === 'dating' || pt.status === 'married') {
      const q = baselineQ(ctx.country, pt.gender, s.year - pt.age, pt.age - 1);
      if (rand(s.rng) < q) {
        const wasMarried = pt.status === 'married';
        const apart = !ensureHousehold(s).partner; // the couple lived in different places (one of them was working far away)
        pt.status = 'widowed';
        syncPartner(s); // the roster notes the death (year, age, cause)
        householdOnPartnerGone(s, 'widowed');
        const delta = applyDelta(s, { happiness: wasMarried ? -14 : -8, social: -4, health: -2 });
        pushLog(s, 'milestone', wasMarried ? '失去伴侶' : '失去心上人',
          wasMarried
            ? (apart && isAbroad(s)
              ? `${pt.name}走了。消息是從電話那頭傳來的，你人在${BY_CODE[s.countryCode].name}，連最後一面都沒能見到。那段時間你常常拿著${farLink(s) === '視訊' ? '手機' : '話筒'}，卻想不到還能撥給誰。`
              : `${pt.name}走了。家裡每個角落都還留著對方的習慣，你花了很長一段時間才學會一個人吃飯。`)
            : `${pt.name}意外地離開了這個世界，你們原本還有很多計畫。`, delta);
        addHighlight(s, `${pt.name}離世。`);
        remember(s, 'loss:partner', `${pt.name}離開了人世`, { tag: 'love', w: 3 });
        planRemarriage(s, wasMarried ? 0.3 : 0.7);
      }
    }
  }
  // Children
  for (const c of s.children) {
    if (!c.alive) continue;
    const age = s.year - c.birthYear;
    const q = baselineQ(ctx.country, c.gender, c.birthYear, Math.max(0, age - 1));
    if (age >= 1 && rand(s.rng) < q) {
      c.alive = false;
      const delta = applyDelta(s, { happiness: -16, health: -4, social: -2 });
      pushLog(s, 'milestone', '失去孩子', `${c.name}在${age}歲時離開了你。沒有任何道理可以安慰這件事，你只是一天一天地撐過去。`, delta);
      addHighlight(s, `失去了孩子${c.name}。`);
      remember(s, `loss:kid:${c.name}`, `${c.name}在${age}歲時離開了你`, { tag: 'family', w: 3 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Household (Phase 6B): who lives with whom
//
//   state.household = {
//     v: 1,
//     parents: bool,        // lives under one roof with a living parent
//     partner: bool,        // lives with the partner (a married couple can live apart: one of them works abroad or far away)
//     kids: [ where ],      // one entry per state.children[i]: 'with_you' | 'with_partner' | 'with_grandparents' | 'home_country' | 'independent'
//     far: [ bool ],        // grown-up children (independent) who are in another country than the person (they stayed behind)
//     aloneAbroad: bool,    // abroad, and nobody of the family lives with the person
//     joint: bool,          // married into / stayed in a multi-generation home (own parents keep living with the couple)
//     sep: null | { year, partner, kids: [names], from, to, mode },   // who the person left behind when moving, and since when
//     lastReunion, lastLeft, lastLeftYear, movedIn ...                // narration hooks (names, years)
//   }
//
// Where things happen: `migrate()` (who comes along: alone / partner / family / refugee / keep), `marry()`, `divorce()` (custody),
// `addChild()` (where the baby lives), the widowhood and parent-death code in agePeople(), and `householdYear()` once a year
// (leaving home by the norms of the home country, children growing up, a parent moving in, families reuniting).
// Nothing in here draws a random number: every decision is a `stableFlip` or a plain rule, so the random stream of a life that never
// migrates or divorces is exactly what it was before the household existed.
// ---------------------------------------------------------------------------------------------

export const KID_WHERE = ['with_you', 'with_partner', 'with_grandparents', 'home_country', 'independent'];
/** Where a minor can be when the family is split: with the other parent, the grandparents, or other relatives back home. */
export const APART_WHERE = ['with_partner', 'with_grandparents', 'home_country'];

const GULF_STATES = new Set(['SAU', 'ARE', 'QAT', 'KWT', 'OMN', 'BHR']); // sponsorship rules keep most labour migrants there on their own

const HOME_LEAVE_AGE = { NAM: 20, OCE: 20, EUR: 22, LAC: 25, EAS: 25, SEA: 24, CAS: 24, MENA: 26, SAS: 25, SSA: 21 };
/** Share of couples who go on living in the (man's) parents' home after the wedding: [man, woman] by region of the home country. */
const JOINT_FAMILY = { SAS: [0.6, 0.08], MENA: [0.5, 0.06], CAS: [0.5, 0.08], SSA: [0.35, 0.08], SEA: [0.3, 0.1], EAS: [0.25, 0.06], LAC: [0.12, 0.06], EUR: [0.03, 0.02], NAM: [0.02, 0.02], OCE: [0.02, 0.02] };
/** Yearly chance (before age and sex modifiers) that an old parent moves in with the grown-up child, by region. */
const PARENT_MOVES_IN = { SAS: 0.035, MENA: 0.035, CAS: 0.03, SSA: 0.03, SEA: 0.028, EAS: 0.026, LAC: 0.016, EUR: 0.004, NAM: 0.004, OCE: 0.004 };

const parentsAliveCount = (s) => (s.family.mother.alive ? 1 : 0) + (s.family.father.alive ? 1 : 0);
const hasActivePartner = (s) => !!s.partner && (s.partner.status === 'married' || s.partner.status === 'dating');
const isAbroad = (s) => s.countryCode !== s.homeCountryCode;
const kidYears = (s, c) => s.year - c.birthYear;
const homeRegion = (s) => (BY_CODE[s.homeCountryCode] || {}).region;

/** Age at which a person (key 'self') or the i-th child (key `kid${i}`) leaves the parents' home by the norms of the home region: same for the same life. */
function leaveAgeOf(s, key) {
  const base = HOME_LEAVE_AGE[homeRegion(s)] ?? 23;
  const jitter = Math.floor(hash01(`${s.seed}|${s.birthYear}|${s.name.full}|leave:${key}`) * 8) - 3; // -3 .. +4
  return Math.max(17, base + jitter);
}

/** Has the person reached the age at which living with the parents is no longer the default (or said so by leaving home)? */
function pastHomeAge(s, hh) {
  if (hh.joint) return false;
  if (s.flags.left_home) return true;
  let age = leaveAgeOf(s, 'self');
  if (s.flags.stayed_home) age = Math.max(age, 30);
  return s.age >= age;
}

/** After a wedding: does the couple go on living with (the man's) parents? Decided once per marriage. */
function jointFamily(s) {
  const [pm, pf] = JOINT_FAMILY[homeRegion(s)] || [0.1, 0.05];
  const inc = (BY_CODE[s.homeCountryCode] || {}).income;
  const mult = inc === 'L' || inc === 'LM' ? 1.25 : inc === 'H' ? 0.6 : 1;
  return stableFlip(s, `joint:${s.flags._married || 1}`, (s.gender === 'M' ? pm : pf) * mult);
}

/** After a divorce: do the minor children stay with the person? One decision per divorce (siblings stay together). Mothers usually keep them; in the patrilineal regions fathers keep the older ones. */
function custodyWithYou(s) {
  const region = homeRegion(s);
  const patri = region === 'MENA' || region === 'SAS' || region === 'CAS';
  const minors = s.children.filter((c) => c.alive && kidYears(s, c) < 18);
  const youngest = minors.length ? Math.min(...minors.map((c) => kidYears(s, c))) : 0;
  const p = s.gender === 'F' ? (patri ? (youngest <= 7 ? 0.8 : 0.45) : 0.82) : (patri ? (youngest <= 7 ? 0.2 : 0.62) : 0.22);
  return stableFlip(s, `custody:${s.flags._divorces || 0}`, p);
}

/** Where a child lives by default (used when a child is born and to derive the household of an old save). */
function defaultKidWhere(s, hh, i) {
  const c = s.children[i];
  const pt = s.partner;
  if (kidYears(s, c) >= leaveAgeOf(s, `kid${i}`)) return 'independent';
  if (pt && pt.status === 'divorced') return custodyWithYou(s) ? 'with_you' : 'with_partner';
  // a couple who live apart (one works abroad): the baby is with the mother
  if (pt && pt.status === 'married' && !hh.partner && hh.sep && hh.sep.partner) return s.gender === 'M' ? 'with_partner' : 'with_you';
  return 'with_you';
}

/** Household of a life that has none yet: a new life, or a save from before Phase 6B (assumed to live together). */
function deriveHousehold(s) {
  const hh = { v: 1, parents: false, partner: false, kids: [], far: [], aloneAbroad: false, joint: false, sep: null };
  hh.parents = parentsAliveCount(s) > 0 && (s.age < 17 || (!isAbroad(s) && !pastHomeAge(s, hh)));
  hh.partner = !!s.partner && s.partner.status === 'married';
  return hh;
}

function refreshAlone(s, hh) {
  const withYou = s.children.some((c, i) => c.alive && hh.kids[i] === 'with_you');
  hh.aloneAbroad = isAbroad(s) && !hh.partner && !hh.parents && !withYou;
}

/**
 * The household of the person, created (without random numbers) on first use: a new life starts living with the parents; a save from
 * before Phase 6B is derived from what it already has (parents until the norm age, a married partner at home, children by the leave age
 * or the custody rule). Also keeps `kids` / `far` aligned with `children` and repairs invalid entries.
 */
export function ensureHousehold(s) {
  let hh = s.household;
  if (!hh || typeof hh !== 'object' || Array.isArray(hh)) hh = s.household = deriveHousehold(s);
  if (typeof hh.parents !== 'boolean') hh.parents = parentsAliveCount(s) > 0 && !isAbroad(s) && (s.age < 17 || !pastHomeAge(s, hh));
  if (typeof hh.partner !== 'boolean') hh.partner = !!s.partner && s.partner.status === 'married';
  if (!Array.isArray(hh.kids)) hh.kids = [];
  if (!Array.isArray(hh.far)) hh.far = [];
  const n = s.children.length;
  for (let i = 0; i < n; i++) {
    if (!KID_WHERE.includes(hh.kids[i])) hh.kids[i] = defaultKidWhere(s, hh, i);
    hh.far[i] = !!hh.far[i];
  }
  hh.kids.length = n;
  hh.far.length = n;
  refreshAlone(s, hh);
  return hh;
}

/** Alive children living with the person (grown-up ones included). */
export function kidsWith(s, where) {
  const hh = ensureHousehold(s);
  return s.children.filter((c, i) => c.alive && hh.kids[i] === where);
}

/** Where the i-th child lives (see KID_WHERE). */
export function kidWhere(s, i) {
  return ensureHousehold(s).kids[i];
}

/** Indices of alive minors (under 18) who are away from the person: with the other parent, the grandparents or relatives. */
function apartMinorIdx(s, hh) {
  const out = [];
  s.children.forEach((c, i) => { if (c.alive && kidYears(s, c) < 18 && APART_WHERE.includes(hh.kids[i])) out.push(i); });
  return out;
}

/** Does the person live with `who` ('parents' | 'partner' | 'children')? */
export function livesWithWho(s, who) {
  const hh = ensureHousehold(s);
  if (who === 'parents') return hh.parents && parentsAliveCount(s) > 0;
  if (who === 'partner') return hh.partner && hasActivePartner(s);
  if (who === 'children' || who === 'kids') return s.children.some((c, i) => c.alive && hh.kids[i] === 'with_you');
  return false;
}

// ---- transitions --------------------------------------------------------------------------------------

/** A wedding: the couple moves in together; they stay with the man's parents in the regions where that is the norm, else the person leaves the parents' home. */
function householdOnMarry(s) {
  const hh = ensureHousehold(s);
  if (!(hh.sep && hh.sep.partner)) hh.partner = true;
  if (hh.parents && s.age >= 16) {
    if (jointFamily(s)) hh.joint = true;
    else hh.parents = false;
  } else if (!hh.parents && s.age <= 36 && parentsAliveCount(s) > 0 && !isAbroad(s) && jointFamily(s)) {
    hh.parents = true;
    hh.joint = true;
  }
  refreshAlone(s, hh);
}

/** The partner is gone: divorce (custody of the minors who live with a parent) or widowhood (children with the dead partner go to relatives, or home with you). */
function householdOnPartnerGone(s, how) {
  const hh = ensureHousehold(s);
  hh.partner = false;
  hh.apart = false;
  if (hh.sep) hh.sep.partner = false;
  const minors = []; // the children who still live in a parent's home (minors, and grown-up children who have not left yet)
  s.children.forEach((c, i) => { if (c.alive && hh.kids[i] !== 'independent') minors.push(i); });
  if (how === 'divorce') {
    const mine = custodyWithYou(s);
    for (const i of minors) if (hh.kids[i] === 'with_you' || hh.kids[i] === 'with_partner') hh.kids[i] = mine ? 'with_you' : 'with_partner';
  } else {
    for (const i of minors) {
      if (hh.kids[i] !== 'with_partner') continue;
      if (!isAbroad(s)) hh.kids[i] = 'with_you';
      else {
        hh.kids[i] = parentsAliveCount(s) > 0 ? 'with_grandparents' : 'home_country';
        hh.caregiverLost = s.year; // the family reunion becomes likelier: nobody is left at home to look after the children
      }
    }
  }
  refreshAlone(s, hh);
}

/** A parent has died: nobody left to live with, and children who were with the grandparents are now with relatives. */
function householdOnParentDeath(s) {
  const hh = ensureHousehold(s);
  if (parentsAliveCount(s) === 0) {
    hh.parents = false;
    s.children.forEach((c, i) => {
      if (c.alive && hh.kids[i] === 'with_grandparents') {
        const partnerAtHome = hasActivePartner(s) && s.partner.status === 'married' && !hh.partner && hh.sep && hh.sep.partner;
        hh.kids[i] = partnerAtHome ? 'with_partner' : isAbroad(s) ? 'home_country' : 'with_you'; // not abroad: the child comes to live with the person
        if (hh.kids[i] === 'home_country') hh.caregiverLost = s.year;
      }
    });
  }
  refreshAlone(s, hh);
}

/** Take the partner and the minors along (or back): `kids` = the minors who are not independent, wherever they are. */
function bringFamily(s, hh, { partner = true, kids = true } = {}) {
  const moved = { partner: false, kids: [] };
  if (partner && hasActivePartner(s) && !hh.partner && (s.partner.status === 'married' || (hh.sep && hh.sep.partner))) { hh.partner = true; moved.partner = true; }
  if (kids) {
    s.children.forEach((c, i) => {
      if (c.alive && kidYears(s, c) < 18 && APART_WHERE.includes(hh.kids[i])) { hh.kids[i] = 'with_you'; hh.far[i] = false; moved.kids.push(c.name); }
    });
  }
  return moved;
}

/** Where a minor stays when the person leaves: with the other parent if there is a married partner at home, else with the grandparents, else with relatives. */
function leftBehindWhere(s, hh) {
  if (s.partner && s.partner.status === 'married' && !hh.partner) return 'with_partner';
  return parentsAliveCount(s) > 0 ? 'with_grandparents' : 'home_country';
}

/**
 * Who goes with the person when they move (abroad, or to a city far from home). `mode`:
 *   'alone'   nobody: the partner stays, the minors who lived with the person stay with the partner / grandparents / relatives
 *   'partner' the partner comes, the minors stay
 *   'family'  the partner and all the minors come (also those who were left behind earlier: a reunion)
 *   'refugee' whoever lives with the person comes: partner, minors and the parents who share the home
 *   'keep'    nothing changes: everybody who lives with the person goes on living with them (a second move)
 * Without a mode the engine decides from the circumstances (autoMigrationMode).
 */
function depart(s, hh, mode, meta) {
  const leftNames = [];
  let partnerLeft = false;
  if (mode === 'keep' || mode === 'refugee') {
    // everybody who lives with the person (the parents who share the home too) goes on living with them; a family sent ahead to safety is joined again
    if (mode === 'refugee' && hh.sep && hh.sep.mode === 'sent') { bringFamily(s, hh); hh.sep = null; }
  } else {
    if (mode === 'family') bringFamily(s, hh);
    else if (mode === 'partner') bringFamily(s, hh, { kids: false });
    if (mode === 'alone' && hh.partner) { hh.partner = false; partnerLeft = hasActivePartner(s); }
    else if (hasActivePartner(s) && s.partner.status === 'dating' && meta.from !== meta.to && !(hh.sep && hh.sep.partner)) partnerLeft = true; // a boyfriend or girlfriend stays behind when the person goes abroad
    if (mode !== 'family') {
      for (let i = 0; i < s.children.length; i++) {
        const c = s.children[i];
        if (c.alive && kidYears(s, c) < 18 && hh.kids[i] === 'with_you') { hh.kids[i] = leftBehindWhere(s, { ...hh, partner: mode === 'partner' }); leftNames.push(c.name); }
      }
    }
    if (hh.parents) { hh.parents = false; hh.joint = false; }
  }
  if (leftNames.length || partnerLeft) {
    const keep = hh.sep && hh.sep.year;
    hh.sep = { year: keep ?? s.year, partner: partnerLeft || !!(hh.sep && hh.sep.partner), kids: leftNames.concat(hh.sep ? hh.sep.kids.filter((n) => !leftNames.includes(n)) : []), from: meta.from, to: meta.to, mode };
    if (!s.pending.some((p) => p.id === 'migration_apart_first_year')) s.pending.push({ id: 'migration_apart_first_year', atAge: s.age + 1 });
  }
  hh.lastDepart = { year: s.year, mode, kids: leftNames, partner: partnerLeft };
  // the family that came along (or was already together) leaves nobody apart
  if (hh.sep && !apartMinorIdx(s, hh).length && !(hh.sep.partner && hasActivePartner(s) && !hh.partner)) hh.sep = null;
}

/** The person is back in the home country: the partner and the minors who were left behind live with them again, the grown-up children are near again. */
function returnHome(s, hh) {
  const apartYears = hh.sep ? s.year - hh.sep.year : 0;
  const moved = bringFamily(s, hh);
  s.children.forEach((c, i) => { hh.far[i] = false; });
  hh.parents = parentsAliveCount(s) > 0 && (hh.parents || !pastHomeAge(s, hh)); // parents who came along live with the person at home too
  hh.lastReunion = { year: s.year, apartYears, partner: moved.partner, kids: moved.kids, how: 'return' };
  hh.sep = null;
  if ((moved.partner || moved.kids.length) && apartYears >= 1 && !s.pending.some((p) => p.id === 'migration_return_reunion')) s.pending.push({ id: 'migration_return_reunion', atAge: s.age });
}

/**
 * How the engine decides who comes along when an event moved the person without saying so (world, regional and seed events):
 * refugees take everyone who lives with them; students go alone; migrants from poor countries mostly go alone (labour); people from
 * richer countries with children take the family about half of the time; couples without children come together about half of the time.
 */
function autoMigrationMode(s, hh, to) {
  const f = s.flags;
  if (f.war || f.displaced || f.m_refugee || (f._displacedAt !== undefined && s.year - f._displacedAt <= 6)) return 'refugee';
  if (s.edu.inSchool || f.m_student) return 'alone';
  const home = BY_CODE[s.homeCountryCode] || {};
  const poor = home.income === 'L' || home.income === 'LM';
  const minors = s.children.some((c, i) => c.alive && kidYears(s, c) < 18 && hh.kids[i] === 'with_you');
  const key = (name, p) => stableFlip(s, `mig:${s.year}:${name}`, p);
  if (minors) return key('family', poor ? 0.12 : 0.55) ? 'family' : 'alone';
  if (hh.partner) return key('partner', poor ? 0.3 : 0.6) ? 'family' : 'alone';
  return 'alone';
}

/** Move the household when the person changes country (called by migrate()). */
function householdOnMigrate(s, from, to, opts = {}) {
  const hh = ensureHousehold(s);
  if (to === s.homeCountryCode) returnHome(s, hh);
  else depart(s, hh, opts.with && opts.with !== 'auto' ? opts.with : autoMigrationMode(s, hh, to), { from, to });
  refreshAlone(s, hh);
}

/**
 * Move to another town or city of the same country (the countryside to the city, a posting far away). Same companions as migrate():
 * { with: 'alone' | 'partner' | 'family' | 'keep' } or by the circumstances. The person stops living with the parents.
 */
export function moveWithin(s, opts = {}) {
  const hh = ensureHousehold(s);
  const poor = ['L', 'LM'].includes((BY_CODE[s.homeCountryCode] || {}).income);
  const minors = s.children.some((c, i) => c.alive && kidYears(s, c) < 18 && hh.kids[i] === 'with_you');
  let mode = opts.with;
  if (!mode || mode === 'auto') {
    const key = (name, p) => stableFlip(s, `mov:${s.year}:${name}`, p);
    mode = minors ? (key('family', poor ? 0.4 : 0.75) ? 'family' : 'alone') : hh.partner ? (key('partner', 0.7) ? 'family' : 'alone') : 'alone';
  }
  depart(s, hh, mode, { from: s.countryCode, to: s.countryCode });
  refreshAlone(s, hh);
}

/**
 * Family members who stay behind are brought to the person (or sent to the person): the partner and the minors who live elsewhere come to
 * live with them. `opts`: { partner = true, kids = true }. Returns { partner: bool, kids: [names] } of who actually joined.
 */
export function reunite(s, opts = {}) {
  const hh = ensureHousehold(s);
  const apartYears = hh.sep ? s.year - hh.sep.year : 0;
  const moved = bringFamily(s, hh, opts);
  if (moved.partner || moved.kids.length) hh.lastReunion = { year: s.year, apartYears, partner: moved.partner, kids: moved.kids, how: 'join' };
  const left = apartMinorIdx(s, hh);
  if (hh.sep && !left.length && !(hh.sep.partner && hasActivePartner(s) && !hh.partner)) hh.sep = null;
  refreshAlone(s, hh);
  return moved;
}

/** A couple moves in together / apart by choice (family_cohabit, a trial separation). A married couple who live apart on purpose stay apart until they say so. */
export function setCohabiting(s, together) {
  const hh = ensureHousehold(s);
  hh.partner = !!together && hasActivePartner(s);
  hh.apart = !together && hasActivePartner(s) && s.partner.status === 'married';
  refreshAlone(s, hh);
}

/** The person stays while the family is sent away to safety (flight_decision): the partner takes the minors, or the minors go with the grandparents or relatives. */
export function sendFamilyAway(s) {
  const hh = ensureHousehold(s);
  const names = [];
  let partnerGone = false;
  if (hh.partner && hasActivePartner(s)) { hh.partner = false; partnerGone = true; }
  const where = partnerGone ? 'with_partner' : parentsAliveCount(s) > 0 ? 'with_grandparents' : 'home_country';
  s.children.forEach((c, i) => {
    if (c.alive && kidYears(s, c) < 18 && hh.kids[i] === 'with_you') { hh.kids[i] = where; names.push(c.name); }
  });
  if (partnerGone || names.length) {
    hh.sep = { year: s.year, partner: partnerGone, kids: names, from: s.countryCode, to: null, mode: 'sent' };
    hh.lastDepart = { year: s.year, mode: 'sent', kids: names, partner: partnerGone };
    if (!s.pending.some((p) => p.id === 'migration_apart_first_year')) s.pending.push({ id: 'migration_apart_first_year', atAge: s.age + 1 });
  }
  refreshAlone(s, hh);
  return { partner: partnerGone, kids: names };
}

/** A parent moves in with the person (or leaves again): `true` needs a living parent. */
export function setParentsHome(s, together) {
  const hh = ensureHousehold(s);
  hh.parents = !!together && parentsAliveCount(s) > 0;
  hh.joint = hh.parents;
  if (hh.parents) hh.movedIn = s.year;
  refreshAlone(s, hh);
}

/** Set where the (alive, not independent) children live: `where` is a KID_WHERE value; `only` limits it to the children currently in these places. */
export function setKidsWhere(s, where, only) {
  if (!KID_WHERE.includes(where)) return 0;
  const hh = ensureHousehold(s);
  let n = 0;
  s.children.forEach((c, i) => {
    if (!c.alive || hh.kids[i] === 'independent' || hh.kids[i] === where) return;
    if (only && !only.includes(hh.kids[i])) return;
    hh.kids[i] = where;
    hh.far[i] = false;
    n++;
  });
  refreshAlone(s, hh);
  return n;
}

/** A grown-up child (the youngest independent one) moves in with the person, e.g. an elder who goes to live with the family. */
export function moveInWithChild(s) {
  const hh = ensureHousehold(s);
  let pick = -1;
  s.children.forEach((c, i) => { if (c.alive && hh.kids[i] === 'independent' && !hh.far[i] && (pick < 0 || c.birthYear > s.children[pick].birthYear)) pick = i; });
  if (pick < 0) return null;
  hh.kids[pick] = 'with_you';
  refreshAlone(s, hh);
  return s.children[pick];
}

/** One child leaves the parents' home by choice (an event narrates it). */
export function kidLeaves(s, i) {
  const hh = ensureHousehold(s);
  const c = s.children[i];
  if (!c || hh.kids[i] === 'independent') return false;
  hh.kids[i] = 'independent';
  hh.lastLeft = i;
  hh.lastLeftYear = s.year;
  refreshAlone(s, hh);
  return true;
}

/** Zh-Hant words for whoever looks after the children who are not with the person: '伴侶', '孩子的另一位家長' (after a divorce), '孩子的祖父母', '家鄉的親戚'; '你' when they live with you; '' without children. */
export function caregiverWord(s) {
  const hh = ensureHousehold(s);
  const idx = [];
  s.children.forEach((c, i) => { if (c.alive && hh.kids[i] !== 'independent') idx.push(i); });
  if (!idx.length) return '';
  const apart = idx.filter((i) => hh.kids[i] !== 'with_you');
  if (!apart.length) return '你';
  // the youngest child who is away decides (the one who needs a carer most)
  const j = apart.reduce((a, b) => (s.children[b].birthYear > s.children[a].birthYear ? b : a));
  switch (hh.kids[j]) {
    case 'with_partner': return hasActivePartner(s) && s.partner.status === 'married' ? '伴侶' : '孩子的另一位家長'; // after a divorce it is the other parent, not a partner
    case 'with_grandparents': return '孩子的祖父母';
    default: return '家鄉的親戚';
  }
}

/** The yearly pass: leaving home, children growing up, a parent moving in, a split family trying to reunite. */
function householdYear(s, ctx) {
  const hh = ensureHousehold(s);
  const f = s.flags;
  // the partner: a married partner lives at home unless the person left them behind; a gone partner lives nowhere
  if (!hasActivePartner(s)) { hh.partner = false; if (hh.sep) hh.sep.partner = false; }
  else if (s.partner.status === 'married' && !hh.partner && !hh.apart && !(hh.sep && hh.sep.partner)) hh.partner = true;
  if (hh.partner) hh.apart = false;
  // parents
  const alive = parentsAliveCount(s);
  if (!alive) hh.parents = false;
  else if (s.age < 17) hh.parents = true;
  else if (hh.parents && pastHomeAge(s, hh)) hh.parents = false;
  // "把人接到身邊" (seed_parent_illness): the parent who fell ill lives with the person from then on
  if (!hh.parents && alive && f.caregiver_parent) { hh.parents = true; hh.joint = true; hh.movedIn = s.year; }
  // an old parent moves in with the grown-up child (the norm in some regions, rare in others), unless the person already decided
  if (!hh.parents && alive && s.age >= 38 && !isAbroad(s) && !f.f_parent_plan && !f.elder_housed && hh.movedIn === undefined) { // (once per life: the line is told once)
    const oldest = Math.max(s.family.mother.alive ? s.family.mother.age : 0, s.family.father.alive ? s.family.father.age : 0);
    if (oldest >= 72 && s.age <= 72) {
      const lone = alive === 1;
      const money = { L: 1.3, LM: 1.15, UM: 1, H: 0.8 }[ctx.income] ?? 1; // poorer households live together more: nobody can pay for two homes or for care
      const p = (PARENT_MOVES_IN[ctx.home.region] ?? 0.02) * money * (lone ? 1.6 : 0.7) * (oldest >= 80 ? 1.5 : 1) * (hh.partner || hasActivePartner(s) ? 1 : 0.8);
      if (stableFlip(s, `movein:${s.age}`, p)) {
        hh.parents = true;
        hh.joint = true; // a multi-generation home: they stay until they die
        hh.movedIn = s.year;
        const pp = parentsPresent(s);
        const who = pp === 'both' ? '爸媽' : pp === 'mother' ? '母親' : '父親';
        const they = pp === 'both' ? '他們' : pp === 'mother' ? '她' : '他';
        pushLog(s, 'event', `${who}搬來同住`, byIncome(ctx.income, {
          L: `${who}年紀大了，一個人守著老屋，你放心不下。你把${who}接來同住，屋裡最通風的那個角落成了${they}的位子，每天早晨你起床時，總會先聽見${they}在灶邊輕輕走動的聲音。`,
          LM: `${who}一個人住，鄰居說最近常看到${they}在樓梯上休息。你們商量過幾次，最後${who}把日用品打包，搬來和你同住。屋裡多了一雙拖鞋，也多了一個總是先把稀飯煮好的人。`,
          UM: `${who}年紀大了，樓梯愈爬愈吃力。你把房間重新排過，請${they}搬來同住。起初${they}什麼都想幫忙，後來慢慢習慣了被照顧，傍晚就坐在窗邊，等你回家。`,
          H: `${who}住的地方離你不近，每次通完電話你都放不下心。你整理出一間有扶手和夜燈的房間，${who}搬了過來。第一個週末，你們一起吃了久違的一頓飯，${they}把筷子擺得整整齊齊。`,
        }), applyDelta(s, { social: 2, health: -1 }));
      }
    }
  }
  // the children grow up and leave by the norms of the home region; the first to leave (and the last one, if there are several) get their own event
  const left = [];
  s.children.forEach((c, i) => {
    if (!c.alive || hh.kids[i] === 'independent') return;
    const leave = leaveAgeOf(s, `kid${i}`), ageNow = kidYears(s, c);
    // (a much older child who lives with the person moved in on purpose: an elder who went to live with a grown-up child)
    if (ageNow >= leave && ageNow <= leave + 8) {
      const was = hh.kids[i];
      left.push({ i, was });
      hh.kids[i] = 'independent';
      hh.far[i] = isAbroad(s) && was !== 'with_you'; // a child who stayed behind while the person lives abroad is far away once grown up
    }
  });
  if (left.length) {
    hh.lastLeft = left[0].i;
    hh.lastLeftYear = s.year;
    if (left.some((l) => l.was === 'with_you')) {
      const stay = s.children.some((c, i) => c.alive && hh.kids[i] === 'with_you');
      const queue = (id) => { if (s.seen[id] === undefined && !s.pending.some((p) => p.id === id)) s.pending.push({ id, atAge: s.age }); };
      if (!f.f_child_left) queue('family_child_leaves');
      else if (!stay && s.children.filter((c) => c.alive).length > 1) queue('aging_empty_nest');
    }
  }
  // a split family looks for a way to live together again (the event migration_family_joins tells it)
  if (hh.sep) {
    const apartKids = apartMinorIdx(s, hh);
    const partnerApart = hh.sep.partner && hasActivePartner(s) && !hh.partner;
    if (!apartKids.length && !partnerApart) hh.sep = null;
    else if (isAbroad(s) || hh.sep.to === hh.sep.from) {
      const years = s.year - hh.sep.year;
      const refugee = f.m_refugee || f.m_irregular;
      if (years >= 2 && !refugee && !s.pending.some((p) => p.id === 'migration_family_joins')) {
        let p = 0.05 + 0.02 * Math.min(years - 2, 4);
        if (f.m_save_family) p += 0.1;
        if (f.m_residency || f.m_citizen || f.m_work_visa || f.m_regularized) p += 0.06;
        if (hh.caregiverLost === s.year || hh.caregiverLost === s.year - 1) p += 0.25;
        if (GULF_STATES.has(s.countryCode)) p *= 0.15;
        if (s.stats.wealth < 20) p *= 0.5;
        if (stableFlip(s, `reunion:${s.year}`, Math.min(0.6, p))) s.pending.push({ id: 'migration_family_joins', atAge: s.age });
      }
    }
  }
  refreshAlone(s, hh);
}

// ---------------------------------------------------------------------------------------------
// Schooling
// ---------------------------------------------------------------------------------------------

const WEALTH_EDU_MULT = [0.62, 0.82, 1, 1.12, 1.22];
const TERT_MULT = [0.25, 0.55, 0.9, 1.4, 1.9];
const SCHOOL_QUALITY = { L: 0.6, LM: 0.75, UM: 0.9, H: 1.0 };

/** Expected years of a school career under a per-year dropout hazard h (with transition spikes). */
function expectedYears(h) {
  let surv = 1, total = 0;
  for (let y = 1; y <= 12; y++) {
    total += surv;
    const transition = y === 6 || y === 9;
    surv *= 1 - clamp(h * (transition ? 2 : 0.75), 0, 0.95);
  }
  return total;
}

function dropoutHazard(y, h) {
  return clamp(h * (y === 6 || y === 9 ? 2 : 0.75), 0, 0.95);
}

function surviveTo12(h) {
  let s = 1;
  for (let y = 1; y < 12; y++) s *= 1 - dropoutHazard(y, h);
  return s;
}

/** Decide at the school-entry age whether (and for how long) this child will study. */
function planSchooling(s, ctx) {
  const view = ctx.view;
  const q = s.family.wealthQ - 1;
  // Expected years of schooling include pre-primary years, which this model does not simulate.
  const pre = { L: 0.6, LM: 1.2, UM: 2, H: 2.2 }[ctx.country.income];
  const base = Math.max(1, view.school[s.gender] - pre);
  // Wealth gaps in schooling shrink as a country approaches universal secondary education.
  const spread = clamp((14 - base) / 8, 0.15, 1);
  // Extra dropouts from shocks (orphanhood, early marriage, pregnancy) are simulated separately, so the
  // planned years of poorer countries are inflated slightly to keep the mean on target.
  const shockAllowance = ctx.country.income === 'H' ? 1 : 1.07;
  const E = base * (1 + (WEALTH_EDU_MULT[q] - 1) * spread) * (s.urban ? 1.04 : 0.94) * shockAllowance;
  const avgSchool = (view.school.F + view.school.M) / 2;
  const sexFactor = Math.pow(view.school[s.gender] / avgSchool, 1.2);
  // Tertiary participation blends the gross enrolment ratio with what the expected years of schooling imply.
  const pTertAvg = 0.5 * clamp((base - 11.5) / 3.6, 0, 0.92) + 0.5 * clamp(view.tertiary / 100, 0, 0.92);
  const pTert = clamp(pTertAvg * TERT_MULT[q] * sexFactor, 0, 0.92);
  const E12 = clamp(E - pTert * 3.8, 1.2, 12);
  const pEnroll = clamp(1 - Math.exp(-E12 / 3.2), 0.12, 0.995);
  const mean = Math.min(12, E12 / pEnroll);
  // Solve the dropout hazard so that mean years of an enrolled child equals `mean`.
  let lo = 0, hi = 0.9;
  for (let i = 0; i < 30; i++) {
    const h = (lo + hi) / 2;
    if (expectedYears(h) > mean) lo = h; else hi = h;
  }
  const h = (lo + hi) / 2;
  s.flags._dropH = h;
  s.flags._pTertC = clamp(pTert / Math.max(0.05, pEnroll * surviveTo12(h)), 0, 0.97);
  s.flags._enroll = chance(s.rng, Math.min(0.995, pEnroll * (fxOf(s).enroll ?? 1)));
}

const SCHOOL_START = 6;

function schooling(s, ctx) {
  const inc = ctx.country.income;
  const edu = s.edu;
  // --- Entry ---
  if (!edu.inSchool && edu.years === 0 && s.age >= SCHOOL_START && s.age <= SCHOOL_START + 3) {
    if (s.flags._enroll === undefined) planSchooling(s, ctx);
    if (!s.flags._enroll) {
      if (!s.flags._noSchoolLogged) {
        s.flags._noSchoolLogged = true;
        pushLog(s, 'milestone', '沒有上學', byIncome(ctx.income, {
          L: '同齡的孩子背著書包出門時，你留在家裡幫忙。學費、制服和路途，都不是你家負擔得起的事。',
          LM: '你到了該上學的年紀，卻沒有被送進教室。家裡需要人手，書本離你很遠。',
          UM: '你到了該上學的年紀，卻因為家裡的狀況沒能入學。',
          H: '你到了該上學的年紀，卻因為特殊的處境沒能照常入學。',
        }), applyDelta(s, { happiness: -3, knowledge: -1 }));
      }
      return;
    }
    if (s.flags._lateStart === undefined) s.flags._lateStart = incomeRank[inc] <= 1 && s.family.wealthQ <= 2 ? randInt(s.rng, 0, 2) : 0;
    if (s.age >= SCHOOL_START + s.flags._lateStart) {
      edu.inSchool = true;
      edu.level = 'primary';
      s.work.status = 'student';
      pushLog(s, 'milestone', '第一天上學', byIncome(ctx.income, {
        L: '你穿著洗得發白的制服，走了很長一段路到學校。教室擠滿了孩子，課本要好幾個人輪流看，但老師叫得出每個人的名字。',
        LM: '你揹著新書包走進教室，位子是按身高排的。老師在黑板上寫下你的名字，你第一次覺得自己是這個地方的一份子。',
        UM: '開學第一天，家人陪你走到校門口。你緊緊抓著書包帶子，直到看見同樣緊張的同學，才敢鬆開手。',
        H: '開學第一天，你背著比自己還大的書包，在教室裡找到貼著你名字的座位。老師蹲下來，笑著跟你說早安。',
      }), applyDelta(s, { happiness: 2, social: 2 }));
    }
    return;
  }
  if (!edu.inSchool) { returnToSchool(s, ctx); return; }

  // --- Adults who went back to school (night school, second chance) ---
  if (s.flags._adultEd) { adultSchooling(s, ctx); return; }

  // --- A school year completed ---
  edu.years += 1;
  edu.level = levelForYears(edu.years);
  const q = SCHOOL_QUALITY[inc];
  const gain = (edu.years > 12 ? 5 : 5.8) * q + normal(s.rng, 0, 0.8);
  s.stats.knowledge = clamp(s.stats.knowledge + gain, 0, 100);

  const y = edu.years;
  if (s.flags.drop_school) {
    s.flags.drop_school = false;
    leaveSchool(s, '你不得不離開學校。');
    return;
  }
  if (y === 6) pushLog(s, 'milestone', '小學畢業', (s.family.wealthQ >= 4 || (incomeRank[inc] >= 2 && s.family.wealthQ >= 3)) ? '你領到畢業證書，在校門口和同學拍了好多張合照，下一個學期就是新的學校了。' : '你領到畢業證書，這是家裡不少人沒有的東西。', applyDelta(s, { happiness: 2, knowledge: 1 }));
  if (y < 12) {
    if (rand(s.rng) < dropoutHazard(y, s.flags._dropH ?? 0.05) * (fxOf(s).dropout ?? 1)) {
      const reason = s.family.wealthQ <= 2 && incomeRank[inc] <= 1
        ? '學費、交通和家裡的缺口，一點一點把你推出了教室。'
        : (s.gender === 'F' && ctx.view.childMarriage > 15 ? '家裡認為女孩讀到這裡就夠了。' : '你漸漸跟不上，也失去了繼續念下去的動力。');
      leaveSchool(s, reason);
    }
    return;
  }
  if (y === 12) {
    pushLog(s, 'milestone', '高中畢業', byIncome(ctx.income, {
      L: '你完成了中學。在你生長的地方，這已經是很不容易的事。',
      LM: '你拿到了中學畢業證書，家裡擺了一桌飯。',
      UM: '畢業典禮上，你和同學們拋起帽子，然後各自走向不同的方向。',
      H: '畢業典禮結束，你和朋友們坐在校園的階梯上，談著對未來的各種打算。',
    }), applyDelta(s, { happiness: 3, knowledge: 1 }));
    if (chance(s.rng, clamp((s.flags._pTertC ?? 0) * (fxOf(s).tertiary ?? 1), 0, 0.97))) {
      s.flags._tertYears = 4;
      return; // continue into tertiary
    }
    leaveSchool(s, null);
    return;
  }
  // Tertiary years
  if (y < 16) {
    if (chance(s.rng, (incomeRank[inc] >= 2 ? 0.05 : 0.12) * (fxOf(s).dropout ?? 1))) leaveSchool(s, '大學念到一半，你決定先停下來。');
    return;
  }
  if (y === 16) {
    const { mother, father } = s.family;
    const farAway = isAbroad(s) && !ensureHousehold(s).parents; // studying abroad: the parents are not in the audience
    const crowd = farAway && (mother.alive || father.alive) ? `你把學位證書的照片傳回家，螢幕那頭的${mother.alive && father.alive ? '爸媽' : mother.alive ? '母親' : '父親'}比你還激動` : mother.alive && father.alive ? '你看見父母在觀眾席裡拚命揮手' : mother.alive ? '你看見母親在觀眾席裡拚命揮手，也想起沒能看到這一天的父親' : father.alive ? '你看見父親在觀眾席裡拚命揮手，也想起沒能看到這一天的母親' : '你特別想起不在現場的雙親，心裡對他們說了一聲「我畢業了」';
    pushLog(s, 'milestone', '大學畢業', `你拿到學位。畢業典禮上，${crowd}。`, applyDelta(s, { happiness: 4, knowledge: 2 }));
    addHighlight(s, '大學畢業。');
    if (s.flags._tertYears === 4 && incomeRank[inc] >= 2 && chance(s.rng, (incomeRank[inc] === 3 ? 0.32 : 0.2) * (fxOf(s).tertiary ?? 1))) { s.flags._tertYears = 6; return; }
    leaveSchool(s, null);
    return;
  }
  if (y >= 18) {
    pushLog(s, 'milestone', '取得研究所學位', '歷經數年研究與論文，你拿到了碩士學位。', applyDelta(s, { knowledge: 3, happiness: 3 }));
    addHighlight(s, '取得研究所學位。');
    leaveSchool(s, null);
  }
}

/** Focus 'study': a young adult who is not studying sometimes goes back to education (evening school, a degree), see FOCUS_FX.returnEd. */
function returnToSchool(s, ctx) {
  const p = fxOf(s).returnEd;
  if (!p || s.age < 18 || s.age > 30 || s.edu.inSchool || s.edu.years < 6 || s.edu.years >= 16 || s.flags._adultEd) return;
  if ((s.flags._reenrolled || 0) >= 2) return;
  const money = { L: 0.4, LM: 0.6, UM: 0.85, H: 1 }[ctx.country.income];
  const busy = (s.work.status === 'employed' || s.work.status === 'self' ? 0.7 : 1) * (s.children.some((c) => c.alive && s.year - c.birthYear <= 3) ? 0.5 : 1);
  if (chance(s.rng, p * money * busy)) enroll(s, undefined);
}

const LEVEL_YEARS = { primary: 6, secondary: 12, tertiary: 16, graduate: 18 };
const COMPLETION_TITLE = { 6: '補完小學', 12: '取得高中同等學力', 16: '大學畢業', 18: '取得研究所學位' };

/**
 * Put someone who is not in school back into education (night school, second chance, adult degrees).
 * `level` is the level to work towards ('primary' | 'secondary' | 'tertiary' | 'graduate'); by default the
 * next one up. Returns false if they are already studying or already have that level. Adults study about
 * two school years per calendar year below university level and one above. Unless `opts.quiet`, they may
 * drop out again (6 % a year) and the system logs the diploma when the level is reached. With `opts.quiet`
 * the calling event narrates the outcome itself: there is no random dropout (the event ends the
 * enrolment with dropOut()) and no system log entry. Either way the public flag `adult_diploma` (= year)
 * is set on completion and `adult_dropout` (= year) on dropping out; both are cleared when enrolling.
 */
export function enroll(s, level, opts = {}) {
  const e = s.edu;
  if (e.inSchool) return false;
  const target = level ? LEVEL_YEARS[level] : e.years < 12 ? 12 : e.years < 16 ? 16 : 18;
  if (!target || e.years >= target) return false;
  e.inSchool = true;
  s.flags._adultEd = { target, since: s.year, quiet: !!opts.quiet };
  s.flags._reenrolled = (s.flags._reenrolled || 0) + 1;
  delete s.flags.adult_diploma;
  delete s.flags.adult_dropout;
  if (s.work.status === 'child' || s.work.status === 'none') s.work.status = 'student';
  return true;
}

/** Currently studying at tertiary level (university or beyond). */
export function inTertiary(s) {
  return s.edu.inSchool && s.edu.years >= 12;
}

function adultSchooling(s, ctx) {
  const edu = s.edu;
  const { target, quiet } = s.flags._adultEd;
  edu.years = Math.min(target, edu.years + (edu.years >= 12 ? 1 : 2));
  edu.level = levelForYears(edu.years);
  const q = SCHOOL_QUALITY[ctx.country.income];
  s.stats.knowledge = clamp(s.stats.knowledge + (edu.years > 12 ? 4 : 4.5) * q + normal(s.rng, 0, 0.6), 0, 100);
  if (s.flags.drop_school) {
    s.flags.drop_school = false;
    s.flags.adult_dropout = s.year;
    leaveSchool(s, quiet ? null : '生活的重擔讓你不得不再次離開學校。');
    return;
  }
  if (edu.years >= target) {
    s.flags.adult_diploma = s.year;
    if (!quiet) {
      pushLog(s, 'milestone', COMPLETION_TITLE[target] || '完成學業', '你終於拿到了那張遲到多年的證書。收到它的那天，你把它平平整整地收進抽屜，沒有告訴太多人，但自己知道它的分量。', applyDelta(s, { happiness: 4, knowledge: 1 }));
      addHighlight(s, `${COMPLETION_TITLE[target] || '完成學業'}（重返校園）。`);
    }
    leaveSchool(s, null);
    return;
  }
  if (!quiet && chance(s.rng, 0.06)) {
    s.flags.adult_dropout = s.year;
    leaveSchool(s, '工作和家裡的事越來越多，你沒能把課程念完。');
  }
}

/** Leave school (dropout when `why` is a string, graduation when null). */
export function leaveSchool(s, why) {
  s.edu.inSchool = false;
  delete s.flags._adultEd;
  s.edu.level = levelForYears(s.edu.years);
  if (s.work.status === 'student') s.work.status = s.age < 15 ? 'child' : 'none';
  if (why) {
    pushLog(s, 'milestone', '離開學校', why, applyDelta(s, { happiness: -4, knowledge: -1 }));
    if (s.edu.years < 9) addHighlight(s, `只讀了 ${s.edu.years} 年書就離開學校。`);
  }
}

// ---------------------------------------------------------------------------------------------
// Work, income and retirement
// ---------------------------------------------------------------------------------------------

const LFP_FEMALE = { EAS: 0.62, SEA: 0.6, SAS: 0.28, CAS: 0.58, MENA: 0.22, SSA: 0.66, EUR: 0.6, NAM: 0.62, LAC: 0.52, OCE: 0.62 };
const QUIT_FOR_KIDS = { EAS: 0.22, SEA: 0.12, SAS: 0.45, CAS: 0.3, MENA: 0.5, SSA: 0.08, EUR: 0.1, NAM: 0.1, LAC: 0.2, OCE: 0.1 };
const UNEMPLOY = { L: 0.04, LM: 0.06, UM: 0.07, H: 0.05 };
const RETIRE_AGE = { L: 62, LM: 60, UM: 60, H: 65 };

function decideLfp(s, ctx) {
  let p = s.gender === 'M' ? 0.94 : LFP_FEMALE[ctx.country.region];
  if (s.gender === 'F') p += 0.05 * (eduIndex(s) - 1) + (s.urban ? 0.04 : -0.02) - (s.partner?.status === 'married' ? 0.08 : 0);
  return chance(s.rng, clamp(p, 0.05, 0.97));
}

function work(s, ctx) {
  const w = s.work;
  const inc = ctx.country.income;
  if (w.status === 'retired') return;

  // Child labour
  if (!s.edu.inSchool && s.age >= 10 && s.age <= 14 && (w.status === 'child' || w.status === 'none')) {
    const p = { L: 0.45, LM: 0.25, UM: 0.08, H: 0.004 }[inc] * (s.family.wealthQ <= 2 ? 1.4 : s.family.wealthQ >= 4 ? 0.3 : 1);
    if (chance(s.rng, p)) {
      const id = pickJob(s, s.urban ? CHILD_JOBS.filter((j) => j !== 'fisher') : CHILD_JOBS);
      startJob(s, id);
      pushLog(s, 'milestone', '很早就開始工作', `你才${s.age}歲，就開始當${JOBS[id].name}幫忙養家。你比同齡的孩子更早認識了錢的重量。`, applyDelta(s, { happiness: -4, health: -2, knowledge: -1 }));
      addHighlight(s, '很小就開始工作。');
      return;
    }
  }

  // Entering the labour force
  if (!s.edu.inSchool && s.age >= 15 && ['child', 'none', 'student'].includes(w.status)) {
    if (s.flags._lfp === null) s.flags._lfp = decideLfp(s, ctx);
    if (s.flags._lfp) {
      const id = pickJob(s);
      startJob(s, id);
      const wage = JOBS[id].type === 'employed';
      pushLog(s, 'milestone', '第一份工作', `你成為一名${JOBS[id].name}。${byIncome(ctx.income, {
        L: '收入不多，但終於有一份屬於自己的錢。',
        LM: wage ? '薪水不高，但你開始能自己做一些決定。' : '收入不高，但你開始能自己做一些決定。',
        UM: wage ? '你第一次領到薪水，在回家的路上算了好幾遍。' : '你第一次靠自己賺到錢，在回家的路上算了好幾遍。',
        H: wage ? '你第一次領到薪水，很快就學會了房租和帳單的存在。' : '你第一次賺到自己的收入，很快就學會了房租和帳單的存在。',
      })}`, applyDelta(s, { happiness: 3, social: 2, knowledge: 1 }));
    } else {
      w.status = s.gender === 'F' ? 'homemaker' : 'unemployed';
    }
    return;
  }

  if ((w.status === 'employed' || w.status === 'self') && s.age >= 15 && s.flags._lfp === null) {
    // A child labourer reaching working age: decide whether they stay in the labour force.
    s.flags._lfp = decideLfp(s, ctx);
    if (!s.flags._lfp) {
      w.status = s.gender === 'F' ? 'homemaker' : 'unemployed';
      w.job = null;
      return;
    }
  }
  if (w.status === 'employed' || w.status === 'self') {
    w.yearsWorked += 1;
    // Retirement
    const ra = RETIRE_AGE[inc];
    let hz = 0;
    if (s.age >= ra) hz = w.status === 'employed' ? 0.25 : 0.1;
    if (s.age >= ra + 5) hz = w.status === 'employed' ? 0.5 : 0.2;
    if (s.stats.health < 35 && s.age >= 50) hz = Math.max(hz, 0.25);
    if (s.age >= 80) hz = 1;
    if (hz && s.age < 80) hz = Math.min(1, hz * (fxOf(s).retire ?? 1));
    if (hz && chance(s.rng, hz)) {
      retire(s);
      return;
    }
    // Layoffs (salaried workers only)
    if (w.status === 'employed' && chance(s.rng, UNEMPLOY[inc] * (s.stats.health < 40 ? 1.6 : 1) * (fxOf(s).layoff ?? 1))) {
      loseJob(s);
      pushLog(s, 'event', '失去工作', variant(s, 'layoff', [
        '公司裁員，你收到了通知。第一個晚上你睡不著，一遍遍算著存款還能撐多久。',
        '又一次，你的名字出現在名單上。這一次你比上回平靜，只是把紙箱裝得更仔細，因為你知道，下一份工作之前，這些東西得先待在家裡。',
        '訂單少了，位子沒了。你走出大門時沒有回頭，在路邊買了一份熱食，邊吃邊在心裡列出接下來要打的每一通電話。',
        '消息來得很安靜，一封信、一次談話，就結束了。你花了一個週末假裝沒事，到了週一才真的開始難過。',
      ], (n) => `這已經是第 ${n} 次被通知離開了。你沒有再問為什麼，只是安靜地收好東西，走出大門時，順手替下一個人扶住了那扇門。`), applyDelta(s, { happiness: -6, wealth: -4, social: -1 }));
      return;
    }
    // Career moves
    if (chance(s.rng, 0.035 * (fxOf(s).career ?? 1)) && s.age < Math.min(52, ra - 2)) {
      const id = pickJob(s);
      if (id !== w.job && JOBS[id].rank >= JOBS[w.job].rank - 0.05) {
        startJob(s, id);
        pushLog(s, 'event', '換了工作', variant(s, 'jobchange', [`你轉行成為${JOBS[id].name}。`, `你又換了跑道，這次成了${JOBS[id].name}。熟悉的人說你不安分，你只說：想再試一次。`, `你換去做${JOBS[id].name}，一切從頭學起，卻比上一次更清楚自己想要什麼。`], (n) => `第 ${n} 次轉換跑道，這次是${JOBS[id].name}。你已經很熟悉新手的感覺，反而不那麼怕了。`), applyDelta(s, { happiness: 1 }));
      }
    }
    // Women leave work for young children in some regions
    if (s.gender === 'F' && w.status === 'employed' && s.children.some((c) => c.alive && s.year - c.birthYear <= 1) && chance(s.rng, QUIT_FOR_KIDS[ctx.country.region])) {
      w.status = 'homemaker';
      w.job = null;
      pushLog(s, 'event', '暫別職場', variant(s, 'leavework', ['孩子出生後，你選擇（或被期待）留在家裡照顧他。工作的位子很快就被別人補上了。', '第二個孩子出生後，你再一次把工作放下。這一次你知道，回來的路不會比上次好走，但家裡此刻更需要你。']), applyDelta(s, { wealth: -3 }));
    }
    return;
  }
  if (w.status === 'unemployed') {
    if (chance(s.rng, 0.45)) {
      const id = pickJob(s);
      startJob(s, id);
      pushLog(s, 'event', '找到新工作', variant(s, 'newjob', [`經過一段漫長的等待，你成為${JOBS[id].name}。`, `電話終於響了。你成為${JOBS[id].name}，第一天進門時，心裡想的是：這次要把日子過穩。`, `又找了幾個月，你被${JOBS[id].name}的工作接納了。你把消息告訴家人，語氣盡量平靜。`], (n) => `第 ${n} 份工作，${JOBS[id].name}。你已經很會自我介紹了，也學會了不把話說得太滿，只說：「我會做好。」`), applyDelta(s, { happiness: 5, wealth: 2 }));
    } else if (s.age >= RETIRE_AGE[inc] + 3 && chance(s.rng, 0.4)) retire(s);
    return;
  }
  if (w.status === 'homemaker') {
    if (s.gender === 'F' && s.age < 55 && !s.children.some((c) => c.alive && s.year - c.birthYear <= 5) && s.flags._lfp !== false && chance(s.rng, 0.06)) {
      const id = pickJob(s);
      startJob(s, id);
      pushLog(s, 'event', '重返職場', variant(s, 'rework', [`孩子漸漸長大，你重新出去工作，這次是${JOBS[id].name}。`, `孩子又大了一些，你第二次走回職場，這次是${JOBS[id].name}。流程變了不少，但你知道怎麼從頭追上。`]), applyDelta(s, { happiness: 3, wealth: 2, social: 2 }));
    } else if (s.age >= 70) w.status = 'retired';
  }
}

export function retire(s) {
  const ctx = ctxOf(s);
  s.work.status = 'retired';
  const job = s.work.job ? JOBS[s.work.job] : null;
  // farmers, fishers, vendors and shopkeepers do not "hand in" anything: they hand the work on
  const informal = !!job && job.type === 'self' && s.work.job !== 'lawyer' && s.work.job !== 'entrepreneur' && ctx.income !== 'H';
  const pension = byIncome(ctx.income, informal ? {
    L: '沒有退休金，但你已經看不到田地的盡頭，只能靠孩子和積蓄過日子。',
    LM: '沒有正式的退休金，日子靠家人和一點積蓄撐著。',
    UM: '沒有正式的退休金，你靠一點積蓄和家人的照應過日子。',
    H: '',
  } : {
    L: '沒有退休金，但你已經看不到田地的盡頭，只能靠孩子和積蓄過日子。',
    LM: '你的退休金很有限，勉強夠日常開銷，剩下的得靠家人和一點積蓄。',
    UM: '你領到一份不算豐厚的退休金，日子要算著過。',
    H: '你辦好退休手續，領到退休金，終於有時間做那些一直說「以後再說」的事。',
  });
  const lead = informal ? `你慢慢把${job.name}的活交給了年輕人。` : `你結束了${job ? job.name : '工作'}生涯。`;
  pushLog(s, 'milestone', '退休', `${lead}${pension}`, applyDelta(s, { happiness: 1, social: -2 }));
  addHighlight(s, '退休。');
}

/** Income percentile and wealth stat dynamics. */
function wealthDynamics(s, ctx) {
  const w = s.work;
  let p = s.flags._pctl;
  if (w.status === 'employed' || w.status === 'self') {
    const j = JOBS[w.job] || { rank: 0.3 };
    const target = clamp(0.55 * j.rank + 0.25 * s.flags._pctl0 + 0.1 * (eduIndex(s) / 4) + 0.05 + 0.0025 * Math.min(w.yearsWorked, 25), 0.03, 0.98);
    p += 0.12 * (target + (fxOf(s).pctl ?? 0) - p) + normal(s.rng, 0, 0.012);
  } else if (w.status === 'unemployed') p -= 0.03;
  else if (w.status === 'retired') p *= 1 - { H: 0.002, UM: 0.008, LM: 0.015, L: 0.025 }[ctx.country.income];
  else if (s.age < 15) p += 0.1 * (s.flags._pctl0 - p);
  s.flags._pctl = clamp(p, 0.01, 0.995);
  const target = wealthTarget(s, ctx);
  s.stats.wealth = clamp(s.stats.wealth + 0.3 * (target - s.stats.wealth) + normal(s.rng, 0, 1.2), 0, 100);
}

// ---------------------------------------------------------------------------------------------
// Smoking and chronic conditions
// ---------------------------------------------------------------------------------------------

function smoking(s, ctx) {
  if (!s.smoker) {
    if (s.age >= 15 && s.age <= 25) {
      const prev = ctx.view.smoke[s.gender] / 100;
      const everFrac = Math.min(0.9, prev * 1.35);
      const per = 1 - Math.pow(1 - everFrac, 1 / 11);
      if (chance(s.rng, per * (fxOf(s).smokeStart ?? 1))) {
        s.smoker = true;
        pushLog(s, 'event', '第一根菸', variant(s, 'smoke', ['朋友遞來一根菸，你接了過來。那時候你還不知道，戒掉比開始困難得多。', '壓力一大，你又點起了一根菸。你告訴自己只這一次，可是你自己也不太相信。'], (n) => (n % 2 ? '你又點起了一根菸，已經不記得這是第幾次。打火機的聲音熟悉得讓人難過。' : '那根菸是別人遞來的，你猶豫了不到兩秒。有些習慣不是被戒掉，只是在等你。')), applyDelta(s, { social: 1 }));
      }
    }
  } else if (chance(s.rng, (s.age > 40 ? 0.035 : 0.02) * (fxOf(s).smokeQuit ?? 1))) {
    s.smoker = false;
    pushLog(s, 'event', '戒菸成功', variant(s, 'quit', ['你終於把最後一包菸丟進垃圾桶。第一個月難熬得要命，但你撐過來了。', '這次你沒有宣布，也沒有立誓，只是默默把菸放下了。三個月後家人才發現，屋子裡的味道不一樣了。'], (n) => (n % 2 ? '你又一次把菸放下了。這次你不再算天數，只是一天一天地過。' : '醫師說的話你終於聽進去了，把剩下的菸送給了鄰居，然後走去散步。')), applyDelta(s, { health: 3, happiness: 2 }));
  }
}

const CONDITION_TEXT = {
  hypertension: '健康檢查的報告上，血壓那一欄被圈了起來。醫師說這不會馬上怎麼樣，但需要長期留意。',
  diabetes: '血糖數字高得讓醫師皺起眉頭。你得開始學會看食品標示，也得改變一些日常習慣。',
  heart_disease: '胸口一陣悶痛讓你去了醫院。檢查結果顯示你的心臟出了問題，之後的日子需要更小心。',
  copd: '你的咳嗽一直不好，呼吸越來越吃力。診斷書上寫著「慢性阻塞性肺病」。',
  cancer: '診斷書上的那個詞，讓整個診間靜了下來。你需要時間消化，也需要很多勇氣。',
  depression: '有一段時間你什麼都提不起勁，連起床都像在爬山。有人終於告訴你：這是一種病，不是你不夠努力。',
  asthma: '一場劇烈的咳喘之後，你知道自己有氣喘。你的口袋裡從此多了一支吸入器。',
  arthritis: '關節在清晨總是僵硬疼痛。醫師說這是關節炎，需要和它長期相處。',
  dementia: '你開始忘記東西放在哪裡，甚至忘了熟悉的路。家人帶你去檢查，診斷是失智症。',
  disability: '一次意外或疾病之後，你的身體不再像以前一樣。你必須重新學會許多日常的事。',
  hiv: '檢驗報告出來那天，你一個人在診所外坐了很久。這個病不再是死刑，但它改變了很多事。',
  alcohol: '你發現自己幾乎每天都需要喝一點才睡得著。身邊的人開始擔心，只有你還說「沒事」。',
};

/** Second and later diagnoses of a condition that can come back. */
const CONDITION_AGAIN = {
  depression: '那片灰色的霧又回來了。這一次你比較快認出它，也比較快知道該找誰說：「我又不太對勁了。」',
  cancer: '複查的結果讓房間再一次安靜下來。這次你沒有那麼慌，只是握緊了陪你來的人的手，一項一項問清楚。',
  alcohol: '你又回到了那個每晚都要喝一杯才睡得著的老路。這一次你比誰都清楚它通向哪裡。',
};

export function addCondition(s, id, silent = false) {
  if (!CONDITIONS[id] || s.conditions.includes(id)) return false;
  s.conditions.push(id);
  if (!silent) {
    const c = CONDITIONS[id];
    const again = CONDITION_AGAIN[id];
    const text = (again && variant(s, `dx:${id}`, [CONDITION_TEXT[id], again], (n) => `第 ${n} 次聽到「${c.label}」這個詞。你已經不再害怕這個名字，因為你知道，上一次你也走過來了。`)) || CONDITION_TEXT[id] || `你被診斷出${c.label}。`;
    pushLog(s, 'event', `確診：${c.label}`, text, applyDelta(s, { health: Math.round(c.health / 2), happiness: Math.round(c.happiness / 2) }));
  }
  return true;
}

export function removeCondition(s, id) {
  const i = s.conditions.indexOf(id);
  if (i < 0) return false;
  s.conditions.splice(i, 1);
  return true;
}

function conditions(s, ctx) {
  const age = s.age;
  const frailty = clamp(1 + (55 - s.stats.health) / 55, 0.4, 2.2);
  for (const id in CONDITIONS) {
    const c = CONDITIONS[id];
    if (s.conditions.includes(id)) {
      // Remission / recovery
      if (c.curable && chance(s.rng, id === 'depression' ? 0.15 : 0.06)) {
        removeCondition(s, id);
        pushLog(s, 'event', `${c.label}好轉`, variant(s, `rec:${id}`, id === 'depression' ? ['某個早晨你醒來，發現世界的顏色回來了一點。', '這一次好轉得更安靜：你發現自己又開始注意到晚風，和路邊的貓。'] : ['你花了很大的力氣，終於走出了這個階段。', '你再一次走了出來。比上次多的，是你知道自己做得到。'], (n) => `第 ${n} 次，你又等到了雲散開的那一天。這回你什麼也沒說，只是站在窗前，讓陽光多曬了一會兒。`), applyDelta(s, { happiness: 5, health: 3 }));
      } else if (id === 'cancer') {
        const since = age - (s.flags._cancerAge ?? age);
        if (since >= 2 && chance(s.rng, 0.17 * (ctx.country.income === 'H' ? 1.3 : ctx.country.income === 'L' ? 0.5 : 0.9))) {
          removeCondition(s, 'cancer');
          pushLog(s, 'event', '癌症緩解', variant(s, 'remit', ['複查報告上沒有發現異常。醫師說「目前沒有看到癌細胞」，那一刻你才發現自己一直憋著氣。', '第二次聽到「目前沒有看到」這句話，你反而比較冷靜，只是走出診間後，在樓梯間坐了很久。'], (n) => `第 ${n} 次的複查報告，仍然是乾淨的。你學會了把這句話收好，像收一張不必再看、卻永遠捨不得丟的車票。`), applyDelta(s, { happiness: 8, health: 6 }));
        }
      }
      continue;
    }
    let h = 0;
    for (const [a, b, p] of c.onset) if (age >= a && age <= b) { h = p; break; }
    if (!h) continue;
    h *= frailty * (fxOf(s).condition ?? 1);
    if (c.smokerOnly) h *= s.smoker ? 3 : 0.1;
    if (s.smoker && (id === 'cancer' || id === 'heart_disease')) h *= 1.8;
    if (id === 'diabetes' || id === 'hypertension') h *= 1 + (ctx.country.income === 'H' || ctx.country.income === 'UM' ? 0.2 : 0);
    if (id === 'alcohol') h *= (s.gender === 'M' ? 1.8 : 0.5) * (s.religion === 'muslim' ? 0.2 : 1) * (fxOf(s).condition ?? 1);
    if (id === 'depression') h *= s.gender === 'F' ? 1.4 : 0.9;
    if (h && chance(s.rng, Math.min(h, 0.4))) {
      addCondition(s, id);
      if (id === 'cancer') s.flags._cancerAge = age;
    }
  }
  // HIV (region specific, adult only)
  if (age >= 16 && age <= 55 && s.year >= 1983 && !s.conditions.includes('hiv')) {
    const high = HIV_HIGH.has(ctx.country.code);
    const base = ctx.country.region === 'SSA' ? (high ? 0.0035 : 0.0008) : 0.00008;
    if (chance(s.rng, base * (s.year > 2030 ? 0.4 : 1))) addCondition(s, 'hiv');
  }
}

// ---------------------------------------------------------------------------------------------
// Love, marriage, children
// ---------------------------------------------------------------------------------------------

/**
 * Culture group of a new partner. Mostly the person's own group; migrants often partner with someone
 * from the host country, and in multi-group countries (Nigeria, India, Switzerland ...) a minority
 * of couples cross group lines.
 */
function partnerGroup(s) {
  const own = s.flags._pool || 'en_us';
  const home = s.countryCode === s.homeCountryCode;
  const crossP = home ? 0.08 : 0.5;
  if (!chance(s.rng, crossP)) return own;
  return drawGroup(s.countryCode, () => rand(s.rng), BY_CODE[s.countryCode]?.region);
}

/**
 * Create a partner record (not yet attached). `opts`: { gender?, age?, name? }. The name comes from the
 * culture-appropriate pool; the name tokens are remembered (flags) so that children get the right
 * family name.
 */
function makePartner(s, ctx, status, opts = {}) {
  const era = s.settings.era;
  const sameSexP = era === 'past' ? 0.012 : era === 'future' ? 0.05 : 0.035;
  const gender = opts.gender || (chance(s.rng, sameSexP) ? s.gender : s.gender === 'F' ? 'M' : 'F');
  const gap = SPOUSE_AGE_GAP[ctx.country.region];
  let age;
  if (opts.age !== undefined) age = Math.round(opts.age);
  else {
    if (gender === s.gender) age = Math.round(s.age + normal(s.rng, 0, 3));
    else if (s.gender === 'F') age = Math.round(s.age + normal(s.rng, gap + (s.age < 18 ? 4 : 0), 2.5));
    else age = Math.round(s.age - normal(s.rng, gap, 2.2));
    age = Math.max(s.age < 18 && gender !== s.gender ? 17 : 16, age);
  }
  const group = partnerGroup(s);
  let nm = randomName(s.rng, group, gender);
  // nobody in the family shares a full name with the partner (a child born before the partner arrived may already have drawn it): draws again only on a clash
  for (let tries = 0; tries < 6 && !opts.name && [s.name.full, s.family.mother.name, s.family.father.name, ...s.children.map((c) => c.name)].includes(nm.full); tries++) nm = randomName(s.rng, group, gender);
  s.flags._partnerFt = nm.familyToken;
  s.flags._partnerGt = nm.givenToken;
  s.flags._partnerPool = group;
  return { name: opts.name || nm.full, gender, age, status, since: s.year };
}

/**
 * Give the person a new partner (dating or married) with a culture-appropriate name and an age near
 * their own. If they already have an active partner nothing changes and that partner is returned
 * (unless `opts.replace`).
 */
export function newPartner(s, opts = {}) {
  const ctx = ctxOf(s);
  if (!opts.replace && s.partner && (s.partner.status === 'dating' || s.partner.status === 'married')) return s.partner;
  const status = opts.status === 'married' ? 'married' : 'dating';
  s.partner = makePartner(s, ctx, 'dating', opts);
  syncPartner(s);
  s.flags._coolUntil = 0;
  const hh = ensureHousehold(s);
  hh.partner = false; // a new person: nobody has moved in yet
  if (hh.sep) hh.sep.partner = false;
  if (status === 'married') marry(s);
  return s.partner;
}

/**
 * End a dating relationship (a marriage is ended with divorce()). Resets the private plan flags and
 * imposes a cooldown (default 2-4 years) so that the yearly systems do not start a new relationship
 * right away. Returns true if there was a relationship to end.
 */
export function endRelationship(s, years) {
  const pt = s.partner;
  if (!pt || (pt.status !== 'dating' && pt.status !== 'married')) return false;
  if (pt.status === 'married') return divorce(s);
  const f = s.flags;
  const cool = years ?? randInt(s.rng, 2, 4);
  s.partner = null;
  syncPartner(s);
  const hh = ensureHousehold(s);
  hh.partner = false;
  if (hh.sep) hh.sep.partner = false;
  f._coolUntil = s.age + cool;
  if (f._marryAt < 999) {
    // Still hoping to marry: the next relationship comes after the cooldown, and the wedding later still.
    f._dateAt = Math.max(f._dateAt ?? 0, f._coolUntil);
    f._marryAt = Math.max(f._marryAt, f._dateAt + randInt(s.rng, 1, 3));
  }
  return true;
}

export function setPartner(s, p) {
  s.partner = p;
  syncPartner(s);
  const hh = ensureHousehold(s);
  hh.partner = !!p && p.status === 'married';
  if (hh.sep) hh.sep.partner = false;
  refreshAlone(s, hh);
}

export function marry(s) {
  const ctx = ctxOf(s);
  if (!s.partner || s.partner.status === 'divorced' || s.partner.status === 'widowed') {
    s.partner = makePartner(s, ctx, 'married');
  }
  s.partner.status = 'married';
  s.partner.since = s.year;
  syncPartner(s); // the roster: married this year, the partner's parents are created
  s.flags._married = (s.flags._married || 0) + 1;
  remember(s, `love:wed${s.flags._married}`, `你和${s.partner.name}結了婚`, { tag: 'love', w: 3 });
  householdOnMarry(s);
  // the wedding rite of the family's tradition is told in the same year (regional_culture_wedding_rite, once per life)
  if (s.seen.regional_culture_wedding_rite === undefined && !s.pending.some((p) => p.id === 'regional_culture_wedding_rite')) s.pending.push({ id: 'regional_culture_wedding_rite', atAge: s.age });
  if (s.work.status === 'student' && s.edu.inSchool && s.age < 18 && ctx.view.childMarriage > 10) leaveSchool(s, null);
}

export function divorce(s) {
  if (!s.partner || s.partner.status !== 'married') return false;
  s.partner.status = 'divorced';
  syncPartner(s);
  s.flags._divorces = (s.flags._divorces || 0) + 1;
  remember(s, `love:div${s.flags._divorces}`, `你和${s.partner.name}的婚姻走到了盡頭`, { tag: 'love', w: 3 });
  householdOnPartnerGone(s, 'divorce');
  // who the children live with is told by family_custody (the default of householdOnPartnerGone stands if it never comes up)
  if (s.children.some((c) => c.alive && kidYears(s, c) <= 15) && s.seen.family_custody === undefined && !s.pending.some((p) => p.id === 'family_custody')) s.pending.push({ id: 'family_custody', atAge: s.age });
  planRemarriage(s, 0.45);
  return true;
}

/** After a break-up, divorce or widowhood: maybe schedule a new relationship. */
function planRemarriage(s, p) {
  if (chance(s.rng, p) && s.age < 70) {
    s.flags._marryAt = Math.round(s.age + between(s.rng, 3, 9));
    s.flags._dateAt = Math.max(s.age + 1, s.flags._marryAt - randInt(s.rng, 1, 3));
  } else {
    s.flags._marryAt = 999;
    s.flags._dateAt = 999;
  }
}

function childBirthText(s, c, first) {
  const order = ['L', 'LM', 'UM', 'H'];
  let gi = order.indexOf(ctxOf(s).income);
  if (s.stats.wealth >= 70 && gi < 3) gi++;
  else if (s.stats.wealth <= 20 && gi > 0) gi--;
  if (s.urban && gi === 0) gi = 1; // a city has a clinic or a hospital, not just a midwife in a dark room
  const inc = order[gi];
  const parent = first ? '你成為了父母' : '家裡又添了一個孩子';
  const hh = ensureHousehold(s);
  const idx = s.children.indexOf(c);
  let where = byIncome(inc, {
    L: '產婆在昏暗的屋子裡接生，所幸一切平安。',
    LM: s.urban ? '在擠滿了人的公立醫院裡，孩子哭出了第一聲。' : '在村裡的衛生所，孩子哭出了第一聲。',
    UM: '在醫院的產房外，家人焦急地等待。',
    H: '在明亮的產房裡，護理師把包得緊緊的小小身體遞給你。',
  });
  if (hh.kids[idx] === 'with_partner') where = `你人在${BY_CODE[s.countryCode].name}，第一聲哭聲是從電話那頭傳來的，你把話筒貼在耳朵上，聽了很久。`; // the father is away
  else if (isAbroad(s) && !hh.partner && !hh.parents) where = `你在${BY_CODE[s.countryCode].name}的醫院裡，身邊沒有熟悉的家人，護理師握了握你的手，孩子哭出了第一聲。`; // born abroad, nobody of the family there
  // the first child is the news for the grandparents; for parents who have died it is a quiet word to them
  let news = '';
  if (first) {
    const pp = parentsPresent(s);
    if (pp === 'none') news = '你想起過世的爸媽，在心裡對他們說：「你們的家，又多了一個人。」';
    else if (pp !== 'both') news = `你第一個打電話告訴${pp === 'mother' ? '母親' : '父親'}，電話那頭停了一下，接著傳來${pp === 'mother' ? '她' : '他'}壓不住的笑聲。`;
  }
  return `${parent}。${c.name}出生了。${where}${news}`;
}

/** Add a child to the family. Returns the child record. */
export function addChild(s, opts = {}) {
  const ctx = ctxOf(s);
  const view = ctx.view;
  const gender = opts.gender || (chance(s.rng, view.srb / (100 + view.srb)) ? 'M' : 'F');
  // Children get names from the family's culture (the person's group, wherever they live now), taking the
  // family-name token from the father: the person himself, or the (same-culture) partner. Patronymic
  // cultures (Amharic, Malay ...) use the father's given name instead of a surname.
  const pool = s.flags._pool || 'en_us';
  const pt = s.partner;
  let father;
  if (s.gender === 'M') father = { givenToken: s.flags._gt, familyToken: s.flags._ft };
  else if (pt && pt.gender === 'M' && s.flags._partnerPool === pool && s.flags._partnerGt) father = { givenToken: s.flags._partnerGt, familyToken: s.flags._partnerFt };
  else father = getPool(pool).mode === 'patro' ? {} : { familyToken: s.flags._ft };
  const famToken = childFamilyToken(pool, father);
  let nm = randomName(s.rng, pool, gender, famToken);
  // nobody in the household shares a full name: not with the siblings, and not with the person, the partner or the parents
  const taken = () => new Set([...s.children.map((c) => c.name), s.name.full, s.partner && s.partner.name, s.family.mother.name, s.family.father.name]);
  for (let tries = 0; tries < 12 && taken().has(nm.full); tries++) nm = randomName(s.rng, pool, gender, famToken);
  const child = { name: nm.full, gender, birthYear: s.year, alive: true, religion: s.religion }; // children grow up in the family's tradition
  s.children.push(child);
  remember(s, `kid:${s.children.length}`, `${child.name}出生了`, { tag: 'family', w: 3 });
  ensureHousehold(s); // the baby lives with the person, or with the partner when the couple live apart
  s.flags._birthThisYear = true;
  return child;
}

const FERT_CURVE = [[16, 0.22], [20, 0.38], [24, 0.4], [30, 0.34], [34, 0.25], [38, 0.12], [42, 0.04], [45, 0]];

function ageFertility(age) {
  if (age < 15 || age >= 45) return 0;
  for (let i = 1; i < FERT_CURVE.length; i++) {
    const [a1, v1] = FERT_CURVE[i];
    const [a0, v0] = FERT_CURVE[i - 1];
    if (age <= a1) return v0 + ((v1 - v0) * (age - a0)) / (a1 - a0);
  }
  return 0;
}

function fertility(s, ctx) {
  const pt = s.partner;
  const female = s.gender === 'F';
  let motherAge, couple = false, married = false;
  if (pt && (pt.status === 'married' || pt.status === 'dating') && pt.gender !== s.gender) {
    couple = true;
    married = pt.status === 'married';
    motherAge = female ? s.age : pt.age;
  } else if (female) motherAge = s.age;
  else return;

  if (!couple && female) {
    // Births outside a stable partnership (only up to the number of children she planned)
    const wanted = s.flags._want ?? 0;
    if (s.children.length < wanted && s.age >= 17 && s.age <= 38 && chance(s.rng, { L: 0.12, LM: 0.09, UM: 0.07, H: 0.06 }[ctx.country.income] * (ctx.country.region === 'MENA' || ctx.country.region === 'SAS' ? 0.1 : 1))) {
      birth(s, ctx, true);
    }
    return;
  }
  let p = ageFertility(motherAge);
  if (!p) return;
  const alive = aliveKids(s);
  const total = s.children.length;
  const want = s.flags._want;
  if (total >= want) p *= 0.004; // unplanned births are rare
  else {
    p *= Math.min(1.8, 1 + 0.1 * (want - total));
    if (total === 0) p *= married ? 1.3 : 0.7;
  }
  if (!married) p *= ctx.country.region === 'MENA' || ctx.country.region === 'SAS' ? 0.1 : ctx.country.region === 'SSA' ? 0.9 : 0.7;
  if (female && s.edu.inSchool && !s.flags._adultEd) p *= 0.3;
  if (alive === 0 && total > 0 && total < want) p *= 1.2;
  if (couple && married && !ensureHousehold(s).partner) p *= 0.4; // a married couple who live in different places see each other a few weeks a year
  p *= fxOf(s).fertility ?? 1;
  if (chance(s.rng, p)) birth(s, ctx, false);
}

function birth(s, ctx, solo) {
  const child = addChild(s);
  const first = s.children.length === 1;
  const mother = s.gender === 'F';
  const delta = applyDelta(s, { happiness: first ? 8 : 5, wealth: -2, social: 1, health: mother ? -2 : 0 });
  pushLog(s, first ? 'milestone' : 'event', first ? '第一個孩子' : '新生命', childBirthText(s, child, first), delta);
  if (first) addHighlight(s, `第一個孩子${child.name}出生。`);
  if (mother && s.edu.inSchool && s.age < 20) leaveSchool(s, '懷孕與照顧新生兒，讓你不得不離開學校。');
}

function love(s, ctx) {
  const f = s.flags;
  const pt = s.partner;
  const age = s.age;

  // Postpone marriage while still studying for a degree
  if (s.edu.inSchool && !f._adultEd && s.edu.years >= 12 && f._marryAt < 999 && age >= f._marryAt - 1) {
    f._marryAt = age + 1 + randInt(s.rng, 0, 2);
    f._dateAt = Math.min(f._dateAt, f._marryAt - 1);
  }

  const active = pt && (pt.status === 'dating' || pt.status === 'married');
  const fx = fxOf(s);
  // the focus moves the plan by up to a year: family earlier, study and work later (not for child marriages, which are not chosen)
  const ea = age + (f._marryAt >= 18 ? fx.dateShift ?? 0 : 0);
  if (!active) {
    if (age < (f._coolUntil ?? 0)) return; // cooling off after a break-up (see endRelationship)
    if (ea >= f._dateAt && age < 75 && f._marryAt < 999) {
      const status = ea >= f._marryAt ? 'married' : 'dating';
      s.partner = makePartner(s, ctx, 'dating');
      syncPartner(s);
      if (status === 'married') doMarriage(s, ctx);
      else pushLog(s, 'milestone', '心動', loveText(s, ctx), applyDelta(s, { happiness: 6, social: 3 }));
    } else if (f._marryAt >= 999 && age >= 21 && age <= 45 && !s.flags._noDating && chance(s.rng, 0.04 * (fx.informal ?? 1))) {
      s.partner = makePartner(s, ctx, 'dating');
      syncPartner(s);
      pushLog(s, 'milestone', '一段感情', '你遇見了一個讓你想花時間相處的人，雖然誰都沒有提到婚姻這個詞。', applyDelta(s, { happiness: 6, social: 3 }));
    }
    return;
  }
  if (pt.status === 'dating') {
    if (f._marryAt < 999 && ea >= f._marryAt) {
      doMarriage(s, ctx);
    } else if (chance(s.rng, (f._marryAt < 999 ? 0.07 : 0.14) * (fx.breakup ?? 1))) {
      pushLog(s, 'event', '分手', `你和${pt.name}走到了盡頭。沒有誰對誰錯，只是兩個人看的方向不同了。`, applyDelta(s, { happiness: -7, social: -2 }));
      s.partner = null;
      syncPartner(s);
      if (f._marryAt < 999) { f._dateAt = age + randInt(s.rng, 1, 3); f._marryAt = Math.max(f._marryAt, f._dateAt + randInt(s.rng, 1, 3)); }
    }
    return;
  }
  // Married: divorce hazard
  const hz = { EAS: 0.009, SEA: 0.008, SAS: 0.003, CAS: 0.008, MENA: 0.006, SSA: 0.008, EUR: 0.012, NAM: 0.014, LAC: 0.009, OCE: 0.012 }[ctx.country.region];
  const mult = (pt.since > s.year - 6 && s.age < 22 ? 1.8 : 1) * (s.stats.happiness < 35 ? 1.4 : 1) * (ensureHousehold(s).partner ? 1 : 1.35); // years apart wear a marriage down
  if (chance(s.rng, hz * mult * (fx.divorce ?? 1))) {
    const name = pt.name;
    divorce(s);
    pushLog(s, 'milestone', '離婚', `你和${name}結束了婚姻。簽字那天比想像中平靜，真正難的是之後一個人把日子過下去。`, applyDelta(s, { happiness: -9, social: -4, wealth: -3 }));
    addHighlight(s, '離婚。');
  }
}

function loveText(s, ctx) {
  const pt = s.partner;
  return byIncome(ctx.income, {
    L: `你認識了${pt.name}。你們常常在田埂邊、水井旁或市集的角落說上幾句話。`,
    LM: `你和${pt.name}開始走得很近。朋友們都看出來了，只有你們還裝作若無其事。`,
    UM: `你和${pt.name}開始約會。你們常在${s.work.status === 'employed' ? '下班' : s.edu.inSchool ? (s.age < 20 ? '放學' : '下課') : '收工'}後去街邊吃宵夜，聊到店家要打烊。`,
    H: `你和${pt.name}開始交往。第一次約會你緊張得換了三次衣服。`,
  });
}

function doMarriage(s, ctx) {
  const child = s.age < 18;
  marry(s);
  const pt = s.partner;
  if (child) {
    pushLog(s, 'milestone', '很年輕就結婚', `你才${s.age}歲，${parentsPresent(s) === 'none' ? '親戚' : '家人'}就替你決定了婚事。${s.gender === 'F' ? `你嫁給了比你大不少的${pt.name}` : `你和${pt.name}成了家`}，婚後的日子，你得很快學會長大。`, applyDelta(s, { happiness: -6, health: -2, social: -2, knowledge: -1 }));
    addHighlight(s, '很年輕就結婚。');
  } else {
    const gone = parentsPresent(s) === 'none';
    const wine = drinksAlcohol(s) ? '酒' : '茶';
    const absent = weddingAbsence(s);
    pushLog(s, 'milestone', '結婚', byIncome(ctx.income, {
      L: `你和${pt.name}結了婚。沒有華麗的場面，鄰居都來幫忙，晚上大家一起吃了一頓飯。`,
      LM: `你和${pt.name}結婚了。親戚們從各地趕來，場地很簡單，但每個人都笑得很大聲。`,
      UM: gone || weddingFolk(s) === '親友們'
        ? `你和${pt.name}的婚禮上，${gone ? `${pt.name}那邊的親友` : '朋友和同事們'}擠了一整桌，大家彼此敬了很多杯${wine}。`
        : `你和${pt.name}的婚禮上，兩家人擠在同一桌，彼此敬了很多杯${wine}。`,
      H: `你和${pt.name}結婚了。婚禮之後，你們收拾好滿屋子的禮物，開始學習怎麼一起過日子。`,
    }) + absent, applyDelta(s, { happiness: 8, social: 4, wealth: -2 }));
    addHighlight(s, `與${pt.name}結婚。`);
  }
}

// ---------------------------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------------------------

/** Move between countryside and city within the current country. */
export function setUrban(s, urban) {
  s.urban = !!urban;
}

/** Set the place of residence: `name` if given (any string), else a random city of the current country. */
export function setCity(s, name) {
  const cities = BY_CODE[s.countryCode].cities;
  s.city = name || (cities && cities.length ? cities[Math.floor(rand(s.rng) * cities.length)] : s.city);
}

/**
 * Move to another country. `opts.with` says who comes along ('alone' | 'partner' | 'family' | 'refugee' | 'keep', see depart(); moving to
 * the home country is a return and brings the family back together); without it the engine decides from the circumstances.
 */
export function migrate(s, code, opts = {}) {
  if (!BY_CODE[code] || code === s.countryCode) return false;
  const from = s.countryCode;
  ensureHousehold(s); // the household as it was before the move
  s.countryCode = code;
  // Migrants live in a city of the new country (mostly urban).
  setCity(s);
  s.urban = chance(s.rng, 0.85);
  s.flags._countries = s.flags._countries || [s.homeCountryCode];
  if (!s.flags._countries.includes(code)) s.flags._countries.push(code);
  s.flags.migrated = true;
  s.flags._movedAt = s.year;
  s.flags._moves = (s.flags._moves || 0) + 1;
  remember(s, `move:${s.flags._moves}`, code === s.homeCountryCode ? `你回到了${BY_CODE[code].name}` : `你離開${BY_CODE[from].name}，到${BY_CODE[code].name}生活`, { tag: 'move', w: 3 });
  // Where you live changes how much lives in each part of the wealth model.
  const ctx = ctxOf(s);
  s.stats.wealth = clamp(s.stats.wealth + 0.5 * (wealthTarget(s, ctx) - s.stats.wealth), 0, 100);
  householdOnMigrate(s, from, code, opts);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Stats drift
// ---------------------------------------------------------------------------------------------

function statsDrift(s, ctx) {
  const st = s.stats;
  const fx = fxOf(s);
  const le = ctx.birthView.le[s.gender];
  // Health
  let hTarget = s.age < 15 ? 90 + (s.family.wealthQ - 3) * 1.5 : expectedHealth(s.age, le);
  for (const id of s.conditions) hTarget += CONDITIONS[id]?.health ?? 0;
  if (s.smoker && s.age > 25) hTarget -= 3 + Math.min(8, (s.age - 25) * 0.15);
  hTarget += st.wealth < 50 ? (st.wealth - 50) * 0.12 : (st.wealth - 50) * 0.04;
  hTarget += (st.social - 50) * 0.04;
  if (s.age < 6 && s.family.wealthQ <= 2 && ctx.country.income !== 'H') hTarget -= 3;
  hTarget += fx.healthT ?? 0;
  st.health = clamp(st.health + 0.35 * (hTarget - st.health) + normal(s.rng, 0, 2.2), 1, 100);

  // Happiness
  let ha = 50 + 0.15 * (st.wealth - 50) + 0.15 * (st.health - 60) + 0.15 * (st.social - 50);
  const pt = s.partner;
  if (pt?.status === 'married') ha += 5; else if (pt?.status === 'dating') ha += 3; else if (pt?.status === 'widowed') ha -= 3;
  ha += Math.min(3, aliveKids(s)) * 1.5;
  if (s.work.status === 'employed' || s.work.status === 'self') ha += 3; else if (s.work.status === 'unemployed') ha -= 7;
  if (s.age < 12) ha += 8;
  ha += s.age >= 65 ? 3 : s.age >= 40 && s.age <= 55 ? -3 : 0;
  for (const id of s.conditions) ha += (CONDITIONS[id]?.happiness ?? 0) * 0.6;
  st.happiness = clamp(st.happiness + 0.25 * (ha - st.happiness) + normal(s.rng, 0, 3), 1, 100);

  // Social
  let so = 45 + (pt?.status === 'married' ? 12 : pt?.status === 'dating' ? 8 : 0) + 2 * Math.min(3, aliveKids(s));
  so += s.work.status === 'employed' ? 4 : 0;
  so += s.edu.inSchool ? 6 : 0;
  so += 0.1 * (st.happiness - 50);
  if (s.age > 70) so -= (s.age - 70) * 0.6;
  if (s.age < 6) so = 60;
  st.social = clamp(st.social + 0.2 * (so - st.social) + normal(s.rng, 0, 2.5), 1, 100);

  // Knowledge (school gains are added in schooling())
  if (!s.edu.inSchool) {
    if (s.age < 6) st.knowledge = clamp(Math.max(st.knowledge, 2 + s.age * 1.3), 0, 100);
    else if (s.age < 60) st.knowledge = clamp(st.knowledge + 0.3 + 0.1 * eduIndex(s), 0, 100);
    else if (s.age > 75) st.knowledge = clamp(st.knowledge - 0.4, 0, 100);
  }

  // Life focus: a small yearly nudge on top of the drift (the stats mean-revert, so it settles at a few points).
  if (fx.drift) for (const k in fx.drift) st[k] = clamp(st[k] + fx.drift[k], k === 'health' ? 1 : 0, 100);
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

/** Run all yearly systems (age and year have already been incremented). */
export function runSystems(s) {
  const ctx = ctxOf(s);
  s.flags._birthThisYear = false;
  ensureHousehold(s);
  agePeople(s, ctx);
  schooling(s, ctx);
  smoking(s, ctx);
  conditions(s, ctx);
  work(s, ctx);
  love(s, ctx);
  fertility(s, ctx);
  householdYear(s, ctx);
  kinYear(s, ensureHousehold(s)); // the family roster (kin.js): siblings born and lost, the partner's parents, one merged line for the year's deaths
  wealthDynamics(s, ctx);
  statsDrift(s, ctx);
}
