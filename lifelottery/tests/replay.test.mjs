// 同一起點，再活一次 (Phase 5E): createLife(settings, seed, { birth }) reuses the start of an earlier life and nothing else.
// Run with: node --test tests/replay.test.mjs   (from lifelottery/)

import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife, advanceYear, serialize, deserialize, birthOf, normalizeBirth } from '../js/engine/life.js';
import { makeHelpers } from '../js/engine/helpers.js';
import { getSummary } from '../js/engine/summary.js';
import { placePhrases } from '../js/engine/place.js';
import { describeBirth } from '../js/engine/birth.js';
import { composeEulogy } from '../js/engine/eulogy.js';
import * as store from '../js/storage.js';
import { evaluateAchievements } from '../js/ui/achievements.js';
import { COUNTRIES } from '../js/data/countries.js';

const ERAS = ['past', 'present', 'future', 'random'];
const play = (s, years) => { for (let i = 0; i < years && s.alive; i++) advanceYear(s, { auto: true }); return s; };
const playOut = (s) => { for (let i = 0; i < 130 && s.alive; i++) advanceYear(s, { auto: true }); return s; };
const settingsFor = (i) => ({ era: ERAS[i % 4], drawMode: i % 3 ? 'births' : 'population' });

test('without a birth the life is byte for byte the same (undefined, {} and an explicit undefined birth)', () => {
  for (let i = 0; i < 60; i++) {
    const st = settingsFor(i), seed = `same-${i}`;
    const a = createLife(st, seed);
    const b = createLife(st, seed, {});
    const c = createLife(st, seed, { birth: undefined, novelty: {} });
    assert.equal(serialize(a), serialize(b));
    assert.equal(serialize(a), serialize(c));
    assert.ok(!('_fix' in a.flags), 'no replay marker on an ordinary life');
  }
  // and the lives that follow are the same too
  for (let i = 0; i < 8; i++) {
    const a = play(createLife(settingsFor(i), `same-long-${i}`), 70);
    const b = play(createLife(settingsFor(i), `same-long-${i}`, { birth: undefined }), 70);
    assert.equal(serialize(a), serialize(b));
  }
});

test('birthOf: the start is exact at any age and survives JSON', () => {
  for (let i = 0; i < 60; i++) {
    const s = createLife(settingsFor(i), `birthof-${i}`);
    const b0 = birthOf(s);
    assert.deepEqual(JSON.parse(JSON.stringify(b0)), b0);
    play(s, 5 + (i * 7) % 85);
    assert.deepEqual(birthOf(s), b0, `birthOf must not change as the life goes on (life ${i}, age ${s.age})`);
    playOut(s);
    assert.deepEqual(birthOf(s), b0, `... nor after death (life ${i})`);
    assert.deepEqual(birthOf(deserialize(serialize(s))), b0, 'nor after a save and reload');
  }
});

test('createLife with a birth reuses the whole start and takes the rest from the new seed', () => {
  let different = 0;
  for (let i = 0; i < 80; i++) {
    const first = createLife(settingsFor(i), `first-${i}`);
    const b = birthOf(first);
    playOut(first);
    const again = createLife({ era: 'present', drawMode: 'births' }, `second-${i}`, { birth: b });
    // the start
    assert.equal(again.homeCountryCode, first.homeCountryCode);
    assert.equal(again.countryCode, first.homeCountryCode);
    assert.equal(again.flags._birthCity, b.city);
    assert.equal(again.flags._birthUrban, b.urban);
    assert.equal(again.urban, b.urban);
    assert.equal(again.gender, b.gender);
    assert.equal(again.family.wealthQ, b.wealthQ);
    assert.deepEqual(again.name, { given: b.name.given, family: b.name.family, full: b.name.full });
    assert.equal(again.flags._gt, first.flags._gt);
    assert.equal(again.flags._ft, first.flags._ft);
    assert.equal(again.flags._pool, b.poolKey);
    assert.equal(again.birthYear, b.birthYear);
    assert.equal(again.year, b.birthYear);
    assert.equal(again.settings.era, b.eraKey, 'the era comes from the start, not from the settings');
    assert.equal(again.family.siblings, b.siblings);
    assert.deepEqual(again.family.mother, b.mother);
    assert.deepEqual(again.family.father, b.father);
    assert.equal(again.religion, b.religion);
    assert.equal(makeHelpers(again).familyBusiness(), b.business);
    assert.deepEqual(birthOf(again), b, 'a replayed life has the same start again (so it can be replayed in turn)');
    // the rest is new
    assert.equal(again.seed, `second-${i}`);
    playOut(again);
    if (serialize(again.log) !== serialize(first.log)) different++;
  }
  assert.ok(different >= 78, `the lives themselves differ with a new seed (${different}/80)`);
});

test('the same birth and the same seed give the same life; save, load and play on is unchanged', () => {
  for (let i = 0; i < 20; i++) {
    const b = birthOf(createLife(settingsFor(i), `det-${i}`));
    const a1 = playOut(createLife({}, `det-new-${i}`, { birth: b }));
    const a2 = playOut(createLife({}, `det-new-${i}`, { birth: b }));
    assert.equal(serialize(a1), serialize(a2));
    const mid = play(createLife({}, `det-new-${i}`, { birth: b }), 30);
    const reloaded = deserialize(serialize(mid));
    assert.equal(reloaded.flags._fix.family_business, mid.flags._fix.family_business);
    assert.equal(serialize(playOut(reloaded)), serialize(playOut(mid)));
  }
});

test('the family business answer is carried over whichever way it went', () => {
  let yes = 0, no = 0;
  for (let i = 0; i < 400 && (yes < 8 || no < 8); i++) {
    const first = createLife({ era: 'present' }, `biz-${i}`, { wealthQ: 3 });
    const b = birthOf(first);
    if (b.business) yes++; else no++;
    for (const seed of ['x1', 'x2', 'x3', 'x4', 'x5', 'x6']) {
      const r = createLife({}, `${seed}-${i}`, { birth: b });
      assert.equal(makeHelpers(r).familyBusiness(), b.business, `family business of ${i} with seed ${seed}`);
    }
  }
  assert.ok(yes >= 8 && no >= 8, `both answers were exercised (${yes}/${no})`);
});

test('every country can be replayed (all 173 starts, played to the end)', () => {
  for (const c of COUNTRIES) {
    const first = createLife({ era: 'present' }, `c-${c.code}`, { countryCode: c.code });
    const again = playOut(createLife({}, `c2-${c.code}`, { birth: birthOf(first) }));
    assert.equal(again.homeCountryCode, c.code);
    assert.ok(!again.alive);
  }
});

test('a partial start (an old record) fixes what it knows and draws the rest', () => {
  for (let i = 0; i < 40; i++) {
    const first = playOut(createLife(settingsFor(i), `partial-${i}`));
    const sum = getSummary(first);
    const part = { v: 1, eraKey: sum.era, birthYear: sum.birthYear, countryCode: sum.homeCountry.code, city: sum.birthCity, urban: sum.urbanBirth, gender: sum.gender, wealthQ: sum.wealthQ };
    const nb = normalizeBirth(part);
    assert.ok(nb && nb.full === false);
    const r = createLife({}, `partial-new-${i}`, { birth: part });
    assert.equal(r.homeCountryCode, first.homeCountryCode);
    assert.equal(r.flags._birthCity, first.flags._birthCity);
    assert.equal(r.flags._birthUrban, first.flags._birthUrban);
    assert.equal(r.gender, first.gender);
    assert.equal(r.family.wealthQ, first.family.wealthQ);
    assert.equal(r.birthYear, first.birthYear);
    assert.equal(r.settings.era, first.settings.era);
    assert.ok(!('_fix' in r.flags));
    assert.ok(playOut(r) && !r.alive);
  }
});

test('an unusable birth is refused', () => {
  const good = birthOf(createLife({}, 'bad-0'));
  assert.ok(normalizeBirth(good).full);
  const cases = {
    'not an object': 'x', 'unknown country': { ...good, countryCode: 'ZZZ' }, 'bad gender': { ...good, gender: 'X' }, 'bad wealth': { ...good, wealthQ: 9 },
    'bad year': { ...good, birthYear: 'abc' }, 'bad era': { ...good, eraKey: 'random' }, 'urban not a boolean': { ...good, urban: 1 },
  };
  for (const [label, b] of Object.entries(cases)) {
    assert.equal(normalizeBirth(b), null, label);
    assert.throws(() => createLife({}, 'bad-1', { birth: b }), /Invalid birth/, label);
  }
  // damaged details make it a partial start, not a crash
  for (const [label, b] of Object.entries({
    'unknown culture group': { ...good, poolKey: 'nope' }, 'no name': { ...good, name: null }, 'parent age off': { ...good, mother: { ...good.mother, age: 3 } },
    'siblings off': { ...good, siblings: 99 }, 'unknown religion': { ...good, religion: 'x' }, 'city not of the country': { ...good, city: '火星' },
  })) {
    const nb = normalizeBirth(b);
    assert.ok(nb && nb.full === false, label);
    assert.ok(playOut(createLife({}, 'bad-2', { birth: b })), label);
  }
});

test('place phrasing: 印度孟買近郊的鄉村, not 印度的孟買附近的鄉村', () => {
  assert.deepEqual(placePhrases('印度', '孟買', false), { short: '孟買近郊的鄉村', full: '印度孟買近郊的鄉村' });
  assert.deepEqual(placePhrases('印度', '孟買', true), { short: '孟買', full: '印度的孟買' });
  assert.equal(placePhrases('墨西哥', '墨西哥城', true).full, '墨西哥城');
  assert.equal(placePhrases('墨西哥', '墨西哥城', false).full, '墨西哥城近郊的鄉村');
  assert.equal(placePhrases('香港', '香港', false).full, '香港的鄉村');
  assert.equal(placePhrases('香港', '香港', true).full, '香港');
  assert.equal(placePhrases('利比亞', '的黎波里', true).full, '利比亞的黎波里');
  assert.equal(placePhrases('日本', '', true).full, '日本');
  // every city of every country reads naturally, on the lottery reveal and in the eulogy
  for (const c of COUNTRIES) {
    for (const city of c.cities) {
      for (const urban of [true, false]) {
        const full = placePhrases(c.name, city, urban).full;
        assert.ok(!/的[^的]*附近的鄉村|附近的鄉(村|下)/.test(full), full);
        assert.ok(full.includes(city) || city === c.name || city.startsWith(c.name), full);
        if (!urban) assert.ok(/(近郊的|的)鄉村$/.test(full), full);
      }
    }
  }
  const rural = createLife({}, 'place-1', { countryCode: 'IND', urban: false });
  const b = describeBirth(rural);
  assert.equal(b.placeFull, `印度${rural.city}近郊的鄉村`);
  assert.equal(b.placeText, `${rural.city}近郊的鄉村`);
  const text = composeEulogy({ ...getSummary(playOut(rural)) }).text;
  assert.ok(!/附近的鄉村/.test(text), text);
});

test('the eulogy names a rural birthplace as 近郊的鄉村', () => {
  let rural = 0;
  for (let i = 0; i < 60; i++) {
    const s = playOut(createLife({ era: 'present' }, `eul-${i}`, { urban: false }));
    const sum = getSummary(s);
    const e = composeEulogy(sum).text;
    assert.ok(!/附近的鄉村|附近的鄉下/.test(e), e);
    if (e.includes('近郊的鄉村')) rural++;
  }
  assert.ok(rural >= 10, `rural births are named in the eulogy (${rural}/60)`);
});

// ---- storage ----------------------------------------------------------------------------------------------------------

test('storage keeps the start and the replay link with the record, and drops what is not valid', () => {
  const s = playOut(createLife({}, 'store-1'));
  const birth = birthOf(s);
  const rec = store.normalizeRecord({ id: 'r1', savedAt: 1, message: '', summary: getSummary(s), meta: { drawMode: 'births', birth, replay: { prev: 'r0', start: 'r0', n: 3, junk: 1 } } });
  assert.deepEqual(rec.meta.birth, birth);
  assert.deepEqual(rec.meta.replay, { prev: 'r0', start: 'r0', n: 3 });
  assert.equal(store.normalizeRecord({ ...rec, meta: { birth: { v: 1, countryCode: 'TWN' }, replay: { prev: '', start: 'x' } } }).meta, undefined);
  assert.deepEqual(store.cleanReplay({ prev: 'a', start: 'b', n: 1, partial: true }), { prev: 'a', start: 'b', n: 2, partial: true });
  assert.equal(store.cleanReplay(null), null);
  // survives a JSON round trip and is still a valid start for createLife
  const back = store.normalizeRecord(JSON.parse(JSON.stringify(rec)));
  assert.ok(normalizeBirth(back.meta.birth).full);
});

test('same_start_3: three lives on one start', () => {
  const mk = (id, replay) => ({ id, savedAt: 1, message: '', summary: getSummary(playOut(createLife({}, `ach-${id}`))), meta: replay ? { replay } : undefined });
  const a = mk('a'), b = mk('b', { prev: 'a', start: 'a', n: 2 }), c = mk('c', { prev: 'b', start: 'a', n: 3 });
  const done = (list) => new Set(evaluateAchievements(list).filter((x) => x.done).map((x) => x.id));
  assert.ok(!done([a, b]).has('same_start_3'));
  assert.ok(done([a, b, c]).has('same_start_3'));
  assert.ok(!done([a, mk('d'), mk('e')]).has('same_start_3'), 'three unrelated lives do not count');
  // the first life may be gone: the two replays still name the same start
  const prog = evaluateAchievements([b, c]).find((x) => x.id === 'same_start_3');
  assert.equal(prog.value, 2);
});
