// Collection and achievements, derived entirely from the album records (nothing but "which toasts were already shown"
// is stored separately, see storage.js loadAchievementLog). No DOM, no text: ids and icons only; names and descriptions
// live in js/strings.js (S.ach.items). Old records stay valid: every fact is derived defensively from the summary,
// and a few from the optional `record.meta` the game adds at death ({ drawMode, partnerYears }).

import { COUNTRIES, BY_CODE } from '../data/countries.js';
import { CONTINENT } from '../data/worldmap.js';
import { eraOfYear } from '../data/eras.js';
import { oddsFromSummary } from '../engine/odds.js';

export const CONTINENTS = ['AS', 'EU', 'AF', 'NA', 'SA', 'OC'];
export const ERAS = ['past', 'present', 'future'];
export const TOTAL_COUNTRIES = COUNTRIES.length;

const NAME_TO_CODE = new Map(COUNTRIES.map((c) => [c.name, c.code]));

/** Everything the achievements need about one album record, tolerant of missing fields. */
export function lifeFacts(rec) {
  const sum = (rec && rec.summary) || {};
  const home = sum.homeCountry || {};
  const code = BY_CODE[home.code] ? home.code : NAME_TO_CODE.get(home.name) || null;
  const country = code ? BY_CODE[code] : null;
  const age = Number.isFinite(sum.age) ? sum.age : 0;
  const lived = new Set([code].filter(Boolean));
  for (const name of Array.isArray(sum.countriesLived) ? sum.countriesLived : []) {
    const c = NAME_TO_CODE.get(name);
    if (c) lived.add(c);
  }
  const era = ERAS.includes(sum.era) ? sum.era : Number.isFinite(sum.birthYear) ? eraOfYear(sum.birthYear) : 'present';

  // years with the partner: stored at death when the game knew them, else estimated for long marriages
  let partnerYears = 0, partnerEstimated = false;
  const meta = rec && rec.meta;
  if (meta && Number.isFinite(meta.partnerYears)) partnerYears = meta.partnerYears;
  else if (sum.partner && ['married', 'widowed'].includes(sum.partner.status) && (sum.marriages || 0) >= 1 && (sum.divorces || 0) === 0 && age >= 80) {
    partnerYears = age - 28; partnerEstimated = true;
  }

  let oneIn = 0;
  try {
    const o = oddsFromSummary(sum, (meta && meta.drawMode) || 'births');
    if (o) oneIn = o.oneIn;
  } catch (e) { oneIn = 0; }

  return {
    id: rec && rec.id,
    startId: (rec && rec.meta && rec.meta.replay && rec.meta.replay.start) || (rec && rec.id) || '', // lives that share a start (same_start_3)
    name: sum.name || '',
    code,
    continent: code ? CONTINENT[code] || null : null,
    era,
    income: country ? country.income : null,
    pop: country ? country.pop : null,
    age,
    gender: sum.gender === 'M' ? 'M' : 'F',
    wealthQ: sum.wealthQ || 3,
    eduLevel: (sum.education && sum.education.level) || '',
    children: (sum.children && sum.children.total) || 0,
    yearsWorked: sum.yearsWorked || 0,
    vsCountry: sum.lifespan && Number.isFinite(sum.lifespan.vsCountry) ? sum.lifespan.vsCountry : 0,
    lived,
    partnerYears,
    partnerEstimated,
    oneIn,
  };
}

/** Totals for the collection page. `records` are album records. */
export function collectionStats(records) {
  const facts = records.map(lifeFacts);
  const countryCounts = {}, continentCounts = {}, eraCounts = { past: 0, present: 0, future: 0 };
  let years = 0, longest = null, shortest = null;
  for (const f of facts) {
    years += f.age;
    if (f.code) countryCounts[f.code] = (countryCounts[f.code] || 0) + 1;
    if (f.continent) continentCounts[f.continent] = (continentCounts[f.continent] || 0) + 1;
    eraCounts[f.era] = (eraCounts[f.era] || 0) + 1;
    if (!longest || f.age > longest.age) longest = f;
    if (!shortest || f.age < shortest.age) shortest = f;
  }
  return {
    facts,
    lives: facts.length,
    years,
    longest: longest && { age: longest.age, name: longest.name },
    shortest: shortest && { age: shortest.age, name: shortest.name },
    countryCounts,
    countries: Object.keys(countryCounts).length,
    continentCounts,
    continents: Object.keys(continentCounts).length,
    eraCounts,
    eras: ERAS.filter((e) => eraCounts[e] > 0).length,
  };
}

const count = (n, goal) => ({ done: n >= goal, value: Math.min(n, goal), goal });
const any = (facts, fn) => ({ done: facts.some(fn), value: facts.some(fn) ? 1 : 0, goal: 1 });

/**
 * id, icon and the rule. Each rule gets (facts, stats) and returns { done, value, goal } (value / goal drive the
 * progress text for count-based achievements; one-off ones use 0 / 1).
 */
export const ACHIEVEMENTS = [
  { id: 'first_life', icon: 'sprout', rule: (f, st) => count(st.lives, 1) },
  { id: 'lives_5', icon: 'cycle', rule: (f, st) => count(st.lives, 5) },
  { id: 'lives_10', icon: 'star', rule: (f, st) => count(st.lives, 10) },
  { id: 'age_90', icon: 'tree', rule: (f) => any(f, (x) => x.age >= 90) },
  { id: 'age_100', icon: 'crown', rule: (f) => any(f, (x) => x.age >= 100) },
  { id: 'tiny_nation', icon: 'mapPin', rule: (f) => any(f, (x) => x.pop != null && x.pop < 1e6) },
  { id: 'three_countries', icon: 'compass', rule: (f) => count(Math.max(0, ...f.map((x) => x.lived.size)), 3) },
  { id: 'five_countries', icon: 'globe', rule: (f) => count(Math.max(0, ...f.map((x) => x.lived.size)), 5) },
  { id: 'three_eras', icon: 'moon', rule: (f, st) => count(st.eras, 3) },
  { id: 'both_genders', icon: 'swap', rule: (f) => count(new Set(f.map((x) => x.gender)).size, 2) },
  { id: 'golden_wedding', icon: 'rings', rule: (f) => any(f, (x) => x.partnerYears >= 50) },
  { id: 'big_family', icon: 'family2', rule: (f) => any(f, (x) => x.children >= 4) },
  { id: 'scholar', icon: 'cap', rule: (f) => any(f, (x) => x.eduLevel === 'graduate') },
  { id: 'two_worlds', icon: 'scales', rule: (f) => count(['L', 'H'].filter((g) => f.some((x) => x.income === g)).length, 2) },
  { id: 'humble_long', icon: 'mountain', rule: (f) => any(f, (x) => x.wealthQ === 1 && x.age >= 75) },
  { id: 'beat_average', icon: 'flag', rule: (f) => any(f, (x) => x.vsCountry >= 15) },
  { id: 'rare_odds', icon: 'dice', rule: (f) => any(f, (x) => x.oneIn >= 1e6) },
  { id: 'twice_same', icon: 'heart', rule: (f, st) => ({ done: Object.values(st.countryCounts).some((n) => n >= 2), value: Math.min(2, Math.max(0, ...Object.values(st.countryCounts))), goal: 2 }) },
  { id: 'taiwan', icon: 'home', rule: (f) => any(f, (x) => x.code === 'TWN') },
  { id: 'three_continents', icon: 'compass', rule: (f, st) => count(st.continents, 3) },
  { id: 'all_continents', icon: 'globe', rule: (f, st) => count(st.continents, 6) },
  { id: 'ten_countries', icon: 'mapPin', rule: (f, st) => count(st.countries, 10) },
  { id: 'twentyfive_countries', icon: 'flag', rule: (f, st) => count(st.countries, 25) },
  { id: 'long_career', icon: 'briefcase', rule: (f) => any(f, (x) => x.yearsWorked >= 40) },
  { id: 'same_start_3', icon: 'replay', rule: (f) => { const n = {}; for (const x of f) if (x.startId) n[x.startId] = (n[x.startId] || 0) + 1; return count(Math.max(0, ...Object.values(n)), 3); } },
];

/** Evaluate every achievement for a list of album records: [{ id, icon, done, value, goal }]. */
export function evaluateAchievements(records) {
  const stats = collectionStats(records);
  return ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, ...a.rule(stats.facts, stats) }));
}

export function earnedIds(records) {
  return new Set(evaluateAchievements(records).filter((a) => a.done).map((a) => a.id));
}

/**
 * Achievements that this record newly makes true: earned with it, not without it, and not already announced
 * (`seen` is the stored log { id: timestamp }).
 */
export function newlyUnlocked(allRecords, record, seen = {}) {
  const now = earnedIds(allRecords);
  const before = earnedIds(allRecords.filter((r) => r.id !== record.id));
  return ACHIEVEMENTS.filter((a) => now.has(a.id) && !before.has(a.id) && !(a.id in seen)).map((a) => a.id);
}
