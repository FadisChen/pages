// Life focus (PLAN 4.2): the API, legality by age, the stage prompts, old-save compatibility, the event-weight table and the
// direction of the effects on whole simulated lives.
//
// Env: LL_FOCUS_N overrides the number of lives per focus in the effect test (default 2000).
// Run with: node --test tests/focus.test.mjs   (from lifelottery/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLife, advanceYear, choose, autoChoose, serialize, deserialize, getStatus, FOCI, availableFoci, setFocus, autoFocus,
} from '../js/engine/life.js';
import { FOCUS_PROMPT_AGES, FOCUS_EVENT_MULT, FOCUS_EVENT_CLAMP, focusEventMult, FOCUS_FX } from '../js/engine/focus.js';
import { getSummary } from '../js/engine/summary.js';
import { annualIncome } from '../js/engine/systems.js';
import ALL_EVENTS from '../js/data/events/index.js';
import { scaled, QUICK } from './lib/scale.mjs';

const IDS = ['balance', 'study', 'work', 'family', 'health', 'self'];
const at = (age, seed = 'f') => { const s = createLife({ era: 'present' }, seed, { countryCode: 'TWN' }); s.age = age; return s; };

test('FOCI: the six foci of PLAN 4.2 with their legal ages', () => {
  assert.deepEqual(FOCI.map((f) => f.id), IDS);
  const ages = Object.fromEntries(FOCI.map((f) => [f.id, f.ages]));
  assert.deepEqual(ages, { balance: [0, 120], study: [6, 30], work: [15, 120], family: [16, 120], health: [0, 120], self: [10, 120] });
  for (const f of FOCI) assert.ok(f.label && f.desc.length > 8, f.id);
});

test('availableFoci: legality by age', () => {
  const ids = (age) => availableFoci(at(age)).map((f) => f.id);
  assert.deepEqual(ids(3), ['balance', 'health']);
  assert.deepEqual(ids(6), ['balance', 'study', 'health']);
  assert.deepEqual(ids(10), ['balance', 'study', 'health', 'self']);
  assert.deepEqual(ids(15), ['balance', 'study', 'work', 'health', 'self']);
  assert.deepEqual(ids(16), IDS);
  assert.deepEqual(ids(30), IDS);
  assert.deepEqual(ids(31), ['balance', 'work', 'family', 'health', 'self']);
  assert.deepEqual(ids(70), ['balance', 'work', 'family', 'health', 'self']);
});

test('setFocus: illegal or unknown ids fall back to balance; changes are written to focusHistory', () => {
  const s = at(8);
  assert.equal(s.focus, 'balance');
  assert.deepEqual(s.focusHistory, [{ age: 0, focus: 'balance' }]);
  assert.equal(setFocus(s, 'work'), 'balance', 'work needs age 15');
  assert.equal(setFocus(s, 'nonsense'), 'balance');
  assert.equal(setFocus(s, 'study'), 'study');
  assert.deepEqual(s.focusHistory, [{ age: 0, focus: 'balance' }, { age: 8, focus: 'study' }]);
  s.age = 12;
  assert.equal(setFocus(s, 'study'), 'study');
  assert.equal(s.focusHistory.length, 2, 'choosing the same focus again writes nothing');
  s.age = 18;
  assert.equal(setFocus(s, 'family'), 'family', 'family is open from 16');
  assert.equal(s.focusHistory[s.focusHistory.length - 1].age, 18);
  assert.equal(s.focusHistory.length, 3);
  s.age = 19;
  assert.equal(setFocus(s, 'health'), 'health');
  assert.equal(s.focusHistory.length, 4);
  // a second change in the same year replaces the first, and going back to the previous focus removes the row
  assert.equal(setFocus(s, 'family'), 'family');
  assert.equal(s.focusHistory.length, 3);
  assert.equal(s.focusHistory.at(-1).focus, 'family');
});

test('a focus that is no longer open lapses to balance (study after 30)', () => {
  const s = createLife({ era: 'present' }, 'lapse', { countryCode: 'DEU', wealthQ: 4 });
  while (s.age < 29) advanceYear(s, { auto: true, autoFocus: false });
  assert.ok(s.alive);
  setFocus(s, 'study');
  assert.equal(s.focus, 'study');
  advanceYear(s, { auto: true, autoFocus: false }); // 30
  assert.equal(s.focus, 'study');
  advanceYear(s, { auto: true, autoFocus: false }); // 31
  assert.equal(s.focus, 'balance');
  assert.equal(s.focusHistory.at(-1).focus, 'balance');
  assert.equal(s.focusHistory.at(-1).age, 31);
});

test('stage prompts: focusPrompt at 6, 12, 18, 25, 40 and 60; the flag survives save/load and is cleared by setFocus', () => {
  assert.deepEqual(FOCUS_PROMPT_AGES, [6, 12, 18, 25, 40, 60]);
  const s = createLife({ era: 'present' }, 'prompts', { countryCode: 'JPN', wealthQ: 4 });
  const seen = [];
  while (s.alive && s.age < 62) {
    const r = advanceYear(s, {}); // manual play: no automatic focus
    if (r.pendingChoice) { choose(s, 0); }
    if (!s.alive) break;
    if (r.focusPrompt) {
      seen.push(s.age);
      assert.equal(s.flags._focusPrompt, true);
      const copy = deserialize(serialize(s));
      assert.equal(copy.flags._focusPrompt, true, 'a reload still asks');
      assert.equal(getStatus(copy).focusPrompt, true);
      if (s.age === 6) { setFocus(s, 'study'); assert.equal(s.flags._focusPrompt, undefined); }
    } else assert.ok(!s.flags._focusPrompt);
  }
  assert.deepEqual(seen, FOCUS_PROMPT_AGES.filter((a) => a <= s.age));
  assert.ok(seen.length >= 3, 'the life lived long enough to be asked several times');
});

test('auto play: advanceYear({ auto: true }) picks the focus itself at each prompt; autoFocus is legal, plausible and deterministic', () => {
  const s = createLife({ era: 'present' }, 'auto-f', { countryCode: 'BRA', wealthQ: 3 });
  while (s.alive && s.age < 70) advanceYear(s, { auto: true });
  const prompts = FOCUS_PROMPT_AGES.filter((a) => a <= s.age);
  assert.ok(prompts.length >= 4);
  assert.ok(!s.flags._focusPrompt || s.age < 6, 'an auto-picked focus clears the prompt');
  for (const row of s.focusHistory) assert.ok(IDS.includes(row.focus));
  // autoFocus never returns a focus the age does not allow, and does not consume the random stream
  for (let age = 0; age <= 90; age++) {
    const t = at(age, `af-${age}`);
    const rngBefore = JSON.stringify(t.rng);
    const f = autoFocus(t);
    assert.ok(availableFoci(t).some((x) => x.id === f), `age ${age}: ${f}`);
    assert.equal(autoFocus(t), f, 'deterministic');
    assert.equal(JSON.stringify(t.rng), rngBefore);
  }
  // plausible: a child studies or stays balanced, a sick elder looks after their health
  const kidFoci = new Set(), elderFoci = new Set();
  for (let i = 0; i < 80; i++) {
    const a = at(8, `kid-${i}`); kidFoci.add(autoFocus(a));
    const b = at(70, `elder-${i}`); b.stats.health = 30; b.work.status = 'retired'; elderFoci.add(autoFocus(b));
  }
  assert.ok([...kidFoci].every((f) => ['balance', 'study', 'health'].includes(f)), [...kidFoci].join());
  assert.ok(elderFoci.has('health'));
});

test('old saves without focus, focusHistory or religion load as balance and keep playing', () => {
  const s = createLife({ era: 'past' }, 'old-save', { countryCode: 'NPL' });
  while (s.alive && s.age < 20) advanceYear(s, { auto: true });
  const old = JSON.parse(serialize(s));
  delete old.focus; delete old.focusHistory; delete old.religion;
  const back = deserialize(JSON.stringify(old));
  assert.equal(back.focus, 'balance');
  assert.deepEqual(back.focusHistory, [{ age: 0, focus: 'balance' }]);
  assert.equal(back.religion, s.religion, 'the religion is re-drawn from the seed, so it is the one a new life would have got');
  assert.ok(getStatus(back).foci.length >= 4);
  while (back.alive && back.age < 45) advanceYear(back, { auto: true });
  assert.ok(back.age >= 25);
  assert.ok(getSummary(back).focusTimeline.length >= 1);
});

test('getSummary: a stage timeline of foci that covers the whole life', () => {
  const s = createLife({ era: 'present' }, 'tl', { countryCode: 'KOR', wealthQ: 4 });
  while (s.alive && s.age < 30) advanceYear(s, { auto: true, autoFocus: false });
  setFocus(s, 'study');
  while (s.alive && s.age < 40) advanceYear(s, { auto: true, autoFocus: false });
  setFocus(s, 'work');
  while (s.alive && s.age < 55) advanceYear(s, { auto: true, autoFocus: false });
  const end = s.death ? s.death.age : s.age;
  const sum = getSummary(s);
  const tl = sum.focusTimeline;
  assert.ok(tl.length >= 2 && tl[0].fromAge === 0);
  assert.equal(tl.at(-1).toAge, end);
  for (let i = 1; i < tl.length; i++) assert.equal(tl[i].fromAge, tl[i - 1].toAge + 1, 'segments are contiguous');
  for (const seg of tl) assert.ok(seg.label && IDS.includes(seg.focus));
  assert.equal(Object.values(sum.focusYears).reduce((a, b) => a + b, 0), end + 1);
  assert.equal(sum.focus.id, s.focus);
});

test('event weights: one table by tag, multipliers between 0.6 and 1.8, balance changes nothing', () => {
  assert.deepEqual(FOCUS_EVENT_CLAMP, [0.6, 1.8]);
  assert.equal(focusEventMult('balance', ['education', 'career']), 1);
  assert.equal(focusEventMult('study', []), 1);
  assert.equal(focusEventMult('study', ['unrelated']), 1);
  assert.ok(focusEventMult('study', ['education']) > 1.4);
  assert.ok(focusEventMult('work', ['career']) > 1.5);
  assert.ok(focusEventMult('self', ['hobby', 'travel', 'creative']) <= 1.8, 'clamped');
  assert.equal(focusEventMult('self', ['hobby', 'travel', 'creative']), 1.8);
  assert.ok(focusEventMult('health', ['illness', 'addiction']) >= 0.6);
  for (const [focus, table] of Object.entries(FOCUS_EVENT_MULT)) for (const [tag, m] of Object.entries(table)) assert.ok(m >= 0.6 && m <= 1.8, `${focus}.${tag}`);
  // the tags of the real events work: every focus favours a decent number of events (hobby, travel and creative events are tagged for self)
  const up = (f) => ALL_EVENTS.filter((e) => focusEventMult(f, e.tags) > 1).length;
  for (const f of ['study', 'work', 'family', 'health', 'self']) assert.ok(up(f) >= 15, `${f}: only ${up(f)} events are favoured`);
  const hobby = ALL_EVENTS.filter((e) => (e.tags || []).some((t) => ['hobby', 'travel', 'creative', 'art'].includes(t)));
  assert.ok(hobby.length >= 8 && hobby.every((e) => focusEventMult('self', e.tags) > 1.3), `${hobby.length} hobby/travel/creative events`);
  const touched = ALL_EVENTS.filter((e) => IDS.some((f) => focusEventMult(f, e.tags) !== 1)).length;
  assert.ok(touched >= 0.7 * ALL_EVENTS.length, `${touched} of ${ALL_EVENTS.length} events react to some focus`);
});

test('effect sizes stay modest: system multipliers within +/-25 %, yearly nudges within +/-1.5', () => {
  for (const [id, fx] of Object.entries(FOCUS_FX)) {
    for (const k of ['dropout', 'tertiary', 'enroll', 'informal', 'breakup', 'divorce', 'fertility', 'layoff', 'career', 'retire', 'smokeStart', 'smokeQuit', 'condition']) {
      if (fx[k] !== undefined) assert.ok(fx[k] >= 0.75 && fx[k] <= 1.25, `${id}.${k} = ${fx[k]}`);
    }
    for (const d of Object.values(fx.drift || {})) assert.ok(Math.abs(d) <= 1.5, `${id} drift ${d}`);
    assert.ok(Math.abs(fx.dateShift || 0) <= 1);
  }
});

// ---------------------------------------------------------------------------------------------
// Direction of the effects on whole lives: the same lives (same seeds), forced to one focus for every year it is open
// ---------------------------------------------------------------------------------------------

const N = Math.max(600, Number(process.env.LL_FOCUS_N) || scaled(2000, 800, 600));
const cache = new Map();

function simulate(focus, n) {
  const key = `${focus}:${n}`;
  if (cache.has(key)) return cache.get(key);
  const acc = { n: 0, edu: 0, tert: 0, inc: 0, incN: 0, death: 0, kids: 0, h40: 0, ha40: 0, so40: 0, kn40: 0, w40: 0, n40: 0, errors: 0 };
  for (let i = 0; i < n; i++) {
    const s = createLife({ era: 'random', drawMode: 'births' }, `fx-${i}`);
    let at30 = null;
    while (s.alive && s.age < 125) {
      if (focus !== 'auto') setFocus(s, focus);
      advanceYear(s, { auto: true, autoFocus: focus === 'auto' });
      if (s.age === 30 && at30 === null) at30 = s.edu.years;
      if (s.alive && s.age >= 30 && s.age <= 50) { acc.inc += annualIncome(s); acc.incN++; }
      if (s.alive && s.age === 40) { acc.h40 += s.stats.health; acc.ha40 += s.stats.happiness; acc.so40 += s.stats.social; acc.kn40 += s.stats.knowledge; acc.w40 += s.stats.wealth; acc.n40++; }
    }
    if (!Number.isFinite(s.stats.health)) acc.errors++;
    acc.n++;
    if (at30 !== null) { acc.edu += at30; if (at30 >= 13) acc.tert++; }
    acc.death += s.death ? s.death.age : s.age;
    acc.kids += s.children.length;
  }
  const r = {
    edu: acc.edu / n, tert: acc.tert / n, income: acc.inc / acc.incN, death: acc.death / n, kids: acc.kids / n,
    health40: acc.h40 / acc.n40, happy40: acc.ha40 / acc.n40, social40: acc.so40 / acc.n40, know40: acc.kn40 / acc.n40, wealth40: acc.w40 / acc.n40, errors: acc.errors,
  };
  cache.set(key, r);
  return r;
}

test(`focus effects on ${N} lives: study -> more education, work -> higher income (same lives, forced focus)`, () => {
  const t0 = Date.now();
  const bal = simulate('balance', N), study = simulate('study', N), work = simulate('work', N);
  console.log(`  balance edu ${bal.edu.toFixed(2)} tert ${(100 * bal.tert).toFixed(1)}% income ${bal.income.toFixed(0)} | study edu ${study.edu.toFixed(2)} tert ${(100 * study.tert).toFixed(1)}% income ${study.income.toFixed(0)} | work edu ${work.edu.toFixed(2)} income ${work.income.toFixed(0)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  assert.equal(bal.errors + study.errors + work.errors, 0);
  assert.ok(study.edu > bal.edu + 0.4, `study ${study.edu.toFixed(2)} vs balance ${bal.edu.toFixed(2)} school years at 30`);
  assert.ok(study.tert > bal.tert + 0.04, `university share ${study.tert.toFixed(3)} vs ${bal.tert.toFixed(3)}`);
  assert.ok(work.income > bal.income * 1.03, `work income ${work.income.toFixed(0)} vs balance ${bal.income.toFixed(0)}`);
  assert.ok(work.edu < study.edu, 'work lives study less than study lives');
  assert.ok(work.health40 < bal.health40 - 1, `work lives are less healthy at 40: ${work.health40.toFixed(1)} vs ${bal.health40.toFixed(1)}`);
  assert.ok(work.wealth40 > bal.wealth40 + 1, 'work lives are richer at 40');
});

test(`focus effects on lives: family -> more children and a fuller social life, health -> longer lives, self -> happier`, () => {
  const n = Math.round(N * 0.6);
  const bal = simulate('balance', n), work = simulate('work', n), fam = simulate('family', n), hea = simulate('health', n), self = simulate('self', n);
  console.log(`  n=${n}: kids balance ${bal.kids.toFixed(2)} work ${work.kids.toFixed(2)} family ${fam.kids.toFixed(2)} | death age balance ${bal.death.toFixed(1)} health ${hea.death.toFixed(1)} family ${fam.death.toFixed(1)} work ${work.death.toFixed(1)}`);
  assert.ok(fam.kids > bal.kids, `children: family ${fam.kids.toFixed(2)} vs balance ${bal.kids.toFixed(2)}`);
  assert.ok(fam.kids > work.kids * 1.05, `children: family ${fam.kids.toFixed(2)} vs work ${work.kids.toFixed(2)}`);
  assert.ok(fam.social40 > bal.social40 + 3 && fam.happy40 > bal.happy40 + 2, 'family: more social, happier');
  assert.ok(fam.income < bal.income * 1.0 + 1, 'family lives earn a little less');
  assert.ok(hea.health40 > bal.health40 + 3, `health stat at 40: ${hea.health40.toFixed(1)} vs ${bal.health40.toFixed(1)}`);
  // PLAN 4.2: the health focus buys at most 1-2 extra years of life, not a miracle
  const gain = hea.death - bal.death;
  // a quick run samples too few lives for a difference of a year or two (the standard error of a mean death age is about two years at this size)
  if (!QUICK) assert.ok(gain > 0.5 && gain < 3.2, `health focus lifespan gain ${gain.toFixed(2)} years`);
  assert.ok(self.happy40 > bal.happy40 + 2.5, `self: happier ${self.happy40.toFixed(1)} vs ${bal.happy40.toFixed(1)}`);
  assert.ok(self.wealth40 < bal.wealth40, 'self lives are a little poorer');
  assert.ok(work.death < hea.death, 'overwork does not extend life');
});
