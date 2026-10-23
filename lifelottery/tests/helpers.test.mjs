// Tests for the event helpers added in Phase 3A (newPartner, endRelationship, setUrban/setCity, enroll,
// inTertiary, incomeAt, stable, recentLog), event-level `schedule` on choice events, and death ordering.
// Run with: node --test tests/*.test.mjs   (from lifelottery/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLife, advanceYear, choose } from '../js/engine/life.js';
import { makeHelpers, HELPER_NAMES } from '../js/engine/helpers.js';
import { getEvent, validateEvents, runEvents, EVENTS } from '../js/engine/events.js';
import { BY_CODE, COUNTRIES } from '../js/data/countries.js';
import { eraView, incomeGroupAt, presentYear } from '../js/data/eras.js';
import { getPool } from '../js/data/names.js';
import { getSummary } from '../js/engine/summary.js';
import { describeBirth } from '../js/engine/birth.js';

/** A life advanced to `age` (auto choices); stops early if the person dies. */
function lifeAt(seed, age, opts = {}, settings = { era: 'present' }) {
  const s = createLife(settings, seed, opts);
  while (s.alive && s.age < age) advanceYear(s, { auto: true });
  return s;
}
const H = (s) => makeHelpers(s);

test('helpers: all Phase 3A helpers exist', () => {
  for (const n of ['newPartner', 'endRelationship', 'setUrban', 'setCity', 'enroll', 'reenroll', 'inTertiary', 'incomeAt', 'stable', 'recentLog']) {
    assert.ok(HELPER_NAMES.includes(n), `missing helper ${n}`);
  }
});

// ---------------------------------------------------------------------------------------------
// newPartner / endRelationship
// ---------------------------------------------------------------------------------------------

test('newPartner: dating/married partner with a culture-appropriate name and an age near the person', () => {
  const kanji = /^[\u3040-\u30ff\u3005\u4e00-\u9fff]+$/;
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const s = lifeAt(`np-jpn-${i}`, 24, { countryCode: 'JPN' });
    if (!s.alive) continue;
    if (s.partner && (s.partner.status === 'dating' || s.partner.status === 'married')) s.partner = null;
    const h = H(s);
    const p = h.newPartner({ status: 'dating' });
    assert.equal(p, s.partner);
    assert.equal(p.status, 'dating');
    assert.ok(h.hasPartner() && !h.married());
    assert.ok(kanji.test(p.name), `Japanese life should get a Japanese partner name, got ${p.name}`);
    assert.ok(Math.abs(p.age - s.age) <= 12, `partner age ${p.age} vs ${s.age}`);
    assert.ok(typeof s.flags._partnerPool === 'string' && s.flags._partnerGt);
    n++;
  }
  assert.ok(n >= 30);
});

test('newPartner: gender and married status are honoured; an active partner is kept', () => {
  const s = lifeAt('np-married', 26, { countryCode: 'NGA', gender: 'M' });
  s.partner = null;
  const h = H(s);
  const p = h.newPartner({ gender: 'F', status: 'married' });
  assert.equal(p.gender, 'F');
  assert.equal(p.status, 'married');
  assert.ok(h.married());
  assert.equal(s.flags._married, 1);
  const again = h.newPartner({ gender: 'M', status: 'dating' });
  assert.equal(again, p, 'an active partner must not be replaced silently');
  // setPartner without a name now draws a real name instead of 他/她
  s.partner = null;
  h.setPartner({ status: 'dating' });
  assert.ok(s.partner.name.length > 1 && !/^[他她]$/.test(s.partner.name));
});

test('endRelationship: clears the partner, resets plan flags and imposes a cooldown', () => {
  let checked = 0;
  for (let i = 0; i < 25; i++) {
    const s = lifeAt(`er-${i}`, 22, { countryCode: i % 2 ? 'USA' : 'BRA' });
    if (!s.alive || s.age < 22) continue;
    s.partner = null;
    s.flags._dateAt = 20; // the plan says: date now ...
    s.flags._marryAt = 30; // ... and marry at 30
    const h = H(s);
    h.newPartner({ status: 'dating' });
    assert.equal(h.endRelationship(3), true);
    assert.equal(s.partner, null);
    assert.equal(s.flags._coolUntil, s.age + 3);
    assert.ok(s.flags._dateAt >= s.flags._coolUntil, `dating plan must move after the cooldown (${s.flags._dateAt})`);
    assert.ok(s.flags._marryAt > s.flags._dateAt, 'the wedding comes after the next relationship');
    assert.equal(h.endRelationship(), false, 'nothing to end any more');
    // The systems must not start a new relationship during the cooldown.
    for (let y = 0; y < 3 && s.alive; y++) {
      advanceYear(s, { auto: true });
      if (s.alive && s.age < s.flags._coolUntil) assert.equal(s.partner, null, `new partner at ${s.age} inside the cooldown`);
    }
    checked++;
  }
  assert.ok(checked >= 15);
});

test('endRelationship: without it the systems restart dating immediately (control), a marriage is divorced', () => {
  const s = lifeAt('er-control', 22, { countryCode: 'USA' });
  s.partner = null;
  s.flags._dateAt = 20; s.flags._marryAt = 40; s.flags._coolUntil = 0;
  advanceYear(s, { auto: true });
  assert.ok(s.partner, 'control: with an overdue dating plan a partner appears at once');
  const h = H(s);
  h.newPartner({ status: 'married', replace: true });
  s.partner.status = 'married';
  assert.equal(h.endRelationship(), true);
  assert.equal(s.partner.status, 'divorced', 'a marriage ends as a divorce');
});

// ---------------------------------------------------------------------------------------------
// setUrban / setCity / migrate
// ---------------------------------------------------------------------------------------------

test('setUrban and setCity: internal moves', () => {
  const s = createLife({ era: 'present' }, 'city-1', { countryCode: 'IND', urban: false });
  const h = H(s);
  assert.equal(h.urban(), false);
  h.setUrban(true);
  assert.equal(h.urban(), true);
  assert.equal(s.urban, true);
  h.setUrban(false);
  assert.equal(s.urban, false);
  const seen = new Set();
  for (let i = 0; i < 60; i++) { h.setCity(); seen.add(h.city()); }
  for (const c of seen) assert.ok(BY_CODE.IND.cities.includes(c), `${c} is not an Indian city`);
  assert.ok(seen.size >= 2, 'a random city should vary');
  h.setCity('某某鎮');
  assert.equal(h.city(), '某某鎮');
});

test('migrate: the person moves to a city of the new country', () => {
  const s = lifeAt('mig-1', 25, { countryCode: 'TWN' });
  const h = H(s);
  assert.ok(h.migrate('DEU'));
  assert.ok(BY_CODE.DEU.cities.includes(s.city), `city ${s.city} should be German`);
  assert.equal(s.countryCode, 'DEU');
  // the review still reports the place of BIRTH
  const born = createLife({ era: 'present' }, 'mig-1', { countryCode: 'TWN' });
  const sum = getSummary(s);
  assert.ok(BY_CODE.TWN.cities.includes(sum.birthCity), `birth city ${sum.birthCity}`);
  assert.equal(sum.birthCity, born.city);
  assert.equal(describeBirth(s).city, born.city);
});

// ---------------------------------------------------------------------------------------------
// enroll / inTertiary
// ---------------------------------------------------------------------------------------------

function adultNoSchool(seed, years, extra = {}) {
  const s = lifeAt(seed, 28, { countryCode: 'BRA' });
  s.edu.inSchool = false; s.edu.years = years;
  s.edu.level = years <= 6 ? 'primary' : years <= 12 ? 'secondary' : 'tertiary';
  delete s.flags._adultEd;
  s.flags.drop_school = false;
  Object.assign(s.work, extra);
  return s;
}

test('enroll: an adult goes back to school, advances, and gets the diploma', () => {
  let completed = 0, tried = 0;
  for (let i = 0; i < 30; i++) {
    const s = adultNoSchool(`enroll-${i}`, 8);
    if (!s.alive) continue;
    tried++;
    const h = H(s);
    assert.equal(h.inSchool(), false);
    assert.equal(h.enroll('secondary'), true);
    assert.equal(h.inSchool(), true);
    assert.equal(h.inTertiary(), false, 'secondary level is not tertiary');
    assert.equal(h.enroll('secondary'), false, 'already studying');
    const k0 = s.stats.knowledge;
    for (let y = 0; y < 5 && s.alive && s.edu.inSchool; y++) advanceYear(s, { auto: true });
    if (!s.alive) continue;
    if (!s.edu.inSchool && s.edu.years >= 12) {
      completed++;
      assert.ok(s.log.some((e) => e.title === '取得高中同等學力'), 'diploma entry');
      assert.ok(s.stats.knowledge >= k0 - 1);
      assert.ok(h.eduAtLeast('secondary'));
    }
  }
  assert.ok(tried >= 20 && completed / tried > 0.6, `most second-chance students finish (${completed}/${tried})`);
});

test('enroll: quiet enrolments never drop out by themselves and write no system log; flags report the outcome', () => {
  let diplomas = 0;
  for (let i = 0; i < 30; i++) {
    const s = adultNoSchool(`enroll-quiet-${i}`, 6);
    if (!s.alive) continue;
    const h = H(s);
    assert.equal(h.enroll('secondary', { quiet: true }), true);
    const logLen = s.log.length;
    for (let y = 0; y < 4 && s.alive; y++) advanceYear(s, { auto: true });
    if (!s.alive) continue;
    if (s.edu.inSchool) continue; // a later event ("back to school") started the next level and replaced the plan: not what is tested here
    assert.equal(s.edu.inSchool, false, 'finished in 3 school-years-pairs');
    assert.ok(s.edu.years >= 12);
    assert.ok(s.flags.adult_diploma > 0, 'adult_diploma flag');
    assert.ok(!s.flags.adult_dropout);
    assert.ok(!s.log.slice(logLen).some((e) => e.title === '取得高中同等學力'), 'quiet: no system diploma entry');
    diplomas++;
  }
  assert.ok(diplomas >= 20);
  // an event can end the enrolment itself
  const s = adultNoSchool('enroll-quiet-drop', 8);
  const h = H(s);
  h.enroll('secondary', { quiet: true });
  h.dropOut();
  assert.equal(h.inSchool(), false);
  assert.equal(s.flags._adultEd, undefined);
  // re-enrolling clears the old outcome flags
  s.flags.adult_diploma = 2000;
  assert.equal(h.reenroll(), true);
  assert.equal(s.flags.adult_diploma, undefined);
});

test('enroll: tertiary study counts as inTertiary; default level is the next one; no-ops', () => {
  const s = adultNoSchool('enroll-uni', 12);
  const h = H(s);
  assert.equal(h.enroll('secondary'), false, 'already has secondary');
  assert.equal(h.reenroll(), true, 'default level = tertiary');
  assert.equal(h.inTertiary(), true);
  assert.equal(s.flags._adultEd.target, 16);
  const done = adultNoSchool('enroll-grad', 18);
  assert.equal(H(done).enroll(), false, 'nothing above a graduate degree');
  assert.equal(H(done).enroll('bogus'), false);
  // employed people keep their job while studying
  const w = adultNoSchool('enroll-job', 9, { status: 'employed', job: 'clerk' });
  H(w).enroll('secondary');
  assert.equal(w.work.status, 'employed');
});

// ---------------------------------------------------------------------------------------------
// incomeAt / byIncome
// ---------------------------------------------------------------------------------------------

test('incomeAt: era-adjusted income group from GDP', () => {
  const now = presentYear();
  for (const c of COUNTRIES) assert.equal(incomeGroupAt(c, now), c.income, `${c.code}: present income group must equal the World Bank group`);
  // South Korea in 1975 is not high income (it is today), the USA is.
  assert.notEqual(incomeGroupAt(BY_CODE.KOR, 1975), 'H');
  assert.equal(BY_CODE.KOR.income, 'H');
  assert.equal(incomeGroupAt(BY_CODE.USA, 1975), 'H');
  assert.equal(incomeGroupAt(BY_CODE.CHN, 1975), 'L');
  // monotone-ish: groups never fall between 1990 and 2060 for these growers
  const order = ['L', 'LM', 'UM', 'H'];
  for (const code of ['KOR', 'CHN', 'IND', 'VNM', 'TWN']) {
    assert.ok(order.indexOf(incomeGroupAt(BY_CODE[code], 2060)) >= order.indexOf(incomeGroupAt(BY_CODE[code], 1990)), code);
  }
  // through the helper, for a life that lives in that year
  const s = createLife({ era: 'past' }, 'income-kor', { countryCode: 'KOR', birthYear: 1960 });
  s.year = 1975; s.age = 15;
  const h = H(s);
  assert.notEqual(h.incomeAt(), 'H');
  assert.equal(h.income(), 'H', 'income() stays the static group');
  const txt = h.byIncome({ L: 'l', LM: 'lm', UM: 'um', H: 'h' });
  assert.equal(txt, { L: 'l', LM: 'lm', UM: 'um', H: 'h' }[h.incomeAt()], 'byIncome follows incomeAt');
});

test('eras: values stay continuous across the 1970 and 2050 anchors', () => {
  for (const c of COUNTRIES) {
    for (const [a, b] of [[1969, 1970], [1970, 1971], [2049, 2050], [2050, 2051]]) {
      const x = eraView(c, a), y = eraView(c, b);
      assert.ok(Math.abs(x.le.F - y.le.F) < 1.5, `${c.code} le jump ${a}->${b}: ${x.le.F} ${y.le.F}`);
      assert.ok(Math.abs(x.tfr - y.tfr) < 0.5, `${c.code} tfr jump ${a}->${b}`);
      assert.ok(y.gdp / x.gdp < 1.35 && y.gdp / x.gdp > 0.7, `${c.code} gdp jump ${a}->${b}: ${x.gdp} ${y.gdp}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// stable / recentLog
// ---------------------------------------------------------------------------------------------

test('stable: deterministic per life and key, consumes no randomness, tracks p', () => {
  const s = createLife({ era: 'present' }, 'stable-1', { countryCode: 'JPN' });
  const h = H(s);
  const rngBefore = JSON.stringify(s.rng);
  const a = h.stable('tsunami', 0.5);
  for (let i = 0; i < 20; i++) assert.equal(h.stable('tsunami', 0.5), a, 'same answer every time');
  assert.equal(JSON.stringify(s.rng), rngBefore, 'rng must not be consumed');
  assert.equal(h.stable('x', 0), false);
  assert.equal(h.stable('x', 1), true);
  assert.equal(h.stable('x', -3), false);
  assert.equal(h.stable('x', 7), true);
  // a monotone threshold: if true at p, then true at larger p
  for (let i = 0; i < 50; i++) {
    const t = createLife({ era: 'present' }, `stable-m-${i}`, { countryCode: 'USA' });
    const g = H(t);
    if (g.stable('k', 0.2)) assert.ok(g.stable('k', 0.6));
  }
  // frequency over many lives and independence of keys
  let hits = 0, both = 0, other = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const t = createLife({ era: 'present' }, `stable-f-${i}`, { countryCode: 'USA' });
    const g = H(t);
    const x = g.stable('A', 0.3), y = g.stable('B', 0.3);
    if (x) hits++;
    if (y) other++;
    if (x && y) both++;
  }
  assert.ok(Math.abs(hits / N - 0.3) < 0.03, `frequency ${hits / N}`);
  assert.ok(Math.abs(other / N - 0.3) < 0.03, `frequency ${other / N}`);
  assert.ok(Math.abs(both / N - 0.09) < 0.025, `joint ${both / N} (independent keys)`);
  // a different life gives (eventually) a different answer
  const answers = new Set();
  for (let i = 0; i < 40; i++) answers.add(H(createLife({ era: 'present' }, `stable-d-${i}`)).stable('same-key', 0.5));
  assert.equal(answers.size, 2);
});

test('recentLog: finds log entries by title or kind within a time window', () => {
  const s = createLife({ era: 'present' }, 'log-1', { countryCode: 'USA' });
  s.age = 30;
  s.log.push({ age: 28, year: 2024, kind: 'event', title: '母親過世', text: 'x' });
  s.log.push({ age: 29, year: 2025, kind: 'milestone', title: '結婚', text: 'y' });
  s.log.push({ age: 30, year: 2026, kind: 'year', title: '30 歲', text: 'z' });
  const h = H(s);
  assert.equal(h.recentLog('母親過世', 5).age, 28);
  assert.equal(h.recentLog('母親過世', 1), null, 'two years ago is outside a 1-year window');
  assert.equal(h.recentLog(['父親過世', '母親過世'], 2).title, '母親過世');
  assert.equal(h.recentLog('milestone', 1).title, '結婚', 'kind matches too');
  assert.equal(h.recentLog('milestone').title, '結婚', 'default window is unlimited');
  assert.equal(h.recentLog('離婚'), null);
  assert.ok(h.recentLog('year', 0));
});

// ---------------------------------------------------------------------------------------------
// Engine: event-level schedule on choice events; death ordering
// ---------------------------------------------------------------------------------------------

/** Put the life into the pending state of the choice event `id` (as if it had just been presented). */
function presentManually(s, id) {
  const ev = getEvent(id);
  s.flags._choice = { eventId: id, title: ev.title, text: 'test', options: ev.choices.map((c, i) => ({ index: i, label: c.label })) };
  return ev;
}

test('event-level schedule on a choice event is honoured when the choice is resolved', () => {
  const ev = getEvent('seed_chores_or_play');
  assert.ok(ev.choices && !ev.schedule);
  ev.schedule = [{ id: 'childhood_dog_later', inYears: [2, 2] }];
  try {
    const errors = validateEvents(EVENTS);
    assert.deepEqual(errors, [], 'a schedule on a choice event is valid');
    const s = createLife({ era: 'present' }, 'sched-1', { countryCode: 'USA' });
    s.age = 9;
    presentManually(s, 'seed_chores_or_play');
    const before = s.pending.length;
    choose(s, 0);
    const added = s.pending.slice(before).filter((p) => p.id === 'childhood_dog_later');
    assert.equal(added.length, 1, 'follow-up queued');
    assert.equal(added[0].atAge, 11);
  } finally {
    delete ev.schedule;
  }
});

test('h.die() inside effects: the death is logged after the event narrative', () => {
  const ev = getEvent('seed_chores_or_play');
  const original = ev.choices[0].effects;
  ev.choices[0].effects = (s, h) => { h.log('效果裡的紀錄'); h.die('disaster'); };
  try {
    const s = createLife({ era: 'present' }, 'die-1', { countryCode: 'USA' });
    s.age = 9;
    presentManually(s, 'seed_chores_or_play');
    const r = choose(s, 0);
    assert.equal(s.alive, false);
    assert.equal(r.died, true);
    const kinds = s.log.slice(-3).map((e) => e.kind);
    assert.equal(kinds[kinds.length - 1], 'death', 'the death entry comes last');
    // the engine puts the narrative first and the lines written by the effects after it (Phase 3B), the death always last
    const tail = s.log.slice(-3).map((e) => e.kind);
    assert.ok(tail.indexOf('choice') >= 0 && tail.indexOf('choice') < tail.indexOf('death'), 'the choice result comes before the death');
    assert.ok(s.death && s.death.age === 9);
  } finally {
    ev.choices[0].effects = original;
  }
});

test('h.die() inside a regular event: narrative first, then the death', () => {
  const ev = getEvent('childhood_dog_later');
  const original = ev.effects;
  ev.effects = (s, h) => { h.die('disaster'); };
  try {
    const s = createLife({ era: 'present' }, 'die-2', { countryCode: 'USA' });
    s.age = 8;
    s.pending.push({ id: 'childhood_dog_later', atAge: 8 });
    delete s.seen.childhood_dog_later;
    runEvents(s, H(s)); // the due follow-up fires through the real yearly event pass
    assert.equal(s.alive, false);
    const i = s.log.findIndex((e) => e.title === ev.title);
    const d = s.log.findIndex((e) => e.kind === 'death');
    assert.ok(i >= 0 && d > i, `event entry (${i}) must precede the death entry (${d})`);
  } finally {
    ev.effects = original;
  }
});

// ---------------------------------------------------------------------------------------------
// Culture of children / partners (see names.test.mjs for the pools themselves)
// ---------------------------------------------------------------------------------------------

test('children of a migrant get names from the family culture, not the host country', () => {
  const han = /^[\u4e00-\u9fff]+$/;
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const s = lifeAt(`kids-${i}`, 22, { countryCode: 'TWN' });
    if (!s.alive) continue;
    const h = H(s);
    h.migrate('DEU');
    const c = h.addChild();
    assert.ok(han.test(c.name), `child of a Taiwanese family in Germany: ${c.name}`);
    n++;
  }
  assert.ok(n >= 40);
});

test('children inherit the right name token: father surname (zh), patronymic (am), mother keeps her name (parents)', () => {
  // Chinese family: the child carries the father's family name
  let ok = 0;
  for (let i = 0; i < 40; i++) {
    const s = lifeAt(`fam-zh-${i}`, 20, { countryCode: 'TWN', gender: 'M' });
    if (!s.alive) continue;
    const c = H(s).addChild();
    assert.ok(c.name.startsWith(s.name.family), `${c.name} should start with ${s.name.family}`);
    ok++;
  }
  assert.ok(ok >= 25);
  // Ethiopian (Amharic) family: the child's second name is the father's given name
  let am = 0;
  for (let i = 0; i < 200 && am < 15; i++) {
    const s = createLife({ era: 'present' }, `fam-am-${i}`, { countryCode: 'ETH', gender: 'M' });
    if (s.flags._pool !== 'am') continue;
    // the player's second name is the father's given name, and the father's record agrees
    assert.equal(s.name.family, s.family.father.name.split(' ')[0]);
    const c = H(s).addChild();
    assert.equal(c.name.split(' ')[1], s.name.given, `${c.name} should carry ${s.name.given}`);
    am++;
  }
  assert.ok(am >= 10);
  assert.ok(getPool('am').mode === 'patro');
});

test('siblings do not share a name', () => {
  for (let i = 0; i < 60; i++) {
    const s = createLife({ era: 'present' }, `sib-${i}`, { countryCode: ['USA', 'NGA', 'JPN', 'ETH', 'IND'][i % 5], gender: i % 2 ? 'F' : 'M' });
    const h = H(s);
    for (let k = 0; k < 6; k++) h.addChild();
    const names = s.children.map((c) => c.name);
    assert.equal(new Set(names).size, names.length, `duplicate sibling names: ${names.join(', ')}`);
  }
});
