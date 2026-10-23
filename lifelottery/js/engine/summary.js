// End-of-life summary: everything the review screen, share card and "前世記錄" need as plain data.

import { BY_CODE } from '../data/countries.js';
import { eraView, worldView } from '../data/eras.js';
import { CAUSES } from '../data/causes.js';
import { lifeTable } from './mortality.js';
import { JOBS, STAT_KEYS } from './systems.js';
import { WEALTH_SHORT } from './birth.js';

export const EDU_LABELS = {
  none: '未受正式教育', primary: '小學', secondary: '中學', tertiary: '大學', graduate: '研究所',
};

export const STAT_LABELS = { health: '健康', happiness: '幸福', knowledge: '知識', wealth: '財富', social: '人際' };

const round1 = (x) => Math.round(x * 10) / 10;

/** Peak / mean per stat from the history rows. */
function statDigest(history) {
  const out = {};
  for (const k of STAT_KEYS) {
    let peak = history[0] || { age: 0, [k]: 0 }, sum = 0;
    for (const r of history) { if (r[k] > peak[k]) peak = r; sum += r[k]; }
    out[k] = { peak: peak[k], peakAge: peak.age, mean: history.length ? Math.round(sum / history.length) : 0, final: history.length ? history[history.length - 1][k] : 0 };
  }
  return out;
}

/** Years of life compared with the country average (for this gender and era) and the world average. */
export function lifespanComparison(s) {
  const country = BY_CODE[s.homeCountryCode];
  const table = lifeTable(country, s.gender, s.birthYear);
  const view = eraView(country, s.birthYear);
  const worldLe = worldView(s.birthYear).le;
  const age = s.death ? s.death.age : s.age;
  const countryLe = round1(table.e0);
  void view;
  return {
    age,
    countryLe,
    worldLe,
    vsCountry: round1(age - countryLe),
    vsWorld: round1(age - worldLe),
  };
}

/** Full summary of a life (call after death; works on living lives too for "so far" screens). */
export function getSummary(s) {
  const home = BY_CODE[s.homeCountryCode];
  const cmp = lifespanComparison(s);
  const cause = s.death ? { id: s.death.causeId, label: (CAUSES[s.death.causeId] || CAUSES.other).label, text: s.death.causeText } : null;
  const jobs = (s.flags._jobs || []).map((id) => JOBS[id]?.name).filter(Boolean);
  const countries = (s.flags._countries || [s.homeCountryCode]).map((c) => BY_CODE[c]?.name).filter(Boolean);
  let choices = 0, events = 0, milestones = 0;
  for (const e of s.log) {
    if (e.kind === 'choice') choices++;
    else if (e.kind === 'event') events++;
    else if (e.kind === 'milestone') milestones++;
  }
  const kids = s.children;
  return {
    name: s.name.full,
    gender: s.gender,
    birthYear: s.birthYear,
    deathYear: s.death ? s.death.year : null,
    age: cmp.age,
    era: s.settings.era,
    homeCountry: { code: home.code, name: home.name },
    countryName: BY_CODE[s.countryCode].name,
    // where the person was BORN (they may have moved since: h.setCity / h.migrate change s.city and s.urban)
    urbanBirth: s.flags._birthUrban ?? s.urban,
    birthCity: s.flags._birthCity ?? s.city,
    wealthQ: s.family.wealthQ,
    wealthShort: WEALTH_SHORT[s.family.wealthQ - 1],
    cause,
    suicide: !!cause && cause.id === 'suicide',
    lifespan: cmp,
    education: { level: s.edu.level, label: EDU_LABELS[s.edu.level], years: s.edu.years },
    jobs,
    lastJob: s.work.job ? JOBS[s.work.job].name : null,
    yearsWorked: s.work.yearsWorked,
    partner: s.partner ? { name: s.partner.name, status: s.partner.status } : null,
    marriages: s.flags._married || 0,
    divorces: s.flags._divorces || 0,
    children: { total: kids.length, alive: kids.filter((c) => c.alive).length, names: kids.map((c) => c.name) },
    countriesLived: countries,
    conditions: [...s.conditions],
    smoker: s.smoker,
    highlights: s.highlights.map((h) => ({ ...h })),
    counts: { choices, events, milestones, years: s.age },
    stats: statDigest(s.statHistory),
    statHistory: s.statHistory.map((r) => ({ ...r })),
  };
}
