// Coherence audit: does what the log SAYS fit what the state IS?
//
// Plays a fixed set of lives (eras x draw modes x every country), renders every text the player would read and checks it
// against the state with the rules in tests/lib/coherence.mjs (work words for a child, school words for someone who is not
// in school, a partner who does not exist, a smartphone in 1975 ...). The fixed seeds make a failure reproducible:
//
//     node tools/coherence-scan.mjs 1200 cohtest          # same lives, readable report
//     node tools/read-life.mjs --seed ... --country ...    # read one life
//
// A legitimate exception goes into ALLOW in tests/lib/coherence.mjs with a reason; an entry that never matches fails the
// "no stale allowlist entries" test.
// Run with: node --test tests/coherence.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLife, advanceYear } from '../js/engine/life.js';
import { makeHelpers } from '../js/engine/helpers.js';
import { COUNTRIES } from '../js/data/countries.js';
import { getSummary, curateHighlights, MAX_HIGHLIGHTS } from '../js/engine/summary.js';
import { RULES, ALLOW, snapshot, runAudit, lifeConfigs, groupFlags, playAudited } from './lib/coherence.mjs';

const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]));
const ALL_CODES = COUNTRIES.map((c) => c.code);

/** A snapshot of a fresh life with a few fields overridden. */
function snapWith(over = {}) {
  const s = createLife({ era: 'present' }, 'coh-unit', { countryCode: 'CHN', wealthQ: 3 });
  return { ...snapshot(s), ...over };
}
const hits = (id, snap, text) => RULE[id].check(snap, text).map((h) => h.word);

// ---------------------------------------------------------------------------------------------
// 1. The rules themselves (the contradictions reported by hand are the first regression cases)
// ---------------------------------------------------------------------------------------------

test('rules: work words for a child (rainy-season night "trapped in the office", age 15)', () => {
  const child = snapWith({ age: 15, status: 'child', employed: false, inSchool: true, everWorked: false });
  const w = hits('work', child, '你被困在辦公室過夜。同事們把椅子拼成床。');
  assert.ok(w.includes('辦公室') && w.includes('同事'), `flagged: ${w}`);
  // the same sentence is fine for an office worker
  const clerk = snapWith({ age: 30, status: 'employed', employed: true, job: 'clerk', inSchool: false, everWorked: true });
  assert.deepEqual(hits('work', clerk, '你被困在辦公室過夜。同事們把椅子拼成床。'), []);
});

test('rules: toddler phrasing at age 9 ("最早的玩伴"), fine at age 2 and for a parent of a toddler', () => {
  assert.deepEqual(hits('toddler', snapWith({ age: 9 }), '螢幕裡的世界，是你最早的玩伴。'), ['最早的玩伴']);
  assert.deepEqual(hits('toddler', snapWith({ age: 9 }), '今天你說出第一個長句子。'), ['第一個長句子']);
  assert.deepEqual(hits('toddler', snapWith({ age: 2 }), '螢幕裡的世界，是你最早的玩伴。'), []);
  assert.deepEqual(hits('toddler', snapWith({ age: 30, kids: 1, youngestKid: 1, youngestAliveKid: 1 }), '你把嬰兒車推進電梯。'), []);
});

test('rules: partner, kids, school, retirement, technology', () => {
  const single = snapWith({ age: 30, partner: null, everPartner: false, kids: 0, kidsAlive: 0, status: 'employed', employed: true, inSchool: false });
  assert.ok(hits('partner', single, '你和伴侶約好週末一起去市場。').length > 0);
  assert.ok(hits('kids', single, '你的孩子在客廳寫功課。').length > 0);
  assert.ok(hits('school', single, '老師在黑板上寫下今天的作業。').length > 0);
  assert.ok(hits('retire', single, '你已經退休了，每天去公園。').length > 0);
  // smartphone before 2008 (rich country), mobile phone before 1995
  assert.ok(hits('smart', snapWith({ year: 1990, incomeAt: 'H', urban: true }), '你用智慧型手機傳了一則訊息。').length > 0);
  assert.ok(hits('smart', snapWith({ year: 2020, incomeAt: 'H', urban: true }), '你用智慧型手機傳了一則訊息。').length === 0);
  assert.ok(hits('phone', snapWith({ year: 1980, incomeAt: 'H', urban: true }), '你把手機放進口袋。').length > 0);
  // a leftover template token is always wrong
  assert.ok(hits('template', snapWith(), '你的孩子叫undefined。').length > 0);
  assert.ok(hits('template', snapWith(), '你笑了，，然後走開。').length > 0);
});

test('rules: self-context exemptions (memories, other people, negations) are not flagged', () => {
  const child = snapWith({ age: 12, status: 'child', employed: false, inSchool: true });
  assert.deepEqual(hits('work', child, '爸爸在辦公室加班，你一個人在家寫作業。'), [], 'a parent at work is fine');
  const retired = snapWith({ age: 70, status: 'retired', employed: false, inSchool: false, eduYears: 9 });
  assert.deepEqual(hits('school', retired, '你想起小時候老師罰你站在教室外。'), [], 'a memory of school is fine');
});

test('every allowlist entry carries a reason', () => {
  for (const a of ALLOW) assert.ok(a.reason && a.reason.length > 10, `allowlist entry without reason: ${a.rule}/${a.event}`);
});

// ---------------------------------------------------------------------------------------------
// 2. Helpers that keep stories consistent
// ---------------------------------------------------------------------------------------------

test('familyBusiness(): stable per life, only for middle-quintile families', () => {
  const seen = { yes: 0, no: 0 };
  for (let i = 0; i < 80; i++) {
    for (const q of [1, 2, 3, 4, 5]) {
      const s = createLife({ era: 'present' }, `fb-${i}-${q}`, { wealthQ: q });
      const h = makeHelpers(s);
      const a = h.familyBusiness();
      assert.equal(h.familyBusiness(), a, 'stable within a life');
      if (q === 1 || q === 5) assert.equal(a, false, `quintile ${q} has no family shop`);
      if (a) seen.yes++; else seen.no++;
    }
  }
  assert.ok(seen.yes > 20 && seen.no > 100, `a third of the middle families have one: ${JSON.stringify(seen)}`);
});

test('"小老闆" (the family shop) only happens to a family that has a shop', () => {
  let n = 0;
  for (const cfg of lifeConfigs(240, { prefix: 'shop' })) {
    const { s, rows } = playAudited(cfg.settings, cfg.seed, cfg.opts);
    if (!rows.some((r) => r.entry.title === '小老闆')) continue;
    n++;
    assert.ok(makeHelpers(s).familyBusiness(), `${cfg.seed}: shop scene without a family shop`);
    assert.ok(s.family.wealthQ >= 2 && s.family.wealthQ <= 4);
  }
  assert.ok(n > 0, 'the scene should occur at least once in 240 lives');
});

// ---------------------------------------------------------------------------------------------
// 3. The audit over a fixed set of lives
// ---------------------------------------------------------------------------------------------

const AUDIT_LIVES = 1300;
let audit = null;
function runOnce() {
  if (!audit) {
    const t0 = Date.now();
    audit = runAudit(lifeConfigs(AUDIT_LIVES, { prefix: 'cohtest', countries: ALL_CODES }), {});
    audit.seconds = (Date.now() - t0) / 1000;
  }
  return audit;
}

const SOFT = new Set(['density', 'dup_year']); // engine-level, budgeted below rather than forbidden

test(`audit: zero text/state contradictions in ${AUDIT_LIVES} fixed-seed lives`, () => {
  const res = runOnce();
  const hard = res.flags.filter((f) => !SOFT.has(f.rule));
  if (hard.length) {
    const lines = groupFlags(hard).slice(0, 15).map((g) => `${g.n}x ${g.rule} ${g.id} [${g.word}] ${g.sample.why} :: ${g.sample.sentence} (seed ${g.sample.seed})`);
    assert.fail(`${hard.length} contradictions:\n  ${lines.join('\n  ')}`);
  }
  assert.ok(res.seconds < 60, `audit took ${res.seconds}s`);
});

test('audit: no stale allowlist entries', () => {
  const res = runOnce();
  // an entry for an event this sample never produced cannot be judged; one whose event was seen but never tripped the rule is stale
  const stale = res.staleAllow.filter((a) => !a.rare && (typeof a.event !== 'string' || res.stats.eventsSeen.has(a.event)));
  assert.deepEqual(stale.map((a) => `${a.rule}/${a.event}`), [], 'remove allowlist entries that no longer match anything');
});

test('audit: feed density and repetition stay within budget', () => {
  const res = runOnce();
  const soft = res.flags.filter((f) => SOFT.has(f.rule));
  // 5+ entries in one year, or an ordinary-year line coming back within 4 years: at most one life in a hundred
  assert.ok(soft.length <= AUDIT_LIVES * 0.01, `${soft.length} density / repeated-line flags: ${JSON.stringify(res.stats.perRule)}`);
  // a year with 4 non-choice entries happens, but rarely
  assert.ok(res.stats.years4 / res.stats.years < 0.01, `${res.stats.years4} of ${res.stats.years} years have 4+ entries`);
});

test('audit: lives that reach adulthood make 15-45 choices on average', () => {
  const res = runOnce();
  const mean = res.stats.adultChoices.reduce((a, b) => a + b, 0) / res.stats.adultChoices.length;
  assert.ok(mean >= 15 && mean <= 45, `mean adult choices ${mean.toFixed(1)}`);
});

test('audit: broad event coverage (at least 480 distinct events seen)', () => {
  assert.ok(runOnce().stats.eventsSeen.size >= 480, `only ${runOnce().stats.eventsSeen.size} events seen`);
});

// ---------------------------------------------------------------------------------------------
// 4. Pandemic follow-ups are scheduled by the pandemic event itself
// ---------------------------------------------------------------------------------------------

test('pandemic follow-ups only appear in lives where the pandemic event happened', () => {
  const FOLLOW = ['螢幕裡的教室', '疫情裡的工作日', '疫苗與排隊', '來不及見的最後一面', '好不了的疲倦', '重新擁抱的那天'];
  let withPandemic = 0, followUps = 0;
  for (let i = 0; i < 160; i++) {
    const s = createLife({ era: 'present' }, `pand-${i}`, { birthYear: 1950 + (i % 70) });
    let g = 0;
    while (s.alive && g++ < 130) advanceYear(s, { auto: true });
    const titles = s.log.map((e) => e.title);
    const got = titles.includes('口罩與封鎖');
    if (got) withPandemic++;
    for (const t of FOLLOW) if (titles.includes(t)) { followUps++; assert.ok(got, `${t} without "口罩與封鎖" (seed pand-${i})`); }
  }
  assert.ok(withPandemic > 40 && followUps > 20, `${withPandemic} lives with the pandemic, ${followUps} follow-ups`);
});

// ---------------------------------------------------------------------------------------------
// 5. Summary highlights read like a life story
// ---------------------------------------------------------------------------------------------

test('curateHighlights: dedupe, one birthday, one "left home", capped, chronological', () => {
  const mk = (age, text) => ({ age, year: 1990 + age, text });
  const raw = [
    mk(22, '大學畢業。'), mk(25, '與A結婚。'), mk(26, '第一個孩子B出生。'),
    mk(44, 'B長大離家。'), mk(46, 'C長大離家。'),
    mk(50, '度過了50歲生日。'), mk(60, '度過了60歲生日。'), mk(60, '退休。'), mk(60, '退休。'),
  ];
  const out = curateHighlights(raw);
  assert.equal(out.filter((h) => h.text === '退休。').length, 1);
  assert.equal(out.filter((h) => /長大離家/.test(h.text)).length, 1);
  assert.deepEqual(out.filter((h) => /生日/.test(h.text)).map((h) => h.age), [60]);
  assert.ok(out.every((h, i) => i === 0 || out[i - 1].age <= h.age), 'order kept');
  // an overlong list is trimmed to the cap and keeps the weighty entries
  const many = [mk(10, '很小就開始工作。')];
  for (let i = 0; i < 20; i++) many.push(mk(20 + i, `做過一件事${i}。`));
  many.push(mk(70, '與D結婚。'), mk(80, 'D離世。'));
  const cut = curateHighlights(many);
  assert.equal(cut.length, MAX_HIGHLIGHTS);
  assert.ok(cut.some((h) => h.text === '與D結婚。') && cut.some((h) => h.text === 'D離世。'));
  // input is not mutated
  assert.equal(many.length, 23);
});

test('getSummary highlights: 5-12 for most adults, never more than the cap, no repeats', () => {
  let adults = 0, inRange = 0;
  for (let i = 0; i < 150; i++) {
    const s = createLife({ era: ['past', 'present', 'future'][i % 3] }, `hl-${i}`);
    let g = 0;
    while (s.alive && g++ < 130) advanceYear(s, { auto: true });
    const sum = getSummary(s);
    assert.ok(sum.highlights.length <= MAX_HIGHLIGHTS, `${sum.highlights.length} highlights`);
    const texts = sum.highlights.map((h) => h.text);
    assert.equal(new Set(texts).size, texts.length, 'no repeated highlight');
    assert.ok(texts.filter((t) => /歲生日/.test(t)).length <= 1, 'at most one birthday');
    if (sum.featuredHighlight) assert.ok(texts.includes(sum.featuredHighlight.text));
    if (sum.age >= 40) { adults++; if (sum.highlights.length >= 4 && sum.highlights.length <= MAX_HIGHLIGHTS) inRange++; }
  }
  assert.ok(adults > 50 && inRange / adults >= 0.8, `${inRange} of ${adults} adult lives have 4-12 highlights`);
});
