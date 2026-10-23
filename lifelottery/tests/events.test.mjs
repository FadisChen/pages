// Event definition tests + engine API behaviour (choices, follow-ups, determinism, serialisation, helpers).
// Run with: node --test lifelottery/tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import ALL_EVENTS, { EVENT_FILES, EVENT_PREFIX } from '../js/data/events/index.js';
import { validateEvents, EFFECT_KEYS, isMajor, getEvent } from '../js/engine/events.js';
import { createLife, advanceYear, choose, autoChoose, serialize, deserialize, getPendingChoice, getStatus, lifeStage } from '../js/engine/life.js';
import { makeHelpers, HELPER_NAMES } from '../js/engine/helpers.js';
import { getSummary } from '../js/engine/summary.js';
import { COUNTRIES } from '../js/data/countries.js';
import { createRngState, rand, randInt, pick } from '../js/engine/rng.js';

const BAD = /undefined|NaN|\[object|null/;

// ---- Shared pool of random states (built once, cloned where mutation is needed) ----
function buildStates(n) {
  const rng = createRngState('events-test-states');
  const states = [];
  let i = 0;
  while (states.length < n) {
    const eras = ['past', 'present', 'future', 'random'];
    const opts = {};
    if (rand(rng) < 0.6) opts.countryCode = pick(rng, COUNTRIES).code;
    const s = createLife({ era: pick(rng, eras), drawMode: rand(rng) < 0.5 ? 'births' : 'population' }, `ev-state-${i++}`, opts);
    const stops = new Set(Array.from({ length: 5 }, () => randInt(rng, 1, 95)));
    let guard = 0;
    while (s.alive && guard++ < 125) {
      advanceYear(s, { auto: true });
      if (stops.has(s.age) && s.alive) states.push(JSON.parse(JSON.stringify(s)));
    }
  }
  return states.slice(0, n);
}

let STATES = null;
const states = () => (STATES ||= buildStates(3000));

test('event definitions: structure, ids, effect keys, schedule targets', () => {
  const errors = validateEvents(ALL_EVENTS);
  assert.deepEqual(errors, []);
  const ids = ALL_EVENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate event ids');
  assert.deepEqual(Object.keys(EVENT_FILES).sort(), ['adult_family', 'adult_work', 'aging', 'childhood', 'health', 'migration', 'regional', 'seed', 'world', 'youth']);
  for (const [file, list] of Object.entries(EVENT_FILES)) {
    assert.ok(Array.isArray(list), `${file} must export an array`);
    for (const ev of list) assert.ok(ev.id.startsWith(EVENT_PREFIX[file]), `${ev.id} must start with ${EVENT_PREFIX[file]}`);
  }
  assert.deepEqual(EFFECT_KEYS, ['health', 'happiness', 'knowledge', 'wealth', 'social']);
});

test('event validator catches bad definitions', () => {
  const ok = { id: 'x_ok', title: 't', ages: [1, 2], text: 'hi' };
  assert.deepEqual(validateEvents([ok]), []);
  assert.ok(validateEvents([ok, ok]).some((e) => /duplicate/.test(e)));
  assert.ok(validateEvents([{ ...ok, ages: [5, 2] }]).length > 0);
  assert.ok(validateEvents([{ ...ok, effects: { bogus: 1 } }]).length > 0);
  assert.ok(validateEvents([{ ...ok, schedule: [{ id: 'nope', inYears: [0, 1] }] }]).length > 0);
  assert.ok(validateEvents([{ ...ok, major: true }]).length > 0);
  assert.ok(validateEvents([{ ...ok, id: 'BadId' }]).length > 0);
  assert.ok(validateEvents([{ ...ok, choices: [{ label: 'a' }] }]).length > 0);
  assert.ok(validateEvents([{ ...ok, chance: 0 }]).length > 0);
});

test('seed events: ~40 events, >= 15 major, every API feature is demonstrated', () => {
  const seed = EVENT_FILES.seed;
  assert.ok(seed.length >= 38 && seed.length <= 50, `seed should have about 40 events, has ${seed.length}`);
  assert.ok(seed.filter(isMajor).length >= 15, 'need >= 15 major choice events');
  const has = (pred) => seed.some(pred);
  assert.ok(has((e) => e.chance !== undefined), 'chance');
  assert.ok(has((e) => e.once === false && e.cooldown > 0), 'once:false + cooldown');
  assert.ok(has((e) => typeof e.weight === 'function'), 'weight function');
  assert.ok(has((e) => typeof e.effects === 'function'), 'function effects');
  assert.ok(has((e) => e.choices?.some((c) => c.schedule?.length)), 'choice schedule');
  assert.ok(has((e) => e.choices?.some((c) => c.cond)), 'choice cond');
  assert.ok(has((e) => e.choices?.some((c) => typeof c.ai === 'function')), 'ai function');
  assert.ok(has((e) => e.choices?.some((c) => typeof c.ai === 'number')), 'ai number');
  assert.ok(has((e) => e.choices?.some((c) => c.set?.length)), 'set');
  assert.ok(has((e) => e.choices?.some((c) => c.unset?.length)), 'unset');
  assert.ok(has((e) => e.highlight || e.choices?.some((c) => c.highlight)), 'highlight');
  assert.ok(has((e) => e.milestone), 'milestone');
  assert.ok(has((e) => /byIncome/.test(String(e.text))), 'per-income text branches');
  assert.ok(has((e) => e.choices?.some((c) => /\.die\(/.test(String(c.effects)))), 'h.die');
  assert.ok(has((e) => typeof e.text === 'function' && /yearIn/.test(String(e.cond))), 'calendar-year events');
  // Coverage of all life stages.
  for (const [a, b] of [[0, 12], [13, 22], [23, 40], [41, 64], [65, 100]]) {
    assert.ok(seed.some((e) => (e.ages?.[0] ?? 0) <= b && (e.ages?.[1] ?? 120) >= a), `no seed event for ages ${a}-${b}`);
  }
});

test('events: cond/text/result/ai/weight never throw and never print undefined/NaN (3000 random states)', () => {
  const errors = [];
  const record = (id, what, e) => { if (errors.length < 15) errors.push(`${id} ${what}: ${e && e.message ? e.message : e}`); };
  const checkStr = (id, what, v) => {
    if (typeof v !== 'string' || v.trim() === '' || BAD.test(v)) record(id, what, `bad string ${JSON.stringify(v)}`);
  };
  for (const s of states()) {
    const h = makeHelpers(s);
    for (const ev of ALL_EVENTS) {
      try { if (ev.cond) ev.cond(s, h); } catch (e) { record(ev.id, 'cond', e); }
      try { checkStr(ev.id, 'text', typeof ev.text === 'function' ? ev.text(s, h) : ev.text); } catch (e) { record(ev.id, 'text', e); }
      try {
        if (typeof ev.weight === 'function') { const w = ev.weight(s, h); if (!(w >= 0) || !Number.isFinite(w)) record(ev.id, 'weight', w); }
        if (ev.highlight && typeof ev.highlight === 'function') { const t = ev.highlight(s, h); if (t != null) checkStr(ev.id, 'highlight', t); }
      } catch (e) { record(ev.id, 'weight/highlight', e); }
      for (const [i, c] of (ev.choices || []).entries()) {
        const w = `${ev.id}#${i}`;
        try { if (c.cond) c.cond(s, h); } catch (e) { record(w, 'choice.cond', e); }
        try { if (c.result !== undefined) checkStr(w, 'result', typeof c.result === 'function' ? c.result(s, h) : c.result); } catch (e) { record(w, 'result', e); }
        try { if (typeof c.ai === 'function') { const a = c.ai(s, h); if (!(a >= 0) || !Number.isFinite(a)) record(w, 'ai', a); } } catch (e) { record(w, 'ai', e); }
        try { if (c.highlight && typeof c.highlight === 'function') { const t = c.highlight(s, h); if (t != null) checkStr(w, 'highlight', t); } } catch (e) { record(w, 'highlight', e); }
      }
    }
  }
  assert.deepEqual(errors, []);
});

test('events: function effects keep stats finite and in range (clones of 600 random states)', () => {
  const errors = [];
  for (const base of states().slice(0, 600)) {
    for (const ev of ALL_EVENTS) {
      const list = [[ev.id, ev.effects], ...(ev.choices || []).map((c, i) => [`${ev.id}#${i}`, c.effects])];
      for (const [id, eff] of list) {
        if (typeof eff !== 'function') continue;
        const s = JSON.parse(JSON.stringify(base));
        s.rng = createRngState(id + s.seed);
        try {
          eff(s, makeHelpers(s));
          for (const k of EFFECT_KEYS) if (!Number.isFinite(s.stats[k]) || s.stats[k] < 0 || s.stats[k] > 100) errors.push(`${id}: stat ${k}=${s.stats[k]}`);
          if (!Number.isFinite(s.riskMult)) errors.push(`${id}: riskMult`);
        } catch (e) { errors.push(`${id}: ${e.message}`); }
        if (errors.length > 10) break;
      }
    }
  }
  assert.deepEqual(errors.slice(0, 10), []);
});

test('state schema matches PLAN 5.4', () => {
  const s = createLife({ era: 'present' }, 7, { countryCode: 'TWN' });
  const need = ['v', 'seed', 'rng', 'settings', 'birthYear', 'year', 'age', 'countryCode', 'homeCountryCode', 'urban', 'city', 'gender', 'name', 'family', 'stats', 'edu', 'work', 'partner', 'children', 'conditions', 'smoker', 'riskMult', 'flags', 'seen', 'pending', 'log', 'statHistory', 'highlights', 'alive', 'death'];
  for (const k of need) assert.ok(k in s, `missing ${k}`);
  assert.equal(s.v, 1);
  assert.deepEqual(Object.keys(s.settings).filter((k) => ['era', 'drawMode', 'pace', 'autoChoice'].includes(k)).sort(), ['autoChoice', 'drawMode', 'era', 'pace']);
  assert.ok(['F', 'M'].includes(s.gender));
  assert.ok(s.family.wealthQ >= 1 && s.family.wealthQ <= 5);
  for (const p of [s.family.mother, s.family.father]) { assert.equal(typeof p.alive, 'boolean'); assert.equal(typeof p.age, 'number'); assert.equal(typeof p.name, 'string'); }
  assert.ok(['none', 'primary', 'secondary', 'tertiary', 'graduate'].includes(s.edu.level));
  assert.ok(['child', 'student', 'employed', 'self', 'unemployed', 'homemaker', 'retired', 'none'].includes(s.work.status));
  for (const k of EFFECT_KEYS) assert.ok(s.stats[k] >= 0 && s.stats[k] <= 100);
  assert.equal(s.alive, true);
  assert.equal(s.death, null);
  assert.equal(s.countryCode, 'TWN');
  assert.equal(s.age, 0);
  assert.equal(s.statHistory.length, 1);
  // Walk a whole life and validate invariants every year.
  let guard = 0;
  while (s.alive && guard++ < 125) {
    advanceYear(s, { auto: true });
    for (const k of EFFECT_KEYS) assert.ok(Number.isFinite(s.stats[k]) && s.stats[k] >= 0 && s.stats[k] <= 100, `${k}=${s.stats[k]} at ${s.age}`);
    for (const e of s.log.slice(-6)) assert.ok(!BAD.test(`${e.title}${e.text}`), `bad log text: ${e.title} ${e.text}`);
  }
  assert.equal(s.alive, false);
  assert.ok(s.death && s.death.causeId && s.death.causeText && s.death.age === s.age && s.death.year === s.year);
  assert.equal(s.statHistory.length, s.age + 2, 'one history row per year plus birth and death rows');
  for (const e of s.log) {
    assert.ok(['year', 'event', 'choice', 'milestone', 'death'].includes(e.kind));
    assert.ok(e.age >= 0 && e.year >= s.birthYear && typeof e.text === 'string');
  }
});

test('determinism and serialisation: same seed => same life; saved state resumes identically', () => {
  const run = (seed) => {
    const s = createLife({ era: 'present' }, seed, { countryCode: 'DEU' });
    let g = 0; while (s.alive && g++ < 125) advanceYear(s, { auto: true });
    return s;
  };
  const a = run('det-1'), b = run('det-1'), c = run('det-2');
  assert.equal(serialize(a), serialize(b));
  assert.notEqual(serialize(a), serialize(c));

  const s1 = createLife({ era: 'random' }, 'resume', {});
  for (let i = 0; i < 25 && s1.alive; i++) advanceYear(s1, { auto: true });
  const text = serialize(s1);
  assert.doesNotThrow(() => JSON.parse(text));
  const s2 = deserialize(text);
  let g = 0;
  while ((s1.alive || s2.alive) && g++ < 125) { advanceYear(s1, { auto: true }); advanceYear(s2, { auto: true }); }
  assert.equal(serialize(s1), serialize(s2), 'resumed life diverged');
  assert.throws(() => deserialize('{"v":99}'));
  assert.throws(() => deserialize('nonsense'));
});

test('choice flow: advanceYear surfaces a pending choice; choose/autoChoose resolve it', () => {
  let found = 0;
  for (let i = 0; i < 400 && found < 3; i++) {
    const s = createLife({ era: 'present' }, `choice-${i}`, { countryCode: i % 2 ? 'USA' : 'BRA' });
    let guard = 0;
    while (s.alive && guard++ < 125) {
      const r = advanceYear(s);
      if (!r.pendingChoice) continue;
      found++;
      const pc = r.pendingChoice;
      assert.equal(getPendingChoice(s), pc);
      assert.ok(pc.title && pc.text && pc.options.length >= 1 && pc.options.length <= 3);
      for (const o of pc.options) assert.ok(typeof o.label === 'string' && Number.isInteger(o.index));
      const ageBefore = s.age;
      const again = advanceYear(s);
      assert.equal(s.age, ageBefore, 'must not advance while a choice is pending');
      assert.equal(again.pendingChoice, pc);
      assert.throws(() => choose(s, 99));
      const out = found % 2 ? choose(s, 0) : autoChoose(s);
      assert.equal(out.pendingChoice, null);
      assert.ok(out.entries.some((e) => e.kind === 'choice' || e.kind === 'death'), 'resolution should log a choice entry');
      assert.equal(getPendingChoice(s), null);
      assert.throws(() => choose(s, 0));
      if (found >= 3) break;
    }
  }
  assert.ok(found >= 3, 'expected to meet pending choices in 400 lives');
});

test('schedule: follow-up events fire after the choice that scheduled them', () => {
  let pairs = 0, orphans = 0;
  for (let i = 0; i < 500; i++) {
    const s = createLife({ era: 'present' }, `sched-${i}`, { countryCode: ['TWN', 'USA', 'DEU', 'BRA'][i % 4], wealthQ: 3 + (i % 3) });
    let g = 0; while (s.alive && g++ < 125) advanceYear(s, { auto: true });
    const idx = s.log.findIndex((e) => e.kind === 'choice' && (e.title === '熬夜衝刺' || e.title === '穩定準備，按時睡覺' || e.title === '不想再賭，另做打算'));
    if (idx < 0) continue;
    const at = s.log[idx].age;
    if (s.death.age < at + 3) continue;
    const follow = s.log.slice(idx).find((e) => e.title === '放榜的日子');
    if (follow && follow.age - at <= 2) pairs++; else orphans++;
  }
  assert.ok(pairs >= 5, `follow-up should occur (pairs ${pairs})`);
  assert.equal(orphans, 0, 'a scheduled follow-up never fired');
});

test('helpers: every helper listed in PLAN 5.5 exists and behaves', () => {
  const required = ['rand', 'chance', 'pick', 'between', 'country', 'income', 'incomeAtLeast', 'region', 'isRegion', 'stat', 'era', 'yearIn',
    'inSchool', 'employed', 'married', 'hasPartner', 'hasChildren', 'isRich', 'isPoor', 'urban', 'female', 'male', 'has',
    'set', 'addCondition', 'startJob', 'loseJob', 'setPartner', 'marry', 'divorce', 'addChild', 'migrate', 'addRisk', 'log', 'highlight',
    'name', 'partnerName', 'childName', 'city', 'countryName', 'die'];
  for (const n of required) assert.ok(HELPER_NAMES.includes(n), `missing helper ${n}`);

  const s = createLife({ era: 'present' }, 'helpers', { countryCode: 'JPN', gender: 'F', wealthQ: 4 });
  const h = makeHelpers(s);
  assert.equal(h.country().code, 'JPN');
  assert.equal(h.income(), 'H');
  assert.ok(h.incomeAtLeast('UM') && h.incomeAtLeast('H'));
  assert.ok(h.isRegion('EAS') && !h.isRegion('SSA', 'EUR'));
  assert.equal(h.region(), 'EAS');
  assert.ok(h.female() && !h.male());
  assert.equal(h.era(), 'present');
  assert.ok(h.yearIn(2000, 2100));
  assert.equal(h.partnerName(), '對方');
  assert.equal(h.childName(0), '孩子');
  assert.ok(!h.married() && !h.hasPartner() && !h.hasChildren());
  assert.equal(h.countryName(), '日本');

  h.set('foo'); assert.ok(h.has('foo')); h.set('n', 3); assert.equal(h.flag('n'), 3); h.unset('foo'); assert.ok(!h.has('foo'));
  const w0 = h.stat('wealth');
  h.change('wealth', -20); assert.ok(h.stat('wealth') < w0); h.change('health', 500); assert.equal(h.stat('health'), 100);
  assert.throws(() => h.change('luck', 1));

  s.age = 30; s.year = s.birthYear + 30;
  h.setPartner({ name: '田中', gender: 'M', age: 32 });
  assert.ok(h.hasPartner() && !h.married() && h.partnerName() === '田中');
  h.marry(); assert.ok(h.married());
  const kid = h.addChild({ gender: 'M' });
  assert.equal(kid.gender, 'M'); assert.ok(h.hasChildren() && h.childName(0) === kid.name && h.childCount() === 1);
  assert.ok(h.divorce()); assert.ok(!h.married());
  h.startJob('doctor'); assert.ok(h.employed()); assert.equal(h.jobName(), '醫師');
  h.loseJob(); assert.ok(h.unemployed() && !h.employed());
  assert.ok(h.addCondition('diabetes')); assert.ok(h.hasCondition('diabetes')); assert.ok(!h.addCondition('diabetes'));
  const r0 = s.riskMult; h.addRisk(2); assert.equal(s.riskMult, r0 * 2);
  h.addRisk(3, 2); assert.equal(s.flags._risks.length, 1);
  assert.ok(h.migrate('USA')); assert.equal(h.country().code, 'USA'); assert.ok(h.isMigrant()); assert.equal(s.homeCountryCode, 'JPN');
  const n = s.log.length; h.log('測試', '標題'); h.highlight('重要時刻'); assert.equal(s.log.length, n + 1); assert.equal(s.highlights.at(-1).text, '重要時刻');
  h.die('disaster');
  assert.equal(s.alive, false); assert.equal(s.death.causeId, 'disaster'); assert.equal(s.log.at(-1).kind, 'death');
  h.die('cvd'); assert.equal(s.death.causeId, 'disaster', 'second die() is a no-op');
});

test('status and summary views are plain JSON data', () => {
  const s = createLife({ era: 'present' }, 'view', { countryCode: 'IND' });
  let g = 0; while (s.alive && g++ < 125) advanceYear(s, { auto: true });
  const st = getStatus(s);
  assert.doesNotThrow(() => JSON.stringify(st));
  assert.ok(st.stage === lifeStage(s.age));
  const sum = getSummary(s);
  assert.doesNotThrow(() => JSON.stringify(sum));
  assert.equal(sum.age, s.death.age);
  assert.ok(sum.cause.label && sum.education.label && Array.isArray(sum.highlights) && sum.statHistory.length > 0);
  assert.equal(sum.suicide, s.death.causeId === 'suicide');
  assert.ok(getEvent('seed_exam_pressure'));
});
