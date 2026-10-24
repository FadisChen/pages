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
import ALL_EVENTS from '../js/data/events/index.js';
import YEARLY from '../js/data/yearly.js';
import { RULES, ALLOW, snapshot, runAudit, lifeConfigs, groupFlags, playAudited, applyStress, stressFor } from './lib/coherence.mjs';

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


// ---------------------------------------------------------------------------------------------
// 1b. Phase 5D: family continuity. Every concrete case reported (or found by the scan) is a fixed check, twice:
//     (a) the RULE flags the old text in the state that made it wrong and leaves the state-aware text alone,
//     (b) the real EVENT, rendered in that state, passes every rule (so the fix cannot silently regress).
// ---------------------------------------------------------------------------------------------

const ORPHAN = { mother: false, father: false };
const hit = (id, snap, text) => hits(id, snap, text).length > 0;

test('5D rules: wedding with both parents dead ("兩家人擠在同一桌"), still fine while one parent lives', () => {
  const wed = '結婚。你和曾子怡的婚禮上，兩家人擠在同一桌，彼此敬了很多杯酒。';
  assert.ok(hit('parents_dead', snapWith({ age: 55, ...ORPHAN, partnerName: '曾子怡', partner: 'married' }), wed), 'both dead');
  assert.ok(!hit('parents_dead', snapWith({ age: 55, mother: true, father: false, partner: 'married' }), wed), 'one parent alive: still two families');
  assert.ok(!hit('parents_dead', snapWith({ age: 30, mother: true, father: true, partner: 'married' }), wed));
  // the replacement line acknowledges the absence (grief / empty seats) and is accepted
  const mourn = '結婚。你和曾子怡的婚禮上，曾子怡那邊的親友擠了一整桌，大家彼此敬了很多杯酒。婚禮前一天，你到墓地為過世的爸媽唸了一段祈禱，把明天的事告訴他們。叔叔坐在旁邊，替你們主婚。';
  assert.ok(!hit('parents_dead', snapWith({ age: 30, ...ORPHAN, partnerName: '曾子怡', partner: 'married' }), mourn));
});

test('5D rules: indirect wording (雙方長輩, 兩邊的長輩, 雙方家長, 家長, 回老家) with both parents dead', () => {
  const dead = snapWith({ age: 40, ...ORPHAN });
  assert.ok(hit('parents_dead', dead, '簽下婚書的那天，兩位見證人和雙方長輩都在場。'));
  assert.ok(hit('parents_dead', dead, '約在咖啡店見面，兩邊的長輩都坐在隔壁桌假裝在聊天。'));
  assert.ok(hit('parents_dead', dead, '學校找了雙方家長談話，對方道了歉。'));
  assert.ok(hit('parents_dead', snapWith({ age: 15, ...ORPHAN, kidsAlive: 0 }), '老師請你明天帶家長來一趟。'));
  assert.ok(hit('parents_dead', snapWith({ age: 66, ...ORPHAN }), '你擠上了人滿為患的車，搭了一整天才回到老家。回老家過節，長輩把你拉到桌邊。'));
  // fine: relatives / the empty house / a grave are the destination
  assert.ok(!hit('parents_dead', snapWith({ age: 66, ...ORPHAN }), '節慶回老家，手足和親戚都在，老屋裡少了爸媽的聲音。'));
  assert.ok(!hit('parents_dead', snapWith({ age: 66, ...ORPHAN }), '離婚後你搬回老家那間沒人住的老屋。'));
  // you are the "家長" of your own child's school
  assert.ok(!hit('parents_dead', snapWith({ age: 38, ...ORPHAN, kidsAlive: 2, kids: 2 }), '放學時，校門口擠滿了接送的家長。'));
});

test('5D rules: a dead mother speaking in the present tense ("母親說，這是為了他們以後可以選擇")', () => {
  const s = snapWith({ age: 43, mother: false, father: true });
  assert.ok(hit('parents_dead', s, '車子一開走，營地忽然變得很安靜，但母親說，這是為了他們以後可以選擇。'), '以後 belongs to the next clause, it is not a hypothesis about the mother');
  assert.ok(hit('parents_dead', s, '第一次點火，煙乖乖往上走，屋裡不再嗆人，母親笑著說：「這是我這輩子最乾淨的廚房。」'));
  assert.ok(hit('parents_dead', s, '以後再也不用天不亮就走很遠去提水了，母親和姊妹們終於能多睡一會兒。'));
  assert.ok(hit('parents_dead', s, '你說「我媽在等我」，然後走開。'), 'YOUR words about your dead mother');
  assert.ok(!hit('parents_dead', s, '孩子對你說：「奶奶的媽媽，也是這樣煮的。」'));
  assert.ok(hit('parents_dead', snapWith({ age: 60, ...ORPHAN }), '農閒時，你跟著鄰居把雞蛋挑到鎮上賣，母親第一次在年底替全家人買了新衣服。'));
  // memories, grief and teaching in the past stay legitimate
  for (const ok of [
    '你想起小時候，母親總在灶邊哼歌。',
    '你照父親教的方法，下種、除草、收成，一步不差。',
    '這一年你拔下了第一根白髮，也終於聽懂了父母當年那些重複的叮嚀。',
    '葬禮上，親戚們輪流說起你小時候的事。母親的相片擺在桌上。',
    '如果母親還在，她一定會笑你。',
    '你說這是你母親教你的，她又是從她母親學的。',
  ]) assert.ok(!hit('parents_dead', snapWith({ age: 43, ...ORPHAN }), ok), ok);
});

test('5D rules: only one parent left ("父母病了" is "爸媽" for a single parent)', () => {
  const widow = snapWith({ age: 45, mother: true, father: false });
  assert.ok(hit('parents_dead', widow, '父母病了。'), 'title-style 父母 with one parent');
  assert.ok(hit('parents_dead', widow, '你回家吃飯，爸媽都在門口等你。'));
  assert.ok(!hit('parents_dead', widow, '你回家吃飯，媽媽在門口等你。'));
  assert.ok(!hit('parents_dead', snapWith({ age: 45, mother: true, father: true }), '你回家吃飯，爸媽都在門口等你。'));
});

test("5D rules: the partner's side is not your parents (公婆, 岳父母, 對方的父母, 孩子的爸)", () => {
  const dead = snapWith({ age: 35, ...ORPHAN, partner: 'married', partnerName: '李安' });
  for (const ok of ['你陪著公婆吃完飯。', '岳母把雞湯推到你面前。', '對方的父母從鄉下趕來。', '李安的爸媽坐在第一排。', '孩子的爸在門口等你。', '她的母親替你們煮了麵。'])
    assert.ok(!hit('parents_dead', dead, ok), ok);
});

test('5D rules: the partner is gone, the child still says "爸媽，你們…" (接送孫子的那條路)', () => {
  const ask = (p) => `Alanoud開口問你：「${p}願不願意幫忙帶孩子？」你想起當年自己的手忙腳亂。`;
  for (const status of ['widowed', 'divorced', null]) assert.ok(hit('couple_gone', snapWith({ age: 71, partner: status }), ask('爸媽，你們')), `partner ${status}`);
  assert.ok(!hit('couple_gone', snapWith({ age: 71, partner: 'married' }), ask('爸媽，你們')));
  assert.ok(!hit('couple_gone', snapWith({ age: 71, partner: 'widowed' }), ask('爸，你')));
  assert.ok(hit('couple_gone', snapWith({ age: 50, partner: 'divorced' }), '孩子知道後有點難過，說：「爸媽，你們也該為自己活。」'));
  assert.ok(hit('couple_gone', snapWith({ age: 50, partner: 'widowed' }), '你們夫妻倆一起去了海邊。'));
  assert.ok(!hit('couple_gone', snapWith({ age: 14, partner: null }), '你們一家人把房子交給親戚照看，搬了出去。'), 'a family of parents and a child');
  assert.ok(!hit('couple_gone', snapWith({ age: 21, partner: null }), '工廠欠了你們兩個月的薪水。'));
});

test('5D rules: parents of the grandchild are the player\'s own children ("孫輩的爸媽")', () => {
  assert.ok(hit('parents_dead', snapWith({ age: 72, ...ORPHAN }), '你深吸一口氣，掛掉電話，撥給孫輩的爸媽。') === false, '孫輩的爸媽 are your children: not your parents');
});

test('5D rules: the partner by name after the marriage ended', () => {
  const gone = snapWith({ age: 60, partner: 'widowed', partnerName: '林美玲' });
  assert.ok(hit('partner_gone', gone, '週末你和林美玲去市場，買了一袋橘子。'));
  assert.ok(!hit('partner_gone', gone, '你想起當年和林美玲第一次見面的那個下午。'));
  assert.ok(!hit('partner_gone', gone, '林美玲走後，家裡安靜了許多。'));
  assert.ok(!hit('partner_gone', snapWith({ age: 60, partner: 'married', partnerName: '林美玲' }), '週末你和林美玲去市場。'));
});

test('5D rules: children (count, alive, gender)', () => {
  const three = snapWith({ age: 50, kids: 3, kidsAlive: 3, sons: 1, sonsEver: 1, daughters: 2, daughtersEver: 2 });
  assert.ok(hit('kids_count', three, '你的兩個孩子都回來吃年夜飯。'));
  assert.ok(!hit('kids_count', three, '你的三個孩子都回來吃年夜飯。'));
  assert.ok(hit('kids_count', three, '你的兩個兒子都回來了。'));
  assert.ok(hit('kids_count', three, '你的三個女兒都回來了。'));
  assert.ok(!hit('kids_count', three, '鄰居的兩個孩子在院子裡玩。'), "somebody else's children");
  assert.ok(!hit('kids_count', three, '你帶了兩個孩子去看海，另外一個留在家裡。'.replace('你帶了', '還有')), 'a subset of the children');
  const lost = snapWith({ age: 50, kids: 2, kidsAlive: 0, sons: 0, daughters: 0, deadKidNames: ['林小安'] });
  assert.ok(hit('kids_dead', lost, '你的孩子打電話來，說週末要回家。'));
  assert.ok(hit('kids_dead', lost, '林小安週末要回家。'));
  assert.ok(!hit('kids_dead', lost, '你想起林小安小時候的樣子。'));
  assert.ok(!hit('kids_dead', lost, '你把林小安的照片擺在桌上，紀念他。'));
  const sonOnly = snapWith({ age: 50, kids: 1, kidsAlive: 1, sons: 1, sonsEver: 1, daughters: 0, daughtersEver: 0 });
  assert.ok(hit('kid_gender', sonOnly, '你的女兒帶著蛋糕來看你。'));
  assert.ok(!hit('kid_gender', sonOnly, '你的兒子帶著蛋糕來看你。'));
});

test('5D rules: siblings (count and plural)', () => {
  const one = snapWith({ age: 40, siblings: 1 });
  assert.ok(hit('siblings_count', one, '難得手足們都回到老家。'));
  assert.ok(hit('siblings_count', one, '你的兩個哥哥都在城裡。'));
  assert.ok(!hit('siblings_count', one, '難得你和手足都回到老家。'));
  assert.ok(!hit('siblings_count', snapWith({ age: 40, siblings: 3 }), '難得手足們都回到老家，你的兩個哥哥坐在左邊。'));
  assert.ok(hit('siblings', snapWith({ age: 40, siblings: 0 }), '你的哥哥打電話來。'), 'an only child (existing rule)');
});

test('5D rules: age-inappropriate scenes (零用錢 for a 70-year-old, 退休 for the young)', () => {
  const old = snapWith({ age: 70, status: 'retired', employed: false, inSchool: false, kidsAlive: 0, kids: 0 });
  assert.ok(hit('adult_childish', old, '你省下了兩個月的零用錢，買了一盞太陽能燈。'));
  assert.ok(hit('adult_childish', snapWith({ age: 34, inSchool: false }), '你被爸媽罵了一頓，作業也沒寫完。'.replace('作業也沒寫完', '放學後還得寫功課')));
  assert.ok(!hit('adult_childish', snapWith({ age: 40, kidsAlive: 2, kids: 2, inSchool: false }), '你訂了門禁、收了零用錢。'), 'a parent sets the pocket money');
  assert.ok(!hit('adult_childish', snapWith({ age: 40, kidsAlive: 2, kids: 2, inSchool: false }), '放學時，校門口擠滿了接送的家長。'), 'a parent at the school gate');
  assert.ok(!hit('adult_childish', snapWith({ age: 16, inSchool: true }), '你省下了兩個月的零用錢。'));
  assert.ok(hit('young_elder', snapWith({ age: 26 }), '你已經退休了，陪孫子畫畫。'));
  assert.ok(!hit('young_elder', snapWith({ age: 26 }), '穩定的工作、退休金、準時下班，聽起來有點奢侈。'));
});

const FAMILY_RULES = ['parents_dead', 'couple_gone', 'partner_gone', 'kids_dead', 'kids_count', 'kid_gender', 'siblings_count', 'siblings', 'adult_childish', 'young_elder', 'grandchildren'];

/** Render every text the player can read from an event in the state `s`: the text, its variants and the results of its choices. */
function renderAll(ev, s) {
  const h = makeHelpers(s);
  const out = [];
  const one = (t) => { try { const v = typeof t === 'function' ? t(s, h) : t; if (typeof v === 'string') out.push(v); } catch (e) { out.push(`<<${e.message}>>`); } };
  one(ev.text);
  for (const v of ev.variants || []) one(v);
  for (const c of ev.choices || []) { if (c.cond) { let ok = true; try { ok = !!c.cond(s, h); } catch (e) { ok = false; } if (!ok) continue; } out.push(c.label); one(c.result); one(c.familyResult); } // Phase 6A: only the choices this person can be offered (a teenager's wording is not read by a 40-year-old)
  return out;
}

/** A life frozen at `age` with the family taken apart as `fam` says: { mother, father, partner: null|'widowed'|'divorced'|'married', kids } */
function frozen(age, fam = {}, seed = 'f5d', countryCode = 'TWN') {
  const s = createLife({ era: 'present' }, seed, { countryCode, wealthQ: 3, birthYear: 2026 - age });
  s.age = age; s.year = s.birthYear + age;
  s.family.mother.alive = fam.mother ?? false; s.family.father.alive = fam.father ?? false;
  s.family.siblings = fam.siblings ?? 2;
  s.partner = fam.partner ? { name: '林美玲', gender: s.gender === 'F' ? 'M' : 'F', age: age - 1, status: fam.partner, since: s.year - 5 } : null;
  s.children = [];
  for (let i = 0; i < (fam.kids ?? 0); i++) s.children.push({ name: `孩子${'甲乙丙'[i]}名`, gender: i % 2 ? 'F' : 'M', birthYear: s.year - 25 + i, alive: fam.kidsAlive === undefined ? true : i < fam.kidsAlive, religion: s.religion });
  if (fam.partner === 'married') s.flags._married = true;
  if (fam.grand) s.flags.grandparent = true;
  s.work.status = age >= 62 ? 'retired' : 'employed'; s.edu.inSchool = false;
  return s;
}

test('5D events: the reported scenes, rendered with both parents dead, pass every family rule', () => {
  const cases = [
    // [event id, age, family]
    ['seed_wedding_planning', 34, { partner: 'married' }],
    ['regional_culture_wedding_rite', 34, { partner: 'married' }],
    ['family_wedding_day', 34, { partner: 'married' }],
    ['family_wedding_custom', 28, { partner: 'dating' }],
    ['family_matchmaker', 26, {}],
    ['family_arranged_decision', 26, { partner: 'dating' }],
    ['family_meet_parents', 31, { partner: 'dating' }],
    ['family_festival_gathering', 66, { partner: 'widowed', kids: 2 }],
    ['family_after_divorce', 50, { partner: 'divorced', kids: 1 }],
    ['regional_land_dispute', 43, { partner: 'married' }],
    ['regional_pastoral_move', 43, { partner: 'married', kids: 2 }],
    ['regional_power_cut', 70, { partner: 'widowed', kids: 2 }],
    ['regional_cookstove', 40, { partner: 'married' }],
    ['regional_borehole_well', 40, {}],
    ['aging_grandchild_care', 71, { partner: 'widowed', kids: 2, grand: true }],
    ['aging_scam_call', 73, { partner: 'widowed', kids: 2, grand: true }],
    ['aging_last_trip', 66, { partner: 'divorced', kids: 3 }],
    ['seed_grandchild', 66, { partner: 'divorced', kids: 2 }],
    ['family_parent_estate', 63, { partner: 'married', kids: 2, siblings: 1 }],
    ['family_sibling_reunion', 44, { partner: 'married', siblings: 1 }],
    ['seed_parent_illness', 50, { mother: true, siblings: 1 }],
    ['health_cancer_treatment', 36, { partner: 'married' }],
    ['childhood_corner_boys', 9, {}],
    ['work_farm_modernize', 30, { partner: 'married' }],
    ['world_china_reform_era', 25, {}],
    ['youth_music_obsession', 19, { partner: 'married' }],
    ['youth_family_money_talk', 18, { partner: 'married' }],
    ['health_postpartum_low', 30, { partner: 'married', kids: 2, kidsAlive: 1 }],
  ];
  const byId = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));
  const problems = [];
  for (const [id, age, fam] of cases) {
    assert.ok(byId[id], `unknown event ${id}`);
    const s = frozen(age, fam, `f5d-${id}`, id.startsWith('regional_') ? 'NER' : 'TWN');
    const snap = snapshot(s);
    for (const t of renderAll(byId[id], s)) {
      const text = `${byId[id].title}。${t}`;
      for (const r of RULES) {
        if (!FAMILY_RULES.includes(r.id)) continue;
        for (const h of r.check(snap, text)) problems.push(`${id}/${r.id}: [${h.word}] ${h.sentence} (${h.why})`);
      }
      assert.ok(!/<<|undefined|NaN/.test(t), `${id}: ${t}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('5D events: smaller continuity fixes (the child who becomes a parent, the parent abroad, the dead child, the married orphan)', () => {
  const byId = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));
  // 「爸，我要當爸爸了」 said by a DAUGHTER: the role is the child's own
  const s1 = frozen(66, { partner: 'widowed', kids: 2 }, 'f5d-gc');
  s1.children[0].gender = 'F';
  assert.match(renderAll(byId.seed_grandchild, s1)[0], /我要當媽媽了/);
  s1.children[0].gender = 'M';
  assert.match(renderAll(byId.seed_grandchild, s1)[0], /我要當爸爸了/);
  // 媽媽在國外工作 … 她 (never 他), 爸爸 … 他
  for (const [mother, father, pron, bad] of [[true, false, '她', '他'], [false, true, '他', '她']]) {
    const s = frozen(8, { mother, father, partner: null }, 'f5d-abroad', 'IND');
    s.family.wealthQ = 2; s.edu.inSchool = true; s.work.status = 'child';
    const t = renderAll(byId.childhood_parent_abroad, s)[0];
    assert.ok(t.includes(pron) && !t.includes(bad), t);
  }
  // the grandchild-care question never comes from a child who has died
  const s2 = frozen(70, { partner: 'widowed', kids: 2, kidsAlive: 1, grand: true }, 'f5d-care');
  assert.ok(renderAll(byId.aging_grandchild_care, s2)[0].startsWith(s2.children[0].name));
  assert.ok(!byId.aging_grandchild_care.cond(frozen(70, { kids: 2, kidsAlive: 0, grand: true }), makeHelpers(frozen(70, { kids: 2, kidsAlive: 0, grand: true }))), 'no living child, no question');
  // "孩子出生之後": the baby in the scene is a living one
  const s3 = frozen(30, { partner: 'married', kids: 2, kidsAlive: 1 }, 'f5d-baby');
  s3.children[0].birthYear = s3.year; s3.children[1].birthYear = s3.year; // twins: the second one did not live
  s3.gender = 'F';
  assert.ok(renderAll(byId.health_postpartum_low, s3)[0].startsWith(s3.children[0].name));
  // a 16-year-old orphan who is already married with a child is not "taken in by relatives"
  const s4 = frozen(16, { partner: 'married', kids: 1 }, 'f5d-orphan');
  s4.flags.orphan = true;
  assert.ok(!byId.youth_orphan_home.cond(s4, makeHelpers(s4)));
  const s5 = frozen(15, {}, 'f5d-orphan2'); s5.flags.orphan = true;
  assert.ok(byId.youth_orphan_home.cond(s5, makeHelpers(s5)));
  // the first wedding tells the empty seats, the second one only says it quietly
  const sw = frozen(30, { partner: 'married' }, 'f5d-wed2'); sw.flags._married = 1; sw.religion = 'none';
  const first = makeHelpers(sw).weddingAbsence();
  sw.flags._married = 2;
  const second = makeHelpers(sw).weddingAbsence();
  assert.ok(/相片|位子/.test(first) && /這一次/.test(second) && first !== second);
});

test('5D events: a follow-up about the wedding debt is dropped once the partner is gone (divorced or widowed)', () => {
  const ev = ALL_EVENTS.find((e) => e.id === 'family_wedding_debt');
  for (const status of ['married', 'dating']) { const s = frozen(40, { partner: status }); assert.ok(ev.followCond(s, makeHelpers(s)), status); }
  for (const status of ['divorced', 'widowed']) { const s = frozen(40, { partner: status }); assert.ok(!ev.followCond(s, makeHelpers(s)), status); }
});

test('5D events: the same scenes with both parents alive keep their family wording', () => {
  const byId = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));
  const s = frozen(34, { mother: true, father: true, partner: 'married' }, 'f5d-alive');
  const wed = renderAll(byId.seed_wedding_planning, s).join('');
  assert.ok(wed.includes('兩家人'), wed);
  const meet = renderAll(byId.family_meet_parents, frozen(31, { mother: true, father: true, partner: 'dating' }, 'f5d-meet')).join('');
  assert.ok(/爸爸/.test(meet) && /媽媽/.test(meet), meet);
  const festival = renderAll(byId.family_festival_gathering, frozen(40, { mother: true, father: true, partner: 'married' }, 'f5d-fest')).join('');
  assert.ok(!/過世/.test(festival), festival);
});

test('5D helpers: parentsPresent / byParents / parentsOr / standIn / weddingFolk / weddingAbsence', () => {
  const mk = (m, f, age = 30, seed = 'h5d') => { const s = frozen(age, { mother: m, father: f }, seed); return makeHelpers(s); };
  assert.equal(mk(true, true).parentsPresent(), 'both');
  assert.equal(mk(true, false).parentsPresent(), 'mother');
  assert.equal(mk(false, true).parentsPresent(), 'father');
  assert.equal(mk(false, false).parentsPresent(), 'none');
  assert.ok(mk(false, false).parentsGone() && !mk(true, false).parentsGone());
  assert.ok(mk(true, false).oneParent() && !mk(true, true).oneParent() && !mk(false, false).oneParent());
  assert.equal(mk(true, true).parentsOr(), '爸媽');
  assert.equal(mk(true, false).parentsOr(), '媽媽');
  assert.equal(mk(false, true).parentsOr(), '爸爸');
  assert.equal(mk(false, false).parentsOr('親戚'), '親戚');
  assert.equal(mk(true, false).parentLeft(), '母親');
  assert.equal(mk(false, true).parentLeft(), '父親');
  assert.equal(mk(true, true).byParents({ both: 'B', one: 'O', none: 'N' }), 'B');
  assert.equal(mk(true, false).byParents({ both: 'B', one: 'O', none: 'N' }), 'O');
  assert.equal(mk(false, false).byParents({ both: 'B', one: 'O', none: 'N' }), 'N');
  assert.equal(mk(false, false).byParents({ both: 'B', _: 'X' }), 'X');
  assert.equal(mk(true, true).weddingFolk(), '兩家人');
  assert.equal(mk(true, false).weddingFolk(), '兩家人');
  assert.equal(mk(false, false).weddingFolk(), '親友們');
  assert.equal(mk(true, true).weddingAbsence(), '');
  // stand-in: stable per life, an elder of the family for the young, the eldest sibling later, nobody without siblings
  const young = mk(false, false, 28, 'standin');
  assert.ok(['叔叔', '姑姑', '舅舅', '阿姨', '伯父'].includes(young.standIn()));
  assert.equal(young.standIn(), young.standIn());
  assert.equal(frozen(55, { siblings: 2 }) && makeHelpers(frozen(55, { siblings: 2 })).standIn(), '年紀最長的手足');
  assert.equal(makeHelpers(frozen(55, { siblings: 0 })).standIn(), '');
  assert.equal(makeHelpers(frozen(30, {})).pocketMoney(), '私房錢');
  const kid = frozen(12, {}); kid.edu.inSchool = true;
  assert.equal(makeHelpers(kid).pocketMoney(), '零用錢');
  // youngestChildName never names a dead child
  const sk = frozen(40, { partner: 'married', kids: 2, kidsAlive: 1 });
  assert.equal(makeHelpers(sk).youngestChildName(), sk.children[0].name);
});

test('5D wedding line: every religion x parents (both / mother / father / none) x age is tender, complete and passes the rules', () => {
  const RELIGIONS = ['christian', 'muslim', 'hindu', 'buddhist', 'folk', 'jewish', 'sikh', 'none', 'other'];
  const problems = [];
  for (const rel of RELIGIONS) {
    for (const [m, f] of [[true, true], [true, false], [false, true], [false, false]]) {
      for (const age of [24, 38, 58]) {
        const s = frozen(age, { mother: m, father: f, partner: 'married', siblings: age === 58 ? 0 : 2 }, `wed-${rel}-${age}`);
        s.religion = rel;
        const line = makeHelpers(s).weddingAbsence();
        if (m && f) { if (line !== '') problems.push(`${rel}: both alive but "${line}"`); continue; }
        if (!line || /undefined|NaN|\[object/.test(line)) problems.push(`${rel}/${m}${f}/${age}: empty or broken`);
        if (!(m || f) && !/過世|不在了/.test(line)) problems.push(`${rel}/${age}: ${line}`);
        const snap = snapshot(s);
        for (const r of RULES.filter((x) => ['parents_dead', 'couple_gone', 'partner_gone', 'template'].includes(x.id))) {
          for (const h of r.check(snap, line)) problems.push(`${rel}/${m}${f}/${age} ${r.id}: [${h.word}] ${h.sentence}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('5D marriages in played lives: no "兩家人" when both parents are dead, the absence is acknowledged', () => {
  // lives in which the parents are gone before the wedding (orphaned early, or both die at 20-45), played until they marry
  let weddings = 0, absence = 0;
  for (let i = 0; i < 600 && weddings < 60; i++) {
    const era = ['past', 'present', 'future'][i % 3];
    const { s, rows } = playAudited({ era }, `wed5d-${i}`, { countryCode: ['TWN', 'IND', 'CHN', 'BRA', 'POL', 'PAK', 'NGA', 'EGY'][i % 8], stress: { mother: 5 + (i % 15), father: 5 + ((i * 7) % 15) } });
    for (const r of rows) {
      if (r.entry.title !== '結婚') continue;
      if (r.post.mother || r.post.father) continue;
      weddings++;
      assert.ok(!/兩家人|雙方長輩/.test(r.entry.text), `${i}: ${r.entry.text}`);
      if (/過世|相片|牌位|神龕|墓地|沒有人替你們主婚|替你們主婚/.test(r.entry.text)) absence++;
    }
  }
  assert.ok(weddings >= 25, `${weddings} weddings of orphans`);
  assert.equal(absence, weddings, 'every such wedding mentions the missing parents');
});

test('5D first child and graduation in played lives: the grandparents are told, or remembered, by who is alive', () => {
  let none = 0, one = 0, both = 0, grad = 0;
  for (let i = 0; i < 500; i++) {
    const { rows } = playAudited({ era: ['past', 'present', 'future'][i % 3] }, `kid5d-${i}`, { countryCode: ['TWN', 'IND', 'BRA', 'USA', 'NGA', 'JPN'][i % 6], stress: i % 2 ? { mother: 10 + (i % 12), father: 10 + ((i * 5) % 12) } : i % 4 === 2 ? { mother: 12 } : undefined });
    for (const r of rows) {
      const pp = r.post && (r.post.mother && r.post.father ? 'both' : r.post.mother || r.post.father ? 'one' : 'none');
      if (r.entry.title === '第一個孩子') {
        if (pp === 'none') { none++; assert.match(r.entry.text, /過世的爸媽/); }
        else if (pp === 'one') { one++; assert.match(r.entry.text, /打電話告訴(母親|父親)/); }
        else { both++; assert.ok(!/過世|打電話告訴/.test(r.entry.text), r.entry.text); }
      }
      if (r.entry.title === '大學畢業' && r.entry.text.startsWith('你拿到學位。畢業典禮上')) {
        grad++;
        if (pp === 'none') assert.match(r.entry.text, /不在現場的雙親/);
        else if (pp === 'one') assert.match(r.entry.text, /也想起沒能看到這一天的(父親|母親)/);
        else assert.ok(/觀眾席/.test(r.entry.text) && !/想起/.test(r.entry.text), r.entry.text);
      }
    }
  }
  assert.ok(none > 10 && one > 10 && both > 10 && grad > 20, `${none}/${one}/${both} first children, ${grad} graduations`);
});

test('5D graduation and partner naming: no clash between the partner and a child', () => {
  for (let i = 0; i < 400; i++) {
    const s = createLife({ era: ['past', 'present', 'future'][i % 3] }, `nm5d-${i}`);
    let g = 0;
    while (s.alive && g++ < 130) advanceYear(s, { auto: true });
    if (!s.partner) continue;
    for (const c of s.children) assert.notEqual(c.name, s.partner.name, `seed nm5d-${i}: a child and the partner share the name ${c.name}`);
  }
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

const STRESS_LIVES = 800;
let stressAudit = null;
test(`audit: zero contradictions in ${STRESS_LIVES} fixed-seed lives with the family taken apart (parents, partner, a child) and every phrasing rotated through`, () => {
  stressAudit = runAudit(lifeConfigs(STRESS_LIVES, { prefix: 'coh5d', countries: ALL_CODES, stress: true, novelty: true }), {});
  const hard = stressAudit.flags.filter((f) => !SOFT.has(f.rule));
  if (hard.length) {
    const lines = groupFlags(hard).slice(0, 15).map((g) => `${g.n}x ${g.rule} ${g.id} [${g.word}] ${g.sample.why} :: ${g.sample.sentence} (seed ${g.sample.seed})`);
    assert.fail(`${hard.length} contradictions:\n  ${lines.join('\n  ')}`);
  }
});

test('audit: the stress scenarios really put lives into the states they promise', () => {
  const seen = { orphan: 0, widowed: 0, divorced: 0, kidLost: 0, onlyMother: 0, onlyFather: 0 };
  for (let j = 0; j < 240; j++) {
    const st = stressFor(j);
    const { s } = playAudited({ era: 'present' }, `stress-state-${j}`, { stress: st ? { ...st } : undefined });
    const pt = s.partner && s.partner.status;
    if (st && st.mother !== undefined && st.father !== undefined) seen.orphan++;
    else if (st && st.mother !== undefined && st.father === undefined) seen.onlyFather++;
    else if (st && st.father !== undefined && st.mother === undefined) seen.onlyMother++;
    if (pt === 'widowed') seen.widowed++;
    if (pt === 'divorced') seen.divorced++;
    if (s.children.some((c) => !c.alive)) seen.kidLost++;
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 5, `${k}: only ${n} of 240 lives`);
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
