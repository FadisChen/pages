// Household (Phase 6B): who lives with whom, and the events that only make sense for people under one roof.
//
// state.household = { parents, partner, kids: [where], far, aloneAbroad, joint, sep, ... }  (js/engine/systems.js, "Household")
//   * every transition of a life moves it: leaving home, marriage, childbirth, children growing up, divorce (custody), widowhood,
//     a parent's death, migration (who comes along) and return, a family reunion, a parent moving in;
//   * a lone labour migrant never reads a scene of the kitchen, the school gate or the bedroom door about people who are not there;
//   * old saves (no `household`) load and play on;
//   * the household audit rule (tests/lib/rules-household.mjs) finds same-place scenes with family who live elsewhere.
//
// Run with: node --test tests/household.test.mjs   (LL_HH_N=200 for a quicker run)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createLife, advanceYear, serialize, deserialize } from '../js/engine/life.js';
import { makeHelpers, HELPER_NAMES } from '../js/engine/helpers.js';
import { KID_WHERE, APART_WHERE, ensureHousehold, migrate, newPartner, addChild, divorce, marry, endRelationship, startJob } from '../js/engine/systems.js';
import ALL_EVENTS, { EVENT_FILES } from '../js/data/events/index.js';
import YEARLY from '../js/data/yearly.js';
import { BY_CODE } from '../js/data/countries.js';
import { RULES, lifeConfigs, runAudit, snapshot, groupFlags, applyStress } from './lib/coherence.mjs';
import { RULE as HOUSEHOLD, householdSnap, migrantStressFor } from './lib/rules-household.mjs';

const N = +process.env.LL_HH_N || 400;
const play = (s, years) => { for (let i = 0; i < years && s.alive; i++) advanceYear(s, { auto: true }); return s; };
const playTo = (s, age) => { while (s.alive && s.age < age) advanceYear(s, { auto: true }); return s; };
const fresh = (seed, opts = {}, st = { era: 'present' }) => createLife(st, seed, { countryCode: 'NPL', ...opts });

/** Everything that must be true of a household, whatever happened. */
function invariants(s, where = '') {
  const hh = s.household || ensureHousehold(s);
  assert.equal(hh.kids.length, s.children.length, `${where}: one place per child`);
  assert.equal(hh.far.length, s.children.length, `${where}: one far flag per child`);
  const alive = (s.family.mother.alive ? 1 : 0) + (s.family.father.alive ? 1 : 0);
  const active = !!s.partner && (s.partner.status === 'married' || s.partner.status === 'dating');
  hh.kids.forEach((k, i) => assert.ok(KID_WHERE.includes(k), `${where}: kid ${i} is ${k}`));
  if (hh.parents) assert.ok(alive > 0, `${where}: lives with parents who are dead`);
  if (hh.partner) assert.ok(active, `${where}: lives with a partner who is gone (${s.partner && s.partner.status})`);
  s.children.forEach((c, i) => {
    if (!c.alive) return;
    const age = s.year - c.birthYear;
    if (hh.kids[i] === 'with_partner' && s.partner) assert.notEqual(s.partner.status, 'widowed', `${where}: child with a dead partner`); // (with_partner = with the other parent, who may be an ex)
    if (hh.kids[i] === 'with_grandparents') assert.ok(alive > 0 || (hh.caregiverLost !== undefined && hh.caregiverLost >= s.year), `${where}: child with grandparents who are dead (${alive})`);
    if (hh.far[i]) assert.equal(hh.kids[i], 'independent', `${where}: only grown-up children are "far"`);
    if (age >= 35 && s.age < 60) assert.equal(hh.kids[i], 'independent', `${where}: a child of ${age} still lives at home`);
  });
  const withYou = s.children.some((c, i) => c.alive && hh.kids[i] === 'with_you');
  assert.equal(hh.aloneAbroad, s.countryCode !== s.homeCountryCode && !hh.partner && !hh.parents && !withYou, `${where}: aloneAbroad is derived`);
}

// ---------------------------------------------------------------------------------------------
// 1. The model, the helpers, old saves
// ---------------------------------------------------------------------------------------------

test('helpers: the five household helpers exist (plus the ones events use)', () => {
  for (const n of ['livesWith', 'apartFrom', 'aloneAbroad', 'childrenWithYou', 'caregiverOfChildren', 'childrenApart', 'minorsWithYou', 'childrenNearby', 'parentsNear', 'parentsFar', 'coupleApart', 'livesAlone', 'reunite', 'moveAway', 'leftBehind', 'lastReunion', 'household']) {
    assert.ok(HELPER_NAMES.includes(n), `missing helper ${n}`);
  }
});

test('a new life lives with its parents; the household is created on first use and never draws a random number', () => {
  const s = fresh('hh-new');
  assert.equal(s.household, undefined, 'no household before it is needed (life.js is untouched)');
  const rng = [...s.rng];
  const h = makeHelpers(s);
  assert.equal(h.livesWith('parents'), true);
  assert.equal(h.livesWith('partner'), false);
  assert.equal(h.livesWith('children'), false);
  assert.equal(h.apartFrom('children'), false);
  assert.equal(h.aloneAbroad(), false);
  assert.equal(h.caregiverOfChildren(), '');
  assert.deepEqual(h.childrenWithYou(), []);
  assert.deepEqual(s.rng, rng, 'household helpers consume no random numbers');
  invariants(s, 'new life');
});

test('household helpers: crafted states', () => {
  const s = fresh('hh-helpers', {}, { era: 'present' });
  playTo(s, 24);
  newPartner(s, { status: 'married', replace: true });
  const a = addChild(s), b = addChild(s);
  a.birthYear = s.year - 6; b.birthYear = s.year - 2;
  const h = makeHelpers(s);
  assert.equal(h.livesWith('partner'), true);
  assert.equal(h.livesWith('children'), true);
  assert.equal(h.childrenWithYou().length, 2);
  assert.equal(h.minorsWithYou().length, 2);
  assert.equal(h.caregiverOfChildren(), '你');
  assert.equal(h.coupleApart(), false);
  migrate(s, 'QAT', { with: 'alone' });
  assert.equal(h.aloneAbroad(), true);
  assert.equal(h.livesWith('children'), false);
  assert.equal(h.apartFrom('children'), true);
  assert.equal(h.apartFrom('partner'), true);
  assert.equal(h.coupleApart(), true);
  assert.equal(h.childrenApart().length, 2);
  assert.equal(h.caregiverOfChildren(), '伴侶');
  assert.equal(h.childLives(0), 'with_partner');
  assert.match(h.leftBehindLine(), /兩個孩子和.+留在了家鄉/);
  assert.equal(h.parentsFar(), h.parentsAlive() > 0);
  invariants(s, 'crafted');
});

test('old saves without household load, derive a sensible household and play on', () => {
  for (let i = 0; i < 40; i++) {
    const s = createLife({ era: ['past', 'present', 'future'][i % 3] }, `hh-old-${i}`, i % 2 ? { countryCode: 'PHL' } : {});
    playTo(s, 30 + (i % 30));
    const old = JSON.parse(serialize(s));
    delete old.household;
    const s2 = deserialize(JSON.stringify(old));
    assert.equal(s2.household, undefined);
    const h = makeHelpers(s2);
    assert.doesNotThrow(() => { h.livesWith('parents'); h.apartFrom('children'); h.aloneAbroad(); h.childrenWithYou(); h.caregiverOfChildren(); });
    invariants(s2, `old save ${i}`);
    play(s2, 25);
    invariants(s2, `old save ${i} later`);
    assert.ok(s2.household.kids.length === s2.children.length);
  }
});

test('corrupt household data is repaired, not trusted', () => {
  const s = fresh('hh-corrupt');
  playTo(s, 35);
  s.household = { parents: 'yes', kids: ['with_you', 'nonsense', null], far: 'no' };
  const h = makeHelpers(s);
  assert.doesNotThrow(() => h.livesWith('children'));
  invariants(s, 'repaired');
  s.household = 'garbage';
  assert.doesNotThrow(() => makeHelpers(s).aloneAbroad());
  invariants(s, 'replaced');
  play(s, 10);
  invariants(s, 'played on');
});

test('serialize / deserialize keep the household', () => {
  const s = fresh('hh-save');
  playTo(s, 40);
  const before = JSON.stringify(s.household);
  const s2 = deserialize(serialize(s));
  assert.equal(JSON.stringify(s2.household), before);
});

// ---------------------------------------------------------------------------------------------
// 2. Transitions
// ---------------------------------------------------------------------------------------------

test('leaving home: by the norms of the home region, or at once with the left_home flag', () => {
  const ages = (code, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = createLife({ era: 'present' }, `hh-leave-${code}-${i}`, { countryCode: code });
      let gone = null;
      while (s.alive && s.age < 45) { advanceYear(s, { auto: true }); if (gone === null && s.age >= 17 && !s.household.parents && (s.family.mother.alive || s.family.father.alive)) gone = s.age; if (s.partner && s.partner.status === 'married') break; }
      if (gone !== null) out.push(gone);
    }
    return out;
  };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const usa = ages('USA', 80), npl = ages('NPL', 80), jpn = ages('JPN', 80);
  assert.ok(mean(usa) < mean(jpn), `United States ${mean(usa).toFixed(1)} leaves earlier than Japan ${mean(jpn).toFixed(1)}`);
  assert.ok(mean(usa) <= 24 && mean(jpn) <= 29, `${mean(usa)} ${mean(jpn)}`);
  const s = fresh('hh-leftflag');
  playTo(s, 18);
  s.household = undefined;
  const h = makeHelpers(s);
  h.set('left_home');
  advanceYear(s, { auto: true });
  assert.equal(makeHelpers(s).livesWith('parents'), false, 'left_home ends living with the parents');
});

test('marriage moves the couple in together; joint families are a regional norm', () => {
  const share = (code, gender) => {
    let joint = 0, n = 0;
    for (let i = 0; i < 150; i++) {
      const s = createLife({ era: 'present' }, `hh-joint-${code}-${gender}-${i}`, { countryCode: code, gender });
      playTo(s, 24);
      if (!(s.family.mother.alive || s.family.father.alive) || (s.partner && s.partner.status === 'married')) continue;
      newPartner(s, { status: 'married', replace: true });
      const h = makeHelpers(s);
      assert.equal(h.livesWith('partner'), true);
      n++;
      if (h.livesWith('parents')) joint++;
    }
    return joint / Math.max(1, n);
  };
  assert.ok(share('IND', 'M') > share('USA', 'M') + 0.2, `India men ${share('IND', 'M')} vs US ${share('USA', 'M')}`);
  assert.ok(share('IND', 'M') > share('IND', 'F'), 'the bride usually leaves her own parents');
  assert.ok(share('USA', 'M') < 0.12);
});

test('childbirth: the baby lives with the person; with the partner when the father works abroad', () => {
  const s = fresh('hh-birth', { gender: 'M' });
  playTo(s, 25);
  newPartner(s, { status: 'married', replace: true });
  const c1 = addChild(s);
  assert.equal(s.household.kids[0], 'with_you');
  startJob(s, 'construction');
  migrate(s, 'SAU', { with: 'alone' });
  assert.equal(s.household.partner, false);
  const c2 = addChild(s);
  assert.equal(s.household.kids[1], 'with_partner', 'a child born while the father works abroad lives with the mother');
  invariants(s, 'births');
  const f = fresh('hh-birth-f', { gender: 'F' });
  playTo(f, 25);
  newPartner(f, { status: 'married', replace: true });
  migrate(f, 'SAU', { with: 'alone' });
  addChild(f);
  assert.equal(f.household.kids[0], 'with_you', 'a mother abroad has the baby with her');
  assert.ok(c1 && c2);
});

test('children grow up and leave by the norms of the home region; the first departure is told by family_child_leaves', () => {
  let leavers = 0, told = 0, emptied = 0;
  for (let i = 0; i < Math.min(N, 300); i++) {
    const s = createLife({ era: 'present' }, `hh-grow-${i}`, { countryCode: ['USA', 'JPN', 'NPL', 'MEX', 'NGA', 'DEU'][i % 6] });
    for (let g = 0; s.alive && g < 130; g++) {
      const before = JSON.stringify(s.household && s.household.kids);
      const sawBefore = s.seen.family_child_leaves;
      advanceYear(s, { auto: true });
      invariants(s, `grow ${i}`);
      const after = s.household.kids;
      const first = !s.flags.f_child_left_before && after.some((k, idx) => k === 'independent' && JSON.parse(before || '[]')[idx] === 'with_you');
      if (first) {
        leavers++;
        s.flags.f_child_left_before = true;
        if (s.seen.family_child_leaves !== undefined && sawBefore === undefined && s.seen.family_child_leaves === s.age) told++;
        else if (s.pending.some((p) => p.id === 'family_child_leaves')) told++;
      }
    }
    if (s.flags.f_empty_nest) emptied++;
  }
  assert.ok(leavers >= 30, `${leavers} children left home`);
  assert.ok(told / leavers >= 0.9, `the departure is told ${told}/${leavers}`);
  assert.ok(emptied >= 1, 'aging_empty_nest comes up when the last of several children leaves');
});

test('divorce: the partner moves out, the minors go with the mother or the father by the regional pattern, family_custody tells it', () => {
  let mine = 0, theirs = 0;
  for (let i = 0; i < 80; i++) {
    const s = createLife({ era: 'present' }, `hh-div-${i}`, { countryCode: i % 2 ? 'DEU' : 'IND', gender: i % 4 < 2 ? 'F' : 'M' });
    playTo(s, 28);
    newPartner(s, { status: 'married', replace: true });
    const a = addChild(s), b = addChild(s);
    a.birthYear = s.year - 5; b.birthYear = s.year - 3;
    delete s.seen.family_custody; // a life that already went through a divorce before 28 has seen the event; this test is about the one now
    s.pending = s.pending.filter((p) => p.id !== 'family_custody');
    assert.equal(divorce(s), true);
    const h = makeHelpers(s);
    assert.equal(h.livesWith('partner'), false);
    const places = new Set(s.household.kids);
    assert.equal(places.size, 1, 'siblings stay together');
    if (places.has('with_you')) mine++; else { theirs++; assert.ok(places.has('with_partner')); }
    assert.ok(s.pending.some((p) => p.id === 'family_custody'), 'the custody event is scheduled');
    invariants(s, 'divorce');
  }
  assert.ok(mine > 0 && theirs > 0, `custody varies (${mine}/${theirs})`);
});

test('the custody choice sets where the children live', () => {
  const ev = ALL_EVENTS.find((e) => e.id === 'family_custody');
  const s = fresh('hh-custody');
  playTo(s, 28);
  newPartner(s, { status: 'married', replace: true });
  addChild(s).birthYear = s.year - 4;
  divorce(s);
  const h = makeHelpers(s);
  ev.choices[2].effects(s, h);
  assert.equal(s.household.kids[0], 'with_partner');
  ev.choices[1].effects(s, h);
  assert.equal(s.household.kids[0], 'with_you');
  assert.ok(ev.followCond(s, h));
});

test('widowhood: the partner is gone; children who were with the dead partner come to you at home, go to relatives abroad', () => {
  const s = fresh('hh-widow');
  playTo(s, 28);
  newPartner(s, { status: 'married', replace: true });
  addChild(s).birthYear = s.year - 6;
  migrate(s, 'QAT', { with: 'alone' });
  assert.equal(s.household.kids[0], 'with_partner');
  s.partner.status = 'widowed';
  // what agePeople does: use the real path by running years until the partner dies is not deterministic, so ask the engine through a death at once
  s.partner.status = 'married';
  s.partner.age = 99;
  for (let i = 0; i < 60 && s.partner.status === 'married' && s.alive; i++) advanceYear(s, { auto: true });
  if (s.partner.status === 'widowed') {
    assert.equal(s.household.partner, false);
    assert.ok(['with_grandparents', 'home_country', 'independent'].includes(s.household.kids[0]), s.household.kids[0]);
  }
  invariants(s, 'widowed abroad');
  const t = fresh('hh-widow-home');
  playTo(t, 28);
  newPartner(t, { status: 'married', replace: true });
  addChild(t).birthYear = t.year - 6;
  t.household.kids[0] = 'with_partner'; // e.g. after a separation at home
  t.partner.status = 'married';
  t.partner.age = 99;
  for (let i = 0; i < 60 && t.partner.status === 'married' && t.alive; i++) advanceYear(t, { auto: true });
  if (t.partner.status === 'widowed') assert.ok(['with_you', 'independent'].includes(t.household.kids[0]));
  invariants(t, 'widowed at home');
});

test('a parent dies: nobody left to live with, and children with the grandparents go to relatives or to you', () => {
  const s = fresh('hh-parentdeath');
  playTo(s, 28);
  newPartner(s, { status: 'married', replace: true });
  addChild(s).birthYear = s.year - 5;
  s.family.mother.alive = true; s.family.father.alive = true;
  s.family.mother.age = 90; s.family.father.age = 92;
  migrate(s, 'ARE', { with: 'partner' });
  assert.equal(s.household.kids[0], 'with_grandparents');
  for (let i = 0; i < 40 && (s.family.mother.alive || s.family.father.alive) && s.alive; i++) advanceYear(s, { auto: true });
  if (!s.family.mother.alive && !s.family.father.alive) {
    assert.equal(s.household.parents, false);
    assert.notEqual(s.household.kids[0], 'with_grandparents');
  }
  invariants(s, 'grandparents gone');
});

test('an old parent moves in with the grown-up child where that is the norm (and a log line says so)', () => {
  const lives = (codes, per) => {
    let moved = 0, n = 0;
    for (const code of codes) {
      for (let i = 0; i < per; i++) {
        const s = createLife({ era: 'present' }, `hh-movein-${code}-${i}`, { countryCode: code });
        play(s, 100);
        n++;
        if (s.log.some((e) => /搬來同住/.test(e.title))) moved++;
      }
    }
    return { moved, n };
  };
  const per = Math.max(40, Math.min(N, 160) / 2);
  const norm = lives(['IND', 'EGY', 'CHN'], per), rare = lives(['USA', 'DEU', 'GBR'], per);
  assert.ok(norm.moved > rare.moved * 1.6, `where it is the norm ${norm.moved}/${norm.n}, where it is rare ${rare.moved}/${rare.n}`);
  assert.ok(norm.moved >= 8, `${norm.moved} log lines`);
});

// ---------------------------------------------------------------------------------------------
// 3. Migration: who comes along
// ---------------------------------------------------------------------------------------------

function family(seed, { kids = [8, 3], gender = 'F', parents = true } = {}) {
  const s = fresh(seed, { gender });
  playTo(s, 27);
  // start from a clean slate: the household of the life so far is not what is under test
  s.children.length = 0;
  s.household = undefined;
  s.partner = null;
  newPartner(s, { status: 'married', replace: true });
  for (const a of kids) addChild(s).birthYear = s.year - a;
  if (parents) { s.family.mother.alive = true; s.family.father.alive = true; s.family.mother.age = 55; s.family.father.age = 58; }
  s.household.parents = false;
  return s;
}

test('labour migration is alone: the minors stay with the partner, the partner stays, the person is alone abroad', () => {
  const s = family('hh-alone');
  const h = makeHelpers(s);
  assert.equal(h.migrate('KWT', { with: 'alone' }), true);
  assert.equal(h.aloneAbroad(), true);
  assert.deepEqual(h.childrenApart().length, 2);
  assert.equal(h.caregiverOfChildren(), '伴侶');
  assert.ok(s.pending.some((p) => p.id === 'migration_apart_first_year'));
  assert.equal(h.leftBehind().partner, true);
  assert.deepEqual(h.leftBehind().kids.length, 2);
  invariants(s, 'alone');
  // no partner: the grandparents
  const t = family('hh-alone-single', { kids: [5] });
  t.partner.status = 'divorced'; t.household.partner = false;
  const th = makeHelpers(t);
  th.migrate('MYS', { with: 'alone' });
  assert.equal(th.caregiverOfChildren(), '孩子的祖父母');
  t.family.mother.alive = false; t.family.father.alive = false;
  const u = family('hh-alone-orphan', { kids: [5], parents: false });
  u.family.mother.alive = false; u.family.father.alive = false; u.partner.status = 'divorced'; u.household.partner = false;
  makeHelpers(u).migrate('MYS', { with: 'alone' });
  assert.equal(makeHelpers(u).caregiverOfChildren(), '家鄉的親戚');
});

test('skilled migration and company transfers bring the family; "partner" brings only the partner', () => {
  const s = family('hh-family');
  makeHelpers(s).migrate('CAN', { with: 'family' });
  assert.equal(s.household.partner, true);
  assert.deepEqual(s.household.kids, ['with_you', 'with_you']);
  assert.equal(makeHelpers(s).aloneAbroad(), false);
  assert.equal(s.household.sep, null);
  const t = family('hh-partner');
  makeHelpers(t).migrate('CAN', { with: 'partner' });
  assert.equal(t.household.partner, true);
  assert.ok(t.household.kids.every((k) => k === 'with_grandparents'), t.household.kids.join());
  invariants(t, 'partner mode');
});

test('study migration is alone; without a mode the engine decides: students alone, refugees with whoever lives with them', () => {
  const s = family('hh-student', { kids: [] });
  s.edu.inSchool = true; s.edu.years = 12;
  makeHelpers(s).migrate('GBR');
  assert.equal(makeHelpers(s).aloneAbroad(), true, 'a student goes alone');
  const r = family('hh-refugee');
  r.household.parents = true;
  r.flags.war = true;
  makeHelpers(r).migrate('TUR');
  assert.equal(r.household.partner, true);
  assert.deepEqual(r.household.kids, ['with_you', 'with_you']);
  assert.equal(r.household.parents, true, 'the parents who share the home come along');
  assert.equal(makeHelpers(r).aloneAbroad(), false);
  // the family that was already apart is not on the plane
  const r2 = family('hh-refugee2');
  r2.household.kids[0] = 'with_grandparents';
  r2.flags.war = true;
  makeHelpers(r2).migrate('DEU', { with: 'refugee' });
  assert.equal(r2.household.kids[0], 'with_grandparents');
  assert.equal(r2.household.kids[1], 'with_you');
});

test('a family sent ahead to safety joins the person when they follow as a refugee', () => {
  const s = family('hh-sent');
  const sent = makeHelpers(s).sendFamilyAway();
  assert.equal(sent.partner, true);
  assert.equal(s.household.partner, false);
  assert.ok(s.household.kids.every((k) => k === 'with_partner'));
  makeHelpers(s).migrate('SWE', { with: 'refugee' });
  assert.equal(s.household.partner, true);
  assert.ok(s.household.kids.every((k) => k === 'with_you'));
});

test('return migration brings the family back together and tells it', () => {
  const s = family('hh-return');
  const h = makeHelpers(s);
  h.migrate('QAT', { with: 'alone' });
  playTo(s, s.age + 4);
  h.migrate(s.homeCountryCode);
  assert.equal(h.aloneAbroad(), false);
  assert.equal(h.livesWith('partner'), true);
  assert.equal(h.childrenWithYou().length, 2);
  assert.equal(h.leftBehind(), null);
  const r = h.lastReunion();
  assert.equal(r.how, 'return');
  assert.ok(r.apartYears >= 4 && r.kids.length === 2 && r.partner);
  assert.ok(s.pending.some((p) => p.id === 'migration_return_reunion'));
  invariants(s, 'return');
});

test('the reunion event brings the partner and the children to the person and updates the household', () => {
  const s = family('hh-join');
  const h = makeHelpers(s);
  h.migrate('MYS', { with: 'alone' });
  playTo(s, s.age + 3);
  const joins = ALL_EVENTS.find((e) => e.id === 'migration_family_joins');
  assert.equal(!!joins.followCond(s, h), true);
  const text = joins.text(s, h);
  assert.match(text, /機場的出口/);
  joins.effects(s, h);
  assert.equal(h.livesWith('partner'), true);
  assert.ok(h.childrenWithYou().length >= 2, 'both children (and any born meanwhile) live with the person');
  assert.equal(h.aloneAbroad(), false);
  assert.equal(h.lastReunion().how, 'join');
  assert.equal(h.leftBehind(), null);
  assert.equal(!!joins.followCond(s, h), false, 'nobody is left to join');
  invariants(s, 'join');
  // the explicit API
  const t = family('hh-join2');
  makeHelpers(t).migrate('MYS', { with: 'alone' });
  const r = makeHelpers(t).reunite({ kids: false });
  assert.equal(r.partner, true);
  assert.deepEqual(r.kids, []);
  assert.equal(makeHelpers(t).childrenApart().length, 2);
});

test('the yearly pass schedules the reunion for a split family (not in the Gulf, not while irregular)', () => {
  let queued = 0, gulf = 0;
  for (let i = 0; i < 120; i++) {
    for (const dest of ['CAN', 'QAT']) {
      const s = family(`hh-sched-${dest}-${i}`);
      s.stats.wealth = 60;
      makeHelpers(s).migrate(dest, { with: 'alone' });
      let found = false;
      for (let y = 0; y < 12 && s.alive && !found; y++) { advanceYear(s, { auto: true }); if (s.household.lastReunion && s.household.lastReunion.how === 'join') found = true; }
      if (found) { dest === 'QAT' ? gulf++ : queued++; }
    }
  }
  assert.ok(queued > gulf * 2, `reunions: Canada ${queued}, Qatar ${gulf}`);
  assert.ok(queued >= 15, `${queued} families reunited in Canada`);
});

test('moving to a city of the same country: the minors may stay with the grandparents (the left-behind children)', () => {
  const s = family('hh-city');
  makeHelpers(s).moveAway({ with: 'alone' });
  assert.equal(s.household.partner, false);
  assert.ok(s.household.kids.every((k) => k === 'with_partner'));
  assert.equal(s.household.aloneAbroad, false, 'not abroad');
  assert.equal(s.household.parents, false);
});

test('fertility: a married couple who live apart have fewer children', () => {
  const births = (together) => {
    let n = 0;
    for (let i = 0; i < 160; i++) {
      const s = createLife({ era: 'present' }, `hh-fert-${together}-${i}`, { countryCode: 'PHL', gender: 'F' });
      playTo(s, 22);
      newPartner(s, { status: 'married', replace: true });
      if (!together) makeHelpers(s).cohabit(false);
      const before = s.children.length;
      while (s.alive && s.age < 28) { advanceYear(s, { auto: true }); if (!together && s.partner && s.partner.status === 'married') s.household.partner = false; }
      n += s.children.length - before;
    }
    return n;
  };
  const a = births(true), b = births(false);
  assert.ok(b < a * 0.9, `apart ${b} vs together ${a}`);
});

// ---------------------------------------------------------------------------------------------
// 4. Every life: invariants and no co-residence scenes for people who are not there
// ---------------------------------------------------------------------------------------------

test('invariants hold at every year of natural lives and of migrant stress lives', () => {
  const cfgs = [...lifeConfigs(Math.min(N, 240), { prefix: 'hh-inv', countries: Object.keys(BY_CODE) }), ...lifeConfigs(Math.min(N, 240), { prefix: 'hh-invm', migrant: true })];
  let migrants = 0, apart = 0;
  for (const cfg of cfgs) {
    const s = createLife(cfg.settings, cfg.seed, cfg.opts.countryCode ? { countryCode: cfg.opts.countryCode } : {});
    for (let g = 0; s.alive && g < 130; g++) {
      if (cfg.opts.stress) applyStress(s, cfg.opts.stress);
      advanceYear(s, { auto: true });
      invariants(s, `${cfg.seed} age ${s.age}`);
      if (s.countryCode !== s.homeCountryCode) migrants++;
      if (s.household.kids.some((k) => APART_WHERE.includes(k))) apart++;
    }
  }
  assert.ok(migrants > 500 && apart > 200, `${migrants} migrant years, ${apart} years with children apart: the stress lives must exercise the model`);
});

// Scenes of one roof: wrong for a person whose children / partner / parents are not under it. Each entry: the event id and the people it is about.
const NEEDS = {
  family_school_run: 'kids', family_toddler_chaos: 'kids', family_child_sick_night: 'kids', family_teen_rebellion: 'kids', family_newborn_nights: 'kids',
  family_parental_leave: 'kids', family_childcare_choice: 'kids', family_child_college_cost: 'kids', family_single_parent: 'kids', work_return_to_work: 'kids',
  migration_second_gen: 'kids', family_large_family: 'kids', family_sandwich_generation: 'kids',
  family_money_fight: 'partner', family_housework_split: 'partner', family_trust_broken: 'partner', family_midlife_marriage: 'partner', family_anniversary: 'partner',
  family_in_laws: 'partner', family_newlywed_adjust: 'partner', family_trying_for_baby: 'partner', aging_spouse_dementia: 'partner', aging_spouse_dementia_later: 'partner',
  family_meet_parents: 'parentsNotFar', family_matchmaker: 'parentsNear', family_parent_move_in: 'parentsNear', work_family_business: 'parentsNear', family_festival_gathering: 'notAbroad',
  aging_grandchild_care: 'grandkids', aging_grandchild_recipe: 'grandkids', family_grandchild_visit: 'grandkids', aging_digital_help: 'grandkids',
};

test('a lone labour migrant never gets a co-residence scene about people who are not there', () => {
  const violations = [];
  const cfgs = lifeConfigs(Math.min(N, 320), { prefix: 'hh-lone', migrant: true });
  let checked = 0, fired = 0;
  for (const cfg of cfgs) {
    const s = createLife(cfg.settings, cfg.seed, {});
    const state = (x) => {
      const hh = ensureHousehold(x);
      const alive = x.family.mother.alive || x.family.father.alive;
      const abroad = x.countryCode !== x.homeCountryCode;
      const kidsHome = x.children.some((c, i) => c.alive && hh.kids[i] === 'with_you');
      const kidsNear = x.children.some((c, i) => c.alive && (hh.kids[i] === 'with_you' || (hh.kids[i] === 'independent' && !hh.far[i])));
      return { kids: kidsHome, partner: hh.partner && !!x.partner, parentsNear: alive && (!abroad || hh.parents), notAbroad: !abroad || hh.parents, parentsNotFar: !(alive && abroad && !hh.parents), grandkids: kidsNear };
    };
    for (let g = 0; s.alive && g < 130; g++) {
      if (cfg.opts.stress) applyStress(s, cfg.opts.stress);
      const seen0 = { ...s.seen }, pre = state(s);
      advanceYear(s, { auto: true });
      const post = state(s);
      for (const [id, need] of Object.entries(NEEDS)) {
        if (s.seen[id] === seen0[id]) continue;
        fired++;
        if (!pre[need] && !post[need]) violations.push(`${cfg.seed} age ${s.age}: ${id} fired without ${need}`);
        checked++;
      }
    }
  }
  assert.deepEqual(violations.slice(0, 10), []);
  assert.ok(fired > 100, `the gated events still happen for people who do live with their family (${fired})`);
});

test('the household rule: flags same-place scenes with family who live elsewhere, lets visits, calls and memories through', () => {
  const mk = (over = {}) => {
    const s = fresh('hh-rule');
    playTo(s, 30);
    s.children.length = 0; s.household = undefined; s.partner = null;
    newPartner(s, { status: 'married', replace: true });
    addChild(s).birthYear = s.year - 6;
    migrate(s, 'QAT', { with: 'alone' });
    return { ...snapshot(s), ...over };
  };
  const snap = mk();
  const hits = (text, sn = snap) => HOUSEHOLD.check(sn, text).map((h) => h.word);
  assert.ok(hits('你牽著孩子的手走過馬路，一路上聽他講學校的事。').length > 0);
  assert.ok(hits('你在門口等孩子放學，一群孩子湧出來。').length > 0);
  assert.ok(hits('晚上你哄孩子睡著，才發現自己也累了。').length > 0);
  assert.ok(hits('你和伴侶一起吃飯，話不多，但很安心。').length > 0);
  assert.ok(hits('你抱著孩子在客廳來回走，邊哼歌邊拍背。').length > 0);
  assert.ok(hits('接送孩子的時間，是你一天裡最輕鬆的一段。').length > 0);
  // video calls, visits, memories and denials are fine
  assert.deepEqual(hits('你用視訊哄孩子睡覺，鏡頭那頭的他一直打哈欠。'), []);
  assert.deepEqual(hits('放假回家那天，你牽著孩子的手走過村口。'), []);
  assert.deepEqual(hits('你想起從前一起吃飯的那些晚上。'), []);
  assert.deepEqual(hits('你沒能陪著孩子過生日，只能在電話裡唱歌。'), []);
  assert.deepEqual(hits('婚禮上母親握著你的手，眼眶紅紅的。'), []);
  assert.deepEqual(hits('你替鄰居的孩子牽著手過馬路。'), []);
  // people who do live with the person are none of the rule's business
  const together = { ...snap, hh: { ...snap.hh, kids: snap.hh.kids.map((k) => ({ ...k, where: 'with_you' })), partnerApart: false, partnerWith: true, parentsWith: true, abroad: false } };
  assert.deepEqual(hits('你牽著孩子的手走過馬路，一路上聽他講學校的事。', together), []);
  assert.deepEqual(hits('你和伴侶一起吃飯，話不多，但很安心。', together), []);
  assert.ok(RULES.some((r) => r.id === 'household'), 'registered in the coherence rules');
});

test('household audit on 400 migrant lives: no flags in the files of Phase 6B (other files are listed for 6C)', () => {
  const res = runAudit(lifeConfigs(Math.min(N, 400), { prefix: 'hh-aud', migrant: true, countries: Object.keys(BY_CODE) }), { checkLife: false, rules: RULES.filter((r) => r.id === 'household') });
  const mine = new Set(['adult_family', 'adult_work', 'aging', 'migration'].flatMap((f) => EVENT_FILES[f].map((e) => e.id)));
  const yearly = (id) => id.startsWith('yearly:') || id.startsWith('sys:');
  const bad = res.flags.filter((f) => mine.has(f.id) || yearly(f.id));
  assert.deepEqual(bad.map((f) => `${f.id} [${f.word}] ${f.sentence}`).slice(0, 8), []);
  const others = groupFlags(res.flags.filter((f) => !mine.has(f.id) && !yearly(f.id))).map((g) => g.id);
  if (others.length) console.log(`  (household flags in files of other phases, for 6C: ${[...new Set(others)].join(', ')})`);
});

test('the new left-behind events exist, are schedulable and read well', () => {
  const ids = ['migration_apart_first_year', 'migration_missed_birthday', 'migration_school_fees_remit', 'migration_parent_far_illness', 'migration_couple_apart_choice', 'migration_return_reunion', 'family_visiting_parent'];
  for (const id of ids) assert.ok(ALL_EVENTS.some((e) => e.id === id), id);
  // each fires for a lone labour migrant with children left behind within 400 lives
  const seen = new Set();
  for (const cfg of lifeConfigs(Math.min(N, 400), { prefix: 'hh-ev', migrant: true })) {
    const s = createLife(cfg.settings, cfg.seed, {});
    for (let g = 0; s.alive && g < 130; g++) { if (cfg.opts.stress) applyStress(s, cfg.opts.stress); advanceYear(s, { auto: true }); }
    for (const id of ids) if (s.seen[id] !== undefined) seen.add(id);
  }
  for (const id of ids.filter((x) => x !== 'family_visiting_parent')) assert.ok(seen.has(id), `${id} never fired in ${Math.min(N, 400)} migrant lives (saw ${[...seen].join(', ')})`);
  assert.ok(YEARLY.length >= 237 + 8, 'ordinary-year lines for the left-behind');
});

test('the household changes nothing for a life that never migrates, marries apart or divorces (same seed, same events)', () => {
  // two runs of the same life, one of them asking the household questions every year, are identical
  for (let i = 0; i < 12; i++) {
    const a = createLife({ era: 'present' }, `hh-same-${i}`, { countryCode: 'USA' });
    const b = createLife({ era: 'present' }, `hh-same-${i}`, { countryCode: 'USA' });
    for (let g = 0; g < 80 && a.alive; g++) {
      advanceYear(a, { auto: true });
      advanceYear(b, { auto: true });
      const h = makeHelpers(b);
      h.livesWith('children'); h.apartFrom('parents'); h.aloneAbroad(); h.childrenWithYou(); h.caregiverOfChildren();
    }
    assert.equal(serialize(a), serialize(b));
  }
});

test('README documents the household helpers', () => {
  const md = fs.readFileSync(new URL('../js/engine/README.md', import.meta.url), 'utf8');
  for (const n of ['livesWith', 'apartFrom', 'aloneAbroad', 'childrenWithYou', 'caregiverOfChildren', 'state.household']) assert.ok(md.includes(n), `README lacks ${n}`);
});
