// The `h` object handed to event functions: cond(s, h), text(s, h), effects(s, h), result(s, h), ai(s, h).
//
// IMPORTANT for event authors: always call helpers as methods (`h.chance(0.3)`), never destructure them
// (`const { chance } = h` would lose `this`).
//
// Helpers are thin wrappers over the same primitives the yearly systems use (systems.js), so events and
// systems can never disagree about how, for example, a marriage is recorded.

import { BY_CODE } from '../data/countries.js';
import { eraView } from '../data/eras.js';
import { CAUSES } from '../data/causes.js';
import { describeCause } from './mortality.js';
import { rand, between, randInt, chance, pick, clamp } from './rng.js';
import {
  STAT_KEYS, EDU_LEVELS, JOBS, ctxOf, annualIncome, applyDelta, pushLog, addHighlight, incomeAtLeast, byIncome, aliveKids,
  startJob, loseJob, retire, setPartner, marry, divorce, addChild, addCondition, removeCondition, migrate, leaveSchool,
} from './systems.js';

/** Record a death on the state (also used for the natural-mortality death in life.js). */
export function recordDeath(s, causeId) {
  if (!s.alive) return;
  const id = CAUSES[causeId] ? causeId : 'other';
  s.alive = false;
  const text = describeCause(s, id);
  s.death = { age: s.age, year: s.year, causeId: id, causeText: text };
  delete s.flags._choice;
  pushLog(s, 'death', `${s.name.given}離開了`, `${s.name.full}在 ${s.year} 年離開，享年 ${s.age} 歲。${text}`);
}

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
  /** World-bank income group of the current country: 'L' | 'LM' | 'UM' | 'H'. */
  income() { return this.country().income; }
  incomeAtLeast(g) { return incomeAtLeast(this.income(), g); }
  region() { return this.country().region; }
  isRegion(...r) { return r.includes(this.country().region); }
  /** Pick a value by income group, falling back to the nearest group: h.byIncome({ L: '…', H: '…' }). */
  byIncome(map) { return byIncome(this.income(), map); }
  city() { return this.s.city; }
  urban() { return this.s.urban; }
  isMigrant() { return this.s.countryCode !== this.s.homeCountryCode; }
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
  /** Highest education level attended: 'none'|'primary'|'secondary'|'tertiary'|'graduate'. */
  eduLevel() { return this.s.edu.level; }
  eduAtLeast(level) { return EDU_LEVELS.indexOf(this.s.edu.level) >= EDU_LEVELS.indexOf(level); }
  eduYears() { return this.s.edu.years; }
  employed() { return this.s.work.status === 'employed' || this.s.work.status === 'self'; }
  unemployed() { return this.s.work.status === 'unemployed'; }
  retired() { return this.s.work.status === 'retired'; }
  workStatus() { return this.s.work.status; }
  job() { return this.s.work.job; }
  jobName() { return this.s.work.job ? JOBS[this.s.work.job].name : ''; }
  isJob(...ids) { return ids.includes(this.s.work.job); }
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
  siblings() { return this.s.family.siblings; }
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
  /** Set the partner: { name?, gender?, age?, status? }. Missing fields get sensible defaults. */
  setPartner(p = {}) {
    const s = this.s;
    const gender = p.gender || (s.gender === 'F' ? 'M' : 'F');
    setPartner(s, {
      name: p.name || (gender === 'F' ? '她' : '他'),
      gender,
      age: p.age ?? s.age + (gender === 'M' ? 2 : -2),
      status: p.status || 'dating',
      since: s.year,
    });
  }
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
  /** Name of the i-th child (default: the first); '孩子' if there is none. */
  childName(i = 0) { return this.s.children[i] ? this.s.children[i].name : '孩子'; }
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
