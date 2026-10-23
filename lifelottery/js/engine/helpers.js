// The `h` object handed to event functions: cond(s, h), text(s, h), effects(s, h), result(s, h), ai(s, h).
//
// IMPORTANT for event authors: always call helpers as methods (`h.chance(0.3)`), never destructure them
// (`const { chance } = h` would lose `this`).
//
// Helpers are thin wrappers over the same primitives the yearly systems use (systems.js), so events and
// systems can never disagree about how, for example, a marriage is recorded.

import { BY_CODE } from '../data/countries.js';
import { eraView, incomeGroupAt } from '../data/eras.js';
import { CAUSES } from '../data/causes.js';
import { describeCause } from './mortality.js';
import { rand, between, randInt, chance, pick, clamp } from './rng.js';
import {
  STAT_KEYS, EDU_LEVELS, JOBS, ctxOf, annualIncome, applyDelta, pushLog, addHighlight, incomeAtLeast, byIncome, aliveKids,
  startJob, loseJob, retire, setPartner, newPartner, endRelationship, marry, divorce, addChild, addCondition, removeCondition,
  migrate, leaveSchool, enroll, inTertiary, setUrban, setCity,
} from './systems.js';

/**
 * Years by which a technology that reached the rich countries in year X reaches somebody living in a country of the
 * given (era-adjusted) income group: 0 for high income, a few years per step down, a little longer in the countryside.
 * Shared by `h.techReady` and the coherence auditor, so events and checks agree on "too early".
 */
export function techLag(incomeAt, urban) {
  const lag = { H: 0, UM: 2, LM: 4, L: 7 }[incomeAt] ?? 0;
  return lag + (!urban && incomeAt !== 'H' ? 2 : 0);
}

/** Record a death on the state (also used for the natural-mortality death in life.js). */
export function recordDeath(s, causeId) {
  if (!s.alive) return;
  const id = CAUSES[causeId] ? causeId : 'other';
  s.alive = false;
  const text = describeCause(s, id);
  s.death = { age: s.age, year: s.year, causeId: id, causeText: text };
  delete s.flags._choice;
  const when = s.age < 1 ? `在 ${s.year} 年離開，還不滿一歲` : `在 ${s.year} 年離開，享年 ${s.age} 歲`;
  pushLog(s, 'death', `${s.name.given}離開了`, `${s.name.full}${when}。${text}`);
}

/** Deterministic number in [0, 1) from a string (FNV-1a plus a final avalanche so similar strings differ). */
export function hash01(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** The i-th living child (the i-th child at all if none is alive). */
const kidOf = (s, i) => s.children.filter((c) => c.alive)[i] || s.children[i];

export class Helpers {
  constructor(s) {
    this.s = s;
  }

  // ---- randomness (uses the life's own seeded generator) ----
  rand() { return rand(this.s.rng); }
  chance(p) { return chance(this.s.rng, p); }
  pick(arr) { return pick(this.s.rng, arr); }
  between(a, b) { return between(this.s.rng, a, b); }
  /** Integer in [a, b], inclusive. */
  randInt(a, b) { return randInt(this.s.rng, a, b); }

  // ---- time ----
  age() { return this.s.age; }
  year() { return this.s.year; }
  birthYear() { return this.s.birthYear; }
  /** Resolved era of this life: 'past' | 'present' | 'future'. */
  era() { return this.s.settings.era; }
  /** True if the calendar year is within [a, b]. */
  yearIn(a, b) { return this.s.year >= a && this.s.year <= b; }
  /** True if age is within [a, b]. */
  ageIn(a, b) { return this.s.age >= a && this.s.age <= b; }

  // ---- country & statistics ----
  /** Record of the country the person currently lives in (see data/countries.js). */
  country() { return BY_CODE[this.s.countryCode]; }
  homeCountry() { return BY_CODE[this.s.homeCountryCode]; }
  /** Era-adjusted statistics of the current country for the current calendar year. */
  stats() { return ctxOf(this.s).view; }
  countryName() { return this.country().name; }
  /** World-bank income group of the current country TODAY: 'L' | 'LM' | 'UM' | 'H' (see incomeAt for the era-adjusted one). */
  income() { return this.country().income; }
  /**
   * Income group of the current country in the current calendar year, from the era GDP per head: South Korea
   * in 1975 is 'LM' (it is 'H' today), most countries are one group higher in 2060 than now. Use this for
   * descriptions of living conditions; use income() for "what kind of country is this today".
   */
  incomeAt() { return incomeGroupAt(this.country(), this.s.year); }
  incomeAtLeast(g) { return incomeAtLeast(this.income(), g); }
  region() { return this.country().region; }
  isRegion(...r) { return r.includes(this.country().region); }
  /**
   * Pick a value by the era-adjusted income group (incomeAt), falling back to the nearest defined group:
   * h.byIncome({ L: '…', H: '…' }).
   */
  byIncome(map) { return byIncome(this.incomeAt(), map); }
  /**
   * Like byIncome, for narration only (never for effects, so calibration is unaffected): shifts the group one step
   * up for a rich household (family quintile 5 as a child, wealth stat >= 70 as an adult) and one step down for a
   * poor one, so a well-off child in a poor country is not handed the village version of a scene, nor a poor one the
   * private-clinic version.
   */
  byLiving(map) {
    const order = ['L', 'LM', 'UM', 'H'];
    let i = order.indexOf(this.incomeAt());
    const rich = this.s.age < 18 ? this.s.family.wealthQ >= 5 : this.s.stats.wealth >= 75;
    const poor = this.s.age < 18 ? this.s.family.wealthQ <= 1 : this.s.stats.wealth <= 20;
    if (rich && i < 3) i++;
    else if (poor && i > 0) i--;
    if (this.s.urban && i === 0) i = 1; // the 'L' scenes are village scenes
    return byIncome(order[i], map);
  }
  /**
   * Is the person currently displaced by conflict or disaster (in a camp, with relatives elsewhere), as set by the
   * "leave home" events? Cleared when they return, resettle or stay put; lapses after 6 years either way. Village-bound
   * scenes (a new well at the village edge, a rooftop of solar panels) use `!h.displaced()`.
   */
  displaced() { const y = this.s.flags._displacedAt; return y !== undefined && this.s.year - y <= 6 && !!this.s.flags.displaced; }
  city() { return this.s.city; }
  urban() { return this.s.urban; }
  /** Move to (true) or away from (false) the city within the current country. */
  setUrban(isUrban) { setUrban(this.s, isUrban); }
  /** Set the city of residence: a name, or (no argument) a random city of the current country. */
  setCity(name) { setCity(this.s, name); }
  isMigrant() { return this.s.countryCode !== this.s.homeCountryCode; }
  /** Years since the last move to another country (Infinity if the person never moved). */
  yearsAbroad() { const y = this.s.flags._movedAt; return y === undefined ? Infinity : this.s.year - y; }
  hasLivedIn(code) { return !!this.s.flags._countries && this.s.flags._countries.includes(code); }

  // ---- identity & situation ----
  stat(k) { return this.s.stats[k]; }
  female() { return this.s.gender === 'F'; }
  male() { return this.s.gender === 'M'; }
  gender() { return this.s.gender; }
  /** Family wealth quintile at birth, 1 (poorest) .. 5 (richest). */
  wealthQ() { return this.s.family.wealthQ; }
  /** Rough annual income in 2011 international dollars (PPP). */
  annualIncome() { return annualIncome(this.s); }
  isRich() { return this.s.stats.wealth >= 70; }
  isPoor() { return this.s.stats.wealth <= 30; }
  inSchool() { return this.s.edu.inSchool; }
  /** Studying at university level or beyond right now. */
  inTertiary() { return inTertiary(this.s); }
  /** Highest education level attended: 'none'|'primary'|'secondary'|'tertiary'|'graduate'. */
  eduLevel() { return this.s.edu.level; }
  eduAtLeast(level) { return EDU_LEVELS.indexOf(this.s.edu.level) >= EDU_LEVELS.indexOf(level); }
  eduYears() { return this.s.edu.years; }
  employed() { return this.s.work.status === 'employed' || this.s.work.status === 'self'; }
  /**
   * Works for somebody else for a wage (has a boss, colleagues, pay day, office hours). `employed()` also covers the
   * self-employed (farmers, fishers, vendors, shopkeepers ...), who have none of these: use this one in any text that
   * says 同事, 主管, 薪水, 下班, 加班 or 公司.
   */
  wageEarner() { return this.s.work.status === 'employed'; }
  /** A wage earner in an office-type occupation (desk, meetings, 辦公室). */
  officeJob() { return this.s.work.status === 'employed' && ['clerk', 'sales', 'technician', 'civil_servant', 'accountant', 'engineer', 'developer', 'manager', 'researcher', 'teacher', 'nurse', 'doctor'].includes(this.s.work.job); }
  unemployed() { return this.s.work.status === 'unemployed'; }
  retired() { return this.s.work.status === 'retired'; }
  workStatus() { return this.s.work.status; }
  job() { return this.s.work.job; }
  jobName() { return this.s.work.job ? JOBS[this.s.work.job].name : ''; }
  /** Currently working in one of these occupations (a retired person or a homemaker is no longer "in" the job). */
  isJob(...ids) { return this.employed() && ids.includes(this.s.work.job); }
  married() { return !!this.s.partner && this.s.partner.status === 'married'; }
  /** In a current relationship (dating or married). */
  hasPartner() { return !!this.s.partner && (this.s.partner.status === 'dating' || this.s.partner.status === 'married'); }
  partnerStatus() { return this.s.partner ? this.s.partner.status : null; }
  partnerAge() { return this.s.partner ? this.s.partner.age : 0; }
  yearsMarried() { return this.married() ? this.s.year - this.s.partner.since : 0; }
  /** True if the person has (ever had) at least one living child. */
  hasChildren() { return aliveKids(this.s) > 0; }
  childCount() { return aliveKids(this.s); }
  /** Age of the youngest living child, or -1. */
  youngestChildAge() {
    let best = -1;
    for (const c of this.s.children) if (c.alive) { const a = this.s.year - c.birthYear; if (best < 0 || a < best) best = a; }
    return best;
  }
  /**
   * Number of grandchildren (0 until the milestone "當了祖父母" has happened, i.e. the flag `grandparent` is set: nobody
   * talks about grandchildren before the story has told the reader that there are some). Not simulated individually:
   * derived deterministically from the children's ages, so every event agrees about it and no random numbers are consumed.
   */
  grandchildren() {
    return this.s.flags.grandparent ? Math.max(1, this.expectedGrandchildren()) : 0;
  }
  /** Could this person have grandchildren by now (a child of 22 or older who, by `stable()`, had children)? Gate for the milestone event only. */
  expectedGrandchildren() {
    let n = 0;
    this.s.children.forEach((c, i) => {
      const a = this.s.year - c.birthYear;
      if (a < 22 || !c.alive && a < 30) return;
      if (this.stable(`grand:${i}`, Math.min(0.85, 0.3 + 0.025 * (a - 22)))) n += 1 + (this.stable(`grand2:${i}`, Math.min(0.7, 0.04 * (a - 22))) ? 1 : 0);
    });
    return Math.min(n, 8);
  }
  hasGrandchildren() { return !!this.s.flags.grandparent; }
  siblings() { return this.s.family.siblings; }
  /**
   * Does the family run a small business (shop, stall, workshop, farm stand)? Decided once per life by `stable()` so every
   * event that mentions "家裡的店" agrees. Only middle-quintile families (2-4) have one; about a third of them.
   */
  familyBusiness() {
    const q = this.s.family.wealthQ;
    return q >= 2 && q <= 4 && this.stable('family_business', 0.34);
  }
  /** The grown-ups at home as a word for narration: '爸媽', '媽媽', '爸爸' or '身邊的大人' (both parents dead). */
  parentsLabel() {
    const f = this.s.family;
    return f.mother.alive && f.father.alive ? '爸媽' : f.mother.alive ? '媽媽' : f.father.alive ? '爸爸' : '身邊的大人';
  }
  /**
   * Has a technology that appeared in the rich countries in `baseYear` (e.g. smartphones 2008, mobile phones 1995,
   * the web 1995) reached this person? Later for poorer countries and for the countryside (see techLag).
   */
  techReady(baseYear) { return this.s.year >= baseYear + techLag(this.incomeAt(), this.s.urban); }
  parentAlive(who) { return this.s.family[who].alive; }
  parentsAlive() { return (this.s.family.mother.alive ? 1 : 0) + (this.s.family.father.alive ? 1 : 0); }
  isSmoker() { return this.s.smoker; }
  startSmoking() { this.s.smoker = true; }
  quitSmoking() { this.s.smoker = false; }
  hasCondition(id) { return this.s.conditions.includes(id); }
  has(flag) { return !!this.s.flags[flag]; }
  /** Raw flag value (numbers allowed). */
  flag(name) { return this.s.flags[name]; }
  /** Years since the event was last seen, or Infinity. */
  yearsSince(eventId) { const a = this.s.seen[eventId]; return a === undefined ? Infinity : this.s.age - a; }
  seenEvent(eventId) { return this.s.seen[eventId] !== undefined; }
  /**
   * The most recent log entry whose title or kind equals `titleOrKind` (a string, or an array of strings), no
   * more than `years` years ago (default: any time); null if there is none. Replaces scanning `s.log` in events.
   */
  recentLog(titleOrKind, years = Infinity) {
    const keys = Array.isArray(titleOrKind) ? titleOrKind : [titleOrKind];
    const log = this.s.log;
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (this.s.age - e.age > years) break;
      if (keys.includes(e.title) || keys.includes(e.kind)) return e;
    }
    return null;
  }
  /**
   * Deterministic per-life coin flip: true with probability `p`, always the same answer for the same life and
   * `key`. It does not consume the random generator, so it is safe in `cond` (and for "was this person
   * affected by the 2004 tsunami", which several events must agree on). Use a distinct key per question.
   */
  stable(key, p = 0.5) {
    if (!(p > 0)) return false;
    if (p >= 1) return true;
    return hash01(`${this.s.seed}|${this.s.birthYear}|${this.s.name.full}|${key}`) < p;
  }

  // ---- state changes ----
  set(flag, v = true) { this.s.flags[flag] = v; }
  unset(flag) { delete this.s.flags[flag]; }
  /** Add `n` to a numeric flag (starting at 0). */
  inc(flag, n = 1) { this.s.flags[flag] = (this.s.flags[flag] || 0) + n; return this.s.flags[flag]; }
  /** Change a stat by delta (clamped 0..100). A wealth change also shifts the income percentile. */
  change(stat, delta) {
    if (!STAT_KEYS.includes(stat)) throw new Error(`unknown stat ${stat}`);
    return applyDelta(this.s, { [stat]: delta });
  }
  addWealth(d) { return this.change('wealth', d); }
  addCondition(id) { return addCondition(this.s, id); }
  removeCondition(id) { return removeCondition(this.s, id); }
  startJob(id) { startJob(this.s, id); }
  loseJob() { loseJob(this.s); }
  /** Retire (adds the system's own 退休 log entry and highlight). */
  retire() { retire(this.s); }
  /** Leave school without a log entry from the system (the event provides its own text). */
  dropOut() { if (this.s.edu.inSchool) leaveSchool(this.s, null); }
  /**
   * Put a person who is not in school back into education (night school, second chance, adult degree).
   * `level`: 'primary' | 'secondary' | 'tertiary' | 'graduate' (default: the next level above their current
   * one). Returns false if they are already studying or already have that level. The yearly system carries them
   * through (about two school years per calendar year below university), may let them drop out, and logs the
   * diploma at the end; the public flag `adult_diploma` (= year) is set on completion, `adult_dropout` on dropping
   * out. With `{ quiet: true }` the event narrates the outcome itself: no random dropout and no system log (end the
   * enrolment from the event with dropOut()).
   */
  enroll(level, opts) { return enroll(this.s, level, opts); }
  /** Same as enroll() with the default (next) level. */
  reenroll(opts) { return enroll(this.s, undefined, opts); }
  /**
   * Set the partner: { name?, gender?, age?, status? }. Missing fields get sensible defaults; a missing name is
   * drawn from the culture-appropriate name pool (see newPartner).
   */
  setPartner(p = {}) {
    const s = this.s;
    if (p.name) {
      const gender = p.gender || (s.gender === 'F' ? 'M' : 'F');
      setPartner(s, { name: p.name, gender, age: p.age ?? s.age + (gender === 'M' ? 2 : -2), status: p.status || 'dating', since: s.year });
    } else newPartner(s, { gender: p.gender, age: p.age, status: p.status, replace: true });
  }
  /**
   * Create a partner ({ gender?, status: 'dating' | 'married' = 'dating', age? }) with a culture-appropriate name
   * (the person's own name group; migrants and multi-group countries sometimes cross groups) and an age near
   * their own. Returns the partner record. If the person already has an active partner, that partner is returned
   * unchanged: end the relationship first (endRelationship / divorce).
   */
  newPartner(opts = {}) { return newPartner(this.s, opts); }
  /**
   * End a dating relationship (a marriage is ended with divorce()). Clears the partner, resets the private
   * dating / marriage plan flags and starts a cooldown (default 2-4 years, or `years`) so the yearly systems do
   * not immediately start another relationship. Returns true if there was a relationship to end.
   */
  endRelationship(years) { return endRelationship(this.s, years); }
  /** Marry the current partner (creating one if there is none). */
  marry() { marry(this.s); }
  divorce() { return divorce(this.s); }
  /** Add a child: { gender? }. Returns the child record (name is generated). */
  addChild(opts) { return addChild(this.s, opts); }
  /** Move to another country (ISO3 code). Adjusts mortality risk by the life-expectancy gap. */
  migrate(code) {
    const s = this.s;
    const from = ctxOf(s).country;
    if (!migrate(s, code)) return false;
    const view = (c) => eraView(c, s.year);
    const f = view(from), t = view(BY_CODE[code]);
    const ratio = (f.le[s.gender]) / (t.le[s.gender]);
    s.riskMult = clamp(s.riskMult * Math.pow(ratio, 0.7), 0.4, 3);
    return true;
  }
  /** Multiply death risk. With `years`, the effect lapses after that many years; without, it is permanent. */
  addRisk(mult, years) {
    const s = this.s;
    if (years === undefined) s.riskMult = clamp(s.riskMult * mult, 0.3, 6);
    else { s.flags._risks = s.flags._risks || []; s.flags._risks.push([mult, s.age + years]); }
  }
  /** Add a plain log line (kind 'event'). */
  log(text, title = '') { pushLog(this.s, 'event', title, text); }
  /** Record an important moment for the end-of-life summary. */
  highlight(text) { addHighlight(this.s, text); }
  /** Kill the person with a cause id from data/causes.js (use sparingly: wars, disasters). */
  die(causeId) { recordDeath(this.s, causeId); }

  // ---- names ----
  name() { return this.s.name.full; }
  givenName() { return this.s.name.given; }
  partnerName() { return this.s.partner ? this.s.partner.name : '對方'; }
  /** '他' or '她' for the partner (or '對方' if single) / the i-th child ('孩子' if none). */
  partnerHe() { return this.s.partner ? (this.s.partner.gender === 'F' ? '她' : '他') : '對方'; }
  childHe(i = 0) { const c = kidOf(this.s, i); return c ? (c.gender === 'F' ? '她' : '他') : '孩子'; }
  /** Name of the i-th living child (default: the first; the i-th child at all if none is alive); '孩子' if there is none. */
  childName(i = 0) { const c = kidOf(this.s, i); return c ? c.name : '孩子'; }
  /** Name of the most recently born child. */
  lastChildName() { const c = this.s.children[this.s.children.length - 1]; return c ? c.name : '孩子'; }
  motherName() { return this.s.family.mother.name; }
  fatherName() { return this.s.family.father.name; }
}

/** Names of all public helper methods (used by tests and the README generator). */
export const HELPER_NAMES = Object.getOwnPropertyNames(Helpers.prototype).filter((n) => n !== 'constructor');

export function makeHelpers(s) {
  return new Helpers(s);
}
