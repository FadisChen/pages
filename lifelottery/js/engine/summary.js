// End-of-life summary: everything the review screen, share card and "前世記錄" need as plain data.

import { BY_CODE } from '../data/countries.js';
import { eraView, worldView } from '../data/eras.js';
import { CAUSES } from '../data/causes.js';
import { lifeTable } from './mortality.js';
import { JOBS, STAT_KEYS } from './systems.js';
import { WEALTH_SHORT } from './birth.js';
import { FOCUS_BY_ID, focusTimeline } from './focus.js';
import { RELIGION_LABELS } from '../data/religion.js';

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

// ---------------------------------------------------------------------------------------------
// Highlights: the log of "重要時刻" kept during the life is raw (every birthday, every grown-up child ...). The summary
// shows a curated version: no repeats, one birthday, one "left home", at most MAX_HIGHLIGHTS entries chosen by weight.
// ---------------------------------------------------------------------------------------------
export const MAX_HIGHLIGHTS = 12;

const HL_TIERS = [
  [/離世|失去了(孩子|雙親)|結婚|離婚|出生|移居|出國|戰亂|重新安置|難民|返回家鄉|重返家鄉/, 5],
  [/大學畢業|研究所|創業|退休|孫輩|定居|公民|重新取得|考上|通過了/, 4],
  [/升遷|帶領|轉行|換了|完成技職|結業|供|蓋起|有了屬於自己的家/, 2],
  [/生日|長大離家|寫下|回憶|老照片|任性|才藝|寫了一封信|旅行|心願|留下了一段/, 1],
];

function highlightWeight(text) {
  for (const [re, w] of HL_TIERS) if (re.test(text)) return w;
  return 3;
}

/** Curate a raw highlight list (chronological, as kept in the life state). Pure; the life state is not touched. */
export function curateHighlights(raw, max = MAX_HIGHLIGHTS) {
  const seen = new Set();
  let list = [];
  for (const h of raw) {
    if (!h || !h.text || seen.has(h.text)) continue;
    seen.add(h.text);
    list.push({ ...h });
  }
  // one "grown-up child left home" is enough (the others add nothing to the story), and only the last birthday counts
  let left = false;
  list = list.filter((h) => { if (/長大離家。$/.test(h.text)) { if (left) return false; left = true; } return true; });
  const bdays = list.filter((h) => /^度過了\d+歲生日。$/.test(h.text));
  if (bdays.length) {
    const keep = bdays[bdays.length - 1];
    const others = list.length - bdays.length;
    list = list.filter((h) => !bdays.includes(h) || (h === keep && others < 8));
  }
  // "離婚。" (the system line) and "結束了一段婚姻。" (a divorce event) tell the same thing
  list = list.filter((h) => !(h.text === '結束了一段婚姻。' && list.some((o) => o.text === '離婚。' && Math.abs(o.year - h.year) <= 2)));
  // too many: drop the least important, the ones in the middle of the life first
  while (list.length > max) {
    const lo = Math.min(...list.map((h) => highlightWeight(h.text)));
    const cand = list.map((h, i) => ({ h, i })).filter(({ h }) => highlightWeight(h.text) === lo);
    const mid = (list.length - 1) / 2;
    cand.sort((a, b) => Math.abs(a.i - mid) - Math.abs(b.i - mid));
    list.splice(cand[0].i, 1);
  }
  return list;
}

/** The single most telling highlight (for the share card): highest weight, the later one on a tie. */
export function featuredHighlight(list) {
  let best = null, bw = -1;
  for (const h of list) { const w = highlightWeight(h.text); if (w >= bw) { best = h; bw = w; } }
  return best;
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
  const highlights = curateHighlights(s.highlights);
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
    religion: { id: s.religion || 'none', label: RELIGION_LABELS[s.religion] || RELIGION_LABELS.none },
    focus: { id: s.focus || 'balance', label: (FOCUS_BY_ID[s.focus] || FOCUS_BY_ID.balance).label },
    focusTimeline: focusTimeline(s).segments,
    focusYears: focusTimeline(s).years,
    highlights,
    featuredHighlight: featuredHighlight(highlights),
    counts: { choices, events, milestones, years: s.age },
    stats: statDigest(s.statHistory),
    statHistory: s.statHistory.map((r) => ({ ...r })),
  };
}
