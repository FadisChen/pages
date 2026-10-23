// Public engine API: create a life, advance it year by year, resolve choices, serialise.
//
//   createLife(settings, seed, opts?) -> state
//   advanceYear(state, { auto? })     -> { entries, pendingChoice, died }
//   choose(state, optionIndex)        -> { entries, pendingChoice: null, died }
//   autoChoose(state)                 -> same as choose, picking by each choice's `ai` weight
//   serialize(state) / deserialize(text)
//   getPendingChoice(state), getStatus(state)
//
// One tick (advanceYear) resolves: survival of the year just lived -> age/year increment ->
// yearly systems -> events. Death therefore records the age at the *start* of the fatal year
// ("享年 N 歲" = N completed years). See README.md.

import { BY_CODE } from '../data/countries.js';
import { createRngState } from './rng.js';
import { drawBirth } from './birth.js';
import { dies, drawCause } from './mortality.js';
import { initSystems, runSystems, ctxOf, pushLog, STAT_KEYS, JOBS } from './systems.js';
import { runEvents, resolveChoice, autoPickIndex, getPendingChoice } from './events.js';
import { makeHelpers, recordDeath } from './helpers.js';

export { getPendingChoice };

export const STATE_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  era: 'present',       // 'past' | 'present' | 'future' | 'random'
  drawMode: 'births',   // 'births' (by newborns) | 'population'
  pace: 'standard',     // 'short' | 'standard' | 'long' (UI timing hint)
  autoChoice: false,    // UI hint: let the game choose after a countdown
});

/** Life-stage label (zh-Hant) for an age. */
export function lifeStage(age) {
  if (age < 1) return '嬰兒';
  if (age < 4) return '幼兒';
  if (age < 13) return '兒童';
  if (age < 20) return '青少年';
  if (age < 30) return '青年';
  if (age < 45) return '壯年';
  if (age < 65) return '中年';
  if (age < 80) return '長者';
  return '高齡';
}

function snapshotRow(s) {
  const r = { age: s.age };
  for (const k of STAT_KEYS) r[k] = Math.round(s.stats[k]);
  return r;
}

/**
 * Create a new life.
 * @param {object} settings  see DEFAULT_SETTINGS (optional extra: `birthYear` forces the present year)
 * @param {number|string} seed  any value; same seed + settings => identical life
 * @param {object} [opts]  force parts of the draw: { countryCode, gender, urban, wealthQ, birthYear }
 */
export function createLife(settings = {}, seed = Date.now(), opts = {}) {
  const requested = { ...DEFAULT_SETTINGS, ...settings };
  const rng = createRngState(seed);
  const b = drawBirth(rng, requested, opts);
  const s = {
    v: STATE_VERSION,
    seed,
    rng,
    settings: { era: b.eraKey, drawMode: requested.drawMode, pace: requested.pace, autoChoice: !!requested.autoChoice, eraSetting: requested.era },
    birthYear: b.birthYear,
    year: b.birthYear,
    age: 0,
    countryCode: b.country.code,
    homeCountryCode: b.country.code,
    urban: b.urban,
    city: b.city,
    gender: b.gender,
    name: { given: b.name.given, family: b.name.family, full: b.name.full },
    family: { wealthQ: b.wealthQ, siblings: b.siblings, mother: b.parents.mother, father: b.parents.father },
    stats: { health: 90, happiness: 60, knowledge: 2, wealth: 50, social: 55 },
    edu: { level: 'none', inSchool: false, years: 0 },
    work: { status: 'child', job: null, yearsWorked: 0 },
    partner: null,
    children: [],
    conditions: [],
    smoker: false,
    riskMult: 1,
    flags: { _pool: b.poolKey, _ft: b.name.familyToken },
    seen: {},
    pending: [],
    log: [],
    statHistory: [],
    highlights: [],
    alive: true,
    death: null,
  };
  initSystems(s);
  pushLog(s, 'milestone', '誕生', `${s.year} 年，${s.name.full}出生在${b.country.name}${s.urban ? s.city : s.city + '附近的鄉下'}。`);
  s.statHistory.push(snapshotRow(s));
  return s;
}

function finishYear(s) {
  s.statHistory.push(snapshotRow(s));
}

/**
 * Advance one year. If a choice is pending it is returned unchanged (resolve it first).
 * With `{ auto: true }` pending choices are resolved automatically (used by simulations).
 * @returns {{ entries: object[], pendingChoice: object|null, died: boolean }}
 */
export function advanceYear(s, { auto = false } = {}) {
  if (!s.alive) return { entries: [], pendingChoice: null, died: true };
  if (s.flags._choice) return { entries: [], pendingChoice: s.flags._choice, died: false };

  const start = s.log.length;
  const ctx = ctxOf(s);

  // 1. Survive the year of life we are in?
  if (dies(s, ctx.home, ctx.birthView)) {
    const cause = drawCause(s, ctx.home, ctx.birthView, s.settings.era);
    recordDeath(s, cause);
    s.statHistory.push(snapshotRow(s));
    return { entries: s.log.slice(start), pendingChoice: null, died: true };
  }

  // 2. Age up, then yearly systems and events
  s.age += 1;
  s.year += 1;
  runSystems(s);
  const h = makeHelpers(s);
  runEvents(s, h);
  finishYear(s);

  if (!s.alive) return { entries: s.log.slice(start), pendingChoice: null, died: true };
  if (auto) {
    let guard = 0;
    while (s.flags._choice && s.alive && guard++ < 3) {
      resolveChoice(s, h, autoPickIndex(s, h));
      s.statHistory[s.statHistory.length - 1] = snapshotRow(s);
    }
  }
  return { entries: s.log.slice(start), pendingChoice: s.flags._choice || null, died: !s.alive };
}

/** Resolve the pending choice with the given option index (index into `pendingChoice.options`). */
export function choose(s, optionIndex) {
  if (!s.flags._choice) throw new Error('No choice is pending');
  const start = s.log.length;
  const h = makeHelpers(s);
  resolveChoice(s, h, optionIndex);
  if (s.statHistory.length) s.statHistory[s.statHistory.length - 1] = snapshotRow(s);
  return { entries: s.log.slice(start), pendingChoice: null, died: !s.alive };
}

/** Let the engine choose according to the `ai` weights of the pending choice. */
export function autoChoose(s) {
  if (!s.flags._choice) throw new Error('No choice is pending');
  const h = makeHelpers(s);
  return choose(s, autoPickIndex(s, h));
}

// ---------------------------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------------------------

/** JSON string of the state (it is plain JSON already; this exists for symmetry and validation). */
export function serialize(s) {
  return JSON.stringify(s);
}

/** Parse and validate a saved state. Throws on corrupt or incompatible data. */
export function deserialize(text) {
  const s = typeof text === 'string' ? JSON.parse(text) : text;
  if (!s || typeof s !== 'object') throw new Error('Invalid save');
  if (s.v !== STATE_VERSION) throw new Error(`Unsupported save version ${s.v}`);
  if (!Array.isArray(s.rng) || s.rng.length !== 4) throw new Error('Invalid save: rng');
  if (!BY_CODE[s.countryCode] || !BY_CODE[s.homeCountryCode]) throw new Error('Invalid save: country');
  for (const k of ['stats', 'edu', 'work', 'family', 'flags', 'seen']) if (!s[k] || typeof s[k] !== 'object') throw new Error(`Invalid save: ${k}`);
  for (const k of ['children', 'conditions', 'pending', 'log', 'statHistory', 'highlights']) if (!Array.isArray(s[k])) throw new Error(`Invalid save: ${k}`);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Read-only views for the UI
// ---------------------------------------------------------------------------------------------

/** Compact snapshot for the life screen header and the people drawer. */
export function getStatus(s) {
  const country = BY_CODE[s.countryCode];
  return {
    name: s.name.full,
    age: s.age,
    year: s.year,
    stage: lifeStage(s.age),
    gender: s.gender,
    countryCode: s.countryCode,
    countryName: country.name,
    city: s.city,
    urban: s.urban,
    stats: { ...s.stats },
    edu: { ...s.edu },
    workStatus: s.work.status,
    jobName: s.work.job ? JOBS[s.work.job].name : null,
    partner: s.partner ? { ...s.partner } : null,
    children: s.children.map((c) => ({ ...c, age: s.year - c.birthYear })),
    mother: { ...s.family.mother },
    father: { ...s.family.father },
    siblings: s.family.siblings,
    conditions: [...s.conditions],
    smoker: s.smoker,
    alive: s.alive,
  };
}
