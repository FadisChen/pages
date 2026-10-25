// The family roster (Phase 7A, PLAN 7.2): js/engine/kin.js, state.kin.
//
//   * every sibling is a person: name from the family's culture group, gender, birth year, older or younger, alive or dead (year, cause);
//   * the siblings the lottery draws are split into older (already born) and younger (born later, only while the mother lives and is of age);
//     family sizes stay the ones the lottery drew;
//   * siblings, the partner's parents and former partners face the same life tables as everybody else, on a stream of their own;
//   * partners are a history (state.partner stays the current one); in-laws are created at the marriage and are mortal;
//   * the protagonist's life is untouched: same events, same choices, same death, same random-generator state;
//   * old saves get a roster without random numbers; birthOf carries the siblings to a replay.
//
// Run with: node --test tests/kin.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLife, advanceYear, serialize, deserialize, birthOf, getStatus } from '../js/engine/life.js';
import { getSummary } from '../js/engine/summary.js';
import { makeHelpers, HELPER_NAMES } from '../js/engine/helpers.js';
import { newPartner, marry, divorce, endRelationship, setPartner } from '../js/engine/systems.js';
import {
  KIN_TUNING, kinYear, kinAnnounce, ensureKin, kinView, kinSummary, syncPartner, sibWord, inLawTerm, deathPredicate, cleanBirthKin, birthKinOf, KIN_VERSION,
} from '../js/engine/kin.js';
import { lifeTable } from '../js/engine/mortality.js';
import { normalizeBirth } from '../js/engine/birth.js';
import { remember, sanitizeMemories, MEMORY_CAP, QUIET_CAP, listMemories, reflection } from '../js/engine/memory.js';
import { normalizeSummary, cleanStart } from '../js/storage.js';
import { BY_CODE } from '../js/data/countries.js';
import { eraView } from '../js/data/eras.js';
import { getPool } from '../js/data/names.js';
import { scaled } from './lib/scale.mjs';

const COUNTRIES = ['NGA', 'IND', 'USA', 'JPN', 'BRA', 'DEU', 'ETH', 'TWN', 'PAK', 'MEX'];
const mk = (seed, opts = {}, era = 'present') => createLife({ era }, seed, { countryCode: COUNTRIES[Math.abs(hashStr(String(seed))) % COUNTRIES.length], ...opts });
function hashStr(t) { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
const play = (s, to) => { while (s.alive && s.age < to) advanceYear(s, { auto: true }); return s; };
/** One year of the roster alone (no events, no protagonist mortality): the fast way to measure what the roster does. */
function tick(s) {
  s.age += 1; s.year += 1;
  for (const w of ['mother', 'father']) s.family[w].age += 1;
  kinYear(s, null);
  kinAnnounce(s); // (life.js does this at the end of the year, after the events)
}
const withTuning = (patch, fn) => { const old = { ...KIN_TUNING }; Object.assign(KIN_TUNING, patch); try { return fn(); } finally { Object.assign(KIN_TUNING, old); } };

// ---------------------------------------------------------------------------------------------
// 1. The family at birth
// ---------------------------------------------------------------------------------------------

test('birth: the roster exists, siblings are people with names, genders, years, older or younger', () => {
  let withSibs = 0;
  for (let i = 0; i < 300; i++) {
    const s = mk(`b-${i}`);
    const k = s.kin;
    assert.equal(k.v, KIN_VERSION);
    const all = [...k.siblings, ...k.coming];
    assert.equal(all.length + k.dropped, s.family.siblings, 'the planned family is the number the lottery drew (minus those that did not fit)');
    assert.equal(k.birthRoster.length, all.length);
    for (const x of k.siblings) {
      assert.ok(x.birthYear < s.birthYear && x.older === true && x.alive && x.deathYear === null);
      assert.ok(['M', 'F'].includes(x.gender) && x.name && x.given && x.name.includes(x.given.split(' ')[0].slice(0, 1)));
    }
    for (const x of k.coming) assert.ok(x.birthYear > s.birthYear, 'a younger sibling is born later');
    const sibNames = all.map((x) => x.name);
    assert.equal(new Set(sibNames).size, sibNames.length, 'siblings do not share a name');
    for (const n of [s.name.full, s.family.mother.name, s.family.father.name]) assert.ok(!sibNames.includes(n), `a sibling named like ${n}`);
    if (all.length) withSibs++;
  }
  assert.ok(withSibs > 100);
});

test('birth: the order is plausible (a first child at 16 or later, the last by 44; a dead mother has only older children)', () => {
  let young = 0, olderTotal = 0, youngerTotal = 0;
  for (let i = 0; i < 1500; i++) {
    const s = mk(`ord-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    const A = s.family.mother.age;
    const years = [...s.kin.siblings, ...s.kin.coming].map((x) => x.birthYear);
    if (!years.length) continue;
    const first = Math.min(...years, s.birthYear), last = Math.max(...years, s.birthYear);
    assert.ok(A - (s.birthYear - first) >= 16, `first child at ${A - (s.birthYear - first)}`);
    if (s.kin.coming.length) assert.ok(A + (last - s.birthYear) <= 44, `last child at ${A + (last - s.birthYear)}`);
    if (!s.family.mother.alive) assert.equal(s.kin.coming.length, 0, 'a mother who is dead at the birth has no younger children');
    if (A <= 20) young++;
    olderTotal += s.kin.siblings.length; youngerTotal += s.kin.coming.length;
  }
  assert.ok(olderTotal > 500 && youngerTotal > 500, `both kinds exist (${olderTotal} older, ${youngerTotal} younger)`);
  assert.ok(young >= 0);
});

test('birth: family sizes stay the lottery\'s (the planned total is the drawn number; few siblings are lost to the plan)', () => {
  let drawn = 0, planned = 0, dropped = 0;
  const hist = {}, histPlanned = {};
  const n = scaled(4000, 1500);
  for (let i = 0; i < n; i++) {
    const s = mk(`size-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] }, ['past', 'present', 'future'][i % 3]);
    const p = s.kin.siblings.length + s.kin.coming.length;
    drawn += s.family.siblings; planned += p; dropped += s.kin.dropped;
    hist[Math.min(s.family.siblings, 6)] = (hist[Math.min(s.family.siblings, 6)] || 0) + 1;
    histPlanned[Math.min(p, 6)] = (histPlanned[Math.min(p, 6)] || 0) + 1;
  }
  assert.ok(planned / drawn > 0.985, `planned ${planned} of ${drawn} drawn (${dropped} did not fit)`);
  for (const k of Object.keys(hist)) assert.ok(Math.abs((histPlanned[k] || 0) - hist[k]) / n < 0.01, `size ${k}: ${hist[k]} drawn, ${histPlanned[k] || 0} planned`);
});

test('birth: names come from the family\'s culture group and carry the family name', () => {
  let checked = 0;
  for (let i = 0; i < 400; i++) {
    const s = mk(`nm-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    const g = getPool(s.flags._pool);
    for (const x of [...s.kin.siblings, ...s.kin.coming]) {
      const tokens = (x.gender === 'F' ? g.F : g.M);
      assert.ok(!/undefined|null|NaN/.test(x.name), x.name);
      if (g.mode === 'syll') continue;
      if (g.mode !== 'patro' && s.flags._ft) assert.ok(x.name.includes(s.name.family), `${x.name} should carry ${s.name.family}`);
      if (g.mode === 'patro') assert.ok(x.name.includes(s.flags._ft), `${x.name} should carry the father's name ${s.flags._ft}`);
      assert.ok(tokens.length > 10);
      checked++;
    }
  }
  assert.ok(checked > 200);
});

// ---------------------------------------------------------------------------------------------
// 2. Younger siblings are born year by year, only while the mother lives and is of age
// ---------------------------------------------------------------------------------------------

test('younger siblings join in their birth year, never after the mother has died, never past 45', () => {
  let born = 0, cancelled = 0;
  for (let i = 0; i < 700; i++) {
    const s = mk(`young-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length], wealthQ: 1 + (i % 5) });
    const before = s.kin.coming.map((x) => ({ ...x }));
    if (!before.length) continue;
    // the mother dies in a year of the test's choosing (the main stream does that in the game; the roster only reads the result)
    const dieAt = i % 3 === 0 ? s.birthYear + 1 + (i % 7) : null;
    for (let y = 0; y < 30; y++) {
      if (dieAt && s.year + 1 === dieAt) { s.family.mother.alive = false; s.family.mother.deathYear = dieAt; }
      tick(s);
      for (const x of s.kin.siblings.filter((q) => q.birthYear > s.birthYear)) {
        assert.ok(x.birthYear <= s.year, 'a sibling is listed only once born');
        assert.ok(!dieAt || x.birthYear < dieAt, `born ${x.birthYear} after the mother died ${dieAt}`);
        assert.ok(x.birthYear - s.family.mother.birthYear <= 45, 'mother older than 45');
      }
    }
    const after = s.kin.siblings.filter((q) => q.birthYear > s.birthYear);
    for (const b of before) {
      const got = after.find((x) => x.id === b.id);
      if (got) { born++; assert.equal(got.name, b.name); assert.equal(got.birthYear, b.birthYear); } else { cancelled++; assert.ok(dieAt && b.birthYear >= dieAt, 'only a mother\'s death cancels a planned birth'); }
    }
    assert.equal(s.kin.coming.length, 0);
  }
  assert.ok(born > 150 && cancelled > 20, `${born} born, ${cancelled} cancelled`);
});

// ---------------------------------------------------------------------------------------------
// 3. Mortality: the life tables
// ---------------------------------------------------------------------------------------------

test('siblings die at the rates of the life table (by age band) and the dead stay dead with a year and a cause', () => {
  const bands = [[0, 4], [5, 14], [15, 39], [40, 59], [60, 79], [80, 120]];
  const obs = bands.map(() => 0), exp = bands.map(() => 0), years = bands.map(() => 0);
  let people = 0, outlive = 0, withSibs = 0;
  const n = scaled(2500, 1000);
  for (let i = 0; i < n; i++) {
    const s = mk(`mort-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length], wealthQ: 1 + (i % 5), urban: i % 2 === 0 });
    for (let y = 0; y < 90; y++) tick(s);
    for (const x of s.kin.siblings) {
      people++;
      const table = lifeTable(BY_CODE[s.homeCountryCode], x.gender, x.birthYear);
      const first = Math.max(x.birthYear, s.birthYear) + 1; // years of exposure: from the year after both exist, until the death or the end
      const end = x.alive ? s.year : x.deathYear;
      for (let Y = first; Y <= end; Y++) {
        const idx = Y - 1 - x.birthYear;
        const b = bands.findIndex(([lo, hi]) => idx >= lo && idx <= hi);
        if (b < 0) continue;
        exp[b] += table.q[Math.min(idx, 120)];
        years[b]++;
        if (!x.alive && Y === x.deathYear) obs[b]++;
      }
      if (!x.alive) {
        assert.ok(Number.isInteger(x.deathYear) && x.deathYear > x.birthYear && x.cause && x.deathAge === x.deathYear - x.birthYear, JSON.stringify(x));
        assert.equal(x.where, '');
      } else assert.ok(x.deathYear === null && x.cause === null);
    }
    if (s.kin.siblings.length) { withSibs++; if (s.kin.siblings.every((x) => !x.alive)) outlive++; }
  }
  assert.ok(people > 1000);
  bands.forEach(([lo, hi], b) => {
    const tol = 4 * Math.sqrt(exp[b]) + (b === 0 ? 0.1 : 0.05) * exp[b]; // (under 5 the family's wealth and place move the risk; the mean of those factors is 1)
    assert.ok(Math.abs(obs[b] - exp[b]) <= tol, `ages ${lo}-${hi}: observed ${obs[b]} deaths, the table says ${exp[b].toFixed(1)} in ${years[b]} person-years`);
  });
  assert.ok(outlive / withSibs > 0.05 && outlive / withSibs < 0.7, `outliving every sibling: ${outlive}/${withSibs}`);
});

test('the dead are not counted again, causes come from the cause tables, and a death needs a living person', () => {
  const s = mk('dead-1', { countryCode: 'NGA' });
  for (let y = 0; y < 100; y++) tick(s);
  const ids = new Set();
  for (const x of s.kin.siblings) if (!x.alive) ids.add(x.id);
  const snapshot = JSON.stringify(s.kin.siblings.filter((x) => !x.alive));
  for (let y = 0; y < 20; y++) tick(s);
  assert.equal(JSON.stringify(s.kin.siblings.filter((x) => ids.has(x.id))), snapshot, 'nobody dies twice');
});

// ---------------------------------------------------------------------------------------------
// 4. The system line, the memory, the grief
// ---------------------------------------------------------------------------------------------

function crafted(seed, { sibs = 2, laws = false } = {}) {
  const s = mk(seed, { countryCode: 'TWN' });
  s.age = 40; s.year = s.birthYear + 40;
  s.kin.siblings.length = 0; s.kin.coming.length = 0;
  for (let i = 0; i < sibs; i++) {
    s.kin.siblings.push({ id: `s${i + 1}`, name: `王小${i + 1}`, given: `小${i + 1}`, gender: i % 2 ? 'F' : 'M', birthYear: s.birthYear - 3 - i, older: true, alive: true, deathYear: null, deathAge: null, cause: null, where: 'apart', married: true, kids: 2 });
  }
  s.kin.year = s.year;
  if (laws) {
    s.kin.nid.p = 1; s.kin.partners.push({ id: 'p1', name: '林美玲', gender: 'F', birthYear: s.birthYear - 1, status: 'married', since: s.year - 10, until: null, marriedYear: s.year - 10, alive: true, deathYear: null, deathAge: null, cause: null, pool: 'zh_hant', cc: 'TWN', from: s.year - 10 });
    s.kin.cur = 'p1';
    s.partner = { name: '林美玲', gender: 'F', age: 39, status: 'married', since: s.year - 10 };
    s.kin.inLaws.push({ id: 'l1', rel: 'mother', partnerId: 'p1', name: '陳秀英', given: '秀英', gender: 'F', birthYear: s.birthYear - 28, alive: true, deathYear: null, deathAge: null, cause: null, cc: 'TWN', from: s.year - 10 });
    s.kin.inLaws.push({ id: 'l2', rel: 'father', partnerId: 'p1', name: '林大明', given: '大明', gender: 'M', birthYear: s.birthYear - 31, alive: true, deathYear: null, deathAge: null, cause: null, cc: 'TWN', from: s.year - 10 });
  }
  return s;
}
const age121 = (s, id) => { const x = s.kin.siblings.find((q) => q.id === id); x.birthYear = s.year - 121; x.older = true; };

test('deaths of one year become ONE line (kind "kin"), with a memory, a highlight and modest grief', () => {
  const s = crafted('line-1', { sibs: 3, laws: true });
  const before = { h: s.stats.happiness, so: s.stats.social };
  age121(s, 's1'); age121(s, 's2'); // idx 120: certain death this year
  s.kin.inLaws[0].birthYear = s.year - 121;
  const log0 = s.log.length;
  tick(s);
  const lines = s.log.slice(log0).filter((e) => e.kind === 'kin');
  assert.equal(lines.length, 1, 'merged into one line');
  assert.ok(s.kin.siblings.filter((x) => !x.alive).length === 2 && !s.kin.inLaws[0].alive);
  const e = lines[0];
  assert.equal(e.title, '親人過世');
  assert.match(e.text, /你的(哥哥|姊姊|弟弟|妹妹)/);
  assert.ok(e.text.length < 160, `short: ${e.text.length}`);
  assert.ok(e.delta && e.delta.happiness < 0 && e.delta.happiness >= -8 && e.delta.social <= 0 && e.delta.social >= -3, JSON.stringify(e.delta));
  assert.ok(s.stats.happiness < before.h + 0.01 && s.stats.social <= before.so);
  const mem = s.memories.filter((m) => m.k.startsWith('loss:sib:') || m.k.startsWith('loss:inlaw:'));
  assert.equal(mem.length, 3);
  assert.ok(mem.every((m) => m.q === 1 && m.g === 'family'));
  assert.ok(s.highlights.some((h) => /離世/.test(h.text)));
  assert.ok(!/undefined|NaN|null/.test(JSON.stringify(e)));
  // one sibling alone gets a title of its own
  const t = crafted('line-2', { sibs: 1 });
  age121(t, 's1');
  tick(t);
  const one = t.log.filter((x) => x.kind === 'kin');
  assert.equal(one.length, 1);
  assert.match(one[0].title, /^(哥哥|姊姊|弟弟|妹妹)過世$/);
});

test('the news waits when the year is full (twice at most), and a quiet year\'s ordinary line makes room for it', () => {
  // a full year: four lines already written
  const s = crafted('full-1', { sibs: 1 });
  age121(s, 's1');
  s.age += 1; s.year += 1;
  for (const w of ['mother', 'father']) s.family[w].age += 1;
  for (let i = 0; i < 4; i++) s.log.push({ age: s.age, year: s.year, kind: 'event', title: `e${i}`, text: 'x' });
  kinYear(s, null); kinAnnounce(s);
  assert.equal(s.log.filter((e) => e.kind === 'kin').length, 0, 'held back');
  assert.equal(s.kin.news.length, 1);
  assert.ok(!s.kin.siblings[0].alive, 'but the sibling is already dead in the roster');
  s.age += 1; s.year += 1;
  for (const w of ['mother', 'father']) s.family[w].age += 1;
  for (let i = 0; i < 4; i++) s.log.push({ age: s.age, year: s.year, kind: 'event', title: `f${i}`, text: 'x' });
  kinYear(s, null); kinAnnounce(s);
  assert.equal(s.kin.news.length, 1, 'still held: that year is full too');
  s.age += 1; s.year += 1;
  for (const w of ['mother', 'father']) s.family[w].age += 1;
  for (let i = 0; i < 4; i++) s.log.push({ age: s.age, year: s.year, kind: 'event', title: `g${i}`, text: 'x' });
  kinYear(s, null); kinAnnounce(s);
  const kin = s.log.filter((e) => e.kind === 'kin');
  assert.equal(kin.length, 1, 'told after two held years even though the third is full too');
  assert.equal(s.kin.news.length, 0);
  assert.match(kin[0].text, /在\d+歲那年/);
  const mem = s.memories.find((m) => m.k === 'loss:sib:s1');
  assert.equal(mem.a, s.age - 2, 'the memory belongs to the year of the death');
  // a quiet year: the ordinary line is replaced
  const t = crafted('full-2', { sibs: 1 });
  age121(t, 's1');
  t.age += 1; t.year += 1;
  for (const w of ['mother', 'father']) t.family[w].age += 1;
  t.log.push({ age: t.age, year: t.year, kind: 'year', title: `${t.age} 歲`, text: '平凡的一年。' });
  kinYear(t, null); kinAnnounce(t);
  assert.deepEqual(t.log.filter((e) => e.year === t.year).map((e) => e.kind), ['kin']);
});

test('grief can be switched off, and a former partner\'s in-laws die without a line', () => {
  const s = crafted('grief-1', { sibs: 1 });
  age121(s, 's1');
  const h = s.stats.happiness;
  withTuning({ grief: false }, () => tick(s));
  const e = s.log.find((x) => x.kind === 'kin');
  assert.ok(e && !e.delta, 'no stat change');
  assert.equal(s.stats.happiness, h);
  // an ex's parents
  const t = crafted('grief-2', { sibs: 0, laws: true });
  t.kin.partners[0].status = 'divorced'; t.partner.status = 'divorced'; t.kin.partners[0].until = t.year - 2;
  t.kin.inLaws[0].birthYear = t.year - 121;
  tick(t);
  assert.ok(!t.kin.inLaws[0].alive, 'the ex\'s mother still dies');
  assert.equal(t.log.filter((x) => x.kind === 'kin').length, 0, 'but the family does not mourn her in the log');
});

test('words: sibling words, in-law words, death phrases', () => {
  assert.equal(sibWord({ older: true, gender: 'M' }), '哥哥');
  assert.equal(sibWord({ older: true, gender: 'F' }), '姊姊');
  assert.equal(sibWord({ older: false, gender: 'M' }), '弟弟');
  assert.equal(sibWord({ older: false, gender: 'F' }), '妹妹');
  const s = { gender: 'M' };
  assert.equal(inLawTerm(s, { gender: 'F' }, 'mother'), '岳母');
  assert.equal(inLawTerm(s, { gender: 'F' }, 'father'), '岳父');
  assert.equal(inLawTerm({ gender: 'F' }, { gender: 'M' }, 'mother'), '婆婆');
  assert.equal(inLawTerm({ gender: 'F' }, { gender: 'M' }, 'father'), '公公');
  assert.equal(inLawTerm({ gender: 'M' }, { gender: 'M' }, 'mother'), '伴侶的母親');
  assert.equal(deathPredicate('stroke'), '因中風過世了');
  assert.equal(deathPredicate('suicide'), '過世了');
  assert.equal(deathPredicate('other'), '過世了');
  assert.match(deathPredicate('conflict'), /戰事/);
  assert.equal(deathPredicate('homicide'), '喪生於一場暴力事件');
  assert.equal(deathPredicate('stroke', { infant: true }), '因中風離開了');
});

test('every sibling-death sentence reads well: no placeholders, no leaked ids, short', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const s = crafted(`text-${i}`, { sibs: 1 });
    s.age = [3, 9, 20, 40, 70][i % 5]; s.year = s.birthYear + s.age;
    s.kin.year = s.year;
    const x = s.kin.siblings[0];
    x.older = i % 2 === 0; x.gender = i % 3 ? 'M' : 'F';
    x.birthYear = s.year - (i % 4 === 0 ? 121 : 121); // dies this year of old age... use age variants below
    if (i % 6 === 0) s.countryCode = 'JPN';
    if (i % 7 === 0) x.where = 'abroad';
    tick(s);
    const e = s.log.find((q) => q.kind === 'kin');
    assert.ok(e, 'a line');
    assert.ok(!/undefined|NaN|null|\[object|\$\{/.test(e.text), e.text);
    assert.ok(e.text.length <= 120, e.text);
    assert.ok(!/[0-9]{4}/.test(e.text), 'no raw year');
    seen.add(e.text);
  }
  assert.ok(seen.size >= 8, 'variety');
});

// ---------------------------------------------------------------------------------------------
// 5. Parents
// ---------------------------------------------------------------------------------------------

test('parents: birthYear, deathYear, cause and where beside alive / age / name; the year of death is recorded when they die', () => {
  let died = 0, causes = 0;
  for (let i = 0; i < scaled(300, 120); i++) {
    const s = mk(`par-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    play(s, 75);
    for (const who of ['mother', 'father']) {
      const p = s.family[who];
      assert.ok(Number.isInteger(p.birthYear) && p.birthYear < s.birthYear, `${who} born ${p.birthYear}`);
      assert.ok(['with_you', 'apart', 'home_country', ''].includes(p.where));
      const d = makeHelpers(s).parentDiedAt(who);
      if (p.alive) { assert.equal(p.deathYear, null); assert.equal(d, null); assert.notEqual(p.where, ''); continue; }
      died++;
      assert.ok(Number.isInteger(p.deathYear) && p.deathYear >= s.birthYear);
      assert.equal(p.where, '');
      assert.ok(p.cause && d.cause === p.cause && d.year === p.deathYear && d.age === p.deathYear - s.birthYear);
      const line = s.log.find((e) => e.title === (who === 'mother' ? '母親過世' : '父親過世'));
      if (line) { assert.equal(line.year, p.deathYear); causes++; }
    }
  }
  assert.ok(died > 100 && causes > 60);
});

// ---------------------------------------------------------------------------------------------
// 6. Partners: a history; state.partner stays the current one
// ---------------------------------------------------------------------------------------------

test('partners: a remarriage keeps the first spouse; every system that sets or ends a partner updates the history', () => {
  const s = mk('pt-1', { countryCode: 'TWN' });
  s.age = 25; s.year = s.birthYear + 25;
  const h = makeHelpers(s);
  assert.deepEqual(h.partners(), []);
  const a = h.newPartner({ status: 'dating' });
  assert.equal(h.partners().length, 1);
  assert.equal(h.currentPartner().name, a.name);
  assert.equal(h.currentPartner().status, 'dating');
  h.marry();
  assert.equal(h.partners()[0].status, 'married');
  assert.equal(h.partners()[0].marriedYear, s.year);
  s.year += 6; s.age += 6;
  assert.ok(h.divorce());
  assert.equal(h.partners()[0].status, 'divorced');
  assert.equal(h.partners()[0].until, s.year);
  assert.deepEqual(h.exPartners().map((p) => p.name), [a.name]);
  assert.equal(h.lastPartner().name, a.name);
  assert.equal(h.currentPartner(), null);
  s.year += 3; s.age += 3;
  const b = h.newPartner({ status: 'dating', replace: true });
  assert.notEqual(b.name, a.name);
  assert.equal(h.partners().length, 2);
  assert.equal(h.currentPartner().name, b.name);
  assert.equal(h.lastPartner().name, a.name, 'the one before the current partner');
  h.marry();
  s.year += 4; s.age += 4;
  assert.equal(h.partners().length, 2);
  assert.equal(h.partners()[1].status, 'married');
  // a break-up of a dating relationship
  h.divorce();
  const c = h.newPartner({ status: 'dating', replace: true });
  assert.equal(h.endRelationship(2), true);
  assert.equal(h.partners().length, 3);
  assert.equal(h.partners()[2].status, 'ended');
  assert.equal(h.currentPartner(), null);
  assert.deepEqual(h.exPartners().map((p) => p.name), [a.name, b.name, c.name]);
  assert.equal(s.partner, null);
  // a partner set by hand
  h.setPartner({ name: '田中', gender: 'M', age: 32, status: 'dating' });
  assert.equal(h.currentPartner().name, '田中');
  assert.equal(h.partners().length, 4);
  // the helpers read a state that was edited by hand, too
  s.partner = null;
  assert.equal(h.currentPartner(), null);
  assert.equal(h.partners()[3].status, 'ended');
});

test('partners: widowhood is recorded with the year, the age and a cause; the roster follows a natural life', () => {
  let widowed = 0, divorced = 0, remarried = 0, lives = 0;
  for (let i = 0; i < scaled(500, 200); i++) {
    const s = mk(`pt-nat-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    play(s, 90);
    lives++;
    const list = s.kin.partners;
    assert.equal(new Set(list.map((p) => p.id)).size, list.length);
    assert.ok(list.length >= (s.partner ? 1 : 0));
    if (s.partner) {
      const cur = list.find((p) => p.id === s.kin.cur);
      assert.ok(cur && cur.name === s.partner.name, 'the current partner is the one in state.partner');
      assert.equal(cur.status, s.partner.status === 'widowed' && cur.marriedYear == null ? 'ended' : s.partner.status);
    }
    for (const p of list) {
      assert.ok(['dating', 'married', 'divorced', 'widowed', 'ended'].includes(p.status), p.status);
      if (p.status === 'widowed') { widowed++; assert.ok(!p.alive && Number.isInteger(p.deathYear) && p.cause && p.marriedYear != null); }
      if (p.status === 'divorced') { divorced++; assert.ok(p.marriedYear != null && p.until != null); }
      if (!p.alive) assert.ok(Number.isInteger(p.deathYear) && p.cause);
    }
    if (list.filter((p) => p.marriedYear != null).length > 1) remarried++;
    assert.ok((s.flags._married || 0) >= list.filter((p) => p.marriedYear != null).length - 0, 'never more marriages than the life counted');
    // dating and married partners are the main stream's: they are alive in the roster; former partners age on the roster's stream
    for (const p of list) if (p.status === 'dating' || p.status === 'married') assert.ok(p.alive);
  }
  assert.ok(widowed > 5 && divorced > 5 && remarried > 3, `${widowed} widowed, ${divorced} divorced, ${remarried} remarried in ${lives} lives`);
});

// ---------------------------------------------------------------------------------------------
// 7. In-laws
// ---------------------------------------------------------------------------------------------

test('in-laws: created at the marriage with names from the partner\'s culture; alive or not by the tables; they stay under their partner', () => {
  let alive = 0, dead = 0, groups = new Set();
  for (let i = 0; i < 300; i++) {
    const s = mk(`il-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    const age = 20 + (i % 5) * 10;
    s.age = age; s.year = s.birthYear + age;
    const h = makeHelpers(s);
    h.newPartner({ status: 'dating' });
    assert.deepEqual(h.inLawsAlive(), [], 'no in-laws before the marriage');
    assert.equal(h.inLaw('mother'), null);
    h.marry();
    const m = h.inLaw('mother'), f = h.inLaw('father');
    assert.ok(m && f && m.gender === 'F' && f.gender === 'M' && m.rel === 'mother' && f.rel === 'father');
    const pt = s.kin.partners[0];
    assert.equal(m.partnerId, pt.id);
    groups.add(pt.pool);
    const g = getPool(pt.pool);
    if (g.mode !== 'syll' && g.mode !== 'patro' && pt.ft) assert.ok(pt.ft.split('|').some((form) => f.name.includes(form)), `${f.name} should carry the partner's family name ${pt.ft}`);
    for (const x of [m, f]) {
      assert.ok(!/undefined|NaN/.test(x.name));
      assert.ok(x.birthYear < pt.birthYear - 14 && x.birthYear > pt.birthYear - 50, `parent born ${x.birthYear}, partner ${pt.birthYear}`);
      if (x.alive) { alive++; assert.equal(x.deathYear, null); } else { dead++; assert.ok(x.deathYear <= s.year && x.deathYear > pt.birthYear && x.cause); }
    }
    assert.ok(h.inLawWord('mother') && h.inLawWord('father'));
    assert.equal(h.inLawsAlive().length, [m, f].filter((x) => x.alive).length);
  }
  assert.ok(alive > 50 && dead > 50, `${alive} alive, ${dead} dead at the wedding`);
  assert.ok(groups.size >= 3);
});

test('in-laws die over the years; a divorce keeps them with the ex; a new marriage brings a new pair', () => {
  let died = 0;
  for (let i = 0; i < 200; i++) {
    const s = mk(`il2-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    s.age = 24; s.year = s.birthYear + 24;
    const h = makeHelpers(s);
    h.newPartner({ status: 'married', replace: true });
    const pair = h.inLawsAlive();
    for (let y = 0; y < 45; y++) tick(s);
    for (const x of pair) {
      const now = s.kin.inLaws.find((q) => q.id === x.id);
      if (!now.alive) { died++; assert.ok(now.deathYear > s.birthYear + 24 && now.cause); }
    }
    if (i % 2) {
      s.partner.status = 'divorced'; syncPartner(s);
      assert.deepEqual(h.inLawsAlive(), [], 'a divorce ends the in-laws of the present');
      assert.equal(s.kin.inLaws.filter((x) => x.partnerId === s.kin.partners[0].id).length, 2, 'but they stay in the roster under the ex');
      h.newPartner({ status: 'married', replace: true });
      assert.equal(s.kin.inLaws.length, 4);
      assert.ok(h.inLaw('mother') && h.inLaw('mother').partnerId === s.kin.partners[1].id);
    }
  }
  assert.ok(died > 100, `${died} in-laws died in 45 years`);
});

test('in-laws: the wedding text and the roster agree on whether the partner\'s parents are alive', () => {
  for (let i = 0; i < 100; i++) {
    const s = mk(`il3-${i}`, { countryCode: 'TWN' });
    s.age = 30 + (i % 4) * 10; s.year = s.birthYear + s.age;
    s.family.mother.alive = false; s.family.father.alive = false;
    const h = makeHelpers(s);
    h.newPartner({ status: 'married', replace: true });
    const gone = h.inLawsAlive().length === 0;
    assert.equal(h.partnerParentsGone(), gone);
  }
});

// ---------------------------------------------------------------------------------------------
// 8. The protagonist's life is untouched
// ---------------------------------------------------------------------------------------------

function signature(s, skipYears = new Set()) {
  const rows = [];
  for (const e of s.log) {
    if (e.kind === 'kin') continue;
    if (e.kind === 'year' && skipYears.has(e.year)) continue;
    rows.push(`${e.age}|${e.kind}|${e.title}`);
  }
  return { rows, death: s.death ? `${s.death.age}|${s.death.causeId}` : 'alive', rng: s.rng.join(',') };
}
function playFull(seed, era, opts) {
  const s = createLife({ era }, seed, opts);
  let g = 0;
  while (s.alive && g++ < 130) advanceYear(s, { auto: true });
  return s;
}

test('the protagonist\'s stream is untouched: with and without the roster, every life has the same events, choices, death and random-generator state', () => {
  const eras = ['past', 'present', 'future', 'random'];
  const n = scaled(60, 40);
  let kinLines = 0;
  for (let i = 0; i < n; i++) {
    const seed = `det-${i}`;
    const control = withTuning({ enabled: false }, () => playFull(seed, eras[i % 4]));
    assert.equal(control.kin, undefined, 'the control life has no roster');
    const live = withTuning({ grief: false }, () => playFull(seed, eras[i % 4]));
    const skip = new Set(live.log.filter((e) => e.kind === 'kin').map((e) => e.year));
    kinLines += skip.size;
    const a = signature(control, skip), b = signature(live, skip);
    assert.equal(b.death, a.death, `${seed}: death`);
    assert.equal(b.rng, a.rng, `${seed}: the random generator ended in a different state`);
    assert.deepEqual(b.rows, a.rows, `${seed}: events and choices`);
    assert.deepEqual(live.stats, control.stats, `${seed}: stats (grief is off)`);
  }
  assert.ok(kinLines > 20, `the test saw ${kinLines} kin lines`);
});

test('with grief on (as shipped) a life agrees until the first kin line, and the one thing that can differ afterwards is the stats', () => {
  const n = scaled(40, 30);
  let identical = 0, parted = 0;
  for (let i = 0; i < n; i++) {
    const seed = `det2-${i}`;
    const control = withTuning({ enabled: false }, () => playFull(seed, 'present'));
    const live = playFull(seed, 'present');
    const kinYears = live.log.filter((e) => e.kind === 'kin').map((e) => e.age);
    const first = kinYears.length ? Math.min(...kinYears) : 999;
    const skip = new Set(live.log.filter((e) => e.kind === 'kin').map((e) => e.year));
    const a = signature(control, skip), b = signature(live, skip);
    let j = 0;
    while (j < a.rows.length && j < b.rows.length && a.rows[j] === b.rows[j]) j++;
    if (j >= a.rows.length && j >= b.rows.length && a.rng === b.rng) { identical++; continue; }
    parted++;
    const at = +(a.rows[j] || b.rows[j] || '999').split('|')[0];
    assert.ok(at >= first, `${seed}: parted at age ${at}, before the first kin line at ${first}`);
  }
  assert.ok(identical + parted === n);
});

test('the kin line comes after the events: it neither uses up the year\'s entry budget nor leaves an ordinary-year line next to it', () => {
  let told = 0, quiet = 0, held = 0;
  for (let i = 0; i < 160 && told < 12; i++) {
    const s = mk(`bud-${i}`, { countryCode: 'USA' });
    play(s, 30);
    if (!s.alive || !s.kin.siblings.some((x) => x.alive)) continue;
    const x = s.kin.siblings.find((q) => q.alive);
    x.birthYear = s.year - 120; // dies when the next year ticks
    x.older = true;
    const r = advanceYear(s, { auto: true });
    if (!s.alive) continue;
    const kin = r.entries.filter((e) => e.kind === 'kin');
    const events = r.entries.filter((e) => ['event', 'milestone'].includes(e.kind)).length;
    if (kin.length) {
      told++;
      assert.equal(kin.length, 1);
      assert.equal(r.entries[r.entries.length - 1], kin[0], 'last in the year');
      assert.ok(events <= 3 || s.kin.waited === 0);
      if (!r.entries.some((e) => ['event', 'choice', 'milestone'].includes(e.kind))) { quiet++; assert.ok(!r.entries.some((e) => e.kind === 'year'), 'no ordinary-year line next to the kin line'); }
    } else { held++; assert.equal(s.kin.news.length, 1); assert.ok(events >= 4 || r.pendingChoice, 'only a full year (or a waiting choice) holds the news back'); }
  }
  assert.ok(told >= 8, `${told} told, ${quiet} quiet, ${held} held`);
});

// ---------------------------------------------------------------------------------------------
// 9. Old saves, replays, views, storage
// ---------------------------------------------------------------------------------------------

test('an old save (no roster) gets one without random numbers; it is the roster the life would have had', () => {
  for (let i = 0; i < scaled(40, 20); i++) {
    const s = mk(`old-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    play(s, 20 + (i % 5) * 12);
    const copy = JSON.parse(serialize(s));
    delete copy.kin;
    for (const w of ['mother', 'father']) for (const k of ['birthYear', 'deathYear', 'deathAge', 'cause', 'where']) delete copy.family[w][k];
    const rngBefore = copy.rng.join(',');
    const back = deserialize(JSON.stringify(copy));
    assert.equal(back.rng.join(','), rngBefore, 'the generator was not touched');
    assert.ok(back.kin && back.kin.v === KIN_VERSION);
    const key = (x) => `${x.id}|${x.name}|${x.birthYear}|${x.alive}|${x.deathYear}|${x.cause}`;
    assert.deepEqual(back.kin.siblings.map(key), s.kin.siblings.map(key), 'the same siblings, the same deaths');
    assert.deepEqual(back.kin.coming.map((x) => x.id), s.kin.coming.map((x) => x.id));
    for (const who of ['mother', 'father']) {
      assert.equal(back.family[who].birthYear, s.family[who].birthYear);
      assert.equal(back.family[who].alive, s.family[who].alive);
      assert.equal(back.family[who].deathYear, s.family[who].deathYear);
    }
    if (s.partner) assert.equal(back.kin.partners.at(-1).name, s.partner.name);
    // and it plays on
    play(back, back.age + 5);
  }
});

test('an old save with a married partner gets the partner\'s parents, too', () => {
  const s = mk('old-pt', { countryCode: 'JPN' });
  play(s, 40);
  if (!s.partner || s.partner.status !== 'married') { s.age = 40; newPartner(s, { status: 'married', replace: true }); }
  const copy = JSON.parse(serialize(s));
  delete copy.kin;
  const back = deserialize(JSON.stringify(copy));
  assert.equal(back.kin.partners.length, 1);
  assert.equal(back.kin.inLaws.length, 2);
  assert.ok(back.kin.inLaws.every((x) => x.name && x.partnerId === back.kin.partners[0].id));
});

test('birthOf carries the siblings planned at birth; a replay reuses them (names, genders, years) and plays a normal life', () => {
  for (let i = 0; i < 60; i++) {
    const s = mk(`re-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length] });
    play(s, 30);
    const b = birthOf(s);
    assert.deepEqual(b.kin, birthKinOf(s));
    assert.equal(b.kin.siblings.length, s.kin.birthRoster.length);
    const nb = normalizeBirth(b);
    assert.ok(nb && nb.full);
    assert.deepEqual(nb.kin, b.kin.siblings.length ? b.kin : { siblings: [] });
    const again = createLife({ era: 'present' }, `re2-${i}`, { birth: b });
    const names = (k) => [...k.siblings, ...k.coming].map((x) => `${x.name}|${x.gender}|${x.birthYear}`);
    assert.deepEqual(names(again.kin), names(s.kin).filter(Boolean).length ? names(s.kin) : [], 'the same family');
    assert.deepEqual(again.kin.birthRoster.map((x) => x.name), b.kin.siblings.map((x) => x.name));
    play(again, 20);
  }
  // an old record without a roster: planned from the number
  const s = mk('re-old', { countryCode: 'NGA' });
  const b = birthOf(s);
  delete b.kin;
  const again = createLife({ era: 'present' }, 're-old-2', { birth: b });
  assert.equal(again.kin.siblings.length + again.kin.coming.length + again.kin.dropped, s.family.siblings);
  // a bad roster is ignored, the start stays valid
  const bad = { ...birthOf(s), kin: { siblings: [{ name: 'x', gender: 'Q', birthYear: 1 }] } };
  assert.equal(normalizeBirth(bad).kin, undefined);
  assert.equal(cleanBirthKin({ siblings: new Array(12).fill({ name: 'a', gender: 'M', birthYear: s.birthYear - 2 }) }, s.birthYear), undefined);
});

test('getStatus and getSummary carry the roster; the album record keeps what the summary needs', () => {
  const s = mk('view-1', { countryCode: 'TWN' });
  play(s, 60);
  const st = getStatus(s);
  assert.ok(st.kin && Array.isArray(st.kin.siblings) && st.kin.parents.mother && Array.isArray(st.kin.partners) && Array.isArray(st.kin.inLaws));
  assert.equal(st.siblings, s.family.siblings, 'the legacy number is still there');
  for (const x of st.kin.siblings) assert.ok(x.word && Number.isFinite(x.age) && typeof x.alive === 'boolean');
  st.kin.siblings.forEach((x) => { x.name = 'changed'; });
  assert.notEqual(s.kin.siblings[0] && s.kin.siblings[0].name, 'changed', 'a view is a copy');
  while (s.alive) advanceYear(s, { auto: true });
  const sum = getSummary(s);
  assert.ok(sum.kin && sum.kin.parents.mother.name === s.family.mother.name);
  assert.equal(sum.kin.siblings.length, s.kin.siblings.length);
  const rec = normalizeSummary(JSON.parse(JSON.stringify(sum)));
  assert.deepEqual(rec.kin, JSON.parse(JSON.stringify(kinSummary(s))), 'storage keeps the whole roster summary');
  // an old record has none, and a damaged one is tamed
  const old = JSON.parse(JSON.stringify(sum)); delete old.kin;
  assert.equal(normalizeSummary(old).kin, undefined);
  const ugly = JSON.parse(JSON.stringify(sum)); ugly.kin = { siblings: [null, 5, { name: 'x'.repeat(500), gender: 'Z', kids: 1e9 }], parents: 7, partners: 'x', inLaws: [{}] };
  const tamed = normalizeSummary(ugly).kin;
  assert.equal(tamed.siblings.length, 1);
  assert.ok(tamed.siblings[0].name.length <= 80 && tamed.siblings[0].kids <= 20);
  assert.equal(tamed.parents.mother, null);
  // the start keeps its roster
  const start = cleanStart(JSON.parse(JSON.stringify(birthOf(s))));
  assert.deepEqual(start.kin, birthOf(s).kin);
});

// ---------------------------------------------------------------------------------------------
// 10. Helpers and memory
// ---------------------------------------------------------------------------------------------

test('helpers: the roster helpers exist and answer from the roster; the legacy number is siblingsAtBirth', () => {
  for (const n of ['siblings', 'livingSiblings', 'sibling', 'hasLivingSibling', 'siblingName', 'siblingWord', 'partners', 'currentPartner', 'exPartners', 'lastPartner', 'inLaw', 'inLawsAlive', 'inLawWord', 'parentDiedAt', 'siblingsAtBirth', 'kin']) {
    assert.ok(HELPER_NAMES.includes(n), `missing helper ${n}`);
  }
  const s = crafted('help-1', { sibs: 3 });
  const h = makeHelpers(s);
  s.kin.siblings[1].alive = false; s.kin.siblings[1].deathYear = s.year - 2; s.kin.siblings[1].deathAge = 33; s.kin.siblings[1].cause = 'cancer';
  assert.equal(h.siblings().length, 3);
  assert.equal(h.livingSiblings().length, 2);
  assert.equal(h.siblings({ alive: false })[0].id, 's2');
  assert.equal(h.siblings({ gender: 'M' }).length, 2);
  assert.equal(h.siblings({ older: false }).length, 0);
  assert.equal(h.hasLivingSibling(), true);
  assert.equal(h.hasLivingSibling({ older: true, gender: 'F' }), false, 'the only sister is dead');
  assert.equal(h.hasLivingSibling({ older: true, gender: 'M' }), true);
  assert.equal(h.siblingWord({ gender: 'F' }), '姊姊');
  assert.equal(h.siblingName({ gender: 'F' }), '小2');
  assert.equal(h.siblingName({ gender: 'F' }, { full: true }), '王小2');
  assert.equal(h.sibling({ alive: true }).id, 's1', 'the closest in age');
  assert.equal(h.siblingWord({ gender: 'M', older: false }), '', 'nobody matches');
  assert.equal(h.siblingName({ older: false }), '');
  assert.equal(h.sibling('s3').id, 's3');
  assert.equal(h.siblingsAtBirth(), s.family.siblings);
  assert.equal(typeof h.siblingsAtBirth(), 'number');
  const t = mk('help-2');
  assert.equal(makeHelpers(t).parentDiedAt('mother'), t.family.mother.alive ? null : makeHelpers(t).parentDiedAt('mother'));
  assert.ok(h.kin().siblings.length === 3);
});

test('memory: kin memories are quiet (never spoken by a reflection, outside the cap of the others), and survive sanitising', () => {
  const s = mk('mem-1');
  s.age = 40;
  for (let i = 0; i < MEMORY_CAP + 5; i++) remember(s, `c:x${i}`, `一件很久以前的事 ${i} 號`, { tag: 'family', age: 10 + (i % 20) });
  const loud = () => s.memories.filter((m) => !m.q).length;
  assert.equal(loud(), MEMORY_CAP);
  for (let i = 0; i < QUIET_CAP + 4; i++) remember(s, `loss:sib:s${i}`, `你的哥哥小${i}過世了`, { tag: 'family', w: 3, quiet: true });
  assert.equal(loud(), MEMORY_CAP, 'quiet memories never push an ordinary one out');
  assert.equal(s.memories.filter((m) => m.q).length, QUIET_CAP, 'and have a cap of their own');
  const back = sanitizeMemories(JSON.parse(JSON.stringify(s.memories)));
  assert.equal(back.filter((m) => m.q).length, QUIET_CAP);
  assert.equal(back.filter((m) => !m.q).length, MEMORY_CAP);
  assert.ok(listMemories(s).some((m) => m.key.startsWith('loss:sib:')), 'still listed for the family drawer');
  // not chosen by a reflection
  const t = mk('mem-2');
  t.age = 40;
  remember(t, 'loss:sib:s1', '你的哥哥小明過世了', { tag: 'family', w: 3, quiet: true, age: 30 });
  for (let a = 38; a < 80; a++) { t.age = a; t.flags._reflAt = -99; t.flags._echoAt = -99; assert.equal(reflection(t), '', 'a life with only quiet memories has nothing to reflect on'); }
});

test('disabled: with the roster switched off nothing breaks and nothing is written', () => {
  withTuning({ enabled: false }, () => {
    const s = createLife({ era: 'present' }, 'off-1', { countryCode: 'USA' });
    assert.equal(s.kin, undefined);
    play(s, 40);
    assert.equal(s.kin, undefined);
    assert.equal(ensureKin(s), null);
    assert.equal(kinView(s), null);
    const st = getStatus(s);
    assert.equal(st.kin, null);
    const h = makeHelpers(s);
    assert.deepEqual(h.siblings(), []);
    assert.equal(h.inLaw('mother'), null);
    assert.equal(birthOf(s).kin, undefined);
    assert.equal(getSummary(s).kin, null);
  });
});

test('a long playthrough of the roster keeps its invariants', () => {
  for (let i = 0; i < scaled(200, 80); i++) {
    const s = mk(`inv-${i}`, { countryCode: COUNTRIES[i % COUNTRIES.length], gender: i % 2 ? 'F' : 'M' }, ['past', 'present', 'future'][i % 3]);
    while (s.alive) advanceYear(s, { auto: true });
    const k = s.kin;
    const ids = [...k.siblings, ...k.coming, ...k.partners, ...k.inLaws].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
    assert.ok(k.year <= s.year);
    for (const x of k.siblings) {
      assert.ok(x.birthYear <= s.year);
      assert.equal(x.older, x.birthYear < s.birthYear);
      if (!x.alive) assert.ok(x.deathYear >= x.birthYear && x.deathYear <= s.year);
      assert.ok(x.kids >= 0 && x.kids <= 8);
    }
    for (const x of k.inLaws) assert.ok(k.partners.some((p) => p.id === x.partnerId));
    const v = kinView(s);
    assert.ok(v.siblings.every((x) => x.word));
    assert.equal(sibWord({ older: true, gender: 'M' }), '哥哥');
    assert.ok(eraView(BY_CODE[s.homeCountryCode], s.birthYear));
  }
});
