// Phase 6C: events connect to what came before.
//   * the consequence tracker (tools/consequence-scan.mjs): about half of the major choices (weighted by how often they fire; 17 % before
//     Phase 6C) leave a visible echo later in the same life: a follow-up, a text or condition that reads the choice's flag, or a memory
//     that is spoken again. The first goal was 80 %, which needed about 20 callbacks in a life and read as a tic; the story now says
//     3-4 reflections and 6-8 echoes in a life, and only authored phrases, so the honest number is the one measured (51 % on 2000 lives)
//   * the memory system (engine/memory.js): h.remember / h.recall / h.memories, JSON-safe and compact, no random numbers, the words a life
//     speaks are true to the life, and one memory is not spoken twice in a row
//   * the person who decides for a child is the same for a whole life stage, and the decision is remembered by name
//   * the follow-ups that used to contradict their choice (the Ukrainian family that stayed)
// Run with: node --test tests/consequence.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { staticAnalysis, dynamicAnalysis } from '../tools/consequence-scan.mjs';
import ALL_EVENTS, { MEMORIES } from '../js/data/events/index.js';
import { createLife, advanceYear, serialize, deserialize, getStatus, birthOf } from '../js/engine/life.js';
import { getEvent, isMajor, whoDecides } from '../js/engine/events.js';
import { makeHelpers } from '../js/engine/helpers.js';
import { getSummary } from '../js/engine/summary.js';
import { remember, whenWord, cnNumber, MEMORY_CAP, listMemories, sanitizeMemories, thirdPerson, keepsakeOf, noteSpoken } from '../js/engine/memory.js';
import { composeEulogy } from '../js/engine/eulogy.js';
import * as store from '../js/storage.js';
import { scaled } from './lib/scale.mjs';

const play = (s, until = 130) => { let g = 0; while (s.alive && s.age < until && g++ < 130) advanceYear(s, { auto: true }); return s; };
const fresh = (seed = 'mem', opts = {}) => createLife({ era: 'present' }, seed, opts);
const at = (s, age) => { s.age = age; s.year = s.birthYear + age; return makeHelpers(s); };

// ---------------------------------------------------------------------------------------------
// 1. The tracker
// ---------------------------------------------------------------------------------------------

test('static analysis: every major choice is listed once, with the flags it sets and the follow-ups it schedules', () => {
  const st = staticAnalysis();
  const choices = ALL_EVENTS.filter(isMajor).reduce((n, e) => n + e.choices.length, 0);
  assert.equal(st.total, choices);
  assert.equal(st.rows.length, choices);
  assert.equal(Object.values(st.kinds).reduce((a, b) => a + b, 0), choices);
  const row = st.rows.find((r) => r.event === 'childhood_corner_boys' && r.choice === 0);
  assert.ok(row.sets.includes('c_corner_errand') && row.schedules.includes('youth_gang_offer') && row.kind === 'follow-up', JSON.stringify(row));
  // the gang offer now reads the flags of the choice that led to it (it did not before Phase 6C)
  assert.ok(st.rows.find((r) => r.event === 'childhood_corner_boys' && r.choice === 1).readers.c_refused_corner.events.some((x) => x.startsWith('youth_gang_offer:')));
  assert.ok(Array.isArray(st.blind));
});

const LIVES = scaled(600, 250, 120);
let dyn = null;
const dynamic = () => dyn || (dyn = dynamicAnalysis({ lives: LIVES, prefix: 'cqt' }));

test(`dynamic analysis (${LIVES} lives): about half of the major choices, weighted by how often they fire, have a visible echo later in the life (measured 51 %, 17 % before)`, () => {
  const d = dynamic();
  assert.ok(d.firings > LIVES * 15, `only ${d.firings} choices were made`);
  assert.ok(d.any >= 0.47, `only ${(100 * d.any).toFixed(1)} % of ${d.firings} choices were echoed (by channel ${JSON.stringify(d.byType)}); the least echoed: ${d.rows.filter((r) => r.any / r.n < 0.6).slice(0, 5).map((r) => `${r.event}#${r.idx}`)}`);
  // a choice only counts as echoed because of the choice itself, not because every option of the event shares a flag
  assert.ok(d.strict >= 0.44, `distinct echoes ${(100 * d.strict).toFixed(1)} %`);
  // a long life gives a choice time to be answered
  assert.ok(d.byYearsLeft.find((b) => b.from === 25).any >= 0.52, JSON.stringify(d.byYearsLeft));
});

test('the story calls its memories back in moderation: about 6-16 callbacks in a life (3-4 reflections, 6-8 echoes on average; a life of 80 years or more a little more), not dozens', () => {
  const d = dynamic();
  const per = d.perLife.reflections + d.perLife.echoes;
  assert.ok(per >= 6 && per <= 16, `${per.toFixed(1)} callbacks per life (${d.perLife.reflections.toFixed(1)} reflections, ${d.perLife.echoes.toFixed(1)} echoes)`);
  assert.ok(d.perLife.reflections >= 2 && d.perLife.reflections <= 5, `${d.perLife.reflections.toFixed(1)} reflections per life`);
  assert.ok(d.perLife.echoes >= 5 && d.perLife.echoes <= 9, `${d.perLife.echoes.toFixed(1)} echoes per life`);
  assert.ok(d.perLife.memories >= 20 && d.perLife.memories <= MEMORY_CAP, `${d.perLife.memories.toFixed(1)} memories per life`);
});

// ---------------------------------------------------------------------------------------------
// 2. The memory system
// ---------------------------------------------------------------------------------------------

test('time words and numerals: 去年, 前年, 出生那年, 十歲那年, 二十三歲那年, 一百零一', () => {
  assert.equal(whenWord(9, 10), '去年');
  assert.equal(whenWord(8, 10), '前年');
  assert.equal(whenWord(0, 30), '出生那年');
  assert.equal(whenWord(10, 40), '十歲那年');
  assert.equal(whenWord(23, 60), '二十三歲那年');
  assert.equal(whenWord(30, 70), '三十歲那年');
  assert.deepEqual([0, 7, 10, 11, 19, 20, 21, 99, 100, 101, 110].map(cnNumber), ['零', '七', '十', '十一', '十九', '二十', '二十一', '九十九', '一百', '一百零一', '一百一十']);
});

test('h.remember / h.recall / h.memories: compact, JSON-safe, one memory per key, no random numbers, recall changes nothing', () => {
  const s = fresh('api');
  const h = at(s, 10);
  const rngBefore = JSON.stringify(s.rng);
  assert.equal(h.recall('f:test'), '');
  assert.ok(h.remember('f:test', '是叔叔借了車，送你去診所', { age: 10, tag: 'health', w: 2 }));
  assert.equal(h.hasMemory('f:test'), true);
  h.s.age = 40; h.s.year = s.birthYear + 40;
  const before = JSON.stringify(s);
  assert.equal(h.recall('f:test'), '十歲那年，是叔叔借了車，送你去診所');
  assert.equal(h.recallPhrase('f:test'), '是叔叔借了車，送你去診所');
  assert.equal(JSON.stringify(s), before, 'recall is pure');
  assert.equal(JSON.stringify(s.rng), rngBefore, 'a memory spends no random number');
  assert.deepEqual(s.memories[0], { k: 'f:test', p: '是叔叔借了車，送你去診所', a: 10, g: 'health', w: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(s.memories)), s.memories);
  // the same key replaces, other keys add; tags and prefixes filter
  h.remember('f:test', '是姑姑背著你走到診所', { age: 10, tag: 'health' });
  h.remember('loss:mother', '你的母親過世了', { age: 33, tag: 'family', w: 3 });
  assert.equal(s.memories.length, 2);
  assert.equal(h.recallPhrase('f:test'), '是姑姑背著你走到診所');
  assert.deepEqual(h.memories('loss').map((m) => m.key), ['loss:mother']);
  assert.deepEqual(h.memories('health').map((m) => m.key), ['f:test']);
  assert.deepEqual(h.memories().map((m) => m.age), [10, 33]);
  // junk is refused
  assert.equal(h.remember('x', ''), false);
  assert.equal(h.remember('x', 'undefined 的事'), false);
  assert.equal(h.remember('x', '短'), false);
  assert.equal(h.remember('x', '很長'.repeat(80)), false);
  // the store stays within its cap and survives a save
  for (let i = 0; i < MEMORY_CAP + 20; i++) remember(s, `c:cap${i}`, `面對「事件${i}」，你選了「某個選擇」`, { age: 12 + (i % 30) });
  assert.ok(s.memories.length <= MEMORY_CAP);
  const back = deserialize(serialize(s));
  assert.deepEqual(back.memories, s.memories);
  assert.deepEqual(sanitizeMemories([{ k: 'a', p: 'bbbbbb', a: 3 }, { k: 5 }, null, { k: 'z', p: 'cccccc', a: 'x' }]).map((m) => m.k), ['a']);
});

test('memories are made by the moments that matter: choices, family decisions, the first job, the wedding, births, losses, moves', () => {
  const kinds = new Set();
  for (let i = 0; i < 60; i++) {
    const s = play(createLife({ era: ['past', 'present', 'future'][i % 3] }, `moments-${i}`, i % 5 === 0 ? { countryCode: 'NGA', urban: false, wealthQ: 2 } : {}));
    for (const m of s.memories || []) kinds.add(m.k.split(':')[0] + (m.k.startsWith('love:wed') ? ':wed' : ''));
    for (const m of s.memories || []) {
      assert.ok(m.p.length >= 4 && m.p.length <= 110 && !/undefined|NaN|\[object/.test(m.p), `${m.k}: ${m.p}`);
      assert.ok(Number.isInteger(m.a) && m.a >= 0 && m.a <= (s.death ? s.death.age : s.age), `${m.k}: age ${m.a}`);
    }
  }
  for (const k of ['c', 'f', 'work', 'love:wed', 'kid', 'loss', 'move']) assert.ok(kinds.has(k), `no ${k} memory in 60 lives: ${[...kinds]}`);
});

test('a life that is played twice speaks the same words; memories never change which events a life meets', () => {
  for (let i = 0; i < 6; i++) {
    const a = play(createLife({ era: 'present' }, `det-${i}`));
    const b = play(createLife({ era: 'present' }, `det-${i}`));
    assert.equal(serialize(a), serialize(b));
  }
});

test('a memory is not spoken twice within ten years, and never in the year it was made', () => {
  for (let i = 0; i < 40; i++) {
    const s = createLife({ era: 'present' }, `twice-${i}`);
    const said = new Map(); // phrase -> ages it was spoken
    let g = 0;
    while (s.alive && g++ < 130) {
      advanceYear(s, { auto: true });
      for (const e of s.log.filter((x) => x.year === s.year)) {
        for (const m of s.memories || []) {
          const t = `${e.text}${e.echo || ''}`;
          if (m.p.length < 6 || !t.includes(m.p) || e.kind === 'death') continue;
          assert.ok(m.a < s.age || !t.includes(`${whenWord(m.a, s.age)}，${m.p}`), `${m.k} spoken in the year it was made: ${t}`);
          const ages = said.get(m.p) || [];
          if (!ages.includes(s.age) && t.includes(`，${m.p}`)) {
            assert.ok(ages.every((a) => s.age - a >= 10), `${m.p} spoken at ${ages} and ${s.age}`);
            ages.push(s.age);
          }
          said.set(m.p, ages);
        }
      }
    }
  }
});

test('echoes and reflections are written to the log in a short, quiet form: at most one echo a year, 60-150 characters', () => {
  let echoes = 0, years = 0;
  for (let i = 0; i < 80; i++) {
    const s = play(createLife({ era: 'present' }, `echo-${i}`));
    const perYear = new Map();
    for (const e of s.log) {
      if (!e.echo) continue;
      echoes++;
      perYear.set(e.year, (perYear.get(e.year) || 0) + 1);
      assert.ok(/想起|記起|浮上來/.test(e.echo) && e.echo.endsWith('。') && e.echo.length <= 150, e.echo);
      assert.ok(!/undefined|NaN/.test(e.echo), e.echo);
    }
    for (const n of perYear.values()) { years++; assert.ok(n <= 1, 'two echoes in one year'); }
    for (const e of s.log.filter((x) => x.kind === 'year' && /想起/.test(x.text))) assert.ok(e.text.length <= 130, e.text);
  }
  assert.ok(echoes > 200, `only ${echoes} echoes in 80 lives`);
});

test('noteSpoken counts a memory whose words appear in a line, but not one made in the same year', () => {
  const s = fresh('spoken');
  at(s, 30);
  remember(s, 'c:a', '你離開故鄉，到海邊重新開始', { age: 20 });
  remember(s, 'c:b', '你和朋友一起開了一間店', { age: 30 });
  noteSpoken(s, '夜裡你想起二十歲那年，你離開故鄉，到海邊重新開始。也想起你和朋友一起開了一間店。');
  assert.equal(s.memories.find((m) => m.k === 'c:a').n, 1);
  assert.equal(s.memories.find((m) => m.k === 'c:a').l, 30);
  assert.equal(s.memories.find((m) => m.k === 'c:b').n, undefined);
});

test('a keepsake can be turned around into the third person (and is refused when it cannot)', () => {
  assert.equal(thirdPerson('是叔叔借了車，送你去診所', false), '是叔叔借了車，送她去診所');
  assert.equal(thirdPerson('你的母親過世了', true), '他的母親過世了');
  assert.equal(thirdPerson('警報響起時一遍遍告訴你「我們在一起」', false), '');
  const s = fresh('keep');
  at(s, 40);
  remember(s, 'c:x', '面對「某事」，你選了「某選擇」', { age: 12 });
  assert.equal(keepsakeOf(s), null, 'a plain choice with quotation marks is not a keepsake');
  remember(s, 'f:y', '是奶奶帶你去了診所', { age: 7, w: 2 });
  remember(s, 'loss:father', '你的父親過世了', { age: 30, w: 3 });
  assert.deepEqual(keepsakeOf(s), { age: 7, text: '是奶奶帶你去了診所', kind: 'f' });
});

test('the life story names the keepsake, warmly, and stays within 3-5 sentences and 260 characters', () => {
  let named = 0;
  for (let i = 0; i < 120; i++) {
    const s = play(createLife({ era: 'present' }, `story-${i}`, i % 3 === 0 ? { countryCode: 'NGA', urban: false, wealthQ: 2 } : {}));
    const sum = getSummary(s);
    const t = sum.eulogy.text;
    const n = (t.match(/[^。！？]+[。！？]/g) || []).length;
    assert.ok(n >= 3 && n <= 5 && [...t].length >= 60 && [...t].length <= 260, `${n} sentences, ${[...t].length} characters: ${t}`);
    if (sum.keepsake && sum.eulogy.slots.includes('keepsake')) {
      named++;
      const he = sum.gender === 'M' ? '他' : '她';
      assert.ok(t.includes(sum.keepsake.text.replace(/你/g, he)) , `the story should say "${sum.keepsake.text}": ${t}`);
      assert.ok(!/你/.test(t.replace(/(想你|請你)/g, '')), `second person left in the story: ${t}`);
    }
  }
  assert.ok(named >= 5, `the keepsake was named in only ${named} of 120 stories`);
  // an old summary without a keepsake is told exactly as before
  const old = getSummary(play(createLife({ era: 'present' }, 'story-old')));
  const { keepsake, ...rest } = old;
  void keepsake;
  assert.equal(composeEulogy({ ...rest, eulogy: undefined }).text, composeEulogy({ ...old, keepsake: null, eulogy: undefined }).text);
});

test('authored memories (memories.js): every label exists, every phrase is a short clause, family options keep the family voice apart', () => {
  let n = 0;
  for (const [id, map] of Object.entries(MEMORIES)) {
    const ev = ALL_EVENTS.find((e) => e.id === id);
    assert.ok(ev && ev.choices, `memories.js: no choice event ${id}`);
    for (const [label, phrase] of Object.entries(map)) {
      const c = ev.choices.find((x) => x.label === label);
      assert.ok(c, `memories.js: ${id} has no choice "${label}"`);
      const p = typeof phrase === 'function' ? 'x'.repeat(10) : phrase;
      assert.ok(p.length >= 8 && p.length <= 60, `${id}/${label}: ${p.length} characters`);
      assert.ok(!/後來|你選了|^面對/.test(p), `${id}/${label}: ${p}`);
      if (c.familyResult !== undefined && c.familyResult !== false) assert.ok(c.memoryYou && c.memory, `${id}/${label}: a family option needs both voices`);
      else assert.ok(c.memory, `${id}/${label}: not attached`);
      n++;
    }
  }
  assert.ok(n >= 100, `only ${n} authored phrases`);
  // every option the family can choose for a child has its own family-voiced memory, and names who decided
  for (const ev of ALL_EVENTS.filter((e) => e.decider === 'family')) {
    for (const c of ev.choices.filter((x) => x.familyResult !== undefined && x.familyResult !== false && !x.who)) {
      assert.equal(typeof c.memory, 'function', `${ev.id}/${c.label}: no family memory`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// 3. The person who decides
// ---------------------------------------------------------------------------------------------

test('whoDecides is the same for a whole life stage, whatever the decision or the year', () => {
  for (let i = 0; i < 80; i++) {
    const s = createLife({ era: 'present' }, `who-${i}`);
    for (const [lo, hi] of [[0, 5], [6, 11]]) {
      const names = new Set();
      for (let a = lo; a <= hi; a++) { s.age = a; s.year = s.birthYear + a; for (const salt of ['', 'malaria', 'fever', 'fire', 'x']) names.add(whoDecides(s, salt)); }
      assert.equal(names.size, 1, `life ${i} ages ${lo}-${hi}: ${[...names]}`);
    }
  }
  // not always the same person: across lives every kind turns up
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const s = createLife({ era: 'present' }, `who2-${i}`); s.family.mother.alive = s.family.father.alive = true; seen.add(whoDecides(s)); }
  assert.ok(['爸爸', '媽媽', '爸媽', '奶奶'].every((w) => seen.has(w)), [...seen].join());
});

test('a decision the family took for the child is remembered by name, and the log names the same person', () => {
  let checked = 0;
  for (let i = 0; i < 400 && checked < 25; i++) {
    const s = createLife({ era: 'present' }, `fam-${i}`, { countryCode: ['NGA', 'NER', 'IND', 'ETH', 'UGA'][i % 5], urban: false, wealthQ: 1 + (i % 3) });
    let g = 0;
    while (s.alive && s.age < 12 && g++ < 20) advanceYear(s, { auto: true });
    const famLog = s.log.filter((x) => x.by === 'family');
    for (const e of famLog) {
      if (famLog.some((o) => o.title === e.title && o.age > e.age)) continue; // a repeatable event keeps its latest memory
      const ev = ALL_EVENTS.find((x) => x.title === e.title && x.decider === 'family');
      const m = (s.memories || []).find((x) => x.k === `f:${ev.id}`);
      assert.ok(m, `no memory for the family decision "${e.title}" at ${e.age}`);
      assert.equal(m.a, e.age);
      const who = ['爸爸', '媽媽', '爸媽', '奶奶', '叔叔', '姑姑', '舅舅', '阿姨', '伯父', '身邊的大人'].find((w) => m.p.includes(w));
      if (who && s.family.mother.alive && s.family.father.alive) assert.ok(e.text.includes(who), `memory names ${who}, the log does not: ${e.text}`);
      checked++;
    }
  }
  assert.ok(checked >= 10, `only ${checked} family decisions found`);
});

test('two family decisions in one stage name the same person', () => {
  let pairs = 0;
  for (let i = 0; i < 600 && pairs < 8; i++) {
    const s = createLife({ era: 'present' }, `pair-${i}`, { countryCode: ['NGA', 'NER', 'IND', 'ETH', 'UGA', 'PAK'][i % 6], urban: false, wealthQ: 1 + (i % 2) });
    let g = 0;
    while (s.alive && s.age < 12 && g++ < 20) advanceYear(s, { auto: true });
    const fm = (s.memories || []).filter((m) => m.k.startsWith('f:') && m.a < 6);
    if (fm.length < 2 || !(s.family.mother.alive && s.family.father.alive)) continue;
    const word = (m) => ['爸爸', '媽媽', '爸媽', '奶奶'].find((w) => m.p.includes(w));
    const ws = new Set(fm.map(word).filter(Boolean));
    assert.ok(ws.size <= 1, `${fm.map((m) => m.p).join(' / ')}`);
    pairs++;
  }
  assert.ok(pairs >= 3, `only ${pairs} lives with two decisions before six`);
});

// ---------------------------------------------------------------------------------------------
// 4. Choices and follow-ups that fit together
// ---------------------------------------------------------------------------------------------

test('world_ukraine_later tells what the family chose: staying, a relative\'s home, or leaving', () => {
  const s = fresh('ukr', { countryCode: 'UKR' });
  const h = at(s, 30);
  const ev = getEvent('world_ukraine_later');
  s.flags.u_stayed = true;
  const stayed = ev.text(s, h);
  assert.ok(/守夜|這裡還有人要照顧/.test(stayed) && !/臨時的住所|新的語言/.test(stayed), stayed);
  delete s.flags.u_stayed; s.flags.u_relatives = true;
  const rel = ev.text(s, h);
  assert.ok(/親戚家/.test(rel) && !/新的語言/.test(rel), rel);
  delete s.flags.u_relatives; s.flags.u_left = true;
  assert.ok(/新的語言/.test(ev.text(s, h)));
  // the choices set exactly those flags
  const home = getEvent('world_ukraine_2022_home');
  const flagOf = (re) => home.choices.filter((c) => re.test(c.label)).map((c) => (c.set || []).join());
  assert.deepEqual(flagOf(/留在原地|一起留下/), ['u_stayed', 'u_stayed']);
  assert.deepEqual(flagOf(/離開/), ['u_left', 'u_left']);
  assert.deepEqual(flagOf(/親戚家/), ['u_relatives', 'u_relatives']);
});

test('the corner boys remember how the first offer ended; a family that moves together does not live alone', () => {
  const s = fresh('gang');
  const h = at(s, 14);
  const gang = getEvent('youth_gang_offer');
  s.flags.c_corner_errand = true;
  assert.ok(/替他們跑過腿/.test(gang.text(s, h)));
  delete s.flags.c_corner_errand; s.flags.c_refused_corner = true;
  assert.ok(/搖頭走開/.test(gang.text(s, h)));
  delete s.flags.c_refused_corner;
  assert.ok(!/跑過腿|搖頭走開/.test(gang.text(s, h)));
});

// ---------------------------------------------------------------------------------------------
// 5. What the drawer shows, and the seed of a replay
// ---------------------------------------------------------------------------------------------

test('getStatus: where each member of the family lives, and the newest memories', () => {
  const s = createLife({ era: 'present' }, 'status-1');
  let st = getStatus(s);
  assert.deepEqual(st.household, { mother: 'with_you', father: 'with_you', partner: '', children: [] });
  assert.deepEqual(st.memories, []);
  // grown up, married, two children, one left behind abroad, the parents at home
  s.age = 40; s.year = s.birthYear + 40;
  s.partner = { name: '阿明', gender: 'M', age: 40, status: 'married', since: s.year - 12 };
  s.children = [{ name: '小一', gender: 'F', birthYear: s.year - 9, alive: true }, { name: '小二', gender: 'M', birthYear: s.year - 6, alive: true }, { name: '小三', gender: 'F', birthYear: s.year - 3, alive: false }, { name: '小四', gender: 'M', birthYear: s.year - 30, alive: true }];
  s.countryCode = s.countryCode === 'JPN' ? 'DEU' : 'JPN';
  s.household = { v: 1, parents: false, partner: false, kids: ['with_partner', 'with_grandparents', 'with_you', 'independent'], far: [false, false, false, true], sep: null };
  st = getStatus(s);
  assert.equal(st.household.mother, 'home_country');
  assert.equal(st.household.partner, 'home_country');
  assert.deepEqual(st.household.children, ['with_partner', 'with_grandparents', '', 'abroad']);
  s.countryCode = s.homeCountryCode;
  s.household.partner = true; s.household.parents = true; s.household.kids = ['with_you', 'with_you', 'with_you', 'independent']; s.household.far = [false, false, false, false];
  st = getStatus(s);
  assert.equal(st.household.partner, 'with_you');
  assert.equal(st.household.father, 'with_you');
  assert.deepEqual(st.household.children, ['with_you', 'with_you', '', 'independent']);
  // divorced: a child with the other parent
  s.partner.status = 'divorced';
  s.household.kids[0] = 'with_partner';
  assert.equal(getStatus(s).household.children[0], 'with_other_parent');
  assert.equal(getStatus(s).household.partner, '');
  // memories: newest first, at most five
  for (let i = 0; i < 8; i++) remember(s, `c:s${i}`, `面對「事件${i}」，你選了「某個選擇」`, { age: 10 + i });
  const mem = getStatus(s).memories;
  assert.equal(mem.length, 5);
  assert.deepEqual(mem.map((m) => m.age), [17, 16, 15, 14, 13]);
  assert.ok(JSON.parse(JSON.stringify(getStatus(s))));
});

test('the seed of a replay: a pinned ?seed= gives the first life its seed and each replay its own', () => {
  assert.equal(store.startSeed(null, null, 'fresh-1'), 'fresh-1');
  assert.equal(store.startSeed('', { n: 2 }, 'fresh-2'), 'fresh-2');
  assert.equal(store.startSeed('e2e-replay-1', null, 'x'), 'e2e-replay-1');
  assert.equal(store.startSeed('e2e-replay-1', { prev: 'a', start: 'a', n: 2 }, 'x'), 'e2e-replay-1~2');
  assert.equal(store.startSeed('e2e-replay-1', { prev: 'b', start: 'a', n: 3 }, 'x'), 'e2e-replay-1~3');
  assert.notEqual(store.startSeed('s', { n: 2 }), store.startSeed('s', { n: 3 }));
  // and the e2e start really does not lose its infant twice: the replayed life of the pinned seed is a different life from the first
  const st = { era: 'past', drawMode: 'births', pace: 'short', autoChoice: true };
  const a = play(createLife(st, 'e2e-replay-1', {}));
  const b = play(createLife(st, store.startSeed('e2e-replay-1', { n: 2 }, 'x'), { birth: JSON.parse(JSON.stringify(birthOf(a))) }));
  assert.ok(b.death.age >= 5, `the replayed life of the e2e seed died at ${b.death.age}`);
});


test('the plain record of a choice (面對「…」，你選了「…」) is kept but never spoken: not in the log, not in a recall, not in the memory list', () => {
  let plain = 0;
  for (let i = 0; i < 30; i++) {
    const s = play(createLife({ era: ['past', 'present', 'future'][i % 3] }, `plain-${i}`));
    plain += (s.memories || []).filter((m) => m.u).length;
    for (const m of (s.memories || []).filter((x) => x.u)) {
      assert.ok(/^面對「.*」，你選了「.*」$|拿了主意$/.test(m.p), m.p);
      assert.ok(!s.log.some((e) => `${e.text}${e.echo || ''}`.includes(m.p)), `spoken: ${m.p}`);
    }
    assert.ok(listMemories(s).every((m) => !/^面對「/.test(m.phrase)));
    assert.ok(getStatus(s).memories.every((m) => !/^面對「/.test(m.phrase)));
  }
  assert.ok(plain > 0, 'some choices still leave only the plain record');
  // a plain memory is a record for the tracker: it does not come back through h.recall either
  const s = fresh('plain-recall');
  const h = at(s, 30);
  remember(s, 'c:x', '面對「某事」，你選了「某選擇」', { age: 12, plain: true });
  assert.equal(h.recall('c:x'), '');
  assert.equal(s.memories[0].u, 1);
  assert.deepEqual(sanitizeMemories(JSON.parse(JSON.stringify(s.memories)))[0], s.memories[0]);
});

test('h.recall stays quiet for a memory spoken in the last ten years', () => {
  const s = fresh('rest');
  const h = at(s, 30);
  remember(s, 'love:wed1', '你結了婚', { age: 20, w: 3, tag: 'love' });
  assert.match(h.recall('love:wed1'), /你結了婚/);
  s.memories[0].n = 1; s.memories[0].l = 25;
  assert.equal(h.recall('love:wed1'), '');
  h.s.age = 36;
  assert.match(h.recall('love:wed1'), /你結了婚/);
});
