// Event loading, validation, selection, application and follow-up scheduling.
//
// Event files (data/events/*.js) export arrays of plain objects following the API documented in
// PLAN.md section 5.5 and engine/README.md. This module is the only place that interprets them.
//
// Per-year flow (see runEvents):
//   1. due follow-ups (state.pending)           2. chance-type milestone events
//   3. 0-2 regular weighted events              4. at most one major (choice) event
//   5. nothing happened -> a "平凡的一年" line from data/yearly.js

import ALL_EVENTS from '../data/events/index.js';
import YEARLY from '../data/yearly.js';
import { STAT_KEYS, applyDelta, pushLog, addHighlight, standInKin, parentsPresent } from './systems.js';
import { rand, randInt, weightedIndex, chance, hash01, clamp } from './rng.js';
import { focusEventMult } from './focus.js';
import { Helpers } from './helpers.js';
import { remember, reflection, echoFor, domainOf, specificTags } from './memory.js';
import { BY_CODE } from '../data/countries.js';
import { incomeGroupAt } from '../data/eras.js';

export const EFFECT_KEYS = STAT_KEYS;

/** Tunables (exported so balance tests / the QA phase can read them). */
export const TUNING = {
  majorRate: 0.42,          // base probability of a major event in a year with candidates
  regularCounts: [0.28, 0.47, 0.25], // P(0), P(1), P(2) regular events in a year
  maxEntriesPerYear: 3,     // log entries per calendar year (system lines included; a choice's result line is not counted)
  maxRepeats: 3,            // a repeatable event (once:false) fires at most this many times per life (event.max overrides)
  yearlyRepeatGap: Infinity, // a "平凡的一年" line is never reused in a life while an unused one exists
  nullWeight: 2.5,          // weight of "nothing happens" in each regular draw: keeps a thin pool from firing constantly
};

/**
 * Observation hooks for tools (tools/consequence-scan.mjs): null in the game, so they cost one comparison. They never change the
 * state or draw a random number.
 *   pre(s, ev, choiceIndex, byFamily)          right before a choice is applied
 *   post(s, ev, choiceIndex, entry, byFamily)  right after its log entry was written
 *   fire(s, ev, entry)                         an event without a choice was logged, or a choice event was presented
 *   yearly(s, entry)                           an "ordinary year" line was written
 */
export const TRACE = { pre: null, post: null, fire: null, yearly: null };

// ---------------------------------------------------------------------------------------------
// Decision agency (Phase 6A): who makes the decision?
//
//   agencyOf(age)  'infant' 0-5 | 'child' 6-11 | 'teen' 12-17 | 'adult' 18+          (also h.agency())
//   event.decider = 'family'   an infant or a child never gets a choice card: the family decides (see decideForFamily), and the
//                              event is logged as one ordinary entry (the text, then what the family did, told by the child).
//                              Teens and adults choose as before; the choices a teenager sees are written for a teenager
//                              (`cond: (s, h) => h.agency() === 'teen'`, marked `who: 'child'`).
//   choice.who = 'child'       a choice written from a young person's point of view (ask, tell, hide, help ...); the `agency`
//                              audit (tests/lib/rules-agency.mjs) lets it through even when it mentions an adult act.
//   choice.familyResult        the result line when the family decided (string or (s, h) => string), written from the child's side;
//                              `false` for a choice that is never offered to a family deciding for a child (its `cond` keeps it for older people).
//   choice.cost 0..3           how much money / effort the option takes: poor families lean to the cheap ones, comfortable ones afford the dear ones.
//   choice.reach 0..2          how far the option depends on services (a clinic, transport): harder for remote, low-income families.
// An event without `decider` behaves exactly as before at every age.
// ---------------------------------------------------------------------------------------------

export const AGENCY_TIERS = Object.freeze(['infant', 'child', 'teen', 'adult']);

/** Decision tier of an age: infant (0-5), child (6-11), teen (12-17), adult (18 and over). */
export function agencyOf(age) {
  return age < 6 ? 'infant' : age < 12 ? 'child' : age < 18 ? 'teen' : 'adult';
}

/**
 * How well the family can cope, as a number around 0..6 (3 = an ordinary household): the wealth quintile, moved by the income
 * group of the country in that year, the countryside, and by how many parents are there to earn and to carry a child to the clinic.
 */
export function familyMeans(s) {
  const country = BY_CODE[s.countryCode];
  const group = country ? incomeGroupAt(country, s.year) : 'UM';
  const p = parentsPresent(s);
  return s.family.wealthQ + ({ L: -1, LM: -0.4, UM: 0.2, H: 0.6 }[group] ?? 0) + (s.urban ? 0 : -0.5) + (p === 'both' ? 0 : p === 'none' ? -1.4 : -0.7);
}

/** 'thin' | 'ok' | 'good': the family's means in words (h.means()). */
export function meansTier(s) {
  const m = familyMeans(s);
  return m < 2.2 ? 'thin' : m < 3.8 ? 'ok' : 'good';
}

/** How far services are from this family: 0 (a city, a rich country) .. ~1.3 (a poor, remote village). */
function remoteness(s) {
  const country = BY_CODE[s.countryCode];
  const group = country ? incomeGroupAt(country, s.year) : 'UM';
  return (s.urban ? 0 : 0.7) + ({ L: 0.6, LM: 0.3 }[group] ?? 0);
}

/** Weight multiplier of a choice for a family deciding in its own circumstances (1 when the choice declares no cost or reach). */
export function familyFactor(s, c) {
  let f = 1;
  if (typeof c.cost === 'number') {
    const a = clamp((familyMeans(s) - 3) / 1.6, -1.3, 1.3); // -1.3 (destitute) .. +1.3 (comfortable)
    f *= Math.exp(0.75 * a * (c.cost - 1.5));
  }
  if (typeof c.reach === 'number') f *= Math.exp(-0.8 * remoteness(s) * c.reach);
  return f;
}

/**
 * Who in the family decides, as the word a child would use ('爸爸', '媽媽', '爸媽', '奶奶', an uncle or aunt when both parents are gone,
 * else '身邊的大人'). Stable for a whole life stage (infant 0-5, child 6-11), whatever the decision: the same adult who carried you to
 * the clinic at four is the one who decides at five (Phase 6C; before, two events of one year could name two different people).
 * Draws no random numbers. `salt` is accepted for the old call sites and no longer changes the answer.
 */
export function whoDecides(s, salt = '') { // eslint-disable-line no-unused-vars
  const p = parentsPresent(s);
  const u = hash01(`${s.seed}|decides|${agencyOf(s.age)}`);
  if (p === 'both') return u < 0.34 ? '爸爸' : u < 0.68 ? '媽媽' : u < 0.9 ? '爸媽' : '奶奶';
  if (p === 'mother') return u < 0.82 ? '媽媽' : '奶奶';
  if (p === 'father') return u < 0.82 ? '爸爸' : '奶奶';
  return standInKin(s) || '身邊的大人';
}

// h.agency() and friends live here (the helper class belongs to systems/helpers, the tiers to the event engine); they are part of
// every `h` handed to an event, in the engine and in the tests alike.
const AGENCY_HELPERS = {
  /** 'infant' | 'child' | 'teen' | 'adult' (see agencyOf). */
  agency() { return agencyOf(this.s.age); },
  /** Under 12: an infant or a child, whose family decides the big things. */
  isKid() { return this.s.age < 12; },
  /** 12-17. */
  isTeen() { return this.s.age >= 12 && this.s.age < 18; },
  /** Who in the family is deciding right now ('爸爸', '媽媽', '爸媽', '奶奶', an uncle / aunt when the parents are gone, or '身邊的大人'). `salt` tells two decisions of the same year apart. */
  whoDecides(salt = '') { return whoDecides(this.s, salt); },
  /** The family's means in words: 'thin' | 'ok' | 'good' (wealth quintile, country income, countryside, parents present). */
  means() { return meansTier(this.s); },
  /** How a grown-up carries the child, for a child's narration: '抱著你' (up to 3), '背著你' (4-7), '牽著你' (8 and over). */
  carryYou() { const a = this.s.age; return a <= 3 ? '抱著你' : a <= 7 ? '背著你' : '牽著你'; },
};
for (const [name, fn] of Object.entries(AGENCY_HELPERS)) {
  if (!Object.prototype.hasOwnProperty.call(Helpers.prototype, name)) Object.defineProperty(Helpers.prototype, name, { value: fn, writable: true, configurable: true, enumerable: false });
}

// ---------------------------------------------------------------------------------------------
// Cross-life novelty (Phase 5C)
//
// `state.novelty` is a snapshot of how many earlier lives of this player met each event: { eventId: lives, 'yearly:7': lives }.
// It exists only when createLife was given one (the game passes localStorage "lifelottery.seenEvents"); without it every
// function below returns the neutral value and the engine behaves exactly as before (same random numbers, same log).
//   * weight of an ordinary event x noveltyFactor(count) = max(0.4, 1 / (1 + 0.45 x count))
//   * the same factor thins out the "ordinary year" lines
//   * an event with `variants` rotates through its phrasings: variant = (hash(seed, id) + count) mod (1 + variants.length)
// ---------------------------------------------------------------------------------------------

export const NOVELTY = { floor: 0.4, slope: 0.45, maxCount: 99 };

/** Weight multiplier for something the player has met in `count` earlier lives. */
export function noveltyFactor(count) {
  return count > 0 ? Math.max(NOVELTY.floor, 1 / (1 + NOVELTY.slope * count)) : 1;
}

/** A clean `{ id: count }` copy (finite positive integers only), or null when there is nothing in it. */
export function sanitizeNovelty(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [id, c] of Object.entries(raw)) {
    if (!/^(yearly:\d{1,4}|[a-z][a-z0-9_]{0,80})$/.test(id)) continue;
    const v = Math.min(NOVELTY.maxCount, Math.floor(+c));
    if (v >= 1) { out[id] = v; n++; }
  }
  return n ? out : null;
}

const noveltyCount = (s, key) => (s.novelty && s.novelty[key]) || 0;

/** Events the novelty weighting leaves alone: milestones, chance-type (calendar / life-stage) events, world events, follow-ups and story chains. */
function noveltyExempt(ev) {
  if (ev.novelty === false || ev.milestone || ev.chance !== undefined || ev.weight === 0) return true;
  if (ev.id.startsWith('world_')) return true;
  const tags = ev.tags || [];
  return tags.includes('world') || tags.includes('era') || tags.includes('followup') || tags.includes('chain') || tags.includes('milestone');
}

const NOVELTY_EXEMPT = new Set();

/** Is this event left alone by the novelty weighting (tests and the debug panel)? */
export function isNoveltyExempt(id) { return NOVELTY_EXEMPT.has(id); }

/** Weight multiplier of an event for this life (1 without novelty, for exempt events and for events never met before). */
function noveltyMult(s, ev) {
  if (!s.novelty || NOVELTY_EXEMPT.has(ev.id)) return 1;
  return noveltyFactor(s.novelty[ev.id] || 0);
}

/** Which phrasing of `key` (an event id or "yearly:N") this life uses: 0 = the main text, i >= 1 = variants[i - 1]. */
function variantIndex(s, key, n) {
  if (n <= 1) return 0;
  return (Math.floor(hash01(`${s.seed}|variant|${key}`) * n) + noveltyCount(s, key)) % n;
}

/**
 * The phrasings of `spec` (an event or a yearly template) for this life: `main` is the event's own text, `list` is every
 * phrasing in preference order (`list[0]` is the one this life uses, the rest follow in rotation order as fallbacks).
 * The main text is always rendered first and exactly once, as before: it is what repeat detection compares, and it keeps every
 * random number it may draw where it always was, so a variant never changes which events fire. Variants therefore must not
 * use random numbers or change the state.
 */
function renderText(s, h, spec, key) {
  const main = str(spec.text, s, h);
  const vs = spec.variants;
  if (!vs || !vs.length) return { main, list: [main] };
  const n = vs.length + 1;
  const first = variantIndex(s, key, n);
  const all = [main, ...vs.map((v) => str(v, s, h))];
  return { main, list: Array.from({ length: n }, (_, k) => all[(first + k) % n]) };
}

// ---------------------------------------------------------------------------------------------
// Indexing and validation
// ---------------------------------------------------------------------------------------------

export const EVENTS = ALL_EVENTS;
const BY_ID = new Map();
const BY_AGE = Array.from({ length: 122 }, () => ({ regular: [], major: [], chance: [] }));

export function isMajor(ev) {
  return !!(ev.major || (ev.choices && ev.choices.length));
}

function indexEvents(list) {
  BY_ID.clear();
  NOVELTY_EXEMPT.clear();
  for (const b of BY_AGE) { b.regular.length = 0; b.major.length = 0; b.chance.length = 0; }
  for (const ev of list) {
    BY_ID.set(ev.id, ev);
    if (noveltyExempt(ev)) NOVELTY_EXEMPT.add(ev.id);
    const [a, b] = ev.ages || [0, 120];
    for (let age = Math.max(0, a); age <= Math.min(121, b); age++) {
      const bucket = BY_AGE[age];
      if (ev.chance !== undefined) bucket.chance.push(ev);
      else if (isMajor(ev)) bucket.major.push(ev);
      else bucket.regular.push(ev);
    }
  }
}
indexEvents(EVENTS);

export function getEvent(id) {
  return BY_ID.get(id);
}

/** Structural validation of event definitions. Returns an array of error strings (empty = OK). */
export function validateEvents(list, byId = null) {
  const errors = [];
  const ids = new Set();
  const lookup = byId || new Set(list.map((e) => e.id));
  const has = (id) => (lookup instanceof Set ? lookup.has(id) : lookup.has(id));
  const checkEffects = (where, eff) => {
    if (eff === undefined || typeof eff === 'function') return;
    if (typeof eff !== 'object' || eff === null) { errors.push(`${where}: effects must be object or function`); return; }
    for (const [k, v] of Object.entries(eff)) {
      if (!EFFECT_KEYS.includes(k)) errors.push(`${where}: illegal effect key "${k}"`);
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${where}: effect "${k}" is not a finite number`);
    }
  };
  const checkSchedule = (where, sch) => {
    if (sch === undefined) return;
    if (!Array.isArray(sch)) { errors.push(`${where}: schedule must be an array`); return; }
    for (const it of sch) {
      if (!it || typeof it.id !== 'string') { errors.push(`${where}: schedule item without id`); continue; }
      if (!has(it.id)) errors.push(`${where}: schedule target "${it.id}" does not exist`);
      const y = it.inYears;
      if (!Array.isArray(y) || y.length !== 2 || !(y[0] >= 0) || !(y[1] >= y[0])) errors.push(`${where}: schedule "${it.id}" needs inYears [min,max]`);
      if (it.p !== undefined && !(it.p >= 0 && it.p <= 1)) errors.push(`${where}: schedule "${it.id}" has p outside 0..1`);
    }
  };
  const checkFlags = (where, arr, name) => {
    if (arr === undefined) return;
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== 'string' || !x)) errors.push(`${where}: ${name} must be an array of strings`);
  };

  for (const ev of list) {
    const w = `event ${ev.id}`;
    if (typeof ev.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(ev.id)) { errors.push(`${w}: id must be snake_case`); continue; }
    if (ids.has(ev.id)) errors.push(`${w}: duplicate id`);
    ids.add(ev.id);
    if (typeof ev.title !== 'string' || !ev.title) errors.push(`${w}: missing title`);
    if (ev.ages !== undefined) {
      const a = ev.ages;
      if (!Array.isArray(a) || a.length !== 2 || !Number.isInteger(a[0]) || !Number.isInteger(a[1]) || a[0] < 0 || a[1] < a[0] || a[1] > 120) errors.push(`${w}: ages must be [min,max] integers within 0..120`);
    }
    if (ev.weight !== undefined && typeof ev.weight !== 'function' && !(typeof ev.weight === 'number' && ev.weight >= 0)) errors.push(`${w}: weight must be a non-negative number or function`);
    if (ev.chance !== undefined && !(typeof ev.chance === 'number' && ev.chance > 0 && ev.chance <= 1)) errors.push(`${w}: chance must be in (0,1]`);
    if (ev.cond !== undefined && typeof ev.cond !== 'function') errors.push(`${w}: cond must be a function`);
    if (ev.followCond !== undefined && typeof ev.followCond !== 'function') errors.push(`${w}: followCond must be a function`);
    if (typeof ev.text !== 'function' && typeof ev.text !== 'string') errors.push(`${w}: text must be a string or function`);
    if (ev.once !== undefined && typeof ev.once !== 'boolean') errors.push(`${w}: once must be boolean`);
    if (ev.variants !== undefined && (!Array.isArray(ev.variants) || !ev.variants.length || ev.variants.some((v) => (typeof v !== 'string' && typeof v !== 'function') || v === ''))) errors.push(`${w}: variants must be a non-empty array of strings or functions`);
    if (ev.again !== undefined && typeof ev.again !== 'string' && typeof ev.again !== 'function') errors.push(`${w}: again must be a string or function`);
    if (ev.max !== undefined && !(Number.isInteger(ev.max) && ev.max >= 1)) errors.push(`${w}: max must be a positive integer`);
    if (ev.memory !== undefined && ev.memory !== false && typeof ev.memory !== 'string' && typeof ev.memory !== 'function') errors.push(`${w}: memory must be a string, a function or false`);
    if (ev.cooldown !== undefined && !(Number.isInteger(ev.cooldown) && ev.cooldown >= 0)) errors.push(`${w}: cooldown must be a non-negative integer`);
    if (ev.once === false && ev.chance === undefined && ev.cooldown === undefined) { /* allowed: repeatable with no cooldown */ }
    checkEffects(w, ev.effects);
    checkSchedule(w, ev.schedule);
    checkFlags(w, ev.set, 'set');
    checkFlags(w, ev.unset, 'unset');
    if (ev.major && !(ev.choices && ev.choices.length)) errors.push(`${w}: major events need choices`);
    if (ev.decider !== undefined && (ev.decider !== 'family' || !(ev.choices && ev.choices.length))) errors.push(`${w}: decider must be 'family' and the event must have choices`);
    if (ev.choices !== undefined) {
      // 2-3 choices are shown at once; an event that offers different wordings to different ages (Phase 6A) lists up to 6 and hides the others with `cond`
      if (!Array.isArray(ev.choices) || ev.choices.length < 2 || ev.choices.length > 6) errors.push(`${w}: choices must have 2-6 items (2-3 visible at a time)`);
      else ev.choices.forEach((c, i) => {
        const cw = `${w} choice ${i}`;
        if (typeof c.label !== 'string' || !c.label) errors.push(`${cw}: missing label`);
        if (c.who !== undefined && c.who !== 'child') errors.push(`${cw}: who must be 'child'`);
        if (c.familyResult !== undefined && c.familyResult !== false && typeof c.familyResult !== 'string' && typeof c.familyResult !== 'function') errors.push(`${cw}: familyResult must be string, function, or false (never offered to a family deciding for a child)`);
        for (const mk of ['memory', 'memoryYou']) if (c[mk] !== undefined && c[mk] !== false && typeof c[mk] !== 'string' && typeof c[mk] !== 'function') errors.push(`${cw}: ${mk} must be a string, a function or false`);
        if (c.cost !== undefined && !(typeof c.cost === 'number' && c.cost >= 0 && c.cost <= 3)) errors.push(`${cw}: cost must be a number in 0..3`);
        if (c.reach !== undefined && !(typeof c.reach === 'number' && c.reach >= 0 && c.reach <= 2)) errors.push(`${cw}: reach must be a number in 0..2`);
        if (ev.decider === 'family' && c.who === undefined && c.familyResult === undefined) errors.push(`${cw}: a family-decided event needs familyResult on every choice that is not who:'child'`);
        if (c.cond !== undefined && typeof c.cond !== 'function') errors.push(`${cw}: cond must be a function`);
        checkEffects(cw, c.effects);
        checkSchedule(cw, c.schedule);
        checkFlags(cw, c.set, 'set');
        checkFlags(cw, c.unset, 'unset');
        if (c.result !== undefined && typeof c.result !== 'string' && typeof c.result !== 'function') errors.push(`${cw}: result must be string or function`);
        if (c.ai !== undefined && typeof c.ai !== 'number' && typeof c.ai !== 'function') errors.push(`${cw}: ai must be number or function`);
      });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// Eligibility and selection
// ---------------------------------------------------------------------------------------------

/** Can `ev` be drawn this year (age window checked by the age index; this checks once/cooldown/cond). */
export function isEligible(s, h, ev) {
  const seen = s.seen[ev.id];
  if (seen !== undefined) {
    if (ev.once !== false) return false;
    if (ev.cooldown && s.age - seen < ev.cooldown) return false;
    const shown = s.flags._rt && s.flags._rt[ev.id];
    if (shown && shown.length >= (ev.max ?? TUNING.maxRepeats)) return false;
  }
  if (ev.cond) {
    try { if (!ev.cond(s, h)) return false; } catch (e) { return false; }
  }
  return true;
}

function weightOf(s, h, ev) {
  const w = ev.weight;
  let base;
  if (w === undefined) base = 1;
  else if (typeof w === 'function') { try { base = Math.max(0, +w(s, h) || 0); } catch (e) { return 0; } }
  else base = w;
  // life focus: events about studying, work, family, health or hobbies become likelier or rarer (focus.js, by tag)
  return base * focusEventMult(s.focus, ev.tags);
}

function pickWeighted(s, h, list, nullWeight = 0) {
  if (!list.length) return null;
  const w = list.map((ev) => weightOf(s, h, ev));
  if (s.novelty) for (let i = 0; i < w.length; i++) w[i] *= noveltyMult(s, list[i]); // events met in earlier lives are drawn less often
  if (nullWeight > 0) w.push(nullWeight);
  const i = weightedIndex(s.rng, w);
  return i < 0 || i >= list.length ? null : list[i];
}

/** Eligible events for the person's age, split by kind (exported for tests and the UI debug panel). */
export function eligibleEvents(s, h) {
  const b = BY_AGE[Math.min(s.age, 121)];
  return {
    regular: b.regular.filter((e) => isEligible(s, h, e)),
    major: b.major.filter((e) => isEligible(s, h, e)),
    chance: b.chance.filter((e) => isEligible(s, h, e)),
  };
}

// ---------------------------------------------------------------------------------------------
// Applying events
// ---------------------------------------------------------------------------------------------

const str = (v, s, h) => (typeof v === 'function' ? v(s, h) : v);

function snapshotStats(s) {
  return { health: s.stats.health, happiness: s.stats.happiness, knowledge: s.stats.knowledge, wealth: s.stats.wealth, social: s.stats.social };
}

function diffStats(s, before) {
  const d = {};
  for (const k of STAT_KEYS) {
    const v = Math.round((s.stats[k] - before[k]) * 10) / 10;
    if (v) d[k] = v;
  }
  return d;
}

/** Apply an `effects` spec (object or function) and return the stat delta that resulted. */
function applyEffects(s, h, effects) {
  if (!effects) return {};
  if (typeof effects === 'function') {
    const before = snapshotStats(s);
    effects(s, h);
    return diffStats(s, before);
  }
  return applyDelta(s, effects);
}

function applyFlags(s, spec) {
  if (spec.set) for (const f of spec.set) s.flags[f] = true;
  if (spec.unset) for (const f of spec.unset) delete s.flags[f];
}

function scheduleFollowUps(s, list) {
  if (!list) return;
  for (const it of list) {
    const [a, b] = it.inYears;
    if (it.p !== undefined && !chance(s.rng, it.p)) continue; // optional `p`: probability that the follow-up happens at all
    s.pending.push({ id: it.id, atAge: s.age + randInt(s.rng, a, b) });
  }
}

/**
 * Keep the choice that was just made as a memory (Phase 6C). An authored `memory` on the choice (or on the event; `memoryYou` for an option that
 * also has a `familyResult`, when somebody chooses it for themselves) is a clause in the second
 * person, written after the effects ran ("是叔叔借了車，送你去診所"; a function may use the state); `memory: false` keeps nothing. Without
 * one, a choice of the player becomes 「面對「title」，你選了「label」」, and a decision the family took for a child names who decided.
 */
function rememberChoice(s, h, ev, ch, byFamily) {
  // the authored phrase of an option that has a `familyResult` tells what the family did for a child: when somebody chooses it themselves
  // (an adult, a teenager choosing a grown-up option) the plain "你選了…" memory is kept instead
  const familyVoice = ch.familyResult !== undefined && ch.familyResult !== false && !byFamily;
  const spec = familyVoice ? ch.memoryYou : (ch.memory !== undefined ? ch.memory : ev.memory);
  if (spec === false || !s.alive) return;
  let phrase = '';
  try { phrase = typeof spec === 'function' ? spec(s, h) : (spec || ''); } catch (e) { phrase = ''; }
  const authored = !!phrase;
  if (!phrase) phrase = byFamily ? `${whoDecides(s)}為「${String(ev.title).replace(/[「」]/g, '')}」拿了主意` : `面對「${String(ev.title).replace(/[「」]/g, '')}」，你選了「${String(ch.label).replace(/[「」]/g, '')}」`;
  remember(s, `${byFamily ? 'f' : 'c'}:${ev.id}`, phrase, { tag: domainOf(ev), tags: specificTags(ev), w: byFamily || authored ? 2 : 1, plain: !authored, told: !!(ch.schedule && ch.schedule.length) });
}

/** An event without choices that is a key moment of its own (`memory` on the event). */
function rememberEvent(s, h, ev) {
  if (!ev.memory || !s.alive) return;
  let phrase = '';
  try { phrase = typeof ev.memory === 'function' ? ev.memory(s, h) : ev.memory; } catch (e) { phrase = ''; }
  if (phrase) remember(s, `e:${ev.id}`, phrase, { tag: domainOf(ev), tags: specificTags(ev), w: 2 });
}

/** A short line that calls an older memory of the same kind back (memory.js echoFor), kept next to the entry as `echo`. */
function addEcho(s, ev, entry) {
  if (!s.alive || entry.echo) return;
  const e = echoFor(s, ev, domainOf(ev));
  if (e) entry.echo = e;
}

function addHighlightFrom(s, h, spec, fallback) {
  if (!spec.highlight) return;
  const t = spec.highlight === true ? fallback : str(spec.highlight, s, h);
  if (t) addHighlight(s, t);
}

function markSeen(s, ev) {
  s.seen[ev.id] = s.age;
}

/**
 * h.die() inside an event's effects logs the death immediately, i.e. before the event's own narrative entry
 * (which is only pushed once the effects have run). Move the death entry/entries logged since `from` behind it.
 */
function deathLast(s, from) {
  const tail = s.log.slice(from);
  if (!tail.some((e) => e.kind === 'death')) return;
  const rest = tail.filter((e) => e.kind !== 'death');
  const deaths = tail.filter((e) => e.kind === 'death');
  s.log.length = from;
  s.log.push(...rest, ...deaths);
}

/** Short stable hash of a rendered text (used to remember what an event has already said in this life). */
function textHash(t) {
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

/**
 * First firing: remember the text only for repeatable events (once-only events never need the history). `_rt` keeps one
 * hash of the main text per firing (the repeat detector); `_rtv` keeps the hashes of the phrasings actually shown, for events with variants.
 */
function recordFirst(s, ev, r) {
  if (ev.once === false) {
    ((s.flags._rt ||= {})[ev.id] ||= []).push(textHash(r.main));
    if (r.list.length > 1) ((s.flags._rtv ||= {})[ev.id] ||= []).push(textHash(r.list[0]));
  }
  return r.list[0];
}

/**
 * The text this firing of `ev` shows, or null when the event has nothing new to say: a repeatable event never
 * repeats a text word for word within one life. A repeat uses the event's `again` text (string or function) when it
 * has one; otherwise it is skipped (its cooldown still starts). Whether it repeats is decided by the main text alone
 * (as it always was); an event with variants then shows the first phrasing it has not shown in this life.
 */
function freshText(s, h, ev) {
  const hist = (s.flags._rt ||= {});
  const shown = (hist[ev.id] ||= []);
  const r = renderText(s, h, ev, ev.id);
  const mainHash = textHash(r.main);
  if (!shown.includes(mainHash)) {
    shown.push(mainHash);
    if (r.list.length === 1) return r.list[0];
    const said = ((s.flags._rtv ||= {})[ev.id] ||= []);
    const text = r.list.find((t) => !said.includes(textHash(t))) ?? r.list[0];
    said.push(textHash(text));
    return text;
  }
  if (ev.again === undefined) return null;
  const text = str(ev.again, s, h);
  const hash = textHash(text);
  if (shown.includes(hash)) return null;
  shown.push(hash);
  return text;
}

/** Short echoes appended when a repeatable event's choice leads to the very same outcome text again. */
const ECHOES = [
  '這樣的選擇，你不是第一次做了。',
  '你想起上一次，笑了一下。',
  '這一次，你比上回更清楚自己為什麼這樣選。',
  '日子照著你熟悉的節奏繼續。',
  '有些事，你大概一輩子都會這樣處理。',
];

/** A choice of a repeatable event that ends exactly as last time says so, instead of printing the same paragraph twice. */
function freshResult(s, ev, optIndex, text) {
  if (ev.once !== false || !text) return text;
  const hist = ((s.flags._rt ||= {})[`${ev.id}#${optIndex}`] ||= []);
  const n = hist.length;
  hist.push(1);
  return n === 0 ? text : `${text}${ECHOES[(n - 1) % ECHOES.length]}`;
}

/**
 * Lines the effects wrote on their own (a diagnosis, a job change ...) land in the log before the event's own entry,
 * because the entry is only pushed once the effects have run. The story reads better the other way round.
 */
function entryFirst(s, from, entry) {
  const i = s.log.lastIndexOf(entry);
  if (i > from) { s.log.splice(i, 1); s.log.splice(from, 0, entry); }
}

/** Fire a non-choice event. Returns the log entry, or null when a repeat had nothing new to say. */
function fireRegular(s, h, ev) {
  const again = s.seen[ev.id] !== undefined;
  const text = again ? freshText(s, h, ev) : (recordFirst(s, ev, renderText(s, h, ev, ev.id)));
  markSeen(s, ev);
  if (text === null) return null;
  const from = s.log.length;
  const delta = applyEffects(s, h, ev.effects);
  applyFlags(s, ev);
  scheduleFollowUps(s, ev.schedule);
  addHighlightFrom(s, h, ev, text);
  rememberEvent(s, h, ev);
  const entry = pushLog(s, ev.milestone ? 'milestone' : 'event', ev.title, text, delta);
  entryFirst(s, from, entry);
  deathLast(s, from); // a death caused by the effects reads after the event's own narrative
  addEcho(s, ev, entry);
  if (TRACE.fire) TRACE.fire(s, ev, entry);
  return entry;
}

/** The `ai` weight of a choice (number or function of the state); 1 when it has none or the function throws. */
function aiWeight(s, h, c) {
  const ai = c.ai;
  if (ai === undefined) return 1;
  if (typeof ai === 'function') { try { return Math.max(0, +ai(s, h) || 0); } catch (e) { return 1; } }
  return ai;
}

/**
 * Phase 6A: a family-decided event (`decider: 'family'`) met by an infant or a child. Nobody asks the child. The family picks one
 * of the options, weighted by each option's `ai` and by the family's circumstances (wealth quintile, income group, countryside, which
 * parents are alive: see familyFactor), and the event is written down as one ordinary entry: the event's text, then the
 * option's `familyResult` (what the family did, told from the child's side). It is not a choice and is not counted as one.
 */
function decideForFamily(s, h, ev, options, text) {
  const ws = options.map((o) => aiWeight(s, h, ev.choices[o.index]) * familyFactor(s, ev.choices[o.index]));
  let k = weightedIndex(s.rng, ws);
  if (k < 0) k = Math.floor(rand(s.rng) * options.length);
  const ch = ev.choices[options[k].index];
  const from = s.log.length;
  if (TRACE.pre) TRACE.pre(s, ev, options[k].index, true);
  const d1 = applyEffects(s, h, ev.effects);
  applyFlags(s, ev);
  const d2 = applyEffects(s, h, ch.effects);
  applyFlags(s, ch);
  scheduleFollowUps(s, ch.schedule);
  scheduleFollowUps(s, ev.schedule);
  const result = str(ch.familyResult ? ch.familyResult : ch.result, s, h) || '';
  rememberChoice(s, h, ev, ch, true);
  const told = `${text}${result}`;
  addHighlightFrom(s, h, ch, told);
  if (!ch.highlight) addHighlightFrom(s, h, ev, told);
  const delta = {};
  for (const k2 of STAT_KEYS) { const v = Math.round(((d1[k2] || 0) + (d2[k2] || 0)) * 10) / 10; if (v) delta[k2] = v; }
  const entry = pushLog(s, 'event', ev.title, told, delta);
  entry.by = 'family'; // marks the entry as a decision the family took (the UI shows it like any other event; tests and the debug panel read the mark)
  entryFirst(s, from, entry);
  deathLast(s, from);
  if (TRACE.post) TRACE.post(s, ev, options[k].index, entry, true);
  return entry;
}

/**
 * Present a major event: log its setup text and store the choice for the UI. Event-level `effects`, `set`
 * and `unset` apply now (the situation itself has consequences); event-level `schedule` is queued when
 * the choice is resolved, together with the chosen option's own follow-ups.
 * A family-decided event met by an infant or a child is decided and logged right here instead (decideForFamily).
 */
function presentChoice(s, h, ev) {
  const options = [];
  ev.choices.forEach((c, i) => {
    let ok = true;
    if (c.cond) { try { ok = !!c.cond(s, h); } catch (e) { ok = false; } }
    if (ok) options.push({ index: i, label: c.label, hint: c.hint });
  });
  if (options.length === 0) return null;
  const again = s.seen[ev.id] !== undefined;
  const text = again ? freshText(s, h, ev) : recordFirst(s, ev, renderText(s, h, ev, ev.id));
  markSeen(s, ev);
  if (text === null) return null;
  if (ev.decider === 'family' && s.age < 12) return decideForFamily(s, h, ev, options, text);
  const from = s.log.length;
  const delta = applyEffects(s, h, ev.effects);
  applyFlags(s, ev);
  const entry = pushLog(s, 'event', ev.title, text, delta);
  entryFirst(s, from, entry);
  deathLast(s, from);
  if (s.alive) s.flags._choice = { eventId: ev.id, title: ev.title, text, options };
  addEcho(s, ev, entry);
  if (TRACE.fire) TRACE.fire(s, ev, entry);
  return entry;
}

/** The pending choice (JSON-safe object) or null. */
export function getPendingChoice(s) {
  return s.flags._choice || null;
}

/**
 * Resolve the pending choice. `optionIndex` indexes `getPendingChoice(s).options`.
 * Returns the log entry; throws on invalid use.
 */
export function resolveChoice(s, h, optionIndex) {
  const pc = s.flags._choice;
  if (!pc) throw new Error('no pending choice');
  const opt = pc.options[optionIndex];
  if (!opt) throw new Error(`invalid choice index ${optionIndex}`);
  const ev = BY_ID.get(pc.eventId);
  const ch = ev.choices[opt.index];
  delete s.flags._choice;
  const from = s.log.length;
  if (TRACE.pre) TRACE.pre(s, ev, opt.index, false);
  const delta = applyEffects(s, h, ch.effects);
  applyFlags(s, ch);
  scheduleFollowUps(s, ch.schedule);
  scheduleFollowUps(s, ev.schedule); // event-level follow-ups of a choice event
  const result = ch.result === undefined ? '' : freshResult(s, ev, opt.index, str(ch.result, s, h));
  rememberChoice(s, h, ev, ch, false);
  addHighlightFrom(s, h, ch, result || ch.label);
  if (!ch.highlight) addHighlightFrom(s, h, ev, result || ev.title);
  const entry = pushLog(s, 'choice', ch.label, result, delta);
  entryFirst(s, from, entry);
  deathLast(s, from); // a death caused by the choice reads after its result text
  addEcho(s, ev, entry);
  if (TRACE.post) TRACE.post(s, ev, opt.index, entry, false);
  return entry;
}

/** Pick an option index for auto-play, weighted by each choice's `ai` (number or function). */
export function autoPickIndex(s, h) {
  const pc = s.flags._choice;
  if (!pc) return -1;
  const ev = BY_ID.get(pc.eventId);
  const ws = pc.options.map((o) => aiWeight(s, h, ev.choices[o.index]));
  const i = weightedIndex(s.rng, ws);
  return i < 0 ? Math.floor(rand(s.rng) * pc.options.length) : i;
}

// ---------------------------------------------------------------------------------------------
// The yearly "ordinary year" summary
// ---------------------------------------------------------------------------------------------

function pickYearly(s, h) {
  const pool = [];
  for (let i = 0; i < YEARLY.length; i++) {
    const t = YEARLY[i];
    const [a, b] = t.ages || [0, 120];
    if (s.age < a || s.age > b) continue;
    if (t.cond) { try { if (!t.cond(s, h)) continue; } catch (e) { continue; } }
    pool.push(i);
  }
  // Never repeat a line within a life while an unused one exists; once the pool is used up, take the oldest ones.
  const lastUsed = (i) => s.seen[`yearly:${i}`];
  let use = pool.filter((i) => lastUsed(i) === undefined || s.age - lastUsed(i) >= TUNING.yearlyRepeatGap);
  if (!use.length) {
    const oldest = Math.min(...pool.map((i) => lastUsed(i)));
    use = pool.filter((i) => lastUsed(i) <= oldest + 4);
  }
  if (!use.length) return null;
  // Narrow lines first: a line that fits only a few ages is used while it fits, broad ones are kept for later years.
  const narrow = (i) => { const [a, b] = YEARLY[i].ages || [0, 120]; return 1 + 40 / (Math.min(b, 105) - a + 1); };
  // Lines an earlier life of this player already used come up less often (the same factor as ordinary events).
  const fresh = (i) => (s.novelty ? noveltyFactor(s.novelty[`yearly:${i}`] || 0) : 1);
  const idx = use[weightedIndex(s.rng, use.map((i) => (YEARLY[i].weight ?? 1) * narrow(i) * fresh(i)))];
  s.seen[`yearly:${idx}`] = s.age;
  return { t: YEARLY[idx], key: `yearly:${idx}` };
}

function yearlyEntry(s, h) {
  // some quiet years look back instead (memory.js): one or two older memories in a line of their own
  const look = reflection(s);
  if (look) {
    const e = pushLog(s, 'year', `${s.age} 歲`, look);
    if (TRACE.yearly) TRACE.yearly(s, e);
    return e;
  }
  const pick = pickYearly(s, h);
  const text = pick ? renderText(s, h, pick.t, pick.key).list[0] : '平凡的一年悄悄過去。';
  const entry = pushLog(s, 'year', `${s.age} 歲`, text);
  if (TRACE.yearly) TRACE.yearly(s, entry);
  return entry;
}

// ---------------------------------------------------------------------------------------------
// The per-year event pass
// ---------------------------------------------------------------------------------------------

function drawRegularCount(s) {
  const r = rand(s.rng), p = TUNING.regularCounts;
  return r < p[0] ? 0 : r < p[0] + p[1] ? 1 : 2;
}

function majorRateFor(age) {
  if (age < 4) return 0.15;
  if (age < 8) return 0.45;
  if (age > 85) return 0.6;
  return 1;
}

/**
 * Run the event pass for the current year. Appends log entries and may set a pending choice.
 * Returns true if a choice is now pending.
 */
export function runEvents(s, h) {
  const cap = TUNING.maxEntriesPerYear;
  // Entries already written this year by the yearly systems (school, marriage, a parent's death ...) use up the budget.
  let entries = 0;
  for (let i = s.log.length - 1; i >= 0 && s.log[i].year === s.year; i--) if (s.log[i].kind !== 'choice') entries++;
  let choiceEvent = null;

  // 1. Due follow-ups. The pass runs again after the chance events (2) and the regular events (4): a follow-up that
  // an event of this very year scheduled for "0 years from now" (the 2020 pandemic -> remote school) fires in the same year.
  let reservedByChance = false; // the reserved major event was drawn as a milestone: its condition is checked again before it is shown
  let reserve = 0; // slot kept for the major event once step 3 has decided to draw one
  const runDue = () => {
    if (!s.pending.length) return;
    const keep = [];
    const due = [];
    for (const p of s.pending) (p.atAge <= s.age ? due : keep).push(p);
    if (!due.length) return;
    s.pending = keep;
    due.sort((a, b) => a.atAge - b.atAge);
    for (const p of due) {
      const ev = BY_ID.get(p.id);
      if (!ev) continue;
      if (ev.once !== false && s.seen[ev.id] !== undefined) continue;
      if (p.recheck && !isEligible(s, h, ev)) continue; // a milestone that was only postponed must still fit when its turn comes
      // `followCond`: the follow-up is dropped silently when it no longer fits (e.g. the child has left school meanwhile);
      // returning 'wait' keeps it for next year instead (e.g. a treatment that only exists from a certain year on)
      if (ev.followCond) {
        let ok = false;
        try { ok = ev.followCond(s, h); } catch (e) { ok = false; }
        if (ok === 'wait') { if (s.age < 90) s.pending.push({ ...p, atAge: s.age + 1 }); continue; }
        if (!ok) continue;
      }
      if (isMajor(ev)) {
        if (choiceEvent || entries >= cap) { s.pending.push({ ...p, atAge: s.age + 1 }); continue; }
        choiceEvent = ev;
        entries++; // reserve its slot
      } else if (entries + reserve < cap) { if (fireRegular(s, h, ev)) entries++; } else s.pending.push({ ...p, atAge: s.age + 1 });
      if (!s.alive) return;
    }
  };
  runDue();
  if (!s.alive) return false;

  const el = eligibleEvents(s, h);

  // 2. Chance (milestone-type) events
  for (const ev of el.chance) {
    if (entries >= cap) break;
    if (!chance(s.rng, Math.min(1, ev.chance * focusEventMult(s.focus, ev.tags)))) continue;
    if (!isEligible(s, h, ev)) continue; // an earlier event of this pass may have changed the state
    if (isMajor(ev)) {
      if (!choiceEvent) { choiceEvent = ev; reservedByChance = true; entries++; } else s.pending.push({ id: ev.id, atAge: s.age + 1, recheck: true }); // postponed milestone: its condition is checked again next year
    } else if (fireRegular(s, h, ev)) entries++;
    if (!s.alive) return false;
  }
  runDue();
  if (!s.alive) return false;

  // 3. Decide on the major (choice) event first so that regular events leave room for it
  let wantMajor = !choiceEvent && s.alive && el.major.length > 0 && chance(s.rng, TUNING.majorRate * majorRateFor(s.age));
  if (wantMajor && entries >= cap) wantMajor = false;
  reserve = wantMajor ? 1 : 0;

  // 4. Regular weighted events
  let n = drawRegularCount(s);
  const pool = el.regular.slice();
  while (n > 0 && pool.length && entries + (wantMajor ? 1 : 0) < cap) {
    const ev = pickWeighted(s, h, pool, TUNING.nullWeight);
    if (!ev) { n--; continue; }
    pool.splice(pool.indexOf(ev), 1);
    if (!isEligible(s, h, ev)) continue; // state may have changed after a previous event
    if (fireRegular(s, h, ev)) { entries++; n--; }
    if (!s.alive) return false;
  }
  runDue();
  if (!s.alive) return false;

  // 5. The major event (one reserved by a follow-up or a milestone is presented first)
  if (choiceEvent && s.alive) {
    // other events of this year may have moved the person since the milestone was drawn (a new city, a new country)
    if (reservedByChance && !isEligible(s, h, choiceEvent)) choiceEvent = null;
    else if (!presentChoice(s, h, choiceEvent)) choiceEvent = null;
  } else if (wantMajor && s.alive) {
    const cands = el.major.filter((ev) => isEligible(s, h, ev));
    // a repeat with nothing new to say is skipped: try another candidate
    while (cands.length && !choiceEvent) {
      const ev = pickWeighted(s, h, cands);
      if (!ev) break;
      cands.splice(cands.indexOf(ev), 1);
      if (presentChoice(s, h, ev)) choiceEvent = ev;
      if (!s.alive) return false;
    }
  }

  // 6. Ordinary year
  if (!s.alive) return false;
  let notable = false;
  for (let i = s.log.length - 1; i >= 0 && s.log[i].year === s.year; i--) {
    const k = s.log[i].kind;
    if (k === 'event' || k === 'choice' || k === 'milestone') { notable = true; break; }
  }
  if (!notable) yearlyEntry(s, h);
  return !!s.flags._choice;
}
