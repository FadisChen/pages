// Eulogy (生平, PLAN 5.3): js/engine/eulogy.js
//
// 3000 lives are played and every eulogy is checked: non-empty, no template residue, 60-260 characters, 3-5 sentences, the
// same text on every call (and after the album's normalisation), and no contradiction with the state of the person. The
// coherence rules of tests/lib/coherence.mjs are reused (the eulogy is turned into second person first, because the rules
// look for "you"), and eulogy-specific rules are added: nothing about work or a partner for a child, no partner words
// when there never was a partner, no children when there were none, only the person's own years and countries, only the
// cause of death (or the illnesses) the person had, no method in a suicide.
//
// Run with: node --test tests/eulogy.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import { createLife, advanceYear } from '../js/engine/life.js';
import { getSummary } from '../js/engine/summary.js';
import { composeEulogy, eulogyOf, factsOf, TEMPLATES, EULOGY_VERSION } from '../js/engine/eulogy.js';
import { normalizeSummary } from '../js/storage.js';
import { COUNTRIES } from '../js/data/countries.js';
import { RULES, snapshot, lifeConfigs } from './lib/coherence.mjs';
import { scaled } from './lib/scale.mjs';

const N_LIVES = scaled(3000, 800, 300); // (`npm run test:quick` plays fewer lives)
const ALL_CODES = COUNTRIES.map((c) => c.code);
const COUNTRY_NAMES = COUNTRIES.map((c) => c.name).sort((a, b) => b.length - a.length);

// ---------------------------------------------------------------------------------------------
// The corpus: every life is played once and shared by all tests
// ---------------------------------------------------------------------------------------------

let corpus = null;
function lives() {
  if (corpus) return corpus;
  corpus = [];
  for (const cfg of lifeConfigs(N_LIVES, { prefix: 'eul', countries: ALL_CODES })) {
    const s = createLife(cfg.settings, cfg.seed, cfg.opts);
    let g = 0;
    while (s.alive && g++ < 140) advanceYear(s, { auto: true });
    const sum = getSummary(s);
    corpus.push({ seed: cfg.seed, sum, snap: snapshot(s), eu: sum.eulogy, jobIds: [...(s.flags._jobs || [])] });
  }
  return corpus;
}

const SENT = /[。！？]/g;
const sentences = (t) => (t.match(SENT) || []).length;
const TOKENS = /undefined|NaN|\[object|\bnull\b|\{\{|\}\}|\$\{|%s|=>/;
const PUNCT = /[，。、；：]{2}|；。|，。|。，|；，|，；|\s{2}/;

/** A summary with a few fields replaced (deep copy first). */
function make(over = {}) {
  const base = {
    name: '陳美玲', gender: 'F', birthYear: 1962, deathYear: 2044, age: 82, era: 'past',
    homeCountry: { code: 'TWN', name: '台灣' }, countryName: '台灣', urbanBirth: false, birthCity: '台南',
    wealthQ: 2, wealthShort: '清寒', cause: { id: 'cancer', label: '癌症', text: '因癌症離世。' }, suicide: false,
    lifespan: { age: 82, countryLe: 80.4, worldLe: 64, vsCountry: 1.6, vsWorld: 18 },
    education: { level: 'secondary', label: '中學', years: 9 }, jobs: ['工廠作業員', '小店老闆'], lastJob: '小店老闆', yearsWorked: 40,
    partner: { name: '林志明', status: 'widowed' }, marriages: 1, divorces: 0,
    children: { total: 2, alive: 2, names: ['林雅婷', '林俊宏'] }, countriesLived: ['台灣'], conditions: [], smoker: false,
    focusTimeline: [{ fromAge: 0, toAge: 17, focus: 'balance', label: '平衡' }, { fromAge: 18, toAge: 60, focus: 'family', label: '家庭' }, { fromAge: 61, toAge: 82, focus: 'health', label: '健康' }],
    highlights: [{ age: 24, year: 1986, text: '與林志明結婚。' }, { age: 26, year: 1988, text: '第一個孩子林雅婷出生。' }, { age: 70, year: 2032, text: '林志明離世。' }, { age: 78, year: 2040, text: '靜靜地看完了這一生的老照片。' }],
    stats: {}, statHistory: [{ age: 0, health: 80, happiness: 60, knowledge: 2, wealth: 30, social: 50 }],
  };
  return { ...base, ...over };
}

// ---------------------------------------------------------------------------------------------
// 1. The phrasing tables
// ---------------------------------------------------------------------------------------------

test('every sentence slot has at least four phrasings', () => {
  const bad = [];
  let tables = 0;
  const visit = (x, path) => {
    if (Array.isArray(x)) { tables++; if (x.length < 4) bad.push(`${path}: ${x.length}`); return; }
    if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) visit(v, `${path}.${k}`);
  };
  for (const [k, group] of Object.entries(TEMPLATES)) group.forEach((tbl, i) => visit(tbl, `${k}[${i}]`));
  assert.ok(tables > 60, `only ${tables} phrasing tables`);
  assert.deepEqual(bad, [], `phrasing tables with fewer than four entries: ${bad.join(', ')}`);
});

// ---------------------------------------------------------------------------------------------
// 2. The corpus: form
// ---------------------------------------------------------------------------------------------

test('3000 lives: every eulogy is present, clean, 60-260 characters and 3-5 sentences; the share version is 1-2 short sentences', () => {
  const L = lives();
  assert.equal(L.length, N_LIVES);
  const bad = [];
  const shapes = {};
  for (const { seed, sum, eu } of L) {
    shapes[eu.shape] = (shapes[eu.shape] || 0) + 1;
    const t = eu.text, sh = eu.short;
    const why = [];
    if (eu.v !== EULOGY_VERSION) why.push('version');
    if (!t || typeof t !== 'string') why.push('empty');
    else {
      if (TOKENS.test(t) || TOKENS.test(sh)) why.push('token');
      if (PUNCT.test(t) || PUNCT.test(sh)) why.push('punct');
      const n = [...t].length;
      if (n < 60 || n > 260) why.push(`length ${n}`);
      const k = sentences(t);
      if (k < 3 || k > 5) why.push(`${k} sentences`);
      if (!t.endsWith('。')) why.push('no final stop');
      if (!sum.name || !t.includes(sum.name)) why.push('name missing');
      const sl = [...sh].length, sk = sentences(sh);
      if (sl < 8 || sl > 60 || sk < 1 || sk > 2) why.push(`short ${sl} chars / ${sk} sentences`);
    }
    if (why.length) bad.push(`${seed} (${sum.name}, ${sum.age}): ${why.join('; ')}\n   ${t}\n   ${sh}`);
  }
  assert.equal(bad.length, 0, `${bad.length} bad eulogies, first:\n${bad.slice(0, 4).join('\n')}`);
  // the corpus has to contain every tone, or the checks below prove little
  // (calamity is rare: the 800 lives of a quick run hold 6 to 9 of them, the 3000 of a complete run about 30)
  for (const s of ['infant', 'child', 'youth', 'calamity', 'migrant', 'hard', 'long', 'quiet']) assert.ok((shapes[s] || 0) >= (s === 'calamity' ? scaled(8, 4, 4) : 8), `shape ${s} seen ${shapes[s] || 0} times: ${JSON.stringify(shapes)}`);
});

test('the same life gives the same words: repeated calls, the stored summary, and the album-normalised summary', () => {
  const L = lives();
  for (const { sum, eu } of L.slice(0, 600)) {
    const plain = { ...sum };
    delete plain.eulogy;
    assert.deepEqual(composeEulogy(plain), eu, 'composing again changes nothing');
    assert.equal(eulogyOf({ summary: sum }).text, eu.text, 'a stored eulogy is used as it is');
    const norm = normalizeSummary(JSON.parse(JSON.stringify(plain)));
    assert.equal(eulogyOf({ summary: norm }).text, eu.text, `an old record without a stored eulogy (normalised) gets the same text (${sum.name})`);
    assert.equal(eulogyOf({ summary: norm }).short, eu.short);
  }
  // another life, another text; a reload (new objects, same facts) the same
  const a = composeEulogy(make()), b = composeEulogy(JSON.parse(JSON.stringify(make())));
  assert.deepEqual(a, b);
  assert.notEqual(a.text, composeEulogy(make({ name: '黃淑芬' })).text);
});

test('the phrasing is chosen by a stable hash, not by chance: a different life of the same shape usually reads differently', () => {
  const texts = new Set();
  for (let i = 0; i < 40; i++) texts.add(composeEulogy(make({ name: `人${i}`, birthYear: 1950 + i })).text.replace(/人\d+/g, 'N').replace(/\d{4}/g, 'Y'));
  assert.ok(texts.size >= 15, `only ${texts.size} different texts out of 40 near-identical lives`);
});

test('50 random lives: the opening sentence is not the same for more than 30% of them', () => {
  const L = lives();
  const pick = [];
  for (let i = 0; i < 50; i++) pick.push(L[(i * 59 + 7) % L.length]);
  const mask = (x) => x.eu.text.split('。')[0].replace(x.sum.name, 'N').replace(/\d+/g, '#').replace(new RegExp(x.sum.homeCountry.name, 'g'), 'C').replace(x.sum.birthCity || '@@', 'P');
  for (const [label, key] of [['wording', mask], ['template', (x) => x.eu.opening]]) {
    const count = {};
    for (const x of pick) count[key(x)] = (count[key(x)] || 0) + 1;
    const top = Math.max(...Object.values(count));
    assert.ok(top <= 15, `${top} of 50 openings share the same ${label}: ${JSON.stringify(Object.entries(count).sort((a, b) => b[1] - a[1])[0])}`);
  }
  // over the whole corpus no single opening template (per kind) takes more than a third
  const tally = {};
  for (const x of L) tally[x.eu.opening] = (tally[x.eu.opening] || 0) + 1;
  const kinds = {};
  for (const [k, v] of Object.entries(tally)) { const kind = k.split(':')[0]; kinds[kind] = kinds[kind] || { n: 0, max: 0 }; kinds[kind].n += v; kinds[kind].max = Math.max(kinds[kind].max, v); }
  for (const [kind, v] of Object.entries(kinds)) if (v.n >= 60) assert.ok(v.max / v.n <= 0.34, `${kind}: one opening takes ${(100 * v.max / v.n).toFixed(0)}%`);
});

// ---------------------------------------------------------------------------------------------
// 3. The corpus: no contradiction (the coherence rules, then the eulogy-specific ones)
// ---------------------------------------------------------------------------------------------

/** The eulogy is about "he/she"; the coherence rules look for "you". Turn one into the other. */
function toYou(text, sum) {
  return text.split(sum.name).join('你').replace(/[他她]/g, '你');
}

// event-flavoured rules that are not about a person's whole life
const SKIP_RULES = new Set(['festival', 'climate', 'coast', 'drinks', 'religion', 'infra']);

test('3000 lives: the coherence rules (work, partner, kids, school, retirement, technology ...) find nothing in the eulogy or the card text', () => {
  const L = lives();
  const rules = RULES.filter((r) => !SKIP_RULES.has(r.id));
  assert.ok(rules.length >= 15);
  const found = [];
  for (const { seed, sum, snap, eu, jobIds } of L) {
    for (const [what, text] of [['text', eu.text], ['short', eu.short]]) {
      const you = toYou(text, sum);
      // the state at death does not remember a marriage that ended (the partner field is cleared by a later break-up)
      const snapH = { ...snap, everPartner: snap.everPartner || !!sum.marriages || sum.children.total > 0 || !!sum.partner, everMarried: snap.everMarried || !!sum.marriages };
      for (const rule of rules) {
        let hits = rule.check(snapH, you);
        // a marriage that ended leaves no partner in the state
        if (hits.length && sum.marriages > 0 && !snap.partner && /^(partner|partner_gone|spouse_early|spouse_gender)$/.test(rule.id)) hits = [];
        // a eulogy tells the whole career: a factory is fine when the person worked in one at some time
        if (hits.length && (rule.id === 'job_noun' || rule.id === 'work_self') && jobIds.length > 1) {
          const all = jobIds.map((j) => rule.check({ ...snap, job: j, status: rule.id === 'work_self' ? 'self' : 'employed', employed: true }, you).length);
          if (all.some((n) => n === 0)) hits = [];
        }
        for (const h of hits) found.push(`${rule.id} ${what} ${seed} (age ${sum.age}): "${h.word}" in 「${h.sentence}」 ${h.why || ''}`);
      }
    }
  }
  assert.equal(found.length, 0, `${found.length} coherence flags, first:\n${found.slice(0, 8).join('\n')}`);
});

const WORK_WORDS = /工作|上班|職業|職涯|事業|創業|退休|薪|賺錢|老闆|同事|當過|做過|從.{1,8}做起|以.{1,8}為業|謀生|生計|營生/;
const PARTNER_WORDS = /伴侶|相伴|攜手|成了家(?![人裡務])|成家|守著一個家|交往|婚|夫妻|配偶|兩人|分開之後/;
const KID_WORDS = /孩子|子女|兒子|女兒|兒女|孫|拉拔|養育|育有|養大|父母/;
const SELF_CHILD = /家庭的孩子|這個孩子|還是孩子|孩子的年紀|孩子的時候|好好當孩子|一個孩子的離開|只是個孩子|被家人|孩子/;
const ACHIEVE = /成就|成功|畢業|學位|文憑|升遷|創業|貢獻|榮耀|事業|成績|考上|國考/;

const CAUSE_WORDS = [
  [/癌/, (c, k) => c === 'cancer' || k.includes('cancer')],
  [/心臟|心血管/, (c, k) => c === 'cvd' || k.includes('heart_disease')],
  [/中風|腦血管/, (c) => c === 'stroke'],
  [/失智/, (c, k) => c === 'dementia' || k.includes('dementia')],
  [/肺炎|肺部感染|呼吸道/, (c) => c === 'lri'],
  [/慢性肺|阻塞性/, (c, k) => c === 'copd' || k.includes('copd')],
  [/糖尿病/, (c, k) => c === 'diabetes' || k.includes('diabetes')],
  [/腎/, (c) => c === 'kidney'],
  [/肝/, (c) => c === 'liver'],
  [/瘧疾/, (c) => c === 'malaria'],
  [/愛滋|免疫系統/, (c) => c === 'hiv'],
  [/結核/, (c) => c === 'tb'],
  [/溺水|被水奪走/, (c) => c === 'drowning'],
  [/車禍|交通/, (c) => c === 'road'],
  [/戰火|戰亂|戰事|戰爭|武裝/, (c, k, f) => c === 'conflict' || f.route.flight || f.hard.some((h) => h.id === 'displaced')],
  [/災難|天災|災害|廢墟/, (c) => c === 'disaster'],
  [/暴力/, (c) => c === 'homicide'],
  [/生產|孕產|懷孕/, (c) => c === 'maternal'],
  [/營養不良|吃不飽|飢餓/, (c) => c === 'malnutrition'],
  [/腹瀉|腸/, (c) => c === 'diarrhea'],
  [/新生兒|早產|出生時|最初的日子/, (c) => c === 'neonatal'],
  [/憂鬱/, (c, k) => k.includes('depression')],
  [/疫情/, (c, k, f, sum) => sum.highlights.some((h) => /疫情/.test(h.text))],
];

const knownAges = (sum) => new Set([sum.age, Math.round(sum.lifespan.countryLe), ...sum.highlights.map((h) => h.age)]);

test('3000 lives: the eulogy agrees with the facts of the life (children, partner, work, years, countries, cause of death)', () => {
  const L = lives();
  const problems = [];
  const flag = (seed, sum, what, text) => problems.push(`${what} — ${seed} (${sum.name}, age ${sum.age}, ${sum.cause && sum.cause.id}): ${text}`);
  for (const { seed, sum, eu } of L) {
    const t = eu.text, f = factsOf(sum);
    for (const [label, text] of [['text', t], ['short', eu.short]]) {
      const x = text;
      // a person under 15: no work, no partner, no children, no achievements
      if (sum.age < 15) {
        if (WORK_WORDS.test(x)) flag(seed, sum, `${label}: work words for a child`, x);
        if (PARTNER_WORDS.test(x)) flag(seed, sum, `${label}: partner words for a child`, x);
        if (/孫|拉拔|養育|育有|養大/.test(x)) flag(seed, sum, `${label}: children for a child`, x);
        if (ACHIEVE.test(x)) flag(seed, sum, `${label}: achievements for a child`, x);
        if (/一輩子|晚年|漫長|高齡|餘生|一生很長/.test(x)) flag(seed, sum, `${label}: old-age words for a child`, x);
      }
      // no partner ever: no partner words (except "no marriage")
      if (sum.age >= 15 && !sum.partner && !sum.marriages) {
        const y = x.replace(/一生沒有結婚|沒有結婚|一生未婚|未婚/g, '');
        if (PARTNER_WORDS.test(y)) flag(seed, sum, `${label}: partner words without a partner`, x);
      }
      // no children: none mentioned (except "no children")
      if (sum.age >= 15 && !sum.children.total) {
        let y = x.replace(/沒有孩子|一生沒有孩子|身邊沒有孩子|家庭的孩子|這個孩子|還是孩子的年紀|還是孩子的時候|好好當孩子|被家人|手足的孩子|手足那邊的小輩/g, '');
        for (const nm of [sum.name, sum.partner && sum.partner.name].filter(Boolean)) y = y.split(nm).join(''); // (孫 is also a family name)
        if (KID_WORDS.test(y)) flag(seed, sum, `${label}: children without children`, x);
      }
      // children named are the person's own, the partner named is the last partner
      for (const n of sum.children.names) if (n && x.includes(n) && !sum.children.total) flag(seed, sum, `${label}: names a child that never was`, x);
      // work words only with a job (or work at all)
      if (sum.age >= 15 && !sum.jobs.length && /做過|當過|以.{1,8}為業/.test(x)) flag(seed, sum, `${label}: a job that never was`, x);
      // years
      for (const y of x.match(/\d{4}年/g) || []) if (![sum.birthYear, sum.deathYear].includes(Number(y.slice(0, 4)))) flag(seed, sum, `${label}: a foreign year ${y}`, x);
      // ages
      const ok = knownAges(sum);
      for (const m of x.matchAll(/(\d+)歲/g)) if (!ok.has(Number(m[1]))) flag(seed, sum, `${label}: an unknown age ${m[1]}`, x);
      if (sum.age >= 1 && label === 'text' && !new RegExp(`${sum.age}歲|${sum.age}年`).test(x)) flag(seed, sum, `${label}: does not give the age at death`, x);
      if (sum.age < 1 && /享年/.test(x)) flag(seed, sum, `${label}: "享年" for a newborn`, x);
      // countries: only home and the countries lived in
      let rest = sum.birthCity ? x.split(sum.birthCity).join('') : x;
      const allowed = new Set([sum.homeCountry.name, ...sum.countriesLived]);
      for (const n of COUNTRY_NAMES) if (allowed.has(n)) rest = rest.split(n).join('');
      for (const n of COUNTRY_NAMES) if (n.length >= 2 && rest.includes(n) && !allowed.has(n)) { flag(seed, sum, `${label}: a country the person never lived in (${n})`, x); break; }
      if (label === 'text' && !x.includes(sum.homeCountry.name)) flag(seed, sum, `${label}: the home country is not named`, x);
      // a city that is not the birth city
      if (label === 'text' && sum.birthCity && sum.birthCity !== sum.homeCountry.name && !x.includes(sum.birthCity)) flag(seed, sum, `${label}: the birth city is not named`, x);
      // cause of death words
      const k = sum.conditions || [];
      for (const [re, okFn] of CAUSE_WORDS) if (re.test(x) && !okFn(sum.cause && sum.cause.id, k, f, sum)) flag(seed, sum, `${label}: cause words (${re}) that do not belong to this life`, x);
      // shape / tone
      if (sum.age >= 85 && /早逝|太早|年輕就|才\d+歲|只活了|少走了/.test(x)) flag(seed, sum, `${label}: "too young" words for a very old person`, x);
      if (sum.age < 40 && /一輩子|晚年|漫長|高齡|餘生|大半輩子|一生很長/.test(x)) flag(seed, sum, `${label}: old-age words before forty`, x);
      if (sum.age < 40 && /抱過孫輩|孫輩/.test(x) && !sum.highlights.some((h) => /孫輩/.test(h.text))) flag(seed, sum, `${label}: grandchildren without grandchildren`, x);
      if (/孫輩/.test(x) && !sum.highlights.some((h) => /孫輩/.test(h.text))) flag(seed, sum, `${label}: grandchildren the life never had`, x);
      // a suicide: restraint, no method, not even the word
      if (sum.suicide) {
        if (/自殺|自盡|輕生|上吊|繩|藥|跳|槍|割|燒炭|服用|過量|墜|毒|瓦斯|刀|溺|吞/.test(x)) flag(seed, sum, `${label}: suicide told with a method or the word`, x);
        if (/平均/.test(x) && label === 'text') flag(seed, sum, `${label}: the average-lifespan comparison after a suicide`, x);
      }
    }
    // the name of the partner, when named, is the partner's; divorced: no "present tense" companionship words
    if (sum.partner && sum.partner.status === 'divorced' && /身邊有.*相伴|攜手同行|一起守著一個家/.test(t)) flag(seed, sum, 'divorced person with a companion', t);
    if (sum.partner && sum.partner.status === 'dating' && !sum.marriages && /成了家|守著一個家|婚姻/.test(t)) flag(seed, sum, 'dating person described as married', t);
    // children lost: told when some died, never when none did
    if (sum.children.total && sum.children.alive === sum.children.total && /個孩子先走了一步|個孩子沒能陪著走到最後|送走了[一二兩三四五六七八九十\d]+個孩子|送走了每一個孩子|比自己更早離開|孩子們一個接一個|孩子都比/.test(t)) flag(seed, sum, 'a child lost that was not', t);
    // a refugee's text names the war or the flight; a child marriage is told
    if (sum.age >= 15 && (f.route.flight || f.hard.some((h) => h.id === 'displaced')) && !/戰|流離|避難/.test(t)) flag(seed, sum, 'a refugee whose flight is not told', t);
    if (f.hard.some((h) => h.id === 'childMarriage') && !/成了家|婚姻|婚事|成家/.test(t)) flag(seed, sum, 'a child marriage that is not told', t);
    // the average comparison is there for every cause but suicide
    if (!sum.suicide && !/平均/.test(t)) flag(seed, sum, 'no comparison with the national average', t);
  }
  assert.equal(problems.length, 0, `${problems.length} contradictions, first:\n${problems.slice(0, 10).join('\n')}`);
});

test('the eulogy uses the concrete facts: the city, the job, the children, the route, the focus (coverage over the corpus)', () => {
  const L = lives();
  const grown = L.filter((x) => x.sum.age >= 25);
  const share = (arr, fn) => arr.filter(fn).length / Math.max(1, arr.length);
  // every adult eulogy names the birth city or village
  assert.ok(share(grown, (x) => !x.sum.birthCity || x.eu.text.includes(x.sum.birthCity)) > 0.98, 'the birth city is named');
  // children are named when natural: up to three names per life, whenever the life had children and room
  const parents = grown.filter((x) => x.sum.children.total > 0 && x.sum.children.names.length);
  assert.ok(share(parents, (x) => x.eu.text.includes(x.sum.children.names[0])) > 0.9, 'a child is named');
  // jobs: named when the life had them (room permitting)
  const workers = grown.filter((x) => x.sum.jobs.length);
  assert.ok(share(workers, (x) => x.sum.jobs.some((j) => x.eu.text.includes(j))) > 0.85, 'a job is named');
  // migrants: the route is told
  const migrants = grown.filter((x) => x.sum.countriesLived.length > 1);
  assert.ok(migrants.length > 40);
  assert.ok(share(migrants, (x) => x.sum.countriesLived.slice(1).some((c) => x.eu.text.includes(c)) || /個國家|回到|返回|家鄉|流離/.test(x.eu.text)) > 0.85, 'the move abroad is told');
  // a focus kept for a decade or more appears for a good part of them
  const focused = grown.filter((x) => factsOf(x.sum).focus);
  assert.ok(focused.length > 100);
  assert.ok(share(focused, (x) => /重心|心思|心裡擺在最前面/.test(x.eu.text)) > 0.25, 'the focus is told for some');
  // hardship lives sound like hardship, and the very old sound old
  const hard = L.filter((x) => x.eu.shape === 'hard');
  assert.ok(share(hard, (x) => /苦|吃力|重量|命運|客氣|記得|接住/.test(x.eu.text)) > 0.95);
  const long = L.filter((x) => x.eu.shape === 'long');
  assert.ok(share(long, (x) => /漫長|很長|長長|這麼長|長到|高齡|活到了|記得/.test(x.eu.text)) > 0.9);
});

// ---------------------------------------------------------------------------------------------
// 4. Tone, by hand-made lives
// ---------------------------------------------------------------------------------------------

test('an infant: gentle, about the people who loved her, nothing about work, partners or achievements', () => {
  const sum = make({ name: '阿米娜', gender: 'F', age: 0, birthYear: 2026, deathYear: 2026, homeCountry: { code: 'NER', name: '尼日' }, countryName: '尼日', birthCity: '尼亞美', urbanBirth: false, wealthQ: 1, wealthShort: '赤貧', cause: { id: 'neonatal', label: '新生兒狀況', text: '' }, lifespan: { age: 0, countryLe: 61.4, worldLe: 69.6, vsCountry: -61.4, vsWorld: -69.6 }, education: { level: 'none', label: '未受正式教育', years: 0 }, jobs: [], lastJob: null, yearsWorked: 0, partner: null, marriages: 0, children: { total: 0, alive: 0, names: [] }, highlights: [], focusTimeline: [] });
  const e = composeEulogy(sum);
  assert.equal(e.shape, 'infant');
  assert.ok(/尼亞美/.test(e.text) && /尼日/.test(e.text) && /阿米娜/.test(e.text) && /2026/.test(e.text));
  assert.ok(/家人|愛/.test(e.text), 'the people who loved her');
  assert.ok(!WORK_WORDS.test(e.text) && !PARTNER_WORDS.test(e.text) && !ACHIEVE.test(e.text) && !/享年/.test(e.text), e.text);
  assert.ok(/不滿一歲|還不滿一歲|沒能過第一個生日|才剛來到世上/.test(e.text));
  assert.ok(/平均/.test(e.text), 'the comparison is gentle but there');
  assert.ok([...e.text].length >= 60, 'long enough');
  for (const ageWord of ['歲那年', '享年']) assert.ok(!e.text.includes(ageWord), ageWord);
});

test('a child: gentle, the stage of life, no work, no partner, no achievement', () => {
  for (const [age, years] of [[2, 0], [4, 0], [8, 3], [8, 0], [13, 7]]) {
    const e = composeEulogy(make({ name: '小宇', gender: 'M', age, deathYear: 1962 + age, birthYear: 1962, wealthQ: 3, wealthShort: '小康', cause: { id: 'lri', label: '下呼吸道感染', text: '' }, education: { level: years ? 'primary' : 'none', label: '', years }, jobs: ['攤販'], lastJob: '攤販', yearsWorked: 3, partner: null, marriages: 0, children: { total: 0, alive: 0, names: [] }, highlights: [{ age: 6, year: 1968, text: '很小就開始工作。' }], lifespan: { age, countryLe: 70, worldLe: 64, vsCountry: -66, vsWorld: -60 } }));
    assert.equal(e.shape, 'child');
    assert.ok(!WORK_WORDS.test(e.text) && !PARTNER_WORDS.test(e.text) && !ACHIEVE.test(e.text), e.text);
    assert.ok(new RegExp(`${age}歲|${age}年`).test(e.text), e.text);
    assert.ok(e.text.includes('台南'), e.text);
    assert.ok(/肺/.test(e.text));
  }
});

test('a suicide: restrained, no method, not even the word, no comparison, and the closing is about being remembered', () => {
  const e = composeEulogy(make({ age: 31, deathYear: 1993, cause: { id: 'suicide', label: '自殺', text: '' }, suicide: true, partner: null, marriages: 0, children: { total: 0, alive: 0, names: [] }, lifespan: { age: 31, countryLe: 72, worldLe: 64, vsCountry: -41, vsWorld: -33 }, highlights: [] }));
  assert.ok(!/自殺|自盡|輕生|上吊|繩|藥|跳|槍|割|燒炭|服用|過量|墜|毒|瓦斯|刀/.test(e.text + e.short), e.text);
  assert.ok(!/平均/.test(e.text));
  assert.ok(/記得|接住|想念/.test(e.text), e.text);
});

test('a life cut short by war or disaster: the person before the number', () => {
  const war = composeEulogy(make({ age: 44, deathYear: 2006, cause: { id: 'conflict', label: '武裝衝突', text: '' }, highlights: [] }));
  assert.equal(war.shape, 'calamity');
  assert.ok(/戰/.test(war.text) && !/災難/.test(war.text), war.text);
  assert.ok(/名字|叫陳美玲|是陳美玲/.test(war.text));
  const quake = composeEulogy(make({ age: 44, deathYear: 2006, cause: { id: 'disaster', label: '自然災害', text: '' }, highlights: [] }));
  assert.equal(quake.shape, 'calamity');
  assert.ok(/災/.test(quake.text) && !/戰爭|戰火/.test(quake.text.replace(/戰火終會熄滅/g, '')), quake.text);
});

test('a migrant with four countries; a refugee; a child marriage; a long life; a quiet life', () => {
  const m = composeEulogy(make({ name: '瑪麗亞', age: 71, countriesLived: ['菲律賓', '沙烏地阿拉伯', '阿拉伯聯合大公國', '加拿大'], countryName: '加拿大', homeCountry: { code: 'PHL', name: '菲律賓' }, birthCity: '宿霧', urbanBirth: true, lifespan: { age: 71, countryLe: 74.6, worldLe: 69.6, vsCountry: -3.6, vsWorld: 1.4 } }));
  assert.equal(m.shape, 'migrant');
  assert.ok(/四個國家/.test(m.text) && /加拿大/.test(m.text), m.text);
  const r = composeEulogy(make({ age: 66, countriesLived: ['台灣', '德國'], countryName: '德國', highlights: [{ age: 20, year: 1982, text: '為了躲避戰亂，離開家鄉，來到德國。' }] }));
  assert.ok(/戰亂|戰火/.test(r.text) && /德國/.test(r.text), r.text);
  const cm = composeEulogy(make({ age: 58, highlights: [{ age: 14, year: 1976, text: '很年輕就結婚。' }, { age: 16, year: 1978, text: '第一個孩子林雅婷出生。' }] }));
  assert.ok(/14歲/.test(cm.text), cm.text);
  const old = composeEulogy(make({ age: 97, deathYear: 2059, lifespan: { age: 97, countryLe: 80, worldLe: 64, vsCountry: 17, vsWorld: 33 }, cause: { id: 'other', label: '其他原因', text: '' } }));
  assert.equal(old.shape, 'long');
  assert.ok(/97歲/.test(old.text) && /多活|超過|多走/.test(old.text));
  const quiet = composeEulogy(make({ age: 66, deathYear: 2028, lifespan: { age: 66, countryLe: 68, worldLe: 64, vsCountry: -2, vsWorld: 2 } }));
  assert.equal(quiet.shape, 'quiet');
  assert.ok(/平凡|日子|實實在在|不必驚天動地|歷史課本/.test(quiet.text), quiet.text);
});

test('no partner, no children, no job: nothing about them; a long name stays whole; unusable data gives the brief version, never an error', () => {
  const e = composeEulogy(make({ partner: null, marriages: 0, children: { total: 0, alive: 0, names: [] }, jobs: [], lastJob: null, yearsWorked: 0, highlights: [], age: 60, deathYear: 2022 }));
  assert.ok(!PARTNER_WORDS.test(e.text.replace(/一生沒有結婚|沒有結婚|一生未婚/g, '')) && !/孩子|子女|拉拔|養育|育有/.test(e.text.replace(/沒有孩子|家庭的孩子/g, '')) && !/當過|做過/.test(e.text), e.text);
  const long = composeEulogy(make({ name: 'Muhammad Abdullahi Ibrahim Abubakar Al-Rashid bin Sultan Hassan' }));
  assert.ok(long.text.includes('Muhammad Abdullahi Ibrahim Abubakar Al-Rashid bin Sultan Hassan'));
  for (const bad of [null, undefined, {}, { name: 'x' }, { name: '甲', age: 5 }, { name: '乙', age: 'x', birthYear: 1990 }, make({ homeCountry: null, countryName: '' })]) {
    const b = composeEulogy(bad);
    assert.ok(typeof b.text === 'string' && b.text.length > 5 && typeof b.short === 'string', JSON.stringify(bad));
  }
  const brief = composeEulogy({ name: '甲', age: 40, birthYear: 1960 });
  assert.equal(brief.shape, 'brief');
  assert.ok(brief.text.includes('甲') && brief.text.includes('40歲'));
  // an old record without any eulogy field gets one; a stored one of another version is ignored
  assert.equal(eulogyOf({ summary: make() }).shape, 'quiet');
  assert.equal(eulogyOf({ summary: make({ eulogy: { v: 99, text: '舊版本，不應該被使用，因為版本不符。', short: 'x' } }) }).shape, 'quiet');
  assert.equal(eulogyOf({ summary: make({ eulogy: { v: EULOGY_VERSION, text: '這是存下來的生平，內容已經足夠長。', short: '短版。' } }) }).text, '這是存下來的生平，內容已經足夠長。');
});
