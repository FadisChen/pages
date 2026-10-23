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
import { STAT_KEYS, applyDelta, pushLog, addHighlight } from './systems.js';
import { rand, randInt, weightedIndex, chance, hash01 } from './rng.js';
import { focusEventMult } from './focus.js';

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
    if (ev.cooldown !== undefined && !(Number.isInteger(ev.cooldown) && ev.cooldown >= 0)) errors.push(`${w}: cooldown must be a non-negative integer`);
    if (ev.once === false && ev.chance === undefined && ev.cooldown === undefined) { /* allowed: repeatable with no cooldown */ }
    checkEffects(w, ev.effects);
    checkSchedule(w, ev.schedule);
    checkFlags(w, ev.set, 'set');
    checkFlags(w, ev.unset, 'unset');
    if (ev.major && !(ev.choices && ev.choices.length)) errors.push(`${w}: major events need choices`);
    if (ev.choices !== undefined) {
      if (!Array.isArray(ev.choices) || ev.choices.length < 2 || ev.choices.length > 3) errors.push(`${w}: choices must have 2-3 items`);
      else ev.choices.forEach((c, i) => {
        const cw = `${w} choice ${i}`;
        if (typeof c.label !== 'string' || !c.label) errors.push(`${cw}: missing label`);
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
  const entry = pushLog(s, ev.milestone ? 'milestone' : 'event', ev.title, text, delta);
  entryFirst(s, from, entry);
  deathLast(s, from); // a death caused by the effects reads after the event's own narrative
  return entry;
}

/**
 * Present a major event: log its setup text and store the choice for the UI. Event-level `effects`, `set`
 * and `unset` apply now (the situation itself has consequences); event-level `schedule` is queued when
 * the choice is resolved, together with the chosen option's own follow-ups.
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
  const from = s.log.length;
  const delta = applyEffects(s, h, ev.effects);
  applyFlags(s, ev);
  const entry = pushLog(s, 'event', ev.title, text, delta);
  entryFirst(s, from, entry);
  deathLast(s, from);
  if (s.alive) s.flags._choice = { eventId: ev.id, title: ev.title, text, options };
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
  const delta = applyEffects(s, h, ch.effects);
  applyFlags(s, ch);
  scheduleFollowUps(s, ch.schedule);
  scheduleFollowUps(s, ev.schedule); // event-level follow-ups of a choice event
  const result = ch.result === undefined ? '' : freshResult(s, ev, opt.index, str(ch.result, s, h));
  addHighlightFrom(s, h, ch, result || ch.label);
  if (!ch.highlight) addHighlightFrom(s, h, ev, result || ev.title);
  const entry = pushLog(s, 'choice', ch.label, result, delta);
  entryFirst(s, from, entry);
  deathLast(s, from); // a death caused by the choice reads after its result text
  return entry;
}

/** Pick an option index for auto-play, weighted by each choice's `ai` (number or function). */
export function autoPickIndex(s, h) {
  const pc = s.flags._choice;
  if (!pc) return -1;
  const ev = BY_ID.get(pc.eventId);
  const ws = pc.options.map((o) => {
    const ai = ev.choices[o.index].ai;
    if (ai === undefined) return 1;
    if (typeof ai === 'function') { try { return Math.max(0, +ai(s, h) || 0); } catch (e) { return 1; } }
    return ai;
  });
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
  const pick = pickYearly(s, h);
  const text = pick ? renderText(s, h, pick.t, pick.key).list[0] : '平凡的一年悄悄過去。';
  return pushLog(s, 'year', `${s.age} 歲`, text);
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
