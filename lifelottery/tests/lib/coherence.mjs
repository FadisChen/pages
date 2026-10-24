// Coherence auditor: plays lives and checks every rendered text against the state of the person at that moment.
//
// Used by tests/coherence.test.mjs (strict, fixed seeds, must be at zero flags) and by tools/coherence-scan.mjs
// (deeper, exploratory runs that print the flags grouped by rule and event).
//
// How it works
//   * install() wraps the `text` / `result` / yearly `text` functions so that whenever a text is rendered the state of
//     the person is snapshotted at that very moment (text is rendered BEFORE the event's effects are applied, so a
//     divorce text is checked against the married state).
//   * every log entry is tagged with { id (event id, `yearly:N`, `sys:title`), snap }.
//   * RULES inspect (snap, text) and return hits. A hit is a flag unless an ALLOW entry matches it.
//
// Phase 5D (family continuity) added:
//   * state-aware rules for every family member: parents_dead (one or both dead, indirect wording such as 兩家人 / 雙方長輩 / 家長 /
//     回老家, a single parent left but "爸媽" written), couple_gone ("爸媽，你們…" / "你們夫妻" without a partner), partner_gone by name,
//     kids_dead, kids_count, kid_gender, siblings_count, adult_childish (零用錢 / 放學 / 被家人罵 for adults), young_elder (退休 / 孫子
//     for the young), parent_pronoun ("媽媽 … 他");
//   * window-based exemptions (famCtx): a memory, a grief word or a hypothesis only counts when it sits in the clauses AROUND the
//     keyword, so "母親說，這是為了他們以後可以選擇" is no longer excused by the 以後 in the next clause;
//   * applyStress() / stressFor(): lives in which the family is taken apart at a chosen age (silently), and lifeConfigs({ stress, novelty })
//     so that the deep scans also visit orphans, widowed and divorced people, lost children, and every phrasing of every event.
//
// Nothing here changes the game; the wrappers only record.

import ALL_EVENTS from '../../js/data/events/index.js';
import YEARLY from '../../js/data/yearly.js';
import { createLife, advanceYear } from '../../js/engine/life.js';
import { BY_CODE } from '../../js/data/countries.js';
import { incomeGroupAt } from '../../js/data/eras.js';
import * as HELP from '../../js/engine/helpers.js';
import { RULE as AGENCY_RULE } from './rules-agency.mjs'; // Phase 6A
import { RULE as HOUSEHOLD_RULE, householdSnap, migrantStressFor, applyMigrantStress } from './rules-household.mjs'; // Phase 6B

// ---------------------------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------------------------

const TRACK = new WeakMap(); // state -> { everPartner, everMarried, ... }

export function snapshot(s) {
  let T = TRACK.get(s);
  if (!T) { T = {}; TRACK.set(s, T); }
  const f = s.flags;
  const pt = s.partner;
  if (pt) T.everPartner = true;
  if (f._married) T.everMarried = true;
  if (pt && pt.status === 'married') T.everMarried = true;
  const kidAges = s.children.map((c) => s.year - c.birthYear);
  const aliveKidAges = s.children.filter((c) => c.alive).map((c) => s.year - c.birthYear);
  const country = BY_CODE[s.countryCode];
  const w = s.work.status;
  return {
    age: s.age, year: s.year, birthYear: s.birthYear, gender: s.gender, era: s.settings.era,
    country: s.countryCode, home: s.homeCountryCode, region: country.region, income: country.income,
    incomeAt: incomeGroupAt(country, s.year), urban: s.urban,
    status: w, employed: w === 'employed' || w === 'self', retired: w === 'retired',
    job: s.work.job, everWorked: (f._jobs || []).length > 0 || s.work.yearsWorked > 0,
    inSchool: s.edu.inSchool, eduLevel: s.edu.level, eduYears: s.edu.years,
    partner: pt ? pt.status : null, partnerGender: pt ? pt.gender : null,
    everPartner: !!T.everPartner, everMarried: !!T.everMarried,
    kids: s.children.length, kidsAlive: aliveKidAges.length,
    sons: s.children.filter((c) => c.alive && c.gender === 'M').length, daughters: s.children.filter((c) => c.alive && c.gender === 'F').length,
    sonsEver: s.children.filter((c) => c.gender === 'M').length, daughtersEver: s.children.filter((c) => c.gender === 'F').length,
    deadKidNames: s.children.filter((c) => !c.alive && c.name && c.name.length >= 2).map((c) => c.name),
    selfName: s.name.full, partnerName: pt ? pt.name : null, motherName: s.family.mother.name, fatherName: s.family.father.name,
    eldestKid: kidAges.length ? Math.max(...kidAges) : -1,
    youngestKid: kidAges.length ? Math.min(...kidAges) : -1,
    youngestAliveKid: aliveKidAges.length ? Math.min(...aliveKidAges) : -1,
    grand: HELP.makeHelpers(s).grandchildren ? HELP.makeHelpers(s).grandchildren() : 0,
    mother: s.family.mother.alive, father: s.family.father.alive, siblings: s.family.siblings,
    wealthQ: s.family.wealthQ, migrant: s.countryCode !== s.homeCountryCode,
    names: [pt && pt.name, s.family.mother.name, s.family.father.name, ...s.children.map((c) => c.name)].filter((n) => n && n.length >= 2),
    flags: Object.keys(f).filter((k) => !k.startsWith('_') && f[k]).join(','),
    religion: s.religion, festivalKey: HELP.makeHelpers(s).festivalKey(), homeRegion: BY_CODE[s.homeCountryCode].region,
    coast: HELP.makeHelpers(s).coastal(), climate: HELP.makeHelpers(s).climate(), drinks: HELP.makeHelpers(s).drinks(),
    hh: householdSnap(s), // Phase 6B (rules-household.mjs)
  };
}

// ---------------------------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------------------------

const CTX = { current: null, texts: new Map(), installed: false, yearStart: null };
const META = new WeakMap(); // log entry -> { id, snap }

function record(s, text, id) {
  if (typeof text === 'string') CTX.texts.set(text, { id, snap: snapshot(s) });
  CTX.current = id;
}

export function install() {
  if (CTX.installed) return;
  CTX.installed = true;
  for (const ev of ALL_EVENTS) {
    const text = ev.text;
    ev.text = (s, h) => { const t = typeof text === 'function' ? text(s, h) : text; record(s, t, ev.id); return t; };
    if (ev.variants) ev.variants = ev.variants.map((v) => (s, h) => { const t = typeof v === 'function' ? v(s, h) : v; record(s, t, ev.id); return t; }); // Phase 5C phrasings are audited like the main text
    if (typeof ev.effects === 'function') {
      const fx = ev.effects;
      ev.effects = (s, h) => { CTX.current = ev.id; return fx(s, h); };
    }
    for (const c of ev.choices || []) {
      if (c.result !== undefined) {
        const r = c.result;
        c.result = (s, h) => { const t = typeof r === 'function' ? r(s, h) : r; record(s, t, ev.id); return t; };
      }
      if (typeof c.effects === 'function') {
        const fx = c.effects;
        c.effects = (s, h) => { CTX.current = ev.id; return fx(s, h); };
      }
    }
  }
  YEARLY.forEach((y, i) => {
    const text = y.text;
    y.text = (s, h) => { const t = text(s, h); record(s, t, `yearly:${i}`); return t; };
    if (y.variants) y.variants = y.variants.map((v) => (s, h) => { const t = typeof v === 'function' ? v(s, h) : v; record(s, t, `yearly:${i}`); return t; });
  });
}

function tag(s, entry) {
  if (META.has(entry)) return;
  const post = snapshot(s);
  const hit = CTX.texts.get(entry.text);
  if (hit && entry.kind !== 'death') META.set(entry, { id: hit.id, pre: hit.snap, post });
  else {
    const sys = !(CTX.current && entry.kind !== 'milestone' && entry.kind !== 'death' && !entry.title.endsWith('歲'));
    // system lines are written after the state change they describe: compare against the start of the year as well
    const pre = sys && CTX.yearStart ? { ...CTX.yearStart, age: post.age, year: post.year } : post;
    META.set(entry, { id: sys ? `sys:${entry.title}` : CTX.current, pre, post });
  }
}

/**
 * Family stress scenarios (Phase 5D). A natural life reaches "both parents dead, partner dead, a child lost" only rarely and late,
 * so the deep scans also play lives in which the family is taken apart at a chosen age, silently (no log line), to exercise
 * every event in those states:  { mother?: age, father?: age, partner?: [age, 'widowed' | 'divorced'], kid?: age (the first child dies that year or later) }.
 */
export function applyStress(s, st) {
  if (st.migrant) applyMigrantStress(s, st.migrant); // Phase 6B: `--migrant`
  if (st.mother !== undefined && s.age >= st.mother) s.family.mother.alive = false;
  if (st.father !== undefined && s.age >= st.father) s.family.father.alive = false;
  if (st.partner && s.age >= st.partner[0] && s.partner && (s.partner.status === 'married' || s.partner.status === 'dating')) s.partner.status = st.partner[1];
  if (st.kid !== undefined && s.age >= st.kid) { const c = s.children.find((k) => k.alive); if (c && !st.kidDone) { c.alive = false; st.kidDone = true; } }
}

/** Play a whole life with auto choices; returns { s, rows: [{ entry, id, snap }] }. */
export function playAudited(settings, seed, opts = {}) {
  install();
  CTX.texts.clear();
  CTX.current = null;
  const { stress, ...lifeOpts } = opts;
  const s = createLife(settings, seed, lifeOpts);
  const push = Array.prototype.push;
  s.log.push = function (...es) { for (const e of es) tag(s, e); return push.apply(this, es); };
  tag(s, s.log[0]);
  let guard = 0;
  while (s.alive && guard++ < 130) {
    CTX.current = null;
    if (stress) applyStress(s, stress);
    CTX.yearStart = snapshot(s);
    advanceYear(s, { auto: true });
  }
  delete s.log.push; // restore the prototype method (keeps the state serialisable and comparable)
  const rows = s.log.map((entry) => ({ entry, ...(META.get(entry) || { id: `sys:${entry.title}`, pre: null, post: null }) }));
  return { s, rows };
}

// ---------------------------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------------------------

/** Sentences of a text with their start index. */
function sentencesOf(text) {
  const out = [];
  const re = /[^。！？!?\n]+[。！？!?]*/g;
  let m, prev = '';
  while ((m = re.exec(text))) {
    out.push({ s: m[0], start: m.index, prev });
    prev = m[0];
  }
  return out;
}

// Words that mark a third-party subject (somebody other than "you") in front of a keyword.
const THIRD = /爸|媽|父親|母親|父母|雙親|家人|孩子|兒子|女兒|小孩|寶寶|伴侶|丈夫|妻子|老公|老婆|哥哥|姊姊|姐姐|弟弟|妹妹|鄰居|朋友|大人|(?<![其他])他|她|別人|親戚|叔|伯|姑|舅|姨|祖|奶奶|爺爺|公公|婆婆|岳|大家|村民|村裡|同伴|新聞|報導|當地|老人|長輩|人們|同事們|大哥|大姊|工人|鄉親/g;

/** Is the keyword at `idx` about "you" (true) or about somebody else (false)? */
function selfContext(sentence, idx, names = []) {
  const prefix = sentence.slice(0, idx);
  // possessive of somebody else: "鄰居的兒子", "朋友的婚禮" (but not "你的…")
  const poss = prefix.match(/([^，。、；：「」『』\s]{1,6})的$/);
  if (poss && !/你/.test(poss[1].slice(-2))) return false;
  const lastYou = prefix.lastIndexOf('你');
  let lastThird = -1, m;
  THIRD.lastIndex = 0;
  while ((m = THIRD.exec(prefix))) lastThird = m.index + m[0].length - 1;
  for (const n of names) { const i = prefix.lastIndexOf(n); if (i >= 0) lastThird = Math.max(lastThird, i + n.length - 1); }
  return !(lastThird > lastYou);
}

const MEMORY = /想起|回想|回憶|記得|當年|那時|以前|從前|曾經|小時候|年輕時|過去|多年前|多年後|當時|那年|老同學|老同事|舊日|往日|昔日|懷念|夢見|夢到|年前|多年以前|還記得|終於|後來|從此|不再|已經離開|再也|相簿|老照片|舊照片|舊友|回頭|想念|思念|記憶|直到|才知道|才明白|曾|教你的|教過|教的|說過|傳給你|傳下|學來的|學的/;
const GRIEF = /留下|過世|離世|去世|離開了|走了|葬禮|遺物|遺照|悼|逝世|忌日|墳|掃墓|祭|喪|往生|永遠|已經不在|不在了|生前|病逝|辭世|追思|紀念|守靈|火化|骨灰|空蕩|少了/;
const HYPO = /將來|以後|未來|想當|想像|夢想|希望|打算|如果|要是|等你長大|長大後|將會|總有一天|想著|盼|期待|也許|或許|可能|萬一|準備|考慮|假如|要不要|會不會|是否|能不能|想要|想過|不知道|說不定|好奇|羨慕|相信|害怕|擔心|怕/;

// ---------------------------------------------------------------------------------------------
// Family continuity (Phase 5D): window-based exemptions
//
// The generic MEMORY / GRIEF / HYPO tests above look at the whole sentence (and the previous one), which is far too generous
// for a text like "…放牧遷徙…母親說，這是為了他們以後可以選擇": the 以後 belongs to somebody else's clause, yet it exempted the
// dead mother speaking in the present tense. The family rules look only at the clauses AROUND the keyword.
// ---------------------------------------------------------------------------------------------

/** Clauses of a sentence (split at 、，；：) with their start index. */
function clausesOf(sentence) {
  const out = [];
  const re = /[^，；：、]+[，；：、]?/g;
  let m;
  while ((m = re.exec(sentence))) out.push({ t: m[0], start: m.index });
  return out;
}

/** The text of the clauses from `before` clauses ahead of the keyword's clause up to `after` clauses behind it. */
function windowAround(sentence, idx, before = 1, after = 1) {
  const cl = clausesOf(sentence);
  let k = cl.findIndex((c, i) => idx >= c.start && (i === cl.length - 1 || idx < cl[i + 1].start));
  if (k < 0) k = 0;
  return cl.slice(Math.max(0, k - before), k + after + 1).map((c) => c.t).join('');
}

/** The sentence from the start of the clause `back` clauses before the keyword up to the keyword itself. */
function textBefore(sentence, idx, back = 2) {
  const cl = clausesOf(sentence);
  let k = cl.findIndex((c, i) => idx >= c.start && (i === cl.length - 1 || idx < cl[i + 1].start));
  if (k < 0) k = 0;
  return sentence.slice(cl[Math.max(0, k - back)].start, idx);
}

// real memories: a strong past marker (the broad MEMORY list above also holds 終於／後來／從此／直到／曾 …, which say nothing about the keyword's own clause)
const MEM_STRONG = /想起|回想|回憶|記得|當年|那時|以前|從前|曾經|小時候|年輕時|多年前|當時|那年|懷念|夢見|夢到|年前|多年以前|還記得|想念|思念|記憶|相簿|老照片|舊照片|生前|當初|早年|年少|幼時|兒時|往日|昔日|舊日|教你的|教過|教的|說過|傳給你|傳下|學來的|從小|過去(的|那|幾|十|二|三)|不曾|沒能|來不及|曾(經|在|有|是|說)/;
const GRIEF_STRONG = /過世|離世|去世|逝世|葬禮|遺物|遺照|遺像|悼|忌日|墳|墓|空位|不在場|無法到場|沒能到場|相片|掃墓|祭|喪|往生|已經不在|不在了|不在身邊|生前|病逝|辭世|追思|紀念|守靈|火化|骨灰|牌位|靈位|已故|亡父|亡母|早逝|走後|離開人世|離開了你|離開這個世界|少了|缺席|空著|留給你|留下的|留下了|祖先|先人|天上|思念|想念|懷念|不在了/;
const HYPO_STRONG = /如果|要是|假如|萬一|也許|或許|可能|會不會|是否|要不要|能不能|不知道|想像|希望|打算|考慮|說不定|好奇|盼望|期待|將來|等你長大|總有一天|夢想|想當|若是|假設|多希望|要是|倘若/;

/**
 * Window-based context for the family rules. `c` is the scan context; returns { mem, grief, hypo } for the clauses around the
 * keyword (memory: two clauses before and one after, plus the tail of the previous sentence; hypothesis: the clause itself and the one before).
 */
function famCtx(c, prev = '') {
  const idx = c.prefix.length;
  const memWin = windowAround(c.sentence, idx, 2, 1) + prev.slice(-18);
  return {
    mem: MEM_STRONG.test(memWin),
    grief: GRIEF_STRONG.test(windowAround(c.sentence, idx, 2, 2)) || GRIEF_STRONG.test(prev.slice(-24)),
    // a wish or a condition has to come BEFORE the keyword ("如果母親還在…", "你希望父親…"); "兩家人對婚禮的期待截然不同" is a plain statement
    hypo: HYPO_STRONG.test(textBefore(c.sentence, idx, 2)) || /^(如果|要是|假如|萬一|若是|倘若)/.test(c.sentence),
  };
}

/** Like scan(), but each hit also carries `fam` (see famCtx) and `self2`, a possessive-free "is this about you" test. */
function famScan(text, wordRe, snap, check) {
  const hits = [];
  const re = new RegExp(wordRe.source, wordRe.flags.includes('g') ? wordRe.flags : wordRe.flags + 'g');
  for (const sen of sentencesOf(text)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sen.s))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      const prefix = sen.s.slice(0, m.index);
      const c = {
        word: m[0], sentence: sen.s.trim(), prefix, after: sen.s.slice(m.index + m[0].length),
        self: selfContext(sen.s, m.index, snap.names),
        self2: selfContext2(sen.s, m.index, snap.names.filter((n) => n !== snap.motherName && n !== snap.fatherName), THIRD_FAMILY),
        quoted: (prefix.match(/[「『]/g) || []).length > (prefix.match(/[」』]/g) || []).length,
        text,
      };
      // words YOU say ("你說「我媽在等我」") are about your own family, unlike the quoted words of a child or a neighbour
      if (c.quoted && /(^|[，；。：、])你[^，；。「」『』問]{0,6}(說|回|答|喊|嘆|開口|低聲|輕聲|喃喃|解釋|補一句|補充)[^，；。「」『』]{0,4}[：:]?[「『][^」』]*$/.test(prefix)) c.quoted = false;
      c.fam = famCtx(c, sen.prev);
      const why = check(c, snap);
      if (why) hits.push({ word: c.word, sentence: c.sentence, why: why === true ? '' : String(why) });
    }
  }
  return hits;
}

/** selfContext without the "X的 = somebody's possession" shortcut ("省下兩個月的零用錢" is yours, "鄰居的兒子" is not: third-party words decide). */
function selfContext2(sentence, idx, names = [], third = THIRD) {
  // "你和曾子怡的婚禮上，兩家人…": the people joined to 你 by 和／跟／與 are part of "you", not a third party
  const prefix = sentence.slice(0, idx).replace(/你(們)?(和|跟|與|及)[^，；：、。]{1,14}?(?=的|[，；：、]|$)/g, '你');
  const lastYou = prefix.lastIndexOf('你');
  let lastThird = -1, m;
  third.lastIndex = 0;
  while ((m = third.exec(prefix))) lastThird = m.index + m[0].length - 1;
  for (const n of names) { const i = prefix.lastIndexOf(n); if (i >= 0) lastThird = Math.max(lastThird, i + n.length - 1); }
  return !(lastThird > lastYou);
}

// third parties who are NOT your own family: for the parent rules, "家人把屋子打掃了三遍，爸爸假裝在看報紙" is still about YOUR father
const THIRD_FAMILY = /孩子|兒子|女兒|小孩|寶寶|伴侶|丈夫|妻子|老公|老婆|鄰居|朋友|(?<![其他])他|她|別人|公公|婆婆|岳|同事|工人|村民|同伴|孫|同學|對方|病人|客人|老師|醫師|店員|對面/g;

// a life told as a whole (the eulogy, the card): names of a partner or a child who is gone are part of the story, not a scene of the present
const RETRO = /相伴|分開|盡頭|天人永隔|成家|各自走開|走開|婚姻|離世|養育|養大|拉拔|育有|陪著|付出了|長大成人|牽掛|放不下|送走|先走|離開|沒能陪|比自己更早|攜手|一起把日子/;

const CN_NUM = { 一: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const numOf = (w) => (/^\d+$/.test(w) ? +w : CN_NUM[w] ?? NaN);

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

// the same lag the events use (h.techReady); the fallback only exists so the auditor can also run on older checkouts
const techLag = HELP.techLag || ((g, urban) => ({ H: 0, UM: 2, LM: 4, L: 7 }[g] ?? 0) + (!urban && g !== 'H' ? 2 : 0));
const lagRural = (snap) => techLag(snap.incomeAt, snap.urban);

/**
 * Scan `text` for `wordRe`; for each match call `check({ word, sentence, prefix, self, memory, grief, hypo, text }, snap)`
 * which returns a truthy "reason" when it is a contradiction.
 */
function scan(text, wordRe, snap, check) {
  const hits = [];
  const re = new RegExp(wordRe.source, wordRe.flags.includes('g') ? wordRe.flags : wordRe.flags + 'g');
  for (const sen of sentencesOf(text)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(sen.s))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      const c = {
        word: m[0], sentence: sen.s.trim(), prefix: sen.s.slice(0, m.index),
        self: selfContext(sen.s, m.index, snap.names),
        you: /你/.test(sen.s.slice(0, m.index + m[0].length).split(/[，；：、]/).pop() + sen.s.slice(m.index + m[0].length).split(/[，；：、。]/)[0]),
        quoted: (sen.s.slice(0, m.index).match(/[「『]/g) || []).length > (sen.s.slice(0, m.index).match(/[」』]/g) || []).length,
        negated: /(沒有|沒|無|不用|不必|不再|缺|少了|別|未)$/.test(sen.s.slice(0, m.index).slice(-3)),
        memory: MEMORY.test(sen.s) || MEMORY.test(sen.prev.slice(-30)),
        grief: GRIEF.test(sen.s),
        hypo: HYPO.test(sen.s),
        text,
      };
      if ((c.negated || /沒有被送進|沒能照常入學|沒能入學|沒有入學|沒能進|沒有進|無法進|進不了|上不了學|沒有上學|沒能上學|沒有學校|沒有老師/.test(sen.s)) && /^(課本|書包|同事|老闆|薪水|辦公室|學校|老師|同學|教室|上學|放學|功課|校門)$/.test(c.word)) continue; // "沒有課本的日子"
      const why = check(c, snap);
      if (why) hits.push({ word: c.word, sentence: c.sentence, why: why === true ? '' : String(why) });
    }
  }
  return hits;
}

const PARENT_OTHER = /父親節|母親節|母語|母校|母親河|祖父|祖母|養父|養母|繼父|繼母|岳父|岳母|公公|婆婆|公婆|親家|乾爸|乾媽|教父|教母|孩子的爸|孩子的媽|孩子們的爸|孩子們的媽|爸爸媽媽們|對方(的)?(父母|爸媽|家人|長輩|家長|爸|媽)|伴侶的(父母|爸|媽|家人|長輩)|另一半的(父母|爸|媽|家人)|(他|她)的(父母|爸|媽|爸媽|母親|父親|家人)|新娘的|新郎的|丈夫的(父母|爸|媽)|妻子的(父母|爸|媽)/;
const WORK_RE = /辦公室|同事|老闆|上班|加班|薪水|客戶|下班|薪資|年終獎金|打卡|上司/;
const SELF_JOBS = new Set(['farmer', 'fisher', 'street_vendor', 'shopkeeper', 'artisan']);
const SELF_WORK_RE = /同事|下班|上班|主管|薪水|薪資|加班|辦公室|公司|年終獎金|打卡|上司/;
const NEED_YOU = /^(辦公室|薪水|薪資|年終獎金|加班|下班|上班|客戶|打卡)$/;
const JOB_SEEK = /邀你|邀請|職缺|應徵|招聘|招募|面試|求職|找工作|錄取|聘|徵人|工作機會|缺人手|缺人|找人|在找.{0,2}人|有一份|一份工作|謀職|轉職|獵頭|offer|履歷/;
const CLASS_PREMISE = /培訓|再就業|夜校|夜間班|夜間部|補校|訓練班|技職訓練|職訓|識字班|拜師|學藝/;
const JOB_END = /道別|收拾|資遣|離職|辭職|被裁|裁員|離開(了)?(公司|工作|崗位|職場)|最後一天|交接|失業|解雇|炒魷魚|裁掉|丟了工作|失去工作|退職/;
const WORK_PREMISE = /家裡小店|家裡的小店|家裡開的|家裡經營|家裡的生意|暑假的工|暑假你在|打工|兼職|兼差|工讀|學徒|幫工|做工|暑期工|實習|零工|當童工|幫忙(看店|顧店|家裡的店|家裡的攤)|家裡的店|家裡的攤|家裡的工廠|家裡的田|送報|送貨/;
const PLACE_SCHOOL = /^(學校|操場|教室|書包|課本|班上|上課|校服|校長|校門)$/;
const SCHOOL_CORE = /老師(?!傅)|同學|教室|考試|作業|下課/;
const SCHOOL_EXT = /上課|(?<!離開)學校|課本|書包|班導|導師|段考|校服|操場|校長|班上|上學|放學|功課|(?<!離)開學|校門/;
const SCHOOL_RE = new RegExp(SCHOOL_CORE.source + '|' + SCHOOL_EXT.source);
const ADULT_ED = /夜校|夜間部|進修|課程|補校|職訓|訓練班|語言班|語言課|學程|成人教育|大學|線上課|函授|技職|證照班|補習班/;
const PARTNER_RE = /伴侶|另一半|丈夫|妻子|老公|老婆|配偶|(?<!老)太太|先生(?!們)|婚|新娘|新郎|枕邊人|愛人|情人|男友|女友|男朋友|女朋友/;
const KIDS_RE = /你(們)?的?(孩子|小孩|兒子|女兒|兒女|子女|寶寶)|你家的?孩子|兒子|女兒|兒女|子女|親生/;
const KIDS_ADULT_RE = /你(和|跟)孩子們|你的孩子們|孩子們(輪流|安排|在城市|圍坐|都不在|各自|忙著|很孝順|回來|離家|長大|搬出|在外|傳來|寄來|打來|帶著)|孩子的(電話|匯款|照片)|(?<![的])孩子(傳|寄|打|匯)|孫輩/;
const TODDLER_RE = /第一個詞|學走路|搖籃|學步|牙牙學語|咿呀|蹣跚|學說話|學會說話|最早的玩伴|第一個長句子|尿布|奶瓶|斷奶|嬰兒車|襁褓|爬行/;
const RETIRE_RE = /退休|養老金|領養老|頤養/;
const SMART_RE = /智慧型手機|智慧手機|\bapps?\b|\bApps?\b|APP|應用程式|社群|臉書|Facebook|Instagram|\bIG\b|\bLINE\b|WhatsApp|WeChat|微信|YouTube|抖音|TikTok|推特|Twitter|限時動態|貼文|按讚|網紅|直播|串流|Netflix|Telegram|網路社群|AI|人工智慧|ChatGPT|聊天機器人/;
const PHONE_RE = /手機|行動電話|簡訊/;
const NET_RE = /網路|上網|網站|網頁|電子郵件|email|E-mail|網咖|網友|部落格|搜尋|Google|WiFi|Wi-Fi|雲端|網購|線上課|線上購物|視訊/;
const TV_RE = /電視/;
const UNIV_RE = /大學時(期|代|光)|大學同學|大學畢業|大學裡|大學宿舍|大學生活|你的大學|校園|學位|研究所|畢業典禮|碩士|博士|學士|系上|教授/;
const SECOND_RE = /高中|中學|國中|初中/;
const PREG_RE = /懷孕|孕吐|待產|坐月子|產檢|哺乳|分娩|剖腹|害喜/;
const SIB_RE = /(?<![大小表堂鄰隔壁])(哥哥|姊姊|姐姐|弟弟|妹妹|兄弟|姊妹)|手足|兄姊|兄長/;
const ADULT_THEME_RE = /約會|情人|談戀愛|戀人|初戀|喝醉|酒吧|宿醉|香菸|抽菸|吸菸|啤酒|婚/;
const OLD_THEME_RE = /老花|假牙|拐杖|助行器|輪椅|養老院|安養|老人家|白髮蒼蒼|銀髮/;

const TEMPLATE_RE = /undefined|NaN|\[object|\bnull\b|\{\{|\}\}|\$\{|%s|\bTODO\b|\bfunction\b|=>/;
const DOUBLE_PUNCT_RE = /[，。、；：]{2,}|[！？]{3,}|，。|。，|、，|，、|\s{2,}|「」|（）|\(\)|的的|了了|你你|他他|她她/;

export const RULES = [
  {
    id: 'template', desc: '範本殘留、undefined/NaN/null、標點重複',
    check(snap, text) {
      const hits = [];
      let m;
      if ((m = text.match(TEMPLATE_RE))) hits.push({ word: m[0], sentence: text, why: 'token' });
      if ((m = text.match(DOUBLE_PUNCT_RE))) hits.push({ word: m[0], sentence: text, why: 'punct' });
      return hits;
    },
  },
  {
    id: 'work', desc: '兒童、只是學生、或沒有工作的人，出現辦公室／同事／老闆等職場詞',
    check(snap, text) {
      if (snap.employed) return [];
      if (snap.retired && snap.everWorked) return [];
      return scan(text, WORK_RE, snap, (c) => {
        if (!c.self || c.hypo) return false;
        if (NEED_YOU.test(c.word) && !c.you) return false; // general statements about pay or offices are not about "you"
        if (c.word === '辦公室' && (snap.age < 15 || snap.inSchool) && /老師|校長|教務|訓導|學校|報告|被叫/.test(text)) return false; // the school office
        if (WORK_PREMISE.test(text)) return false; // the text itself says the person has a (part-time) job
        if (JOB_SEEK.test(c.sentence) || JOB_END.test(c.sentence)) return false; // offers, applications and farewells talk about a job that is coming or going
        if (c.word === '同事' && /(前|曾經的|以前的|老|舊|昔日的)$/.test(c.prefix)) return false; // job offers and applications talk about pay before the job exists
        // 顧客眼中的店老闆、自己創業當老闆，都不是「你有一個老闆」
        if (c.word === '老闆' && (/[店攤鋪館廠房行咖吧]$/.test(c.prefix) || /老闆娘|買|賣|點(茶|餐|菜|杯)|收攤|客人|顧客|隨便坐|攤位|多給|找錢|結帳|收錢|當老闆|自己的老闆|成為老闆|做老闆|創業/.test(c.sentence))) return false;
        if (c.word === '客戶' && snap.job && /sales|entrepreneur|shopkeeper/.test(snap.job)) return false;
        if (c.memory && snap.everWorked) return false;
        if (c.memory && c.grief) return false;
        const kind = snap.age < 15 || snap.status === 'child' ? '兒童' : snap.inSchool ? '學生' : snap.everWorked ? '目前無業' : '從未工作';
        return `${kind}／${snap.status}`;
      });
    },
  },
  {
    id: 'work_self', desc: '農夫、漁民、攤販、小店老闆、手藝人沒有同事、上司、薪水、下班（自己做生意的人）',
    check(snap, text) {
      if (snap.status !== 'self' || !SELF_JOBS.has(snap.job)) return [];
      return scan(text, SELF_WORK_RE, snap, (c) => {
        if (!c.self || c.hypo || c.memory || !c.you && !/同事|老闆/.test(c.word)) return false;
        if (JOB_END.test(c.sentence) || JOB_SEEK.test(c.sentence) || WORK_PREMISE.test(text)) return false;
        if (c.word === '辦公室' && (snap.age < 15 || snap.inSchool) && /老師|校長|教務|訓導|學校|報告|被叫/.test(text)) return false; // the school office
        if (c.word === '公司' && /(保險|電力|電信|瓦斯|水|公車|客運|航空|貨運|快遞|唱片|玩具|出版|建設|電話|銀行)公司|公司的(車|貨|人|代表|廣告)|賣給.*公司|交給.*公司|合作|批發|供貨|進貨|採購/.test(c.sentence)) return false;
        return `自營工作者（${snap.job}）`;
      });
    },
  },
  {
    id: 'job_noun', desc: '礦坑、漁船、工廠等場景與職業不符',
    check(snap, text) {
      const hits = [];
      const rules = [
        [/下井|礦坑|礦工|礦場/, ['miner'], '礦'],
        [/出海|漁網|漁船|漁港|漁獲|漁民/, ['fisher'], '漁'],
        [/工廠|廠房|產線|流水線|機台/, ['factory', 'laborer', 'technician', 'engineer', 'manager', 'accountant', 'clerk', 'driver', 'guard', 'sales', 'civil_servant', 'cook'], '工廠'],
      ];
      for (const [re, jobs, what] of rules) {
        hits.push(...scan(text, re, snap, (c) => {
          if (!c.self || c.hypo || c.memory) return false;
          if (!snap.employed) return false; // handled by the `work` rules
          if (jobs.includes(snap.job)) return false;
          if (WORK_PREMISE.test(text) || JOB_END.test(c.sentence) || JOB_SEEK.test(c.sentence)) return false;
          if (what === '工廠' && /附近的工廠|路過|隔壁的工廠|鄰近的工廠|城裡的工作|工廠、餐館|同鄉|外移|設廠|新開的工廠|工廠倒閉|工廠關閉|煙囪|污染|排放/.test(c.sentence)) return false;
          if (what !== '工廠' && !c.you) return false;
          return `${what}場景，職業是 ${snap.job}`;
        }));
      }
      return hits;
    },
  },
  {
    id: 'school', desc: '不在學的人出現老師／同學／教室／考試／作業／下課等校園詞',
    check(snap, text) {
      if (snap.inSchool) return [];
      const adult = snap.age >= 20;
      const teacherJob = snap.job === 'teacher' || snap.job === 'researcher';
      return scan(text, adult ? SCHOOL_CORE : SCHOOL_RE, snap, (c) => {
        if (!c.self || c.hypo) return false;
        if (snap.age >= 18 && (/他們|她們|弟妹|孩子|兒子|女兒|學生|孫|姪|外甥/.test(c.sentence) || snap.names.some((n) => c.sentence.includes(n)))) return false; // grown-ups talking about the school of others
        if (/(當|扮演|充當|兼任|成了|成為)$/.test(c.prefix)) return false; // "同時當老師、助教和網管"
        if (PLACE_SCHOOL.test(c.word) && !c.you) return false; // "學校縮短了課時": the world, not "your" school
        if (c.word === '學校' && /填|申請|報名|志願|錄取|考上|選了|轉學|搬到|附近|旁邊|離.*近/.test(c.sentence)) return false; // choosing / applying to a school
        if (/同學會|老同學|恩師|師恩|「老師」|「同學」/.test(c.sentence)) return false;
        if (snap.age >= 3 && snap.age <= 6 && /幼兒園|幼稚園|托兒|學前|幼稚/.test(text)) return false;
        if (snap.age >= 18 && ADULT_ED.test(text)) return false;
        if (CLASS_PREMISE.test(text)) return false; // the event is about a night class / training course
        if (teacherJob && /老師|學生|教室|學校|作業|考試|下課|上課|課本|班上|課堂|批改/.test(c.sentence)) return false;
        if (c.word === '考試' && /證書|駕照|駕駛|證照|國考|公職|檢定|資格|執照|公務|入籍|移民|語言|筆試|路考|升等|考證|職業|專業|技師|醫師|公務員|考核|甄試/.test(c.sentence)) return false;
        if (c.word === '作業' && /作業系統|作業員|作業流程|作業程序|施工|田間作業|現場作業|夜間作業|捕撈作業|農作業|機械作業|海上作業|沒有防護/.test(c.sentence)) return false;
        if (c.memory && snap.eduYears > 0) return false;
        return `不在學／age ${snap.age}／edu ${snap.eduLevel}(${snap.eduYears})`;
      });
    },
  },
  {
    id: 'partner', desc: '沒有伴侶卻提到伴侶／配偶／婚姻',
    check(snap, text) {
      if (snap.partner === 'dating' || snap.partner === 'married') return [];
      const hasAny = !!snap.partner; // divorced / widowed: handled by partner_gone
      if (hasAny) return [];
      return scan(text, PARTNER_RE, snap, (c) => {
        if (!c.self) return false;
        if (c.hypo || (c.memory && snap.everPartner)) return false;
        if (/催|逼|相親|未婚|單身|不婚|晚婚|早婚|童婚|婚姻平權|婚姻制度|想結婚|要結婚|不結婚|結婚的壓力|結婚這件事|被迫結婚|嫁|媒人|提親|介紹對象|對象|適婚|婚事|訂婚|聘金|嫁妝|彩禮|成家|沒有伴|沒有人|沒人|不再|孤單|獨自|一個人|分手|沒結婚|沒有結婚|還沒|尚未|無法|找到|遇見|認識|喜歡的人|心儀|暗戀|結婚的人|結婚的朋友|結婚的同學|婚禮上|喜宴|喜酒|喜帖|賀禮|紅包|伴娘|伴郎|婚紗|結婚典禮|成婚|再婚|離婚|已婚/.test(c.sentence)) return false;
        if (c.word === '先生' && /醫生|老先生|某位先生|這位先生|那位先生|(王|李|張|陳|林|黃|劉|吳|趙|周)先生|先生們|先生，您/.test(c.sentence)) return false;
        if (c.word === '情人' && /情人節/.test(c.sentence)) return false;
        if (c.word === '另一半' && /一半/.test(c.sentence.replace('另一半', ''))) return false; // "有一半…另一半…"
        if (c.word === '另一半' && /(那|其中|剩下的)?另一半(的錢|的時間|留|用|拿|給|是|則|在|被|做|放|存|交)/.test(c.sentence) && !/伴侶|愛人/.test(c.sentence)) return false;
        return `無伴侶（ever ${snap.everPartner}）`;
      });
    },
  },
  {
    id: 'partner_gone', desc: '離婚／喪偶後仍以現在式提到對方',
    check(snap, text) {
      if (snap.partner !== 'divorced' && snap.partner !== 'widowed') return [];
      const hits = [];
      // the partner's own name, spoken of in the present tense, after the marriage ended or the partner died
      if (snap.partnerName && snap.partnerName.length >= 2) {
        // a child or parent whose full name contains the partner's name ("Ani" / "Ani Hartono") is not the partner
        let masked = text;
        for (const o of [snap.selfName, ...snap.names].filter((n) => n && n !== snap.partnerName && n.includes(snap.partnerName)).sort((a, b) => b.length - a.length)) masked = masked.split(o).join('〓');
        hits.push(...famScan(masked, new RegExp(snap.partnerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), snap, (c) => {
          if (c.fam.hypo || c.fam.mem || c.fam.grief || c.quoted) return false;
          if (/前夫|前妻|前任|離婚|離異|已故|亡夫|亡妻|遺孀|寡|喪偶|鰥|失去|走後|不在了|過世|去世|再婚|新的|重新|另一個|下一段|新伴侶|再找|結婚了|婚禮|出生|介紹|認識|遇見|心動/.test(c.sentence) || RETRO.test(c.sentence)) return false;
          return `${snap.partner}（名字）`;
        }));
      }
      return hits.concat(scan(text, /丈夫|妻子|老公|老婆|另一半|伴侶|枕邊人|配偶|(?<!老)太太|先生(?!們)/, snap, (c) => {
        if (!c.self || c.hypo || c.memory || c.grief) return false;
        if (/前夫|前妻|前任|離婚|離異|已故|亡夫|亡妻|遺孀|寡|喪偶|鰥|失去|走後|不在了|過世|去世|獨自|一個人|孤單|沒有|再婚|新的|重新|另一個|下一段|新伴侶|再找/.test(c.sentence)) return false;
        if (c.word === '先生' && /醫生|老先生|某位|這位|那位|(王|李|張|陳|林|黃|劉|吳|趙|周)先生/.test(c.sentence)) return false;
        return `${snap.partner}`;
      }));
    },
  },
  {
    id: 'spouse_early', desc: '只是交往中（未婚）就稱對方丈夫／妻子／婚後',
    check(snap, text) {
      if (snap.partner !== 'dating' || snap.everMarried) return [];
      return scan(text, /丈夫|妻子|老公|老婆|婚後|新婚|蜜月|(?<!老)太太|新娘|新郎/, snap, (c) => {
        if (!c.self || c.hypo || c.memory) return false;
        if (/未來的|將來的|以後的|想像|成為|當.{0,3}(丈夫|妻子|太太)|做.{0,3}(丈夫|妻子|太太)|嫁|娶|求婚|準備|籌備|商量|討論|談|訂婚|打算|決定|想結婚|要結婚|不想|拒絕/.test(c.sentence)) return false;
        return '交往中卻稱配偶';
      });
    },
  },
  {
    id: 'spouse_gender', desc: '伴侶性別與丈夫／妻子稱呼不符',
    check(snap, text) {
      if (snap.partner !== 'married' && snap.partner !== 'dating') return [];
      const wrong = snap.partnerGender === 'F' ? /丈夫|老公|新郎|先生(?!們)/ : /妻子|老婆|(?<!老)太太|新娘|媳婦/;
      return scan(text, wrong, snap, (c) => {
        if (!c.self) return false;
        if (c.word === '先生' && /醫生|老先生|某位|這位|那位|(王|李|張|陳|林|黃|劉|吳|趙|周)先生/.test(c.sentence)) return false;
        return `伴侶是${snap.partnerGender}`;
      });
    },
  },
  {
    id: 'kids', desc: '沒有孩子卻提到你的孩子／兒子／女兒',
    check(snap, text) {
      if (snap.kids > 0) return [];
      return scan(text, snap.age >= 35 ? new RegExp(KIDS_RE.source + '|' + KIDS_ADULT_RE.source) : KIDS_RE, snap, (c) => {
        if (!c.self) return false;
        if (c.hypo || c.memory) return false;
        if (/想要孩子|生孩子|懷孕|將來的|未來的|沒有孩子|無子|沒有兒女|沒有子女|膝下無|沒孩子|領養|收養|養孩子|帶孩子|有孩子|孩子的事|有了孩子|生兒子|生女兒|生子|兒子或女兒|女兒或兒子|頭胎|傳宗接代|重男輕女|多生|少生|不生|沒生|想生|要生|生一個|再生|催生|盼|添丁|添個|抱孫/.test(c.sentence)) return false;
        return '沒有孩子';
      });
    },
  },
  {
    id: 'parents_dead', desc: '雙親（或單方）已過世，卻以現在式提到：爸爸／媽媽／父母，以及間接說法（兩家人、雙方長輩／家長、家長、回老家／娘家）',
    check(snap, text) {
      if (snap.mother && snap.father) return [];
      const hits = [];
      const exempt = (c) => {
        if (!c.self2 || c.fam.hypo || c.fam.mem || c.fam.grief || c.quoted) return true;
        if (/成為了?父母|當了?父母|為人父母|身為父母|做父母|你們當父母|父母的角色/.test(c.sentence)) return true;
        if (/[「：]\s*$/.test(c.prefix)) return true;
        if (PARENT_OTHER.test(c.sentence) || /(各自|彼此|大家|他們|她們|同學|朋友|鄰居|別人|其他人|每個人|每家|各家)的$/.test(c.prefix.slice(-5))) return true;
        if (snap.partnerName && c.prefix.includes(snap.partnerName + '的') && new RegExp(snap.partnerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '的[^，；：。、]{0,2}$').test(c.prefix)) return true; // the partner's parents ("李安的爸媽"), not "你和李安的婚禮上，…"
        return false;
      };
      const one = (re, who) => famScan(text, re, snap, (c) => (exempt(c) ? false : `${who} 已過世`));
      if (!snap.father) hits.push(...one(/爸爸|爸(?!媽)|父親|老爸|阿爸/, '父親'));
      if (!snap.mother) hits.push(...one(/媽媽|媽(?!爸)|母親|老媽|阿母/, '母親'));
      if (!snap.father && !snap.mother) {
        hits.push(...one(/父母|爸媽|雙親|爹娘|爸爸媽媽|二老|兩老/, '雙親'));
        hits.push(...famScan(text, /兩家人|兩家(的)?(長輩|父母|家長)|兩邊(的)?(長輩|父母|家長|家人)|雙方(的)?(長輩|家長|父母|家人|親人)|家長/, snap, (c) => {
          if (exempt(c)) return false;
          if (c.word === '家長' && (snap.kidsAlive > 0 && snap.age >= 24 || /家長會|家長們?[，。]?(都|接送)|其他家長|別的家長|學生家長|接送的家長|老師.{0,6}家長/.test(c.sentence) && snap.age >= 24)) return false; // you are the "家長" of the child's school
          if (c.word === '家長' && /替.*簽名|簽名|聯絡簿|監護人/.test(c.sentence) && snap.age < 18) return '家長（簽名）而雙親已歿';
          return `雙親已歿：${c.word}`;
        }));
        hits.push(...famScan(text, /回老家|回娘家|回父母家|回爸媽家|回爸媽那|老家的(飯桌|灶|廚房|院子|門)|爸媽的老家|父母的老家/, snap, (c) => {
          if (exempt(c)) return false;
          if (/手足|兄弟|姊妹|哥哥|姊姊|弟弟|妹妹|親戚|叔|伯|姑|舅|姨|堂|表|祖|掃墓|上墳|祭|老屋|空屋|賣掉|整理|拆|租|重建|修/.test(c.sentence)) return false; // going back to the village / relatives / the empty house
          return `雙親已歿：${c.word}`;
        }));
      } else {
        // exactly one of them is alive: "爸媽／父母" together is wrong
        hits.push(...famScan(text, /父母|爸媽|雙親|爹娘|爸爸媽媽|二老|兩老/, snap, (c) => (exempt(c) ? false : `只剩${snap.mother ? '母親' : '父親'}：${c.word}`)));
        hits.push(...famScan(text, /兩家人|雙方(的)?(長輩|家長|父母)/, snap, () => false)); // one parent still makes "兩家人" true
      }
      return hits;
    },
  },
  {
    id: 'couple_gone', desc: '伴侶已不在（無伴侶、離婚、喪偶）卻以「你們」「爸媽」稱呼主角與伴侶這一組（孩子說「爸媽，你們…」、「你們夫妻」、「孩子的爸／媽」）',
    check(snap, text) {
      if (snap.partner === 'married' || snap.partner === 'dating') return [];
      return famScan(text, /[「『]爸媽|爸媽，?你們|爸、媽|爸[，,]媽|你們(夫妻|夫婦|倆|兩個(?!月)|兩人|兩位|兩老|二老)|孩子(他|們的|的)(爸|媽)|孩子們的(爸|媽)|兩老|老伴/, snap, (c) => {
        if (c.fam.hypo || c.fam.mem || c.fam.grief) return false;
        if (/老伴/.test(c.word) && /[你我]的老伴|阿公|阿嬤|爺爺|奶奶|鄰居|隔壁|老人/.test(c.sentence)) return false;
        if (c.word === '兩老' && (!c.self2 || /爸媽|父母|岳|公婆|雙親|他們|她們|親家/.test(c.sentence))) return false; // somebody else's old couple
        if (/孩子(他|們的|的)(爸|媽)/.test(c.word) && snap.age < 30) return false;
        return `${snap.partner || '無伴侶'}：${c.word}`;
      });
    },
  },
  {
    id: 'parent_pronoun', desc: '寫到媽媽／母親（或爸爸／父親）的那一句或下一句，代名詞的性別錯了（「媽媽在國外工作。…看見他的臉」）',
    check(snap, text) {
      const hits = [];
      const OTHER_ANY = /孩子|伴侶|對方|同事|老師|朋友|鄰居|老闆|醫|護|長輩|大人|師傅|你們|他們|她們|[A-Z]/;
      const MALE = /爸|父|兒子|丈夫|老公|先生|哥|弟|男|叔|伯|舅|公|師傅/, FEMALE = /媽|母|女兒|妻子|老婆|太太|姊|姐|妹|女|婆|嬤|奶|阿姨|姑|姨/;
      let prev = null; // 'm' | 'f' | null: the only parent the previous sentence talked about
      for (const sen of sentencesOf(text)) {
        const s0 = sen.s;
        const mother = /媽媽|母親/.test(s0), father = /爸爸|父親/.test(s0);
        const here = mother && !father && !MALE.test(s0.replace(/媽媽|母親/g, '')) && !OTHER_ANY.test(s0) ? 'm' : father && !mother && !FEMALE.test(s0.replace(/爸爸|父親/g, '')) && !OTHER_ANY.test(s0) ? 'f' : null;
        const who = here || (!MALE.test(s0) && !FEMALE.test(s0) && !OTHER_ANY.test(s0) ? prev : null);
        if (who === 'm' && /(?<![其他])他(?![們人鄉方處])/.test(s0)) hits.push({ word: '他', sentence: s0.trim(), why: '母親用「他」' });
        if (who === 'f' && /她(?!們)/.test(s0)) hits.push({ word: '她', sentence: s0.trim(), why: '父親用「她」' });
        prev = here && /^(你的)?(媽媽|母親|爸爸|父親)/.test(s0.trim()) ? here : null; // only a parent who is the subject of the sentence carries over to the next one
      }
      return hits;
    },
  },
  {
    id: 'kids_dead', desc: '孩子都已過世（或某個孩子已過世）卻以現在式提到「你的孩子／兒子／女兒」或孩子的名字',
    check(snap, text) {
      const hits = [];
      if (snap.kids > 0 && snap.kidsAlive === 0) {
        hits.push(...famScan(text, KIDS_RE, snap, (c) => {
          if (!c.self2 || c.fam.hypo || c.fam.mem || c.fam.grief || c.quoted) return false;
          if (/想要孩子|生孩子|懷孕|將來的|未來的|沒有孩子|無子|沒有兒女|沒有子女|膝下無|沒孩子|領養|收養|養孩子|帶孩子|有孩子|有了孩子|生兒子|生女兒|兒子或女兒|女兒或兒子|頭胎|傳宗接代|重男輕女|多生|少生|不生|沒生|想生|要生|再生|催生|添丁|抱孫/.test(c.sentence)) return false;
          return '孩子都已過世';
        }));
      }
      // the name of a dead child, unless it is only part of somebody else's full name (a patronymic "Ratna Firmansyah", the partner, a parent)
      let named = text;
      for (const o of [snap.selfName, snap.partnerName, snap.motherName, snap.fatherName]) if (o && o.length >= 2) named = named.split(o).join('〓');
      for (const n of snap.deadKidNames) {
        hits.push(...famScan(named, new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), snap, (c) => {
          if (c.fam.hypo || c.fam.mem || c.fam.grief || c.quoted) return false;
          if (/出生|誕生|取名|取了名|名字/.test(c.sentence) || RETRO.test(c.sentence)) return false;
          return `${n} 已過世`;
        }));
      }
      return hits;
    },
  },
  {
    id: 'kids_count', desc: '孩子（兒子、女兒、孫輩）的數量與實際不符，例如有三個孩子卻寫「兩個孩子」',
    check(snap, text) {
      return famScan(text, /(一|兩|二|三|四|五|六|七|八|九|十|\d+)(個|名|位)(孩子|小孩|兒女|子女|兒子|女兒|孫子|孫女|孫輩)/, snap, (c) => {
        if (!c.self2 || c.fam.hypo || c.fam.mem || c.quoted) return false;
        if (!/你(們)?(的|家的?|有|和|跟|與|帶著|牽著|抱著)[^，。]{0,2}$/.test(c.prefix)) return false; // only "your" children are counted
        if (/還有|其餘|其他|另外|剩下|其中|最小|最大|多了|再生|再添|添了|第.個|多一|少一|增加|懷|生下|想要|想生|要生|已經有|共有.*人/.test(c.sentence + c.prefix.slice(-4)) && !/你有/.test(c.sentence)) return false;
        const m = c.word.match(/^(.+?)(個|名|位)(.+)$/);
        const n = numOf(m[1]), kind = m[3];
        if (!(n >= 1)) return false;
        let ok;
        if (/兒子/.test(kind)) ok = n === snap.sons || n === snap.sonsEver;
        else if (/女兒/.test(kind)) ok = n === snap.daughters || n === snap.daughtersEver;
        else if (/孫/.test(kind)) ok = n <= Math.max(snap.grand, 1);
        else ok = n === snap.kids || n === snap.kidsAlive;
        return ok ? false : `n=${n} ${kind}，實際 ${snap.kids}（活著 ${snap.kidsAlive}；子 ${snap.sons} 女 ${snap.daughters}）`;
      });
    },
  },
  {
    id: 'kid_gender', desc: '沒有（活著的）兒子卻提到「你的兒子」，或沒有女兒卻提到「你的女兒」',
    check(snap, text) {
      if (snap.kidsAlive === 0) return []; // kids / kids_dead cover it
      const hits = [];
      const chk = (re, have, name) => { if (!have) hits.push(...famScan(text, re, snap, (c) => {
        if (!c.self2 || c.fam.hypo || c.fam.mem || c.fam.grief || c.quoted) return false;
        if (!/你(家|的|那|們的)|^[^，。]{0,3}$/.test(c.prefix.slice(-3) + c.word) && c.prefix.length) return false;
        if (/(個|名|位|對)$/.test(c.prefix) || /想要|想生|重男輕女|生兒子|生女兒|傳宗接代|期待|盼/.test(c.sentence)) return false;
        return `沒有${name}`;
      })); };
      chk(/兒子/, snap.sons + 0, '活著的兒子');
      chk(/女兒/, snap.daughters + 0, '活著的女兒');
      return hits;
    },
  },
  {
    id: 'siblings_count', desc: '手足數量與實際不符（「兩個哥哥」但只有一個手足，單一手足卻用「手足們」）',
    check(snap, text) {
      if (snap.siblings <= 0) return [];
      const hits = famScan(text, /(一|兩|二|三|四|五|六|七|八|九|十|\d+)(個|位)(哥哥|姊姊|姐姐|弟弟|妹妹|手足|兄弟|姊妹|兄姊|弟妹|兄弟姊妹)/, snap, (c) => {
        if (!c.self2 || c.fam.hypo || c.fam.mem || c.quoted) return false;
        if (!/你(們)?(的|家的?|有|和|跟|與)[^，。]{0,2}$/.test(c.prefix)) return false;
        if (/[表堂鄰隔壁]/.test(c.prefix.slice(-2)) || /還有|其餘|其他|另外|剩下|其中|最小|最大|比你|同學|朋友|鄰居|班上|室友/.test(c.sentence)) return false;
        const m = c.word.match(/^(.+?)(個|位)(.+)$/);
        const n = numOf(m[1]);
        return n > snap.siblings ? `n=${n} 但手足 ${snap.siblings}` : false;
      });
      if (snap.siblings === 1) {
        hits.push(...famScan(text, /你的(手足們|兄弟姊妹們?|哥哥姊姊們|弟弟妹妹們|兄姊們|弟妹們)|(手足|兄弟姊妹)們/, snap, (c) => (c.fam.hypo || c.fam.mem || !c.self2 ? false : '只有一個手足')));
      }
      return hits;
    },
  },
  {
    id: 'adult_childish', desc: '成年人出現小孩的場景：零用錢、放學、寫功課、被家人罵、書包（給孩子的除外）',
    check(snap, text) {
      if (snap.age < 18 || (snap.inSchool && snap.age < 20)) return [];
      return famScan(text, /零用錢|放學|寫功課|做功課|被(爸媽|爸爸|媽媽|父母|母親|父親|家人|大人)(罵|念|唸|打)|挨(爸媽|爸爸|媽媽|父母|母親|父親|家人)(罵|打)|(爸媽|爸爸|媽媽|父母|母親|父親|家人)罵(了)?你|被叫家長|叫家長/, snap, (c) => {
        if (!c.self2 || c.fam.hypo || c.fam.mem || c.quoted) return false;
        if (/給(了)?(孩子|兒子|女兒|孫|姪|外甥|弟妹|弟弟|妹妹|小孩|他|她)|孩子們?|孫|兒子|女兒|姪|外甥|小孩|學生|弟妹|弟弟|妹妹|校門口的/.test(c.sentence) && snap.age >= 24) return false;
        if (snap.inSchool && /^(放學|寫功課|做功課)$/.test(c.word)) return false; // adult education / university: "下課" is the right word, but the audit leaves it to the school rules
        if (c.word === '零用錢' && snap.age < 20 && !snap.employed && snap.partner !== 'married') return false;
        if (c.word === '零用錢' && snap.kidsAlive > 0 && /收|給|發|扣|停|訂|加|減|限|管|談|多給|少給/.test(c.sentence)) return false; // a parent setting the pocket money
        if (c.word === '放學' && snap.kidsAlive > 0 && /校門|接送|接|等|家長|孩子/.test(c.sentence)) return false; // a parent at the school gate
        return `age ${snap.age} ${snap.status}：${c.word}`;
      });
    },
  },
  {
    id: 'young_elder', desc: '年輕人出現老年情境：退休、孫子、含飴弄孫、養老（自己的）',
    check(snap, text) {
      if (snap.age >= 40) return [];
      return famScan(text, /退休(?!金|制度|年金)|孫子|孫女|孫兒|孫輩|含飴弄孫|安享晚年|養老|頤養/, snap, (c) => {
        if (!c.self2 || c.fam.hypo || c.fam.mem || c.quoted) return false;
        if (/爸|媽|父|母|爺|奶|祖|公|嬤|婆|長輩|師傅|老師|老闆|同事|鄰居|老人|老先生|老太太|新聞|政府|制度|年金|規劃|存|準備|計畫|計劃|保險|基金/.test(c.sentence)) return false;
        return `age ${snap.age}：${c.word}`;
      });
    },
  },
  {
    id: 'grandchildren', desc: '還沒有孫輩卻提到孫子／孫女',
    check(snap, text) {
      if (snap.grand > 0 || snap.eldestKid >= 17) return [];
      return scan(text, /孫子|孫女|孫兒|外孫|孫輩|抱孫|孫媳|孫兒們/, snap, (c) => {
        if (!c.self || c.hypo || c.memory) return false;
        if (snap.age < 40 && /祖父|祖母|爺爺|奶奶|外公|外婆|阿公|阿嬤/.test(c.sentence)) return false; // grandparents talking about "you"
        return `最大孩子 ${snap.eldestKid}`;
      });
    },
  },
  {
    id: 'toddler', desc: '4 歲以後出現嬰幼兒才有的描寫',
    check(snap, text) {
      if (snap.age < 4) return [];
      return scan(text, TODDLER_RE, snap, (c) => {
        // "你學會的第一個長句子": a relative clause with 你 as its subject is about you, although selfContext reads "…的" as somebody's possession
        const youClause = /你[^，。；、的]{1,5}的$/.test(c.prefix);
        if (!c.self && !youClause && snap.kids === 0) return false;
        if (snap.youngestKid >= 0 && snap.youngestKid <= 4 && snap.kids) return false; // own toddler
        if (snap.grand > 0) return false;
        if (!c.self && !youClause) return false;
        if (c.memory || c.hypo) return false;
        if (c.word === '最早的玩伴' && snap.age <= 6) return false; // still little ("第一個長句子" is a two-year-old's milestone: flagged from age 4)
        return `age ${snap.age}`;
      });
    },
  },
  {
    id: 'retire', desc: '還沒退休就談退休',
    check(snap, text) {
      if (snap.retired) return [];
      return scan(text, RETIRE_RE, snap, (c) => {
        if (!c.self || c.hypo || !c.you || c.quoted) return false; // a general remark ("穩定的工作、退休金") is not about "you" retiring
        if (/存|規劃|計畫|計劃|準備|還有.{0,4}年|離退休|提早退休|延後退休|退休金制度|退休金改革|年金|公教|撥|勞保|保險|提撥|制度|改革|法案|新聞|政府|公司的|同事|老闆|師傅|老師/.test(c.sentence)) return false;
        if (snap.age < 45) return `age ${snap.age}`;
        if (/退休後|退休生活|已經退休|退休那天|領退休|退休金到手|退休了|退休之後|辦了退休|退下來/.test(c.sentence) && !snap.retired && !c.memory) return `尚未退休 age ${snap.age} ${snap.status}`;
        return false;
      });
    },
  },
  {
    id: 'smart', desc: '智慧型手機／App／社群／AI 出現得太早',
    check(snap, text) {
      return scan(text, SMART_RE, snap, (c) => {
        const base = /AI|人工智慧|ChatGPT|聊天機器人/.test(c.word) ? 2016 : /Netflix|串流|直播|網紅/.test(c.word) ? 2010 : 2008;
        const th = base + lagRural(snap);
        return snap.year < th ? `year ${snap.year} < ${th} (${snap.incomeAt}${snap.urban ? '' : ' rural'})` : false;
      });
    },
  },
  {
    id: 'phone', desc: '手機出現得太早',
    check(snap, text) {
      return scan(text, PHONE_RE, snap, (c) => {
        const th = (c.word === '簡訊' ? 1998 : 1995) + lagRural(snap);
        return snap.year < th ? `year ${snap.year} < ${th} (${snap.incomeAt}${snap.urban ? '' : ' rural'})` : false;
      });
    },
  },
  {
    id: 'internet', desc: '網際網路出現得太早',
    check(snap, text) {
      return scan(text, NET_RE, snap, (c) => {
        if (c.word === '上網' && /魚|漁|捕|撈|網子|補網/.test(c.sentence)) return false; // "魚都不上網" is about fishing nets
        const th = 1995 + lagRural(snap);
        return snap.year < th ? `year ${snap.year} < ${th} (${snap.incomeAt}${snap.urban ? '' : ' rural'})` : false;
      });
    },
  },
  {
    id: 'tv', desc: '1950–60 年代低所得農村出現電視',
    check(snap, text) {
      if (snap.year >= 1970) return [];
      const poorRural = !snap.urban && (snap.incomeAt === 'L' || snap.incomeAt === 'LM');
      const poorUrban = snap.urban && snap.incomeAt === 'L' && snap.year < 1965;
      if (!poorRural && !poorUrban) return [];
      return scan(text, TV_RE, snap, (c) => (c.hypo ? false : `year ${snap.year} ${snap.incomeAt} ${snap.urban ? 'urban' : 'rural'}`));
    },
  },
  {
    id: 'infra', desc: '便利商店、冰箱、冷氣、外送等設施出現得太早（依所得與城鄉延後）',
    check(snap, text) {
      const lag = lagRural(snap);
      const table = [
        [/便利商店|超商/, 1985 + lag], [/外送/, 2012 + lag], [/冷氣(?!團)/, 1970 + lag], [/冰箱/, 1965 + lag],
        [/洗衣機/, 1970 + lag], [/微波爐/, 1990 + lag], [/信用卡/, 1980 + lag], [/筆電|筆記型電腦/, 1995 + lag],
        [/寬頻|光纖/, 2000 + lag], [/健身房/, 1985 + lag], [/自動提款機|ATM/, 1985 + lag], [/電動車/, 2012 + lag],
      ];
      const hits = [];
      for (const [re, th] of table) {
        hits.push(...scan(text, re, snap, (c) => (snap.year < th && !c.hypo ? `year ${snap.year} < ${th} (${snap.incomeAt}${snap.urban ? '' : ' rural'})` : false)));
      }
      return hits;
    },
  },
  {
    id: 'hedge', desc: '把性別寫成括號的模板痕跡（嫁（娶）、他（她））',
    check(snap, text) {
      const m = text.match(/[他她]（[他她]）|嫁（娶）|娶（嫁）|[爸媽]+（[爸媽]+）|丈夫（妻子）|妻子（丈夫）|先生（太太）|兒子（女兒）|女兒（兒子）|阿公（阿嬤）|阿嬤（阿公）|爺爺（奶奶）|奶奶（爺爺）/);
      return m ? [{ word: m[0], sentence: text, why: 'gender hedge' }] : [];
    },
  },
  {
    id: 'univ', desc: '沒念過大學的人回憶或提到自己的大學／學位',
    check(snap, text) {
      if (snap.eduLevel === 'tertiary' || snap.eduLevel === 'graduate' || snap.inSchool) return [];
      if (snap.age < 22) return [];
      return scan(text, UNIV_RE, snap, (c) => {
        if (!c.self) return false;
        if (/沒能|沒上|沒有讀|沒讀|沒念|無法|上不了|錯過|沒機會|供|輟學|夢想|如果|要是|考上|落榜|羨慕|沒有學位|沒有大學|沒進|沒去|讀不起|夢|遺憾|校園裡的|經過|路過|門口|大學生|教授說|邀請|演講|課程|旁聽|夜校|成人|進修|重回|回到學校|報名|註冊|補習班|空中大學|函授|同事|兒|女|孩子|伴侶|丈夫|妻子/.test(c.sentence)) return false;
        return `edu ${snap.eduLevel}(${snap.eduYears})`;
      });
    },
  },
  {
    id: 'secondary', desc: '只讀過小學的人提到自己的中學生活',
    check(snap, text) {
      if (snap.eduYears > 7 || snap.inSchool || snap.age < 17) return [];
      return scan(text, SECOND_RE, snap, (c) => {
        if (!c.self || c.hypo) return false;
        if (/沒能|沒上|沒有讀|沒讀|沒念|無法|上不了|錯過|沒機會|供|輟學|夢想|如果|要是|考上|羨慕|讀不起|夢|遺憾|經過|路過|門口|兒|女|孩子|同事|鄰居|孫|畢業生|畢業的|招生|開學|報名|進修|重回|夜校|補校/.test(c.sentence)) return false;
        return `edu ${snap.eduLevel}(${snap.eduYears})`;
      });
    },
  },
  {
    id: 'gender', desc: '性別與描寫不符（男性懷孕／生產等）',
    check(snap, text) {
      if (snap.gender !== 'M') return [];
      return scan(text, PREG_RE, snap, (c) => (c.self && !/伴侶|太太|妻|老婆|她|媽|母|姊|妹|同事|朋友|嫂|女兒|媳|鄰居|孩子的/.test(c.sentence) ? '男性' : false));
    },
  },
  {
    id: 'siblings', desc: '沒有手足卻提到你的哥哥／妹妹等',
    check(snap, text) {
      if (snap.siblings > 0) return [];
      return scan(text, SIB_RE, snap, (c) => {
        if (!c.self || c.hypo) return false;
        if (c.memory || /[表堂]/.test(c.prefix.slice(-3))) return false; // cousins
        if (!/你的|你家|你有|你和|你跟|你與|你那/.test(c.prefix + c.word) && c.prefix.length) return false;
        return '獨生';
      });
    },
  },
  {
    id: 'age_adult_theme', desc: '兒童出現成人情境（戀愛、酒、菸、婚姻）',
    check(snap, text) {
      if (snap.age >= 12) return [];
      return scan(text, ADULT_THEME_RE, snap, (c) => {
        if (!c.self || c.hypo || c.memory) return false;
        if (/大人|爸|媽|爺|奶|叔|伯|姑|舅|姨|鄰居|村|哥|姊|姐|新聞|電視|廣播|廣告|長輩|親戚|朋友的|老師/.test(c.sentence)) return false;
        return `age ${snap.age}`;
      });
    },
  },
  {
    id: 'age_old_theme', desc: '年輕人出現老年情境（老花、假牙、輪椅、養老院）',
    check(snap, text) {
      if (snap.age >= 50) return [];
      return scan(text, OLD_THEME_RE, snap, (c) => {
        if (!c.self || c.hypo || c.memory) return false;
        if (/爺|奶|公|嬤|婆|外公|外婆|爸|媽|父|母|鄰居|老人|長輩|病人|同事|阿姨|客人|看護|照護|照顧|探望|志工|實習|工作|院裡|護理/.test(c.sentence)) return false;
        return `age ${snap.age}`;
      });
    },
  },
  {
    id: 'festival', desc: '節日、宗教詞與家庭的宗教／傳統不符（尼泊爾印度教徒不會過開齋節、非華人家庭不會過農曆新年，除非是在寫周圍的人）',
    check(snap, text) {
      const key = snap.festivalKey, rel = snap.religion;
      const westernSecular = (rel === 'none' || rel === 'other') && ['EUR', 'NAM', 'OCE', 'LAC'].includes(snap.homeRegion);
      const TERMS = [
        [/開齋節|宰牲節|齋戒月|齋月|開齋/, () => rel === 'muslim', '穆斯林節日'],
        [/排燈節|德賽節|加隆岸節/, () => rel === 'hindu', '印度教節日'],
        [/復活節|平安夜|聖誕|耶誕/, () => rel === 'christian' || key === 'xmas_secular' || key === 'easter' || westernSecular || ['KOR', 'JPN', 'PHL'].includes(snap.home), '基督教節日'],
        [/農曆新年|春節|年夜飯|清明/, () => key === 'lunar', '農曆新年'],
        [/壓歲錢|除夕/, () => key === 'lunar' || key === 'newyear_jp', '新年的壓歲錢與除夕'],
        [/潑水節|柬埔寨新年|寮國新年/, () => key === 'songkran' || key === 'khmer_ny', '東南亞佛教新年'],
        [/衛塞節/, () => key === 'vesak', '衛塞節'],
        [/逾越節/, () => rel === 'jewish', '猶太節日'],
        [/瓦薩基節/, () => rel === 'sikh', '錫克教節日'],
        [/新薯節/, () => key === 'newyam', '新薯節'],
        [/白節|查幹薩爾/, () => key === 'tsagaan', '白節'],
      ];
      const hits = [];
      for (const [re, ok, what] of TERMS) {
        if (ok()) continue;
        hits.push(...scan(text, re, snap, (c) => {
          if (!c.self || c.hypo) return false; // "街上的人也在準備他們的開齋節" is about the others; hypothetical talk is fine
          if (/街上|周圍|四周|身邊的人|鄰居|同事|同學|朋友|當地|電視|新聞|商店|櫥窗|別人|大家都|人們|路過/.test(c.sentence)) return false;
          return `${what}，但家庭的宗教是 ${rel}、節日是 ${key}`;
        }));
      }
      return hits;
    },
  },
  {
    id: 'climate', desc: '雪、颱風、海嘯、出海等詞與居住地的氣候、海岸不符（沿用 data/geo.js 的城市資料）',
    check(snap, text) {
      const hits = [];
      const others = /新聞|電視|廣播|報導|遠方|北方|山上|另一個國家|異國|旅行|度假|滑雪|聽說|書上|照片|明信片/;
      if (!['continental', 'highland', 'polar'].includes(snap.climate)) {
        hits.push(...scan(text, /暴風雪|積雪|下雪|雪地|冰雪|雪鏟|雪人|落雪|飄雪|大雪/, snap, (c) => {
          if (!c.self || c.hypo || c.memory || others.test(c.sentence)) return false;
          return `氣候是 ${snap.climate}`;
        }));
      }
      if (!snap.coast) {
        hits.push(...scan(text, /颱風|颶風|氣旋|(?<!金融)海嘯|漲潮|海平面|出海|漁港|漁船/, snap, (c) => {
          if (!c.self || c.hypo || c.memory || others.test(c.sentence)) return false;
          return '住在內陸';
        }));
      }
      return hits;
    },
  },
  {
    id: 'drink', desc: '不喝酒的人（穆斯林家庭等）出現喝酒、敬酒、宿醉等自己的行為',
    check(snap, text) {
      if (snap.drinks) return [];
      return scan(text, /啤酒|敬酒|乾杯|酒吧|宿醉|喝醉|紅酒|葡萄酒|小酌/, snap, (c) => {
        if (!c.self || c.hypo || c.memory || c.negated) return false;
        if (/拒絕|不喝|沒喝|不碰|滴酒不沾|婉拒|戒|推掉|不勝酒力/.test(c.sentence)) return false;
        return `不喝酒（${snap.religion}）`;
      });
    },
  },
];

RULES.push(AGENCY_RULE); // Phase 6A: no adult-only decisions for people under 15 (tests/lib/rules-agency.mjs)
RULES.push(HOUSEHOLD_RULE); // Phase 6B: no same-place scenes with family who do not live with the person (tests/lib/rules-household.mjs)

// ---------------------------------------------------------------------------------------------
// Allowlist: strict, per rule + event (+ optional word / state condition), always with a reason.
// An entry that never matches in a full run is reported as stale (see runAudit().staleAllow).
// ---------------------------------------------------------------------------------------------

/** { rule, event: 'id' | RegExp, word?: string | RegExp, when?: (snap) => boolean, rare?: true (not reported as stale), reason } */
export const ALLOW = [
  { rule: 'school', event: 'childhood_night_school', reason: 'the event is about a night class for a working child (the classroom is the premise)' },
  { rule: 'school', event: 'childhood_teacher_persuades', rare: true, word: '老師', reason: 'follow-up of the choice "ask the teacher to talk to the family"; the visit happens in the gap between primary and secondary school' },
  { rule: 'toddler', event: 'childhood_new_baby', word: '搖籃', reason: 'the cradle is the new baby sibling\'s, not the player\'s' },
  { rule: 'school', event: 'migration_after_graduation', word: '同學', reason: 'follow-up that narrates the graduation of the studies abroad' },
  { rule: 'climate', event: 'world_hurricane_mitch_1998', word: '颶風', reason: 'the title names the storm; its rains flooded all of Central America, inland as well, and the text describes mudslides and rivers' },
  { rule: 'household', event: /^(world_pandemic_work|world_energy_prices_2022|health_alcohol_problem|health_miscarriage|health_disability_adaptation|health_flu_season|health_clinic_far|seed_child_school_choice|regional_culture_pilgrimage|regional_festival|regional_remittance_day|regional_bed_nets|regional_wildfire_season)$/, rare: true, reason: 'Phase 6B: events of files owned by 6A (health, seed, world, regional) that still put the family in the room of a person who lives alone abroad or whose children / partner live elsewhere; listed for the 6C pass (PLAN.md "Phase 6B notes"), remove this entry when they are fixed' },
  { rule: 'school', event: 'world_china_after_cr', reason: 'news-level description of schools reopening nationwide, not the player\'s own class' },
];

function allowed(flag, allow) {
  for (const a of allow) {
    if (a.rule !== flag.rule) continue;
    if (a.event instanceof RegExp ? !a.event.test(flag.id) : a.event !== flag.id) continue;
    if (a.word && (a.word instanceof RegExp ? !a.word.test(flag.word) : a.word !== flag.word)) continue;
    if (a.when && !a.when(flag.snap)) continue;
    a.used = (a.used || 0) + 1;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Whole-life checks
// ---------------------------------------------------------------------------------------------

const YEARLY_REPEAT_GAP = 4; // the engine reuses a line only once every line that fits the life state has been used (see pickYearly)

/** "First time" milestones that can be told only once in a life, whichever event tells them. */
const FIRST_CLAIMS = [
  ['第一支智慧型手機', /第一支智慧型手機|第一支能上網的手機|終於有了一支智慧型手機/],
  ['第一支行動電話', /第一支行動電話|人生中的第一支手機|買了一張預付卡/],
  ['家裡的第一台電視', /家裡終於買了一台電視|客廳裡那台電視成了全家/],
  ['第一次上網', /連上了網路|網路咖啡廳|數據機發出尖銳|家裡裝了寬頻/],
];

/** Per-life checks that are not about one text: repetition, feed density, quiet stretches. */
export function lifeChecks(s, rows) {
  const out = [];
  const seenText = new Map();
  for (const { entry, id } of rows) {
    if (entry.kind === 'death' || entry.kind === 'milestone' && id.startsWith('sys:')) continue;
    const key = entry.kind === 'year' ? `Y|${entry.text}` : `${entry.kind}|${entry.title}|${entry.text}`;
    // an ordinary-year line may come back after a whole generation (25 years); a word-for-word event may not
    if (seenText.has(key) && (entry.kind !== 'year' || entry.age - seenText.get(key) < YEARLY_REPEAT_GAP)) out.push({ rule: entry.kind === 'year' ? 'dup_year' : 'dup_event', id, word: entry.title || entry.text.slice(0, 12), sentence: entry.text, snap: null, why: `again at ${seenText.get(key)}` });
    seenText.set(key, entry.age);
  }
  // the same "first time" told twice
  const firstSeen = new Map();
  for (const { entry, id } of rows) {
    if (entry.kind === 'death') continue;
    const txt = `${entry.title} ${entry.text}`;
    for (const [name, re] of FIRST_CLAIMS) {
      if (!re.test(txt)) continue;
      if (firstSeen.has(name) && firstSeen.get(name).id !== id) out.push({ rule: 'first_twice', id, word: name, sentence: entry.text, snap: null, why: `also at ${firstSeen.get(name).age} (${firstSeen.get(name).id})` });
      else if (!firstSeen.has(name)) firstSeen.set(name, { age: entry.age, id });
    }
  }
  // density
  const perYear = new Map();
  for (const { entry } of rows) {
    if (entry.kind === 'death') continue;
    perYear.set(entry.year, (perYear.get(entry.year) || 0) + (entry.kind === 'choice' ? 0 : 1));
  }
  out.perYear = perYear;
  // up to 4 non-choice entries in a year is tolerated (a milestone on top of two events); the share of such years is
  // measured separately, 5 or more is a flag
  for (const [y, n] of perYear) if (n > 4) out.push({ rule: 'density', id: `year:${y}`, word: `${n}`, sentence: `${n} entries in ${y}`, snap: null, why: `${n} entries` });
  // quiet stretches: a calendar year without any entry
  const years = new Set(rows.map((r) => r.entry.year));
  for (let y = s.birthYear; y < s.birthYear + s.age; y++) if (!years.has(y)) out.push({ rule: 'quiet', id: `year:${y}`, word: `${y}`, sentence: `no entry in ${y}`, snap: null, why: 'quiet year' });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Audit driver
// ---------------------------------------------------------------------------------------------

const ERAS = ['past', 'present', 'future'];

/** Deterministic life configurations: eras x draw modes x (every k-th life forced to a country for coverage). */
export function lifeConfigs(n, { prefix = 'coh', countries = null, offset = 0, stress = false, novelty = false, migrant = false } = {}) {
  const out = [];
  const ids = novelty ? ALL_EVENTS.filter((e) => e.variants).map((e) => e.id).concat(YEARLY.map((y, i) => (y.variants ? `yearly:${i}` : null)).filter(Boolean)) : null;
  for (let i = 0; i < n; i++) {
    const j = i + offset;
    const settings = { era: ERAS[j % 3], drawMode: (j >> 1) % 2 === 0 ? 'births' : 'population' };
    const opts = {};
    if (countries && j % 4 === 3) opts.countryCode = countries[Math.floor(j / 4) % countries.length];
    if (stress) { const st = stressFor(j); if (st) opts.stress = st; }
    if (migrant) { const m = migrantStressFor(j); if (m) opts.stress = { ...(opts.stress || {}), migrant: m }; } // Phase 6B
    if (ids && j % 4) opts.novelty = Object.fromEntries(ids.map((id) => [id, j % 4])); // counts 1..3 rotate every phrasing
    out.push({ settings, seed: `${prefix}-${j}`, opts });
  }
  return out;
}

/** The family-stress scenario of life number j (deterministic): 7 in 8 lives lose somebody early; the rest stay natural. */
export function stressFor(j) {
  const h = (k) => { let x = (j * 2654435761 + k * 40503) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; return (x ^ (x >>> 15)) >>> 0; };
  const age = (k, lo, hi) => lo + (h(k) % (hi - lo + 1));
  switch (j % 8) {
    case 0: return null;
    case 1: return { mother: age(1, 4, 40), father: age(2, 4, 40) }; // orphaned at some age
    case 2: return { mother: age(3, 8, 60) };
    case 3: return { father: age(4, 8, 60) };
    case 4: return { mother: age(5, 20, 45), father: age(6, 20, 45), partner: [age(7, 40, 70), 'widowed'] };
    case 5: return { mother: age(8, 30, 55), father: age(9, 30, 55), kid: age(10, 25, 60) };
    case 6: return { mother: age(11, 22, 50), partner: [age(12, 28, 55), 'divorced'] };
    default: return { mother: age(13, 4, 22), father: age(14, 4, 22) }; // orphaned in childhood or youth
  }
}

/**
 * Play the configured lives and collect flags.
 * @returns {{ flags: object[], raw: object[], stats: object, staleAllow: object[] }}
 */
export function runAudit(configs, { allow = ALLOW, rules = RULES, checkLife = true, keepLives = null } = {}) {
  for (const a of allow) a.used = 0;
  const raw = [];
  const stats = { lives: 0, years: 0, years4: 0, entries: 0, choices: [], adultChoices: [], maxPerYear: 0, eventsSeen: new Set(), perRule: {} };
  for (const cfg of configs) {
    const { s, rows } = playAudited(cfg.settings, cfg.seed, cfg.opts);
    stats.lives++;
    stats.entries += rows.length;
    const ch = rows.filter((r) => r.entry.kind === 'choice').length;
    stats.choices.push(ch);
    if (s.age >= 18) stats.adultChoices.push(ch);
    for (const r of rows) if (!r.id.startsWith('sys:') && !r.id.startsWith('yearly:')) stats.eventsSeen.add(r.id);
    for (const { entry, id, pre, post } of rows) {
      if (!post) continue;
      const text = `${entry.title && entry.kind !== 'year' && !/^\d+ 歲$/.test(entry.title) ? entry.title + '。' : ''}${entry.text}`;
      for (const rule of rules) {
        // A text is only a contradiction when it does not fit the state before NOR after the event's effects
        // (an event may well describe the job or partner it is about to give you).
        const hitsPost = rule.check(post, text);
        if (!hitsPost.length) continue;
        const keys = new Set(rule.check(pre, text).map((h) => h.word + '|' + h.sentence));
        for (const hit of hitsPost) {
          if (!keys.has(hit.word + '|' + hit.sentence)) continue;
          raw.push({ rule: rule.id, id, word: hit.word, sentence: hit.sentence, why: hit.why, snap: post, seed: cfg.seed, settings: cfg.settings, age: entry.age, year: entry.year, kind: entry.kind, title: entry.title });
        }
      }
    }
    if (checkLife) {
      const lc = lifeChecks(s, rows);
      for (const n of lc.perYear.values()) { stats.years++; if (n >= 4) stats.years4++; }
      for (const f of lc) raw.push({ ...f, seed: cfg.seed, settings: cfg.settings, age: 0, year: 0, kind: '', title: '' });
    }
    if (keepLives) keepLives(s, rows, cfg);
  }
  const flags = raw.filter((f) => !allowed(f, allow));
  for (const f of flags) stats.perRule[f.rule] = (stats.perRule[f.rule] || 0) + 1;
  const staleAllow = allow.filter((a) => !a.used);
  return { flags, raw, stats, staleAllow };
}

/** Group flags by rule / event id / word for reports. */
export function groupFlags(flags) {
  const g = new Map();
  for (const f of flags) {
    const k = `${f.rule}|${f.id}|${f.word}`;
    if (!g.has(k)) g.set(k, { rule: f.rule, id: f.id, word: f.word, n: 0, sample: f });
    g.get(k).n++;
  }
  return [...g.values()].sort((a, b) => a.rule.localeCompare(b.rule) || b.n - a.n);
}
