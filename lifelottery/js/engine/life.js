// Public engine API: create a life, advance it year by year, resolve choices, serialise.
//
//   createLife(settings, seed, opts?) -> state   (opts.novelty = { eventId: earlier lives that met it }: see events.js)
//   advanceYear(state, { auto? })     -> { entries, pendingChoice, died }
//   choose(state, optionIndex)        -> { entries, pendingChoice: null, died }
//   autoChoose(state)                 -> same as choose, picking by each choice's `ai` weight
//   serialize(state) / deserialize(text)
//   getPendingChoice(state), getStatus(state)
//   FOCI, availableFoci(state), setFocus(state, id), autoFocus(state)      (life focus, see focus.js)
//
// One tick (advanceYear) resolves: survival of the year just lived -> age/year increment ->
// yearly systems -> events. Death therefore records the age at the *start* of the fatal year
// ("享年 N 歲" = N completed years). See README.md.

import { BY_CODE } from '../data/countries.js';
import { createRngState } from './rng.js';
import { drawBirth } from './birth.js';
import { dies, drawCause } from './mortality.js';
import { initSystems, runSystems, ctxOf, pushLog, STAT_KEYS, JOBS } from './systems.js';
import { runEvents, resolveChoice, autoPickIndex, getPendingChoice, sanitizeNovelty } from './events.js';
import { makeHelpers, recordDeath, hash01 } from './helpers.js';
import { drawReligion, RELIGION_LABELS } from '../data/religion.js';
import { FOCI, FOCUS_BY_ID, FOCUS_PROMPT_AGES, availableFoci, setFocus, autoFocus, ensureFocus, lapseFocus } from './focus.js';

export { getPendingChoice, FOCI, FOCUS_PROMPT_AGES, availableFoci, setFocus, autoFocus };

/** Family religion of a life, drawn from a hash of the seed (no random numbers are used, so nothing else in the life moves). */
function religionOf(seed, country, group, era, birthYear, name) {
  return drawReligion(country, group, era, hash01(`${seed}|religion|${birthYear}|${name}`));
}

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
 * @param {object} [opts]  force parts of the draw: { countryCode, gender, urban, wealthQ, birthYear }.
 *   `novelty` ({ eventId: number of earlier lives of this player that met it }, Phase 5C) makes events and "ordinary year"
 *   lines the player has seen before less likely and rotates the phrasing of events that have `variants`. It is copied into
 *   `state.novelty`, so it survives serialize/deserialize; without it (or when empty) the life is exactly the one it always was.
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
    religion: religionOf(seed, b.country.code, b.poolKey, b.eraKey, b.birthYear, b.name.full),
    focus: 'balance',
    focusHistory: [{ age: 0, focus: 'balance' }],
    stats: { health: 90, happiness: 60, knowledge: 2, wealth: 50, social: 55 },
    edu: { level: 'none', inSchool: false, years: 0 },
    work: { status: 'child', job: null, yearsWorked: 0 },
    partner: null,
    children: [],
    conditions: [],
    smoker: false,
    riskMult: 1,
    flags: { _pool: b.poolKey, _ft: b.name.familyToken, _gt: b.name.givenToken, _birthCity: b.city, _birthUrban: b.urban },
    seen: {},
    pending: [],
    log: [],
    statHistory: [],
    highlights: [],
    alive: true,
    death: null,
  };
  const novelty = sanitizeNovelty(opts.novelty);
  if (novelty) s.novelty = novelty;
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
 * With `{ auto: true }` pending choices are resolved automatically and the life focus is chosen at each stage prompt
 * (used by simulations; `{ auto: true, autoFocus: false }` leaves the focus alone so a test can force one).
 * @returns {{ entries: object[], pendingChoice: object|null, died: boolean }}
 */
export function advanceYear(s, { auto = false, autoFocus: autoF = auto } = {}) {
  if (!s.alive) return { entries: [], pendingChoice: null, died: true, focusPrompt: false };
  if (s.flags._choice) return { entries: [], pendingChoice: s.flags._choice, died: false, focusPrompt: !!s.flags._focusPrompt };

  const start = s.log.length;
  const ctx = ctxOf(s);

  // 1. Survive the year of life we are in?
  if (dies(s, ctx.home, ctx.birthView)) {
    const cause = drawCause(s, ctx.home, ctx.birthView, s.settings.era);
    recordDeath(s, cause);
    s.statHistory.push(snapshotRow(s));
    return { entries: s.log.slice(start), pendingChoice: null, died: true, focusPrompt: false };
  }

  // 2. Age up, then yearly systems and events
  s.age += 1;
  s.year += 1;
  // Life focus: one that is no longer open at this age lapses to 'balance'; a new life stage asks for a focus (the prompt
  // stays in flags._focusPrompt until setFocus answers it, so a reload still shows it). Auto play picks one itself.
  lapseFocus(s);
  delete s.flags._focusPrompt;
  if (FOCUS_PROMPT_AGES.includes(s.age)) {
    s.flags._focusPrompt = true;
    if (autoF) setFocus(s, autoFocus(s));
  }
  runSystems(s);
  const h = makeHelpers(s);
  runEvents(s, h);
  finishYear(s);

  if (!s.alive) return { entries: s.log.slice(start), pendingChoice: null, died: true, focusPrompt: false };
  if (auto) {
    let guard = 0;
    while (s.flags._choice && s.alive && guard++ < 3) {
      resolveChoice(s, h, autoPickIndex(s, h));
      s.statHistory[s.statHistory.length - 1] = snapshotRow(s);
    }
  }
  return { entries: s.log.slice(start), pendingChoice: s.flags._choice || null, died: !s.alive, focusPrompt: !!s.flags._focusPrompt };
}

/** Resolve the pending choice with the given option index (index into `pendingChoice.options`). */
export function choose(s, optionIndex) {
  if (!s.flags._choice) throw new Error('No choice is pending');
  const start = s.log.length;
  const h = makeHelpers(s);
  resolveChoice(s, h, optionIndex);
  if (s.statHistory.length) s.statHistory[s.statHistory.length - 1] = snapshotRow(s);
  return { entries: s.log.slice(start), pendingChoice: null, died: !s.alive, focusPrompt: !!s.flags._focusPrompt };
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
  // Saves from before Phase 4A: no life focus (balance) and no family religion (drawn now from the seed, like a new life)
  ensureFocus(s);
  if ('novelty' in s) { const nv = sanitizeNovelty(s.novelty); if (nv) s.novelty = nv; else delete s.novelty; } // Phase 5C; saves from before have none
  if (!RELIGION_LABELS[s.religion]) s.religion = religionOf(s.seed, s.homeCountryCode, s.flags._pool, s.settings && s.settings.era, s.birthYear, s.name && s.name.full);
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
    religion: s.religion,
    religionLabel: RELIGION_LABELS[s.religion] || '',
    focus: s.focus,
    focusLabel: (FOCUS_BY_ID[s.focus] || FOCUS_BY_ID.balance).label,
    foci: availableFoci(s).map((f) => ({ id: f.id, label: f.label, desc: f.desc })),
    focusPrompt: !!s.flags._focusPrompt,
  };
}
