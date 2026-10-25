// Phase 6A: who decides?  A small child with malaria must not choose between buying medicine and seeing a doctor.
//   * decision tiers (h.agency): infant 0-5, child 6-11, teen 12-17, adult 18+
//   * `decider: 'family'` events are decided by the family for infants and children (no card, one ordinary log entry), weighted by the
//     family's circumstances (wealth quintile, which parents are alive, income group, countryside); teens and adults choose
//   * adult behaviour is unchanged (the decider does nothing from 12 on; the same life continues byte for byte)
//   * the `agency` audit: no adult-only decision is offered to anybody under 15 (1500 lives + a static pass over every choice event x age x household)
//   * family results are told by the people who are actually there (parents alive / dead)
// Run with: node --test tests/agency.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import ALL_EVENTS from '../js/data/events/index.js';
import { createLife, advanceYear, autoChoose, serialize, deserialize } from '../js/engine/life.js';
import { agencyOf, familyFactor, familyMeans, validateEvents, AGENCY_TIERS } from '../js/engine/events.js';
import { makeHelpers } from '../js/engine/helpers.js';
import { getSummary } from '../js/engine/summary.js';
import { RULES } from './lib/coherence.mjs';
import { scaled } from './lib/scale.mjs';
import { RULE, ACTS, findActs, staticAudit, offeredScan, auditCards, KINDS } from './lib/rules-agency.mjs';

const BY_ID = new Map(ALL_EVENTS.map((e) => [e.id, e]));
const FAMILY_EVENTS = ALL_EVENTS.filter((e) => e.decider === 'family');

/** Play a life with automatic choices (manual stepping, so that pending cards can be inspected through `onCard`). */
function play(settings, seed, opts = {}, { until = 130, onCard = null } = {}) {
  const s = createLife(settings, seed, opts);
  let g = 0;
  while (s.alive && s.age < until && g++ < 130) {
    advanceYear(s, { auto: false, autoFocus: true });
    while (s.alive && s.flags._choice) { if (onCard) onCard(s, s.flags._choice); autoChoose(s); }
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// 1. The tiers
// ---------------------------------------------------------------------------------------------

test('agency tiers: infant 0-5, child 6-11, teen 12-17, adult 18+ (agencyOf and h.agency())', () => {
  assert.deepEqual(AGENCY_TIERS, ['infant', 'child', 'teen', 'adult']);
  const expect = (a) => (a <= 5 ? 'infant' : a <= 11 ? 'child' : a <= 17 ? 'teen' : 'adult');
  const s = createLife({ era: 'present' }, 'tiers', { countryCode: 'TWN' });
  for (let a = 0; a <= 100; a++) {
    assert.equal(agencyOf(a), expect(a), `age ${a}`);
    s.age = a;
    const h = makeHelpers(s);
    assert.equal(h.agency(), expect(a));
    assert.equal(h.isKid(), a < 12);
    assert.equal(h.isTeen(), a >= 12 && a < 18);
  }
});

test('definitions: decider / who / familyResult / cost / reach are validated; the shipped events pass', () => {
  assert.deepEqual(validateEvents(ALL_EVENTS), []);
  const ok = { id: 'x_a', title: 't', text: 'x', choices: [{ label: 'a', familyResult: 'r' }, { label: 'b', familyResult: 'r' }] };
  assert.deepEqual(validateEvents([{ ...ok, decider: 'family' }]), []);
  assert.ok(validateEvents([{ ...ok, decider: 'nobody' }]).length > 0, 'unknown decider');
  assert.ok(validateEvents([{ id: 'x_b', title: 't', text: 'x', decider: 'family' }]).length > 0, 'decider without choices');
  assert.ok(validateEvents([{ ...ok, decider: 'family', choices: [{ label: 'a' }, { label: 'b', familyResult: 'r' }] }]).length > 0, 'family event without familyResult');
  assert.deepEqual(validateEvents([{ ...ok, decider: 'family', choices: [{ label: 'a', who: 'child' }, { label: 'b', familyResult: 'r' }] }]), [], 'who:child needs no familyResult');
  assert.ok(validateEvents([{ ...ok, choices: [{ label: 'a', who: 'adult' }, { label: 'b' }] }]).length > 0, 'who must be child');
  assert.ok(validateEvents([{ ...ok, choices: [{ label: 'a', cost: 5 }, { label: 'b' }] }]).length > 0, 'cost range');
  assert.ok(validateEvents([{ ...ok, choices: [{ label: 'a', reach: -1 }, { label: 'b' }] }]).length > 0, 'reach range');
  assert.ok(FAMILY_EVENTS.length >= 18, `expected at least 18 family-decided events, got ${FAMILY_EVENTS.length}`);
  for (const id of ['regional_malaria_season', 'health_clinic_far', 'seed_disaster', 'regional_conflict_displacement', 'regional_drought_harvest', 'health_air_quality'])
    assert.equal(BY_ID.get(id).decider, 'family', id);
});

// ---------------------------------------------------------------------------------------------
// 2. A family-decided event: no card for a child, one ordinary entry
// ---------------------------------------------------------------------------------------------

test('a child never meets a card of a family-decided event; the family decision is logged as one ordinary event entry', () => {
  const ids = new Set(FAMILY_EVENTS.map((e) => e.id));
  let family = 0, cardsOfFamilyEvents = 0, kidCards = 0;
  const byTitle = new Map(FAMILY_EVENTS.map((e) => [e.title, e]));
  for (let i = 0; i < 500; i++) {
    const s = play({ era: ['past', 'present', 'future'][i % 3], drawMode: 'births' }, `ag-t2-${i}`, {}, {
      until: 20,
      onCard: (st, pc) => { if (st.age < 12) { kidCards++; if (ids.has(pc.eventId)) cardsOfFamilyEvents++; } },
    });
    for (const e of s.log) {
      if (e.by !== 'family') continue;
      family++;
      assert.equal(e.kind, 'event', 'logged like any event');
      assert.ok(e.age < 12);
      assert.ok(byTitle.has(e.title), `unknown family entry ${e.title}`);
      assert.ok(e.text.length > 60, 'the text and what the family did');
      assert.ok(!/undefined|NaN|\[object/.test(e.text));
      assert.equal(s.log.filter((x) => x.kind === 'choice' && x.age === e.age && x.title === e.title).length, 0, 'not a choice entry');
    }
    assert.equal(s.log.filter((x) => x.by === 'family' && x.age >= 12).length, 0);
    // not counted as a choice
    const sum = getSummary(s);
    assert.equal(sum.counts.choices, s.log.filter((x) => x.kind === 'choice').length);
  }
  assert.equal(cardsOfFamilyEvents, 0, 'no choice card of a family-decided event under 12');
  assert.ok(family >= 40, `expected plenty of family decisions in 500 lives, got ${family}`);
  assert.ok(kidCards > 100, 'other (child-sized) choices are still asked of children');
});

test('malaria: the child with the fever is not asked; a teenager is asked in a teenager\'s words; an adult sees the original choices', () => {
  const ev = BY_ID.get('regional_malaria_season');
  const mk = (age, extra = {}) => {
    const s = createLife({ era: 'present' }, `mal-${age}`, { countryCode: 'NGA', urban: false, wealthQ: 2, birthYear: 2010 - age + (extra.by || 0) });
    s.age = age; s.year = s.birthYear + age;
    s.family.mother.alive = true; s.family.father.alive = true;
    return s;
  };
  const visible = (s) => { const h = makeHelpers(s); return ev.choices.filter((c) => !c.cond || c.cond(s, h)).map((c) => c.label); };
  const adult = visible(mk(30)), teen = visible(mk(14)), kid = visible(mk(6));
  assert.deepEqual(adult.slice(0, 3), ['立刻驗血，吃完整療程的藥', '先在家退燒，觀望一下', '到藥鋪買藥自己治'], 'adult wording unchanged');
  assert.ok(teen.includes('請家人陪你去診所驗血，吃完整療程的藥') && !teen.includes('到藥鋪買藥自己治'));
  assert.ok(!teen.includes('立刻驗血，吃完整療程的藥'), 'a teenager is not offered the adult wording');
  assert.deepEqual(kid, adult, 'the family\'s options are the grown-up ones (picked for the child)');
  for (const c of ev.choices) assert.ok(c.who === 'child' || c.familyResult, `choice "${c.label}" needs a family result`);

  // a real child: the entry is there, the text says who took the child, and no card is pending
  let hit = null;
  for (let i = 0; i < 400 && !hit; i++) {
    const s = play({ era: 'present' }, `mal-life-${i}`, { countryCode: 'NGA', urban: false, wealthQ: 1 }, { until: 12, onCard: (st, pc) => assert.notEqual(pc.eventId, 'regional_malaria_season') });
    hit = s.log.find((e) => e.title === '雨季熱' && e.by === 'family');
    if (hit) assert.ok(hit.age < 12 && /爸|媽|奶奶|叔|姑|舅|姨|伯|大人|家裡/.test(hit.text), hit.text);
  }
  assert.ok(hit, 'a child with malaria in 400 lives');
});

// ---------------------------------------------------------------------------------------------
// 3. Circumstances decide what the family does
// ---------------------------------------------------------------------------------------------

test('familyFactor: money-hungry options suit comfortable families, cheap ones suit poor ones; far clinics suit remote families less; one parent is thinner', () => {
  const mkS = (code, urban, wealthQ, parents, year = 2015) => {
    const s = createLife({ era: 'present' }, `ff-${code}-${wealthQ}-${parents}`, { countryCode: code, urban, wealthQ, birthYear: year - 8 });
    s.age = 8; s.year = year;
    s.family.mother.alive = parents !== 'none' && parents !== 'father'; s.family.father.alive = parents === 'both' || parents === 'father';
    return s;
  };
  const dear = { cost: 3 }, cheap = { cost: 0 }, far = { reach: 2 }, plain = {};
  const poor = mkS('NGA', false, 1, 'both'), rich = mkS('DEU', true, 5, 'both');
  assert.ok(familyFactor(rich, dear) / familyFactor(rich, cheap) > 5, 'rich: the dear option is far likelier than the free one');
  assert.ok(familyFactor(poor, cheap) / familyFactor(poor, dear) > 5, 'poor: the free option is far likelier than the dear one');
  assert.ok(familyFactor(poor, far) < familyFactor(rich, far), 'a remote family reaches a clinic less easily');
  assert.equal(familyFactor(poor, plain), 1, 'no cost, no reach: the ai weights alone');
  const both = mkS('BRA', true, 3, 'both'), one = mkS('BRA', true, 3, 'mother'), none = mkS('BRA', true, 3, 'none');
  assert.ok(familyMeans(both) > familyMeans(one) && familyMeans(one) > familyMeans(none), 'fewer parents, thinner means');
  assert.ok(familyFactor(one, dear) < familyFactor(both, dear));
  const village = mkS('NER', false, 3, 'both'), city = mkS('NER', true, 3, 'both');
  assert.ok(familyMeans(village) < familyMeans(city), 'the countryside is thinner');
});

test('malaria in 3000 lives: comfortable households take the child to be tested more often than poor ones', () => {
  const share = (wealthQ, urban) => {
    let tested = 0, waited = 0;
    for (let i = 0; i < scaled(1500, 600, 300); i++) {
      const s = play({ era: 'present' }, `mal-w${wealthQ}-${i}`, { countryCode: 'NGA', urban, wealthQ }, { until: 12 });
      for (const e of s.log) if (e.by === 'family' && e.title === '雨季熱') { if (/一滴血/.test(e.text)) tested++; else if (/濕毛巾/.test(e.text)) waited++; }
    }
    return { tested, waited, share: tested / Math.max(1, tested + waited) };
  };
  const poor = share(1, false), rich = share(5, true);
  assert.ok(poor.tested + poor.waited >= 60 && rich.tested + rich.waited >= 60, `enough draws: ${JSON.stringify([poor, rich])}`);
  assert.ok(rich.share > poor.share + 0.08, `rich ${rich.share.toFixed(2)} vs poor ${poor.share.toFixed(2)}`);
});

// ---------------------------------------------------------------------------------------------
// 4. Determinism and unchanged adults
// ---------------------------------------------------------------------------------------------

test('determinism: the same seed gives the same life; automatic play and manual stepping agree', () => {
  for (let i = 0; i < 12; i++) {
    const cfg = { era: ['past', 'present', 'future'][i % 3], drawMode: 'births', pace: 'short' };
    const a = createLife(cfg, `det-${i}`); const b = createLife(cfg, `det-${i}`);
    let g = 0;
    while (a.alive && g++ < 130) advanceYear(a, { auto: true });
    const c = play(cfg, `det-${i}`);
    g = 0;
    while (b.alive && g++ < 130) advanceYear(b, { auto: true });
    assert.equal(serialize(a), serialize(b), `life ${i}`);
    assert.equal(serialize(a), serialize(c), `life ${i}: manual stepping`);
  }
});

test('adults are unchanged: from 12 on the decider does nothing (the same life continues byte for byte with and without it)', () => {
  const stripped = [];
  const strip = () => { for (const e of ALL_EVENTS) if (e.decider) { stripped.push([e, e.decider]); delete e.decider; } };
  const restore = () => { for (const [e, d] of stripped) e.decider = d; stripped.length = 0; };
  let cases = 0;
  for (let i = 0; i < 60; i++) {
    const start = createLife({ era: ['past', 'present', 'future'][i % 3], drawMode: 'births' }, `adult-${i}`);
    let g = 0;
    while (start.alive && start.age < (i % 2 ? 18 : 12) && g++ < 40) advanceYear(start, { auto: true });
    if (!start.alive) continue;
    const frozenState = serialize(start);
    const run = () => { const s = deserialize(frozenState); let k = 0; while (s.alive && k++ < 130) advanceYear(s, { auto: true }); return serialize(s); };
    const withDecider = run();
    strip();
    let without;
    try { without = run(); } finally { restore(); }
    assert.equal(withDecider, without, `life ${i} (from age ${start.age})`);
    cases++;
  }
  assert.ok(cases >= 50);
});

test('what a child lives through differs only where a family decided: no decider, no change', () => {
  // with the deciders removed the same seeds hand children cards of those events (and the choices count grows by them)
  const stripped = [];
  let withCards = 0, withoutCards = 0;
  const ids = new Set(FAMILY_EVENTS.map((e) => e.id));
  const count = () => { let n = 0; for (let i = 0; i < 300; i++) play({ era: 'present', drawMode: 'births' }, `nd-${i}`, {}, { until: 12, onCard: (st, pc) => { if (st.age < 12 && ids.has(pc.eventId)) n++; } }); return n; };
  withCards = count();
  for (const e of ALL_EVENTS) if (e.decider) { stripped.push([e, e.decider]); delete e.decider; }
  try { withoutCards = count(); } finally { for (const [e, d] of stripped) e.decider = d; }
  assert.equal(withCards, 0);
  assert.ok(withoutCards > 0, 'without the decider, children would be asked');
});

// ---------------------------------------------------------------------------------------------
// 5. The audit
// ---------------------------------------------------------------------------------------------

test('agency audit: the rule catches the old wording and lets child-framed or somebody else\'s acts through', () => {
  assert.ok(RULES.some((r) => r.id === 'agency'), 'registered in coherence.mjs');
  assert.ok(ACTS.length >= 10);
  // the user's report
  assert.ok(findActs('立刻驗血，吃完整療程的藥', 7).length > 0);
  assert.ok(findActs('到藥鋪買藥自己治', 7).length > 0);
  assert.ok(findActs('立刻動身，借車送去', 9).length > 0);
  assert.ok(findActs('立刻帶著家人撤離', 10).length > 0);
  assert.ok(findActs('據理力爭，談判延後', 13).length > 0);
  assert.ok(findActs('先試種一小塊田', 13).length > 0);
  assert.ok(findActs('貸款買新種子與肥料', 13).length > 0);
  assert.ok(findActs('搬到另一個較遠的社區', 11).length > 0);
  assert.ok(findActs('繳清學費，簽下合約', 11).length > 0);
  assert.ok(findActs('辭掉工作，投資一家小店', 12).length > 0);
  // household-head decisions of 12-14-year-olds
  assert.ok(findActs('你替全家做主，決定賣掉田地', 13).some((h) => h.act === 'head'));
  // child-framed, or the doer is somebody else
  assert.equal(findActs('求爸媽帶你去看醫生', 7).length, 0);
  assert.equal(findActs('央求大人帶你去診所驗血', 7).length, 0);
  assert.equal(findActs('告訴老師，請他們通知家人撤離', 9).length, 0);
  assert.equal(findActs('躲在被子裡哭，等大人借車送你去診所', 6).length, 0);
  assert.equal(findActs('爸爸向鄰居借了機車，帶著你騎去鎮上的診所。', 6).length, 0);
  assert.equal(findActs('媽媽牽走了那頭牛，換回玉米與種子。', 6).length, 0);
  assert.equal(findActs('你拿自己存的零用錢買了一小包藥。', 13).length, 0);
  assert.equal(findActs('跟著大人去災區，幫忙搬物資', 13).length, 0);
  // 15-17: only what needs a grown-up's standing
  assert.equal(findActs('立刻驗血，吃完整療程的藥', 16).length, 0);
  assert.ok(findActs('貸款買新種子與肥料', 16).length > 0);
  assert.ok(findActs('簽下貸款文件', 17).length > 0);
  assert.equal(findActs('你把存下來的錢拿出來，申請了獎學金', 17).length, 0, 'applying for a scholarship is a teenager\'s business');
  // the text-level rule (registered with the coherence auditor) knows the choice labels
  const snap = (age) => ({ age });
  assert.ok(RULE.check(snap(7), '立刻驗血，吃完整療程的藥。診所的護理人員用一滴血就確認了。').length > 0);
  assert.equal(RULE.check(snap(30), '立刻驗血，吃完整療程的藥。診所的護理人員用一滴血就確認了。').length, 0, 'adults decide');
  assert.equal(RULE.check(snap(14), '請家人陪你去診所驗血，吃完整療程的藥。你撐著說出口：「我好像是雨季熱。」').length, 0, 'who:child');
  assert.equal(RULE.check(snap(7), '一段完全無關的敘述，買了藥。').length, 0, 'only entries that start with a known choice label count');
});

test('agency audit (static): every choice event x age 0-17 x household (poor village, city, rich, orphan, single mother) is clean', () => {
  const r = staticAudit();
  assert.ok(r.checked > 5000, `checked ${r.checked}`);
  assert.deepEqual(r.flags.slice(0, 8).map((f) => `${f.event}#${f.choice} ${f.part} age ${f.age} [${f.act}:${f.word}] ${f.label}`), []);
  assert.equal(KINDS.length, 5);
});

test('agency audit (1500 lives): zero adult-decision choices offered under 15; none for 15-17 either', () => {
  const LIVES = scaled(1500, 500, 250);
  const { cards, family, lives } = offeredScan(LIVES);
  assert.equal(lives, LIVES);
  const under15 = cards.filter((c) => c.age < 15);
  assert.ok(under15.length > 2 * LIVES, `children are still asked things of their size: ${under15.length} cards`);
  assert.ok(family > 0.2 * LIVES, `family decisions under 12: ${family}`);
  const flags = auditCards(cards);
  assert.deepEqual(flags.slice(0, 8).map((f) => `${f.event} age ${f.age} [${f.act}:${f.word}] ${f.label}`), []);
  // a family-decided event is never a card under 12
  const fam = new Set(FAMILY_EVENTS.map((e) => e.id));
  assert.equal(cards.filter((c) => c.age < 12 && fam.has(c.event)).length, 0);
  // a teenager who meets such an event gets teen-sized choices (child-perspective, marked who:'child', or neutral wording) and at least two of them
  const teen = cards.filter((c) => c.age >= 12 && c.age < 18 && fam.has(c.event));
  assert.ok(teen.length > 100, `teen cards of family events: ${teen.length}`);
  for (const c of teen) {
    assert.ok(c.labels.length >= 1 && c.labels.length <= 4, `${c.event}: ${c.labels.length} options`);
    const defs = BY_ID.get(c.event).choices;
    const adultOnly = c.labels.filter((l) => { const d = defs.find((x) => x.label === l); return d && d.who !== 'child' && d.cond && /notTeen|!==\s*'teen'/.test(String(d.cond)); });
    assert.deepEqual(adultOnly, [], `${c.event}: the family's options were shown to a teenager`);
  }
});

// ---------------------------------------------------------------------------------------------
// 6. Told by the people who are there
// ---------------------------------------------------------------------------------------------

/** A child of `age` in a household with the given parents alive. */
function kidState(age, mother, father, seedBase = 'told') {
  const s = createLife({ era: 'present' }, `${seedBase}-${age}-${mother}-${father}`, { countryCode: 'IND', urban: false, wealthQ: 2, birthYear: 2012 - age });
  s.age = age; s.year = s.birthYear + age;
  s.family.mother.alive = mother; s.family.father.alive = father;
  s.work.status = 'student'; s.edu.inSchool = age >= 6;
  return s;
}

test('family results name who decided, and only the parents who are alive', () => {
  let checked = 0;
  for (const ev of FAMILY_EVENTS) {
    for (const age of [2, 5, 7, 11]) {
      for (const [mother, father] of [[true, true], [true, false], [false, true], [false, false]]) {
        const s = kidState(age, mother, father);
        const h = makeHelpers(s);
        for (const c of ev.choices) {
          if (c.who === 'child' || (c.cond && !c.cond(s, h))) continue;
          const r = typeof c.familyResult === 'function' ? c.familyResult(s, h) : c.familyResult;
          assert.ok(typeof r === 'string' && r.length > 20, `${ev.id}: "${c.label}" has no family result`);
          assert.ok(!/undefined|NaN|\[object|null/.test(r), `${ev.id}: ${r}`);
          assert.ok(/爸|媽|奶奶|叔|姑|舅|姨|伯|大人|家人|長輩|全家/.test(r), `${ev.id}: the result does not say who decided: ${r}`);
          if (!father) assert.ok(!/爸|父/.test(r), `${ev.id} (father dead): ${r}`);
          if (!mother) assert.ok(!/媽|母/.test(r), `${ev.id} (mother dead): ${r}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 400, `checked ${checked}`);
});

test('whoDecides: both parents → a parent or both (sometimes grandma); one parent → that parent (or grandma); none → an uncle, aunt or elder', () => {
  const seen = { both: new Set(), mom: new Set(), dad: new Set(), none: new Set() };
  for (let i = 0; i < 120; i++) {
    const a = kidState(6 + (i % 5), true, true, `who${i}`), b = kidState(6 + (i % 5), true, false, `who${i}`), c = kidState(6 + (i % 5), false, true, `who${i}`), d = kidState(6 + (i % 5), false, false, `who${i}`);
    seen.both.add(makeHelpers(a).whoDecides('k')); seen.mom.add(makeHelpers(b).whoDecides('k')); seen.dad.add(makeHelpers(c).whoDecides('k')); seen.none.add(makeHelpers(d).whoDecides('k'));
  }
  for (const w of seen.both) assert.ok(['爸爸', '媽媽', '爸媽', '奶奶'].includes(w), w);
  for (const w of seen.mom) assert.ok(['媽媽', '奶奶'].includes(w), w);
  for (const w of seen.dad) assert.ok(['爸爸', '奶奶'].includes(w), w);
  for (const w of seen.none) assert.ok(['叔叔', '姑姑', '舅舅', '阿姨', '伯父', '身邊的大人'].includes(w), w);
  assert.ok(seen.both.size >= 3, 'several voices');
  // stable for a life, age and salt; no random numbers drawn
  const s = kidState(8, true, true);
  const h = makeHelpers(s), rng = JSON.stringify(s.rng);
  assert.equal(h.whoDecides('a'), h.whoDecides('a'));
  assert.equal(JSON.stringify(s.rng), rng);
});

test('the setup text of a family-decided event never asks a child to decide', () => {
  const ASKS = /你要不要|你決定|你選|你該不該|你不知道該|由你|不知道該不該|是不是該|你把重要|你把外套|默默在腦中列出|你摸索著找蠟燭/;
  for (const ev of FAMILY_EVENTS) {
    for (const age of [3, 8, 11]) {
      if (ev.ages && (age < ev.ages[0] || age > ev.ages[1])) continue;
      const s = kidState(age, true, true, `ask-${ev.id}`);
      const h = makeHelpers(s);
      const texts = [ev.text, ...(ev.variants || [])].map((x) => (typeof x === 'function' ? x(s, h) : x)); // the setup text and its other phrasings (Phase 5C)
      for (const t of texts) assert.ok(!ASKS.test(t), `${ev.id} at ${age}: ${t}`);
    }
  }
});

test('a family-decided event always leaves the family something to pick and a teenager at least two choices (as many as an adult has, up to two)', () => {
  const houses = { poor: ['NER', false, 1, 'past'], mid: ['BRA', true, 3, 'present'], rich: ['DEU', true, 5, 'present'], orphan: ['IND', false, 2, 'present'] };
  const bad = [];
  for (const ev of FAMILY_EVENTS) {
    for (const [k, [cc, urban, wealthQ, era]] of Object.entries(houses)) {
      const visible = (age) => {
        const s = createLife({ era }, `vis-${k}`, { countryCode: cc, urban, wealthQ });
        s.age = age; s.year = s.birthYear + age;
        if (k === 'orphan') { s.family.mother.alive = false; s.family.father.alive = false; }
        const h = makeHelpers(s);
        return ev.choices.filter((c) => !c.cond || c.cond(s, h));
      };
      const kid = visible(8), teen = visible(14), adult = visible(30);
      if (kid.length < 1) bad.push(`${ev.id} ${k}: nothing for the family to pick`);
      if (teen.length < Math.min(2, adult.length)) bad.push(`${ev.id} ${k}: teen ${teen.length} vs adult ${adult.length}`);
      if (teen.some((c) => c.who !== 'child' && /notTeen|!==\s*'teen'/.test(String(c.cond || '')))) bad.push(`${ev.id} ${k}: a family option is shown to a teenager`);
    }
  }
  assert.deepEqual(bad, []);
});
