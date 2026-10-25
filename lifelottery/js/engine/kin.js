// The family roster (Phase 7A): every sibling, every partner, the partner's parents and the person's own parents as individual people,
// each with a name, a gender, a birth year and a life that ends (a year and a cause).
//
//   state.kin = {
//     v: 1,
//     siblings:  [ { id, name, given, gender, birthYear, older, alive, deathYear, deathAge, cause, where, married, kids } ]   born siblings, oldest first
//     coming:    [ { id, name, given, gender, birthYear } ]      younger siblings who are not born yet (they join `siblings` in their birth year)
//     birthRoster: [ { id, name, given, gender, birthYear } ]    the family as it was planned at birth (birthOf() hands this to a replay)
//     partners:  [ { id, name, gender, birthYear, status, since, until, marriedYear, alive, deathYear, deathAge, cause, pool, cc, from } ]  every partner, oldest first
//     inLaws:    [ { id, rel: 'mother' | 'father', partnerId, name, given, gender, birthYear, alive, deathYear, deathAge, cause, cc, from } ]
//     cur: id of the partner entry that state.partner stands for,  year: last year processed,  nid: id counters,  dropped: planned siblings that did not fit
//     news: deaths not yet told in the log (kinAnnounce),  waited: how many years the news has been held back because the year was full
//   }
//   state.family.mother / father keep their place and get birthYear, deathYear, deathAge, cause and where beside alive / age / name.
//
// Randomness. NOTHING here touches `state.rng`. Every chance is a hash of the life (`hash01` of seed + purpose + person + year), like the
// memories (memory.js) and the household (systems.js): an independent, seed-derived stream that does not depend on how many other draws
// the life has made. So a life meets exactly the events it would have met without the roster; only the words about the family differ
// (see tests/kin.test.mjs "the protagonist's stream is untouched"). Three side effects of a kin death are the only things that can
// reach the protagonist, and each is neutralised on purpose:
//   * the log line (kind 'kin') is written at the END of the year, after the events (kinAnnounce, called by life.js): it cannot use up
//     the year's entry budget or replace the "ordinary year" draw, which are decided before. A quiet year's ordinary line is then
//     replaced by it, and a year that already holds four lines holds the news back (at most two years);
//   * the memory is `quiet` (memory.js): never spoken by a reflection or an echo, kept outside the memory cap;
//   * grief is the one real feedback (stats move, so later conditions can see them): KIN_TUNING.grief switches it off.
// The parents and the current partner keep dying by the old rule (systems.js agePeople, drawn from `state.rng`); this module only
// records the year and the cause (hooks kinParentDied / syncPartner), so no protagonist stream moves.

import { BY_CODE } from '../data/countries.js';
import { eraView, incomeGroupAt } from '../data/eras.js';
import { causeWeights, CAUSES } from '../data/causes.js';
import { makeName, composeName, getPool, motherFamilyToken } from '../data/names.js';
import { lifeTable } from './mortality.js';
import { hash01, createRngState, weightedIndex, clamp } from './rng.js';
import { remember } from './memory.js';

export const KIN_VERSION = 1;

/** Switches (module-level, like events.js TUNING). `enabled: false` turns the whole roster off (tests: a life without kin as the control). */
export const KIN_TUNING = {
  enabled: true,
  grief: true,          // a sibling's or in-law's death moves happiness / social by a few points (the only feedback into the protagonist's life)
  quietMemories: true,  // kin memories are kept but never spoken by a reflection or an echo (see memory.js `quiet`)
  siblingMax: 11,       // same cap as birth.js
  holdYears: 2,         // a year that already holds four lines holds the news of a kin death back, at most this many years
};

// ---------------------------------------------------------------------------------------------
// Small tools: the independent stream
// ---------------------------------------------------------------------------------------------

const ukey = (s, ...p) => `${s.seed}|kin|${p.join('|')}`;
/** Uniform [0,1) for (purpose, ...ids): the same answer for the same life, whatever else happens. */
const u01 = (s, ...p) => hash01(ukey(s, ...p));
/** A sequence of uniform numbers for one purpose (names): the i-th call is hash01(key#i). */
function seq(s, ...p) {
  const base = ukey(s, ...p);
  let i = 0;
  return () => hash01(`${base}#${i++}`);
}
function gauss(s, ...p) {
  const a = Math.max(u01(s, ...p, 'a'), 1e-9), b = u01(s, ...p, 'b');
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}
/** Poisson draw from one uniform number (inversion), capped. */
function poissonOf(u, lambda, cap) {
  let k = 0, p = Math.exp(-lambda), c = p;
  while (u > c && k < cap) { k++; p *= lambda / k; c += p; }
  return k;
}

const countryOf = (code) => BY_CODE[code] || BY_CODE[Object.keys(BY_CODE)[0]];
const tableFor = (cc, gender, birthYear) => lifeTable(countryOf(cc), gender, birthYear);
const qAt = (table, idx) => table.q[clamp(Math.floor(idx), 0, 120)];

/** Cause of death for a relative: the same cause tables as the protagonist, drawn from the person's own hash stream. */
function causeFor(s, id, { cc, gender, age, year }) {
  const country = countryOf(cc);
  const ps = { age: Math.max(0, age), year, gender, flags: {}, conditions: [], smoker: false, family: { wealthQ: s.family.wealthQ } };
  const w = causeWeights(ps, country, eraView(country, year), s.settings.era);
  const ids = Object.keys(w);
  const i = weightedIndex(createRngState(ukey(s, 'cause', id)), ids.map((x) => w[x]));
  return i < 0 ? 'other' : ids[i];
}

export const causeLabelOf = (id) => (id ? (CAUSES[id] || CAUSES.other).label : '');

/** 哥哥 / 姊姊 / 弟弟 / 妹妹 */
export const sibWord = (x) => (x.older ? (x.gender === 'M' ? '哥哥' : '姊姊') : (x.gender === 'M' ? '弟弟' : '妹妹'));
const pron = (x) => (x.gender === 'M' ? '他' : '她');

// ---------------------------------------------------------------------------------------------
// The family at birth
// ---------------------------------------------------------------------------------------------

function newSibling(e, protagonistBirthYear) {
  return {
    id: e.id, name: e.name, given: e.given, gender: e.gender, birthYear: e.birthYear, older: e.birthYear < protagonistBirthYear,
    alive: true, deathYear: null, deathAge: null, cause: null, where: 'with_you', married: false, kids: 0,
  };
}

/**
 * Plan the children of the mother: `N` siblings (the number the birth lottery drew, so family sizes are the old ones) are placed before
 * and after the person in birth order. Gaps between births follow the country's TFR; the first child comes at about 22 and the last by 44,
 * so a young mother has few older siblings and an old one few younger ones. A mother who is dead at the birth has only older children.
 * Returns [{ id, name, given, gender, birthYear }] oldest first (the person is not in the list) and how many did not fit.
 */
function planSiblings(s, N) {
  const home = countryOf(s.homeCountryCode);
  const tfr = eraView(home, s.birthYear).tfr;
  const m = s.family.mother;
  const A = m.age - s.age;                      // her age when the person was born
  const motherAtBirth = motherAliveIn(s, s.birthYear); // (alive then, whatever happened since: a life that is being derived from an old save)
  const gapMean = clamp(2.5 + 0.35 * (2.2 - tfr), 2, 3.4);
  const muFirst = clamp(22.5 - (tfr - 2.5), 19, 25);
  const gapAt = (i, tight) => Math.max(1, Math.round(gapMean + 0.9 * gauss(s, 'gap', i)) - tight);
  let chosen = null;
  for (let n = N; n > 0 && !chosen; n--) {
    for (let tight = 0; tight <= 2 && !chosen; tight++) {
      const gaps = Array.from({ length: n }, (_, i) => gapAt(i, tight));
      const w = [];
      for (let k = 0; k <= n; k++) {
        let before = 0, after = 0;
        for (let i = 0; i < k; i++) before += gaps[i];
        for (let i = k; i < n; i++) after += gaps[i];
        const first = A - before, last = A + after;
        const ok = first >= 16 && (k === n || last <= 44) && (motherAtBirth || k === n);
        w.push(ok ? Math.max(1e-6, Math.exp(-((first - muFirst) ** 2) / 18)) : 0);
      }
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      let r = u01(s, 'split', n) * total, k = 0;
      for (; k < n; k++) { if (r < w[k]) break; r -= w[k]; }
      chosen = { n, gaps, k };
    }
  }
  if (!chosen) return { list: [], dropped: N };
  const { n, gaps, k } = chosen;
  // birth years: children 0..n in birth order, the person is child k
  const years = new Array(n + 1);
  years[k] = s.birthYear;
  for (let j = k - 1; j >= 0; j--) years[j] = years[j + 1] - gaps[j];
  for (let j = k + 1; j <= n; j++) years[j] = years[j - 1] + gaps[j - 1];
  const list = [];
  const taken = new Set([s.name.full, s.family.mother.name, s.family.father.name]);
  let seqNo = 0;
  for (let j = 0; j <= n; j++) {
    if (j === k) continue;
    const id = `s${++seqNo}`;
    const srb = eraView(home, years[j]).srb;
    const gender = u01(s, 'gender', id) < srb / (100 + srb) ? 'M' : 'F';
    const nm = siblingName(s, id, gender, taken);
    taken.add(nm.full);
    list.push({ id, name: nm.full, given: nm.given, gender, birthYear: years[j] });
  }
  return { list, dropped: N - n };
}

/** A name from the family's culture group carrying the family's name token (patronymic and syllabic cultures follow childFamilyToken). */
function siblingName(s, id, gender, taken) {
  const pool = s.flags._pool || 'en_us';
  const mode = getPool(pool).mode;
  const famTok = mode === 'syll' ? null : (typeof s.flags._ft === 'string' ? s.flags._ft : null);
  let nm;
  for (let t = 0; t < 14; t++) {
    nm = makeName(pool, gender, seq(s, 'name', id, t), famTok);
    if (!taken.has(nm.full)) break;
  }
  return nm;
}

/** The family a replay carries over (birthOf().kin): only entries that make sense for this birth year. */
function listFromBirthKin(s, bk) {
  if (!bk || !Array.isArray(bk.siblings)) return null;
  const list = [];
  bk.siblings.slice(0, KIN_TUNING.siblingMax).forEach((e, i) => {
    if (!e || typeof e.name !== 'string' || (e.gender !== 'M' && e.gender !== 'F') || !Number.isInteger(e.birthYear)) return;
    list.push({ id: `s${i + 1}`, name: e.name, given: typeof e.given === 'string' && e.given ? e.given : e.name, gender: e.gender, birthYear: e.birthYear });
  });
  return list;
}

function parentFields(s, noticing = false) {
  const lived = s.age;
  for (const who of ['mother', 'father']) {
    const p = s.family[who];
    const ageAtBirth = p.age - lived;
    if (!Number.isFinite(p.birthYear)) p.birthYear = s.birthYear - ageAtBirth;
    if (p.where === undefined) p.where = p.alive ? 'with_you' : '';
    if (p.alive) { p.deathYear = null; p.deathAge = null; p.cause = null; continue; }
    if (p.deathYear == null) {
      // a parent who is already dead: the log knows the year (title '母親過世' / '父親過世'); one who was dead at the birth died in the birth year
      const title = who === 'mother' ? '母親過世' : '父親過世';
      const e = s.log.find((x) => x.title === title);
      p.deathYear = e ? e.year : noticing ? s.year : s.birthYear;
      p.deathAge = ageAtBirth + (p.deathYear - s.birthYear);
    }
    if (!p.cause) p.cause = causeFor(s, who, { cc: s.homeCountryCode, gender: who === 'mother' ? 'F' : 'M', age: Math.max(0, (p.deathAge ?? ageAtBirth) - 1), year: p.deathYear });
  }
}

/** Build the roster of a life that has none (a new life, an old save). Never reads or writes `state.rng`. */
function buildKin(s, birthKin) {
  const k = s.kin = {
    v: KIN_VERSION, siblings: [], coming: [], birthRoster: [], partners: [], inLaws: [], cur: null, nid: { s: 0, p: 0, l: 0 }, year: s.birthYear, dropped: 0, news: [], waited: 0,
  };
  parentFields(s);
  let list = listFromBirthKin(s, birthKin);
  if (list === null) {
    const plan = planSiblings(s, clamp(Math.round(s.family.siblings) || 0, 0, KIN_TUNING.siblingMax));
    list = plan.list;
    k.dropped = plan.dropped;
  }
  k.nid.s = list.length;
  for (const e of list) {
    k.birthRoster.push({ id: e.id, name: e.name, given: e.given, gender: e.gender, birthYear: e.birthYear });
    if (e.birthYear < s.birthYear) k.siblings.push(newSibling(e, s.birthYear));
    else k.coming.push({ id: e.id, name: e.name, given: e.given, gender: e.gender, birthYear: e.birthYear });
  }
  k.siblings.sort((a, b) => a.birthYear - b.birthYear);
  k.coming.sort((a, b) => a.birthYear - b.birthYear);
  return k;
}

/** At the start of a life (life.js createLife). `birthKin` is the roster a replay carries (birthOf().kin), or undefined. */
export function initKin(s, birthKin) {
  if (!KIN_TUNING.enabled) return null;
  buildKin(s, birthKin);
  refreshFacts(s, null);
  return s.kin;
}

/**
 * The roster of a state, derived from the numbers it has when it has none (an old save): the siblings from `family.siblings`, the
 * parents' years from the log, the current partner from `state.partner`, then every year lived so far is replayed from the hash stream,
 * silently. A new life has it from createLife. Never consumes random numbers.
 */
export function ensureKin(s) {
  if (!KIN_TUNING.enabled) return null;
  if (s.kin && s.kin.v === KIN_VERSION) return s.kin;
  const k = buildKin(s, null);
  syncPartnerIn(s, k);
  catchUp(s, s.year, null);
  refreshFacts(s, null);
  return k;
}

// ---------------------------------------------------------------------------------------------
// Partners and in-laws
// ---------------------------------------------------------------------------------------------

function addPartnerEntry(s, k, pt) {
  const e = {
    id: `p${++k.nid.p}`, name: pt.name, gender: pt.gender, birthYear: s.year - pt.age, status: 'dating', since: Number.isFinite(pt.since) ? pt.since : s.year,
    until: null, marriedYear: null, alive: true, deathYear: null, deathAge: null, cause: null,
    pool: s.flags._partnerPool || s.flags._pool || 'en_us', cc: s.countryCode, ft: s.flags._partnerFt ?? null, gt: s.flags._partnerGt ?? null,
    from: Number.isFinite(pt.since) ? Math.min(pt.since, s.year) : s.year,
  };
  k.partners.push(e);
  return e;
}

/** The two parents of a partner, created when the marriage begins: names from the partner's culture group, alive or not by the life tables. */
function makeInLaws(s, k, e) {
  const pool = e.pool;
  const cc = e.cc;
  const country = countryOf(cc);
  const tfr = eraView(country, e.birthYear).tfr;
  const marriage = e.marriedYear ?? s.year;
  const r = seq(s, 'inlaw-names', e.id);
  const mode = getPool(pool).mode;
  let fatherNm, motherNm;
  if (mode === 'syll') {
    fatherNm = makeName(pool, 'M', r);
    motherNm = makeName(pool, 'F', r);
  } else {
    const gp = getPool(pool);
    const ft = typeof e.ft === 'string' ? e.ft : null;
    const fGiven = mode === 'patro' && ft ? ft : gp.M[Math.floor(r() * gp.M.length)];
    const fFam = mode === 'patro' ? gp.M[Math.floor(r() * gp.M.length)] : (ft ?? (gp.S && gp.S.length ? gp.S[Math.floor(r() * gp.S.length)] : ''));
    const mGiven = gp.F[Math.floor(r() * gp.F.length)];
    fatherNm = composeName(pool, 'M', fGiven, fFam);
    motherNm = composeName(pool, 'F', mGiven, motherFamilyToken(pool, ft ?? fFam, r));
  }
  const motherAge = Math.round(clamp(24.5 + 3.5 * clamp((2.4 - tfr) / 1.5, -1, 1.5) + 1.8 + 4.8 * gauss(s, 'inlaw-age', e.id, 'm'), 16, 44));
  const fatherAge = Math.round(clamp(motherAge + 3.5 + 3 * gauss(s, 'inlaw-age', e.id, 'f'), Math.max(18, motherAge - 3), motherAge + 16));
  const mk = (rel, nm, gender, ageAtBirth) => {
    const id = `l${++k.nid.l}`;
    const birthYear = e.birthYear - ageAtBirth;
    const x = {
      id, rel, partnerId: e.id, name: nm.full, given: nm.given, gender, birthYear, alive: true, deathYear: null, deathAge: null, cause: null, cc, from: marriage,
    };
    // alive at the wedding? One uniform number decides the whole lifetime (survival from the age at the partner's birth, by the life table)
    const table = tableFor(cc, gender, birthYear);
    const u = u01(s, 'inlaw-life', id);
    let g = 1;
    const ageAtWedding = marriage - birthYear;
    for (let a = ageAtBirth; a < ageAtWedding; a++) {
      g *= 1 - qAt(table, a);
      if (g <= u) { x.alive = false; x.deathAge = a + 1; x.deathYear = birthYear + a + 1; break; }
    }
    if (!x.alive) x.cause = causeFor(s, id, { cc, gender, age: x.deathAge - 1, year: x.deathYear });
    return x;
  };
  k.inLaws.push(mk('mother', motherNm, 'F', motherAge), mk('father', fatherNm, 'M', fatherAge));
}

function retire(s, e, status) {
  if (e.status === 'dating' || e.status === 'married') { e.status = status; if (e.until == null) e.until = s.year; }
}

function syncPartnerIn(s, k) {
  const pt = s.partner;
  const cur = k.cur ? k.partners.find((p) => p.id === k.cur) : null;
  if (!pt) { if (cur) retire(s, cur, 'ended'); k.cur = null; return; }
  let e = cur && cur.name === pt.name && cur.gender === pt.gender ? cur : null;
  const created = !e;
  if (!e) {
    if (cur) retire(s, cur, 'ended');
    e = addPartnerEntry(s, k, pt);
    k.cur = e.id;
  }
  const st = pt.status;
  if (st === 'dating') {
    if (e.status !== 'dating' && e.marriedYear == null) e.status = 'dating';
  } else if (st === 'married') {
    if (e.marriedYear == null) e.marriedYear = Number.isFinite(pt.since) ? Math.min(pt.since, s.year) : s.year;
    e.status = 'married';
    e.until = null;
  } else if (st === 'divorced') {
    if (e.marriedYear == null) e.marriedYear = Number.isFinite(pt.since) ? Math.min(pt.since, s.year) : e.since;
    if (e.status !== 'divorced') { e.status = 'divorced'; if (e.until == null) e.until = s.year; }
  } else if (st === 'widowed') {
    // (a partner met for the first time already widowed, i.e. in an old save: married if the life counts more marriages than the roster knows)
    if (created && e.marriedYear == null && (s.flags._married || 0) > k.partners.filter((p) => p !== e && p.marriedYear != null).length) e.marriedYear = Number.isFinite(pt.since) ? Math.min(pt.since, s.year) : e.since;
    if (e.alive) {
      e.alive = false;
      e.deathYear = s.year;
      e.deathAge = pt.age;
      e.cause = causeFor(s, e.id, { cc: e.cc, gender: e.gender, age: Math.max(0, pt.age - 1), year: s.year });
    }
    e.status = e.marriedYear != null ? 'widowed' : 'ended';
    if (e.until == null) e.until = e.deathYear;
  }
  if (e.marriedYear != null && !k.inLaws.some((x) => x.partnerId === e.id)) makeInLaws(s, k, e);
}

/**
 * Bring the partner history in line with `state.partner` (a new partner, a marriage, a break-up, a divorce, a death). Called by every
 * system that sets or ends a partner (systems.js) and once a year; cheap, idempotent, and it also repairs a state that was edited by hand.
 */
export function syncPartner(s) {
  if (!KIN_TUNING.enabled) return;
  const k = s.kin && s.kin.v === KIN_VERSION ? s.kin : ensureKin(s);
  if (k) syncPartnerIn(s, k);
}

/** A parent has just died (systems.js agePeople, drawn from the protagonist's stream): note the year, the age and the cause. */
export function kinParentDied(s, who) {
  if (!KIN_TUNING.enabled) return;
  const k = s.kin && s.kin.v === KIN_VERSION ? s.kin : ensureKin(s);
  const p = s.family[who];
  if (!k || p.deathYear != null) return;
  p.deathYear = s.year;
  p.deathAge = p.age;
  p.cause = causeFor(s, who, { cc: s.homeCountryCode, gender: who === 'mother' ? 'F' : 'M', age: Math.max(0, p.age - 1), year: s.year });
  p.where = '';
}

// ---------------------------------------------------------------------------------------------
// The years
// ---------------------------------------------------------------------------------------------

/** Under-five multiplier of a family's circumstances (the same terms as mortality.js rawRiskMultiplier; they average to 1 over the families of a country). */
function infantMult(s, view) {
  const wq = [1.5, 1.2, 1.0, 0.85, 0.7][s.family.wealthQ - 1] / 1.05;
  const u = view.urban / 100;
  const birthUrban = s.flags._birthUrban ?? s.urban;
  const urb = birthUrban ? 0.9 / (u * 0.9 + (1 - u) * 1.1) : 1.1 / (u * 0.9 + (1 - u) * 1.1);
  return clamp(wq * urb, 0.2, 6);
}

const motherAliveIn = (s, Y) => { const m = s.family.mother; return m.alive || (m.deathYear != null && Y < m.deathYear); };

/** Did the person die in year Y by the yearly hazard? `idx` is the age lived through (0 = the first year of life). */
function diesIn(s, x, Y, q) {
  return u01(s, 'death', x.id, Y) < Math.min(q, 1);
}

/**
 * One year of the roster for year Y: planned siblings are born (only while the mother is alive and not past 45), then every living
 * sibling, in-law and former partner faces the life table. Deaths are written onto the people; those of year Y that matter to the person
 * (siblings, the in-laws of the current partner) are pushed on `collect` when it is given.
 */
function processYear(s, Y, collect) {
  const k = s.kin;
  const home = countryOf(s.homeCountryCode);
  // 1. births
  if (k.coming.length) {
    const keep = [];
    for (const c of k.coming) {
      if (c.birthYear > Y) { keep.push(c); continue; }
      const mother = s.family.mother;
      const mAge = c.birthYear - (Number.isFinite(mother.birthYear) ? mother.birthYear : s.birthYear - (mother.age - s.age));
      if (motherAliveIn(s, c.birthYear) && mAge <= 45) k.siblings.push(newSibling(c, s.birthYear));
      else k.dropped++;
    }
    k.coming = keep;
    k.siblings.sort((a, b) => a.birthYear - b.birthYear);
  }
  // 2. siblings
  for (const x of k.siblings) {
    if (!x.alive || x.birthYear >= Y) continue;
    const idx = Y - 1 - x.birthYear;
    const table = tableFor(s.homeCountryCode, x.gender, x.birthYear);
    let q = qAt(table, idx);
    if (idx < 5) q *= infantMult(s, eraView(home, x.birthYear));
    if (idx >= 120 || diesIn(s, x, Y, q)) {
      refreshSibling(s, x, Y, null);
      const abroad = x.where === 'abroad';
      x.alive = false;
      x.deathYear = Y;
      x.deathAge = Y - x.birthYear;
      x.cause = causeFor(s, x.id, { cc: s.homeCountryCode, gender: x.gender, age: idx, year: Y });
      x.where = '';
      if (collect) collect.push({ type: 'sibling', person: x, infant: idx === 0, abroad });
    }
  }
  // 3. the partner's parents, and the partners the main stream does not age (a former partner)
  for (const x of k.inLaws) {
    if (!x.alive || Y <= x.from) continue;
    const idx = Y - 1 - x.birthYear;
    const q = qAt(tableFor(x.cc, x.gender, x.birthYear), idx);
    if (idx >= 120 || diesIn(s, x, Y, q)) {
      x.alive = false;
      x.deathYear = Y;
      x.deathAge = Y - x.birthYear;
      x.cause = causeFor(s, x.id, { cc: x.cc, gender: x.gender, age: idx, year: Y });
      const owner = k.partners.find((p) => p.id === x.partnerId);
      if (collect && owner && owner.id === k.cur && (owner.status === 'married' || owner.status === 'widowed')) collect.push({ type: 'inlaw', person: x, owner });
    }
  }
  for (const e of k.partners) {
    if (!e.alive || e.status === 'dating' || e.status === 'married' || Y <= (e.until ?? e.from)) continue;
    const idx = Y - 1 - e.birthYear;
    const q = qAt(tableFor(e.cc, e.gender, e.birthYear), idx);
    if (idx >= 120 || diesIn(s, e, Y, q)) {
      e.alive = false;
      e.deathYear = Y;
      e.deathAge = Y - e.birthYear;
      e.cause = causeFor(s, e.id, { cc: e.cc, gender: e.gender, age: idx, year: Y });
    }
  }
}

function catchUp(s, to, collect) {
  const k = s.kin;
  for (let y = k.year + 1; y <= to; y++) processYear(s, y, y === to ? collect : null);
  if (to > k.year) k.year = to;
}

// What a sibling's life holds besides being alive: when they marry, have children, leave home, go abroad. A pure function of the hash stream.
const planCache = new WeakMap();
function sibPlan(s, x) {
  let plan = planCache.get(x);
  if (!plan) { plan = computePlan(s, x); planCache.set(x, plan); }
  return plan;
}
function computePlan(s, x) {
  const home = countryOf(s.homeCountryCode);
  const inc = incomeGroupAt(home, x.birthYear + 25);
  const base = { L: [21, 25.5, 0.95], LM: [22, 26, 0.93], UM: [24, 27.5, 0.88], H: [28, 30, 0.8] }[inc] || [24, 27, 0.88];
  const ever = u01(s, 'sib-ever', x.id) < base[2];
  const mar = ever ? Math.max(16, Math.round(base[x.gender === 'F' ? 0 : 1] + 3 * gauss(s, 'sib-mar', x.id))) : null;
  const tfr = eraView(home, x.birthYear + 28).tfr;
  const n = mar == null ? 0 : poissonOf(u01(s, 'sib-kids', x.id), Math.max(0.3, tfr * 0.95), 6);
  const kidAges = [];
  let a = (mar ?? 0) + 1 + (u01(s, 'sib-k0', x.id) < 0.5 ? 0 : 1);
  for (let i = 0; i < n; i++) { kidAges.push(a); a += 2 + (u01(s, 'sib-kgap', x.id, i) < 0.5 ? 0 : 1); }
  const abroadP = { L: 0.1, LM: 0.12, UM: 0.08, H: 0.05 }[inc] ?? 0.08;
  const abroad = u01(s, 'sib-abroad', x.id) < abroadP ? 20 + Math.floor(u01(s, 'sib-abroad-at', x.id) * 16) : null;
  const out = Math.min(mar ?? 99, 19 + Math.floor(u01(s, 'sib-out', x.id) * 9));
  return { mar, kidAges, abroad, out };
}

function refreshSibling(s, x, Y, hh) {
  const age = Y - x.birthYear;
  const p = sibPlan(s, x);
  x.married = p.mar != null && age >= p.mar;
  x.kids = p.kidAges.reduce((n, a) => n + (a <= age ? 1 : 0), 0);
  if (!x.alive) { x.where = ''; return; }
  const abroadNow = s.countryCode !== s.homeCountryCode;
  const parentsAlive = s.family.mother.alive || s.family.father.alive;
  if (p.abroad != null && age >= p.abroad) x.where = 'abroad';
  else if (abroadNow) x.where = 'home_country';
  else if (hh ? hh.parents && age < p.out : parentsAlive && age < p.out && s.age < 17) x.where = 'with_you';
  else x.where = 'apart';
}

/** Marriage, children and where each living sibling and parent lives. `hh` is the household (systems.js ensureHousehold), or null at birth. */
function refreshFacts(s, hh) {
  const k = s.kin;
  for (const x of k.siblings) if (x.alive) refreshSibling(s, x, s.year, hh);
  const abroad = s.countryCode !== s.homeCountryCode;
  for (const who of ['mother', 'father']) {
    const p = s.family[who];
    p.where = !p.alive ? '' : hh ? (hh.parents ? 'with_you' : abroad ? 'home_country' : 'apart') : 'with_you';
  }
}

// ---------------------------------------------------------------------------------------------
// The yearly pass and its words
// ---------------------------------------------------------------------------------------------

/** The word for a partner's parent, from the couple's genders: 岳父 / 岳母 (a wife's parents), 公公 / 婆婆 (a husband's), else 伴侶的父親 / 母親. */
export function inLawTerm(s, owner, rel) {
  const father = rel === 'father';
  if (owner.gender === s.gender) return father ? '伴侶的父親' : '伴侶的母親';
  if (owner.gender === 'F') return father ? '岳父' : '岳母';
  return father ? '公公' : '婆婆';
}

const PHRASE = {
  neonatal: '早產與新生兒的病症', lri: '嚴重的肺炎', diarrhea: '嚴重腹瀉與脫水', malaria: '瘧疾', tb: '結核病', hiv: '愛滋病相關的併發症',
  malnutrition: '營養不良', road: '交通事故', drowning: '溺水意外', maternal: '生產時的併發症', cvd: '心臟病', stroke: '中風', cancer: '癌症',
  diabetes: '糖尿病的併發症', copd: '慢性肺病', dementia: '失智症', kidney: '腎臟疾病', liver: '肝臟疾病',
};

/** The end of "…的哥哥…" for a cause: "因中風過世了", "喪生於戰事", "過世了" (no cause worth naming). */
export function deathPredicate(cause, { infant = false } = {}) {
  if (cause === 'conflict') return '喪生於戰事';
  if (cause === 'homicide') return '喪生於一場暴力事件';
  if (cause === 'disaster') return '喪生於天災';
  if (PHRASE[cause]) return `因${PHRASE[cause]}${infant ? '離開了' : '過世了'}`;
  return infant ? '離開了' : '過世了'; // suicide and 'other': the cause stays in the roster, the line does not say it
}

const pickBy = (s, key, list) => list[Math.min(list.length - 1, Math.floor(u01(s, 'text', key) * list.length))];

function siblingLine(s, d) {
  const x = d.person;
  const word = sibWord(x), t = pron(x);
  const a = x.deathAge;
  const head = d.infant
    ? `你的${word}${x.given}還不滿一歲，就${deathPredicate(x.cause, { infant: true })}。`
    : `你的${word}${x.given}在${a}歲那年${deathPredicate(x.cause)}。`;
  const short = `你的${word}${x.given}也在這一年走了。`;
  const home = countryOf(s.homeCountryCode);
  const abroadYou = s.countryCode !== s.homeCountryCode;
  let tail;
  if (s.age < 7) tail = pickBy(s, `${x.id}a`, [`家裡忽然安靜了下來，你不太明白發生了什麼事，只是一直問大人${t}去哪裡了。`, '大人們都在哭，你還太小，只知道少了一個一起玩的人。']);
  else if (a < 13) tail = pickBy(s, `${x.id}b`, [`桌上少了一副碗筷，好一陣子，沒有人敢提起${t}的名字。`, `你把${t}的東西收進抽屜，過一會兒又忍不住拿出來看。`, '家裡安靜了很長一段時間。']);
  else if (d.abroad) tail = '消息是從很遠的地方傳來的，你們已經很久沒有見面了。';
  else if (abroadYou) tail = `消息從${home.name}傳來，你人在${countryOf(s.countryCode).name}，沒能趕回去送${t}最後一程。`;
  else if (x.older) tail = pickBy(s, `${x.id}d`, ['從小走在你前面的人，先走了。你一時不知道該怎麼面對這個空下來的位子。', `小時候你總跟在${t}後面跑，如今，那條路只剩你一個人走了。`, `葬禮上，大家輪流說起${t}的好，你只是安靜地站著。`]);
  else tail = pickBy(s, `${x.id}e`, ['你一直以為，該先離開的人是自己。', `你還記得${t}小時候跟在你身後的樣子。`, `葬禮上，大家輪流說起${t}的好，你只是安靜地站著。`]);
  return { head, short, tail };
}

function inLawLine(s, d) {
  const x = d.person, owner = d.owner;
  const term = inLawTerm(s, owner, x.rel);
  const head = `你的${term}在${x.deathAge}歲那年${deathPredicate(x.cause)}。`;
  const short = `你的${term}也在這一年走了。`;
  const t = pron(owner);
  // (a couple who live in different places do not sit side by side: the household audit forbids it)
  const tail = owner.status !== 'married' ? '這個家的長輩，又少了一位。'
    : d.together === false ? pickBy(s, `${x.id}n`, ['你撥了電話給伴侶，兩端都安靜了好一會兒。', `消息傳來，你撥了電話給伴侶，電話那頭哭了很久。`])
      : pickBy(s, `${x.id}m`, ['你陪著伴侶辦完了後事，夜裡，兩個人都沒怎麼說話。', `伴侶哭了很久，你只是握著${t}的手。`]);
  return { head, short, tail };
}

/** The one merged line (and the grief, the memories, the highlights) for the sibling and in-law deaths that are being told now. */
function announce(s, deaths) {
  const sibs = deaths.filter((d) => d.type === 'sibling');
  const laws = deaths.filter((d) => d.type === 'inlaw');
  const lines = [...sibs.map((d) => siblingLine(s, d)), ...laws.map((d) => inLawLine(s, d))];
  const text = `${lines.map((l, i) => (i === 0 ? l.head : l.short)).join('')}${lines[0].tail}`;
  const title = deaths.length > 1 ? '親人過世' : sibs.length ? `${sibWord(sibs[0].person)}過世` : `${inLawTerm(s, laws[0].owner, laws[0].person.rel)}過世`;
  // grief: a few points, merged for the year (the only effect on the protagonist's stats)
  let delta;
  if (KIN_TUNING.grief) {
    let h = 0, so = 0;
    for (const d of sibs) { h -= 3 + (d.person.deathAge < 18 || Math.abs(d.person.birthYear - s.birthYear) <= 3 ? 1 : 0); so -= 1; }
    h -= laws.length;
    h = Math.max(h, -8); so = Math.max(so, -3);
    delta = {};
    for (const [key, d] of [['happiness', h], ['social', so]]) {
      if (!d) continue;
      const before = s.stats[key];
      const after = clamp(before + d, 0, 100);
      s.stats[key] = after;
      const real = Math.round((after - before) * 10) / 10;
      if (real) delta[key] = real;
    }
  }
  // a quiet year says only this: the ordinary-year line (already drawn, so the stream is the same) makes room for the news
  const mine = (e) => e.year === s.year;
  if (!s.log.some((e) => mine(e) && (e.kind === 'event' || e.kind === 'milestone' || e.kind === 'choice'))) {
    for (let i = s.log.length - 1; i >= 0 && s.log[i].year === s.year; i--) if (s.log[i].kind === 'year') s.log.splice(i, 1);
  }
  const e = { age: s.age, year: s.year, kind: 'kin', title, text };
  if (delta && Object.keys(delta).length) e.delta = delta;
  s.log.push(e); // (no noteSpoken: a kin line never counts a memory as spoken)
  // memories (quiet: kept for the life story and the family drawer, never spoken by a reflection) and a highlight for a sibling
  for (const d of sibs) {
    const x = d.person;
    const age = Math.max(0, s.age - (s.year - x.deathYear));
    remember(s, `loss:sib:${x.id}`, `你的${sibWord(x)}${x.given}過世了`, { tag: 'family', w: 3, quiet: KIN_TUNING.quietMemories, age });
    if (s.age >= 6) s.highlights.push({ age, year: x.deathYear, text: `${sibWord(x)}${x.given}離世。` });
  }
  for (const d of laws) remember(s, `loss:inlaw:${d.person.id}`, `你的${inLawTerm(s, d.owner, d.person.rel)}過世了`, { tag: 'family', w: 2, quiet: KIN_TUNING.quietMemories, age: Math.max(0, s.age - (s.year - d.person.deathYear)) });
}

/**
 * The roster's part of the yearly pass (systems.js runSystems, after the household): parents' bookkeeping, partner history, this year's
 * births and deaths, who lives where. The deaths that matter to the person are queued as news; kinAnnounce tells them.
 */
export function kinYear(s, hh) {
  if (!KIN_TUNING.enabled) return;
  const k = ensureKin(s);
  if (!k) return;
  parentFields(s, true);
  syncPartnerIn(s, k);
  const deaths = [];
  catchUp(s, s.year, deaths);
  refreshFacts(s, hh);
  for (const d of deaths) k.news.push({ t: d.type, id: d.person.id, owner: d.owner ? d.owner.id : null, infant: !!d.infant, abroad: !!d.abroad });
}

/**
 * Tell the queued deaths in ONE merged system line (kind 'kin') with the grief, the memories and a highlight. life.js calls it at the end
 * of the year (after the events, when no choice is waiting) and after a choice has been resolved, so the line can never change which
 * events a year holds. A year that already holds four lines holds the news back, for at most KIN_TUNING.holdYears years.
 */
export function kinAnnounce(s) {
  const k = s.kin;
  if (!KIN_TUNING.enabled || !k || !k.news || !k.news.length || !s.alive) return;
  // the year already holds this many lines (the reading-load rule of tests/lib/coherence.mjs tolerates four a year, a choice's result excluded)
  let lines = 0;
  for (let i = s.log.length - 1; i >= 0 && s.log[i].year === s.year; i--) { const kd = s.log[i].kind; if (kd !== 'choice' && kd !== 'death' && kd !== 'kin' && kd !== 'year') lines++; }
  if (lines >= 4 && (k.waited || 0) < KIN_TUNING.holdYears) { k.waited = (k.waited || 0) + 1; return; }
  k.waited = 0;
  const deaths = [];
  for (const n of k.news.splice(0)) {
    const person = (n.t === 'sibling' ? k.siblings : k.inLaws).find((x) => x.id === n.id);
    if (!person || person.alive) continue;
    const owner = n.owner ? k.partners.find((p) => p.id === n.owner) : undefined;
    deaths.push({ type: n.t, person, owner, infant: n.infant, abroad: n.abroad, together: s.household ? !!s.household.partner : true }); // (the household as it is at the end of the year)
  }
  if (deaths.length) announce(s, deaths);
}

// ---------------------------------------------------------------------------------------------
// Reading the roster
// ---------------------------------------------------------------------------------------------

function match(x, sel) {
  if (sel === undefined || sel === null) return true;
  if (typeof sel === 'string') return x.id === sel || x.name === sel || x.given === sel;
  if (sel.id && x.id !== sel.id) return false;
  if (sel.name && x.name !== sel.name && x.given !== sel.name) return false;
  if (sel.older !== undefined && x.older !== !!sel.older) return false;
  if (sel.younger !== undefined && x.older === !!sel.younger) return false;
  if (sel.gender && x.gender !== sel.gender) return false;
  if (sel.alive !== undefined && x.alive !== !!sel.alive) return false;
  return true;
}

/** Born siblings, oldest first (the living and the dead); `sel` filters: { older, younger, gender, alive, id, name }. Live objects: do not edit. */
export function siblingsOf(s, sel) {
  const k = ensureKin(s);
  return k ? k.siblings.filter((x) => match(x, sel)) : [];
}

/** One sibling: the match closest in age to the person (the older one on a tie), or null. `sel` may also be a sibling object (returned as it is) or an id / name. */
export function siblingOf(s, sel) {
  if (sel && typeof sel === 'object' && typeof sel.id === 'string' && Number.isFinite(sel.birthYear) && typeof sel.alive === 'boolean') return sel;
  const list = siblingsOf(s, sel);
  if (!list.length) return null;
  return list.reduce((best, x) => {
    const d = Math.abs(x.birthYear - s.birthYear), db = Math.abs(best.birthYear - s.birthYear);
    return d < db || (d === db && x.birthYear < best.birthYear) ? x : best;
  });
}

/** Every partner, oldest first (dating, married, divorced, widowed, ended), live objects. */
export function partnersOf(s) {
  const k = ensureKin(s);
  if (!k) return [];
  syncPartnerIn(s, k);
  return k.partners;
}

/** The entry of the partner the person has now (dating or married), or null. */
export function currentPartnerOf(s) {
  const k = ensureKin(s);
  if (!k) return null;
  syncPartnerIn(s, k);
  const e = k.cur ? k.partners.find((p) => p.id === k.cur) : null;
  return e && (e.status === 'dating' || e.status === 'married') ? e : null;
}

/** Former partners who parted from the person: divorced or ended (a late spouse is not an ex), oldest first. */
export function exPartnersOf(s) {
  return partnersOf(s).filter((p) => p.status === 'divorced' || p.status === 'ended');
}

/** The most recent former partner (divorced, ended or widowed: whoever came before the current partner or is left of one), or null. */
export function lastPartnerOf(s) {
  const done = partnersOf(s).filter((p) => p.status === 'divorced' || p.status === 'widowed' || p.status === 'ended');
  return done.length ? done[done.length - 1] : null;
}

/** The parents of the current partner (married or widowed), as entries with `rel`; `rel` picks one ('mother' | 'father'). */
export function inLawsOf(s, rel) {
  const k = ensureKin(s);
  if (!k) return rel ? null : [];
  syncPartnerIn(s, k);
  const cur = k.cur ? k.partners.find((p) => p.id === k.cur) : null;
  if (!cur || (cur.status !== 'married' && cur.status !== 'widowed')) return rel ? null : [];
  const list = k.inLaws.filter((x) => x.partnerId === cur.id);
  return rel ? list.find((x) => x.rel === rel) || null : list;
}

/** 岳父 | 岳母 | 公公 | 婆婆 | 伴侶的父親 | 伴侶的母親 for the current partner's parent, '' when there is none. */
export function inLawWordOf(s, rel) {
  const x = inLawsOf(s, rel);
  if (!x) return '';
  const owner = s.kin.partners.find((p) => p.id === x.partnerId);
  return owner ? inLawTerm(s, owner, x.rel) : '';
}

/** When and how a parent died: { year, age (the person's age then), parentAge, cause, causeLabel, beforeBirth }, or null while the parent lives. */
export function parentDiedAtOf(s, who) {
  ensureKin(s);
  const p = s.family[who];
  if (!p || p.alive) return null;
  const year = p.deathYear ?? s.birthYear;
  return {
    year, age: Math.max(0, year - s.birthYear), parentAge: p.deathAge ?? null, cause: p.cause || 'other', causeLabel: causeLabelOf(p.cause || 'other'),
    beforeBirth: year <= s.birthYear && !s.log.some((e) => e.title === (who === 'mother' ? '母親過世' : '父親過世')),
  };
}

/** The roster as plain data for the UI and the story: ages, words and labels filled in; copies, safe to keep. */
export function kinView(s) {
  const k = ensureKin(s);
  if (!k) return null;
  syncPartnerIn(s, k);
  const y = s.year;
  const sibling = (x) => ({ ...x, word: sibWord(x), age: x.alive ? y - x.birthYear : x.deathAge, ageNow: y - x.birthYear, causeLabel: causeLabelOf(x.cause) });
  const parent = (who) => {
    const p = s.family[who];
    return {
      name: p.name, alive: p.alive, age: p.alive ? p.age : (p.deathAge ?? p.age), birthYear: p.birthYear ?? null, deathYear: p.deathYear ?? null, cause: p.cause ?? null,
      causeLabel: causeLabelOf(p.cause), where: p.where ?? '',
    };
  };
  const inLaws = k.inLaws.map((x) => {
    const owner = k.partners.find((p) => p.id === x.partnerId);
    return { ...x, word: owner ? inLawTerm(s, owner, x.rel) : (x.rel === 'father' ? '伴侶的父親' : '伴侶的母親'), age: x.alive ? y - x.birthYear : x.deathAge, causeLabel: causeLabelOf(x.cause), current: !!owner && owner.id === k.cur && (owner.status === 'married' || owner.status === 'widowed') };
  });
  return {
    siblings: k.siblings.map(sibling),
    coming: k.coming.length,
    parents: { mother: parent('mother'), father: parent('father') },
    partners: k.partners.map((p) => ({ ...p, age: p.alive ? y - p.birthYear : p.deathAge, causeLabel: causeLabelOf(p.cause), current: p.id === k.cur && (p.status === 'dating' || p.status === 'married') })), // (current = the relationship of today; a divorced partner who is still state.partner is not current)
    inLaws,
  };
}

const num = (v) => (Number.isFinite(v) ? v : null);

/** The compact roster the summary (and the album record) keeps: enough for the family tree of the review page. */
export function kinSummary(s) {
  const v = kinView(s);
  if (!v) return null;
  return {
    siblings: v.siblings.map((x) => ({ name: x.name, given: x.given, gender: x.gender, word: x.word, older: x.older, birthYear: x.birthYear, alive: x.alive, deathYear: num(x.deathYear), deathAge: num(x.deathAge), cause: x.cause || '', causeLabel: x.causeLabel, married: x.married, kids: x.kids })),
    parents: {
      mother: { name: v.parents.mother.name, alive: v.parents.mother.alive, birthYear: num(v.parents.mother.birthYear), deathYear: num(v.parents.mother.deathYear), deathAge: num(s.family.mother.deathAge), cause: v.parents.mother.cause || '', causeLabel: v.parents.mother.causeLabel },
      father: { name: v.parents.father.name, alive: v.parents.father.alive, birthYear: num(v.parents.father.birthYear), deathYear: num(v.parents.father.deathYear), deathAge: num(s.family.father.deathAge), cause: v.parents.father.cause || '', causeLabel: v.parents.father.causeLabel },
    },
    partners: v.partners.map((p) => ({ name: p.name, gender: p.gender, status: p.status, since: num(p.since), until: num(p.until), marriedYear: num(p.marriedYear), birthYear: p.birthYear, alive: p.alive, deathYear: num(p.deathYear), deathAge: num(p.deathAge), cause: p.cause || '', causeLabel: p.causeLabel, current: p.current })),
    inLaws: v.inLaws.map((x) => ({ rel: x.rel, word: x.word, partnerName: (v.partners.find((p) => p.id === x.partnerId) || {}).name || '', name: x.name, birthYear: x.birthYear, alive: x.alive, deathYear: num(x.deathYear), deathAge: num(x.deathAge), cause: x.cause || '', causeLabel: x.causeLabel, current: x.current })),
  };
}

/** The family at birth as `birthOf` hands it to a replay: just the siblings (name, given name, gender, birth year), oldest first. */
export function birthKinOf(s) {
  const k = ensureKin(s);
  if (!k) return undefined;
  return { siblings: k.birthRoster.map((e) => ({ name: e.name, given: e.given, gender: e.gender, birthYear: e.birthYear })) };
}

/** Validate the `kin` part of a start (birth.js normalizeBirth): at most 11 siblings, sane years; anything else → undefined (the roster is then planned from the number). */
export function cleanBirthKin(bk, birthYear) {
  if (!bk || typeof bk !== 'object' || !Array.isArray(bk.siblings) || bk.siblings.length > KIN_TUNING.siblingMax) return undefined;
  const out = [];
  for (const e of bk.siblings) {
    if (!e || typeof e.name !== 'string' || !e.name || e.name.length > 80 || (e.gender !== 'M' && e.gender !== 'F')) return undefined;
    if (!Number.isInteger(e.birthYear) || e.birthYear < birthYear - 45 || e.birthYear > birthYear + 30 || e.birthYear === birthYear) return undefined;
    out.push({ name: e.name, given: typeof e.given === 'string' && e.given && e.given.length <= 80 ? e.given : e.name, gender: e.gender, birthYear: e.birthYear });
  }
  out.sort((a, b) => a.birthYear - b.birthYear);
  return { siblings: out };
}

