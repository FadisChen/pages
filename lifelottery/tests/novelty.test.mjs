// Phase 5C: cross-life novelty and text variants.
//   * no novelty (or an empty one) changes nothing; variants never change which events fire
//   * novelty survives save / resume; milestones, chance, world events and follow-ups are left alone
//   * a player's 10 consecutive lives repeat far less (same event AND same words) than in the game without novelty / variants
//   * every variant is a well-formed, state-neutral text that passes the coherence audit
//   * storage: lifelottery.seenEvents, blocked storage, migration from an album
// Run with: node --test tests/novelty.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import ALL_EVENTS, { VARIANTS } from '../js/data/events/index.js';
import YEARLY from '../js/data/yearly.js';
import { isNoveltyExempt, noveltyFactor, sanitizeNovelty, NOVELTY } from '../js/engine/events.js';
import { createLife, advanceYear, serialize, deserialize } from '../js/engine/life.js';
import { makeHelpers } from '../js/engine/helpers.js';
import { install, playAudited, runAudit, lifeConfigs, groupFlags } from './lib/coherence.mjs';
import * as store from '../js/storage.js';

const BY_ID = new Map(ALL_EVENTS.map((e) => [e.id, e]));
const VARIANT_EVENTS = ALL_EVENTS.filter((e) => e.variants);
const BAD = /undefined|NaN|\[object|null/;

function playOut(settings, seed, opts = {}) {
  const s = createLife(settings, seed, opts);
  let g = 0;
  while (s.alive && g++ < 130) advanceYear(s, { auto: true });
  return s;
}

/** The life without any wording: what happened, when, and the random generator at the end. */
const flow = (s) => JSON.stringify({ ...s, log: s.log.map((e) => ({ ...e, text: undefined })), highlights: undefined, novelty: undefined, flags: { ...s.flags, _rt: undefined, _rtv: undefined } });

/** Run `fn` as the game was before Phase 5C: no event has variants and no yearly line has them either. */
function withoutVariants(fn) {
  const saved = [];
  for (const e of [...ALL_EVENTS, ...YEARLY]) if (e.variants) { saved.push([e, e.variants]); delete e.variants; }
  try { return fn(); } finally { for (const [e, v] of saved) e.variants = v; }
}

// ---------------------------------------------------------------------------------------------
// 1. Formula and bookkeeping
// ---------------------------------------------------------------------------------------------

test('novelty factor: max(0.4, 1 / (1 + 0.45 x count))', () => {
  assert.equal(noveltyFactor(0), 1);
  assert.ok(Math.abs(noveltyFactor(1) - 1 / 1.45) < 1e-12);
  assert.ok(Math.abs(noveltyFactor(2) - 1 / 1.9) < 1e-12);
  assert.equal(noveltyFactor(3), 1 / (1 + 0.45 * 3) > 0.4 ? 1 / (1 + 0.45 * 3) : 0.4);
  assert.equal(noveltyFactor(10), 0.4);
  assert.equal(noveltyFactor(500), NOVELTY.floor);
});

test('sanitizeNovelty keeps valid ids with positive integer counts and nothing else', () => {
  assert.equal(sanitizeNovelty(null), null);
  assert.equal(sanitizeNovelty({}), null);
  assert.equal(sanitizeNovelty([1, 2]), null);
  assert.deepEqual(sanitizeNovelty({ health_dental: 2, 'yearly:7': 1, 'Bad Id': 3, zero: 0, neg: -2, nan: 'x', frac: 2.7 }), { health_dental: 2, 'yearly:7': 1, frac: 2 });
  assert.equal(sanitizeNovelty({ a_b: 1e9 }).a_b, NOVELTY.maxCount);
});

test('the exempt classes: milestones, chance, world events, follow-ups and chains are not weighted', () => {
  for (const e of ALL_EVENTS) {
    if (e.milestone || e.chance !== undefined || e.weight === 0 || e.id.startsWith('world_') || (e.tags || []).some((t) => ['world', 'era', 'followup', 'chain', 'milestone'].includes(t))) {
      assert.ok(isNoveltyExempt(e.id), `${e.id} must be exempt`);
    }
  }
  for (const id of ['health_flu_season', 'family_neighbor_help', 'seed_accident', 'regional_festival']) assert.ok(!isNoveltyExempt(id), `${id} is an ordinary event`);
  assert.ok(ALL_EVENTS.filter((e) => !isNoveltyExempt(e.id)).length > 300, 'most of the content is ordinary');
});

// ---------------------------------------------------------------------------------------------
// 2. Without novelty nothing changes
// ---------------------------------------------------------------------------------------------

test('same seed with no novelty and with an empty novelty: identical lives (state, log, rng)', () => {
  for (let i = 0; i < 80; i++) {
    const settings = { era: ['past', 'present', 'future'][i % 3], drawMode: i % 2 ? 'population' : 'births' };
    const a = playOut(settings, `nov-same-${i}`);
    const b = playOut(settings, `nov-same-${i}`, { novelty: {} });
    const c = playOut(settings, `nov-same-${i}`, { novelty: null });
    assert.equal(serialize(a), serialize(b), `empty novelty changed life ${i}`);
    assert.equal(serialize(a), serialize(c));
    assert.ok(!('novelty' in a), 'no novelty key without novelty');
  }
});

test('variants only change the words: the events, choices, effects and random numbers are the same as without them', () => {
  for (let i = 0; i < 120; i++) {
    const settings = { era: ['past', 'present', 'future'][i % 3], drawMode: 'births' };
    const withV = playOut(settings, `nov-flow-${i}`, i % 3 ? { novelty: { health_flu_season: 2, regional_festival: 1, 'yearly:30': 1 } } : {});
    const without = withoutVariants(() => playOut(settings, `nov-flow-${i}`, i % 3 ? { novelty: { health_flu_season: 2, regional_festival: 1, 'yearly:30': 1 } } : {}));
    assert.equal(flow(withV), flow(without), `life ${i}: variants changed what happens`);
  }
  // ... and they do change the wording
  let differing = 0;
  for (let i = 0; i < 40; i++) {
    const a = playOut({ era: 'present' }, `nov-words-${i}`);
    const b = withoutVariants(() => playOut({ era: 'present' }, `nov-words-${i}`));
    if (JSON.stringify(a.log) !== JSON.stringify(b.log)) differing++;
  }
  assert.ok(differing >= 30, `variants should show up in most lives (${differing}/40)`);
});

test('a repeatable event never repeats its words within a life, variants or not', () => {
  for (let i = 0; i < 150; i++) {
    const s = playOut({ era: 'present' }, `nov-dup-${i}`, { novelty: { health_flu_season: 1, regional_festival: 1, health_dental: 1, family_neighbor_help: 1 } });
    const seen = new Set();
    for (const e of s.log) {
      if (e.kind !== 'event') continue;
      const key = `${e.title}|${e.text}`;
      assert.ok(!seen.has(key), `life ${i}: "${e.title}" said the same thing twice at ${e.age}`);
      seen.add(key);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// 3. Novelty in play
// ---------------------------------------------------------------------------------------------

test('novelty survives save and resume, and a resumed life continues exactly like an uninterrupted one', () => {
  const novelty = { health_flu_season: 3, seed_checkup: 1, 'yearly:12': 2 };
  const s1 = createLife({ era: 'present' }, 'nov-resume', { countryCode: 'TWN', novelty });
  assert.deepEqual(s1.novelty, novelty);
  for (let i = 0; i < 30 && s1.alive; i++) advanceYear(s1, { auto: true });
  const s2 = deserialize(serialize(s1));
  assert.deepEqual(s2.novelty, novelty);
  let g = 0;
  while ((s1.alive || s2.alive) && g++ < 130) { advanceYear(s1, { auto: true }); advanceYear(s2, { auto: true }); }
  assert.equal(serialize(s1), serialize(s2));
  // saves from before Phase 5C have no novelty and still load; a damaged one is dropped
  const old = JSON.parse(serialize(playOut({ era: 'present' }, 'nov-old', { countryCode: 'TWN' })));
  assert.ok(!('novelty' in deserialize(old)));
  assert.ok(!('novelty' in deserialize({ ...old, novelty: 'garbage' })));
  assert.deepEqual(deserialize({ ...old, novelty: { bad_id: 2, 'No Good': 4 } }).novelty, { bad_id: 2 });
});

test('heavy novelty does not touch milestones, chance events and world events', () => {
  const exempt = ALL_EVENTS.filter((e) => isNoveltyExempt(e.id) && (e.chance !== undefined || e.milestone || e.id.startsWith('world_'))).map((e) => e.id);
  const heavy = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, 50]));
  const count = (novelty) => {
    let n = 0, lives = 0;
    for (let i = 0; i < 500; i++) {
      const s = playOut({ era: ['past', 'present', 'future'][i % 3] }, `nov-exempt-${i}`, novelty ? { novelty } : {});
      lives++;
      for (const id of exempt) if (s.seen[id] !== undefined) n++;
    }
    return n / lives;
  };
  const base = count(null), nov = count(heavy);
  assert.ok(Math.abs(nov - base) / base < 0.05, `exempt events per life: ${base.toFixed(2)} without novelty, ${nov.toFixed(2)} with everything "seen 50 times"`);
});

// ---------------------------------------------------------------------------------------------
// 4. Repetition over ten consecutive lives
// ---------------------------------------------------------------------------------------------

/** Ten lives of one player. Returns how many ordinary event firings of lives 2-10 repeat an earlier life (same event / same words). */
function tenLives(player, { novelty, country, era }) {
  const counts = {};
  const saidBefore = new Set();
  let firings = 0, sameEvent = 0, sameWords = 0, yearly = 0, yearlySame = 0;
  for (let k = 0; k < 10; k++) {
    const opts = { countryCode: country };
    if (novelty) opts.novelty = counts;
    const { s, rows } = playAudited({ era }, `rep-${player}-${k}`, opts);
    const lifeKeys = new Set();
    for (const { entry, id } of rows) {
      if (entry.kind !== 'event' || id.startsWith('sys:') || id.startsWith('yearly:') || !BY_ID.has(id) || isNoveltyExempt(id)) continue;
      const key = `${id}|${entry.text}`;
      if (k > 0) { firings++; if (counts[id]) sameEvent++; if (saidBefore.has(key)) sameWords++; }
      lifeKeys.add(key);
    }
    for (const id of Object.keys(s.seen)) {
      if (id.startsWith('yearly:') && k > 0) { yearly++; if (counts[id]) yearlySame++; }
    }
    for (const key of lifeKeys) saidBefore.add(key);
    for (const id of Object.keys(s.seen)) counts[id] = (counts[id] || 0) + 1;
  }
  return { firings, sameEvent, sameWords, yearly, yearlySame };
}

test('ten consecutive lives: repeated ordinary events (same event, same words) drop by at least 30% against the game without novelty', () => {
  install();
  const setups = [['TWN', 'present'], ['USA', 'present'], ['NGA', 'present'], ['BRA', 'past']];
  const PLAYERS = 8;
  const sum = () => ({ firings: 0, sameEvent: 0, sameWords: 0, yearly: 0, yearlySame: 0 });
  const base = sum(), nov = sum();
  const add = (t, r) => { for (const k of Object.keys(t)) t[k] += r[k]; };
  const perSetup = [];
  for (const [country, era] of setups) {
    const b = sum(), n = sum();
    for (let p = 0; p < PLAYERS; p++) {
      add(b, withoutVariants(() => tenLives(p, { novelty: false, country, era })));
      add(n, tenLives(p, { novelty: true, country, era }));
    }
    perSetup.push(`${country}/${era}: words ${(b.sameWords / b.firings).toFixed(3)} -> ${(n.sameWords / n.firings).toFixed(3)} (${(100 * (1 - n.sameWords / n.firings / (b.sameWords / b.firings))).toFixed(0)}%)`);
    add(base, b); add(nov, n);
  }
  const rate = (t, k) => t[k] / t.firings;
  const words = 1 - rate(nov, 'sameWords') / rate(base, 'sameWords'); // the same event with the very same words, against the game as it was
  const events = 1 - rate(nov, 'sameEvent') / rate(base, 'sameEvent');
  console.log(`  repeated events, lives 2-10: ${(100 * rate(base, 'sameEvent')).toFixed(1)}% before; after: same event ${(100 * rate(nov, 'sameEvent')).toFixed(1)}% (-${(100 * events).toFixed(1)}%), same event and words ${(100 * rate(nov, 'sameWords')).toFixed(1)}% (-${(100 * words).toFixed(1)}%)`);
  console.log(`  ${perSetup.join(' | ')}`);
  assert.ok(events > 0.02, `the same event must come back less often (${(100 * events).toFixed(1)}%)`);
  assert.ok(words >= 0.3, `repeated events (same event, same words) fell only ${(100 * words).toFixed(1)}%`);
  // the "ordinary year" lines rotate too
  assert.ok(nov.yearlySame / nov.yearly < base.yearlySame / base.yearly, 'ordinary-year lines repeat less across lives');
});

// ---------------------------------------------------------------------------------------------
// 5. The variants themselves
// ---------------------------------------------------------------------------------------------

test('variants: at least 60 events, each with 2-3 extra phrasings, all targets exist and are ordinary events', () => {
  assert.ok(VARIANT_EVENTS.length >= 60, `${VARIANT_EVENTS.length} events have variants`);
  assert.equal(Object.keys(VARIANTS).length, VARIANT_EVENTS.length, 'a variants.js key names an event that does not exist');
  for (const e of VARIANT_EVENTS) {
    assert.ok(e.variants.length >= 2 && e.variants.length <= 3, `${e.id} has ${e.variants.length} variants`);
    assert.ok(!isNoveltyExempt(e.id), `${e.id} is not an ordinary event`);
  }
  assert.ok(YEARLY.filter((y) => y.variants).length >= 8, 'some ordinary-year lines have variants as well');
});

let POOL = null;
function pool() {
  if (POOL) return POOL;
  POOL = [];
  for (let i = 0; POOL.length < 1500; i++) {
    const s = createLife({ era: ['past', 'present', 'future'][i % 3], drawMode: 'births' }, `nov-pool-${i}`);
    let g = 0;
    while (s.alive && g++ < 130) { advanceYear(s, { auto: true }); if (s.alive && s.age % 9 === 4) POOL.push(JSON.parse(JSON.stringify(s))); }
  }
  return POOL;
}

test('variants: well-formed (60-160 characters, no placeholders), no random numbers, no state changes, fit the same states as the event', () => {
  const problems = [];
  const lens = [];
  let rendered = 0;
  for (const st of pool()) {
    for (const ev of VARIANT_EVENTS.concat(YEARLY.filter((y) => y.variants))) {
      const [a, b] = ev.ages || [0, 120];
      if (st.age < a || st.age > b) continue;
      const h0 = makeHelpers(st);
      let fits = true;
      try { if (ev.cond) fits = !!ev.cond(st, h0); } catch (e) { fits = false; }
      if (!fits) continue;
      ev.variants.forEach((v, i) => {
        const s = JSON.parse(JSON.stringify(st));
        const before = JSON.stringify(s);
        const h = makeHelpers(s);
        const id = `${ev.id || 'yearly'}#v${i + 1}`;
        try {
          const t = typeof v === 'function' ? v(s, h) : v;
          rendered++;
          if (typeof t !== 'string' || !t.trim() || BAD.test(t)) problems.push(`${id}: bad string ${JSON.stringify(t)}`);
          else {
            const n = [...t].length;
            lens.push(n);
            const [lo, hi] = ev.id ? [60, 160] : [40, 140]; // events: the 60-160 rule; one-line ordinary-year texts are shorter
            if (n < lo || n > hi) problems.push(`${id}: ${n} characters: ${t}`);
          }
          if (JSON.stringify(s) !== before) problems.push(`${id}: changed the state (random numbers or effects)`);
        } catch (e) { problems.push(`${id}: threw ${e.message}`); }
      });
    }
    if (problems.length > 12) break;
  }
  assert.deepEqual([...new Set(problems)].slice(0, 12), []);
  assert.ok(rendered > 3000, `only ${rendered} variant renderings were checked`);
});

test('variants pass the coherence audit: every phrasing, rotated through all positions, shows no text/state contradiction', () => {
  const ids = ALL_EVENTS.filter((e) => e.variants).map((e) => e.id);
  const configs = [];
  const base = lifeConfigs(1200, { prefix: 'novcoh' });
  base.forEach((c, i) => {
    const shift = i % 4; // count 0..3 rotates the phrasing used by every event with variants
    configs.push({ ...c, opts: { ...c.opts, novelty: shift ? Object.fromEntries(ids.map((id) => [id, shift])) : undefined } });
  });
  const res = runAudit(configs, {});
  const hard = res.flags.filter((f) => f.rule !== 'density' && f.rule !== 'dup_year');
  if (hard.length) {
    const lines = groupFlags(hard).slice(0, 12).map((g) => `${g.n}x ${g.rule} ${g.id} [${g.word}] ${g.sample.why} :: ${g.sample.sentence} (seed ${g.sample.seed})`);
    assert.fail(`${hard.length} contradictions:\n  ${lines.join('\n  ')}`);
  }
});

// ---------------------------------------------------------------------------------------------
// 6. Storage: lifelottery.seenEvents
// ---------------------------------------------------------------------------------------------

function summaryStub() {
  return { name: '測試', age: 50, statHistory: [{ age: 0, health: 80, happiness: 60, knowledge: 10, wealth: 50, social: 50 }] };
}

test('storage: record a life, read the counts back; ids and counts only', () => {
  store.clearSeenEvents();
  assert.deepEqual(store.loadSeenEvents(), {}, 'nothing known yet');
  const s1 = playOut({ era: 'present' }, 'nov-store-1', { countryCode: 'TWN' });
  const c1 = store.recordSeenEvents(s1);
  for (const id of Object.keys(s1.seen)) assert.equal(c1[id], 1);
  const s2 = playOut({ era: 'present' }, 'nov-store-2', { countryCode: 'TWN' });
  const c2 = store.recordSeenEvents(s2);
  const shared = Object.keys(s1.seen).filter((id) => s2.seen[id] !== undefined);
  assert.ok(shared.length > 5 && shared.every((id) => c2[id] === 2));
  const raw = JSON.parse(store.readRaw('lifelottery.seenEvents'));
  assert.equal(raw.v, 1);
  assert.equal(raw.lives, 2);
  assert.deepEqual(Object.keys(raw.counts).sort(), Object.keys(c2).sort());
  assert.deepEqual(store.loadSeenEvents(), raw.counts);
  // what is handed to createLife is accepted as is
  const s3 = createLife({ era: 'present' }, 'nov-store-3', { novelty: store.loadSeenEvents() });
  assert.ok(Object.keys(s3.novelty).length > 20);
  store.clearSeenEvents();
});

test('storage: damaged values are ignored; blocked storage keeps working from memory', () => {
  store.writeRaw('lifelottery.seenEvents', '{"v":1,"counts":{"health_dental":3,"x y":2,"neg":-1,"s":"a"}}');
  assert.deepEqual(store.loadSeenEvents(), { health_dental: 3 });
  store.writeRaw('lifelottery.seenEvents', 'not json');
  assert.deepEqual(store.loadSeenEvents(), {});
  store.clearSeenEvents();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  Object.defineProperty(globalThis, 'localStorage', { value: blocked, configurable: true, writable: true });
  try {
    const s = playOut({ era: 'present' }, 'nov-blocked', { countryCode: 'TWN' });
    assert.doesNotThrow(() => store.recordSeenEvents(s));
    const counts = store.loadSeenEvents();
    assert.ok(Object.keys(counts).length > 10, 'the session still remembers what it saw');
    assert.doesNotThrow(() => createLife({ era: 'present' }, 'nov-blocked-2', { novelty: counts }));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage;
    store.clearSeenEvents();
  }
});

test('storage: an album without seenEvents is migrated from meta.events; an old album starts from zero', () => {
  store.clearAlbum();
  store.clearSeenEvents();
  // old records: no event ids anywhere
  store.putRecord({ id: 'old1', savedAt: 1, summary: summaryStub(), meta: { drawMode: 'births' } });
  store.putRecord({ id: 'old2', savedAt: 2, summary: summaryStub() });
  assert.deepEqual(store.loadSeenEvents(), {});
  assert.equal(store.readRaw('lifelottery.seenEvents'), null, 'nothing to write for an album without ids');
  // records with ids
  store.putRecord({ id: 'new1', savedAt: 3, summary: summaryStub(), meta: { events: ['health_dental', 'seed_checkup', 'Bad Id', 'yearly:3'] } });
  store.putRecord({ id: 'new2', savedAt: 4, summary: summaryStub(), meta: { events: ['health_dental', 'family_anniversary'] } });
  assert.deepEqual(store.getRecord('new1').meta.events, ['health_dental', 'seed_checkup'], 'only valid ids, no ordinary-year lines');
  assert.deepEqual(store.loadSeenEvents(), { health_dental: 2, seed_checkup: 1, family_anniversary: 1 });
  assert.ok(store.readRaw('lifelottery.seenEvents'), 'derived once, then stored');
  // recording a life on top keeps what was derived
  const s = playOut({ era: 'present' }, 'nov-derive', { countryCode: 'TWN' });
  const counts = store.recordSeenEvents(s);
  assert.ok(counts.health_dental >= 2);
  // a fresh start clears the counts with the album
  store.clearAlbum();
  assert.equal(store.readRaw('lifelottery.seenEvents'), null);
  assert.deepEqual(store.loadSeenEvents(), {});
});

test('storage: a life recorded in the album and then counted is not counted twice (the order the game uses: count, then putRecord)', () => {
  store.clearAlbum();
  store.clearSeenEvents();
  const s = playOut({ era: 'present' }, 'nov-order', { countryCode: 'TWN' });
  const counts = store.recordSeenEvents(s);
  store.putRecord({ id: 'order1', savedAt: 1, summary: summaryStub(), meta: { events: store.eventIdsOfState(s) } });
  assert.ok(Object.values(counts).every((n) => n === 1));
  assert.ok(Object.values(store.loadSeenEvents()).every((n) => n === 1));
  assert.equal(JSON.parse(store.readRaw('lifelottery.seenEvents')).lives, 1);
  store.clearAlbum();
});
