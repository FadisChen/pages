// Life focus ("人生重心"): where a person puts their energy in each stage of life.
//
//   state.focus         'balance' | 'study' | 'work' | 'family' | 'health' | 'self'   (default 'balance')
//   state.focusHistory  [{ age, focus }]  one row per change (the first row is the birth row)
//
// The focus changes three things (PLAN 4.2): the yearly drift of the five stats and a few system probabilities (systems.js,
// mortality.js read FOCUS_FX), and the weights of events by their `tags` (events.js reads focusEventMult). Everything
// that is a number lives in this file, so balance changes are made here.
//
// Effect sizes are deliberately modest: stat nudges of 0.3-1.5 points per year (the stats mean-revert, so they settle at
// roughly 3-4 times the nudge), system probabilities within +/-25 %, event weights between 0.6 and 1.8.

import { hash01 } from './rng.js';

export const FOCI = [
  { id: 'balance', label: '平衡', desc: '什麼都顧一點，沒有特別偏重。', ages: [0, 120] },
  { id: 'study', label: '學業', desc: '把心力放在讀書與學習上。知識長得快、更容易繼續升學，代價是玩樂和朋友少一點。', ages: [6, 30] },
  { id: 'work', label: '工作', desc: '把重心放在事業與收入。賺得多、升遷快，健康與家人的時間會被擠壓。', ages: [15, 120] },
  { id: 'family', label: '家庭', desc: '把時間留給伴侶、孩子與家人。人際與幸福更豐厚，收入多半少一點。', ages: [16, 120] },
  { id: 'health', label: '健康', desc: '認真照顧身體：運動、睡眠、檢查。身體衰退得慢，風險略低，花費也多一點。', ages: [0, 120] },
  { id: 'self', label: '興趣與自我', desc: '留時間給興趣、旅行與創作。幸福感更高，財富會少一點。', ages: [10, 120] },
];

export const FOCUS_IDS = FOCI.map((f) => f.id);
export const FOCUS_BY_ID = Object.fromEntries(FOCI.map((f) => [f.id, f]));

/** Ages at which a new life stage starts and the player is asked for a focus (advanceYear returns `focusPrompt: true`). */
export const FOCUS_PROMPT_AGES = [6, 12, 18, 25, 40, 60];

/** Life-stage labels for the focus prompts / timeline, keyed by the age at which the stage begins. */
export const FOCUS_STAGES = [
  { from: 0, to: 5, label: '幼年' }, { from: 6, to: 11, label: '小學時期' }, { from: 12, to: 17, label: '少年時期' },
  { from: 18, to: 24, label: '青年初期' }, { from: 25, to: 39, label: '壯年' }, { from: 40, to: 59, label: '中年' }, { from: 60, to: 120, label: '晚年' },
];

export const isFocusAvailable = (id, age) => {
  const f = FOCUS_BY_ID[id];
  return !!f && age >= f.ages[0] && age <= f.ages[1];
};

/** The foci open to this person at their current age. */
export function availableFoci(s) {
  return FOCI.filter((f) => s.age >= f.ages[0] && s.age <= f.ages[1]);
}

/**
 * Set the focus. An id that does not exist or is not open at the current age falls back to 'balance'. Writes a row to
 * `focusHistory` when the focus changes and clears the stage prompt (`flags._focusPrompt`). Returns the focus now in effect.
 */
export function setFocus(s, id) {
  const next = isFocusAvailable(id, s.age) ? id : 'balance';
  if (!Array.isArray(s.focusHistory) || !s.focusHistory.length) s.focusHistory = [{ age: 0, focus: FOCUS_BY_ID[s.focus] ? s.focus : 'balance' }];
  const hist = s.focusHistory;
  const last = hist[hist.length - 1];
  if (s.focus !== next || last.focus !== next) {
    s.focus = next;
    // a second change in the same year replaces the first; a change back to the previous focus removes the row
    if (last.age === s.age) last.focus = next;
    else hist.push({ age: s.age, focus: next });
    if (hist.length > 1 && hist[hist.length - 2].focus === hist[hist.length - 1].focus) hist.pop();
  }
  delete s.flags._focusPrompt;
  return s.focus;
}

/** Old saves: make sure the focus fields exist (everything loads as 'balance'). */
export function ensureFocus(s) {
  if (!FOCUS_BY_ID[s.focus]) s.focus = 'balance';
  if (!Array.isArray(s.focusHistory) || !s.focusHistory.length) s.focusHistory = [{ age: 0, focus: s.focus }];
  return s;
}

/** A focus that is no longer open (e.g. 'study' after 30) lapses to 'balance'. Called every year by advanceYear. */
export function lapseFocus(s) {
  if (!isFocusAvailable(s.focus, s.age)) setFocus(s, 'balance');
}

// ---------------------------------------------------------------------------------------------
// Auto-choice
// ---------------------------------------------------------------------------------------------

/**
 * A plausible focus for the person right now, from age, circumstances and income. Deterministic for a given life and age
 * (a hash, not the random stream), so it never changes the rest of the life and can be called repeatedly (UI countdown).
 */
export function autoFocus(s) {
  const age = s.age;
  const kids = s.children.some((c) => c.alive && s.year - c.birthYear <= 12);
  const partner = !!s.partner && (s.partner.status === 'dating' || s.partner.status === 'married');
  const working = s.work.status === 'employed' || s.work.status === 'self';
  const sick = s.stats.health < 45 || s.conditions.length >= 2;
  const w = { balance: 0, study: 0, work: 0, family: 0, health: 0, self: 0 };
  const rich = s.stats.wealth >= 65;
  if (age < 12) { w.balance = 5; w.study = 3.5; w.health = 1.5; }
  else if (age < 18) { w.study = 5; w.balance = 3; w.self = 1.2; w.health = 0.8; if (!s.edu.inSchool) { w.study = 0.8; w.work = 4; } }
  else if (age < 25) {
    if (s.edu.inSchool) { w.study = 4.5; w.balance = 2; w.self = 1.5; w.work = 1.5; }
    else { w.work = 5; w.balance = 2; w.family = partner ? 2.5 : 1; w.self = 1.2; w.study = s.edu.years < 12 ? 0.5 : 0.8; }
  } else if (age < 40) {
    w.work = working ? 4 : 1.5; w.family = (partner || kids ? 4 : 1.2) + (kids ? 1.5 : 0); w.balance = 2; w.self = 1.2; w.health = 0.6; w.study = s.edu.inSchool ? 2 : 0;
  } else if (age < 60) {
    w.work = working ? 3.2 : 0.8; w.family = partner || kids ? 3 : 1.2; w.health = 2; w.balance = 2; w.self = 1.5;
  } else {
    w.health = 3.5; w.family = partner || s.children.some((c) => c.alive) ? 3 : 1.2; w.self = 2.5; w.balance = 2; w.work = working ? 1.2 : 0;
  }
  if (sick) w.health = (w.health || 0.5) * 3;
  if (rich) { w.self *= 1.4; w.work *= 0.85; }
  else if (s.stats.wealth <= 25 && age >= 18) { w.work *= 1.5; w.self *= 0.7; }
  if (age >= 25 && s.stats.happiness < 40) { w.self *= 1.5; w.family *= 1.3; }
  const ids = FOCI.filter((f) => age >= f.ages[0] && age <= f.ages[1] && w[f.id] > 0).map((f) => f.id);
  if (!ids.length) return 'balance';
  const total = ids.reduce((a, id) => a + w[id], 0);
  let r = hash01(`${s.seed}|focus|${age}|${s.name.full}`) * total;
  for (const id of ids) { if (r < w[id]) return id; r -= w[id]; }
  return ids[ids.length - 1];
}

// ---------------------------------------------------------------------------------------------
// Effects (numbers read by systems.js and mortality.js)
// ---------------------------------------------------------------------------------------------

const NONE = Object.freeze({});

/**
 * Per-focus effect table. All fields optional; absent = no effect.
 *   drift      additive nudge to a stat each year (after the usual mean-reverting drift)
 *   healthT    nudge to the health target (stat points) -> slower or faster decline
 *   pctl       shift of the income-percentile target while employed (0.06 = six percentile points, ~ +12 % income)
 *   risk       additive on the log of the personal mortality multiplier (mortality.js)
 *   dropout    multiplier on the yearly school dropout hazard
 *   tertiary   multiplier on the chance of continuing into university after secondary school
 *   enroll     multiplier on the chance of ever enrolling in primary school (decided at school age)
 *   returnEd   yearly chance that an adult (18-30) who is not studying goes back to education
 *   dateShift  years added to the age when the relationship / marriage plan is compared (family earlier, study later)
 *   informal   multiplier on the chance of an unplanned relationship among people who plan never to marry
 *   breakup    multiplier on the yearly break-up hazard of a dating couple
 *   divorce    multiplier on the yearly divorce hazard
 *   fertility  multiplier on the yearly birth probability
 *   layoff     multiplier on the yearly layoff hazard
 *   career     multiplier on the yearly chance of a career move
 *   retire     multiplier on the yearly retirement hazard
 *   smokeStart multiplier on the yearly chance of starting to smoke
 *   smokeQuit  multiplier on the yearly chance of quitting
 *   condition  multiplier on the onset of chronic conditions
 */
export const FOCUS_FX = {
  balance: NONE,
  study: {
    drift: { knowledge: 1.0, happiness: -0.6, social: -0.6 }, healthT: -0.5, pctl: -0.01, dropout: 0.8, tertiary: 1.25, enroll: 1.12, returnEd: 0.045,
    dateShift: -1, informal: 0.8, breakup: 1.1, fertility: 0.8, career: 0.9,
  },
  work: {
    drift: { health: -0.5, social: -0.4 }, healthT: -1.5, pctl: 0.06, risk: 0.03, dropout: 1.15, tertiary: 0.85, dateShift: -0.5, informal: 0.85, breakup: 1.1,
    divorce: 1.15, fertility: 0.8, layoff: 0.8, career: 1.25, retire: 0.75, smokeStart: 1.1, condition: 1.1,
  },
  family: {
    drift: { social: 1.3, happiness: 1.0 }, pctl: -0.025, risk: -0.01, dropout: 1.1, tertiary: 0.9, dateShift: 1, informal: 1.25, breakup: 0.8, divorce: 0.8,
    fertility: 1.25, career: 0.85, retire: 1.15,
  },
  health: {
    drift: { health: 0.9, happiness: 0.2 }, healthT: 2, pctl: -0.012, risk: 0, retire: 1.1, smokeStart: 0.75, smokeQuit: 1.25, condition: 0.88,
  },
  self: {
    drift: { happiness: 1.5, knowledge: 0.3 }, pctl: -0.018, tertiary: 0.95, fertility: 0.9, career: 0.9, retire: 1.1, smokeStart: 1.1,
  },
};

/** Effect table of the person's current focus (an object, never undefined). */
export function fxOf(s) {
  const f = FOCUS_FX[s.focus];
  if (!f) return NONE;
  if (s.focus === 'work' && s.work.status === 'retired') return NONE; // nothing to put energy into any more
  return f;
}

// ---------------------------------------------------------------------------------------------
// Event weights by tag
// ---------------------------------------------------------------------------------------------

/**
 * Multiplier on an event's weight (and yearly `chance`) by focus and tag. The multipliers of all matching tags are
 * multiplied together and the result is clamped to [0.6, 1.8] (FOCUS_EVENT_CLAMP).
 *
 * Tag vocabulary (see engine README): study = school education exam learning books research mentor language talent;
 * work = work job career money trade labor business office skilled; family = family love marriage children parenting
 * pregnancy siblings grandchildren caregiving home parents; wellness = exercise checkup lifestyle habit screening vaccine
 * diet wellness; trouble = illness accident chronic addiction disease; self = hobby travel creative art fun play
 * reflection identity independence music sports friends.
 */
export const FOCUS_EVENT_MULT = {
  balance: {},
  study: {
    school: 1.5, education: 1.6, study: 1.6, exam: 1.5, learning: 1.5, books: 1.3, research: 1.3, mentor: 1.25, talent: 1.2, language: 1.25,
    love: 0.85, fun: 0.8, hobby: 0.8, travel: 0.8, friends: 0.9, play: 0.9,
  },
  work: {
    work: 1.4, job: 1.4, career: 1.7, money: 1.2, trade: 1.3, labor: 1.2, business: 1.4, office: 1.3, skilled: 1.2,
    family: 0.85, children: 0.85, love: 0.85, hobby: 0.8, travel: 0.8, fun: 0.85, wellness: 0.85,
  },
  family: {
    family: 1.3, love: 1.5, marriage: 1.6, children: 1.5, parenting: 1.5, pregnancy: 1.4, siblings: 1.3, grandchildren: 1.4, caregiving: 1.25,
    home: 1.25, parents: 1.25, career: 0.8, business: 0.9, travel: 0.85,
  },
  health: {
    exercise: 1.7, checkup: 1.7, lifestyle: 1.5, habit: 1.4, screening: 1.5, vaccine: 1.3, diet: 1.5, wellness: 1.6,
    illness: 0.8, accident: 0.85, chronic: 0.85, addiction: 0.8, disease: 0.85,
  },
  self: {
    hobby: 1.7, travel: 1.7, creative: 1.7, art: 1.6, fun: 1.4, play: 1.3, reflection: 1.4, identity: 1.3, independence: 1.3, music: 1.5, sports: 1.3,
    friends: 1.15, career: 0.85, work: 0.9, money: 0.9,
  },
};

export const FOCUS_EVENT_CLAMP = [0.6, 1.8];

/** Weight multiplier for an event with `tags` under the given focus (1 when nothing matches). */
export function focusEventMult(focus, tags) {
  const table = FOCUS_EVENT_MULT[focus];
  if (!table || !tags || !tags.length) return 1;
  let m = 1;
  for (const t of tags) { const v = table[t]; if (v) m *= v; }
  return m < FOCUS_EVENT_CLAMP[0] ? FOCUS_EVENT_CLAMP[0] : m > FOCUS_EVENT_CLAMP[1] ? FOCUS_EVENT_CLAMP[1] : m;
}

// ---------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------

/**
 * The focus through the life as a timeline: merged segments { fromAge, toAge, focus, label } up to the age reached (age at death
 * for a finished life), plus the years spent in each focus.
 */
export function focusTimeline(s) {
  const end = s.death ? s.death.age : s.age;
  const hist = (Array.isArray(s.focusHistory) && s.focusHistory.length ? s.focusHistory : [{ age: 0, focus: 'balance' }]).slice().sort((a, b) => a.age - b.age);
  const segs = [];
  hist.forEach((row, i) => {
    const from = i === 0 ? 0 : row.age;
    const next = hist[i + 1];
    const to = next ? Math.max(from, next.age - 1) : end;
    if (from > end) return;
    const last = segs[segs.length - 1];
    if (last && last.focus === row.focus) last.toAge = Math.min(to, end);
    else segs.push({ fromAge: from, toAge: Math.min(to, end), focus: row.focus, label: (FOCUS_BY_ID[row.focus] || FOCUS_BY_ID.balance).label });
  });
  const years = {};
  for (const sg of segs) years[sg.focus] = (years[sg.focus] || 0) + (sg.toAge - sg.fromAge + 1);
  return { segments: segs, years };
}
